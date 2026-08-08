import { z } from "zod";
import { CardEffectSchema } from "./cardSchema";

export const CharacterDefSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id는 소문자, 숫자, 언더스코어만 허용"),
  name: z.string().min(1),
  maxHp: z.number().int().min(1),
  spriteId: z.string().min(1),
  // 단일 효과(기존 데이터)와 배열을 모두 허용 — 효과 여러 개가 필요한 캐릭터가 있다
  entryEffect: z.union([CardEffectSchema, z.array(CardEffectSchema)]).nullable(),
  exitEffect: z.union([CardEffectSchema, z.array(CardEffectSchema)]).nullable(),
  affinities: z.array(z.string()),
});

export const CharactersRecordSchema = z.record(z.string(), CharacterDefSchema);

export type CharacterDefSchemaType = z.infer<typeof CharacterDefSchema>;
