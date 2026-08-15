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
 * 시간제약 대상: SETUP 선택 차례 + WAITING_* 결정 대기 + ROUND_DRAFT.
 * 드래프트는 양쪽 동시 선택이므로 미제출자 중 P1을 먼저 반환한다
 * (창 자체는 getWindowKey에서 액터 없이 공유 — 만료 시 순차 강제).
 */
export function getTimedActor(state: GameState): PlayerId | null {
  switch (state.phase) {
    case "SETUP_INIT":
    case "SETUP_OTHER": {
      const actor: PlayerId = isSetupTurnOf(state, "P1") ? "P1" : "AI";
      return state[actor].ready ? null : actor;
    }
    case "ROUND_DRAFT": {
      if (state.draftSelections.P1 === null) return "P1";
      if (state.draftSelections.AI === null) return "AI";
      return null;
    }
    case "WAITING_COST_PAYMENT":
      return state.pendingCostPayment?.player ?? null;
    case "WAITING_SELECTION":
      return state.pendingSelection?.selectingPlayer ?? null;
    case "WAITING_DISCARD":
      return state.pendingDiscard?.player ?? null;
    default:
      return null;
  }
}

/**
 * 결정 창(window) 식별 키 — 키가 바뀌면 새 20초가 시작된다 (순수 함수).
 * 같은 턴 안에서도 페이즈/액터가 바뀌면 새 창으로 취급.
 * 예외: ROUND_DRAFT는 양쪽이 같은 20초를 공유하므로 키에 액터를 넣지 않는다
 * (한쪽 제출로 액터가 바뀌어도 남은 시간이 리셋되지 않음).
 */
export function getWindowKey(state: GameState): string | null {
  const actor = getTimedActor(state);
  if (!actor) return null;
  if (state.phase === "ROUND_DRAFT") return `${state.round}:${state.turn}:ROUND_DRAFT`;
  return `${state.round}:${state.turn}:${state.phase}:${actor}`;
}

/** 이 역할이 이 액터의 만료를 강제해야 하는가 (순수 함수). */
export function shouldEnforce(role: TurnTimerRole, actor: PlayerId): boolean {
  if (role === "guest") return false;
  if (role === "single") return actor === "P1";
  return true; // host: 양쪽 모두
}

/** 타이머의 가변 상태 (interval 클로저가 아니라 순수 함수로 다루기 위해 분리). */
export type TimerState = {
  /** 만료 기준 시각 (epoch ms) */
  deadline: number;
  /** 마지막 틱 시각 — 일시정지 구간을 마감에서 제외하기 위해 기억 */
  lastTick: number;
  /** 이미 만료 발화한 fireKey (창×액터당 1회 보장) */
  firedKey: string | null;
};

export type TimerTickInput = {
  now: number;
  paused: boolean;
  /** 강제 시각에 더할 유예 (host→게스트 전송 지연 보정) */
  grace: number;
  /** shouldEnforce(role, actor) 결과 */
  enforce: boolean;
  /** 이 창×액터의 발화 식별 키 */
  fireKey: string;
};

export type TimerTickResult = {
  next: TimerState;
  /** 표시 갱신값 (일시정지 중이면 null — 남은 시간 동결) */
  remainingMs: number | null;
  /** 이 틱에서 onTimeout을 발화해야 하는가 */
  fire: boolean;
};

/**
 * 타이머 한 틱을 전진시키는 순수 함수 (React·wall-clock 무관).
 * - 일시정지 중: 마감을 경과분만큼 뒤로 밀어 남은 시간을 동결, 발화 없음.
 * - 그 외: 남은 시간을 계산하고, `now >= deadline + grace`이며 강제 대상이고
 *   아직 이 fireKey로 발화 안 했으면 fire=true (그리고 firedKey를 잠금).
 */
export function advanceTimer(prev: TimerState, input: TimerTickInput): TimerTickResult {
  if (input.paused) {
    return {
      next: { ...prev, deadline: prev.deadline + (input.now - prev.lastTick), lastTick: input.now },
      remainingMs: null,
      fire: false,
    };
  }

  const remainingMs = Math.max(0, prev.deadline - input.now);
  const fire =
    input.now >= prev.deadline + input.grace &&
    input.enforce &&
    prev.firedKey !== input.fireKey;

  return {
    next: { deadline: prev.deadline, lastTick: input.now, firedKey: fire ? input.fireKey : prev.firedKey },
    remainingMs,
    fire,
  };
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
    /** 태그 연출 등으로 카운트다운을 잠시 멈춰야 할 때 true */
    paused?: boolean;
    /**
     * 시간제약 사용 여부 (기본 true).
     *
     * false면 창을 아예 열지 않는다 — 카운트다운도, 만료 강제도 없다.
     * 싱글플레이에서 "시간제한 없음"을 고른 경우가 이 경로다.
     * 온라인은 양측이 같은 규칙으로 돌아야 하므로 끄지 않는다.
     */
    enabled?: boolean;
  },
): TurnTimerView {
  const { role, onTimeout, paused = false, enabled = true } = opts;

  // 비활성이면 창 자체가 없다 → 아래 effect들이 전부 조기 반환하고 표시도 null이 된다
  const timedActor = enabled && state ? getTimedActor(state) : null;
  const windowKey = enabled && state ? getWindowKey(state) : null;

  // 카운트다운 표시값 — interval 틱에서만 갱신 (effect 내 동기 setState 회피).
  // 창 키를 함께 저장해 이전 창의 잔여값이 새 창에서 표시되지 않게 한다.
  const [tick, setTick] = useState<{ key: string; ms: number } | null>(null);

  // 최신 클로저 참조 (interval 재구독 없이 onTimeout 갱신)
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onTimeoutRef.current = onTimeout; });

  // 가변 타이머 상태 — 틱 판정은 순수 함수 advanceTimer가 담당 (useTurnTimer.test.ts)
  const timerRef = useRef<TimerState>({ deadline: 0, lastTick: 0, firedKey: null });
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; });
  // 마지막으로 표시에 반영한 초 — 초가 바뀔 때만 setState해 리렌더를 줄인다
  const lastSecRef = useRef(-1);

  // 창 진입 시 마감 설정 — 키에만 종속 (드래프트: 액터가 바뀌어도 창을 공유).
  // firedKey는 유지 (fireKey에 창 키가 포함돼 새 창에서 자연히 재무장된다).
  useEffect(() => {
    if (!windowKey) return;
    const now = Date.now();
    timerRef.current = { ...timerRef.current, deadline: now + TURN_TIME_MS, lastTick: now };
    lastSecRef.current = -1; // 새 창 → 첫 틱에서 강제 표시 갱신
  }, [windowKey]);

  // 카운트다운 + 만료 강제 (100ms 틱). 발화 판정은 매 틱, 표시 갱신은 초 단위.
  useEffect(() => {
    if (!windowKey || !timedActor) return;

    const grace = role === "host" && timedActor === "AI" ? GUEST_GRACE_MS : 0;
    // 드래프트 공유 창에서 양쪽을 각각 1회씩 강제할 수 있도록 액터 단위로 발화 추적
    const fireKey = `${windowKey}:${timedActor}`;
    const enforce = shouldEnforce(role, timedActor);

    const id = setInterval(() => {
      const res = advanceTimer(timerRef.current, {
        now: Date.now(),
        paused: pausedRef.current,
        grace,
        enforce,
        fireKey,
      });
      timerRef.current = res.next;
      if (res.remainingMs !== null) {
        const sec = Math.ceil(res.remainingMs / 1000);
        if (sec !== lastSecRef.current) {
          lastSecRef.current = sec;
          setTick({ key: windowKey, ms: res.remainingMs });
        }
      }
      if (res.fire) onTimeoutRef.current(timedActor);
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
