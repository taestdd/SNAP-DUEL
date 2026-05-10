import type { CardEffect, CharacterId, CharacterDef } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  A: {
    id: "A",
    maxHp: 12,
    entryEffect: { type: "damage", value: 1, target: "enemy" },
    exitEffect: null,
    affinities: [],
  },
  B: {
    id: "B",
    maxHp: 12,
    entryEffect: null,
    exitEffect: { type: "heal", value: 2, target: "self" },
    affinities: [],
  },
};
