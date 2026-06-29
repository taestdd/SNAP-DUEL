import { describe, it, expect, vi, afterEach } from "vitest";
import {
  dealDamage,
  draw,
  syncExhausted,
  checkGameOver,
  decideWinnerByHp,
  moveCardsBetweenZones,
  moveQueuedCard,
  getEffectiveSpeed,
  evaluateModifiers,
  getBenchChar,
  opponentOf,
  recycleTrashIntoDeck,
  moveHandToTrash,
  moveCooldownToTrash,
  areBothPlayersExhausted,
  discardAIExcess,
  didDirectAttackHit,
  clearAttackBuff,
} from "@/game/engine/stateHelpers";
import { registerCards } from "@/game/engine/cards";
import type { StatModifier } from "@/game/engine/types";
import { makeState } from "./fixtures";

// 태그 효과를 가진 공격 카드 (didDirectAttackHit 제외 케이스용)
registerCards({
  tag_strike: { id: "tag_strike", name: "Tag Strike", cardType: "attack", cost: 0, speed: 2, groundAttack: 5, gain: 0, effects: [{ type: "tag" }], text: "" },
});

afterEach(() => vi.restoreAllMocks());

describe("opponentOf / getBenchChar", () => {
  it("상대를 반환한다", () => {
    expect(opponentOf("P1")).toBe("AI");
    expect(opponentOf("AI")).toBe("P1");
  });
  it("벤치(비활성) 캐릭터를 반환한다", () => {
    const s = makeState();
    expect(getBenchChar(s.P1)).toBe("p1_sub");
  });
});

describe("dealDamage", () => {
  it("블록 없이 HP와 characterHp를 함께 깎는다", () => {
    const s = dealDamage(makeState(), "AI", 5);
    expect(s.AI.hp).toBe(25);
    expect(s.AI.characterHp["ai_main"]).toBe(25);
  });
  it("블록이 데미지를 흡수하고 소모된다", () => {
    const s = dealDamage(makeState({ AI: { block: 3 } }), "AI", 5);
    expect(s.AI.hp).toBe(28); // 5 - 3 blocked
    expect(s.AI.block).toBe(0);
  });
  it("블록이 데미지보다 크면 전부 막고 블록만 소모", () => {
    const s = dealDamage(makeState({ AI: { block: 10 } }), "AI", 5);
    expect(s.AI.hp).toBe(30);
    expect(s.AI.block).toBe(5);
  });
});

describe("draw / syncExhausted", () => {
  it("덱 상단에서 n장 뽑는다", () => {
    const s = draw(makeState({ P1: { deck: ["a", "b", "c"] } }), "P1", 2);
    expect(s.P1.hand).toEqual(["a", "b"]);
    expect(s.P1.deck).toEqual(["c"]);
  });
  it("빈 덱에서 뽑으면 exhausted가 된다", () => {
    const s = draw(makeState({ P1: { deck: [] } }), "P1", 1);
    expect(s.P1.status.exhausted).toBe(true);
    expect(s.P1.hand).toEqual([]);
  });
  it("덱보다 많이 뽑으면 가능한 만큼만 뽑고 exhausted", () => {
    const s = draw(makeState({ P1: { deck: ["a"] } }), "P1", 3);
    expect(s.P1.hand).toEqual(["a"]);
    expect(s.P1.status.exhausted).toBe(true);
  });
  it("syncExhausted: 덱 0장 → true, 1장 이상 → false", () => {
    expect(syncExhausted(makeState({ P1: { deck: [] } }), "P1").P1.status.exhausted).toBe(true);
    expect(syncExhausted(makeState({ P1: { deck: ["x"], status: { exhausted: true } } }), "P1").P1.status.exhausted).toBe(false);
  });
});

describe("checkGameOver / decideWinnerByHp", () => {
  it("P1 캐릭터가 죽으면 AI 승", () => {
    const s = checkGameOver(makeState({ P1: { characterHp: { p1_main: 0, p1_sub: 30 } } }));
    expect(s.phase).toBe("GAME_OVER");
    expect(s.winner).toBe("AI");
  });
  it("양쪽 다 죽으면 무승부", () => {
    const s = checkGameOver(makeState({
      P1: { characterHp: { p1_main: 0, p1_sub: 30 } },
      AI: { characterHp: { ai_main: -1, ai_sub: 30 } },
    }));
    expect(s.winner).toBe("DRAW");
  });
  it("아무도 안 죽으면 상태 유지", () => {
    const s = checkGameOver(makeState());
    expect(s.phase).toBe("RESOLVE");
    expect(s.winner).toBeNull();
  });
  it("decideWinnerByHp: characterHp 합계가 큰 쪽이 승리", () => {
    const s = decideWinnerByHp(makeState({
      P1: { characterHp: { p1_main: 20, p1_sub: 20 } }, // 40
      AI: { characterHp: { ai_main: 10, ai_sub: 20 } }, // 30
    }));
    expect(s.winner).toBe("P1");
  });
});

describe("존 이동", () => {
  it("moveCardsBetweenZones: 기본은 대상 영역 하단에 추가", () => {
    const s = moveCardsBetweenZones(
      makeState({ P1: { trash: ["a", "b"], hand: ["x"] } }),
      "P1", "trash", "P1", "hand", ["a"],
    );
    expect(s.P1.hand).toEqual(["x", "a"]);
    expect(s.P1.trash).toEqual(["b"]);
  });
  it("toPosition=top이면 덱 상단에 삽입", () => {
    const s = moveCardsBetweenZones(
      makeState({ P1: { trash: ["a"], deck: ["c"] } }),
      "P1", "trash", "P1", "deck", ["a"], "top",
    );
    expect(s.P1.deck).toEqual(["a", "c"]);
  });
  it("toPosition=random은 시드 rng로 위치 결정 (결정론)", () => {
    const base = makeState({ rng: 42, P1: { trash: ["a"], deck: ["c", "d"] } });
    const s1 = moveCardsBetweenZones(base, "P1", "trash", "P1", "deck", ["a"], "random");
    const s2 = moveCardsBetweenZones(base, "P1", "trash", "P1", "deck", ["a"], "random");
    // 같은 입력(같은 rng) → 같은 위치 + a가 어딘가 삽입되고 rng는 전진
    expect(s1.P1.deck).toEqual(s2.P1.deck);
    expect(s1.P1.deck).toContain("a");
    expect(s1.P1.deck.length).toBe(3);
    expect(s1.rng).not.toBe(base.rng);
  });
  it("moveQueuedCard: queue에서 cooldown으로 이동", () => {
    const s = moveQueuedCard(makeState({ P1: { queue: ["jab"] } }), "P1", "jab", "cooldown");
    expect(s.P1.queue).toEqual([]);
    expect(s.P1.cooldown).toEqual(["jab"]);
  });
  it("moveHandToTrash / moveCooldownToTrash", () => {
    const a = moveHandToTrash(makeState({ P1: { hand: ["a", "b"] } }), "P1");
    expect(a.P1.hand).toEqual([]);
    expect(a.P1.trash).toEqual(["a", "b"]);
    const b = moveCooldownToTrash(makeState({ P1: { cooldown: ["c"] } }), "P1");
    expect(b.P1.cooldown).toEqual([]);
    expect(b.P1.trash).toEqual(["c"]);
  });
  it("recycleTrashIntoDeck: trash를 덱에 합쳐 섞고 비운다", () => {
    const s = recycleTrashIntoDeck(makeState({ P1: { deck: ["c"], trash: ["a", "b"] } }), "P1");
    expect([...s.P1.deck].sort()).toEqual(["a", "b", "c"]);
    expect(s.P1.trash).toEqual([]);
  });
});

describe("스피드 / 스탯 보정", () => {
  it("getEffectiveSpeed: speedBonus만큼 감소, 0 미만 클램프", () => {
    expect(getEffectiveSpeed(makeState(), "P1", "jab")).toBe(2);
    expect(getEffectiveSpeed(makeState({ P1: { status: { speedBonus: 1 } } }), "P1", "jab")).toBe(1);
    expect(getEffectiveSpeed(makeState({ P1: { status: { speedBonus: 5 } } }), "P1", "jab")).toBe(0);
  });
  it("evaluateModifiers: 조건 충족 시 delta 적용", () => {
    const mods: StatModifier[] = [
      { condition: { check: "hand_count", target: "self", op: "<", value: 3 }, stat: "speed", delta: -1 },
    ];
    const met = evaluateModifiers(makeState({ P1: { hand: ["a"] } }), "P1", mods);
    expect(met.speed).toBe(-1);
    const notMet = evaluateModifiers(makeState({ P1: { hand: ["a", "b", "c", "d"] } }), "P1", mods);
    expect(notMet.speed).toBeUndefined();
  });
  it("evaluateModifiers: 같은 stat 누적", () => {
    const mods: StatModifier[] = [
      { condition: { check: "hp", target: "self", op: ">", value: 10 }, stat: "ground_attack", delta: 2 },
      { condition: { check: "round", target: "self", op: "=", value: 1 }, stat: "ground_attack", delta: 3 },
    ];
    const r = evaluateModifiers(makeState(), "P1", mods);
    expect(r.ground_attack).toBe(5);
  });
});

describe("기타 헬퍼", () => {
  it("areBothPlayersExhausted", () => {
    expect(areBothPlayersExhausted(makeState({ P1: { status: { exhausted: true } }, AI: { status: { exhausted: true } } }))).toBe(true);
    expect(areBothPlayersExhausted(makeState({ P1: { status: { exhausted: true } } }))).toBe(false);
  });
  it("discardAIExcess: 핸드 10장 초과분을 trash로", () => {
    const hand = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const s = discardAIExcess(makeState({ AI: { hand } }));
    expect(s.AI.hand).toHaveLength(10);
    expect(s.AI.trash).toHaveLength(2);
  });
  it("clearAttackBuff: attackBuff 0으로", () => {
    const s = clearAttackBuff(makeState({ P1: { status: { attackBuff: 5 } } }), "P1");
    expect(s.P1.status.attackBuff).toBe(0);
  });
  it("didDirectAttackHit: 공격으로 HP 감소 시 true", () => {
    const before = makeState();
    const after = dealDamage(before, "AI", 5);
    expect(didDirectAttackHit(before, after, "P1", "jab")).toBe(true);
  });
  it("didDirectAttackHit: 태그 효과 공격은 제외", () => {
    const before = makeState();
    const after = dealDamage(before, "AI", 5);
    expect(didDirectAttackHit(before, after, "P1", "tag_strike")).toBe(false);
  });
  it("didDirectAttackHit: HP 변화 없으면 false", () => {
    const s = makeState();
    expect(didDirectAttackHit(s, s, "P1", "jab")).toBe(false);
  });
});
