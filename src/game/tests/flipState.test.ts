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

  it("poisonTicks의 target과 hpAfter를 함께 교환한다", () => {
    const s = flipState(makeState({
      poisonTicks: [{ target: "AI", damage: 3, hpAfter: { P1: 30, AI: 27 } }],
    }));
    expect(s.poisonTicks[0].target).toBe("P1");
    expect(s.poisonTicks[0].hpAfter).toEqual({ P1: 27, AI: 30 });
    expect(s.poisonTicks[0].damage).toBe(3);
  });

  it("animScript의 actor와 hpAfter를 함께 교환한다", () => {
    const s = flipState(makeState({
      animScript: [{
        actor: "P1",
        cardId: "jab",
        actorAirborne: 0,
        targetAirborne: 0,
        hpAfter: { P1: 30, AI: 25 },
        counteredPlayer: "AI",
        comboHolder: "P1",
      }],
    }));
    expect(s.animScript[0].actor).toBe("AI");
    expect(s.animScript[0].hpAfter).toEqual({ P1: 25, AI: 30 });
    expect(s.animScript[0].counteredPlayer).toBe("P1");
    expect(s.animScript[0].comboHolder).toBe("AI");
  });

  it("pendingDiscard의 player를 교환한다 (게스트 자기 버리기 모달 노출용)", () => {
    const s = flipState(makeState({
      pendingDiscard: { player: "AI", count: 2, candidates: ["c0", "c1"] },
    }));
    expect(s.pendingDiscard).toEqual({ player: "P1", count: 2, candidates: ["c0", "c1"] });
    expect(flipState(makeState({ pendingDiscard: null })).pendingDiscard).toBeNull();
  });

  it("turnLog의 P1/AI(카드·손패 포함)를 통째로 교환한다", () => {
    const s = flipState(makeState({
      turnLog: [{
        turn: 1,
        initiative: "P1",
        P1: { card: "jab", countered: false },
        AI: { card: "heavy", countered: true },
        hp: { P1: 30, AI: 20 },
        airborne: { P1: 0, AI: 1 },
        hands: { P1: ["jab", "swift"], AI: ["heavy"] },
      }],
    }));
    expect(s.turnLog[0]).toEqual({
      turn: 1,
      initiative: "AI",
      P1: { card: "heavy", countered: true },
      AI: { card: "jab", countered: false },
      hp: { P1: 20, AI: 30 },
      airborne: { P1: 1, AI: 0 },
      hands: { P1: ["heavy"], AI: ["jab", "swift"] },
    });
  });

  it("turnStartHands를 교환한다", () => {
    const s = flipState(makeState({ turnStartHands: { P1: ["jab"], AI: ["heavy", "swift"] } }));
    expect(s.turnStartHands).toEqual({ P1: ["heavy", "swift"], AI: ["jab"] });
    expect(flipState(makeState({ turnStartHands: null })).turnStartHands).toBeNull();
  });

  it("태그 플래그를 교환한다 — 게스트 Tag 버튼 잠금용", () => {
    const s = flipState(makeState({ p1TaggedThisTurn: false, aiTaggedThisTurn: true }));
    expect(s.p1TaggedThisTurn).toBe(true);  // 게스트(내부 AI)가 태그함 → 게스트 화면에서 잠김
    expect(s.aiTaggedThisTurn).toBe(false);
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
