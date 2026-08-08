import { z } from "zod";
import { ACTION_TAG_TO_POSE } from "./types";

const ACTION_TAG_KEYS = Object.keys(ACTION_TAG_TO_POSE) as [
  keyof typeof ACTION_TAG_TO_POSE,
  ...(keyof typeof ACTION_TAG_TO_POSE)[]
];
export const ActionTagSchema = z.enum(ACTION_TAG_KEYS);

export const HitPoseSchema = z.enum(["hit_weak", "hit_strong", "hit_aerial"]);

export const CardTagSchema = z.enum([
  "마법", "격투", "구룡권", "독", "마나", "특공인법", "혈계권", "혈계", "제압투척구 3형",
  "검술", "방어", "방패", "한손검", "제압독", "투척형", "MOLAR", "인법", "제압기", "필살", "준비", "암기", "power",
]);

export const EffectTypeSchema = z.enum([
  "damage", "block", "draw", "draw_tagged",
  "heal", "buff_attack", "tag", "airborne", "move_cards", "shuffle", "generate",
]);

export const DamageTypeSchema = z.enum(["ground", "anti-air"]);

export const TargetSchema = z.enum(["self", "enemy"]);

export const CardZoneSchema = z.enum(["hand", "deck", "trash", "cooldown", "queue"]);

export const DeckInsertPositionSchema = z.enum(["top", "bottom", "random"]);

export const UseConditionSchema = z.enum(["ground", "airborne"]);

export const CardTypeSchema = z.enum(["attack", "skill"]);

export const ConditionCheckSchema = z.enum([
  "hand_count", "deck_count", "cooldown_count",
  "hp", "bench_hp", "airborne_stack",
  "turn", "round",
]);

export const CompareOpSchema = z.enum(["<", ">", "="]);

export const StatTargetSchema = z.enum([
  "cost", "delay", "ground_attack", "anti_air_attack", "advantage",
]);

export const ModifierConditionSchema = z.object({
  check: ConditionCheckSchema,
  target: TargetSchema,
  op: CompareOpSchema,
  value: z.number().int(),
});

export const StatModifierSchema = z.object({
  condition: ModifierConditionSchema,
  stat: StatTargetSchema,
  delta: z.number().int(),
});

export const CardEffectSchema = z.object({
  type: EffectTypeSchema,
  value: z.number().optional(),
  target: TargetSchema.optional(),
  toTarget: TargetSchema.optional(),
  damageType: DamageTypeSchema.optional(),
  fromZone: CardZoneSchema.optional(),
  toZone: CardZoneSchema.optional(),
  toPosition: DeckInsertPositionSchema.optional(),
  count: z.number().int().min(1).optional(),
  userSelects: z.boolean().optional(),
  tag: CardTagSchema.optional(),
  zone: CardZoneSchema.optional(),
  cardId: z.string().optional(),
});

/**
 * 엄격 작성(write)용 효과 스키마 — 효과 타입별 필수 필드를 강제하는 판별 유니온.
 * 어드민 저장·CSV 임포트 등 "새로 쓰는" 경로에서만 사용한다.
 * 읽기(CardEffectSchema)는 기존 Firestore 데이터 호환을 위해 관대하게 유지한다.
 *
 * 미지정 시 무동작(no-op)이 되는 필드만 필수로 지정:
 *   - value가 없으면 0 → 무의미해지는 효과(damage/block/draw/heal/buff_attack)
 *   - airborne.value는 0(착지)도 유효하므로 min(0)
 *   - generate.cardId / draw_tagged.tag는 없으면 완전 무동작 → 필수
 * (알 수 없는 키는 discriminatedUnion 기본 동작대로 제거됨 — 폼 잔여 필드 허용)
 */
const CardEffectStrictSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("damage"), value: z.number().int().min(1), damageType: DamageTypeSchema.optional(), target: TargetSchema.optional() }),
  z.object({ type: z.literal("block"), value: z.number().int().min(1), target: TargetSchema.optional() }),
  z.object({ type: z.literal("draw"), value: z.number().int().min(1), target: TargetSchema.optional() }),
  z.object({ type: z.literal("heal"), value: z.number().int().min(1), target: TargetSchema.optional() }),
  z.object({ type: z.literal("buff_attack"), value: z.number().int().min(1), target: TargetSchema.optional() }),
  z.object({ type: z.literal("tag"), target: TargetSchema.optional() }),
  z.object({ type: z.literal("airborne"), value: z.number().int().min(0), target: TargetSchema.optional() }),
  z.object({ type: z.literal("shuffle"), zone: CardZoneSchema.optional(), target: TargetSchema.optional() }),
  z.object({
    type: z.literal("generate"),
    cardId: z.string().min(1),
    count: z.number().int().min(1).optional(),
    toZone: CardZoneSchema.optional(),
    toPosition: DeckInsertPositionSchema.optional(),
    target: TargetSchema.optional(),
  }),
  z.object({
    type: z.literal("draw_tagged"),
    tag: CardTagSchema,
    value: z.number().int().min(1).optional(),
    zone: CardZoneSchema.optional(),
    target: TargetSchema.optional(),
  }),
  z.object({
    type: z.literal("move_cards"),
    fromZone: CardZoneSchema.optional(),
    toZone: CardZoneSchema.optional(),
    toPosition: DeckInsertPositionSchema.optional(),
    count: z.number().int().min(1).optional(),
    tag: CardTagSchema.optional(),
    userSelects: z.boolean().optional(),
    target: TargetSchema.optional(),
    toTarget: TargetSchema.optional(),
  }),
]);

export const AltCostHpSchema = z.object({
  type: z.literal("hp"),
  amount: z.number().int().min(1),
});

export const AltCostMoveCardsSchema = z.object({
  type: z.literal("move_cards").optional(),
  target: TargetSchema.optional(),
  fromZone: CardZoneSchema,
  toZone: CardZoneSchema,
  toPosition: DeckInsertPositionSchema.optional(),
  count: z.number().int().min(1),
  tag: CardTagSchema.optional(),
  userSelects: z.boolean().optional(),
});

export const AltCostSchema = z.union([AltCostHpSchema, AltCostMoveCardsSchema]);

export const HitTimingSchema = z.object({
  frame: z.number().int().min(0),
  ground: HitPoseSchema,
  airborne: HitPoseSchema,
  freeze: z.number().int().min(0).optional(),
  zoom: z.number().min(1).optional(),
});

/**
 * 읽기 호환: 구 필드명(speed/gain, statModifiers.stat "speed"/"gain")을
 * 새 이름(delay/advantage)으로 변환해 수용한다.
 * Firestore 마이그레이션(scripts/migrate-delay-advantage.ts) 전의 기존 문서도
 * 정상 파싱되도록 보장. 쓰기 경로(어드민/CSV 임포트)는 항상 새 키로 저장하므로
 * 마이그레이션 완료 후 이 preprocess는 제거해도 된다.
 */
function acceptLegacyCardKeys(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  if (obj.delay === undefined && obj.speed !== undefined) obj.delay = obj.speed;
  if (obj.advantage === undefined && obj.gain !== undefined) obj.advantage = obj.gain;
  delete obj.speed;
  delete obj.gain;
  if (Array.isArray(obj.statModifiers)) {
    obj.statModifiers = obj.statModifiers.map((m) => {
      if (typeof m !== "object" || m === null) return m;
      const mod = { ...(m as Record<string, unknown>) };
      if (mod.stat === "speed") mod.stat = "delay";
      if (mod.stat === "gain") mod.stat = "advantage";
      return mod;
    });
  }
  return obj;
}

const CardObjectSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/, "id는 소문자, 숫자, 언더스코어, 하이픈만 허용"),
  name: z.string().min(1),
  cardType: CardTypeSchema.optional(),
  cost: z.number().int().min(0),
  delay: z.number().int().min(0),
  groundAttack: z.number().int().min(0).optional(),
  antiAirAttack: z.number().int().min(0).optional(),
  advantage: z.number().int().min(0),
  effects: z.array(CardEffectSchema).default([]),
  text: z.string(),
  useCondition: UseConditionSchema.optional(),
  tags: z.array(CardTagSchema).optional(),
  actionTag: ActionTagSchema.optional(),
  actionTagAirborne: ActionTagSchema.optional(),
  hitTimings: z.array(HitTimingSchema).optional(),
  superFlash: z.boolean().optional(),
  // 연출 전용 필드 (게임 로직 무관)
  meleeAttack: z.boolean().optional(),
  knockback: z.boolean().optional(),
  statModifiers: z.array(StatModifierSchema).optional(),
  altCost: AltCostSchema.optional(),
});

export const CardSchema = z.preprocess(acceptLegacyCardKeys, CardObjectSchema);

export const CardsRecordSchema = z.record(z.string(), CardSchema);

export type CardSchemaType = z.infer<typeof CardSchema>;

/**
 * 엄격 작성용 카드 스키마 — effects를 타입별 필수 필드가 강제되는 판별 유니온으로 검증.
 * 읽기용 CardSchema와 필드 구성은 동일하되 effects 검증만 엄격하다.
 * 구 필드명(speed/gain) 호환 preprocess는 그대로 적용된다.
 */
const CardStrictObjectSchema = CardObjectSchema.extend({
  effects: z.array(CardEffectStrictSchema).default([]),
});

export const CardStrictSchema = z.preprocess(acceptLegacyCardKeys, CardStrictObjectSchema);
