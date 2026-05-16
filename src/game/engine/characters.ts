import type { CardEffect, CharacterId, CharacterDef } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  A: {
    id: "A",
    name: "나기",
    maxHp: 12,
    entryEffect: { type: "damage", value: 1, target: "enemy" },
    exitEffect: null,
    affinities: ["제압독", "투척형", "MOLAR", "인법", "제압기", "필살", "준비", "루틴"],
  },
  B: {
    id: "B",
    name: "B",
    maxHp: 12,
    entryEffect: null,
    exitEffect: { type: "heal", value: 2, target: "self" },
    affinities: [],
  },
};
