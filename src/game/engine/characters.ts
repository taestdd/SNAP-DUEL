import type { CharacterDef } from "./types";
import { CharactersRecordSchema } from "./characterSchema";

export const CHARACTERS: Record<string, CharacterDef> = {
  fighter: {
    id: "fighter",
    name: "길거리 격투가",
    maxHp: 12,
    spriteId: "a",
    entryEffect: null,
    exitEffect: null,
    affinities: ["격투", "구룡권"],
  },
  ninja: {
    id: "ninja",
    name: "닌자",
    maxHp: 10,
    spriteId: "b",
    entryEffect: null,
    exitEffect: { type: "draw", value: 1, target: "self" },
    affinities: ["MOLAR", "인법", "격투", "암기"],
  },
};

export function initCharacters(data: unknown): void {
  const loaded = CharactersRecordSchema.parse(data);
  Object.keys(CHARACTERS).forEach((k) => delete CHARACTERS[k]);
  Object.assign(CHARACTERS, loaded);
}

export function getCharacter(id: string): CharacterDef | undefined {
  return CHARACTERS[id];
}
