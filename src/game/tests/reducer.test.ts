import { describe, it, expect } from "vitest";
import { gameReducer } from "@/game/engine/reducer";
import { makeState } from "./fixtures";

/* ── CARD/SELECT ───────────────────────────────────────────────────── */
describe("CARD/SELECT", () => {
  const base = () => makeState({ phase: "SETUP_INIT", initiative: "P1", P1: { hand: ["jab"] } });

  it("내 차례 SETUP에서 카드를 선택한다", () => {
    const s = gameReducer(base(), { type: "CARD/SELECT", cardId: "jab", handIndex: 0 });
    expect(s.selected).toEqual({ cardId: "jab", handIndex: 0 });
  });
  it("같은 카드를 다시 선택하면 토글 해제", () => {
    const s = gameReducer(
      makeState({ phase: "SETUP_INIT", initiative: "P1", selected: { cardId: "jab", handIndex: 0 }, P1: { hand: ["jab"] } }),
      { type: "CARD/SELECT", cardId: "jab", handIndex: 0 },
    );
    expect(s.selected).toBeNull();
  });
  it("SETUP 페이즈가 아니면 무시", () => {
    const before = makeState({ phase: "RESOLVE", P1: { hand: ["jab"] } });
    expect(gameReducer(before, { type: "CARD/SELECT", cardId: "jab", handIndex: 0 })).toBe(before);
  });
  it("내 차례가 아니면 무시 (SETUP_INIT인데 initiative=AI)", () => {
    const before = makeState({ phase: "SETUP_INIT", initiative: "AI", P1: { hand: ["jab"] } });
    expect(gameReducer(before, { type: "CARD/SELECT", cardId: "jab", handIndex: 0 })).toBe(before);
  });
});

/* ── PLAYER/READY ──────────────────────────────────────────────────── */
describe("PLAYER/READY (P1)", () => {
  it("선택 카드가 있으면 큐에 올리고 SETUP_OTHER로 진행", () => {
    const s = gameReducer(
      makeState({ phase: "SETUP_INIT", initiative: "P1", selected: { cardId: "jab", handIndex: 0 }, P1: { hand: ["jab"] } }),
      { type: "PLAYER/READY", player: "P1" },
    );
    expect(s.P1.queue).toEqual(["jab"]);
    expect(s.P1.ready).toBe(true);
    expect(s.phase).toBe("SETUP_OTHER");
    expect(s.selected).toBeNull();
  });
  it("선택이 없으면 패스 + 1드로우 후 진행", () => {
    const s = gameReducer(
      makeState({ phase: "SETUP_INIT", initiative: "P1", selected: null, P1: { hand: [], deck: ["x"] } }),
      { type: "PLAYER/READY", player: "P1" },
    );
    expect(s.P1.hand).toEqual(["x"]);
    expect(s.P1.ready).toBe(true);
    expect(s.phase).toBe("SETUP_OTHER");
  });
  it("내 차례가 아니면 무시", () => {
    const before = makeState({ phase: "SETUP_INIT", initiative: "AI" });
    expect(gameReducer(before, { type: "PLAYER/READY", player: "P1" })).toBe(before);
  });
});

/* ── HAND/CYCLE ────────────────────────────────────────────────────── */
describe("HAND/CYCLE", () => {
  it("핸드 마지막 카드를 맨 앞으로 회전", () => {
    const s = gameReducer(makeState({ P1: { hand: ["a", "b", "c"] } }), { type: "HAND/CYCLE" });
    expect(s.P1.hand).toEqual(["c", "a", "b"]);
  });
  it("핸드가 2장 미만이면 무시", () => {
    const before = makeState({ P1: { hand: ["a"] } });
    expect(gameReducer(before, { type: "HAND/CYCLE" })).toBe(before);
  });
});

/* ── TURN/TAG ──────────────────────────────────────────────────────── */
describe("TURN/TAG", () => {
  it("내 차례 SETUP에서 태그하면 캐릭터 교체 + 플래그 설정", () => {
    const s = gameReducer(
      makeState({ phase: "SETUP_INIT", initiative: "P1", p1TaggedThisTurn: false }),
      { type: "TURN/TAG" },
    );
    expect(s.P1.activeCharacter).toBe("p1_sub");
    expect(s.p1TaggedThisTurn).toBe(true);
  });
  it("이미 태그했으면 무시", () => {
    const before = makeState({ phase: "SETUP_INIT", initiative: "P1", p1TaggedThisTurn: true });
    expect(gameReducer(before, { type: "TURN/TAG" })).toBe(before);
  });
  it("벤치 캐릭터가 죽었으면 무시", () => {
    const before = makeState({ phase: "SETUP_INIT", initiative: "P1", P1: { characterHp: { p1_main: 30, p1_sub: 0 } } });
    expect(gameReducer(before, { type: "TURN/TAG" })).toBe(before);
  });
});

/* ── AI/SETUP_AUTO ─────────────────────────────────────────────────── */
describe("AI/SETUP_AUTO", () => {
  it("AI가 카드를 선택하고 ready + 페이즈 진행", () => {
    const s = gameReducer(
      makeState({ phase: "SETUP_INIT", initiative: "AI", AI: { hand: ["jab"], deck: [] } }),
      { type: "AI/SETUP_AUTO" },
    );
    expect(s.AI.ready).toBe(true);
    expect(s.AI.queue).toEqual(["jab"]);
    expect(s.phase).toBe("SETUP_OTHER");
  });
});

/* ── RESOLVE/STEP ──────────────────────────────────────────────────── */
describe("RESOLVE/STEP", () => {
  it("RESOLVE에서 호출하면 해결 후 ANIMATING으로", () => {
    const s = gameReducer(makeState({ phase: "RESOLVE", P1: { queue: ["jab"] } }), { type: "RESOLVE/STEP" });
    expect(s.phase).toBe("ANIMATING");
    expect(s.AI.hp).toBe(25);
  });
});

/* ── ANIM/DONE ─────────────────────────────────────────────────────── */
describe("ANIM/DONE", () => {
  it("winner가 없으면 턴 정리 → TURN_END", () => {
    const s = gameReducer(makeState({ phase: "ANIMATING", animScript: [] }), { type: "ANIM/DONE" });
    expect(s.phase).toBe("TURN_END");
  });
  it("winner가 있으면 GAME_OVER", () => {
    const s = gameReducer(makeState({ phase: "ANIMATING", winner: "P1", animScript: [] }), { type: "ANIM/DONE" });
    expect(s.phase).toBe("GAME_OVER");
  });
});

/* ── SURRENDER ─────────────────────────────────────────────────────── */
describe("SURRENDER", () => {
  it("항복하면 상대가 승리", () => {
    const s = gameReducer(makeState(), { type: "SURRENDER", player: "P1" });
    expect(s.phase).toBe("GAME_OVER");
    expect(s.winner).toBe("AI");
  });
});
