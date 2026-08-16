import type { GameState, PlayerId } from "@/game/engine/types";

/**
 * 게스트용 상태 뒤집기.
 * 게스트는 내부적으로 AI 역할 → P1/AI를 교환해 게스트가 항상 P1처럼 보이도록 함.
 *
 * ⚠️ 유지보수: GameState에 플레이어를 가리키는 필드(actor/holder/... 참조)나
 * P1/AI 키를 가진 절대값 스냅샷(animStartHp, animScript[].hpAfter 같은)을
 * 새로 추가하면 이 함수에도 교환 로직을 추가해야 한다. 누락하면 게스트
 * 화면에서만 값이 서로 바뀌어 보이는 버그가 된다 (flipState.test.ts로 방어).
 */
export function flipId(id: PlayerId): PlayerId {
  return id === "P1" ? "AI" : "P1";
}

export function flipState(state: GameState): GameState {
  return {
    ...state,
    P1: { ...state.AI, id: "P1" },
    AI: { ...state.P1, id: "AI" },
    initiative: flipId(state.initiative),
    winner:
      state.winner === "P1" ? "AI"
      : state.winner === "AI" ? "P1"
      : state.winner,
    draftSelections: {
      P1: state.draftSelections.AI,
      AI: state.draftSelections.P1,
    },
    pendingCostPayment: state.pendingCostPayment
      ? {
          ...state.pendingCostPayment,
          player: flipId(state.pendingCostPayment.player),
          fromPlayerId: flipId(state.pendingCostPayment.fromPlayerId),
          toPlayerId: flipId(state.pendingCostPayment.toPlayerId),
        }
      : null,
    pendingSelection: state.pendingSelection
      ? {
          ...state.pendingSelection,
          selectingPlayer: flipId(state.pendingSelection.selectingPlayer),
          fromPlayerId: flipId(state.pendingSelection.fromPlayerId),
          toPlayerId: flipId(state.pendingSelection.toPlayerId),
          sourcePlayer: flipId(state.pendingSelection.sourcePlayer),
          resolveItems: state.pendingSelection.resolveItems.map((item) => ({
            ...item,
            player: flipId(item.player),
          })),
          unresolvedPlayers: state.pendingSelection.unresolvedPlayers.map(flipId),
        }
      : null,
    pendingDiscard: state.pendingDiscard
      ? { ...state.pendingDiscard, player: flipId(state.pendingDiscard.player) }
      : null,
    resolveContext: {
      queue: state.resolveContext.queue.map((item) => ({ ...item, player: flipId(item.player) })),
      index: state.resolveContext.index,
      unresolved: state.resolveContext.unresolved.map(flipId),
    },
    animScript: state.animScript.map((entry) => ({
      ...entry,
      actor: flipId(entry.actor),
      counteredPlayer: entry.counteredPlayer ? flipId(entry.counteredPlayer) : undefined,
      comboHolder: entry.comboHolder ? flipId(entry.comboHolder) : undefined,
      // hpAfter는 절대 P1/AI 키 — 값도 교환해야 HP 지연 표시가 올바름
      hpAfter: { P1: entry.hpAfter.AI, AI: entry.hpAfter.P1 },
    })),
    // 중독 틱도 대상(PlayerId)과 HP 스냅샷을 둘 다 갖는다 — animScript와 같은 이유로 교환
    poisonTicks: state.poisonTicks.map((tick) => ({
      ...tick,
      target: flipId(tick.target),
      hpAfter: { P1: tick.hpAfter.AI, AI: tick.hpAfter.P1 },
    })),
    // ANIMATING 진입 시 displayedHp 초기값 — 교환 누락 시 애니메이션 동안
    // 내/상대 HP 바가 서로 바뀌어 보이는 버그가 발생한다
    animStartHp: state.animStartHp
      ? { P1: state.animStartHp.AI, AI: state.animStartHp.P1 }
      : null,
    animStartCombo: state.animStartCombo
      ? { ...state.animStartCombo, holder: flipId(state.animStartCombo.holder) }
      : null,
    recentlyCounteredPlayer:
      state.recentlyCounteredPlayer ? flipId(state.recentlyCounteredPlayer) : null,
    // 태그 플래그 교환 → 게스트 화면의 Tag 버튼 잠금(p1TaggedThisTurn 참조)이 올바르게 동작
    p1TaggedThisTurn: state.aiTaggedThisTurn,
    aiTaggedThisTurn: state.p1TaggedThisTurn,
    // 턴 로그(기보 다운로드용) — P1/AI 절대 키를 통째로 교환해야 게스트가 받는
    // JSON에서 자기 자신이 P1으로 나온다
    turnLog: state.turnLog.map((e) => ({
      ...e,
      initiative: flipId(e.initiative),
      P1: e.AI,
      AI: e.P1,
      hp: { P1: e.hp.AI, AI: e.hp.P1 },
      airborne: { P1: e.airborne.AI, AI: e.airborne.P1 },
      hands: { P1: e.hands.AI, AI: e.hands.P1 },
    })),
    turnStartHands: state.turnStartHands
      ? { P1: state.turnStartHands.AI, AI: state.turnStartHands.P1 }
      : null,
  };
}
