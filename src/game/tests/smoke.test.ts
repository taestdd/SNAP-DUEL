import { describe, it, expect } from "vitest";
import { getCard } from "@/game/engine/cards";
import { CHARACTERS } from "@/game/engine/characters";
import { makeState } from "./fixtures";

/** Phase 0 스캐폴딩 동작 확인 — 픽스처가 레지스트리를 채우고 상태를 만든다. */
describe("scaffolding smoke", () => {
  it("합성 카드 레지스트리가 주입된다", () => {
    expect(getCard("jab")?.groundAttack).toBe(5);
    expect(getCard("uppercut")?.antiAirAttack).toBe(6);
  });

  it("합성 캐릭터 레지스트리가 주입된다", () => {
    expect(CHARACTERS["p1_main"]?.maxHp).toBe(30);
  });

  it("makeState가 기본 상태를 만든다", () => {
    const s = makeState({ P1: { queue: ["jab"] } });
    expect(s.phase).toBe("RESOLVE");
    expect(s.P1.hp).toBe(30);
    expect(s.P1.queue).toEqual(["jab"]);
    expect(s.AI.queue).toEqual([]);
  });
});
