import { describe, it, expect } from "vitest";
import { CardSchema, CardsRecordSchema } from "@/game/engine/cardSchema";

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
