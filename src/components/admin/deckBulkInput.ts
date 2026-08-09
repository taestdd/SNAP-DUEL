/**
 * 덱 일괄 입력 파서 — "카드 id + 매수" 줄 목록을 덱 구성으로 바꾼다.
 *
 * 받아들이는 형태 (한 줄에 하나):
 *   koan_search        → 1장
 *   koan_search 3      → 3장
 *   koan_search,3      → 3장
 *   koan_search x3     → 3장  (x 앞에 공백 필요 — 없으면 id의 일부와 구분되지 않는다)
 *   # 주석 / // 주석   → 무시
 *
 * 같은 id가 여러 줄에 나오면 매수를 합산한다.
 */

export type BulkEntry = { cardId: string; count: number };

export type BulkParseResult = {
  entries: BulkEntry[];
  /** 존재하지 않는 카드 id */
  unknown: string[];
  /** 효과로만 등장해 덱에 넣을 수 없는 카드 */
  generateOnly: string[];
  /** 형식을 알아볼 수 없는 줄 */
  invalid: string[];
};

export function parseDeckBulkInput(
  text: string,
  isKnown: (cardId: string) => boolean,
  isGenerateOnly: (cardId: string) => boolean,
): BulkParseResult {
  const counts = new Map<string, number>();
  const unknown = new Set<string>();
  const generateOnly = new Set<string>();
  const invalid: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    // 구분자(쉼표·탭)와 "x3" 수량 표기를 공백 하나로 통일한다.
    // x 앞에 공백을 요구하는 이유: 공백이 없으면 id 끝의 x와 구분할 수 없다.
    const normalized = line
      .replace(/[,\t]+/g, " ")
      .replace(/\s+[x*×]\s*(\d+)\s*$/i, " $1")
      .trim();

    const parts = normalized.split(/\s+/);
    if (parts.length > 2) {
      invalid.push(line);
      continue;
    }

    const [cardId, countStr] = parts;
    const count = countStr === undefined ? 1 : Number(countStr);
    if (!Number.isInteger(count) || count <= 0) {
      invalid.push(line);
      continue;
    }

    if (!isKnown(cardId)) {
      unknown.add(cardId);
      continue;
    }
    if (isGenerateOnly(cardId)) {
      generateOnly.add(cardId);
      continue;
    }

    counts.set(cardId, (counts.get(cardId) ?? 0) + count);
  }

  return {
    entries: [...counts].map(([cardId, count]) => ({ cardId, count })),
    unknown: [...unknown],
    generateOnly: [...generateOnly],
    invalid,
  };
}

/** 현재 덱 구성을 일괄 입력 형식 텍스트로 — 편집 후 되붙일 수 있게 한다 */
export function formatDeckBulkInput(deckCounts: Record<string, number>): string {
  return Object.entries(deckCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cardId, count]) => `${cardId} ${count}`)
    .join("\n");
}
