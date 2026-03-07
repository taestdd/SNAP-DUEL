import type { GameState, PlayerId } from "./types";
import { getCard } from "./cards";

const HAND_LIMIT = 6;
const LOG_LIMIT = 40;

/* -------------------------- */
/* 공통 유틸 */
/* -------------------------- */

function opponentOf(p: PlayerId): PlayerId {
  return p === "P1" ? "AI" : "P1";
}

function pushLog(state: GameState, msg: string): GameState {
  return { ...state, log: [msg, ...state.log].slice(0, LOG_LIMIT) };
}

function getEffectiveSpeed(
  state: GameState,
  player: PlayerId,
  cardId: string
): number {
  const c = getCard(cardId);
  if (!c) return Number.MAX_SAFE_INTEGER;

  const bonus = state[player].status.speedBonus ?? 0;
  return Math.max(0, c.speed - bonus);
}

/* -------------------------- */
/* 턴 시작 처리 */
/* -------------------------- */

function advanceTurnNumber(state: GameState): GameState {
  return {
    ...state,
    turn: state.turn + 1,
  };
}

function resetTurnFlags(state: GameState): GameState {
  return {
    ...state,
    phase: "SETUP_INIT",
    selected: null,

    P1: {
      ...state.P1,
      block: 0,
      queue: [],
      ready: false,
    },

    AI: {
      ...state.AI,
      block: 0,
      queue: [],
      ready: false,
    },
  };
}

function applyTurnStartStatuses(state: GameState): GameState {
  let s = state;

  // 다음 턴 speed bonus를 이번 턴 bonus로 이동
  s = {
    ...s,
    P1: {
      ...s.P1,
      status: {
        ...s.P1.status,
        speedBonus: s.P1.status.speedBonusNext ?? 0,
        speedBonusNext: 0,
      },
    },
    AI: {
      ...s.AI,
      status: {
        ...s.AI.status,
        speedBonus: s.AI.status.speedBonusNext ?? 0,
        speedBonusNext: 0,
      },
    },
  };

  // burn 같은 턴 시작 효과는 나중에 여기 추가
  return s;
}

function drawTurnCards(state: GameState): GameState {
  let s = state;

  const drawCount = s.turn === 1 ? 3 : 1;

  s = draw(s, "P1", drawCount);
  if (s.phase === "GAME_OVER") return s;

  s = draw(s, "AI", drawCount);
  if (s.phase === "GAME_OVER") return s;

  return s;
}

function logTurnStart(state: GameState): GameState {
  return pushLog(
    state,
    `Turn ${state.turn} begins (initiative: ${state.initiative})`
  );
}

export function beginTurn(state: GameState): GameState {
  if (state.phase === "GAME_OVER") return state;

  let s = state;
  s = advanceTurnNumber(s);
  s = resetTurnFlags(s);
  s = applyTurnStartStatuses(s);
  s = drawTurnCards(s);
  if (s.phase === "GAME_OVER") return s;
  s = logTurnStart(s);

  return s;
}

/* -------------------------- */
/* 카드 예약 */
/* -------------------------- */

export function queueCard(
  state: GameState,
  player: PlayerId,
  cardId: string,
  handIndex: number
): GameState {
  if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") {
    return state;
  }

  const me = state[player];
  const card = getCard(cardId);

  if (!card) return state;
  if (me.ready) return state;

  // handIndex 검증
  if (handIndex < 0 || handIndex >= me.hand.length) return state;
  if (me.hand[handIndex] !== cardId) return state;

  // 덱 코스트 검사
  if (me.deck.length < card.cost) return state;

  // 손패에서 제거
  const nextHand = [...me.hand];
  nextHand.splice(handIndex, 1);

  // 덱에서 cost만큼 discard로 이동
  const costCards = me.deck.slice(0, card.cost);
  const remainingDeck = me.deck.slice(card.cost);

  const nextMe = {
    ...me,
    hand: nextHand,
    deck: remainingDeck,
    discard: [...me.discard, ...costCards, cardId],
    queue: [...me.queue, cardId],
  };

  return pushLog(
    { ...state, [player]: nextMe } as GameState,
    `${player} queued ${card.name} (cost: ${card.cost} cards)`
  );
}

/* -------------------------- */
/* resolve 순서 생성 */
/* -------------------------- */

function buildResolveOrder(state: GameState): { player: PlayerId; cardId: string }[] {
  const items: { player: PlayerId; cardId: string }[] = [];

  const p1Card = state.P1.queue[0];
  const aiCard = state.AI.queue[0];

  if (p1Card) items.push({ player: "P1", cardId: p1Card });
  if (aiCard) items.push({ player: "AI", cardId: aiCard });

  items.sort((a, b) => {
    const sa = getEffectiveSpeed(state, a.player, a.cardId);
    const sb = getEffectiveSpeed(state, b.player, b.cardId);

    if (sa !== sb) return sa - sb;

    // speed 동일이면 initiative 먼저
    if (a.player === state.initiative) return -1;
    if (b.player === state.initiative) return 1;
    return 0;
  });

  return items;
}

/* -------------------------- */
/* 적중 / 주도권 / 이득 / 캔슬 */
/* -------------------------- */

function didDirectAttackHit(
  stateBefore: GameState,
  stateAfter: GameState,
  player: PlayerId,
  cardId: string
): boolean {
  const card = getCard(cardId);
  if (!card) return false;
  if (card.effect !== "damage") return false;

  const other = opponentOf(player);
  return stateAfter[other].hp < stateBefore[other].hp;
}

function applyInitiativeOnHit(state: GameState, player: PlayerId): GameState {
  if (state.initiative === player) return state;

  let s = { ...state, initiative: player };
  s = pushLog(s, `${player} takes initiative`);
  return s;
}

function applyGainOnHit(
  state: GameState,
  player: PlayerId,
  cardId: string
): GameState {
  const card = getCard(cardId);
  if (!card) return state;

  const gain = card.gain ?? 0;
  if (gain <= 0) return state;

  let s = {
    ...state,
    [player]: {
      ...state[player],
      status: {
        ...state[player].status,
        speedBonusNext: (state[player].status.speedBonusNext ?? 0) + gain,
      },
    },
  } as GameState;

  s = pushLog(s, `${player} gains SPEED -${gain} next turn`);
  return s;
}

function applyCancelOnHit(
  state: GameState,
  attacker: PlayerId,
  unresolved: Set<PlayerId>
): GameState {
  const other = opponentOf(attacker);

  if (!unresolved.has(other)) return state;

  const cancelledCard = state[other].queue[0];

  let s = pushLog(
    state,
    `${other} was hit before resolving → cancel queued card (${cancelledCard ?? "?"})`
  );

  s = {
    ...s,
    [other]: {
      ...s[other],
      queue: [],
      ready: false,
    },
  } as GameState;

  unresolved.delete(other);

  return s;
}

/* -------------------------- */
/* resolve 메인 */
/* -------------------------- */

function endTurnCleanup(state: GameState): GameState {
  return {
    ...state,
    P1: { ...state.P1, queue: [], ready: false },
    AI: { ...state.AI, queue: [], ready: false },
    phase: "TURN_END",
  };
}

export function resolveAll(state: GameState): GameState {
  if (state.phase !== "RESOLVE") return state;

  let s = state;
  const items = buildResolveOrder(s);

  const unresolved = new Set<PlayerId>();
  if (s.P1.queue[0]) unresolved.add("P1");
  if (s.AI.queue[0]) unresolved.add("AI");

  for (const it of items) {
    if (!unresolved.has(it.player)) continue;

    const before = s;

    s = applyCardEffect(s, it.player, it.cardId);
    if (s.phase === "GAME_OVER") return s;

    unresolved.delete(it.player);

    const hit = didDirectAttackHit(before, s, it.player, it.cardId);

    if (hit) {
      s = applyInitiativeOnHit(s, it.player);
      s = applyGainOnHit(s, it.player, it.cardId);
      s = applyCancelOnHit(s, it.player, unresolved);
    }
  }

  return endTurnCleanup(s);
}

/* -------------------------- */
/* 카드 효과 */
/* -------------------------- */

export function applyCardEffect(
  state: GameState,
  player: PlayerId,
  cardId: string
): GameState {
  const card = getCard(cardId);
  if (!card) return state;

  const target = card.target === "self" ? player : opponentOf(player);

  switch (card.effect) {
    case "damage": {
      const bonus = state[player].status.attackBuff ?? 0;
      const total = card.value + bonus;

      let next = dealDamage(state, target, total, card.name);

      // 공격 버프 1회 소모
      next = {
        ...next,
        [player]: {
          ...next[player],
          status: {
            ...next[player].status,
            attackBuff: 0,
          },
        },
      } as GameState;

      return next;
    }

    case "block": {
      const next = {
        ...state,
        [target]: {
          ...state[target],
          block: state[target].block + card.value,
        },
      } as GameState;

      return pushLog(next, `${target} gains ${card.value} Block`);
    }

    case "draw": {
      return draw(state, target, card.value);
    }

    case "heal": {
      const next = {
        ...state,
        [target]: {
          ...state[target],
          hp: state[target].hp + card.value,
        },
      } as GameState;

      return pushLog(next, `${target} heals ${card.value}`);
    }

    case "buff_attack": {
      const next = {
        ...state,
        [target]: {
          ...state[target],
          status: {
            ...state[target].status,
            attackBuff: (state[target].status.attackBuff ?? 0) + card.value,
          },
        },
      } as GameState;

      return pushLog(next, `${target} gains ATK +${card.value}`);
    }

    case "burn": {
      const next = {
        ...state,
        [target]: {
          ...state[target],
          status: {
            ...state[target].status,
            burn: { turns: 2, dmgPerTurn: card.value },
          },
        },
      } as GameState;

      return pushLog(next, `${target} is Burned (${card.value}/turn)`);
    }

    default:
      return state;
  }
}

/* -------------------------- */
/* 데미지 / 드로우 / 게임오버 */
/* -------------------------- */

function dealDamage(
  state: GameState,
  target: PlayerId,
  amount: number,
  label?: string
): GameState {
  const t = state[target];

  const blocked = Math.min(t.block, amount);
  const dmg = amount - blocked;

  const nextTarget = {
    ...t,
    block: t.block - blocked,
    hp: t.hp - dmg,
  };

  const next = { ...state, [target]: nextTarget } as GameState;
  return pushLog(
    next,
    `${label ?? "Damage"} → ${target} takes ${dmg} (${blocked} blocked)`
  );
}

export function draw(
  state: GameState,
  player: PlayerId,
  n: number
): GameState {
  let s = state;

  for (let i = 0; i < n; i++) {
    const me = s[player];

    if (me.hand.length >= HAND_LIMIT) break;

    if (me.deck.length === 0) {
      const winner = player === "P1" ? "AI" : "P1";

      return pushLog(
        { ...s, phase: "GAME_OVER", winner } as GameState,
        `${player} cannot draw (deck empty) → ${winner} wins`
      );
    }

    const top = me.deck[0];

    s = {
      ...s,
      [player]: {
        ...me,
        deck: me.deck.slice(1),
        hand: [...me.hand, top],
      },
    } as GameState;
  }

  return s;
}

export function checkGameOver(state: GameState): GameState {
  if (state.P1.hp <= 0 && state.AI.hp <= 0) {
    return { ...state, phase: "GAME_OVER", winner: "DRAW" };
  }

  if (state.P1.hp <= 0) {
    return { ...state, phase: "GAME_OVER", winner: "AI" };
  }

  if (state.AI.hp <= 0) {
    return { ...state, phase: "GAME_OVER", winner: "P1" };
  }

  return state;
}