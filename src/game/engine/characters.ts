import type { CardEffect, CharacterId, CharacterDef } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  A: {
    id: "A",
    maxHp: 25,
    entryEffect: { type: "damage", value: 1, target: "enemy" },
    exitEffect: null,
  },
  B: {
    id: "B",
    maxHp: 20,
    entryEffect: null,
    exitEffect: { type: "heal", value: 1, target: "self" },
  },
};
