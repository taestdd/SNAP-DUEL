/**
 * 카드 일괄 등록 CSV → JSON 변환.
 *
 * 컴포넌트에서 분리한 이유는 두 가지다. 파싱 실패가 조용히 넘어가는 지점이 많아
 * (셀 안의 JSON이 깨지면 그 필드만 사라진다) 테스트로 고정해 둘 필요가 있고,
 * 인식하는 컬럼 목록이 곧 "CSV로 넣을 수 있는 것"의 정의라 한 곳에 모여 있어야 한다.
 */

/** 셀 안에 JSON을 넣는 컬럼 — 파싱 실패 시 그 필드만 빠진다 */
const JSON_COLUMNS = ["effects", "statModifiers", "altCost", "additionalCost", "hitTimings"] as const;

/** true/false로 읽는 컬럼 */
const BOOL_COLUMNS = ["superFlash", "meleeAttack", "knockback", "generateOnly"] as const;

/** 그대로 문자열로 넣는 컬럼 */
const STRING_COLUMNS = ["cardType", "useCondition", "actionTag", "actionTagAirborne"] as const;

/** 숫자로 읽는 컬럼 (빈 값이면 생략) */
const NUMBER_COLUMNS = ["groundAttack", "antiAirAttack"] as const;

/** CSV가 인식하는 전체 컬럼 — 안내 문구와 테스트가 같이 참조한다 */
export const CSV_COLUMNS = [
  "id", "name", "cost", "delay", "advantage", "text",
  ...STRING_COLUMNS, ...NUMBER_COLUMNS, "tags",
  ...JSON_COLUMNS, ...BOOL_COLUMNS,
] as const;

/** "dack" 오타 자동 수정 — 과거 시트에서 반복적으로 나온 오타 */
function fixTypo(s: string): string {
  return s.replace(/dack/g, "deck");
}

/**
 * "true" / "1" / "y" / "yes" / "o" / "O" → true, 그 외 값이 있으면 false.
 * 빈 칸은 undefined(= 미지정)로 두어 기본값을 건드리지 않는다.
 */
function parseBool(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (v === "") return undefined;
  return v === "true" || v === "1" || v === "y" || v === "yes" || v === "o";
}

/** 따옴표 안의 쉼표를 보존하며 한 줄을 자른다 ("" = 이스케이프된 따옴표) */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/**
 * CSV 텍스트를 카드 객체 배열로 바꾼다.
 *
 * 값이 빈 컬럼은 **키 자체를 넣지 않는다** — 그대로 넣으면 groundAttack: NaN,
 * tags: [] 같은 값이 새어 들어간다. 덮어쓰기 경로에서 부분 입력을 낸 필수 필드
 * 누락은 파서가 조용히 지나가지 않고 스키마 검증에서 걸리게 둔다.
 */
export function parseCardCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const cards: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? "").trim(); });
    if (!row.id) continue;

    const card: Record<string, unknown> = { id: row.id };

    if (row.name) card.name = row.name;
    if (row.cost !== undefined && row.cost !== "") card.cost = Number(row.cost);
    // 구 CSV 헤더(speed/gain)도 수용 — 저장은 항상 새 키(delay/advantage)
    const delay = row.delay ?? row.speed;
    if (delay !== undefined && delay !== "") card.delay = Number(delay);
    const advantage = row.advantage ?? row.gain;
    if (advantage !== undefined && advantage !== "") card.advantage = Number(advantage);
    if (row.text !== undefined) card.text = row.text;

    for (const key of STRING_COLUMNS) {
      if (row[key]) card[key] = row[key];
    }
    for (const key of NUMBER_COLUMNS) {
      if (row[key] !== undefined && row[key] !== "") card[key] = Number(row[key]);
    }
    if (row.tags) {
      const tags = row.tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length) card.tags = tags;
    }
    for (const key of BOOL_COLUMNS) {
      const v = parseBool(row[key] ?? "");
      if (v !== undefined) card[key] = v;
    }
    for (const key of JSON_COLUMNS) {
      if (!row[key]) continue;
      try { card[key] = JSON.parse(fixTypo(row[key])); }
      catch { /* 셀 JSON이 깨지면 그 필드만 건너뛴다 */ }
    }

    cards.push(card);
  }

  return cards;
}
