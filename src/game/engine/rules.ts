import type { CardZone, CharacterId, DeckInsertPosition, GameState, PendingDiscard, PendingSelection, PlayerId } from "./types";
import { getCard } from "./cards";
import { CHARACTERS } from "./characters";
import {
  LOG_LIMIT,
  opponentOf,
  pushLog,
  syncExhausted,
  getEffectiveSpeed,
  moveQueuedCard,
  dealDamage,
  draw,
  checkGameOver,
  decideWinnerByHp,
  filterCards,
  moveCardsBetweenZones,
  areBothPlayersExhausted,
  moveHandToTrash,
  recycleTrashIntoDeck,
  moveCooldownToTrash,
  discardAIExcess,
} from "./stateHelpers";

export { LOG_LIMIT, draw, checkGameOver, filterCards };

const HAND_LIMIT = 6;

/* -------------------------- */
/* 태그 (캐릭터 교체) */
/* -------------------------- */

/**
 * 태그 처리 순서:
 * 1. 현재 캐릭터 탈출 효과
 * 2. 캐릭터 교체
 * 3. 새 캐릭터 진입 효과
 */
export function applyTagSwitch(state: GameState, player: PlayerId): GameState {
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

  // 2. 캐릭터 교체 — 새 캐릭터의 hp로 전환, airborne 초기화
  const newHp = s[player].characterHp[newChar];
  s = {
    ...s,
    [player]: {
      ...s[player],
      activeCharacter: newChar,
      hp: newHp,
      airborneStack: 0,
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
      const prevStack = state[target].airborneStack;
      return pushLog(
        {
          ...state,
          [target]: {
            ...state[target],
            airborneStack: stack,
          },
        } as GameState,
        `${target} airborne ${prevStack}→${stack}`
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

  let s = pushLog(state, `${player} resolves "${card.name}"`);

  for (const effect of card.effects) {
    if (effect.type === "move_cards") {
      const fromPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const toPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const fromZone: CardZone = effect.fromZone ?? "trash";
      const toZone: CardZone = effect.toZone ?? "hand";
      const toPosition: DeckInsertPosition = effect.toPosition ?? "bottom";
      const count = effect.count ?? 1;

      const candidates = filterCards(s[fromPlayerId][fromZone] as string[]);

      if (effect.userSelects) {
        // 카드 사용 플레이어가 직접 선택 — resolution 일시정지
        const pendingSelection: PendingSelection = {
          selectingPlayer: player,
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
    phase: "ROUND_DRAFT",
    selected: null,
    recentlyCancelledId: null,
    recentlyCancelledPlayer: null,
    draftSelections: { P1: null, AI: null },
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

  return s;
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
/* 드래프트 제출 */
/* -------------------------- */

export function submitDraft(state: GameState, player: PlayerId, cardIds: string[]): GameState {
  if (state.phase !== "ROUND_DRAFT") return state;
  if (state.draftSelections[player] !== null) return state;

  const me = state[player];

  // 선택한 카드를 덱에서 제거하고 hand로 이동
  const remaining = [...me.deck];
  const moved: string[] = [];
  for (const id of cardIds) {
    const idx = remaining.indexOf(id);
    if (idx >= 0) {
      remaining.splice(idx, 1);
      moved.push(id);
    }
  }

  let s: GameState = {
    ...state,
    [player]: {
      ...me,
      deck: remaining,
      hand: [...me.hand, ...moved],
    },
    draftSelections: {
      ...state.draftSelections,
      [player]: moved,
    },
  } as GameState;

  s = syncExhausted(s, player);
  s = pushLog(s, `${player} drafts ${moved.length} card(s)`);

  // 양쪽 모두 제출 완료 → TURN_START
  if (s.draftSelections.P1 !== null && s.draftSelections.AI !== null) {
    s = { ...s, phase: "TURN_START" };
  }

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
    recentlyCancelledPlayer: null,
    p1TaggedThisTurn: false,
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
  return pushLog(state, `━━ Turn ${state.turn} | Initiative: ${state.initiative} ━━`);
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

  // 캐릭터 친화 태그 체크: 카드의 모든 태그가 현재 캐릭터의 affinities에 포함되어야 함
  if (card.tags && card.tags.length > 0) {
    const charAffinities = CHARACTERS[state[player].activeCharacter].affinities;
    if (!card.tags.every((t) => charAffinities.includes(t))) return false;
  }

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

  if (card.effects.some((e) => e.type === "tag")) return false;

  const other = opponentOf(player);
  return stateAfter[other].hp < stateBefore[other].hp;
}

function applyInitiativeOnHit(state: GameState, player: PlayerId): GameState {
  if (state.initiative === player) return state;

  const prev = state.initiative;
  let s = {
    ...state,
    initiative: player,
  };

  s = pushLog(s, `${player} takes initiative (from ${prev})`);
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

  // 캔슬 대상 카드가 공격 카드(데미지 효과 보유)가 아니면 캔슬 불가
  const cancelledCardDef = getCard(cancelledCard);
  const isCancellable = cancelledCardDef?.effects.some((e) => e.type === "damage") ?? false;
  if (!isCancellable) return state;

  let s = moveQueuedCard(state, other, cancelledCard, "trash");
  s = {
    ...s,
    recentlyCancelledId: cancelledCard,
    recentlyCancelledPlayer: other,
    [other]: {
      ...s[other],
      ready: false,
    },
  } as GameState;

  s = pushLog(
    s,
    `${other} cancelled — "${cancelledCardDef?.name ?? cancelledCard}" sent to trash`
  );

  unresolved.delete(other);
  return s;
}

/* -------------------------- */
/* resolve 메인 */
/* -------------------------- */

function endTurnCleanup(state: GameState): GameState {
  let s: GameState = {
    ...state,
    P1: { ...state.P1, queue: [], ready: false },
    AI: { ...state.AI, queue: [], ready: false },
  };

  if (areBothPlayersExhausted(s)) {
    return handleRoundEnd(s);
  }

  // AI 핸드 초과 자동 버리기
  s = discardAIExcess(s);

  // P1 핸드 초과 → 버리기 선택 UI 대기
  const p1Excess = s.P1.hand.length - HAND_LIMIT;
  if (p1Excess > 0) {
    const pendingDiscard: PendingDiscard = {
      count: p1Excess,
      candidates: [...s.P1.hand],
    };
    return { ...s, phase: "WAITING_DISCARD", pendingDiscard };
  }

  return { ...s, phase: "TURN_END" };
}

/**
 * RESOLVE 페이즈 진입 시 호출.
 * resolveQueue를 구성하고 phase를 RESOLVING으로 전환만 한다 (즉시 처리 없음).
 */
export function enterResolving(state: GameState): GameState {
  if (state.phase !== "RESOLVE") return state;

  const items = buildResolveOrder(state);
  const unresolvedArr: PlayerId[] = [];
  if (state.P1.queue[0]) unresolvedArr.push("P1");
  if (state.AI.queue[0]) unresolvedArr.push("AI");

  if (items.length === 0) {
    return endTurnCleanup({
      ...state,
      resolveQueue: [],
      resolveIndex: 0,
      resolveUnresolved: [],
    });
  }

  return {
    ...state,
    phase: "RESOLVING",
    resolveQueue: items,
    resolveIndex: 0,
    resolveUnresolved: unresolvedArr,
  };
}

/**
 * RESOLVING 페이즈에서 카드 한 장 처리.
 * 처리 후 남은 카드가 있으면 RESOLVING 유지, 없으면 TURN_END.
 */
export function resolveOneStep(state: GameState): GameState {
  if (state.phase !== "RESOLVING") return state;

  const items = state.resolveQueue;
  const unresolved = new Set<PlayerId>(state.resolveUnresolved);

  // 현재 인덱스부터 처리 가능한 다음 아이템 탐색
  let idx = state.resolveIndex;
  while (idx < items.length && !unresolved.has(items[idx].player)) {
    idx++;
  }

  if (idx >= items.length) {
    return endTurnCleanup({
      ...state,
      resolveQueue: [],
      resolveIndex: 0,
      resolveUnresolved: [],
    });
  }

  const it = items[idx];
  const before = state;

  let s = applyCardEffectsWithPause(
    state,
    it.player,
    it.cardId,
    items,
    idx + 1,
    [...unresolved]
  );

  if (s.phase === "WAITING_SELECTION") {
    return { ...s, resolveIndex: idx };
  }
  if (s.phase === "GAME_OVER") return s;

  s = moveQueuedCard(s, it.player, it.cardId, "cooldown");
  unresolved.delete(it.player);

  const hit = didDirectAttackHit(before, s, it.player, it.cardId);
  if (hit) {
    s = applyInitiativeOnHit(s, it.player);
    s = applyGainOnHit(s, it.player, it.cardId);
    s = applyCancelOnHit(s, it.player, unresolved);
  }

  const nextIdx = idx + 1;

  let hasMore = false;
  for (let i = nextIdx; i < items.length; i++) {
    if (unresolved.has(items[i].player)) {
      hasMore = true;
      break;
    }
  }

  if (hasMore) {
    return {
      ...s,
      phase: "RESOLVING",
      resolveIndex: nextIdx,
      resolveUnresolved: [...unresolved],
    };
  }

  return endTurnCleanup({
    ...s,
    resolveQueue: [],
    resolveIndex: 0,
    resolveUnresolved: [],
  });
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
    phase: "RESOLVING",
    pendingSelection: null,
  };

  // 선택된 카드 이동
  if (selectedCards.length > 0) {
    s = moveCardsBetweenZones(s, ps.fromPlayerId, ps.fromZone, ps.toPlayerId, ps.toZone, selectedCards, ps.toPosition);
    s = pushLog(s, `${ps.sourcePlayer} returns ${selectedCards.length} card(s) from ${ps.fromZone} to ${ps.toZone}`);
  }

  // 원인 카드를 쿨다운으로 이동
  s = moveQueuedCard(s, ps.sourcePlayer, ps.sourceCardId, "cooldown");

  // 남은 아이템 확인 후 RESOLVING으로 재개 (step-by-step)
  const unresolved = new Set<PlayerId>(ps.unresolvedPlayers);
  const items = ps.resolveItems;

  let hasMore = false;
  for (let i = ps.resolveNextIndex; i < items.length; i++) {
    if (unresolved.has(items[i].player)) {
      hasMore = true;
      break;
    }
  }

  if (!hasMore) {
    return endTurnCleanup({
      ...s,
      resolveQueue: [],
      resolveIndex: 0,
      resolveUnresolved: [],
    });
  }

  return {
    ...s,
    phase: "RESOLVING",
    resolveQueue: items,
    resolveIndex: ps.resolveNextIndex,
    resolveUnresolved: ps.unresolvedPlayers,
  };
}
