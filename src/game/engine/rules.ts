import type { GameState, PlayerId } from "./types";
import { getCard } from "./cards";

const HAND_LIMIT = 6;
const LOG_LIMIT = 100;

function opponentOf(p: PlayerId): PlayerId {
  return p === "P1" ? "AI" : "P1";
}

function pushLog(state: GameState, msg: string): GameState {
  return { ...state, log: [msg, ...state.log].slice(0, LOG_LIMIT) };
}

function getEffectiveSpeed(state: GameState, player: PlayerId, cardId: string): number {
  const c = getCard(cardId);
  if (!c) return Number.MAX_SAFE_INTEGER;

  const bonus = state[player].status.speedBonus ?? 0; // 이번 턴 보너스
  return Math.max(0, c.speed - bonus);
}

export function queueCard(
  state: GameState,
  player: PlayerId,
  cardId: string,
  handIndex: number
): GameState {
  if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;

  const me = state[player];
  const card = getCard(cardId);
  if (!card) return state;
  if (me.ready) return state;

  // handIndex 검증(중복 카드 안정성)
  if (handIndex < 0 || handIndex >= me.hand.length) return state;
  if (me.hand[handIndex] !== cardId) return state;

  // 덱 코스트 부족이면 사용 불가
  if (me.deck.length < card.cost) return state;

  // 1) 손패에서 선택 카드 제거
  const nextHand = [...me.hand];
  nextHand.splice(handIndex, 1);

  // 2) 덱에서 cost만큼 discard로 이동
  const costCards = me.deck.slice(0, card.cost);
  const remainingDeck = me.deck.slice(card.cost);

  const nextMe = {
    ...me,
    hand: nextHand,
    deck: remainingDeck,
    discard: [...me.discard, ...costCards, cardId],
    // 턴당 1장이라도 확장 대비로 배열 유지
    queue: [...me.queue, cardId],
  };

  return pushLog(
    { ...state, [player]: nextMe } as GameState,
    `${player} queued ${card.name} (cost: ${card.cost} cards)`
  );
}

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
          status: { ...next[player].status, attackBuff: 0 },
        },
      } as GameState;

      return next;
    }

    case "block":
      return {
        ...state,
        [target]: {
          ...state[target],
          block: state[target].block + card.value,
        },
      };

    case "draw":
      return draw(state, target, card.value);

    case "heal":
      return {
        ...state,
        [target]: {
          ...state[target],
          hp: state[target].hp + card.value,
        },
      };

    case "buff_attack":
      return {
        ...state,
        [target]: {
          ...state[target],
          status: {
            ...state[target].status,
            attackBuff:
              (state[target].status.attackBuff ?? 0) + card.value,
          },
        },
      };

    case "burn":
      return {
        ...state,
        [target]: {
          ...state[target],
          status: {
            ...state[target].status,
            burn: { turns: 2, dmgPerTurn: card.value },
          },
        },
      };

    default:
      return state;
  }
}

export function resolveAll(state: GameState): GameState {
  if (state.phase !== "RESOLVE") return state;

  let s = state;

  const p1Card = s.P1.queue[0] ?? null;
  const aiCard = s.AI.queue[0] ?? null;

  const endTurn = (st: GameState): GameState => ({
    ...st,
    P1: { ...st.P1, queue: [], ready: false },
    AI: { ...st.AI, queue: [], ready: false },
    phase: "TURN_END",
  });

  // 둘 다 패스면 턴 종료
  if (!p1Card && !aiCard) {
    return endTurn(s);
  }

  // 처리 순서 결정: speed 낮을수록 먼저, 같으면 initiative 먼저
  type Item = { player: PlayerId; cardId: string };
  const items: Item[] = [];
  if (p1Card) items.push({ player: "P1", cardId: p1Card });
  if (aiCard) items.push({ player: "AI", cardId: aiCard });

  items.sort((a, b) => {
    const sa = getEffectiveSpeed(s, a.player, a.cardId);
    const sb = getEffectiveSpeed(s, b.player, b.cardId);
    if (sa !== sb) return sa - sb;

    // ✅ speed 동일이면 주도권 먼저
    if (a.player === s.initiative) return -1;
    if (b.player === s.initiative) return 1;
    return 0;
  });

  // “아직 처리 안 된 카드” 추적
  const unresolved = new Set<PlayerId>();
  if (p1Card) unresolved.add("P1");
  if (aiCard) unresolved.add("AI");

  for (const it of items) {
    // 앞선 처리에서 취소되었으면 스킵
    if (!unresolved.has(it.player)) continue;

    const other: PlayerId = it.player === "P1" ? "AI" : "P1";
    const beforeOtherHp = s[other].hp;

    // 카드 효과 처리
    s = applyCardEffect(s, it.player, it.cardId);
    if (s.phase === "GAME_OVER") return s;

    // 이 카드 처리 완료
    unresolved.delete(it.player);

    const afterOtherHp = s[other].hp;

    // ✅ 직접 공격 + 실제 HP 감소만 인정(블록으로 0 피해면 false)
    const card = getCard(it.cardId);
    const didDirectAttackDamage =
      card?.effect === "damage" && afterOtherHp < beforeOtherHp;

    // ✅ 1) 같은 기준으로 initiative 즉시 획득
    if (didDirectAttackDamage && s.initiative !== it.player) {
      s = pushLog(s, `${it.player} takes initiative`);
      s = { ...s, initiative: it.player };
    }

    // ✅ 1.5) 이득 적용: 적중했고 gain > 0 이면, 다음 턴 speedBonusNext에 누적
    if (didDirectAttackDamage && (card?.gain ?? 0) > 0) {
      const gain = card!.gain;
      s = {
        ...s,
        [it.player]: {
          ...s[it.player],
          status: {
            ...s[it.player].status,
            speedBonusNext: (s[it.player].status.speedBonusNext ?? 0) + gain,
          },
        },
      } as GameState;

      s = pushLog(s, `${it.player} gains SPEED -${gain} next turn`);
    }

    // ✅ 2) 같은 기준으로 상대 예약 취소
    const otherHasUnresolved = unresolved.has(other);
    if (otherHasUnresolved && didDirectAttackDamage) {
      const cancelledCard = other === "P1" ? p1Card : aiCard;
      s = pushLog(
        s,
        `${other} was hit before resolving → cancel queued card (${cancelledCard ?? "?"})`
      );
      return endTurn(s);
    }
  }

  // 정상 처리 후 턴 종료 정리
  return endTurn(s);
}

function endTurn(s: GameState): GameState {
  return {
    ...s,
    P1: { ...s.P1, queue: [], ready: false },
    AI: { ...s.AI, queue: [], ready: false },
    phase: "TURN_END",
  };
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

export function resolveWinner(state: GameState): GameState {
  const p = state.P1.hp;
  const a = state.AI.hp;
  const winner = p === a ? "DRAW" : p > a ? "P1" : "AI";
  return { ...state, phase: "GAME_OVER", winner };
}

function dealDamage(state: GameState, target: PlayerId, amount: number, label?: string): GameState {
  const t = state[target];

  const blocked = Math.min(t.block, amount);
  const dmg = amount - blocked;

  const nextTarget = {
    ...t,
    block: t.block - blocked,
    hp: t.hp - dmg,
  };

  const next = { ...state, [target]: nextTarget } as GameState;
  return pushLog(next, `${label ?? "Damage"} → ${target} takes ${dmg} (${blocked} blocked)`);
}

/**
 * 드로우:
 * - 손패 제한 넘으면 중단(패배 아님)
 * - 덱이 0이면 즉시 패배(discard 무관)
 */
export function draw(state: GameState, player: PlayerId, n: number): GameState {
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

/**
 * 턴 시작:
 * - phase SETUP
 * - block/ready/queue 초기화
 * - 1턴: 3장, 이후: 1장 드로우
 */
export function beginTurn(state: GameState): GameState {
  if (state.phase === "GAME_OVER") return state;

  const nextTurn = state.turn + 1;

  let s: GameState = {
    ...state,
    turn: nextTurn,
    phase: "SETUP_INIT",
    P1: {
      ...state.P1,
      queue: [],
      ready: false,
      block: 0,
      status: {
        ...state.P1.status,
        speedBonus: state.P1.status.speedBonusNext ?? 0,
        speedBonusNext: 0,
      },
    },
    AI: {
      ...state.AI,
      queue: [],
      ready: false,
      block: 0,
      status: {
        ...state.AI.status,
        speedBonus: state.AI.status.speedBonusNext ?? 0,
        speedBonusNext: 0,
      },
    },  
  };

  const drawCount = nextTurn === 1 ? 3 : 1;

  s = draw(s, "P1", drawCount);
  if (s.phase === "GAME_OVER") return s;

  s = draw(s, "AI", drawCount);
  if (s.phase === "GAME_OVER") return s;

  return pushLog(s, `Turn ${nextTurn} begins`);
}