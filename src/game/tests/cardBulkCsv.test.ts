import { describe, it, expect } from "vitest";
import { parseCardCsv, splitCsvLine, CSV_COLUMNS } from "@/components/admin/cardBulkCsv";
import { CardStrictSchema } from "@/game/engine/cardSchema";

/**
 * 카드 일괄 등록 CSV 파싱.
 *
 * 이 파서는 실패를 조용히 삼키는 지점이 많다 — 셀 안의 JSON이 깨지면 그 필드만
 * 사라지고 등록은 그대로 진행된다. 그래서 "무엇이 들어가고 무엇이 안 들어가는지"를
 * 테스트로 고정해 둔다.
 */

const H = "id,name,cost,delay,advantage,text";

describe("splitCsvLine", () => {
  it("따옴표 안의 쉼표를 보존한다", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it('""는 따옴표 하나로 푼다', () => {
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
  });

  it("빈 셀도 자리를 지킨다", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("기본 필드", () => {
  it("한 줄을 카드 객체로 바꾼다", () => {
    const [c] = parseCardCsv(`${H}\njab,잽,1,2,0,설명`);
    expect(c).toMatchObject({ id: "jab", name: "잽", cost: 1, delay: 2, advantage: 0, text: "설명" });
  });

  it("id가 빈 행은 건너뛴다", () => {
    expect(parseCardCsv(`${H}\n,이름없음,1,1,0,x\njab,잽,1,1,0,x`)).toHaveLength(1);
  });

  it("헤더만 있으면 빈 배열", () => {
    expect(parseCardCsv(H)).toEqual([]);
  });

  it("구 헤더 speed/gain도 delay/advantage로 받는다", () => {
    const [c] = parseCardCsv(`id,name,cost,speed,gain,text\njab,잽,1,3,2,x`);
    expect(c).toMatchObject({ delay: 3, advantage: 2 });
    expect(c).not.toHaveProperty("speed");
  });
});

/* ── 이번에 추가한 것: 애니메이션 컬럼 ──────────────────────────────── */
describe("애니메이션 컬럼", () => {
  it("actionTag / actionTagAirborne이 들어간다", () => {
    const [c] = parseCardCsv(
      `${H},actionTag,actionTagAirborne\njab,잽,1,2,0,x,weak_punch,aerial_punch`);
    expect(c).toMatchObject({ actionTag: "weak_punch", actionTagAirborne: "aerial_punch" });
  });

  it("hitTimings를 셀 JSON으로 받는다", () => {
    const [c] = parseCardCsv(
      `${H},hitTimings\njab,잽,1,2,0,x,"[{""frame"":2,""ground"":""hit_strong"",""airborne"":""hit_aerial""}]"`);
    expect(c.hitTimings).toEqual([{ frame: 2, ground: "hit_strong", airborne: "hit_aerial" }]);
  });

  it("불리언 옵션을 여러 표기로 받는다", () => {
    const [c] = parseCardCsv(
      `${H},superFlash,meleeAttack,knockback,generateOnly\njab,잽,1,2,0,x,true,1,y,no`);
    expect(c).toMatchObject({ superFlash: true, meleeAttack: true, knockback: true, generateOnly: false });
  });

  it("빈 불리언 칸은 키 자체를 만들지 않는다 (기본값 유지)", () => {
    const [c] = parseCardCsv(`${H},superFlash,knockback\njab,잽,1,2,0,x,,`);
    expect(c).not.toHaveProperty("superFlash");
    expect(c).not.toHaveProperty("knockback");
  });

  it("additionalCost도 셀 JSON으로 받는다", () => {
    const [c] = parseCardCsv(
      `${H},additionalCost\njab,잽,1,2,0,x,"{""requires"":[{""cardId"":""arm_blade"",""zone"":""cooldown"",""count"":1}],""consumeTo"":""trash""}"`);
    expect(c.additionalCost).toMatchObject({ consumeTo: "trash" });
  });
});

/* ── 빈 칸 처리 ──────────────────────────────────────────────────────── */
describe("빈 컬럼은 키를 만들지 않는다", () => {
  it("빈 칸이 NaN이나 빈 배열로 새어 들어가지 않는다", () => {
    // 빈 칸을 그대로 넣으면 groundAttack: NaN, tags: [] 같은 값이 저장된다.
    // 키를 만들지 않아야 스키마 기본값(미지정)이 그대로 유지된다.
    const [c] = parseCardCsv(`${H},groundAttack,tags,actionTag\njab,잽,1,2,0,x,,,`);
    expect(c).not.toHaveProperty("groundAttack");
    expect(c).not.toHaveProperty("tags");
    expect(c).not.toHaveProperty("actionTag");
    expect(Object.keys(c).sort()).toEqual(["advantage", "cost", "delay", "id", "name", "text"]);
  });

  it("hitTimings만 담은 CSV는 그 키만 만든다", () => {
    // 덮어쓰기 경로에서는 이런 부분 입력이 필수 필드 누락으로 검증에서 걸린다.
    // 파서 단계에서는 적힌 것만 담는 것이 맞다.
    const [c] = parseCardCsv(
      `id,hitTimings\nst01_008,"[{""frame"":2,""ground"":""hit_weak"",""airborne"":""hit_aerial""}]"`);
    expect(Object.keys(c).sort()).toEqual(["hitTimings", "id"]);
  });
});

describe("깨진 셀 JSON", () => {
  it("그 필드만 빠지고 나머지는 살아남는다", () => {
    const [c] = parseCardCsv(`${H},hitTimings\njab,잽,1,2,0,x,"[{frame:2}"`);
    expect(c).not.toHaveProperty("hitTimings");
    expect(c).toMatchObject({ id: "jab", name: "잽" });
  });

  it('"dack" 오타는 "deck"으로 고쳐 읽는다', () => {
    const [c] = parseCardCsv(
      `${H},effects\njab,잽,1,2,0,x,"[{""type"":""draw"",""value"":1,""zone"":""dack""}]"`);
    expect((c.effects as { zone: string }[])[0].zone).toBe("deck");
  });
});

describe("파싱 결과가 저장 스키마를 통과한다", () => {
  it("애니메이션 컬럼을 채운 행이 어드민 쓰기 스키마에 맞는다", () => {
    const [c] = parseCardCsv(
      `${H},cardType,groundAttack,antiAirAttack,tags,actionTag,superFlash,meleeAttack,hitTimings\n` +
      `csv_atk,CSV 공격,1,2,1,설명,attack,4,0,"공통,격투",strong_punch,true,true,` +
      `"[{""frame"":2,""ground"":""hit_strong"",""airborne"":""hit_aerial""}]"`);
    const r = CardStrictSchema.safeParse(c);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });
});

describe("CSV_COLUMNS 목록", () => {
  it("안내에 쓰는 목록이 실제 파싱 대상과 일치한다", () => {
    const header = CSV_COLUMNS.join(",");
    const row = CSV_COLUMNS.map((k) =>
      k === "id" ? "x" : k === "tags" ? "공통" : k === "name" ? "n" : k === "text" ? "t"
      : ["cost", "delay", "advantage", "groundAttack", "antiAirAttack"].includes(k) ? "1"
      : ["superFlash", "meleeAttack", "knockback", "generateOnly"].includes(k) ? "true"
      : k === "cardType" ? "attack" : k === "useCondition" ? "ground"
      : k === "actionTag" || k === "actionTagAirborne" ? "weak_punch"
      : "[]").join(",");
    const [c] = parseCardCsv(`${header}\n${row}`);
    // altCost/additionalCost는 []로는 스키마를 못 통과하므로 키 존재만 확인
    for (const k of CSV_COLUMNS) expect(c, k).toHaveProperty(k);
  });
});
