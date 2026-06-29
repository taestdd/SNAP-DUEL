import { describe, it, expect } from "vitest";
import { deriveCardStats, applyCardEffectsWithPause } from "@/game/engine/effects";
import { registerCards } from "@/game/engine/cards";
import type { PlayerId } from "@/game/engine/types";
import { makeState } from "./fixtures";

/* ── 합성 데이터 ──────────────────────────────────────────────────────── */
registerCards({
  // ground_attack +3 보정 (항상 발동)
  cs_buff_ga: { id: "cs_buff_ga", name: "Buff GA", cardType: "attack", cost: 0, speed: 3, groundAttack: 2, gain: 0, effects: [], text: "",
    statModifiers: [{ condition: { check: "hand_count", target: "self", op: "<", value: 99 }, stat: "ground_attack", delta: 3 }] },
  // gain +1 보정
  cs_buff_gain: { id: "cs_buff_gain", name: "Buff Gain", cardType: "attack", cost: 0, speed: 2, groundAttack: 4, gain: 1, effects: [], text: "",
    statModifiers: [{ condition: { check: "hand_count", target: "self", op: "<", value: 99 }, stat: "gain", delta: 1 }] },
});

function apply(state: ReturnType<typeof makeState>, player: PlayerId, cardId: string) {
  return applyCardEffectsWithPause(state, player, cardId, [], 0, [player]);
}

/* ── deriveCardStats ──────────────────────────────────────────────────── */
describe("deriveCardStats", () => {
  it("base 스탯 (버프 없음)", () => {
    // jab: speed 2, groundAttack 5
    const s = deriveCardStats(makeState(), "P1", "jab");
    expect(s).toMatchObject({ cost: 0, speed: 2, groundAttack: 5, antiAirAttack: 0, gain: 0 });
  });

  it("attackBuff가 지상·대공 공격력에 합산된다 (표시 누락 버그 수정)", () => {
    // jab(ga5) + attackBuff 3 → 8
    const jab = deriveCardStats(makeState({ P1: { status: { attackBuff: 3 } } }), "P1", "jab");
    expect(jab.groundAttack).toBe(8);
    // uppercut(aa6) + attackBuff 3 → 9
    const upper = deriveCardStats(makeState({ P1: { status: { attackBuff: 3 } } }), "P1", "uppercut");
    expect(upper.antiAirAttack).toBe(9);
  });

  it("speedBonus가 속도에 반영된다 (낮을수록 빠름)", () => {
    // jab(speed 2) - speedBonus 1 → 1
    const s = deriveCardStats(makeState({ P1: { status: { speedBonus: 1 } } }), "P1", "jab");
    expect(s.speed).toBe(1);
  });

  it("statModifiers 공격력 보정이 반영된다", () => {
    // cs_buff_ga: base 2 + mod 3 → 5
    const s = deriveCardStats(makeState(), "P1", "cs_buff_ga");
    expect(s.groundAttack).toBe(5);
  });

  it("statModifiers + attackBuff가 함께 합산된다", () => {
    // cs_buff_ga: base 2 + mod 3 + attackBuff 4 → 9
    const s = deriveCardStats(makeState({ P1: { status: { attackBuff: 4 } } }), "P1", "cs_buff_ga");
    expect(s.groundAttack).toBe(9);
  });

  it("gain 보정이 반영된다", () => {
    // cs_buff_gain: base 1 + mod 1 → 2
    const s = deriveCardStats(makeState(), "P1", "cs_buff_gain");
    expect(s.gain).toBe(2);
  });

  it("존재하지 않는 카드는 0 스탯", () => {
    expect(deriveCardStats(makeState(), "P1", "nope")).toEqual({ cost: 0, speed: 0, groundAttack: 0, antiAirAttack: 0, gain: 0 });
  });
});

/* ── 표시===전투 정합성 ───────────────────────────────────────────────── */
describe("정합성: deriveCardStats 공격력 === 실제 적중 데미지", () => {
  it("attackBuff 적용 시 표시 공격력과 실제 데미지가 일치한다", () => {
    const state = makeState({ P1: { status: { attackBuff: 3 } } });
    const shown = deriveCardStats(state, "P1", "jab").groundAttack; // 8
    const after = apply(state, "P1", "jab");
    expect(30 - after.AI.hp).toBe(shown); // 실제 데미지 == 표시값
  });

  it("statModifiers 적용 시 표시 공격력과 실제 데미지가 일치한다", () => {
    const state = makeState();
    const shown = deriveCardStats(state, "P1", "cs_buff_ga").groundAttack; // 5
    const after = apply(state, "P1", "cs_buff_ga");
    expect(30 - after.AI.hp).toBe(shown);
  });
});
