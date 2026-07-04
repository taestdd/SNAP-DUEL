import { describe, it, expect } from "vitest";
import { shouldTag } from "@/game/engine/ai";
import { makeState } from "./fixtures";

describe("shouldTag", () => {
  it("벤치 HP가 현재보다 높으면 태그 권장", () => {
    const s = makeState({ P1: { hp: 10, characterHp: { p1_main: 10, p1_sub: 25 } } });
    expect(shouldTag(s, "P1")).toBe(true);
  });
  it("벤치 HP가 낮거나 0이면 태그 안 함", () => {
    expect(shouldTag(makeState({ P1: { hp: 25, characterHp: { p1_main: 25, p1_sub: 10 } } }), "P1")).toBe(false);
    expect(shouldTag(makeState({ P1: { hp: 10, characterHp: { p1_main: 10, p1_sub: 0 } } }), "P1")).toBe(false);
  });
  it("airborne이 2 이상이면 벤치 HP와 무관하게 태그 안 함", () => {
    const s = makeState({ P1: { hp: 10, airborneStack: 2, characterHp: { p1_main: 10, p1_sub: 25 } } });
    expect(shouldTag(s, "P1")).toBe(false);
    // airborne 1이면 태그 가능
    const s1 = makeState({ P1: { hp: 10, airborneStack: 1, characterHp: { p1_main: 10, p1_sub: 25 } } });
    expect(shouldTag(s1, "P1")).toBe(true);
  });
});
