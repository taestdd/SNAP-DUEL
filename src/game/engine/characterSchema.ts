import { z } from "zod";
import { CardEffectSchema } from "./cardSchema";

export const CharacterDefSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id는 소문자, 숫자, 언더스코어만 허용"),
  name: z.string().min(1),
  maxHp: z.number().int().min(1),
  entryEffect: CardEffectSchema.nullable(),
  exitEffect: CardEffectSchema.nullable(),
  affinities: z.array(z.string()),
});

export const CharactersRecordSchema = z.record(z.string(), CharacterDefSchema);

export type CharacterDefSchemaType = z.infer<typeof CharacterDefSchema>;
