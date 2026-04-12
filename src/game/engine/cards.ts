import type { ActionTag, Card } from "./types";

export const CARDS: Record<string, Card> = {
  // 1 cost
  quick_strike: {
    id: "quick_strike",
    name: "Quick Strike",
    cost: 3,
    speed: 1,
    gain: 1,
    effects: [
      { type: "damage", value: 2, target: "enemy", damageType: "ground" }
    ],
    text: "Deal 2 ground damage.",
    tags: ["검술", "한손검"],
    actionTag: "punch" as ActionTag,
  },

  minor_guard: {
    id: "minor_guard",
    name: "Minor Guard",
    cost: 3,
    speed: 2,
    gain: 0,
    effects: [
      { type: "block", value: 3, target: "self" }
    ],
    text: "Gain 3 Block.",
    tags: ["방어", "방패"],
    actionTag: "guard" as ActionTag,
  },

  peek: {
    id: "peek",
    name: "Peek",
    cost: 3,
    speed: 1,
    gain: 1,
    effects: [
      { type: "draw", value: 1, target: "self" }
    ],
    text: "Draw 1 card.",
    tags: ["마법"],
    actionTag: "utility" as ActionTag,
  },

  // 2 cost
  heavy_slash: {
    id: "heavy_slash",
    name: "Heavy Slash",
    cost: 5,
    speed: 4,
    gain: 1,
    effects: [
      { type: "damage", value: 4, target: "enemy", damageType: "ground" }
    ],
    text: "Deal 4 ground damage.",
    tags: ["검술", "한손검"],
    actionTag: "slash" as ActionTag,
  },

  piercing_strike: {
    id: "piercing_strike",
    name: "Piercing Strike",
    cost: 5,
    speed: 3,
    gain: 1,
    effects: [
      { type: "damage", value: 4, target: "enemy", damageType: "ground" }
    ],
    text: "Deal 4 ground damage.",
    tags: ["검술", "한손검"],
    actionTag: "slash" as ActionTag,
  },

  // 3 cost
  power_strike: {
    id: "power_strike",
    name: "Power Strike",
    cost: 7,
    speed: 6,
    gain: 1,
    effects: [
      { type: "damage", value: 6, target: "enemy", damageType: "ground" }
    ],
    text: "Deal 6 ground damage.",
    tags: ["격투"],
    actionTag: "punch" as ActionTag,
  },

  crushing_blow: {
    id: "crushing_blow",
    name: "Crushing Blow",
    cost: 7,
    speed: 7,
    gain: 1,
    effects: [
      { type: "damage", value: 7, target: "enemy", damageType: "ground" }
    ],
    text: "Deal 7 ground damage.",
    tags: ["격투"],
    actionTag: "kick" as ActionTag,
  },

  // 4 cost
  execution_blade: {
    id: "execution_blade",
    name: "Execution Blade",
    cost: 10,
    speed: 8,
    gain: 0,
    effects: [
      { type: "damage", value: 10, target: "enemy", damageType: "ground" },
      { type: "draw", value: 1, target: "self" }
    ],
    text: "Deal 10 ground damage. Draw 1.",
    tags: ["검술", "한손검"],
    actionTag: "slash" as ActionTag,
  },

  arcane_burst: {
    id: "arcane_burst",
    name: "Arcane Burst",
    cost: 10,
    speed: 7,
    gain: 0,
    effects: [
      { type: "damage", value: 9, target: "enemy", damageType: "ground" },
      { type: "draw", value: 1, target: "self" }
    ],
    text: "Deal 9 ground damage. Draw 1.",
    tags: ["마법"],
    actionTag: "special_attack" as ActionTag,
  },

  meteor_strike: {
    id: "meteor_strike",
    name: "Meteor Strike",
    cost: 10,
    speed: 9,
    gain: 0,
    effects: [
      { type: "damage", value: 12, target: "enemy", damageType: "ground" },
      { type: "draw", value: 1, target: "self" }
    ],
    text: "Deal 12 ground damage. Draw 1.",
    tags: ["마법"],
    actionTag: "special_attack" as ActionTag,
  },

  // 복합 효과 카드
  life_drain: {
    id: "life_drain",
    name: "Life Drain",
    cost: 4,
    speed: 4,
    gain: 1,
    effects: [
      { type: "heal", value: 2, target: "self" },
      { type: "damage", value: 2, target: "enemy", damageType: "ground" },
    ],
    text: "Heal 2, then deal 2 ground damage.",
    tags: ["마법"],
    actionTag: "heal" as ActionTag,
  },

  // 에어본 시스템 카드

  // 체공 유발 카드: 상대에게 airborneStack 부여
  launcher: {
    id: "launcher",
    name: "Launcher",
    cost: 4,
    speed: 4,
    gain: 1,
    effects: [
      { type: "damage", value: 2, target: "enemy", damageType: "ground" },
      { type: "airborne", value: 2, target: "enemy" },
    ],
    text: "Deal 2 ground damage and launch the opponent (airborneStack 2).",
    tags: ["격투"],
    actionTag: "kick" as ActionTag,
  },

  // 대공 데미지 카드: 상대가 체공 상태일 때만 피해
  anti_air_strike: {
    id: "anti_air_strike",
    name: "Anti-Air Strike",
    cost: 4,
    speed: 2,
    gain: 1,
    effects: [
      { type: "damage", value: 6, target: "enemy", damageType: "anti-air" },
    ],
    text: "Deal 6 anti-air damage — only hits airborne targets.",
    tags: ["검술"],
    actionTag: "special_attack" as ActionTag,
  },

  // 사용 조건 있는 카드: 체공 상태에서만 사용 가능
  aerial_combo: {
    id: "aerial_combo",
    name: "Aerial Combo",
    cost: 3,
    speed: 2,
    gain: 1,
    effects: [
      { type: "damage", value: 4, target: "enemy", damageType: "anti-air" },
    ],
    text: "Only usable while airborne. Deal 4 anti-air damage.",
    tags: ["격투"],
    useCondition: "airborne",
    actionTag: "kick" as ActionTag,
  },

  // move_cards 카드
  reclaim_blade: {
    id: "reclaim_blade",
    name: "Reclaim Blade",
    cost: 3,
    speed: 5,
    gain: 0,
    effects: [
      {
        type: "move_cards",
        target: "self",
        fromZone: "trash",
        toZone: "hand",
        count: 1,
        userSelects: true,
      }
    ],
    text: "Choose 1 card from your trash and return it to your hand.",
    actionTag: "utility" as ActionTag,
  },

  // 태그 카드
  tag_switch: {
    id: "tag_switch",
    name: "Tag",
    cost: 2,
    speed: 3,
    gain: 0,
    effects: [
      { type: "tag" }
    ],
    text: "Switch active character. Exit effect triggers first, then entry effect.",
    actionTag: "tag_attack" as ActionTag,
  },
};

/**
 * 안전한 카드 조회 (없는 id면 undefined)
 */
export function getCard(id: string): Card | undefined {
  return CARDS[id];
}

/**
 * 개발 중 카드 정의 검증:
 * - speed는 0 이상 정수
 * - cost는 0 이상 정수
 */
if (process.env.NODE_ENV !== "production") {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.id !== id) {
      throw new Error(`Card id mismatch: key="${id}" vs card.id="${c.id}"`);
    }
    if (!Number.isInteger(c.speed) || c.speed < 0) {
      throw new Error(`Invalid speed for card "${id}": ${c.speed}`);
    }
    if (!Number.isInteger(c.cost) || c.cost < 0) {
      throw new Error(`Invalid cost for card "${id}": ${c.cost}`);
    }
  }
}
