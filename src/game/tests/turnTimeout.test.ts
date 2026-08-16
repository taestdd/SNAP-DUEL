import { describe, it, expect } from "vitest";
import { gameReducer } from "@/game/engine/reducer";
import { getTimedActor, getWindowKey, shouldEnforce } from "@/hooks/useTurnTimer";
import type { PendingSelection } from "@/game/engine/types";
import { makeState } from "./fixtures";

/**
 * 턴 시간제약 — TURN/TIMEOUT 액션과 useTurnTimer 순수 헬퍼 검증.
 * 만료 강제는 항상 정식 액션으로 처리되므로 엔진 결정론은 유지된다.
 */

describe("TURN/TIMEOUT — SETUP 자동 패스", () => {
  it("자기 선택 차례 만료 시 패스 + 1드로우 + 페이즈 진행", () => {
    const s = gameReducer(
      makeState({ phase: "SETUP_INIT", initiative: "P1", P1: { deck: ["a", "b"], hand: [] } }),
      { type: "TURN/TIMEOUT", player: "P1" },
    );
    expect(s.P1.ready).toBe(true);
    expect(s.P1.hand).toEqual(["a"]); // 1드로우
    expect(s.phase).toBe("SETUP_OTHER");
    expect(s.log[0]).toContain("times out");
  });

  it("선택 중이던 카드는 무시하고 패스한다 (자동 패스 정책)", () => {
    const s = gameReducer(
      makeState({
        phase: "SETUP_INIT",
        initiative: "P1",
        selected: { cardId: "jab", handIndex: 0 },
        P1: { hand: ["jab"], deck: ["a"] },
      }),
      { type: "TURN/TIMEOUT", player: "P1" },
    );
    expect(s.P1.queue).toEqual([]); // 카드 예약 안 됨
    expect(s.selected).toBeNull();
    expect(s.P1.ready).toBe(true);
  });

  it("자기 차례가 아니면 무시", () => {
    const base = makeState({ phase: "SETUP_INIT", initiative: "AI" });
    expect(gameReducer(base, { type: "TURN/TIMEOUT", player: "P1" })).toBe(base);
  });

  it("이미 ready면 무시", () => {
    const base = makeState({ phase: "SETUP_INIT", initiative: "P1", P1: { ready: true } });
    expect(gameReducer(base, { type: "TURN/TIMEOUT", player: "P1" })).toBe(base);
  });

  it("SETUP_OTHER에서 AI(게스트) 만료 → 패스 후 RESOLVE 진행", () => {
    const s = gameReducer(
      makeState({ phase: "SETUP_OTHER", initiative: "P1", AI: { deck: ["x"] } }),
      { type: "TURN/TIMEOUT", player: "AI" },
    );
    expect(s.AI.ready).toBe(true);
    expect(s.phase).toBe("RESOLVE");
    expect(s.log[0]).toContain("P2 times out");
  });
});

describe("TURN/TIMEOUT — ROUND_DRAFT", () => {
  it("드래프트 만료 → 0장 제출", () => {
    const s = gameReducer(
      makeState({ phase: "ROUND_DRAFT", P1: { deck: ["a", "b"] } }),
      { type: "TURN/TIMEOUT", player: "P1" },
    );
    expect(s.draftSelections.P1).toEqual([]);
    expect(s.P1.deck).toEqual(["a", "b"]); // 덱 변화 없음
    expect(s.log[0]).toContain("times out");
    expect(s.phase).toBe("ROUND_DRAFT"); // 상대 미제출 → 대기 유지
  });

  it("양쪽 모두 만료 처리되면 TURN_START로 진행", () => {
    let s = makeState({ phase: "ROUND_DRAFT", P1: { deck: ["a"] }, AI: { deck: ["b"] } });
    s = gameReducer(s, { type: "TURN/TIMEOUT", player: "P1" });
    s = gameReducer(s, { type: "TURN/TIMEOUT", player: "AI" });
    expect(s.draftSelections).toEqual({ P1: [], AI: [] });
    expect(s.phase).toBe("TURN_START");
  });

  it("이미 제출했으면 무시", () => {
    const base = makeState({ phase: "ROUND_DRAFT", draftSelections: { P1: ["a"], AI: null } });
    expect(gameReducer(base, { type: "TURN/TIMEOUT", player: "P1" })).toBe(base);
  });
});

describe("TURN/TIMEOUT — WAITING_* 페이즈", () => {
  it("WAITING_COST_PAYMENT 만료 → 취소 후 자동 패스", () => {
    const s = gameReducer(
      makeState({
        phase: "WAITING_COST_PAYMENT",
        initiative: "P1",
        P1: { hand: ["jab"], deck: ["a"] },
        pendingCostPayment: {
          player: "P1", cardId: "jab", handIndex: 0,
          originalPhase: "SETUP_INIT", returnPhase: "SETUP_OTHER",
          candidates: [], fromPlayerId: "P1", fromZone: "hand",
          toPlayerId: "P1", toZone: "trash", toPosition: "bottom", count: 1,
        },
      }),
      { type: "TURN/TIMEOUT", player: "P1" },
    );
    expect(s.pendingCostPayment).toBeNull();
    expect(s.P1.queue).toEqual([]); // 카드는 예약되지 않음
    expect(s.P1.ready).toBe(true);
    expect(s.phase).toBe("SETUP_OTHER"); // originalPhase에서 한 단계 진행
  });

  it("WAITING_SELECTION 만료 → SELECTION/SKIP과 동일 결과", () => {
    const pendingSelection: PendingSelection = {
      selectingPlayer: "P1", candidates: ["a", "b"], count: 1,
      fromZone: "trash", fromPlayerId: "P1", toZone: "hand", toPlayerId: "P1",
      toPosition: "bottom", sourcePlayer: "P1", sourceCardId: "jab",
      resolveItems: [], resolveNextIndex: 0, unresolvedPlayers: [], resumeEffectIndex: 0,
    };
    const base = makeState({ phase: "WAITING_SELECTION", pendingSelection, P1: { trash: ["a", "b"] } });
    const byTimeout = gameReducer(base, { type: "TURN/TIMEOUT", player: "P1" });
    const bySkip = gameReducer(base, { type: "SELECTION/SKIP" });
    expect(byTimeout).toEqual(bySkip);
  });

  it("WAITING_SELECTION에서 다른 플레이어 만료는 무시", () => {
    const pendingSelection: PendingSelection = {
      selectingPlayer: "AI", candidates: [], count: 1,
      fromZone: "trash", fromPlayerId: "AI", toZone: "hand", toPlayerId: "AI",
      toPosition: "bottom", sourcePlayer: "AI", sourceCardId: "jab",
      resolveItems: [], resolveNextIndex: 0, unresolvedPlayers: [], resumeEffectIndex: 0,
    };
    const base = makeState({ phase: "WAITING_SELECTION", pendingSelection });
    expect(gameReducer(base, { type: "TURN/TIMEOUT", player: "P1" })).toBe(base);
  });

  it("WAITING_DISCARD 만료 → 핸드 앞에서부터 자동 버리기", () => {
    const hand = ["c0", "c1", "c2", "c3"];
    const s = gameReducer(
      makeState({
        phase: "WAITING_DISCARD",
        P1: { hand },
        pendingDiscard: { player: "P1", count: 2, candidates: hand },
      }),
      { type: "TURN/TIMEOUT", player: "P1" },
    );
    expect(s.P1.hand).toEqual(["c2", "c3"]);
    expect(s.P1.trash).toEqual(["c0", "c1"]);
    expect(s.pendingDiscard).toBeNull();
    expect(s.phase).toBe("TURN_END");
  });
  it("WAITING_DISCARD가 AI 소유면 P1 타임아웃은 무시", () => {
    const hand = ["c0", "c1"];
    const base = makeState({
      phase: "WAITING_DISCARD",
      AI: { hand },
      pendingDiscard: { player: "AI", count: 1, candidates: hand },
    });
    expect(gameReducer(base, { type: "TURN/TIMEOUT", player: "P1" })).toBe(base);
  });

  it("시간제약 대상이 아닌 페이즈에서는 무시", () => {
    const base = makeState({ phase: "RESOLVE" });
    expect(gameReducer(base, { type: "TURN/TIMEOUT", player: "P1" })).toBe(base);
  });
});

describe("useTurnTimer 순수 헬퍼", () => {
  it("getTimedActor: SETUP은 선택 차례 플레이어", () => {
    expect(getTimedActor(makeState({ phase: "SETUP_INIT", initiative: "P1" }))).toBe("P1");
    expect(getTimedActor(makeState({ phase: "SETUP_INIT", initiative: "AI" }))).toBe("AI");
    expect(getTimedActor(makeState({ phase: "SETUP_OTHER", initiative: "P1" }))).toBe("AI");
  });

  it("getTimedActor: ready면 null (창 닫힘)", () => {
    expect(getTimedActor(makeState({ phase: "SETUP_INIT", initiative: "P1", P1: { ready: true } }))).toBeNull();
  });

  it("getTimedActor: WAITING_*는 결정 주체, 그 외 페이즈는 null", () => {
    expect(getTimedActor(makeState({ phase: "WAITING_DISCARD", pendingDiscard: { player: "P1", count: 1, candidates: [] } }))).toBe("P1");
    expect(getTimedActor(makeState({ phase: "WAITING_DISCARD", pendingDiscard: { player: "AI", count: 1, candidates: [] } }))).toBe("AI");
    expect(getTimedActor(makeState({ phase: "RESOLVE" }))).toBeNull();
    expect(getTimedActor(makeState({ phase: "ANIMATING" }))).toBeNull();
    expect(getTimedActor(makeState({ phase: "TURN_END" }))).toBeNull();
  });

  it("getWindowKey: 페이즈/액터가 바뀌면 키가 달라진다", () => {
    const init = getWindowKey(makeState({ phase: "SETUP_INIT", initiative: "P1" }));
    const other = getWindowKey(makeState({ phase: "SETUP_OTHER", initiative: "P1" }));
    expect(init).not.toBeNull();
    expect(other).not.toBeNull();
    expect(init).not.toBe(other);
  });

  it("getTimedActor: 드래프트는 미제출자 (P1 우선), 모두 제출 시 null", () => {
    expect(getTimedActor(makeState({ phase: "ROUND_DRAFT" }))).toBe("P1");
    expect(getTimedActor(makeState({ phase: "ROUND_DRAFT", draftSelections: { P1: [], AI: null } }))).toBe("AI");
    expect(getTimedActor(makeState({ phase: "ROUND_DRAFT", draftSelections: { P1: [], AI: [] } }))).toBeNull();
  });

  it("getWindowKey: 드래프트는 액터가 바뀌어도 같은 창 (공유 20초)", () => {
    const bothPending = getWindowKey(makeState({ phase: "ROUND_DRAFT" }));
    const p1Done = getWindowKey(makeState({ phase: "ROUND_DRAFT", draftSelections: { P1: [], AI: null } }));
    expect(bothPending).not.toBeNull();
    expect(bothPending).toBe(p1Done);
  });

  it("shouldEnforce: single은 P1만, host는 양쪽, guest는 없음", () => {
    expect(shouldEnforce("single", "P1")).toBe(true);
    expect(shouldEnforce("single", "AI")).toBe(false);
    expect(shouldEnforce("host", "P1")).toBe(true);
    expect(shouldEnforce("host", "AI")).toBe(true);
    expect(shouldEnforce("guest", "P1")).toBe(false);
    expect(shouldEnforce("guest", "AI")).toBe(false);
  });
});
