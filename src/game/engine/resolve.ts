import type { AnimScriptEntry, GameState, PlayerId } from "./types";
import { getCard } from "./cards";
import {
  opponentOf,
  pushLog,
  getEffectiveDelay,
  moveQueuedCard,
  moveCardsBetweenZones,
  evaluateModifiers,
  didDirectAttackHit,
  updateCombatant,
  updateStatus,
} from "./stateHelpers";
import { applyCardEffectsWithPause } from "./effects";
import { endTurnCleanup } from "./turn";

/* -------------------------- */
/* 리졸브 순서 생성            */
/* -------------------------- */

function buildResolveOrder(state: GameState): { player: PlayerId; cardId: string }[] {
  const items: { player: PlayerId; cardId: string }[] = [];
  if (state.P1.queue[0]) items.push({ player: "P1", cardId: state.P1.queue[0] });
  if (state.AI.queue[0]) items.push({ player: "AI", cardId: state.AI.queue[0] });

  items.sort((a, b) => {
    const sa = getEffectiveDelay(state, a.player, a.cardId);
    const sb = getEffectiveDelay(state, b.player, b.cardId);
    if (sa !== sb) return sa - sb;
    if (a.player === state.initiative) return -1;
    if (b.player === state.initiative) return 1;
    return 0;
  });

  return items;
}

/* -------------------------- */
/* 적중 / 주도권 / 이득 / 카운터 */
/* -------------------------- */

function applyInitiativeOnHit(state: GameState, player: PlayerId): GameState {
  if (state.initiative === player) return state;
  const prev = state.initiative;
  return pushLog({ ...state, initiative: player }, `${player} takes initiative (from ${prev})`);
}

function applyAdvantageOnHit(state: GameState, player: PlayerId, cardId: string): GameState {
  const card = getCard(cardId);
  if (!card) return state;
  const mods = evaluateModifiers(state, player, card.statModifiers);
  const advantage = Math.max(0, (card.advantage ?? 0) + (mods.advantage ?? 0));
  if (advantage <= 0) return state;

  const s = updateStatus(state, player, {
    delayAdvantageNext: (state[player].status.delayAdvantageNext ?? 0) + advantage,
  });
  return pushLog(s, `${player} gains +${advantage} advantage next turn`);
}

function applyCounterOnHit(state: GameState, attacker: PlayerId, unresolved: Set<PlayerId>): GameState {
  const other = opponentOf(attacker);
  if (!unresolved.has(other)) return state;

  const counteredCard = state[other].queue[0];
  if (!counteredCard) return state;

  const counteredCardDef = getCard(counteredCard);

  let s = moveQueuedCard(state, other, counteredCard, "trash");
  s = updateCombatant(s, other, { ready: false });
  s = { ...s, recentlyCounteredId: counteredCard, recentlyCounteredPlayer: other };
  s = pushLog(s, `${other} countered — "${counteredCardDef?.name ?? counteredCard}" sent to trash`);

  unresolved.delete(other);
  return s;
}

/* -------------------------- */
/* 리졸브 메인 루프            */
/* -------------------------- */

function emptyResolveContext() {
  return { queue: [] as { player: PlayerId; cardId: string }[], index: 0, unresolved: [] as PlayerId[] };
}

function resolveAll(state: GameState): GameState {
  if (state.phase !== "RESOLVING") return state;

  const { queue: items, index: startIdx, unresolved: unresolvedArr } = state.resolveContext;
  const unresolved = new Set<PlayerId>(unresolvedArr);
  const animScript: AnimScriptEntry[] = [...state.animScript];
  let idx = startIdx;
  let s = state;

  while (true) {
    while (idx < items.length && !unresolved.has(items[idx].player)) idx++;
    if (idx >= items.length) break;

    const it = items[idx];
    const target = opponentOf(it.player);
    const actorAirborne = s[it.player].airborneStack;
    const targetAirborne = s[target].airborneStack;
    const beforeStep = s;

    s = applyCardEffectsWithPause(s, it.player, it.cardId, items, idx + 1, [...unresolved]);

    if (s.phase === "WAITING_SELECTION") {
      animScript.push({ actor: it.player, cardId: it.cardId, actorAirborne, targetAirborne,
        hpAfter: { P1: s.P1.hp, AI: s.AI.hp } });
      return { ...s, animScript };
    }

    if (s.phase === "GAME_OVER") {
      animScript.push({ actor: it.player, cardId: it.cardId, actorAirborne, targetAirborne,
        hpAfter: { P1: s.P1.hp, AI: s.AI.hp } });
      if (animScript.length > 0) {
        return { ...s, phase: "ANIMATING", resolveContext: emptyResolveContext(), animScript };
      }
      return s;
    }

    s = moveQueuedCard(s, it.player, it.cardId, "cooldown");
    unresolved.delete(it.player);

    let counteredPlayerByThisCard: PlayerId | undefined;
    let comboAfterThisCard: number | undefined;
    let comboHolderAfterThisCard: PlayerId | undefined;
    const hit = didDirectAttackHit(beforeStep, s, it.player, it.cardId);
    if (hit) {
      const hadInitiative = s.initiative === it.player;
      s = applyInitiativeOnHit(s, it.player);
      s = applyAdvantageOnHit(s, it.player, it.cardId);
      // 주도권 유지 시 콤보 ++, 주도권 획득 시 콤보 1로 시작
      const newCombo = hadInitiative ? s.comboCount + 1 : 1;
      s = { ...s, comboCount: newCombo };
      comboAfterThisCard = newCombo;
      comboHolderAfterThisCard = it.player;
      const prevCountered = s.recentlyCounteredPlayer;
      s = applyCounterOnHit(s, it.player, unresolved);
      if (s.recentlyCounteredPlayer !== prevCountered) {
        counteredPlayerByThisCard = s.recentlyCounteredPlayer ?? undefined;
      }
    }

    animScript.push({
      actor: it.player,
      cardId: it.cardId,
      actorAirborne,
      targetAirborne,
      hpAfter: { P1: s.P1.hp, AI: s.AI.hp },
      counteredPlayer: counteredPlayerByThisCard,
      comboAfter: comboAfterThisCard,
      comboHolder: comboHolderAfterThisCard,
    });

    idx++;
  }

  const base = { ...s, resolveContext: emptyResolveContext(), animScript };
  if (animScript.length > 0) return { ...base, phase: "ANIMATING" };
  return endTurnCleanup(base);
}

/* -------------------------- */
/* 외부 진입점                */
/* -------------------------- */

/**
 * RESOLVE 페이즈 진입 시 호출.
 * resolveContext를 구성하고 모든 카드를 즉시 처리 후 ANIMATING으로 전환.
 */
export function enterResolving(state: GameState): GameState {
  if (state.phase !== "RESOLVE") return state;

  const items = buildResolveOrder(state);
  const unresolvedArr: PlayerId[] = [];
  if (state.P1.queue[0]) unresolvedArr.push("P1");
  if (state.AI.queue[0]) unresolvedArr.push("AI");

  if (items.length === 0) {
    return endTurnCleanup({ ...state, resolveContext: emptyResolveContext(), animScript: [] });
  }

  return resolveAll({
    ...state,
    phase: "RESOLVING",
    resolveContext: { queue: items, index: 0, unresolved: unresolvedArr },
    animScript: [],
    animStartHp: { P1: state.P1.hp, AI: state.AI.hp },
    animStartCombo: { count: state.comboCount, holder: state.initiative },
  });
}

/**
 * SELECTION/CONFIRM 또는 SELECTION/SKIP 후 resolve를 재개한다.
 */
export function resumeResolve(state: GameState, selectedCards: string[]): GameState {
  if (!state.pendingSelection) return state;
  const ps = state.pendingSelection;

  let s: GameState = { ...state, phase: "RESOLVING", pendingSelection: null };

  if (selectedCards.length > 0) {
    s = moveCardsBetweenZones(s, ps.fromPlayerId, ps.fromZone, ps.toPlayerId, ps.toZone, selectedCards, ps.toPosition);
    s = pushLog(s, `${ps.sourcePlayer} returns ${selectedCards.length} card(s) from ${ps.fromZone} to ${ps.toZone}`);
  }

  s = moveQueuedCard(s, ps.sourcePlayer, ps.sourceCardId, "cooldown");

  return resolveAll({
    ...s,
    resolveContext: { queue: ps.resolveItems, index: ps.resolveNextIndex, unresolved: ps.unresolvedPlayers },
  });
}
