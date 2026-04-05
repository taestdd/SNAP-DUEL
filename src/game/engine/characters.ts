import type { CardEffect, CharacterId, CharacterDef } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  A: {
    id: "A",
    maxHp: 15,
    entryEffect: { type: "damage", value: 1, target: "enemy" },
    exitEffect: null,
  },
  B: {
    id: "B",
    maxHp: 10,
    entryEffect: null,
    exitEffect: { type: "heal", value: 1, target: "self" },
  },
};
