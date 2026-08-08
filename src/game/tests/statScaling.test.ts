import { describe, it, expect } from "vitest";
import { deriveCardStats, applyCardEffectsWithPause } from "@/game/engine/effects";
import { getEffectiveDelay } from "@/game/engine/stateHelpers";
import { selectCard } from "@/game/engine/ai";
import { registerCards } from "@/game/engine/cards";
import { CardSchema } from "@/game/engine/cardSchema";
import type { PlayerId } from "@/game/engine/types";
import { makeState } from "./fixtures";

/**
 * 비례 스탯 보정(ScalingModifier).
 *
 *   delta = clamp(trunc((source - baseline) * perUnit / divisor), min, max)
 *
 * 소스 값은 **리졸브 시점**에 다시 읽는다. 핸드 표시(deriveCardStats)와
 * 전투 해결(applyAttackStats)이 같은 evaluateModifiers를 쓰므로,
 * 같은 상태에서는 표시와 실제 데미지가 반드시 일치해야 한다.
 */

/* ── 합성 카드 ──────────────────────────────────────────────────────────
 * 전부 base groundAttack 0 → 보정값이 그대로 공격력이 되어 검산이 쉽다. */
registerCards({
  // 상대 손패 1장당 +1
  sc_hand: {
    id: "sc_hand", name: "Hand Scale", cardType: "attack", cost: 0, delay: 3,
    groundAttack: 0, advantage: 0, effects: [], text: "",
    statModifiers: [{
      mode: "scaling", source: { check: "hand_count", target: "enemy" },
      stat: "ground_attack", perUnit: 1,
    }],
  },
  // 상대 손패 2장당 +1 (버림)
  sc_divisor: {
    id: "sc_divisor", name: "Divisor Scale", cardType: "attack", cost: 0, delay: 3,
    groundAttack: 0, advantage: 0, effects: [], text: "",
    statModifiers: [{
      mode: "scaling", source: { check: "hand_count", target: "enemy" },
      stat: "ground_attack", perUnit: 1, divisor: 2,
    }],
  },
  // 상대 손패 3장 초과분만큼 +1 (하한 0 → 3장 이하에서 감소하지 않음)
  sc_baseline: {
    id: "sc_baseline", name: "Baseline Scale", cardType: "attack", cost: 0, delay: 3,
    groundAttack: 0, advantage: 0, effects: [], text: "",
    statModifiers: [{
      mode: "scaling", source: { check: "hand_count", target: "enemy" },
      stat: "ground_attack", perUnit: 1, baseline: 3, min: 0,
    }],
  },
  // 상한 4
  sc_capped: {
    id: "sc_capped", name: "Capped Scale", cardType: "attack", cost: 0, delay: 3,
    groundAttack: 0, advantage: 0, effects: [], text: "",
    statModifiers: [{
      mode: "scaling", source: { check: "hand_count", target: "enemy" },
      stat: "ground_attack", perUnit: 1, max: 4,
    }],
  },
  // base 2 + 자기 손패 1장당 -1 (역스케일링, 최종 스탯은 0 하한)
  sc_inverse: {
    id: "sc_inverse", name: "Inverse Scale", cardType: "attack", cost: 0, delay: 3,
    groundAttack: 2, advantage: 0, effects: [], text: "",
    statModifiers: [{
      mode: "scaling", source: { check: "hand_count", target: "self" },
      stat: "ground_attack", perUnit: -1,
    }],
  },
  // 딜레이도 비례 보정 대상 — 자기 덱 2장당 -1
  sc_delay: {
    id: "sc_delay", name: "Delay Scale", cardType: "attack", cost: 0, delay: 5,
    groundAttack: 1, advantage: 0, effects: [], text: "",
    statModifiers: [{
      mode: "scaling", source: { check: "deck_count", target: "self" },
      stat: "delay", perUnit: -1, divisor: 2,
    }],
  },
  // 기존 방식(mode 없음) — 하위 호환 확인용
  sc_legacy: {
    id: "sc_legacy", name: "Legacy Threshold", cardType: "attack", cost: 0, delay: 3,
    groundAttack: 1, advantage: 0, effects: [], text: "",
    statModifiers: [{
      condition: { check: "hand_count", target: "enemy", op: ">", value: 2 },
      stat: "ground_attack", delta: 3,
    }],
  },
});

/** AI 손패를 n장으로 만든 상태 */
function withEnemyHand(n: number) {
  return makeState({ AI: { hand: Array(n).fill("jab") } });
}

function apply(state: ReturnType<typeof makeState>, player: PlayerId, cardId: string) {
  return applyCardEffectsWithPause(state, player, cardId, [], 0, [player]);
}

/* ── 기본 비례 ────────────────────────────────────────────────────────── */
describe("비례 보정 — perUnit", () => {
  it("상대 손패 1장당 +1 (손패 5장 → 공격력 5)", () => {
    expect(deriveCardStats(withEnemyHand(5), "P1", "sc_hand").groundAttack).toBe(5);
  });

  it("소스가 0이면 보정도 0", () => {
    expect(deriveCardStats(withEnemyHand(0), "P1", "sc_hand").groundAttack).toBe(0);
  });

  it("소스가 변하면 보정도 따라 변한다 (리졸브 시점 재평가)", () => {
    expect(deriveCardStats(withEnemyHand(2), "P1", "sc_hand").groundAttack).toBe(2);
    expect(deriveCardStats(withEnemyHand(7), "P1", "sc_hand").groundAttack).toBe(7);
  });
});

/* ── 나눗셈 ───────────────────────────────────────────────────────────── */
describe("비례 보정 — divisor (N단위당)", () => {
  it("2장당 +1 — 홀수는 버림", () => {
    expect(deriveCardStats(withEnemyHand(4), "P1", "sc_divisor").groundAttack).toBe(2);
    expect(deriveCardStats(withEnemyHand(5), "P1", "sc_divisor").groundAttack).toBe(2);
    expect(deriveCardStats(withEnemyHand(6), "P1", "sc_divisor").groundAttack).toBe(3);
  });

  it("나눗셈은 딜레이에도 적용된다 (덱 2장당 -1)", () => {
    // 덱 7장 → trunc(7 * -1 / 2) = -3 → delay 5 - 3 = 2
    const s = makeState({ P1: { deck: Array(7).fill("jab") } });
    expect(getEffectiveDelay(s, "P1", "sc_delay")).toBe(2);
    expect(deriveCardStats(s, "P1", "sc_delay").delay).toBe(2);
  });
});

/* ── 기준선 / 상하한 ──────────────────────────────────────────────────── */
describe("비례 보정 — baseline / min / max", () => {
  it("기준선 초과분만 반영된다", () => {
    expect(deriveCardStats(withEnemyHand(6), "P1", "sc_baseline").groundAttack).toBe(3);
    expect(deriveCardStats(withEnemyHand(3), "P1", "sc_baseline").groundAttack).toBe(0);
  });

  it("하한(min 0)이 기준선 미만에서의 마이너스를 막는다", () => {
    // baseline 3, 손패 1 → (1-3)*1 = -2 이지만 min 0으로 클램프
    expect(deriveCardStats(withEnemyHand(1), "P1", "sc_baseline").groundAttack).toBe(0);
  });

  it("상한(max)이 폭주를 막는다", () => {
    expect(deriveCardStats(withEnemyHand(3), "P1", "sc_capped").groundAttack).toBe(3);
    expect(deriveCardStats(withEnemyHand(9), "P1", "sc_capped").groundAttack).toBe(4);
  });

  it("음수 perUnit은 소스가 클수록 약해지고, 최종 스탯은 0 하한", () => {
    // base 2 + (자기 손패 1장 × -1) = 1
    const one = makeState({ P1: { hand: ["jab"] } });
    expect(deriveCardStats(one, "P1", "sc_inverse").groundAttack).toBe(1);
    // base 2 + (자기 손패 5장 × -1) = -3 → 0
    const five = makeState({ P1: { hand: Array(5).fill("jab") } });
    expect(deriveCardStats(five, "P1", "sc_inverse").groundAttack).toBe(0);
  });
});

/* ── 표시 === 전투 데미지 (핵심 정합성) ───────────────────────────────── */
describe("표시 === 실제 데미지", () => {
  it.each([
    ["sc_hand", 5],
    ["sc_divisor", 5],
    ["sc_baseline", 6],
    ["sc_capped", 9],
    ["sc_legacy", 4],
  ])("%s: 핸드 표시 공격력과 실제 HP 감소가 같다 (상대 손패 %i장)", (cardId, handSize) => {
    const state = withEnemyHand(handSize);
    const shown = deriveCardStats(state, "P1", cardId as string).groundAttack;

    const before = state.AI.hp;
    const after = apply(state, "P1", cardId as string).AI.hp;

    expect(before - after).toBe(shown);
  });

  it("attackBuff와 비례 보정이 함께 걸려도 표시와 데미지가 일치한다", () => {
    const state = makeState({
      AI: { hand: Array(4).fill("jab") },
      P1: { status: { attackBuff: 2 } },
    });
    const shown = deriveCardStats(state, "P1", "sc_hand").groundAttack;
    expect(shown).toBe(6); // 손패 4 + 버프 2

    expect(state.AI.hp - apply(state, "P1", "sc_hand").AI.hp).toBe(shown);
  });
});

/* ── AI 평가 (판정===집행 정합성) ─────────────────────────────────────── */
describe("AI가 비례 보정을 실효 스탯으로 평가한다", () => {
  it("base 공격력 0인 비례 카드도 공격 카드로 인지해 선택한다", () => {
    // 핸드에 비례 카드 하나뿐 → 상대 손패가 많으면 강력한 공격이므로 패스하지 않아야 한다.
    // (base만 봤다면 groundAttack 0 = 아이템 카드로 오판)
    const state = makeState({
      AI: { hand: ["sc_hand"], deck: Array(5).fill("jab") },
      P1: { hand: Array(7).fill("jab") },
      initiative: "AI",
      phase: "SETUP_INIT",
    });

    const picked = selectCard(state, "AI");
    expect(picked?.id).toBe("sc_hand");
    // 실효 공격력 = 상대 손패 7
    expect(deriveCardStats(state, "AI", "sc_hand").groundAttack).toBe(7);
  });

  it("상대 손패가 많을수록 비례 카드를 더 높게 평가한다", () => {
    const withHand = (n: number) => makeState({
      AI: { hand: ["sc_hand", "jab"], deck: Array(5).fill("jab") },
      P1: { hand: Array(n).fill("jab") },
      initiative: "AI",
      phase: "SETUP_INIT",
    });

    // 상대 손패 1장 → 비례 카드 공격력 1 < jab 5 → jab 선택
    expect(selectCard(withHand(1), "AI")?.id).toBe("jab");
    // 상대 손패 9장 → 비례 카드 공격력 9 > jab 5 → 비례 카드 선택
    expect(selectCard(withHand(9), "AI")?.id).toBe("sc_hand");
  });
});

/* ── 하위 호환 ────────────────────────────────────────────────────────── */
describe("기존 임계값 보정 하위 호환", () => {
  it("mode 없는 보정은 threshold로 동작한다", () => {
    // 손패 4장 > 2 → +3, base 1 → 4
    expect(deriveCardStats(withEnemyHand(4), "P1", "sc_legacy").groundAttack).toBe(4);
    // 손패 2장은 조건 미달 → base 1 그대로
    expect(deriveCardStats(withEnemyHand(2), "P1", "sc_legacy").groundAttack).toBe(1);
  });

  it("스키마가 구/신 보정을 모두 파싱한다", () => {
    const legacy = {
      id: "x", name: "X", cost: 0, delay: 1, advantage: 0, effects: [], text: "",
      statModifiers: [{ condition: { check: "hand_count", target: "self", op: "<", value: 3 }, stat: "delay", delta: -1 }],
    };
    const scaling = {
      id: "y", name: "Y", cost: 0, delay: 1, advantage: 0, effects: [], text: "",
      statModifiers: [{ mode: "scaling", source: { check: "hand_count", target: "enemy" }, stat: "ground_attack", perUnit: 1, max: 6 }],
    };

    expect(CardSchema.safeParse(legacy).success).toBe(true);
    expect(CardSchema.safeParse(scaling).success).toBe(true);
  });

  it("divisor 0 이하는 스키마가 거부한다", () => {
    const bad = {
      id: "z", name: "Z", cost: 0, delay: 1, advantage: 0, effects: [], text: "",
      statModifiers: [{ mode: "scaling", source: { check: "hand_count", target: "enemy" }, stat: "ground_attack", perUnit: 1, divisor: 0 }],
    };
    expect(CardSchema.safeParse(bad).success).toBe(false);
  });
});
