import { useEffect } from "react";
import type { Action, GameState } from "@/game/engine/types";

/** RESOLVE 진입 후 카드 일괄 해결까지 딜레이 (ms) */
const RESOLVE_STEP_DELAY = 500;
/** TURN_END 후 다음 턴 시작까지 딜레이 (ms) */
const TURN_END_DELAY = 600;

/**
 * 페이즈 자동 전환을 구동하는 공용 훅.
 * 싱글플레이·온라인(호스트/게스트)이 동일하게 사용하던 3개의 useEffect를 단일화한다.
 *
 * - TURN_START → TURN/BEGIN (양쪽 핸드가 채워졌을 때)
 * - RESOLVE → RESOLVE/STEP (RESOLVE_STEP_DELAY 후, paused 중에는 보류)
 * - TURN_END → TURN/BEGIN (TURN_END_DELAY 후, 승자 확정 시 보류)
 *
 * @param state 게임 상태 (게스트는 동기화 전 null 가능)
 * @param dispatch 해당 컨텍스트의 dispatch
 * @param options.paused 태그 연출 등으로 해결을 잠시 멈춰야 할 때 true
 */
export function useFlowDriver(
  state: GameState | null,
  dispatch: React.Dispatch<Action>,
  options?: { paused?: boolean },
) {
  const paused = options?.paused ?? false;
  const phase = state?.phase;
  const winner = state?.winner;
  const p1HandLen = state?.P1.hand.length ?? 0;
  const aiHandLen = state?.AI.hand.length ?? 0;

  // TURN_START → TURN/BEGIN
  useEffect(() => {
    if (phase === "TURN_START" && p1HandLen > 0 && aiHandLen > 0) {
      dispatch({ type: "TURN/BEGIN" });
    }
  }, [phase, p1HandLen, aiHandLen, dispatch]);

  // RESOLVE → RESOLVE/STEP
  useEffect(() => {
    if (phase !== "RESOLVE" || paused) return;
    const t = setTimeout(() => dispatch({ type: "RESOLVE/STEP" }), RESOLVE_STEP_DELAY);
    return () => clearTimeout(t);
  }, [phase, paused, dispatch]);

  // TURN_END → TURN/BEGIN
  useEffect(() => {
    if (phase !== "TURN_END" || winner) return;
    const t = setTimeout(() => dispatch({ type: "TURN/BEGIN" }), TURN_END_DELAY);
    return () => clearTimeout(t);
  }, [phase, winner, dispatch]);
}
