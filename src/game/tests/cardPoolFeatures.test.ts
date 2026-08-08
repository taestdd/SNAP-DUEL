import { describe, it, expect } from "vitest";
import { applyCardEffectsWithPause, getCardPlayability, canUseCard } from "@/game/engine/effects";
import { resumeResolve } from "@/game/engine/resolve";
import { queueCard } from "@/game/engine/turn";
import { registerCards } from "@/game/engine/cards";
import { CardSchema } from "@/game/engine/cardSchema";
import { CharacterDefSchema } from "@/game/engine/characterSchema";
import type { GameState, PlayerId } from "@/game/engine/types";
import { makeState } from "./fixtures";

/**
 * 신규 카드 풀을 받기 위한 엔진 확장.
 *
 *  A. 선택 대기 후 같은 카드의 남은 효과가 이어서 처리되는가
 *  B. heal이 벤치 캐릭터를 회복할 수 있는가
 *  C. 캐릭터 entry/exitEffect가 배열을 받는가
 *  D. 신규 태그가 스키마를 통과하는가
 *  ④ additionalCost 판정·소모
 *  E. generateOnly 플래그
 */

registerCards({
  // 선택(userSelects) → 그 뒤에 shuffle. 재개가 없으면 shuffle이 누락된다.
  pf_salvage: {
    id: "pf_salvage", name: "부품 회수", cardType: "skill", cost: 0, delay: 2,
    advantage: 0, text: "", effects: [
      { type: "move_cards", count: 2, fromZone: "trash", toZone: "deck", userSelects: true },
      { type: "block", value: 7 }, // shuffle 대신 관측이 쉬운 효과로 대체
    ],
  },
  // userSelects가 연속 2개 — 두 번째 선택이 다시 떠야 한다.
  pf_realign: {
    id: "pf_realign", name: "축 재정렬", cardType: "skill", cost: 0, delay: 0,
    advantage: 0, text: "", effects: [
      { type: "move_cards", count: 1, fromZone: "hand", toZone: "cooldown", userSelects: true },
      { type: "move_cards", count: 1, fromZone: "cooldown", toZone: "hand", userSelects: true },
    ],
  },
  // 벤치 회복
  pf_spare: {
    id: "pf_spare", name: "예비 부품", cardType: "skill", cost: 0, delay: 1,
    advantage: 0, text: "", effects: [
      { type: "heal", value: 4, target: "self" },
      { type: "heal", value: 2, target: "self", character: "bench" },
    ],
  },
  // additionalCost — cooldown의 특정 카드 2종을 요구하고 trash로 소모
  pf_triple: {
    id: "pf_triple", name: "3연 회전", cardType: "attack", cost: 0, delay: 3,
    groundAttack: 3, antiAirAttack: 3, advantage: 0, text: "", effects: [],
    additionalCost: {
      requires: [
        { cardId: "arm_a", zone: "cooldown", count: 1 },
        { cardId: "arm_b", zone: "cooldown", count: 2 },
      ],
      consumeTo: "trash",
    },
  },
  arm_a: { id: "arm_a", name: "팔 A", cardType: "skill", cost: 0, delay: 0, advantage: 0, effects: [], text: "", generateOnly: true },
  arm_b: { id: "arm_b", name: "팔 B", cardType: "skill", cost: 0, delay: 0, advantage: 0, effects: [], text: "", generateOnly: true },
});

function apply(state: GameState, player: PlayerId, cardId: string) {
  return applyCardEffectsWithPause(state, player, cardId, [], 0, [player]);
}

/* ── A. 선택 후 남은 효과 재개 ────────────────────────────────────────── */
describe("A. 선택 대기 후 남은 효과 재개", () => {
  it("선택 뒤에 오는 효과가 누락되지 않는다", () => {
    const state = makeState({ P1: { trash: ["jab", "jab"], queue: ["pf_salvage"] } });

    const paused = apply(state, "P1", "pf_salvage");
    expect(paused.phase).toBe("WAITING_SELECTION");
    // 아직 뒤 효과는 실행 전
    expect(paused.P1.block).toBe(0);

    const resumed = resumeResolve(paused, ["jab"]);
    // 선택 결과 반영 + 뒤 효과(block 7)까지 처리됐다
    expect(resumed.P1.deck).toContain("jab");
    expect(resumed.P1.block).toBe(7);
  });

  it("재개 지점은 선택을 유발한 효과의 다음이다 (앞 효과 재실행 없음)", () => {
    const state = makeState({ P1: { trash: ["jab"], queue: ["pf_salvage"] } });
    const paused = apply(state, "P1", "pf_salvage");
    expect(paused.pendingSelection?.resumeEffectIndex).toBe(1);

    const resumed = resumeResolve(paused, ["jab"]);
    // block이 두 번 들어가지 않았다
    expect(resumed.P1.block).toBe(7);
  });

  it("userSelects가 연속이면 두 번째 선택이 다시 뜬다", () => {
    const state = makeState({ P1: { hand: ["jab"], cooldown: ["heavy"], queue: ["pf_realign"] } });

    const first = apply(state, "P1", "pf_realign");
    expect(first.phase).toBe("WAITING_SELECTION");
    expect(first.pendingSelection?.fromZone).toBe("hand");

    const second = resumeResolve(first, ["jab"]);
    // 두 번째 효과가 실행되어 다시 선택 대기 — 이전에는 여기서 그냥 끝났다
    expect(second.phase).toBe("WAITING_SELECTION");
    expect(second.pendingSelection?.fromZone).toBe("cooldown");

    const done = resumeResolve(second, ["heavy"]);
    expect(done.phase).not.toBe("WAITING_SELECTION");
    expect(done.P1.hand).toContain("heavy");
  });

  it("선택을 건너뛰어도(SKIP) 남은 효과는 처리된다", () => {
    const state = makeState({ P1: { trash: [], queue: ["pf_salvage"] } });
    const paused = apply(state, "P1", "pf_salvage");
    const resumed = resumeResolve(paused, []);
    expect(resumed.P1.block).toBe(7);
  });
});

/* ── B. 벤치 회복 ─────────────────────────────────────────────────────── */
describe("B. heal 벤치 대상", () => {
  it("character:\"bench\"는 벤치 HP만 올리고 활성 HP는 건드리지 않는다", () => {
    const state = makeState({
      P1: { hp: 10, characterHp: { p1_main: 10, p1_sub: 20 }, queue: ["pf_spare"] },
    });
    const after = apply(state, "P1", "pf_spare");

    expect(after.P1.hp).toBe(14);                    // 활성 +4
    expect(after.P1.characterHp.p1_main).toBe(14);
    expect(after.P1.characterHp.p1_sub).toBe(22);    // 벤치 +2
  });

  it("character 미지정은 종전처럼 활성 캐릭터를 회복한다", () => {
    const state = makeState({ P1: { hp: 10, characterHp: { p1_main: 10, p1_sub: 20 } } });
    const after = apply(state, "P1", "pf_spare");
    expect(after.P1.characterHp.p1_sub).toBe(22);
  });
});

/* ── C. 캐릭터 효과 배열 ──────────────────────────────────────────────── */
describe("C. entry/exitEffect 배열", () => {
  it("스키마가 단일 효과와 배열을 모두 받는다", () => {
    const single = {
      id: "c1", name: "단일", maxHp: 12, spriteId: "a", affinities: ["공통"],
      entryEffect: { type: "damage", value: 2, target: "enemy" },
      exitEffect: null,
    };
    const multi = {
      id: "c2", name: "배열", maxHp: 14, spriteId: "a", affinities: ["공통"],
      entryEffect: { type: "damage", value: 2, target: "enemy" },
      exitEffect: [
        { type: "draw", value: 1, target: "enemy" },
        { type: "move_cards", count: 1, target: "enemy", fromZone: "trash", toZone: "deck", toPosition: "bottom" },
      ],
    };

    expect(CharacterDefSchema.safeParse(single).success).toBe(true);
    expect(CharacterDefSchema.safeParse(multi).success).toBe(true);
  });
});

/* ── D. 신규 태그 ─────────────────────────────────────────────────────── */
describe("D. 신규 카드 태그", () => {
  it.each(["공통", "공안", "기계", "나기", "우카이", "DM-7", "파츠", "토큰"])(
    "%s 태그가 스키마를 통과한다",
    (tag) => {
      const card = {
        id: "t1", name: "T", cost: 0, delay: 1, advantage: 0, effects: [], text: "", tags: [tag],
      };
      expect(CardSchema.safeParse(card).success).toBe(true);
    },
  );

  it("목록에 없는 태그는 거부된다", () => {
    const card = { id: "t2", name: "T", cost: 0, delay: 1, advantage: 0, effects: [], text: "", tags: ["없는태그"] };
    expect(CardSchema.safeParse(card).success).toBe(false);
  });
});

/* ── ④ additionalCost ─────────────────────────────────────────────────── */
describe("④ additionalCost", () => {
  const withCooldown = (cooldown: string[]) =>
    makeState({ phase: "SETUP_INIT", P1: { hand: ["pf_triple"], deck: ["jab", "jab"], cooldown } });

  it("요구 카드가 다 있으면 사용 가능", () => {
    const s = withCooldown(["arm_a", "arm_b", "arm_b"]);
    const p = getCardPlayability(s, "P1", "pf_triple");
    expect(p.additionalCostOk).toBe(true);
    expect(p.playable).toBe(true);
  });

  it("장수가 모자라면 사용 불가로 표시된다", () => {
    const s = withCooldown(["arm_a", "arm_b"]); // arm_b 2장 필요한데 1장
    const p = getCardPlayability(s, "P1", "pf_triple");
    expect(p.additionalCostOk).toBe(false);
    expect(p.playable).toBe(false);
    expect(canUseCard(s, "P1", "pf_triple")).toBe(false);
  });

  it("영역이 다르면 인정되지 않는다", () => {
    const s = makeState({ phase: "SETUP_INIT", P1: { hand: ["pf_triple"], deck: ["jab", "jab"], trash: ["arm_a", "arm_b", "arm_b"] } });
    expect(getCardPlayability(s, "P1", "pf_triple").additionalCostOk).toBe(false);
  });

  it("사용 시 요구 카드를 지정 영역으로 소모한다", () => {
    const s = withCooldown(["arm_a", "arm_b", "arm_b", "heavy"]);
    const after = queueCard(s, "P1", "pf_triple", 0);

    expect(after.P1.queue).toContain("pf_triple");
    // 요구분만 소모되고 나머지(heavy)는 남는다
    expect(after.P1.cooldown).toEqual(["heavy"]);
    expect(after.P1.trash).toEqual(expect.arrayContaining(["arm_a", "arm_b", "arm_b"]));
  });

  it("요구를 못 채우면 큐에 올라가지 않는다", () => {
    const s = withCooldown(["arm_a"]);
    const after = queueCard(s, "P1", "pf_triple", 0);
    expect(after.P1.queue).toHaveLength(0);
  });

  it("additionalCost가 없는 카드는 영향받지 않는다", () => {
    const s = makeState({ phase: "SETUP_INIT", P1: { hand: ["jab"], deck: ["jab"] } });
    expect(getCardPlayability(s, "P1", "jab").additionalCostOk).toBe(true);
  });
});

/* ── E. generateOnly ──────────────────────────────────────────────────── */
describe("E. generateOnly", () => {
  it("스키마가 플래그를 보존한다", () => {
    const card = { id: "g1", name: "G", cost: 0, delay: 1, advantage: 0, effects: [], text: "", generateOnly: true };
    const parsed = CardSchema.safeParse(card);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.generateOnly).toBe(true);
  });

  it("미지정 카드는 undefined로 남아 덱 구축에 포함된다", () => {
    const card = { id: "g2", name: "G", cost: 0, delay: 1, advantage: 0, effects: [], text: "" };
    const parsed = CardSchema.safeParse(card);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.generateOnly).toBeUndefined();
  });
});
