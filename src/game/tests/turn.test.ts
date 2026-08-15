import { describe, it, expect } from "vitest";
import { queueCard, beginTurn, endTurnCleanup, submitDraft, resumeCostPayment } from "@/game/engine/turn";
import { registerCards } from "@/game/engine/cards";
import type { PendingCostPayment } from "@/game/engine/types";
import { makeState } from "./fixtures";

registerCards({
  costly:  { id: "costly",  name: "Costly",  cardType: "attack", cost: 2, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "" },
  hp_card: { id: "hp_card", name: "HP Card", cardType: "attack", cost: 0, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "", altCost: { type: "hp", amount: 5 } },
  ac_card: { id: "ac_card", name: "AC Card", cardType: "attack", cost: 0, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "" },
});

/* ── queueCard ─────────────────────────────────────────────────────── */
describe("queueCard", () => {
  it("코스트만큼 덱 상단을 trash로 지불하고 카드를 큐에 올린다", () => {
    const s = queueCard(
      makeState({ phase: "SETUP_INIT", P1: { hand: ["costly"], deck: ["d1", "d2", "d3"] } }),
      "P1", "costly", 0,
    );
    expect(s.P1.queue).toEqual(["costly"]);
    expect(s.P1.hand).toEqual([]);
    expect(s.P1.trash).toEqual(["d1", "d2"]);
    expect(s.P1.deck).toEqual(["d3"]);
  });
  it("덱이 코스트보다 적으면 상태를 변경하지 않는다", () => {
    const before = makeState({ phase: "SETUP_INIT", P1: { hand: ["costly"], deck: ["d1"] } });
    expect(queueCard(before, "P1", "costly", 0)).toBe(before);
  });
  it("altCost hp: 큐에 올린 뒤 HP를 지불한다", () => {
    const s = queueCard(
      makeState({ phase: "SETUP_INIT", P1: { hand: ["hp_card"], hp: 30 } }),
      "P1", "hp_card", 0,
    );
    expect(s.P1.queue).toEqual(["hp_card"]);
    expect(s.P1.hp).toBe(25);
  });
  it("SETUP 페이즈가 아니면 무시한다", () => {
    const before = makeState({ phase: "RESOLVE", P1: { hand: ["jab"] } });
    expect(queueCard(before, "P1", "jab", 0)).toBe(before);
  });
});

/* ── beginTurn ─────────────────────────────────────────────────────── */
describe("beginTurn", () => {
  it("턴 증가 + SETUP_INIT 진입 + 플래그 리셋", () => {
    const s = beginTurn(makeState({ phase: "TURN_START", turn: 3, P1: { block: 5, ready: true } }));
    expect(s.turn).toBe(4);
    expect(s.phase).toBe("SETUP_INIT");
    expect(s.P1.block).toBe(0);
    expect(s.P1.ready).toBe(false);
  });
  it("delayAdvantageNext가 delayAdvantage로 롤오버되고 다음 값은 0", () => {
    const s = beginTurn(makeState({ phase: "TURN_START", P1: { status: { delayAdvantageNext: 2 } } }));
    expect(s.P1.status.delayAdvantage).toBe(2);
    expect(s.P1.status.delayAdvantageNext).toBe(0);
  });
  it("airborneStack가 1 감소한다 (0 클램프)", () => {
    const s = beginTurn(makeState({ phase: "TURN_START", P1: { airborneStack: 2 }, AI: { airborneStack: 0 } }));
    expect(s.P1.airborneStack).toBe(1);
    expect(s.AI.airborneStack).toBe(0);
  });
});

/* ── endTurnCleanup ────────────────────────────────────────────────── */
describe("endTurnCleanup", () => {
  it("정상 종료 시 TURN_END + turnLog 기록", () => {
    const s = endTurnCleanup(makeState({ turn: 2, turnLog: [] }));
    expect(s.phase).toBe("TURN_END");
    expect(s.turnLog).toHaveLength(1);
    expect(s.turnLog[0].turn).toBe(2);
  });
  it("P1 핸드가 10장 초과면 WAITING_DISCARD", () => {
    const hand = Array.from({ length: 11 }, (_, i) => `c${i}`);
    const s = endTurnCleanup(makeState({ P1: { hand } }));
    expect(s.phase).toBe("WAITING_DISCARD");
    expect(s.pendingDiscard).toMatchObject({ player: "P1", count: 1 });
  });
  it("AI 핸드가 10장 초과면 (자동 처리하지 않고) WAITING_DISCARD로 뺀다", () => {
    const hand = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const s = endTurnCleanup(makeState({ AI: { hand } }));
    expect(s.phase).toBe("WAITING_DISCARD");
    expect(s.pendingDiscard).toMatchObject({ player: "AI", count: 2 });
    expect(s.AI.hand).toHaveLength(12); // 아직 실제로 버려지지 않음 — DISCARD/CONFIRM이 처리
  });
  it("양쪽 다 초과면 AI를 먼저 대기시킨다", () => {
    const p1Hand = Array.from({ length: 11 }, (_, i) => `p${i}`);
    const aiHand = Array.from({ length: 13 }, (_, i) => `a${i}`);
    const s = endTurnCleanup(makeState({ P1: { hand: p1Hand }, AI: { hand: aiHand } }));
    expect(s.pendingDiscard).toMatchObject({ player: "AI", count: 3 });
  });
  it("양쪽 모두 exhausted면 라운드 종료 (round<3 → 다음 라운드 ROUND_DRAFT)", () => {
    const s = endTurnCleanup(makeState({
      round: 1,
      P1: { status: { exhausted: true } },
      AI: { status: { exhausted: true } },
    }));
    expect(s.round).toBe(2);
    expect(s.phase).toBe("ROUND_DRAFT");
  });
  it("3라운드에서 양쪽 exhausted면 HP 합계로 게임 종료", () => {
    const s = endTurnCleanup(makeState({
      round: 3,
      P1: { status: { exhausted: true }, characterHp: { p1_main: 20, p1_sub: 20 } },
      AI: { status: { exhausted: true }, characterHp: { ai_main: 10, ai_sub: 10 } },
    }));
    expect(s.phase).toBe("GAME_OVER");
    expect(s.winner).toBe("P1");
  });
});

/* ── submitDraft ───────────────────────────────────────────────────── */
describe("submitDraft", () => {
  it("덱에서 카드를 손패로 옮기고 draftSelections에 기록", () => {
    const s = submitDraft(
      makeState({ phase: "ROUND_DRAFT", P1: { deck: ["a", "b", "c"], hand: [] } }),
      "P1", ["a", "b"],
    );
    expect(s.P1.hand).toEqual(["a", "b"]);
    expect(s.P1.deck).toEqual(["c"]);
    expect(s.draftSelections.P1).toEqual(["a", "b"]);
    expect(s.phase).toBe("ROUND_DRAFT"); // AI 미제출
  });
  it("양쪽 모두 제출하면 TURN_START로 진행", () => {
    let s = makeState({ phase: "ROUND_DRAFT", P1: { deck: ["a"] }, AI: { deck: ["x"] } });
    s = submitDraft(s, "P1", ["a"]);
    s = submitDraft(s, "AI", ["x"]);
    expect(s.phase).toBe("TURN_START");
  });
});

/* ── resumeCostPayment ─────────────────────────────────────────────── */
describe("resumeCostPayment", () => {
  it("선택 카드로 altCost를 지불하고 원래 카드를 큐에 올린다", () => {
    const pc: PendingCostPayment = {
      player: "P1", cardId: "ac_card", handIndex: 0,
      originalPhase: "SETUP_INIT", returnPhase: "SETUP_OTHER",
      candidates: ["d1"], fromPlayerId: "P1", fromZone: "deck",
      toPlayerId: "P1", toZone: "trash", toPosition: "bottom", count: 1,
    };
    const s = resumeCostPayment(
      makeState({ phase: "WAITING_COST_PAYMENT", pendingCostPayment: pc, P1: { hand: ["ac_card"], deck: ["d1"] } }),
      ["d1"],
    );
    expect(s.P1.queue).toEqual(["ac_card"]);
    expect(s.P1.trash).toContain("d1");
    expect(s.P1.ready).toBe(true);
    expect(s.phase).toBe("SETUP_OTHER");
    expect(s.pendingCostPayment).toBeNull();
  });
});
