import { describe, it, expect } from "vitest";
import {
  advanceTimer,
  TURN_TIME_MS,
  GUEST_GRACE_MS,
  type TimerState,
} from "@/hooks/useTurnTimer";

/**
 * 타이머 시간 흐름 검증 — advanceTimer를 100ms 틱으로 반복 호출해
 * "실제로 20초 뒤 발화하는가 / grace가 붙는가 / 일시정지 중 동결되는가 /
 *  창당 1회만 쏘는가"를 명시적 시각값으로 시뮬레이션한다.
 * (React·real timer 없이 순수 함수만으로 wall-clock 동작을 재현)
 */

const TICK_MS = 100;

type SimOptions = {
  grace?: number;
  enforce?: boolean;
  fireKey?: string;
  /** now(ms) → paused 여부 */
  pausedAt?: (elapsed: number) => boolean;
};

/** start부터 durationMs까지 100ms 간격으로 틱을 돌려 발화 시점/최종 상태를 수집한다. */
function simulate(durationMs: number, opts: SimOptions = {}) {
  const { grace = 0, enforce = true, fireKey = "w:P1", pausedAt = () => false } = opts;
  const start = 1_000_000; // 임의의 epoch 기준
  let state: TimerState = { deadline: start + TURN_TIME_MS, lastTick: start, firedKey: null };

  const fires: number[] = []; // 발화한 경과 시각(ms)
  let lastRemaining = TURN_TIME_MS;

  for (let elapsed = TICK_MS; elapsed <= durationMs; elapsed += TICK_MS) {
    const now = start + elapsed;
    const res = advanceTimer(state, { now, paused: pausedAt(elapsed), grace, enforce, fireKey });
    state = res.next;
    if (res.remainingMs !== null) lastRemaining = res.remainingMs;
    if (res.fire) fires.push(elapsed);
  }

  return { fires, lastRemaining, state };
}

describe("advanceTimer — 20초 만료 발화", () => {
  it("정확히 20초 시점에 1회 발화한다", () => {
    const { fires } = simulate(22_000);
    expect(fires).toHaveLength(1);
    expect(fires[0]).toBe(TURN_TIME_MS); // 20_000ms
  });

  it("20초 전에는 발화하지 않는다", () => {
    const { fires } = simulate(19_900);
    expect(fires).toEqual([]);
  });

  it("발화 후 계속 틱해도 다시 쏘지 않는다 (창당 1회)", () => {
    const { fires } = simulate(40_000);
    expect(fires).toHaveLength(1);
  });
});

describe("advanceTimer — grace (host→게스트 유예)", () => {
  it("grace가 있으면 20초엔 안 쏘고 20+1.5초에 쏜다", () => {
    const { fires } = simulate(23_000, { grace: GUEST_GRACE_MS });
    expect(fires).toHaveLength(1);
    expect(fires[0]).toBe(TURN_TIME_MS + GUEST_GRACE_MS); // 21_500ms
  });

  it("grace 창은 21.4초까지 발화하지 않는다", () => {
    const { fires } = simulate(21_400, { grace: GUEST_GRACE_MS });
    expect(fires).toEqual([]);
  });
});

describe("advanceTimer — enforce=false (게스트 표시 전용)", () => {
  it("강제 대상이 아니면 아무리 지나도 발화하지 않는다", () => {
    const { fires, lastRemaining } = simulate(40_000, { enforce: false });
    expect(fires).toEqual([]);
    expect(lastRemaining).toBe(0); // 카운트다운 표시는 계속 진행돼 0에 도달
  });
});

describe("advanceTimer — 일시정지 동결", () => {
  it("일시정지 구간만큼 발화가 미뤄진다", () => {
    // 5초~15초(10초간) 일시정지 → 실제 발화는 20+10=30초
    const { fires } = simulate(40_000, {
      pausedAt: (e) => e >= 5_000 && e < 15_000,
    });
    expect(fires).toHaveLength(1);
    // 틱 경계(100ms) 오차 허용
    expect(fires[0]).toBeGreaterThanOrEqual(30_000);
    expect(fires[0]).toBeLessThanOrEqual(30_100);
  });

  it("일시정지 틱은 표시를 갱신하지 않는다 (동결)", () => {
    const start = 1_000_000;
    const state: TimerState = { deadline: start + TURN_TIME_MS, lastTick: start + 3_000, firedKey: null };
    const paused = advanceTimer(state, { now: start + 3_100, paused: true, grace: 0, enforce: true, fireKey: "w:P1" });
    expect(paused.remainingMs).toBeNull();
    // 마감은 정지 구간(100ms)만큼 뒤로 밀린다
    expect(paused.next.deadline).toBe(start + TURN_TIME_MS + 100);
  });

  it("동결 불변식: 소비 시간 = 정지 제외 경과 시간", () => {
    // 같은 40초를 (a) 정지 없이 (b) 중간 5초 정지로 각각 돌리면
    // 정지분(5초)만큼 발화가 정확히 미뤄진다.
    const noPause = simulate(40_000).fires[0];
    const withPause = simulate(40_000, { pausedAt: (e) => e >= 6_000 && e < 11_000 }).fires[0];
    expect(withPause - noPause).toBeGreaterThanOrEqual(5_000);
    expect(withPause - noPause).toBeLessThanOrEqual(5_100); // 틱 경계 오차
  });
});

describe("advanceTimer — 카운트다운 값", () => {
  it("경과에 따라 남은 시간이 선형 감소한다", () => {
    const start = 1_000_000;
    const state: TimerState = { deadline: start + TURN_TIME_MS, lastTick: start, firedKey: null };
    const at = (e: number) => advanceTimer(state, { now: start + e, paused: false, grace: 0, enforce: true, fireKey: "w:P1" }).remainingMs;
    expect(at(5_000)).toBe(15_000);
    expect(at(10_000)).toBe(10_000);
    expect(at(19_000)).toBe(1_000);
    expect(at(25_000)).toBe(0); // 마감 후엔 0으로 클램프
  });
});
