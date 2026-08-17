import { describe, it, expect } from "vitest";
import { shouldTag, oppFastestAttackDelay, dealsDamage } from "@/game/engine/ai";
import { getCard } from "@/game/engine/cards";
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

/**
 * Claude 상대 모드의 "카운터 확정" 경고(route.ts fmtHand)가 이 함수를 그대로 쓴다 —
 * 로컬 규칙 AI가 회피하는 카운터 위험과 정확히 같은 기준으로 판단해야 하므로
 * 여기 동작이 곧 그 경고의 정확성을 보장한다.
 */
describe("oppFastestAttackDelay", () => {
  it("상대 큐에 공격 카드가 있으면 그 delay(delayAdvantage 반영)를 반환한다", () => {
    const s = makeState({ AI: { queue: ["jab"], status: { delayAdvantage: 1 } } });
    expect(oppFastestAttackDelay(s, "P1")).toBe(1); // jab delay 2 - 보너스 1
  });

  it("상대 큐가 공격 카드가 아니면(guard) 위협 없음(Infinity)", () => {
    const s = makeState({ AI: { queue: ["guard"] } });
    expect(oppFastestAttackDelay(s, "P1")).toBe(Infinity);
  });

  it("상대가 ready(패스 완료)면 위협 없음", () => {
    const s = makeState({ AI: { queue: [], ready: true } });
    expect(oppFastestAttackDelay(s, "P1")).toBe(Infinity);
  });

  it("상대 손패가 없거나 exhausted면 위협 없음", () => {
    expect(oppFastestAttackDelay(makeState({ AI: { queue: [], ready: false, hand: [] } }), "P1")).toBe(Infinity);
    expect(oppFastestAttackDelay(
      makeState({ AI: { queue: [], ready: false, hand: ["jab"], status: { exhausted: true } } }), "P1",
    )).toBe(Infinity);
  });

  it("상대가 아직 미결정이고 손패가 있으면 최악의 경우(게임 내 최속 공격)를 가정한다", () => {
    const s = makeState({ AI: { queue: [], ready: false, hand: ["jab"] } });
    expect(oppFastestAttackDelay(s, "P1")).toBeLessThan(Infinity);
  });
});

describe("dealsDamage", () => {
  it("실효 공격 스탯이 있으면 true", () => {
    const s = makeState();
    expect(dealsDamage(s, "P1", getCard("jab")!)).toBe(true);
    expect(dealsDamage(s, "P1", getCard("uppercut")!)).toBe(true); // 대공만 있어도 true
  });
  it("공격 스탯도 damage 효과도 없으면 false", () => {
    const s = makeState();
    expect(dealsDamage(s, "P1", getCard("guard")!)).toBe(false);
  });
});
