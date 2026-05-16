import type { CardEffect, CharacterId, CharacterDef } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  A: {
    id: "A",
    name: "길거리 격투가",
    maxHp: 12,
    entryEffect: null,
    exitEffect: null,
    affinities: [ "격투", "구룡권"],
  },
  B: {
    id: "B",
    name: "닌자",
    maxHp: 10,
    entryEffect: null,
    exitEffect: { type: "draw", value: 1, target: "self" },
    affinities: ["MOLAR", "인법", "격투", "암기"],
  },
};
