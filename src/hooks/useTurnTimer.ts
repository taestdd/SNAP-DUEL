import { useEffect, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/game/engine/types";
import { isSetupTurnOf } from "@/game/engine/stateHelpers";

/**
 * 턴 시간제약 (lorcana-simulator의 passive clock 패턴).
 *
 * 원칙:
 * - 엔진(GameState)에는 wall-clock을 넣지 않는다 — 결정론 테스트/flipState 미러 보호.
 * - 타이머는 "마감 시각(deadline)"만 기억하고, 만료는 now > deadline 비교로만 판정.
 * - 만료 시 정식 액션(TURN/TIMEOUT)을 디스패치하므로 엔진은 순수하게 유지된다.
 *
 * 역할(role)별 강제 주체:
 * - single: P1의 결정만 강제 (AI는 즉시 행동하므로 시간제약 불필요)
 * - host:   양쪽 모두 강제 — 게스트(AI) 미제출도 호스트가 대신 TURN/TIMEOUT 처리.
 *           게스트 창에는 전송 지연 보정(GUEST_GRACE_MS)을 더한다.
 * - guest:  강제하지 않음(표시 전용) — 호스트의 TURN/TIMEOUT이 hostAction으로 도착.
 *           호스트와 이중 디스패치가 나지 않도록 절대 onTimeout을 호출하지 않는다.
 */

/** 선택 차례당 제한 시간 */
export const TURN_TIME_MS = 20_000;
/** 호스트가 게스트 만료를 강제할 때 더하는 전송 지연 보정 */
export const GUEST_GRACE_MS = 1_500;
/** 카운트다운 갱신 주기 — 표시용이므로 100ms면 충분 (lorcana clock-ticker와 동일) */
const TICK_MS = 100;

export type TurnTimerRole = "single" | "host" | "guest";

/**
 * 현재 시간제약이 걸리는 대기 액터 (순수 함수).
 * 시간제약 대상: SETUP 선택 차례 + WAITING_* 결정 대기.
 */
export function getTimedActor(state: GameState): PlayerId | null {
  switch (state.phase) {
    case "SETUP_INIT":
    case "SETUP_OTHER": {
      const actor: PlayerId = isSetupTurnOf(state, "P1") ? "P1" : "AI";
      return state[actor].ready ? null : actor;
    }
    case "WAITING_COST_PAYMENT":
      return state.pendingCostPayment?.player ?? null;
    case "WAITING_SELECTION":
      return state.pendingSelection?.selectingPlayer ?? null;
    case "WAITING_DISCARD":
      return state.pendingDiscard ? "P1" : null;
    default:
      return null;
  }
}

/**
 * 결정 창(window) 식별 키 — 키가 바뀌면 새 20초가 시작된다 (순수 함수).
 * 같은 턴 안에서도 페이즈/액터가 바뀌면 새 창으로 취급.
 */
export function getWindowKey(state: GameState): string | null {
  const actor = getTimedActor(state);
  if (!actor) return null;
  return `${state.round}:${state.turn}:${state.phase}:${actor}`;
}

/** 이 역할이 이 액터의 만료를 강제해야 하는가 (순수 함수). */
export function shouldEnforce(role: TurnTimerRole, actor: PlayerId): boolean {
  if (role === "guest") return false;
  if (role === "single") return actor === "P1";
  return true; // host: 양쪽 모두
}

export type TurnTimerView = {
  /** 시간제약이 걸린 액터 (없으면 null — 타이머 비표시) */
  timedActor: PlayerId | null;
  /** 남은 시간 ms (타이머 비활성 시 null) */
  remainingMs: number | null;
};

export function useTurnTimer(
  state: GameState | null,
  opts: {
    role: TurnTimerRole;
    /** 만료 시 TURN/TIMEOUT을 디스패치하는 콜백 (guest에서는 호출되지 않음) */
    onTimeout: (player: PlayerId) => void;
    /** false면 타이머 완전 비활성 (튜토리얼 등) */
    enabled?: boolean;
    /** 태그 연출 등으로 카운트다운을 잠시 멈춰야 할 때 true */
    paused?: boolean;
  },
): TurnTimerView {
  const { role, onTimeout, enabled = true, paused = false } = opts;

  const timedActor = state && enabled ? getTimedActor(state) : null;
  const windowKey = state && enabled ? getWindowKey(state) : null;

  // 카운트다운 표시값 — interval 틱에서만 갱신 (effect 내 동기 setState 회피).
  // 창 키를 함께 저장해 이전 창의 잔여값이 새 창에서 표시되지 않게 한다.
  const [tick, setTick] = useState<{ key: string; ms: number } | null>(null);

  // 최신 클로저 참조 (interval 재구독 없이 onTimeout 갱신)
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onTimeoutRef.current = onTimeout; });

  // 표시용 마감(양쪽 모두 20초로 보임)과 강제 시점(호스트→게스트는 +grace)을 분리
  const deadlineRef = useRef<number>(0);
  const firedRef = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; });

  // 카운트다운 + 만료 강제 (창 진입 시 마감 설정 → 100ms 틱)
  useEffect(() => {
    if (!windowKey || !timedActor) return;

    deadlineRef.current = Date.now() + TURN_TIME_MS;
    const grace = role === "host" && timedActor === "AI" ? GUEST_GRACE_MS : 0;
    let lastTick = Date.now();

    const id = setInterval(() => {
      const now = Date.now();
      // 일시정지 중에는 마감을 그만큼 뒤로 밀어 남은 시간을 동결
      if (pausedRef.current) {
        deadlineRef.current += now - lastTick;
        lastTick = now;
        return;
      }
      lastTick = now;

      setTick({ key: windowKey, ms: Math.max(0, deadlineRef.current - now) });

      if (
        now >= deadlineRef.current + grace &&
        shouldEnforce(role, timedActor) &&
        firedRef.current !== windowKey
      ) {
        firedRef.current = windowKey; // 창당 1회만 발화
        onTimeoutRef.current(timedActor);
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [windowKey, timedActor, role]);

  // 창이 열려 있는데 아직 첫 틱 전이면 만시간(TURN_TIME_MS)으로 표시
  const remainingMs = windowKey
    ? tick && tick.key === windowKey
      ? tick.ms
      : TURN_TIME_MS
    : null;

  return { timedActor, remainingMs };
}
