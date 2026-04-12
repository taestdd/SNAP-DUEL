import { useEffect } from "react";
import type { CombatAnimationEvent } from "@/game/engine/types";

/**
 * 이벤트 큐를 순서대로 소비하는 훅.
 *
 * - events 배열의 각 이벤트를 delay(절대 ms) 시점에 onEvent로 콜백한다.
 * - running=false면 모든 타이머를 중단한다.
 * - events 또는 running 변경 시 기존 타이머를 취소하고 재시작한다.
 */
export function useAnimQueue(
  events: CombatAnimationEvent[],
  onEvent: (event: CombatAnimationEvent) => void,
  running: boolean,
): void {
  useEffect(() => {
    if (!running || events.length === 0) return;

    const timers = events.map((ev) =>
      setTimeout(() => onEvent(ev), ev.delay),
    );

    return () => {
      for (const t of timers) clearTimeout(t);
    };
    // onEvent는 useCallback으로 안정화된 참조를 전달해야 함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, running]);
}
