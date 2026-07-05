import { describe, it, expect } from "vitest";
import { flipState } from "@/lib/flipState";
import { makeState } from "./fixtures";

describe("flipState (게스트 뷰 P1↔AI 교환)", () => {
  it("컴배턴트·initiative·winner를 교환한다", () => {
    const s = flipState(makeState({ initiative: "AI", winner: "P1", P1: { hp: 11 }, AI: { hp: 22 } }));
    expect(s.P1.hp).toBe(22);
    expect(s.AI.hp).toBe(11);
    expect(s.P1.id).toBe("P1");
    expect(s.AI.id).toBe("AI");
    expect(s.initiative).toBe("P1");
    expect(s.winner).toBe("AI");
  });

  it("animStartHp를 교환한다 (게스트 HP바 스왑 버그 회귀 방지)", () => {
    const s = flipState(makeState({ animStartHp: { P1: 30, AI: 7 } }));
    expect(s.animStartHp).toEqual({ P1: 7, AI: 30 });
    // null이면 그대로
    expect(flipState(makeState({ animStartHp: null })).animStartHp).toBeNull();
  });

  it("animScript의 actor와 hpAfter를 함께 교환한다", () => {
    const s = flipState(makeState({
      animScript: [{
        actor: "P1",
        cardId: "jab",
        actorAirborne: 0,
        targetAirborne: 0,
        hpAfter: { P1: 30, AI: 25 },
        cancelledPlayer: "AI",
        comboHolder: "P1",
      }],
    }));
    expect(s.animScript[0].actor).toBe("AI");
    expect(s.animScript[0].hpAfter).toEqual({ P1: 25, AI: 30 });
    expect(s.animScript[0].cancelledPlayer).toBe("P1");
    expect(s.animScript[0].comboHolder).toBe("AI");
  });

  it("두 번 뒤집으면 HP 관련 필드가 원상 복귀한다", () => {
    const base = makeState({
      animStartHp: { P1: 12, AI: 34 },
      P1: { hp: 12 },
      AI: { hp: 34 },
    });
    const twice = flipState(flipState(base));
    expect(twice.P1.hp).toBe(base.P1.hp);
    expect(twice.AI.hp).toBe(base.AI.hp);
    expect(twice.animStartHp).toEqual(base.animStartHp);
  });
});
