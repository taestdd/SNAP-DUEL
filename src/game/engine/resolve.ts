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
  tickPoisons,
  checkGameOver,
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

    s = applyCardEffectsWithPause(s, it.player, it.cardId, items, idx + 1, [...unresolved]);

    if (s.phase === "WAITING_SELECTION") {
      animScript.push({ actor: it.player, cardId: it.cardId, actorAirborne, targetAirborne,
        hpAfter: { P1: s.P1.hp, AI: s.AI.hp },
        attackLanded: s.attackLanded, attackConnected: s.attackConnected });
      return { ...s, animScript };
    }

    if (s.phase === "GAME_OVER") {
      animScript.push({ actor: it.player, cardId: it.cardId, actorAirborne, targetAirborne,
        hpAfter: { P1: s.P1.hp, AI: s.AI.hp },
        attackLanded: s.attackLanded, attackConnected: s.attackConnected });
      // 이미 승부가 났으므로 중독 틱은 돌지 않는다 (죽은 뒤에 독이 더 들어갈 이유가 없다)
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
    const hit = didDirectAttackHit(s, it.player, it.cardId);
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
      // 연출이 카드 스탯으로 적중을 재계산하지 않도록 엔진 판정을 그대로 싣는다
      attackLanded: s.attackLanded,
      attackConnected: s.attackConnected,
      hpAfter: { P1: s.P1.hp, AI: s.AI.hp },
      counteredPlayer: counteredPlayerByThisCard,
      comboAfter: comboAfterThisCard,
      comboHolder: comboHolderAfterThisCard,
    });

    idx++;
  }

  return finishResolve(s, animScript);
}

/**
 * 리졸브 마무리 — 중독 틱을 넣고 ANIMATING으로 넘긴다.
 *
 * 틱을 여기서 도는 이유: HP 변화는 반드시 animScript/poisonTicks를 거쳐야
 * `animStartHp` 스냅샷과 어긋나지 않는다. 턴 시작에서 깎으면 ANIMATING 바깥이라
 * HP 바가 예고 없이 떨어진다.
 */
function finishResolve(state: GameState, animScript: AnimScriptEntry[]): GameState {
  const { state: ticked, ticks } = tickPoisons(state);
  // 중독으로 캐릭터가 쓰러질 수 있다 — 연출은 끝까지 재생하고 ANIM/DONE이 GAME_OVER로 넘긴다
  const s = checkGameOver(ticked);

  const base: GameState = { ...s, resolveContext: emptyResolveContext(), animScript, poisonTicks: ticks };
  if (animScript.length > 0 || ticks.length > 0) return { ...base, phase: "ANIMATING" };
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

  // 양쪽 다 패스해도 중독은 돈다 — 카드를 안 내는 것으로 독을 흘려보낼 수 없어야 한다
  if (items.length === 0) {
    return finishResolve({ ...state, animStartHp: { P1: state.P1.hp, AI: state.AI.hp } }, []);
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
    s = pushLog(
      s,
      `${ps.sourcePlayer} returns ${selectedCards.length} card(s): ${ps.fromPlayerId} ${ps.fromZone} → ${ps.toPlayerId} ${ps.toZone}`,
    );
  }

  // 선택을 유발한 카드에 아직 안 처리된 효과가 남아 있으면 이어서 적용한다.
  // (예: 회수 후 shuffle, userSelects 효과가 연속으로 있는 카드)
  // 공격 스탯은 이미 처리됐으므로 startEffectIndex > 0 경로가 이를 건너뛴다.
  s = applyCardEffectsWithPause(
    s,
    ps.sourcePlayer,
    ps.sourceCardId,
    ps.resolveItems,
    ps.resolveNextIndex,
    [ps.sourcePlayer, ...ps.unresolvedPlayers],
    ps.resumeEffectIndex,
  );

  // 남은 효과가 또 선택을 요구하거나 게임이 끝났으면 여기서 멈춘다
  if (s.phase === "WAITING_SELECTION" || s.phase === "GAME_OVER") return s;

  s = moveQueuedCard(s, ps.sourcePlayer, ps.sourceCardId, "cooldown");

  return resolveAll({
    ...s,
    resolveContext: { queue: ps.resolveItems, index: ps.resolveNextIndex, unresolved: ps.unresolvedPlayers },
  });
}
