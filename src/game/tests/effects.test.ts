import { describe, it, expect } from "vitest";
import { applyCardEffectsWithPause, canUseCard, applyTagSwitch } from "@/game/engine/effects";
import { registerCards } from "@/game/engine/cards";
import { registerCharacter } from "@/game/engine/characters";
import type { PlayerId } from "@/game/engine/types";
import { makeState } from "./fixtures";

/* ── 추가 합성 데이터 ─────────────────────────────────────────────── */
registerCards({
  fireball:   { id: "fireball",   name: "Fireball",   cardType: "attack", cost: 0, speed: 2, groundAttack: 4, gain: 0, effects: [], text: "", tags: ["마법"] },
  hp_cost:    { id: "hp_cost",    name: "HP Cost",    cardType: "attack", cost: 0, speed: 2, groundAttack: 5, gain: 0, effects: [], text: "", altCost: { type: "hp", amount: 5 } },
  card_cost:  { id: "card_cost",  name: "Card Cost",  cardType: "attack", cost: 0, speed: 2, groundAttack: 5, gain: 0, effects: [], text: "", altCost: { type: "move_cards", fromZone: "deck", toZone: "trash", count: 2 } },
  aerial_only:{ id: "aerial_only",name: "Aerial Only",cardType: "attack", cost: 0, speed: 2, groundAttack: 0, antiAirAttack: 5, gain: 0, effects: [], text: "", useCondition: "airborne" },
  gut_draw:   { id: "gut_draw",   name: "Gut Draw",   cardType: "attack", cost: 0, speed: 2, groundAttack: 5, gain: 0, effects: [{ type: "draw", target: "self", value: 1 }], text: "" },
  zap:        { id: "zap",        name: "Zap",        cardType: "skill",  cost: 0, speed: 1, gain: 0, effects: [{ type: "damage", target: "enemy", value: 4 }], text: "" },
  make_jab:   { id: "make_jab",   name: "Make Jab",   cardType: "skill",  cost: 0, speed: 1, gain: 0, effects: [{ type: "generate", target: "self", cardId: "jab", count: 2, toZone: "hand" }], text: "" },
  recall:     { id: "recall",     name: "Recall",     cardType: "skill",  cost: 0, speed: 1, gain: 0, effects: [{ type: "move_cards", target: "self", fromZone: "trash", toZone: "hand", count: 1 }], text: "" },
  recall_pick:{ id: "recall_pick",name: "Recall Pick",cardType: "skill",  cost: 0, speed: 1, gain: 0, effects: [{ type: "move_cards", target: "self", fromZone: "trash", toZone: "hand", count: 1, userSelects: true }], text: "" },
  study:      { id: "study",      name: "Study",      cardType: "skill",  cost: 0, speed: 1, gain: 0, effects: [{ type: "draw_tagged", target: "self", tag: "마법", value: 1, zone: "deck" }], text: "" },
  scaling:    { id: "scaling",    name: "Scaling",    cardType: "attack", cost: 0, speed: 2, groundAttack: 2, gain: 0, effects: [], text: "", statModifiers: [{ condition: { check: "hand_count", target: "self", op: "<", value: 99 }, stat: "ground_attack", delta: 3 }] },
});

registerCharacter("mage", { id: "mage", name: "Mage", maxHp: 30, spriteId: "test", entryEffect: null, exitEffect: null, affinities: ["마법"] });
registerCharacter("entry_block", { id: "entry_block", name: "Entry Block", maxHp: 25, spriteId: "test", entryEffect: { type: "block", target: "self", value: 5 }, exitEffect: null, affinities: [] });
registerCharacter("exit_heal", { id: "exit_heal", name: "Exit Heal", maxHp: 30, spriteId: "test", entryEffect: null, exitEffect: { type: "heal", target: "self", value: 5 }, affinities: [] });

// applyCardEffectsWithPause 호출 단축 헬퍼
function apply(state: ReturnType<typeof makeState>, player: PlayerId, cardId: string) {
  return applyCardEffectsWithPause(state, player, cardId, [], 0, [player]);
}

/* ── canUseCard ────────────────────────────────────────────────────── */
describe("canUseCard", () => {
  it("어피니티: 카드 태그가 캐릭터 어피니티에 모두 포함돼야 사용 가능", () => {
    const ok = makeState({ P1: { characters: ["mage", "p1_sub"], activeCharacter: "mage" } });
    expect(canUseCard(ok, "P1", "fireball")).toBe(true);
    expect(canUseCard(makeState(), "P1", "fireball")).toBe(false); // p1_main 어피니티 []
  });
  it("altCost hp: HP가 지불액보다 많아야 사용 가능", () => {
    expect(canUseCard(makeState({ P1: { hp: 30 } }), "P1", "hp_cost")).toBe(true);
    expect(canUseCard(makeState({ P1: { hp: 5 } }), "P1", "hp_cost")).toBe(false);
  });
  it("altCost move_cards: 지불 가능한 카드가 count 이상이어야 함", () => {
    expect(canUseCard(makeState({ P1: { deck: ["a", "b", "c"] } }), "P1", "card_cost")).toBe(true);
    expect(canUseCard(makeState({ P1: { deck: ["a"] } }), "P1", "card_cost")).toBe(false);
  });
  it("useCondition airborne: 체공 중일 때만 사용 가능", () => {
    expect(canUseCard(makeState({ P1: { airborneStack: 1 } }), "P1", "aerial_only")).toBe(true);
    expect(canUseCard(makeState({ P1: { airborneStack: 0 } }), "P1", "aerial_only")).toBe(false);
  });
});

/* ── applyCardEffectsWithPause ─────────────────────────────────────── */
describe("applyCardEffectsWithPause — 공격", () => {
  it("지상 공격이 상대 HP를 깎는다", () => {
    const s = apply(makeState(), "P1", "jab");
    expect(s.AI.hp).toBe(25);
  });
  it("attackBuff가 데미지에 더해진 뒤 소모된다", () => {
    const s = apply(makeState({ P1: { status: { attackBuff: 3 } } }), "P1", "jab");
    expect(s.AI.hp).toBe(22); // 5 + 3
    expect(s.P1.status.attackBuff).toBe(0);
  });
  it("statModifiers가 공격력에 반영된다", () => {
    const s = apply(makeState(), "P1", "scaling");
    expect(s.AI.hp).toBe(25); // base 2 + delta 3
  });
  it("공격이 빗나가면 보너스 효과를 건너뛴다", () => {
    // gut_draw: ground 공격 + draw 보너스. 상대가 체공이면 ground 빗나감 → draw 스킵
    const miss = apply(makeState({ P1: { deck: ["a"] }, AI: { airborneStack: 1 } }), "P1", "gut_draw");
    expect(miss.P1.hand).toEqual([]); // draw 안 됨
    const hit = apply(makeState({ P1: { deck: ["a"] } }), "P1", "gut_draw");
    expect(hit.P1.hand).toEqual(["a"]); // 적중 → draw 됨
  });
});

describe("applyCardEffectsWithPause — 스킬/효과", () => {
  it("skill의 damage 효과", () => {
    const s = apply(makeState(), "P1", "zap");
    expect(s.AI.hp).toBe(26); // 30 - 4
  });
  it("generate: 카드를 손패에 생성", () => {
    const s = apply(makeState({ P1: { hand: [] } }), "P1", "make_jab");
    expect(s.P1.hand).toEqual(["jab", "jab"]);
  });
  it("move_cards(자동): trash에서 hand로 이동", () => {
    const s = apply(makeState({ P1: { trash: ["a"], hand: [] } }), "P1", "recall");
    expect(s.P1.hand).toEqual(["a"]);
    expect(s.P1.trash).toEqual([]);
  });
  it("move_cards(userSelects, P1): WAITING_SELECTION으로 일시정지", () => {
    const s = apply(makeState({ P1: { trash: ["a", "b"] } }), "P1", "recall_pick");
    expect(s.phase).toBe("WAITING_SELECTION");
    expect(s.pendingSelection?.candidates).toEqual(["a", "b"]);
  });
  it("draw_tagged(AI 자동): 태그 일치 카드를 자동 선택", () => {
    const s = apply(makeState({ AI: { deck: ["fireball", "jab"], hand: [] } }), "AI", "study");
    expect(s.AI.hand).toEqual(["fireball"]);
  });
});

/* ── applyTagSwitch ────────────────────────────────────────────────── */
describe("applyTagSwitch", () => {
  it("활성 캐릭터를 교체하고 새 캐릭터 HP로 전환, airborne 초기화", () => {
    const s = applyTagSwitch(
      makeState({ P1: { characters: ["p1_main", "entry_block"], activeCharacter: "p1_main", characterHp: { p1_main: 30, entry_block: 20 }, airborneStack: 2 } }),
      "P1",
    );
    expect(s.P1.activeCharacter).toBe("entry_block");
    expect(s.P1.hp).toBe(20); // 새 캐릭터 HP (진입 block 효과는 hp가 아닌 block에 적용)
    expect(s.P1.airborneStack).toBe(0);
  });
  it("진입 효과가 새 캐릭터로 교체된 뒤 발동된다 (block)", () => {
    const s = applyTagSwitch(
      makeState({ P1: { characters: ["p1_main", "entry_block"], activeCharacter: "p1_main", characterHp: { p1_main: 30, entry_block: 20 } } }),
      "P1",
    );
    expect(s.P1.block).toBe(5);
  });
  it("탈출 효과가 교체 전 현재 캐릭터에 발동된다 (heal)", () => {
    const s = applyTagSwitch(
      makeState({ P1: { characters: ["exit_heal", "p1_sub"], activeCharacter: "exit_heal", hp: 20, characterHp: { exit_heal: 20, p1_sub: 30 } } }),
      "P1",
    );
    expect(s.P1.characterHp["exit_heal"]).toBe(25); // 20 + 5 (heal) 후 벤치로
  });
});
