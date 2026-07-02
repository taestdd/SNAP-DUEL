import { describe, it, expect } from "vitest";
import { nextRandom, shuffleSeeded } from "@/game/engine/rng";
import { createInitialState, initDecks } from "@/game/engine/state";
import type { SetupConfig } from "@/game/engine/types";
import "./fixtures"; // 합성 카드·캐릭터 레지스트리 주입

// 20장 이상 + 다양한 카드로 구성한 테스트 덱 (셔플 순서가 의미 있도록)
const VARIETY = ["jab", "quick_jab", "heavy", "swift", "uppercut", "launcher", "guard"];
initDecks({
  TESTDECK: {
    id: "TESTDECK",
    name: "Test Deck",
    characters: ["p1_main", "p1_sub"],
    cards: Array.from({ length: 20 }, (_, i) => VARIETY[i % VARIETY.length]),
  },
});

const cfg: SetupConfig = { deckId: "TESTDECK", characters: ["p1_main", "p1_sub"] };

/* ── RNG 프리미티브 ───────────────────────────────────────────────────── */
describe("rng 프리미티브 결정론", () => {
  it("nextRandom: 같은 시드 → 같은 [값, 다음상태]", () => {
    expect(nextRandom(123)).toEqual(nextRandom(123));
    const [v, next] = nextRandom(123);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(next).not.toBe(123); // 상태 전진
  });

  it("shuffleSeeded: 같은 시드 → 같은 순열, 원소 보존, 원본 불변", () => {
    const arr = ["a", "b", "c", "d", "e"];
    const [r1] = shuffleSeeded(arr, 7);
    const [r2] = shuffleSeeded(arr, 7);
    expect(r1).toEqual(r2);
    expect([...r1].sort()).toEqual([...arr].sort()); // 순열(원소 보존)
    expect(arr).toEqual(["a", "b", "c", "d", "e"]); // 입력 불변
  });

  it("shuffleSeeded: 다른 시드 → (대개) 다른 순열", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const [r1] = shuffleSeeded(arr, 1);
    const [r2] = shuffleSeeded(arr, 2);
    expect(r1).not.toEqual(r2);
  });
});

/* ── createInitialState 결정론 ────────────────────────────────────────── */
describe("createInitialState 결정론", () => {
  it("같은 시드 → 동일한 덱·initiative·rng 상태", () => {
    const s1 = createInitialState(cfg, undefined, 999);
    const s2 = createInitialState(cfg, undefined, 999);
    expect(s1.seed).toBe(999);
    expect(s1.P1.deck).toEqual(s2.P1.deck);
    expect(s1.AI.deck).toEqual(s2.AI.deck);
    expect(s1.initiative).toBe(s2.initiative);
    expect(s1.rng).toBe(s2.rng); // 셔플·initiative 소비 후 rng까지 동일
  });

  it("시드 미지정 시 자동 시드 부여 + 셔플로 rng 전진", () => {
    const s = createInitialState(cfg);
    expect(typeof s.seed).toBe("number");
    expect(s.rng).not.toBe(s.seed);
  });

  it("덱 셔플이 원본 카드를 보존한다 (순열)", () => {
    const s = createInitialState(cfg, undefined, 42);
    expect([...s.P1.deck].sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => VARIETY[i % VARIETY.length]).sort(),
    );
  });
});
