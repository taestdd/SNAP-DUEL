import type { Card } from "./types";

export const CARDS: Record<string, Card> = {
  // 1 cost
  quick_strike: {
    id: "quick_strike",
    name: "Quick Strike",
    cost: 1,
    speed: 1,
    gain: 1,
    effect: "damage",
    value: 2,
    target: "enemy",
    text: "Deal 2 damage.",
  },

  minor_guard: {
    id: "minor_guard",
    name: "Minor Guard",
    cost: 1,
    speed: 2,
    gain: 0,
    effect: "block",
    value: 2,
    target: "self",
    text: "Gain 2 Block.",
  },

  peek: {
    id: "peek",
    name: "Peek",
    cost: 1,
    speed: 1,
    gain: 1,
    effect: "draw",
    value: 1,
    target: "self",
    text: "Draw 1 card.",
  },

  // 2 cost
  heavy_slash: {
    id: "heavy_slash",
    name: "Heavy Slash",
    cost: 2,
    speed: 4,
    gain: 1,
    effect: "damage",
    value: 6,
    target: "enemy",
    text: "Deal 6 damage.",
  },

  piercing_strike: {
    id: "piercing_strike",
    name: "Piercing Strike",
    cost: 2,
    speed: 3,
    gain: 1,
    effect: "damage",
    value: 5,
    target: "enemy",
    text: "Deal 5 damage.",
  },

  // 3 cost
  power_strike: {
    id: "power_strike",
    name: "Power Strike",
    cost: 3,
    speed: 6,
    gain: 1,
    effect: "damage",
    value: 9,
    target: "enemy",
    text: "Deal 9 damage.",
  },

  crushing_blow: {
    id: "crushing_blow",
    name: "Crushing Blow",
    cost: 3,
    speed: 7,
    gain: 1,
    effect: "damage",
    value: 10,
    target: "enemy",
    text: "Deal 10 damage.",
  },

  // 4 cost
  execution_blade: {
    id: "execution_blade",
    name: "Execution Blade",
    cost: 4,
    speed: 8,
    gain: 0,
    effect: "damage",
    value: 14,
    target: "enemy",
    text: "Deal 14 damage.",
  },

  arcane_burst: {
    id: "arcane_burst",
    name: "Arcane Burst",
    cost: 4,
    speed: 7,
    gain: 0,
    effect: "damage",
    value: 12,
    target: "enemy",
    text: "Deal 12 damage.",
  },

  meteor_strike: {
    id: "meteor_strike",
    name: "Meteor Strike",
    cost: 4,
    speed: 9,
    gain: 0,
    effect: "damage",
    value: 16,
    target: "enemy",
    text: "Deal 16 damage.",
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