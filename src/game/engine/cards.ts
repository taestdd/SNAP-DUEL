import type { Card } from "./types";

export const CARDS: Record<string, Card> = {

  //본격 카드

    weak_punch: {
    id: "weak_punch",
    name: "Weak Punch",
    cost: 3,
    speed: 2,
    gain: 0,
    effects: [
      { type: "damage", value: 1, target: "enemy", damageType: "ground" }
    ],
    text: "Deal 1 ground damage.",
    actionTag: "weak_punch",
    hitTimings: [{ ms: 150, ground: "hit_weak", airborne: "hit_aerial" }],

  },

  strong_punch: {
    id: "strong_punch",
    name: "Strong Punch",
    cost: 3,
    speed: 3,
    gain: 0,
    effects: [
      { type: "damage", value: 3, target: "enemy", damageType: "ground" }
    ],
    text: "Deal 3 ground damage.",
    actionTag: "strong_punch",
    hitTimings: [{ ms: 200, ground: "hit_strong", airborne: "hit_aerial" }],

  },

  weak_kick: {
    id: "weak_kick",
    name: "Weak Kick",
    cost: 3,
    speed: 3,
    gain: 0,
    effects: [
      { type: "damage", value: 2, target: "enemy", damageType: "ground" },
      { type: "damage", value: 1, target: "enemy", damageType: "anti-air" }
    ],
    text: "Deal 2 ground damage and 1 anti-air damage.",
    actionTag: "weak_kick",
    hitTimings: [{ ms: 200, ground: "hit_weak", airborne: "hit_aerial" }],

  },
  
  strong_kick: {
    id: "strong_kick",
    name: "Strong Kick",
    cost: 3,
    speed: 4,
    gain: 1,
    effects: [
      { type: "damage", value: 3, target: "enemy", damageType: "ground" },
      { type: "damage", value: 1, target: "enemy", damageType: "anti-air" }
    ],
    text: "Deal 3 ground damage and 1 anti-air damage.",
    actionTag: "strong_kick",
    hitTimings: [{ ms: 250, ground: "hit_strong", airborne: "hit_aerial" }],

  },

  dragon_kick: {
    id: "dragon_kick",
    name: "Dragon Kick",
    cost: 4,
    speed: 4,
    gain: 0,
    effects: [
      { type: "damage", value: 2, target: "enemy", damageType: "ground" },
      { type: "damage", value: 4, target: "enemy", damageType: "anti-air" },
      { type: "airborne", value: 2, target: "enemy" },
      { type: "airborne", value: 3, target: "self" },
    ],
    text: "Deal 4 ground damage and 2 anti-air damage. Launch the opponent (airborneStack 2) and boost your own airborneStack by 3.",
    actionTag: "dragon_kick",
    hitTimings: [{ ms: 200, ground: "hit_weak", airborne: "hit_aerial" }],

  },
  
  rising_punch: {
    id: "rising_punch",
    name: "Rising Punch",
    cost: 5,
    speed: 3,
    gain: 0,
    effects: [
      { type: "damage", value: 2, target: "enemy", damageType: "ground" },
      { type: "damage", value: 3, target: "enemy", damageType: "anti-air" },
      { type: "airborne", value: 3, target: "enemy" },
    ],
    text: "Deal 2 ground damage and 3 anti-air damage. Launch the opponent (airborneStack 3).",
    actionTag: "rising_punch",
    hitTimings: [
      { ms: 200, ground: "hit_weak", airborne: "hit_aerial" },
      { ms: 300, ground: "hit_weak", airborne: "hit_aerial" },
      { ms: 400, ground: "hit_aerial", airborne: "hit_aerial" },
    ],

  },

  hadouken: {
    id: "hadouken",
    name: "Hadouken",
    cost: 5,
    speed: 4,
    gain: 0,
    effects: [
      { type: "damage", value: 4, target: "enemy", damageType: "ground" },
      { type: "damage", value: 4, target: "enemy", damageType: "anti-air" },
      { type: "airborne", value: 2, target: "enemy" },
    ],
    text: "Deal 4 ground damage and 4 anti-air damage. Launch the opponent (airborneStack 2).",
    actionTag: "hadouken", 
    hitTimings: [{ ms: 350, ground: "hit_strong", airborne: "hit_aerial" }],

  },

  item_a : {
    id: "item_a",
    name: "Item A",
    cost: 0,
    speed: 1,
    gain: 0,
    effects: [
      { type: "move_cards", target: "self", fromZone: "deck", toZone: "hand", count: 2, userSelects: true }
    ],
    text: "Gain 2 cards from your deck.",
    actionTag: "use_item",
  },

  item_b : {
    id: "item_b",
    name: "Item B",
    cost: 1,
    speed: 1,
    gain: 0,
    effects: [
      { type: "move_cards", target: "self", fromZone: "trash", toZone: "hand", count: 2, userSelects: true }
    ],
    text: "Return 2 cards from your trash to your hand.",
    actionTag: "use_item",
  }, 

  item_c : {
    id: "item_c",
    name: "Item C",
    cost: 0,
    speed: 0,
    gain: 0,
    effects: [
      {type: "move_cards", target: "self", fromZone: "trash", toZone: "deck", count: 3, userSelects: true }
    ],
    text: "Return 3 cards from your trash to your deck.",
    actionTag: "use_item",
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
