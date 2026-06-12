import type { CharacterDef } from "./types";
import { CharactersRecordSchema } from "./characterSchema";

export const CHARACTERS: Record<string, CharacterDef> = {};

export function initCharacters(data: unknown): void {
  const loaded = CharactersRecordSchema.parse(data);
  Object.keys(CHARACTERS).forEach((k) => delete CHARACTERS[k]);
  Object.assign(CHARACTERS, loaded);
}

export function registerCharacter(id: string, char: CharacterDef): void {
  CHARACTERS[id] = char;
}

export function getCharacter(id: string): CharacterDef | undefined {
  return CHARACTERS[id];
}
