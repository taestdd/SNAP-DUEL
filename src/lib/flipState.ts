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
    resolveContext: {
      queue: state.resolveContext.queue.map((item) => ({ ...item, player: flipId(item.player) })),
      index: state.resolveContext.index,
      unresolved: state.resolveContext.unresolved.map(flipId),
    },
    animScript: state.animScript.map((entry) => ({
      ...entry,
      actor: flipId(entry.actor),
      cancelledPlayer: entry.cancelledPlayer ? flipId(entry.cancelledPlayer) : undefined,
      comboHolder: entry.comboHolder ? flipId(entry.comboHolder) : undefined,
      // hpAfter는 절대 P1/AI 키 — 값도 교환해야 HP 지연 표시가 올바름
      hpAfter: { P1: entry.hpAfter.AI, AI: entry.hpAfter.P1 },
    })),
    // ANIMATING 진입 시 displayedHp 초기값 — 교환 누락 시 애니메이션 동안
    // 내/상대 HP 바가 서로 바뀌어 보이는 버그가 발생한다
    animStartHp: state.animStartHp
      ? { P1: state.animStartHp.AI, AI: state.animStartHp.P1 }
      : null,
    animStartCombo: state.animStartCombo
      ? { ...state.animStartCombo, holder: flipId(state.animStartCombo.holder) }
      : null,
    recentlyCancelledPlayer:
      state.recentlyCancelledPlayer ? flipId(state.recentlyCancelledPlayer) : null,
    // 엔진은 P1(호스트)의 태그만 턴 단위로 추적한다. 게스트(내부 AI)의 태그 여부는
    // 대응 필드가 없어 항상 false — 게스트 Tag 버튼의 "이번 턴 이미 태그" 잠금이
    // 동작하지 않는 알려진 한계 (엔진에 aiTaggedThisTurn 도입 시 여기서 교환할 것)
    p1TaggedThisTurn: false,
  };
}
