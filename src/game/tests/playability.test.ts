import { describe, it, expect } from "vitest";
import {
  getCardPlayability,
  canUseCard,
  canPlayCard,
  getPlayableCards,
} from "@/game/engine/effects";
import { queueCard } from "@/game/engine/turn";
import { registerCards } from "@/game/engine/cards";
import { registerCharacter } from "@/game/engine/characters";
import { makeState } from "./fixtures";

/* ── 합성 데이터 ──────────────────────────────────────────────────────── */
registerCards({
  // 코스트 3, 보정/조건/altCost 없음 — 순수 코스트 판정용
  costly3:  { id: "costly3",  name: "Costly 3",  cardType: "attack", cost: 3, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "" },
  // 코스트 1 + 항상 발동하는 +2 코스트 보정 → 실효 코스트 3
  cost_up:  { id: "cost_up",  name: "Cost Up",   cardType: "attack", cost: 1, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "",
              statModifiers: [{ condition: { check: "hand_count", target: "self", op: "<", value: 99 }, stat: "cost", delta: 2 }] },
  // 어피니티 "마법" 필요
  pl_magic: { id: "pl_magic", name: "Magic",     cardType: "attack", cost: 0, delay: 2, groundAttack: 4, advantage: 0, effects: [], text: "", tags: ["마법"] },
  // altCost hp 5
  pl_hp:    { id: "pl_hp",    name: "HP Cost",   cardType: "attack", cost: 0, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "", altCost: { type: "hp", amount: 5 } },
  // altCost 덱 2장 지불
  pl_cards: { id: "pl_cards", name: "Card Cost", cardType: "attack", cost: 0, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "", altCost: { type: "move_cards", fromZone: "deck", toZone: "trash", count: 2 } },
  // 체공 전용
  pl_air:   { id: "pl_air",   name: "Aerial",    cardType: "attack", cost: 0, delay: 2, groundAttack: 0, antiAirAttack: 5, advantage: 0, effects: [], text: "", useCondition: "airborne" },
});

registerCharacter("pl_mage", { id: "pl_mage", name: "PL Mage", maxHp: 30, spriteId: "test", entryEffect: null, exitEffect: null, affinities: ["마법"] });

/* ── getCardPlayability: 개별 플래그 ──────────────────────────────────── */
describe("getCardPlayability", () => {
  it("costOk: 실효 코스트 ≤ 덱 장수 (경계 포함)", () => {
    expect(getCardPlayability(makeState({ P1: { deck: ["a", "b", "c"], hand: ["costly3"] } }), "P1", "costly3").costOk).toBe(true);  // 3 ≤ 3
    expect(getCardPlayability(makeState({ P1: { deck: ["a", "b"], hand: ["costly3"] } }), "P1", "costly3").costOk).toBe(false);      // 3 > 2
  });

  it("effectiveCost: statModifiers 코스트 보정 반영", () => {
    const p = getCardPlayability(makeState({ P1: { deck: ["a", "b", "c"], hand: ["cost_up"] } }), "P1", "cost_up");
    expect(p.effectiveCost).toBe(3); // base 1 + delta 2
    expect(p.costOk).toBe(true);     // 3 ≤ 3
  });

  it("affinityMet: 카드 태그가 캐릭터 어피니티에 포함돼야 true", () => {
    const mage = makeState({ P1: { characters: ["pl_mage", "p1_sub"], activeCharacter: "pl_mage", hand: ["pl_magic"] } });
    expect(getCardPlayability(mage, "P1", "pl_magic").affinityMet).toBe(true);
    expect(getCardPlayability(makeState({ P1: { hand: ["pl_magic"] } }), "P1", "pl_magic").affinityMet).toBe(false); // p1_main 어피니티 []
  });

  it("altCostOk(hp): HP가 지불액보다 많아야 true", () => {
    expect(getCardPlayability(makeState({ P1: { hp: 30, hand: ["pl_hp"] } }), "P1", "pl_hp").altCostOk).toBe(true);
    expect(getCardPlayability(makeState({ P1: { hp: 5, hand: ["pl_hp"] } }), "P1", "pl_hp").altCostOk).toBe(false);
  });

  it("altCostOk(move_cards): 지불 가능 카드가 count 이상이어야 true", () => {
    expect(getCardPlayability(makeState({ P1: { deck: ["a", "b"], hand: ["pl_cards"] } }), "P1", "pl_cards").altCostOk).toBe(true);
    expect(getCardPlayability(makeState({ P1: { deck: ["a"], hand: ["pl_cards"] } }), "P1", "pl_cards").altCostOk).toBe(false);
  });

  it("conditionMet(airborne): 체공 중일 때만 true", () => {
    expect(getCardPlayability(makeState({ P1: { airborneStack: 1, hand: ["pl_air"] } }), "P1", "pl_air").conditionMet).toBe(true);
    expect(getCardPlayability(makeState({ P1: { airborneStack: 0, hand: ["pl_air"] } }), "P1", "pl_air").conditionMet).toBe(false);
  });

  it("playable: 모든 플래그의 AND", () => {
    // 어피니티 충족 + 코스트 0 → playable
    const ok = makeState({ P1: { characters: ["pl_mage", "p1_sub"], activeCharacter: "pl_mage", hand: ["pl_magic"] } });
    expect(getCardPlayability(ok, "P1", "pl_magic").playable).toBe(true);
    // 어피니티 불충족 → 다른 플래그가 OK여도 playable false
    expect(getCardPlayability(makeState({ P1: { hand: ["pl_magic"] } }), "P1", "pl_magic").playable).toBe(false);
  });

  it("존재하지 않는 카드는 모두 false", () => {
    const p = getCardPlayability(makeState(), "P1", "nope");
    expect(p.playable).toBe(false);
    expect(p.costOk).toBe(false);
  });
});

/* ── canUseCard: 코스트를 제외한 규칙 자격 (기존 동작 유지) ──────────── */
describe("canUseCard (코스트 비포함)", () => {
  it("덱이 부족해도 규칙 자격만 맞으면 true (코스트는 보지 않음)", () => {
    // 덱 0장이라 코스트 3 지불 불가하지만, canUseCard는 코스트를 안 보므로 true
    const s = makeState({ P1: { deck: [], hand: ["costly3"] } });
    expect(canUseCard(s, "P1", "costly3")).toBe(true);
    expect(canPlayCard(s, "P1", "costly3")).toBe(false); // 코스트 포함하면 false
  });
});

/* ── getPlayableCards ─────────────────────────────────────────────────── */
describe("getPlayableCards", () => {
  it("사용 가능 카드만 인덱스와 함께 반환", () => {
    // costly3(코스트3, 덱2 부족), jab(코스트0 OK), pl_air(체공 필요, 지상이라 제외)
    const s = makeState({ P1: { deck: ["a", "b"], hand: ["costly3", "jab", "pl_air"] } });
    expect(getPlayableCards(s, "P1")).toEqual([{ id: "jab", idx: 1 }]);
  });

  it("같은 카드 중복 인덱스를 모두 반환", () => {
    const s = makeState({ P1: { deck: [], hand: ["jab", "jab"] } });
    expect(getPlayableCards(s, "P1")).toEqual([{ id: "jab", idx: 0 }, { id: "jab", idx: 1 }]);
  });
});

/* ── 3자 정합성: 판정 === 집행(queueCard) ─────────────────────────────── */
describe("정합성: getCardPlayability.playable === queueCard 집행 결과", () => {
  function tryQueue(state: ReturnType<typeof makeState>, cardId: string) {
    const s = { ...state, phase: "SETUP_INIT" as const };
    const after = queueCard(s, "P1", cardId, s.P1.hand.indexOf(cardId));
    return after.P1.queue.includes(cardId); // 실제로 큐에 올라갔는가
  }

  it("코스트 충족 카드: playable=true 이고 큐에 올라간다", () => {
    const s = makeState({ P1: { deck: ["a", "b", "c"], hand: ["costly3"] } });
    expect(getCardPlayability(s, "P1", "costly3").playable).toBe(true);
    expect(tryQueue(s, "costly3")).toBe(true);
  });

  it("코스트 부족 카드: playable=false 이고 큐에 안 올라간다", () => {
    const s = makeState({ P1: { deck: ["a", "b"], hand: ["costly3"] } });
    expect(getCardPlayability(s, "P1", "costly3").playable).toBe(false);
    expect(tryQueue(s, "costly3")).toBe(false);
  });

  it("코스트 보정(+2) 카드: 실효 코스트로 판정·집행이 일치한다", () => {
    // raw cost 1 ≤ deck 2 이지만 실효 코스트 3 > 2 → 양쪽 모두 거부 (raw cost 버그 회귀 방지)
    const s = makeState({ P1: { deck: ["a", "b"], hand: ["cost_up"] } });
    expect(getCardPlayability(s, "P1", "cost_up").playable).toBe(false);
    expect(tryQueue(s, "cost_up")).toBe(false);
  });
});
