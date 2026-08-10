import type { GameState, PendingDiscard, PlayerId } from "./types";
import { getCard } from "./cards";
import {
  pushLog,
  syncExhausted,
  areBothPlayersExhausted,
  discardAIExcess,
  moveHandToTrash,
  recycleTrashIntoDeck,
  moveCooldownToTrash,
  decideWinnerByHp,
  moveCardsBetweenZones,
  updateCombatant,
  tickTurnBuffs,
} from "./stateHelpers";
import { HAND_LIMIT } from "./constants";
import { canUseCard, getEffectiveCost } from "./effects";

/* -------------------------- */
/* 라운드 라이프사이클          */
/* -------------------------- */

function prepareNextRound(state: GameState): GameState {
  let s = state;
  s = pushLog(s, `Round ${state.round + 1} begins`);
  s = recycleTrashIntoDeck(s, "P1");
  s = recycleTrashIntoDeck(s, "AI");
  s = moveCooldownToTrash(s, "P1");
  s = moveCooldownToTrash(s, "AI");

  const nextState: GameState = {
    ...s,
    round: state.round + 1,
    turn: 0,
    phase: "ROUND_DRAFT",
    selected: null,
    recentlyCounteredId: null,
    recentlyCounteredPlayer: null,
    comboCount: 0,
    animStartCombo: null,
    draftSelections: { P1: null, AI: null },
    // 라운드는 핸드·쿨다운을 전부 정리하는 경계 — 버프도 남은 턴과 무관하게 끊는다
    P1: { ...s.P1, queue: [], ready: false, block: 0, status: { ...s.P1.status, buffs: [] } },
    AI: { ...s.AI, queue: [], ready: false, block: 0, status: { ...s.AI.status, buffs: [] } },
  };

  s = syncExhausted(nextState, "P1");
  s = syncExhausted(s, "AI");
  return s;
}

function handleRoundEnd(state: GameState): GameState {
  let s = state;
  s = pushLog(s, `Round ${s.round} ends`);
  s = moveHandToTrash(s, "P1");
  s = moveHandToTrash(s, "AI");
  if (s.round >= 3) return decideWinnerByHp(s);
  return prepareNextRound(s);
}

/* -------------------------- */
/* 드래프트 제출               */
/* -------------------------- */

export function submitDraft(state: GameState, player: PlayerId, cardIds: string[]): GameState {
  if (state.phase !== "ROUND_DRAFT") return state;
  if (state.draftSelections[player] !== null) return state;

  const me = state[player];
  const remaining = [...me.deck];
  const moved: string[] = [];
  for (const id of cardIds) {
    const idx = remaining.indexOf(id);
    if (idx >= 0) { remaining.splice(idx, 1); moved.push(id); }
  }

  let s: GameState = {
    ...state,
    [player]: { ...me, deck: remaining, hand: [...me.hand, ...moved] },
    draftSelections: { ...state.draftSelections, [player]: moved },
  } as GameState;

  s = syncExhausted(s, player);
  s = pushLog(s, `${player} drafts ${moved.length} card(s)`);

  if (s.draftSelections.P1 !== null && s.draftSelections.AI !== null) {
    s = { ...s, phase: "TURN_START" };
  }
  return s;
}

/* -------------------------- */
/* 턴 시작                    */
/* -------------------------- */

function advanceTurnNumber(state: GameState): GameState {
  return { ...state, turn: state.turn + 1 };
}

function resetTurnFlags(state: GameState): GameState {
  return {
    ...state,
    phase: "SETUP_INIT",
    selected: null,
    recentlyCounteredId: null,
    recentlyCounteredPlayer: null,
    p1TaggedThisTurn: false,
    aiTaggedThisTurn: false,
    animScript: [],
    animStartHp: null,
    P1: { ...state.P1, block: 0, queue: [], ready: false },
    AI: { ...state.AI, block: 0, queue: [], ready: false },
  };
}

function applyTurnStartStatuses(state: GameState): GameState {
  return {
    ...state,
    P1: {
      ...state.P1,
      status: {
        ...state.P1.status,
        delayAdvantage: state.P1.status.delayAdvantageNext ?? 0,
        delayAdvantageNext: 0,
        buffs: tickTurnBuffs(state.P1.status.buffs ?? []),
      },
      airborneStack: Math.max(0, state.P1.airborneStack - 1),
    },
    AI: {
      ...state.AI,
      status: {
        ...state.AI.status,
        delayAdvantage: state.AI.status.delayAdvantageNext ?? 0,
        delayAdvantageNext: 0,
        buffs: tickTurnBuffs(state.AI.status.buffs ?? []),
      },
      airborneStack: Math.max(0, state.AI.airborneStack - 1),
    },
  };
}

export function beginTurn(state: GameState): GameState {
  if (state.phase === "GAME_OVER") return state;
  let s = advanceTurnNumber(state);
  s = resetTurnFlags(s);
  s = applyTurnStartStatuses(s);
  if (s.phase === "GAME_OVER") return s;
  return pushLog(s, `━━ Turn ${s.turn} | Initiative: ${s.initiative} ━━`);
}

/* -------------------------- */
/* 턴 종료                    */
/* -------------------------- */

export function endTurnCleanup(state: GameState): GameState {
  const p1Card = state.animScript.find((e) => e.actor === "P1")?.cardId
    ?? (state.recentlyCounteredPlayer === "P1" ? state.recentlyCounteredId : null)
    ?? null;
  const aiCard = state.animScript.find((e) => e.actor === "AI")?.cardId
    ?? (state.recentlyCounteredPlayer === "AI" ? state.recentlyCounteredId : null)
    ?? null;

  const entry = {
    turn: state.turn,
    initiative: state.initiative,
    P1: { card: p1Card, countered: state.recentlyCounteredPlayer === "P1" },
    AI: { card: aiCard, countered: state.recentlyCounteredPlayer === "AI" },
    hp: { P1: state.P1.hp, AI: state.AI.hp },
    airborne: { P1: state.P1.airborneStack, AI: state.AI.airborneStack },
  };

  let s: GameState = {
    ...state,
    P1: { ...state.P1, queue: [], ready: false },
    AI: { ...state.AI, queue: [], ready: false },
    turnLog: [...state.turnLog, entry],
  };

  if (areBothPlayersExhausted(s)) return handleRoundEnd(s);

  s = discardAIExcess(s);

  const p1Excess = s.P1.hand.length - HAND_LIMIT;
  if (p1Excess > 0) {
    const pendingDiscard: PendingDiscard = { count: p1Excess, candidates: [...s.P1.hand] };
    return { ...s, phase: "WAITING_DISCARD", pendingDiscard };
  }

  return { ...s, phase: "TURN_END" };
}

/* -------------------------- */
/* altCost 지불 재개          */
/* -------------------------- */

/**
 * WAITING_COST_PAYMENT 상태에서 플레이어가 코스트 카드를 선택 확정한 후 호출.
 * 1. 선택 카드를 altCost toZone으로 이동 (코스트 지불)
 * 2. 원래 카드를 큐에 올리고 덱 코스트 지불 (canUseCard 재검사 없이)
 * 3. ready=true, returnPhase로 진행
 */
export function resumeCostPayment(state: GameState, selectedCards: string[]): GameState {
  if (!state.pendingCostPayment) return state;
  const pc = state.pendingCostPayment;

  if (selectedCards.length !== pc.count) return state;

  let s: GameState = { ...state, pendingCostPayment: null };

  // 1. altCost 지불
  s = moveCardsBetweenZones(s, pc.fromPlayerId, pc.fromZone, pc.toPlayerId, pc.toZone, selectedCards, pc.toPosition);
  s = pushLog(s, `${pc.player} pays altCost: ${selectedCards.length} card(s) ${pc.fromZone}→${pc.toZone}`);

  // 2. 카드를 큐에 올림 (altCost 지불 완료 후이므로 canUseCard 우회)
  const card = getCard(pc.cardId);
  if (!card) return state;
  const me = s[pc.player];
  const newHandIndex = me.hand.indexOf(pc.cardId);
  if (newHandIndex < 0) return state;

  const effectiveCost = getEffectiveCost(s, pc.player, card);
  if (me.deck.length < effectiveCost) return state;

  const nextHand = [...me.hand];
  nextHand.splice(newHandIndex, 1);
  const deckCostCards = me.deck.slice(0, effectiveCost);
  const remainingDeck = me.deck.slice(effectiveCost);

  s = updateCombatant(s, pc.player, {
    hand: nextHand,
    deck: remainingDeck,
    trash: [...s[pc.player].trash, ...deckCostCards],
    queue: [...s[pc.player].queue, pc.cardId],
  });

  s = pushLog(s, `${pc.player} queued ${card.name} (cost: ${effectiveCost} cards)`);
  s = syncExhausted(s, pc.player);

  // 3. ready + 페이즈 진행
  s = { ...s, [pc.player]: { ...s[pc.player], ready: true } };
  return { ...s, phase: pc.returnPhase };
}

/* -------------------------- */
/* 카드 예약                  */
/* -------------------------- */

export function queueCard(state: GameState, player: PlayerId, cardId: string, handIndex: number): GameState {
  if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;

  const me = state[player];
  const card = getCard(cardId);
  if (!card) return state;
  if (me.ready) return state;
  if (handIndex < 0 || handIndex >= me.hand.length) return state;
  if (me.hand[handIndex] !== cardId) return state;
  if (!canUseCard(state, player, cardId)) return state;

  const effectiveCost = getEffectiveCost(state, player, card);

  if (me.deck.length < effectiveCost) return state;

  const nextHand = [...me.hand];
  nextHand.splice(handIndex, 1);
  const costCards = me.deck.slice(0, effectiveCost);
  const remainingDeck = me.deck.slice(effectiveCost);

  let s = updateCombatant(state, player, {
    hand: nextHand,
    deck: remainingDeck,
    trash: [...me.trash, ...costCards],
    queue: [...me.queue, cardId],
  });

  s = pushLog(s, `${player} queued ${card.name} (cost: ${effectiveCost} cards)`);
  s = syncExhausted(s, player);

  // altCost 지불
  if (card.altCost?.type === "hp") {
    const amount = card.altCost.amount;
    const me2 = s[player];
    const newHp = me2.hp - amount;
    s = updateCombatant(s, player, {
      hp: newHp,
      characterHp: { ...s[player].characterHp, [s[player].activeCharacter]: newHp },
    });
    s = pushLog(s, `${player} pays ${amount} HP (altCost)`);
  } else if (card.altCost && (player === "AI" || !card.altCost.userSelects)) {
    const cost = card.altCost;
    const fromPlayerId: PlayerId = cost.target === "enemy" ? (player === "P1" ? "AI" : "P1") : player;
    const toPlayerId: PlayerId = player;
    const allCards = s[fromPlayerId][cost.fromZone] as string[];
    const pool = cost.tag
      ? allCards.filter(id => getCard(id)?.tags?.includes(cost.tag!))
      : allCards;
    const toMove = pool.slice(0, cost.count);
    if (toMove.length > 0) {
      s = moveCardsBetweenZones(s, fromPlayerId, cost.fromZone, toPlayerId, cost.toZone, toMove, cost.toPosition ?? "bottom");
      s = pushLog(s, `${player} pays altCost: ${toMove.length} card(s) ${cost.fromZone}→${cost.toZone}`);
    }
  }

  // additionalCost 소모 — 요구 충족 여부는 위의 canUseCard가 이미 검증했다
  if (card.additionalCost) {
    const { requires, consumeTo } = card.additionalCost;
    for (const req of requires) {
      const zone = s[player][req.zone] as string[];
      const toConsume = zone.filter((id) => id === req.cardId).slice(0, req.count);
      if (toConsume.length === 0) continue;
      s = moveCardsBetweenZones(s, player, req.zone, player, consumeTo, toConsume, "bottom");
      s = pushLog(s, `${player} consumes ${toConsume.length}x ${req.cardId} (${req.zone}→${consumeTo})`);
    }
  }

  return s;
}
