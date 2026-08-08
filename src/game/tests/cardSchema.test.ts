import { describe, it, expect } from "vitest";
import { CardSchema, CardsRecordSchema, CardStrictSchema } from "@/game/engine/cardSchema";

/**
 * 구 필드명(speed/gain) 읽기 호환 검증.
 * Firestore 마이그레이션(scripts/migrate-delay-advantage.ts) 전의 기존 문서가
 * 새 스키마(delay/advantage)로 정상 파싱되는지 확인한다.
 */

const NEW_CARD = {
  id: "new_card",
  name: "New Card",
  cost: 1,
  delay: 2,
  advantage: 1,
  effects: [],
  text: "",
};

const LEGACY_CARD = {
  id: "legacy_card",
  name: "Legacy Card",
  cost: 1,
  speed: 3, // 구 필드명
  gain: 2, // 구 필드명
  effects: [],
  text: "",
  statModifiers: [
    { condition: { check: "hp", target: "self", op: "<", value: 10 }, stat: "speed", delta: -1 },
    { condition: { check: "round", target: "self", op: "=", value: 2 }, stat: "gain", delta: 1 },
  ],
};

describe("CardSchema 구 필드명 읽기 호환", () => {
  it("새 키(delay/advantage)는 그대로 파싱된다", () => {
    const parsed = CardSchema.parse(NEW_CARD);
    expect(parsed.delay).toBe(2);
    expect(parsed.advantage).toBe(1);
  });

  it("구 키(speed/gain)를 delay/advantage로 수용한다", () => {
    const parsed = CardSchema.parse(LEGACY_CARD);
    expect(parsed.delay).toBe(3);
    expect(parsed.advantage).toBe(2);
    expect("speed" in parsed).toBe(false);
    expect("gain" in parsed).toBe(false);
  });

  it("statModifiers의 구 stat 이름(speed/gain)도 변환한다", () => {
    const parsed = CardSchema.parse(LEGACY_CARD);
    expect(parsed.statModifiers?.[0].stat).toBe("delay");
    expect(parsed.statModifiers?.[1].stat).toBe("advantage");
  });

  it("새 키가 있으면 구 키는 무시한다 (새 키 우선)", () => {
    const parsed = CardSchema.parse({ ...NEW_CARD, speed: 9, gain: 9 });
    expect(parsed.delay).toBe(2);
    expect(parsed.advantage).toBe(1);
  });

  it("CardsRecordSchema도 구/신 키 혼재 레코드를 파싱한다", () => {
    const parsed = CardsRecordSchema.parse({
      new_card: NEW_CARD,
      legacy_card: LEGACY_CARD,
    });
    expect(parsed.new_card.delay).toBe(2);
    expect(parsed.legacy_card.delay).toBe(3);
    expect(parsed.legacy_card.advantage).toBe(2);
  });

  it("구 키도 새 키도 없으면 파싱 실패 (delay/advantage 필수)", () => {
    const { delay: _d, advantage: _a, ...missing } = NEW_CARD;
    void _d;
    void _a;
    expect(CardSchema.safeParse(missing).success).toBe(false);
  });
});

/**
 * 엄격 작성 스키마(CardStrictSchema) — 효과 타입별 필수 필드 검증.
 * 어드민 저장/임포트 경로에서만 사용. 읽기(CardSchema)는 관대함을 유지한다.
 */
const STRICT_BASE = { id: "sc", name: "Strict Card", cost: 0, delay: 1, advantage: 0, text: "" };

describe("CardStrictSchema 엄격 작성 검증", () => {
  it("유효한 효과는 통과한다", () => {
    const ok = CardStrictSchema.safeParse({ ...STRICT_BASE, effects: [
      { type: "damage", value: 3, target: "enemy" },
      { type: "generate", cardId: "jab", count: 2 },
      { type: "draw_tagged", tag: "마법", value: 1 },
    ] });
    expect(ok.success).toBe(true);
  });

  it("damage에 value가 없으면 실패한다", () => {
    const bad = CardStrictSchema.safeParse({ ...STRICT_BASE, effects: [{ type: "damage", target: "enemy" }] });
    expect(bad.success).toBe(false);
  });

  it("generate에 cardId가 없으면 실패한다", () => {
    const bad = CardStrictSchema.safeParse({ ...STRICT_BASE, effects: [{ type: "generate", count: 1 }] });
    expect(bad.success).toBe(false);
  });

  it("draw_tagged에 tag가 없으면 실패한다", () => {
    const bad = CardStrictSchema.safeParse({ ...STRICT_BASE, effects: [{ type: "draw_tagged", value: 1 }] });
    expect(bad.success).toBe(false);
  });

  it("airborne value 0(착지)은 유효하다", () => {
    const ok = CardStrictSchema.safeParse({ ...STRICT_BASE, effects: [{ type: "airborne", value: 0, target: "self" }] });
    expect(ok.success).toBe(true);
  });

  it("구 필드명(speed/gain) 호환 preprocess는 엄격 스키마에도 적용된다", () => {
    // 신 키(delay/advantage) 우선 원칙이 있으므로 구 키만 있는 카드로 검증
    const { delay: _d, advantage: _a, ...legacyBase } = STRICT_BASE;
    void _d; void _a;
    const parsed = CardStrictSchema.parse({ ...legacyBase, speed: 4, gain: 2, effects: [] });
    expect(parsed.delay).toBe(4);
    expect(parsed.advantage).toBe(2);
  });

  it("읽기용 CardSchema는 value 없는 damage도 관대하게 수용한다", () => {
    // 엄격 스키마는 거부하지만 읽기 경로는 기존 데이터 호환을 위해 통과시킨다
    const lenient = CardSchema.safeParse({ ...STRICT_BASE, effects: [{ type: "damage", target: "enemy" }] });
    expect(lenient.success).toBe(true);
  });
});
