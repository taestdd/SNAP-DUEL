import { z } from "zod";

export const DeckSchema = z.object({
  id: z.string().min(1).regex(/^[A-Z0-9_]+$/, "id는 대문자, 숫자, 언더스코어만 허용"),
  name: z.string().min(1),
  characters: z.tuple([
    z.string().min(1),
    z.string().min(1),
  ]).refine(([a, b]) => a !== b, "선발과 후발 캐릭터는 달라야 합니다"),
  cards: z.array(z.string().min(1)).min(20, "최소 20장 이상이어야 합니다"),
});

export const DecksRecordSchema = z.record(z.string(), DeckSchema);

export type DeckSchemaType = z.infer<typeof DeckSchema>;
