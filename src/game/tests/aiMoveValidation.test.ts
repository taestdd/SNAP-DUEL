import { describe, it, expect } from "vitest";
import {
  resolveSetupDecision,
  resolveSelectionDecision,
  resolveDraftDecision,
  resolveDiscardDecision,
} from "@/game/engine/aiMoveValidation";
import { makeState } from "./fixtures";

/**
 * Claude(등 외부 판단 주체)가 돌려준 tool 응답 검증.
 * 형식이 어긋나거나 애매한 응답은 전부 fallback으로 떨어져야 한다 —
 * 잘못된 응답 하나가 게임을 멈추거나 깨뜨리면 안 된다.
 */

describe("resolveSetupDecision", () => {
  const fallback = { tag: false, play: { id: "jab", idx: 0 } };

  it("정상 응답 — 손패에 있고 낼 수 있는 카드면 그대로 쓴다", () => {
    const state = makeState({ AI: { hand: ["jab", "heavy"], deck: [] } });
    const out = resolveSetupDecision(state, { tag: true, cardId: "heavy" }, fallback);
    expect(out).toEqual({ tag: true, play: { id: "heavy", idx: 1 } });
  });

  it("raw가 null/undefined면 fallback 그대로", () => {
    const state = makeState({ AI: { hand: ["jab"] } });
    expect(resolveSetupDecision(state, null, fallback)).toEqual(fallback);
    expect(resolveSetupDecision(state, undefined, fallback)).toEqual(fallback);
  });

  it("cardId가 빈 문자열이면 패스로 본다 (tag는 응답값 유지)", () => {
    const state = makeState({ AI: { hand: ["jab"] } });
    const out = resolveSetupDecision(state, { tag: true, cardId: "" }, fallback);
    expect(out).toEqual({ tag: true, play: null });
  });

  it("손패에 없는 cardId는 play만 fallback으로 (tag는 응답값 유지)", () => {
    const state = makeState({ AI: { hand: ["jab"] } });
    const out = resolveSetupDecision(state, { tag: true, cardId: "nonexistent" }, fallback);
    expect(out).toEqual({ tag: true, play: fallback.play });
  });

  it("tag/cardId 타입이 이상하면 각각 fallback/패스로 처리", () => {
    const state = makeState({ AI: { hand: ["jab"] } });
    const out = resolveSetupDecision(state, { tag: "yes", cardId: 123 } as never, fallback);
    expect(out).toEqual({ tag: fallback.tag, play: null });
  });
});

describe("resolveSelectionDecision", () => {
  const candidates = ["a", "b", "c"];
  const fallback = { selectedCards: ["a", "b"] };

  it("정상 응답 — 후보 부분집합, count 이하", () => {
    expect(resolveSelectionDecision(candidates, 2, { cardIds: ["b"] }, fallback))
      .toEqual({ selectedCards: ["b"] });
  });

  it("빈 배열도 유효한 선택(스킵)으로 인정", () => {
    expect(resolveSelectionDecision(candidates, 2, { cardIds: [] }, fallback))
      .toEqual({ selectedCards: [] });
  });

  it("count를 넘으면 fallback", () => {
    expect(resolveSelectionDecision(candidates, 1, { cardIds: ["a", "b"] }, fallback))
      .toEqual(fallback);
  });

  it("후보에 없는 id는 걸러내고 나머지만 채택", () => {
    expect(resolveSelectionDecision(candidates, 2, { cardIds: ["a", "nope"] }, fallback))
      .toEqual({ selectedCards: ["a"] });
  });

  it("raw가 없거나 cardIds가 배열이 아니면 fallback", () => {
    expect(resolveSelectionDecision(candidates, 2, null, fallback)).toEqual(fallback);
    expect(resolveSelectionDecision(candidates, 2, { cardIds: "a" } as never, fallback)).toEqual(fallback);
  });
});

describe("resolveDraftDecision", () => {
  const deck = ["a", "a", "b", "c"];
  const fallback = { cardIds: ["a", "b", "c"] };

  it("정상 응답 — 덱에 있는 카드를 정확히 count장", () => {
    expect(resolveDraftDecision(deck, 3, { cardIds: ["a", "a", "b"] }, fallback))
      .toEqual({ cardIds: ["a", "a", "b"] });
  });

  it("개수가 count와 다르면 fallback", () => {
    expect(resolveDraftDecision(deck, 3, { cardIds: ["a", "b"] }, fallback)).toEqual(fallback);
  });

  it("덱에 있는 것보다 많이 요청(중복 초과)하면 fallback", () => {
    // 덱에 a는 2장뿐인데 3장 요청
    expect(resolveDraftDecision(deck, 3, { cardIds: ["a", "a", "a"] }, fallback)).toEqual(fallback);
  });

  it("덱에 없는 id가 섞이면 fallback", () => {
    expect(resolveDraftDecision(deck, 3, { cardIds: ["a", "b", "nope"] }, fallback)).toEqual(fallback);
  });
});

describe("resolveDiscardDecision", () => {
  const hand = ["a", "a", "b"];
  const fallback = { discardCards: ["a::0", "b::2"] };

  it("정상 응답 — id를 hand의 실제 idx로 변환한다", () => {
    const out = resolveDiscardDecision(hand, 2, { cardIds: ["a", "b"] }, fallback);
    expect(out).toEqual({ discardCards: ["a::0", "b::2"] });
  });

  it("같은 id를 중복 요청하면 서로 다른 idx에 매칭된다", () => {
    const out = resolveDiscardDecision(hand, 2, { cardIds: ["a", "a"] }, fallback);
    expect(out).toEqual({ discardCards: ["a::0", "a::1"] });
  });

  it("개수가 count와 다르면 fallback (게임이 멈추는 것을 막는 핵심 케이스)", () => {
    expect(resolveDiscardDecision(hand, 2, { cardIds: ["a"] }, fallback)).toEqual(fallback);
    expect(resolveDiscardDecision(hand, 2, { cardIds: ["a", "a", "b"] }, fallback)).toEqual(fallback);
  });

  it("손패에 있는 것보다 많이 중복 요청하면 fallback", () => {
    // a는 손패에 2장뿐인데 3번 요청
    expect(resolveDiscardDecision(hand, 3, { cardIds: ["a", "a", "a"] }, fallback)).toEqual(fallback);
  });

  it("손패에 없는 id가 섞이면 fallback", () => {
    expect(resolveDiscardDecision(hand, 2, { cardIds: ["a", "nope"] }, fallback)).toEqual(fallback);
  });

  it("raw가 없으면 fallback", () => {
    expect(resolveDiscardDecision(hand, 2, null, fallback)).toEqual(fallback);
  });
});
