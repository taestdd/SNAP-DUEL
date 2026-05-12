import type { AnimScriptEntry, GameState, PlayerId } from "./types";
import { getCard } from "./cards";
import {
  opponentOf,
  pushLog,
  getEffectiveSpeed,
  moveQueuedCard,
  moveCardsBetweenZones,
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
    const sa = getEffectiveSpeed(state, a.player, a.cardId);
    const sb = getEffectiveSpeed(state, b.player, b.cardId);
    if (sa !== sb) return sa - sb;
    if (a.player === state.initiative) return -1;
    if (b.player === state.initiative) return 1;
    return 0;
  });

  return items;
}

/* -------------------------- */
/* 적중 / 주도권 / 이득 / 캔슬 */
/* -------------------------- */

function didDirectAttackHit(stateBefore: GameState, stateAfter: GameState, player: PlayerId, cardId: string): boolean {
  const card = getCard(cardId);
  if (!card) return false;
  if (!card.effects.some((e) => e.type === "damage")) return false;
  if (card.effects.some((e) => e.type === "tag")) return false;
  return stateAfter[opponentOf(player)].hp < stateBefore[opponentOf(player)].hp;
}

function applyInitiativeOnHit(state: GameState, player: PlayerId): GameState {
  if (state.initiative === player) return state;
  const prev = state.initiative;
  return pushLog({ ...state, initiative: player }, `${player} takes initiative (from ${prev})`);
}

function applyGainOnHit(state: GameState, player: PlayerId, cardId: string): GameState {
  const card = getCard(cardId);
  if (!card) return state;
  const gain = card.gain ?? 0;
  if (gain <= 0) return state;

  const s = {
    ...state,
    [player]: {
      ...state[player],
      status: {
        ...state[player].status,
        speedBonusNext: (state[player].status.speedBonusNext ?? 0) + gain,
      },
    },
  } as GameState;
  return pushLog(s, `${player} gains SPEED -${gain} next turn`);
}

function applyCancelOnHit(state: GameState, attacker: PlayerId, unresolved: Set<PlayerId>): GameState {
  const other = opponentOf(attacker);
  if (!unresolved.has(other)) return state;

  const cancelledCard = state[other].queue[0];
  if (!cancelledCard) return state;

  const cancelledCardDef = getCard(cancelledCard);
  const isCancellable = cancelledCardDef?.effects.some((e) => e.type === "damage") ?? false;
  if (!isCancellable) return state;

  let s = moveQueuedCard(state, other, cancelledCard, "trash");
  s = {
    ...s,
    recentlyCancelledId: cancelledCard,
    recentlyCancelledPlayer: other,
    [other]: { ...s[other], ready: false },
  } as GameState;
  s = pushLog(s, `${other} cancelled — "${cancelledCardDef?.name ?? cancelledCard}" sent to trash`);

  unresolved.delete(other);
  return s;
}

/* -------------------------- */
/* 리졸브 메인 루프            */
/* -------------------------- */

function resolveAll(state: GameState): GameState {
  if (state.phase !== "RESOLVING") return state;

  const items = state.resolveQueue;
  const unresolved = new Set<PlayerId>(state.resolveUnresolved);
  const animScript: AnimScriptEntry[] = [...state.animScript];
  let idx = state.resolveIndex;
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
        return { ...s, phase: "ANIMATING", resolveQueue: [], resolveIndex: 0, resolveUnresolved: [], animScript };
      }
      return s;
    }

    s = moveQueuedCard(s, it.player, it.cardId, "cooldown");
    unresolved.delete(it.player);

    let cancelledPlayerByThisCard: PlayerId | undefined;
    const hit = didDirectAttackHit(beforeStep, s, it.player, it.cardId);
    if (hit) {
      s = applyInitiativeOnHit(s, it.player);
      s = applyGainOnHit(s, it.player, it.cardId);
      const prevCancelled = s.recentlyCancelledPlayer;
      s = applyCancelOnHit(s, it.player, unresolved);
      if (s.recentlyCancelledPlayer !== prevCancelled) {
        cancelledPlayerByThisCard = s.recentlyCancelledPlayer ?? undefined;
      }
    }

    animScript.push({
      actor: it.player,
      cardId: it.cardId,
      actorAirborne,
      targetAirborne,
      hpAfter: { P1: s.P1.hp, AI: s.AI.hp },
      cancelledPlayer: cancelledPlayerByThisCard,
    });

    idx++;
  }

  const base = { ...s, resolveQueue: [], resolveIndex: 0, resolveUnresolved: [], animScript };
  if (animScript.length > 0) return { ...base, phase: "ANIMATING" };
  return endTurnCleanup(base);
}

/* -------------------------- */
/* 외부 진입점                */
/* -------------------------- */

/**
 * RESOLVE 페이즈 진입 시 호출.
 * resolveQueue를 구성하고 모든 카드를 즉시 처리 후 ANIMATING으로 전환.
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
      animScript: [],
    });
  }

  return resolveAll({
    ...state,
    phase: "RESOLVING",
    resolveQueue: items,
    resolveIndex: 0,
    resolveUnresolved: unresolvedArr,
    animScript: [],
    animStartHp: { P1: state.P1.hp, AI: state.AI.hp },
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
    resolveQueue: ps.resolveItems,
    resolveIndex: ps.resolveNextIndex,
    resolveUnresolved: ps.unresolvedPlayers,
  });
}
