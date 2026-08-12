import { describe, it, expect } from "vitest";
import { deriveCardStats, applyCardEffectsWithPause } from "@/game/engine/effects";
import { registerCards } from "@/game/engine/cards";
import type { PlayerId } from "@/game/engine/types";
import { makeState } from "./fixtures";

/* ── 합성 데이터 ──────────────────────────────────────────────────────── */
registerCards({
  // ground_attack +3 보정 (항상 발동)
  cs_buff_ga: { id: "cs_buff_ga", name: "Buff GA", cardType: "attack", cost: 0, delay: 3, groundAttack: 2, advantage: 0, effects: [], text: "",
    statModifiers: [{ condition: { check: "hand_count", target: "self", op: "<", value: 99 }, stat: "ground_attack", delta: 3 }] },
  // 지상 0 / 대공 0 — 수치를 전부 버프·보정에서 받는 공격 카드
  cs_zero: { id: "cs_zero", name: "Zero", cardType: "attack", cost: 0, delay: 1, groundAttack: 0, antiAirAttack: 0, advantage: 0, effects: [], text: "" },
  // 지상 전용 (대공 0 = 대공 수단 없음)
  cs_ground_only: { id: "cs_ground_only", name: "Ground Only", cardType: "attack", cost: 0, delay: 1, groundAttack: 5, antiAirAttack: 0, advantage: 0, effects: [], text: "" },
  // 0/0에 ground_attack만 열어 주는 버프를 거는 스킬
  cs_open_ground: {
    id: "cs_open_ground", name: "Open Ground", cardType: "skill", cost: 0, delay: 1, advantage: 0, text: "",
    effects: [{ type: "buff", target: "self", stat: "ground_attack", value: 2, buffDuration: { type: "turns", value: 3 } }],
  },
  // advantage +1 보정
  cs_buff_advantage: { id: "cs_buff_advantage", name: "Buff Advantage", cardType: "attack", cost: 0, delay: 2, groundAttack: 4, advantage: 1, effects: [], text: "",
    statModifiers: [{ condition: { check: "hand_count", target: "self", op: "<", value: 99 }, stat: "advantage", delta: 1 }] },
});

function apply(state: ReturnType<typeof makeState>, player: PlayerId, cardId: string) {
  return applyCardEffectsWithPause(state, player, cardId, [], 0, [player]);
}

/* ── deriveCardStats ──────────────────────────────────────────────────── */
describe("deriveCardStats", () => {
  it("base 스탯 (버프 없음)", () => {
    // jab: delay 2, groundAttack 5
    const s = deriveCardStats(makeState(), "P1", "jab");
    expect(s).toMatchObject({ cost: 0, delay: 2, groundAttack: 5, antiAirAttack: 0, advantage: 0 });
  });

  it("attackBuff가 지상·대공 공격력에 합산된다 (표시 누락 버그 수정)", () => {
    // jab(ga5) + attackBuff 3 → 8
    const jab = deriveCardStats(makeState({ P1: { status: { attackBuff: 3 } } }), "P1", "jab");
    expect(jab.groundAttack).toBe(8);
    // uppercut(aa6) + attackBuff 3 → 9
    const upper = deriveCardStats(makeState({ P1: { status: { attackBuff: 3 } } }), "P1", "uppercut");
    expect(upper.antiAirAttack).toBe(9);
  });

  it("delayAdvantage가 속도에 반영된다 (낮을수록 빠름)", () => {
    // jab(delay 2) - delayAdvantage 1 → 1
    const s = deriveCardStats(makeState({ P1: { status: { delayAdvantage: 1 } } }), "P1", "jab");
    expect(s.delay).toBe(1);
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

  it("advantage 보정이 반영된다", () => {
    // cs_buff_advantage: base 1 + mod 1 → 2
    const s = deriveCardStats(makeState(), "P1", "cs_buff_advantage");
    expect(s.advantage).toBe(2);
  });

  it("존재하지 않는 카드는 0 스탯", () => {
    expect(deriveCardStats(makeState(), "P1", "nope")).toEqual({ cost: 0, delay: 0, groundAttack: 0, antiAirAttack: 0, advantage: 0 });
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

/* ── 0 = "그 공격 수단 없음" 규칙 ────────────────────────────────────────
 * attackBuff는 스탯을 가리지 않으므로 없던 수단을 새로 열지 않는다.
 * 양쪽 다 0인 카드만 예외로 "수치를 밖에서 받는 카드"로 보고 양쪽에 적용한다.
 */
describe("attackBuff와 공격 수단(0)의 관계", () => {
  it("0/0 공격 카드는 attackBuff로 지상·대공 양쪽 다 때린다", () => {
    const state = makeState({ P1: { status: { attackBuff: 1 } } });
    const shown = deriveCardStats(state, "P1", "cs_zero");
    expect(shown).toMatchObject({ groundAttack: 1, antiAirAttack: 1 });

    // 지상 상대
    expect(30 - apply(state, "P1", "cs_zero").AI.hp).toBe(1);
    // 체공 상대
    const air = makeState({ P1: { status: { attackBuff: 1 } }, AI: { airborneStack: 1 } });
    expect(30 - apply(air, "P1", "cs_zero").AI.hp).toBe(1);
  });

  it("attackBuff가 없으면 0/0 카드는 그대로 아무것도 못 한다", () => {
    const state = makeState();
    expect(deriveCardStats(state, "P1", "cs_zero").groundAttack).toBe(0);
    expect(apply(state, "P1", "cs_zero").AI.hp).toBe(30);
  });

  it("지상 전용 카드는 attackBuff를 받아도 체공 상대를 때리지 못한다", () => {
    const state = makeState({ P1: { status: { attackBuff: 3 } }, AI: { airborneStack: 1 } });
    // 대공은 열리지 않는다 — 표시도 0
    expect(deriveCardStats(state, "P1", "cs_ground_only").antiAirAttack).toBe(0);
    expect(apply(state, "P1", "cs_ground_only").AI.hp).toBe(30);
  });

  it("지상 전용 카드의 지상 공격력은 attackBuff만큼 오른다", () => {
    const state = makeState({ P1: { status: { attackBuff: 3 } } });
    const shown = deriveCardStats(state, "P1", "cs_ground_only").groundAttack;
    expect(shown).toBe(8);
    expect(30 - apply(state, "P1", "cs_ground_only").AI.hp).toBe(shown);
  });

  it("buff 효과로 수단을 특정하면 그 수단만 열린다", () => {
    // 0/0 카드에 ground_attack만 +2 → 지상은 때리지만 대공은 여전히 0
    const state = apply(makeState(), "P1", "cs_open_ground");
    const shown = deriveCardStats(state, "P1", "cs_zero");
    expect(shown).toMatchObject({ groundAttack: 2, antiAirAttack: 0 });

    const air = { ...state, AI: { ...state.AI, airborneStack: 1 } };
    expect(apply(air, "P1", "cs_zero").AI.hp).toBe(30);
  });

  it("스킬 카드는 attackBuff가 있어도 공격력이 0으로 표시된다", () => {
    const state = makeState({ P1: { status: { attackBuff: 5 } } });
    expect(deriveCardStats(state, "P1", "cs_open_ground")).toMatchObject({ groundAttack: 0, antiAirAttack: 0 });
  });
});
