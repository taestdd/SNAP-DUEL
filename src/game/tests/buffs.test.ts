import { describe, it, expect } from "vitest";
import { applyCardEffectsWithPause, deriveCardStats, getEffectiveCost } from "@/game/engine/effects";
import { applyTagSwitch } from "@/game/engine/effects";
import { beginTurn } from "@/game/engine/turn";
import { getEffectiveDelay } from "@/game/engine/stateHelpers";
import { registerCards, getCard } from "@/game/engine/cards";
import type { Buff, GameState, PlayerId } from "@/game/engine/types";
import { makeState } from "./fixtures";

/**
 * 버프/디버프 시스템.
 *
 * 요구사항:
 *  1. 두 지속 타입 — 턴기반 / 사용기반(필터에 맞는 카드를 쓸 때만 소모)
 *  2. 대상 — 나/적 × 플레이어/캐릭터
 *  3. 캐릭터 스코프는 태그 시 소멸, 플레이어 스코프는 유지
 *  4. 스탯 증감 (음수 = 디버프)
 *  5. 카드 타입·태그·base 스탯 범위로 영향받는 카드 필터링
 */

registerCards({
  // 상대 공격력을 2 깎는 디버프 (2턴)
  bf_weaken: {
    id: "bf_weaken", name: "약화", cardType: "skill", cost: 0, delay: 1, advantage: 0, text: "",
    effects: [{
      type: "buff", target: "enemy", stat: "ground_attack", value: -2,
      buffDuration: { type: "turns", value: 2 },
    }],
  },
  // 내 공격 카드만 +3, 2회 사용 (캐릭터 스코프)
  bf_focus: {
    id: "bf_focus", name: "집중", cardType: "skill", cost: 0, delay: 1, advantage: 0, text: "",
    effects: [{
      type: "buff", target: "self", stat: "ground_attack", value: 3,
      buffScope: "character",
      buffDuration: { type: "uses", value: 2 },
      buffFilter: { cardType: "attack" },
    }],
  },
  // 공안 태그 카드의 코스트 -1 (플레이어 스코프, 3턴)
  bf_logistics: {
    id: "bf_logistics", name: "보급", cardType: "skill", cost: 0, delay: 1, advantage: 0, text: "",
    effects: [{
      type: "buff", target: "self", stat: "cost", value: -1,
      buffScope: "player",
      buffDuration: { type: "turns", value: 3 },
      buffFilter: { tags: ["공안"] },
    }],
  },
  // base 코스트 3 이상 카드의 코스트 -1
  bf_discount: {
    id: "bf_discount", name: "할인", cardType: "skill", cost: 0, delay: 1, advantage: 0, text: "",
    effects: [{
      type: "buff", target: "self", stat: "cost", value: -1,
      buffDuration: { type: "turns", value: 5 },
      buffFilter: { statRange: { stat: "cost", min: 3 } },
    }],
  },

  // 대상 카드들
  bf_atk:   { id: "bf_atk",   name: "공격", cardType: "attack", cost: 1, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "" },
  bf_skill: { id: "bf_skill", name: "스킬", cardType: "skill",  cost: 1, delay: 2, advantage: 0, effects: [], text: "" },
  bf_koan:  { id: "bf_koan",  name: "공안 카드", cardType: "skill", cost: 2, delay: 1, advantage: 0, effects: [], text: "", tags: ["공안"] },
  bf_cheap: { id: "bf_cheap", name: "싼 카드", cardType: "skill", cost: 2, delay: 1, advantage: 0, effects: [], text: "" },
  bf_pricey:{ id: "bf_pricey",name: "비싼 카드", cardType: "skill", cost: 3, delay: 1, advantage: 0, effects: [], text: "" },
});

function apply(state: GameState, player: PlayerId, cardId: string) {
  return applyCardEffectsWithPause(state, player, cardId, [], 0, [player]);
}

const buffsOf = (s: GameState, p: PlayerId) => s[p].status.buffs;

/* ── 1. 스탯 증감 (음수 포함) ─────────────────────────────────────────── */
describe("스탯 증감", () => {
  it("디버프는 상대 공격력을 깎는다", () => {
    const s = apply(makeState({ P1: { queue: ["bf_weaken"] } }), "P1", "bf_weaken");

    expect(buffsOf(s, "AI")).toHaveLength(1);
    expect(buffsOf(s, "P1")).toHaveLength(0);
    // AI의 bf_atk: base 5 - 2 = 3
    expect(deriveCardStats(s, "AI", "bf_atk").groundAttack).toBe(3);
    // 건 사람은 영향 없음
    expect(deriveCardStats(s, "P1", "bf_atk").groundAttack).toBe(5);
  });

  it("여러 버프가 같은 스탯에 걸리면 전부 합산된다", () => {
    let s = apply(makeState({ P1: { queue: ["bf_focus"] } }), "P1", "bf_focus");
    s = apply(s, "P1", "bf_focus");
    expect(buffsOf(s, "P1")).toHaveLength(2);
    expect(deriveCardStats(s, "P1", "bf_atk").groundAttack).toBe(5 + 3 + 3);
  });

  it("최종 스탯은 0 아래로 내려가지 않는다", () => {
    let s = makeState();
    for (let i = 0; i < 5; i++) s = apply(s, "P1", "bf_weaken");
    // 상대에게 -10이 걸려도 0에서 멈춘다
    expect(deriveCardStats(s, "AI", "bf_atk").groundAttack).toBe(0);
  });

  it("코스트·딜레이도 버프 대상이며 실효값 계산에 반영된다", () => {
    const s = apply(makeState({ P1: { queue: ["bf_logistics"] } }), "P1", "bf_logistics");
    // 공안 카드만 코스트 -1
    expect(getEffectiveCost(s, "P1", getCard("bf_koan")!)).toBe(1);
    expect(getEffectiveCost(s, "P1", getCard("bf_cheap")!)).toBe(2);
    // 딜레이는 안 건드렸으므로 그대로
    expect(getEffectiveDelay(s, "P1", "bf_koan")).toBe(1);
  });
});

/* ── 2. 필터 ──────────────────────────────────────────────────────────── */
describe("영향받는 카드 필터", () => {
  it("cardType으로 한정한다", () => {
    const s = apply(makeState({ P1: { queue: ["bf_focus"] } }), "P1", "bf_focus");
    expect(deriveCardStats(s, "P1", "bf_atk").groundAttack).toBe(8);   // 공격 카드 → 적용
    expect(deriveCardStats(s, "P1", "bf_skill").groundAttack).toBe(0); // 스킬 → 미적용
  });

  it("tags는 하나라도 맞으면 적용된다", () => {
    const s = apply(makeState({ P1: { queue: ["bf_logistics"] } }), "P1", "bf_logistics");
    expect(deriveCardStats(s, "P1", "bf_koan").cost).toBe(1);
    expect(deriveCardStats(s, "P1", "bf_cheap").cost).toBe(2);
  });

  it("statRange는 base 스탯으로 판정한다 — 버프가 스스로 조건을 무너뜨리지 않는다", () => {
    let s = apply(makeState({ P1: { queue: ["bf_discount"] } }), "P1", "bf_discount");
    // base cost 3 → 조건 충족 → 2
    expect(deriveCardStats(s, "P1", "bf_pricey").cost).toBe(2);
    // base cost 2 → 미충족
    expect(deriveCardStats(s, "P1", "bf_cheap").cost).toBe(2);

    // 같은 버프를 하나 더 걸어도 base는 여전히 3이라 계속 적용된다 (실효값 기준이면 여기서 끊긴다)
    s = apply(s, "P1", "bf_discount");
    expect(deriveCardStats(s, "P1", "bf_pricey").cost).toBe(1);
  });

  it("필터가 없으면 모든 카드에 적용된다", () => {
    const s = apply(makeState({ P1: { queue: ["bf_weaken"] } }), "P1", "bf_weaken");
    expect(buffsOf(s, "AI")[0].filter).toBeUndefined();
    expect(deriveCardStats(s, "AI", "bf_atk").groundAttack).toBe(3);
  });
});

/* ── 3. 턴기반 지속 ───────────────────────────────────────────────────── */
describe("턴기반 지속", () => {
  it("턴 시작마다 1씩 줄고 0이 되면 사라진다", () => {
    let s = apply(makeState({ phase: "TURN_END", P1: { queue: ["bf_weaken"] } }), "P1", "bf_weaken");
    expect(buffsOf(s, "AI")[0].duration.remaining).toBe(2);

    s = beginTurn({ ...s, phase: "TURN_START" });
    expect(buffsOf(s, "AI")[0].duration.remaining).toBe(1);
    expect(deriveCardStats(s, "AI", "bf_atk").groundAttack).toBe(3); // 아직 유효

    s = beginTurn({ ...s, phase: "TURN_START" });
    expect(buffsOf(s, "AI")).toHaveLength(0);
    expect(deriveCardStats(s, "AI", "bf_atk").groundAttack).toBe(5); // 원복
  });

  it("사용기반 버프는 턴이 지나도 줄지 않는다", () => {
    let s = apply(makeState({ P1: { queue: ["bf_focus"] } }), "P1", "bf_focus");
    s = beginTurn({ ...s, phase: "TURN_START" });
    s = beginTurn({ ...s, phase: "TURN_START" });
    expect(buffsOf(s, "P1")[0].duration.remaining).toBe(2);
  });
});

/* ── 4. 사용기반 지속 ─────────────────────────────────────────────────── */
describe("사용기반 지속", () => {
  it("필터에 맞는 카드를 쓸 때만 줄어든다", () => {
    let s = apply(makeState({ P1: { queue: ["bf_focus"] } }), "P1", "bf_focus");
    expect(buffsOf(s, "P1")[0].duration.remaining).toBe(2);

    // 스킬 카드 사용 — 필터(attack) 불일치라 소모되지 않는다
    s = apply(s, "P1", "bf_skill");
    expect(buffsOf(s, "P1")[0].duration.remaining).toBe(2);

    // 공격 카드 사용 — 1 소모
    s = apply(s, "P1", "bf_atk");
    expect(buffsOf(s, "P1")[0].duration.remaining).toBe(1);

    // 두 번째 공격 — 소진되어 사라진다
    s = apply(s, "P1", "bf_atk");
    expect(buffsOf(s, "P1")).toHaveLength(0);
  });

  it("소모되는 그 카드에는 버프가 아직 적용된다", () => {
    let s = apply(makeState({ P1: { queue: ["bf_focus"] } }), "P1", "bf_focus");
    const before = s.AI.hp;
    // 마지막 1회를 쓰는 순간에도 +3이 실려야 한다 (5+3=8)
    s = { ...s, P1: { ...s.P1, status: { ...s.P1.status, buffs: [{ ...buffsOf(s, "P1")[0], duration: { type: "uses", remaining: 1 } } as Buff] } } };
    s = apply(s, "P1", "bf_atk");
    expect(before - s.AI.hp).toBe(8);
    expect(buffsOf(s, "P1")).toHaveLength(0);
  });
});

/* ── 5. 스코프와 태그 ─────────────────────────────────────────────────── */
describe("스코프 — 태그 시 소멸 여부", () => {
  it("캐릭터 스코프 버프는 그 쪽이 태그하면 사라진다", () => {
    let s = apply(makeState({ P1: { queue: ["bf_focus"] } }), "P1", "bf_focus");
    expect(buffsOf(s, "P1")).toHaveLength(1);
    expect(buffsOf(s, "P1")[0].scope).toBe("character");
    // 걸린 시점의 캐릭터가 기록된다
    expect(buffsOf(s, "P1")[0].characterId).toBe(s.P1.activeCharacter);

    s = applyTagSwitch(s, "P1");
    expect(buffsOf(s, "P1")).toHaveLength(0);
  });

  it("플레이어 스코프 버프는 태그해도 유지된다", () => {
    let s = apply(makeState({ P1: { queue: ["bf_logistics"] } }), "P1", "bf_logistics");
    expect(buffsOf(s, "P1")[0].scope).toBe("player");

    s = applyTagSwitch(s, "P1");
    expect(buffsOf(s, "P1")).toHaveLength(1);
    expect(deriveCardStats(s, "P1", "bf_koan").cost).toBe(1);
  });

  it("상대 캐릭터에 건 버프는 상대가 태그할 때 사라진다 (내가 태그해도 유지)", () => {
    // enemy + character 조합을 직접 구성
    const enemyCharBuff: Buff = {
      stat: "ground_attack", delta: -2, scope: "character",
      duration: { type: "turns", remaining: 3 },
    };
    let s = makeState({ AI: { status: { attackBuff: 0, delayAdvantage: 0, delayAdvantageNext: 0, exhausted: false, buffs: [enemyCharBuff] } } });

    // 내가 태그해도 상대 버프는 그대로
    s = applyTagSwitch(s, "P1");
    expect(buffsOf(s, "AI")).toHaveLength(1);

    // 상대가 태그하면 사라진다
    s = applyTagSwitch(s, "AI");
    expect(buffsOf(s, "AI")).toHaveLength(0);
  });
});

/* ── 표시 == 실제 정합성 ──────────────────────────────────────────────── */
describe("핸드 표시 == 실제 데미지", () => {
  it("버프가 걸린 카드의 표시 공격력과 실제 HP 감소가 같다", () => {
    const s = apply(makeState({ P1: { queue: ["bf_focus"] } }), "P1", "bf_focus");
    const shown = deriveCardStats(s, "P1", "bf_atk").groundAttack;
    expect(shown).toBe(8);

    const before = s.AI.hp;
    const after = apply(s, "P1", "bf_atk").AI.hp;
    expect(before - after).toBe(shown);
  });

  it("디버프가 걸린 상대 카드도 표시와 실제가 같다", () => {
    const s = apply(makeState({ P1: { queue: ["bf_weaken"] } }), "P1", "bf_weaken");
    const shown = deriveCardStats(s, "AI", "bf_atk").groundAttack;
    expect(shown).toBe(3);

    const before = s.P1.hp;
    const after = apply(s, "AI", "bf_atk").P1.hp;
    expect(before - after).toBe(shown);
  });
});
