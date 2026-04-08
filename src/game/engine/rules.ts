import type { CardZone, CharacterId, DeckInsertPosition, GameState, PendingSelection, PlayerId } from "./types";
import { getCard } from "./cards";
import { CHARACTERS } from "./characters";
import { shuffle } from "./rng";

const HAND_LIMIT = 6;
const LOG_LIMIT = 40;

/* -------------------------- */
/* 존 헬퍼 */
/* -------------------------- */

function getZone(combatant: Combatant, zone: CardZone): string[] {
  switch (zone) {
    case "deck":     return combatant.deck;
    case "hand":     return combatant.hand;
    case "trash":    return combatant.trash;
    case "cooldown": return combatant.cooldown;
  }
}

function setZone(combatant: Combatant, zone: CardZone, cards: string[]): Combatant {
  switch (zone) {
    case "deck":     return { ...combatant, deck: cards };
    case "hand":     return { ...combatant, hand: cards };
    case "trash":    return { ...combatant, trash: cards };
    case "cooldown": return { ...combatant, cooldown: cards };
  }
}

/* -------------------------- */
/* 공통 유틸 */
/* -------------------------- */

function opponentOf(p: PlayerId): PlayerId {
  return p === "P1" ? "AI" : "P1";
}

function pushLog(state: GameState, msg: string): GameState {
  return {
    ...state,
    log: [msg, ...state.log].slice(0, LOG_LIMIT),
  };
}

function syncExhausted(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  const exhausted = me.deck.length === 0;

  if (me.status.exhausted === exhausted) {
    return state;
  }

  let s = {
    ...state,
    [player]: {
      ...me,
      status: {
        ...me.status,
        exhausted,
      },
    },
  } as GameState;

  s = pushLog(
    s,
    exhausted ? `${player} is exhausted` : `${player} recovered from exhaustion`
  );

  return s;
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

function moveQueuedCardToCooldown(
  state: GameState,
  player: PlayerId,
  cardId: string
): GameState {
  const me = state[player];
  const nextQueue = [...me.queue];

  const idx = nextQueue.indexOf(cardId);
  if (idx >= 0) {
    nextQueue.splice(idx, 1);
  }

  return {
    ...state,
    [player]: {
      ...me,
      queue: nextQueue,
      cooldown: [...me.cooldown, cardId],
    },
  } as GameState;
}

function moveQueuedCardToTrash(
  state: GameState,
  player: PlayerId,
  cardId: string
): GameState {
  const me = state[player];
  const nextQueue = [...me.queue];

  const idx = nextQueue.indexOf(cardId);
  if (idx >= 0) {
    nextQueue.splice(idx, 1);
  }

  return {
    ...state,
    [player]: {
      ...me,
      queue: nextQueue,
      trash: [...me.trash, cardId],
    },
  } as GameState;
}

//라운드 종료 처리
function handleRoundEnd(state: GameState): GameState {
  let s = state;

  s = pushLog(s, `Round ${s.round} ends`);

  s = moveHandToTrash(s, "P1");
  s = moveHandToTrash(s, "AI");

  if (s.round >= 3) {
    return decideWinnerByHp(s);
  }

  return prepareNextRound(s);
}

/* -------------------------- */
/* 태그 (캐릭터 교체) */
/* -------------------------- */

/**
 * 태그 처리 순서:
 * 1. 현재 캐릭터 탈출 효과
 * 2. 캐릭터 교체
 * 3. 새 캐릭터 진입 효과
 */
function applyTagSwitch(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  const currentChar = me.activeCharacter;
  const newChar: CharacterId = currentChar === "A" ? "B" : "A";

  const currentDef = CHARACTERS[currentChar];
  const newDef = CHARACTERS[newChar];

  // hp를 characterHp에 반영 (동기화)
  let s: GameState = {
    ...state,
    [player]: {
      ...me,
      characterHp: { ...me.characterHp, [currentChar]: me.hp },
    },
  } as GameState;

  // 1. 탈출 효과
  if (currentDef.exitEffect) {
    s = applySingleEffect(s, player, currentDef.exitEffect);
    if (s.phase === "GAME_OVER") return s;
    // 탈출 효과 후 hp를 다시 characterHp에 반영
    s = {
      ...s,
      [player]: {
        ...s[player],
        characterHp: { ...s[player].characterHp, [currentChar]: s[player].hp },
      },
    } as GameState;
  }

  // 2. 캐릭터 교체 — 새 캐릭터의 hp로 전환
  const newHp = s[player].characterHp[newChar];
  s = {
    ...s,
    [player]: {
      ...s[player],
      activeCharacter: newChar,
      hp: newHp,
    },
  } as GameState;

  s = pushLog(s, `${player} tags out Char ${currentChar} → tags in Char ${newChar} (HP: ${newHp})`);

  // 3. 진입 효과
  if (newDef.entryEffect) {
    s = applySingleEffect(s, player, newDef.entryEffect);
    if (s.phase === "GAME_OVER") return s;
  }

  return s;
}

//카드 효과 단일 적용
function applySingleEffect(
  state: GameState,
  player: PlayerId,
  effect: import("./types").CardEffect
): GameState {
  const target =
    effect.target === "self"
      ? player
      : effect.target === "enemy"
      ? opponentOf(player)
      : player;

  switch (effect.type) {
    case "damage": {
      const dt = (effect as import("./types").CardEffect).damageType;
      const targetStack = state[target].airborneStack;

      // ground: 상대가 체공 상태면 무효
      if (dt === "ground" && targetStack >= 1) {
        return pushLog(state, `Damage (ground) blocked — ${target} is airborne`);
      }
      // anti-air: 상대가 지상 상태면 무효
      if (dt === "anti-air" && targetStack === 0) {
        return pushLog(state, `Damage (anti-air) missed — ${target} is grounded`);
      }

      const amount = effect.value ?? 0;
      const bonus = state[player].status.attackBuff ?? 0;
      const total = amount + bonus;

      let next = dealDamage(state, target, total, dt ? `Damage(${dt})` : "Damage");

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
      const amount = effect.value ?? 0;

      return pushLog(
        {
          ...state,
          [target]: {
            ...state[target],
            block: state[target].block + amount,
          },
        } as GameState,
        `${target} gains ${amount} Block`
      );
    }

    case "draw": {
      return draw(state, target, effect.value ?? 0);
    }

    case "heal": {
      const amount = effect.value ?? 0;
      const t = state[target];
      const newHp = t.hp + amount;

      return pushLog(
        {
          ...state,
          [target]: {
            ...t,
            hp: newHp,
            characterHp: { ...t.characterHp, [t.activeCharacter]: newHp },
          },
        } as GameState,
        `${target} (Char ${t.activeCharacter}) heals ${amount}`
      );
    }

    case "buff_attack": {
      const amount = effect.value ?? 0;

      return pushLog(
        {
          ...state,
          [target]: {
            ...state[target],
            status: {
              ...state[target].status,
              attackBuff: (state[target].status.attackBuff ?? 0) + amount,
            },
          },
        } as GameState,
        `${target} gains ATK +${amount}`
      );
    }

    case "burn": {
      const amount = effect.value ?? 0;

      return pushLog(
        {
          ...state,
          [target]: {
            ...state[target],
            status: {
              ...state[target].status,
              burn: {
                turns: 2,
                dmgPerTurn: amount,
              },
            },
          },
        } as GameState,
        `${target} is Burned (${amount}/turn)`
      );
    }

    case "tag": {
      return applyTagSwitch(state, player);
    }

    case "airborne": {
      const stack = effect.value ?? 0;
      return pushLog(
        {
          ...state,
          [target]: {
            ...state[target],
            airborneStack: stack,
          },
        } as GameState,
        `${target} airborneStack set to ${stack}`
      );
    }

    case "draw_tagged": {
      const tag = effect.tag;
      const count = effect.value ?? 1;
      const zone = effect.zone ?? "deck";

      if (!tag) return state;

      const me = state[target];
      const pool = zone === "cooldown" ? me.cooldown : me.deck;

      // 태그를 가진 카드 인덱스 목록
      const matchedIndices: number[] = [];
      for (let i = 0; i < pool.length; i++) {
        const c = getCard(pool[i]);
        if (c?.tags?.includes(tag)) matchedIndices.push(i);
      }

      if (matchedIndices.length === 0) {
        return pushLog(state, `draw_tagged(${tag}): no matching cards in ${zone}`);
      }

      // 앞에서부터 count장 드로우
      const toDraw = matchedIndices.slice(0, count);
      const newPool = pool.filter((_, i) => !toDraw.includes(i));
      const drawnIds = toDraw.map((i) => pool[i]);

      const newHand = [...me.hand, ...drawnIds].slice(0, 10);

      const nextState: GameState = {
        ...state,
        [target]: {
          ...me,
          ...(zone === "cooldown" ? { cooldown: newPool } : { deck: newPool }),
          hand: newHand,
        },
      };

      return pushLog(
        nextState,
        `${target} draws ${drawnIds.length} tagged card(s) [${tag}] from ${zone}`
      );
    }

    default:
      return state;
  }
}

function applyCardEffects(
  state: GameState,
  player: PlayerId,
  cardId: string
): GameState {
  const card = getCard(cardId);
  if (!card) return state;

  let s = state;

  for (const effect of card.effects) {
    s = applySingleEffect(s, player, effect);
    s = checkGameOver(s);
    if (s.phase === "GAME_OVER") return s;
  }

  return s;
}

/**
 * 카드 효과를 순서대로 적용하되, move_cards+userSelects 효과를 만나면
 * WAITING_SELECTION 페이즈로 전환하고 resolve 컨텍스트를 저장한다.
 * AI가 사용하는 경우에는 자동으로 첫 번째 후보를 선택한다.
 */
function applyCardEffectsWithPause(
  state: GameState,
  player: PlayerId,
  cardId: string,
  resolveItems: { player: PlayerId; cardId: string }[],
  resolveNextIndex: number,
  currentUnresolved: PlayerId[]
): GameState {
  const card = getCard(cardId);
  if (!card) return state;

  let s = state;

  for (const effect of card.effects) {
    if (effect.type === "move_cards") {
      const fromPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const toPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const fromZone: CardZone = effect.fromZone ?? "trash";
      const toZone: CardZone = effect.toZone ?? "hand";
      const toPosition: DeckInsertPosition = effect.toPosition ?? "bottom";
      const count = effect.count ?? 1;

      const candidates = filterCards(s[fromPlayerId][fromZone] as string[]);

      if (effect.userSelects && player === "P1") {
        // P1은 직접 선택 — resolution 일시정지
        const pendingSelection: PendingSelection = {
          selectingPlayer: "P1",
          candidates: [...candidates],
          count,
          fromZone,
          fromPlayerId,
          toZone,
          toPlayerId,
          toPosition,
          sourcePlayer: player,
          sourceCardId: cardId,
          resolveItems,
          resolveNextIndex,
          unresolvedPlayers: currentUnresolved.filter((p) => p !== player),
        };

        return {
          ...s,
          phase: "WAITING_SELECTION",
          pendingSelection,
        } as GameState;
      }

      // AI 또는 userSelects=false: 자동으로 앞에서 count장 선택
      const autoSelected = candidates.slice(0, count);
      if (autoSelected.length > 0) {
        s = moveCardsBetweenZones(s, fromPlayerId, fromZone, toPlayerId, toZone, autoSelected, toPosition);
        s = pushLog(s, `${player} moves ${autoSelected.length} card(s) from ${fromZone} to ${toZone}`);
      }
      continue;
    }

    s = applySingleEffect(s, player, effect);
    s = checkGameOver(s);
    if (s.phase === "GAME_OVER") return s;
  }

  return s;
}

/* -------------------------- */
/* 라운드 시작 처리 */
/* -------------------------- */
function prepareNextRound(state: GameState): GameState {
  let s = state;

  s = pushLog(s, `Round ${state.round + 1} begins`);

  // 1) trash -> deck, shuffle
  s = recycleTrashIntoDeck(s, "P1");
  s = recycleTrashIntoDeck(s, "AI");

  // 2) cooldown -> trash
  s = moveCooldownToTrash(s, "P1");
  s = moveCooldownToTrash(s, "AI");

  // 다음 라운드 시작 상태로 리셋
  const nextState: GameState = {
    ...s,
    round: state.round + 1,
    turn: 0,
    phase: "TURN_START",
    selected: null,
    P1: {
      ...s.P1,
      queue: [],
      ready: false,
      block: 0,
    },
    AI: {
      ...s.AI,
      queue: [],
      ready: false,
      block: 0,
    },
    // initiative는 건드리지 않음
    // = 이전 라운드 마지막 상태 유지
  };

  s = syncExhausted(nextState, "P1");
  s = syncExhausted(s, "AI");

  // 1라운드 시작처럼 각자 시작 핸드 3장
  s = draw(s, "P1", 3);
  s = draw(s, "AI", 3);

  return s;
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
    recentlyCancelledId: null,
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
  // 체공 스택 1 감소 (최소 0)
  s = {
    ...s,
    P1: {
      ...s.P1,
      status: {
        ...s.P1.status,
        speedBonus: s.P1.status.speedBonusNext ?? 0,
        speedBonusNext: 0,
      },
      airborneStack: Math.max(0, s.P1.airborneStack - 1),
    },
    AI: {
      ...s.AI,
      status: {
        ...s.AI.status,
        speedBonus: s.AI.status.speedBonusNext ?? 0,
        speedBonusNext: 0,
      },
      airborneStack: Math.max(0, s.AI.airborneStack - 1),
    },
  };

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

  if (s.phase === "GAME_OVER") return s;

  s = logTurnStart(s);
  return s;
}

/* -------------------------- */
/* 카드 사용 조건 체크 */
/* -------------------------- */

export function canUseCard(state: GameState, player: PlayerId, cardId: string): boolean {
  const card = getCard(cardId);
  if (!card) return false;
  if (!card.useCondition) return true;

  const stack = state[player].airborneStack;
  if (card.useCondition === "ground") return stack === 0;
  if (card.useCondition === "airborne") return stack >= 1;
  return true;
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

  if (handIndex < 0 || handIndex >= me.hand.length) return state;
  if (me.hand[handIndex] !== cardId) return state;

  if (me.deck.length < card.cost) return state;
  if (!canUseCard(state, player, cardId)) return state;

  const nextHand = [...me.hand];
  nextHand.splice(handIndex, 1);

  const costCards = me.deck.slice(0, card.cost);
  const remainingDeck = me.deck.slice(card.cost);

  let s = {
    ...state,
    [player]: {
      ...me,
      hand: nextHand,
      deck: remainingDeck,
      trash: [...me.trash, ...costCards],
      queue: [...me.queue, cardId],
    },
  } as GameState;

  s = pushLog(s, `${player} queued ${card.name} (cost: ${card.cost} cards)`);
  s = syncExhausted(s, player);

  return s;
}

/* -------------------------- */
/* 존 간 카드 이동 */
/* -------------------------- */

/** 조건에 맞는 카드만 필터 (현재는 전체 반환, 추후 확장) */
export function filterCards(cards: string[]): string[] {
  return cards;
}

function moveCardsBetweenZones(
  state: GameState,
  fromPlayer: PlayerId,
  fromZone: CardZone,
  toPlayer: PlayerId,
  toZone: CardZone,
  cardIds: string[],
  toPosition: DeckInsertPosition = "bottom"
): GameState {
  if (cardIds.length === 0) return state;

  // Remove from source zone
  const sourceArr = state[fromPlayer][fromZone] as string[];
  const cardIdSet = new Set(cardIds);
  // Remove only first occurrence of each id (handles duplicates in deck)
  const remaining = [...sourceArr];
  for (const id of cardIds) {
    const idx = remaining.indexOf(id);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  void cardIdSet; // suppress unused warning

  let s: GameState = {
    ...state,
    [fromPlayer]: {
      ...state[fromPlayer],
      [fromZone]: remaining,
    },
  } as GameState;

  // Add to target zone
  const targetArr = s[toPlayer][toZone] as string[];
  let newTargetArr: string[];

  if (toZone === "deck" && toPosition === "top") {
    newTargetArr = [...cardIds, ...targetArr];
  } else if (toZone === "deck" && toPosition === "random") {
    newTargetArr = [...targetArr];
    for (const id of cardIds) {
      const pos = Math.floor(Math.random() * (newTargetArr.length + 1));
      newTargetArr.splice(pos, 0, id);
    }
  } else {
    newTargetArr = [...targetArr, ...cardIds];
  }

  s = {
    ...s,
    [toPlayer]: {
      ...s[toPlayer],
      [toZone]: newTargetArr,
    },
  } as GameState;

  // Sync exhausted if deck was affected
  if (fromZone === "deck") s = syncExhausted(s, fromPlayer);
  if (toZone === "deck") s = syncExhausted(s, toPlayer);

  return s;
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

  const hasDamageEffect = card.effects.some((effect) => effect.type === "damage");
  if (!hasDamageEffect) return false;

  const other = opponentOf(player);
  return stateAfter[other].hp < stateBefore[other].hp;
}
function applyInitiativeOnHit(state: GameState, player: PlayerId): GameState {
  if (state.initiative === player) return state;

  let s = {
    ...state,
    initiative: player,
  };

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
  if (!cancelledCard) return state;

  let s = moveQueuedCardToTrash(state, other, cancelledCard);
  s = {
    ...s,
    recentlyCancelledId: cancelledCard,
    [other]: {
      ...s[other],
      ready: false,
    },
  } as GameState;

  s = pushLog(
    s,
    `${other} was hit before resolving → cancel queued card (${cancelledCard}) to trash`
  );

  unresolved.delete(other);
  return s;
}

/* -------------------------- */
/* resolve 메인 */
/* -------------------------- */



function endTurnCleanup(state: GameState): GameState {
  const s: GameState = {
    ...state,
    P1: { ...state.P1, queue: [], ready: false },
    AI: { ...state.AI, queue: [], ready: false },
    phase: "TURN_END",
  };

  if (areBothPlayersExhausted(s)) {
    return handleRoundEnd(s);
  }

  return s;
}

function resolveItems(
  state: GameState,
  items: { player: PlayerId; cardId: string }[],
  startIndex: number,
  unresolved: Set<PlayerId>
): GameState {
  let s = state;

  for (let i = startIndex; i < items.length; i++) {
    const it = items[i];
    if (!unresolved.has(it.player)) continue;

    const before = s;
    s = applyCardEffectsWithPause(s, it.player, it.cardId, items, i + 1, [...unresolved]);

    if (s.phase === "WAITING_SELECTION") return s; // P1 선택 대기 중
    if (s.phase === "GAME_OVER") return s;

    s = moveQueuedCardToCooldown(s, it.player, it.cardId);
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

export function resolveAll(state: GameState): GameState {
  if (state.phase !== "RESOLVE") return state;

  const items = buildResolveOrder(state);
  const unresolved = new Set<PlayerId>();
  if (state.P1.queue[0]) unresolved.add("P1");
  if (state.AI.queue[0]) unresolved.add("AI");

  return resolveItems(state, items, 0, unresolved);
}

/**
 * SELECTION/CONFIRM 또는 SELECTION/SKIP 후 resolve를 재개한다.
 * selectedCards가 빈 배열이면 카드 이동 없이 재개 (skip).
 */
export function resumeResolve(state: GameState, selectedCards: string[]): GameState {
  if (!state.pendingSelection) return state;
  const ps = state.pendingSelection;

  let s: GameState = {
    ...state,
    phase: "RESOLVE",
    pendingSelection: null,
  };

  // 선택된 카드 이동
  if (selectedCards.length > 0) {
    s = moveCardsBetweenZones(s, ps.fromPlayerId, ps.fromZone, ps.toPlayerId, ps.toZone, selectedCards, ps.toPosition);
    s = pushLog(s, `${ps.sourcePlayer} returns ${selectedCards.length} card(s) from ${ps.fromZone} to ${ps.toZone}`);
  }

  // 원인 카드를 쿨다운으로 이동
  s = moveQueuedCardToCooldown(s, ps.sourcePlayer, ps.sourceCardId);

  // 나머지 아이템 이어서 처리
  const unresolved = new Set<PlayerId>(ps.unresolvedPlayers);
  return resolveItems(s, ps.resolveItems, ps.resolveNextIndex, unresolved);
}

/* -------------------------- */
/* 카드 효과 */
/* -------------------------- */

export function applyCardEffect(
  state: GameState,
  player: PlayerId,
  cardId: string
): GameState {
  return applyCardEffects(state, player, cardId);
}

// 두 플레이어 탈진 체크
function areBothPlayersExhausted(state: GameState): boolean {
  return state.P1.status.exhausted && state.AI.status.exhausted;
}

// 덱에 카드가 추가될 때 탈진 풀림
function addCardsToDeck(
  state: GameState,
  player: PlayerId,
  cardIds: string[],
  position: "top" | "bottom" = "bottom"
): GameState {
  if (cardIds.length === 0) return state;

  const me = state[player];

  let nextDeck: string[];
  if (position === "top") {
    nextDeck = [...cardIds, ...me.deck];
  } else {
    nextDeck = [...me.deck, ...cardIds];
  }

  let s = {
    ...state,
    [player]: {
      ...me,
      deck: nextDeck,
    },
  } as GameState;

  s = syncExhausted(s, player);
  return s;
}

//핸드를 전부 트래시로 이동
function moveHandToTrash(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.hand.length === 0) return state;

  return {
    ...state,
    [player]: {
      ...me,
      hand: [],
      trash: [...me.trash, ...me.hand],
    },
  } as GameState;
}

//트래시 재활용
function recycleTrashIntoDeck(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.trash.length === 0) {
    return syncExhausted(state, player);
  }

  const mergedDeck = shuffle([...me.deck, ...me.trash]);

  let s = {
    ...state,
    [player]: {
      ...me,
      deck: mergedDeck,
      trash: [],
    },
  } as GameState;

  s = syncExhausted(s, player);
  return s;
}

//쿨다운 재활용
function moveCooldownToTrash(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.cooldown.length === 0) return state;

  return {
    ...state,
    [player]: {
      ...me,
      cooldown: [],
      trash: [...me.trash, ...me.cooldown],
    },
  } as GameState;
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
  const newHp = t.hp - dmg;

  const nextTarget = {
    ...t,
    block: t.block - blocked,
    hp: newHp,
    characterHp: { ...t.characterHp, [t.activeCharacter]: newHp },
  };

  const next = {
    ...state,
    [target]: nextTarget,
  } as GameState;

  return pushLog(
    next,
    `${label ?? "Damage"} → ${target} (Char ${t.activeCharacter}) takes ${dmg} (${blocked} blocked)`
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
      s = syncExhausted(s, player);
      break;
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

    s = syncExhausted(s, player);
  }

  return s;
}

//게임오버 체크 (어느 캐릭터든 HP ≤ 0이면 즉시 패배)
export function checkGameOver(state: GameState): GameState {
  const p1Dead =
    state.P1.characterHp.A <= 0 || state.P1.characterHp.B <= 0;
  const aiDead =
    state.AI.characterHp.A <= 0 || state.AI.characterHp.B <= 0;

  if (p1Dead && aiDead) {
    return { ...state, phase: "GAME_OVER", winner: "DRAW" };
  }
  if (p1Dead) {
    return { ...state, phase: "GAME_OVER", winner: "AI" };
  }
  if (aiDead) {
    return { ...state, phase: "GAME_OVER", winner: "P1" };
  }

  return state;
}

//3라운드 종료 후 승패판정 (양측 캐릭터 HP 합산 비교)
function decideWinnerByHp(state: GameState): GameState {
  const p1Total = state.P1.characterHp.A + state.P1.characterHp.B;
  const aiTotal = state.AI.characterHp.A + state.AI.characterHp.B;

  if (p1Total > aiTotal) {
    return { ...state, phase: "GAME_OVER", winner: "P1" };
  }
  if (aiTotal > p1Total) {
    return { ...state, phase: "GAME_OVER", winner: "AI" };
  }
  return { ...state, phase: "GAME_OVER", winner: "DRAW" };
}