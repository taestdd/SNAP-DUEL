import { describe, it, expect } from "vitest";
import { parseDeckBulkInput, formatDeckBulkInput } from "@/components/admin/deckBulkInput";

/**
 * 덱 일괄 입력 파서 — "카드 id + 매수" 텍스트를 덱 구성으로.
 * 어드민에서 덱리스트를 통째로 붙여넣는 경로라, 잘못된 줄을 조용히 삼키면 안 된다.
 */

const KNOWN = ["koan_search", "mech_joint", "nagi_calm", "arm_shield", "toxin_dummy"];
const GENERATE_ONLY = ["arm_shield", "toxin_dummy"];

const parse = (text: string) =>
  parseDeckBulkInput(
    text,
    (id) => KNOWN.includes(id),
    (id) => GENERATE_ONLY.includes(id),
  );

describe("parseDeckBulkInput — 형식", () => {
  it("매수를 생략하면 1장", () => {
    expect(parse("koan_search").entries).toEqual([{ cardId: "koan_search", count: 1 }]);
  });

  it("공백·쉼표·x 표기를 모두 받는다", () => {
    for (const line of ["koan_search 3", "koan_search,3", "koan_search, 3", "koan_search x3", "koan_search X 3", "koan_search\t3"]) {
      expect(parse(line).entries, line).toEqual([{ cardId: "koan_search", count: 3 }]);
    }
  });

  it("빈 줄과 주석은 무시한다", () => {
    const text = ["# 공안", "", "koan_search 2", "// 기계", "  ", "mech_joint 1"].join("\n");
    expect(parse(text).entries).toEqual([
      { cardId: "koan_search", count: 2 },
      { cardId: "mech_joint", count: 1 },
    ]);
  });

  it("같은 카드가 여러 줄에 있으면 합산한다", () => {
    expect(parse("koan_search 2\nkoan_search 3").entries).toEqual([{ cardId: "koan_search", count: 5 }]);
  });

  it("입력 순서를 유지한다", () => {
    const ids = parse("nagi_calm 1\nkoan_search 1\nmech_joint 1").entries.map((e) => e.cardId);
    expect(ids).toEqual(["nagi_calm", "koan_search", "mech_joint"]);
  });
});

describe("parseDeckBulkInput — 거부", () => {
  it("없는 카드 id를 따로 모은다", () => {
    const r = parse("koan_search 1\nnot_a_card 2");
    expect(r.entries).toEqual([{ cardId: "koan_search", count: 1 }]);
    expect(r.unknown).toEqual(["not_a_card"]);
  });

  it("생성 전용 카드는 덱에 넣지 않는다", () => {
    const r = parse("arm_shield 1\ntoxin_dummy 3\nkoan_search 1");
    expect(r.entries).toEqual([{ cardId: "koan_search", count: 1 }]);
    expect(r.generateOnly).toEqual(["arm_shield", "toxin_dummy"]);
  });

  it("매수가 0·음수·소수·문자면 형식 오류", () => {
    for (const line of ["koan_search 0", "koan_search -2", "koan_search 1.5", "koan_search abc"]) {
      const r = parse(line);
      expect(r.entries, line).toHaveLength(0);
      expect(r.invalid, line).toEqual([line]);
    }
  });

  it("토큰이 3개 이상인 줄은 형식 오류", () => {
    const r = parse("koan_search 1 extra");
    expect(r.entries).toHaveLength(0);
    expect(r.invalid).toEqual(["koan_search 1 extra"]);
  });

  it("id 끝의 x는 수량 표기로 잘못 해석되지 않는다", () => {
    // "koan_searchx3"는 공백이 없으므로 하나의 id로 읽고, 존재하지 않으므로 unknown
    const r = parse("koan_searchx3");
    expect(r.entries).toHaveLength(0);
    expect(r.unknown).toEqual(["koan_searchx3"]);
  });

  it("같은 오류가 여러 번 나와도 중복 보고하지 않는다", () => {
    const r = parse("not_a_card 1\nnot_a_card 2");
    expect(r.unknown).toEqual(["not_a_card"]);
  });
});

describe("formatDeckBulkInput", () => {
  it("id 순으로 'id 매수' 줄을 만든다", () => {
    expect(formatDeckBulkInput({ mech_joint: 3, koan_search: 1 }))
      .toBe("koan_search 1\nmech_joint 3");
  });

  it("빈 덱은 빈 문자열", () => {
    expect(formatDeckBulkInput({})).toBe("");
  });

  it("출력을 다시 파싱하면 원래 구성이 나온다 (왕복)", () => {
    const deck = { koan_search: 2, mech_joint: 3, nagi_calm: 1 };
    const reparsed = Object.fromEntries(
      parse(formatDeckBulkInput(deck)).entries.map((e) => [e.cardId, e.count]),
    );
    expect(reparsed).toEqual(deck);
  });
});
