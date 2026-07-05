import { describe, it, expect } from "vitest";
import { detectTransitions } from "@/hooks/useGameTransitions";
import { makeState } from "./fixtures";

describe("detectTransitions", () => {
  it("변화가 없으면 빈 배열", () => {
    const s = makeState();
    expect(detectTransitions(s, makeState())).toEqual([]);
  });

  it("phase 전환을 감지한다", () => {
    const prev = makeState({ phase: "SETUP_INIT" });
    const next = makeState({ phase: "RESOLVE" });
    expect(detectTransitions(prev, next)).toContainEqual({ type: "phase", from: "SETUP_INIT", to: "RESOLVE" });
  });

  it("round 전환을 감지한다", () => {
    const prev = makeState({ round: 1 });
    const next = makeState({ round: 2 });
    expect(detectTransitions(prev, next)).toContainEqual({ type: "round", from: 1, to: 2 });
  });

  it("캐릭터 교체를 플레이어별로 감지한다", () => {
    const prev = makeState();
    const next = makeState({ P1: { activeCharacter: "p1_sub", characters: ["p1_main", "p1_sub"] } });
    expect(detectTransitions(prev, next)).toEqual([
      { type: "characterSwitch", player: "P1", from: "p1_main", to: "p1_sub" },
    ]);
  });

  it("착지: 턴 전진 + airborne 1→0일 때만 감지", () => {
    const airborne = makeState({ turn: 1, P1: { airborneStack: 1 } });
    const landed = makeState({ turn: 2, P1: { airborneStack: 0 } });
    expect(detectTransitions(airborne, landed)).toContainEqual({ type: "landing", player: "P1" });

    // 턴이 그대로면(태그로 인한 airborne 리셋 등) 착지 아님
    const sameTurn = makeState({ turn: 1, P1: { airborneStack: 0 } });
    expect(detectTransitions(airborne, sameTurn)).toEqual([]);

    // 2→1 감소는 아직 공중 — 착지 아님
    const stillAir = makeState({ turn: 2, P1: { airborneStack: 1 } });
    const from2 = makeState({ turn: 1, P1: { airborneStack: 2 } });
    expect(detectTransitions(from2, stillAir)).toEqual([]);
  });

  it("동시 다중 전환을 모두 반환한다 (라운드 전환 = phase+round)", () => {
    const prev = makeState({ round: 1, phase: "TURN_END" });
    const next = makeState({ round: 2, phase: "ROUND_DRAFT" });
    const out = detectTransitions(prev, next);
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.type).sort()).toEqual(["phase", "round"]);
  });
});
