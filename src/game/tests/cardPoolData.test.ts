import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CardSchema, CardStrictSchema } from "@/game/engine/cardSchema";
import { CharacterDefSchema } from "@/game/engine/characterSchema";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";
import { CHARACTER_SPRITES } from "@/game/animation/spriteMap";
import type { CardSchemaType } from "@/game/engine/cardSchema";

/**
 * scripts/card-pool-v0.3.json — 어드민 일괄 등록에 넣을 신규 카드 33종.
 *
 * 등록 전에 데이터 자체를 검증한다. 일괄 등록 UI는 CardSchema로 파싱하고
 * 서버 저장은 더 엄격한 스키마를 쓰므로, 양쪽 모두 여기서 미리 막는다.
 */

const POOL: unknown[] = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/card-pool-v0.3.json"), "utf-8"),
);

const cards = POOL as CardSchemaType[];

describe("카드 풀 데이터 (card-pool-v0.3.json)", () => {
  it("33종이다", () => {
    expect(POOL).toHaveLength(33);
  });

  it("id가 중복되지 않는다", () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(POOL.map((c) => [(c as CardSchemaType).id, c] as const))(
    "%s — 읽기 스키마(CardSchema) 통과",
    (_id, card) => {
      const r = CardSchema.safeParse(card);
      if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "));
      expect(r.success).toBe(true);
    },
  );

  it.each(POOL.map((c) => [(c as CardSchemaType).id, c] as const))(
    "%s — 저장 스키마(CardStrictSchema) 통과",
    (_id, card) => {
      const r = CardStrictSchema.safeParse(card);
      if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "));
      expect(r.success).toBe(true);
    },
  );
});

describe("카드 풀 정합성", () => {
  const byId = new Map(cards.map((c) => [c.id, c]));

  it("generate가 참조하는 카드가 풀 안에 존재한다", () => {
    for (const card of cards) {
      for (const e of card.effects ?? []) {
        if (e.type !== "generate" || !e.cardId) continue;
        expect(byId.has(e.cardId), `${card.id} → generate ${e.cardId}`).toBe(true);
      }
    }
  });

  it("additionalCost가 요구하는 카드가 풀 안에 존재한다", () => {
    for (const card of cards) {
      for (const req of card.additionalCost?.requires ?? []) {
        expect(byId.has(req.cardId), `${card.id} → requires ${req.cardId}`).toBe(true);
      }
    }
  });

  it("생성으로만 등장하는 카드(파츠·토큰)는 generateOnly로 표시돼 덱 구축에서 빠진다", () => {
    for (const id of ["arm_shield", "arm_blade", "arm_launcher", "toxin_dummy"]) {
      expect(byId.get(id)?.generateOnly, id).toBe(true);
    }
  });

  it("파츠 순환이 방패 → 칼날 → 사출 → 방패로 닫힌다", () => {
    const nextArm = (id: string) =>
      byId.get(id)?.effects?.find((e) => e.type === "generate")?.cardId;

    expect(nextArm("arm_shield")).toBe("arm_blade");
    expect(nextArm("arm_blade")).toBe("arm_launcher");
    expect(nextArm("arm_launcher")).toBe("arm_shield");
  });

  it("공격 카드는 공격 스탯과 히트 타이밍을 갖는다 (HP 바 갱신 타이밍에 필요)", () => {
    for (const card of cards.filter((c) => c.cardType === "attack")) {
      const hasAttack = (card.groundAttack ?? 0) > 0 || (card.antiAirAttack ?? 0) > 0;
      expect(hasAttack, `${card.id} 공격 스탯`).toBe(true);
      expect((card.hitTimings ?? []).length, `${card.id} hitTimings`).toBeGreaterThan(0);
    }
  });

  it("모든 카드가 어피니티용 태그를 갖는다 (토큰 포함)", () => {
    for (const card of cards) {
      expect((card.tags ?? []).length, card.id).toBeGreaterThan(0);
    }
  });

  it("딜레이 정책 — 토큰만 5 이상", () => {
    for (const card of cards) {
      if (card.id === "toxin_dummy") continue;
      expect(card.delay, card.id).toBeLessThanOrEqual(4);
    }
    expect(byId.get("toxin_dummy")?.delay).toBe(9);
  });
});

/* ── 캐릭터 풀 데이터 ─────────────────────────────────────────────────── */

const CHARACTERS: unknown[] = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/character-pool-v0.3.json"), "utf-8"),
);

describe("캐릭터 풀 데이터 (character-pool-v0.3.json)", () => {
  const chars = CHARACTERS as CharacterDefSchemaType[];
  const cardIds = new Set(cards.map((c) => c.id));
  const spriteIds = Object.keys(CHARACTER_SPRITES);

  it("3종이다", () => {
    expect(CHARACTERS).toHaveLength(3);
  });

  it.each(CHARACTERS.map((c) => [(c as CharacterDefSchemaType).id, c] as const))(
    "%s — 스키마 통과",
    (_id, char) => {
      const r = CharacterDefSchema.safeParse(char);
      if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "));
      expect(r.success).toBe(true);
    },
  );

  it("등록된 스프라이트만 참조한다 (오타 시 게임에서 조용히 폴백됨)", () => {
    for (const c of chars) {
      expect(spriteIds, c.id).toContain(c.spriteId);
    }
  });

  it("entry/exitEffect가 생성하는 카드가 카드 풀에 존재한다", () => {
    for (const c of chars) {
      const effects = [c.entryEffect, c.exitEffect]
        .flatMap((e) => (Array.isArray(e) ? e : e ? [e] : []));
      for (const e of effects) {
        if (e.type !== "generate" || !e.cardId) continue;
        expect(cardIds.has(e.cardId), `${c.id} → generate ${e.cardId}`).toBe(true);
      }
    }
  });

  it("어피니티가 공통 + 조직 + 개인 3층 구조를 갖는다", () => {
    for (const c of chars) {
      expect(c.affinities, c.id).toContain("공통");
      // 조직 태그를 최소 하나 (DM-7만 공안·기계 둘 다)
      expect(c.affinities.some((a) => a === "공안" || a === "기계"), c.id).toBe(true);
    }
  });

  it("카드 풀의 개인 태그를 쓸 캐릭터가 각각 존재한다", () => {
    for (const personal of ["나기", "우카이", "DM-7"]) {
      const owner = chars.find((c) => c.affinities.includes(personal));
      expect(owner, `${personal} 태그를 쓸 캐릭터 없음`).toBeDefined();
    }
  });

  /**
   * 어피니티는 카드 태그를 **전부** 요구하므로, 플레이버 태그 하나만 빠져도
   * 그 카드는 아무도 못 쓰는 죽은 카드가 된다.
   * (실제로 나기의 "투척형", DM-7의 "파츠"가 이 검사에서 걸렸다)
   */
  it("토큰을 제외한 모든 카드를 최소 한 캐릭터가 쓸 수 있다", () => {
    for (const card of cards) {
      if ((card.tags ?? []).includes("토큰")) continue;
      const usable = chars.some((c) => (card.tags ?? []).every((t) => c.affinities.includes(t)));
      expect(usable, `${card.id} (${(card.tags ?? []).join(", ")}) — 쓸 수 있는 캐릭터 없음`).toBe(true);
    }
  });

  it("토큰은 어느 캐릭터도 쓸 수 없다 (상대 덱을 막는 죽은 카드가 목적)", () => {
    const token = cards.find((c) => c.id === "toxin_dummy")!;
    const usable = chars.some((c) => (token.tags ?? []).every((t) => c.affinities.includes(t)));
    expect(usable).toBe(false);
  });
});
