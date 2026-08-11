import type { Buff, BuffFilter, Poison, StatTarget } from "./types";

/**
 * 버프를 사람이 읽는 문장으로 옮기는 단일 지점.
 *
 * 로그·게임 UI 배지·어드민 미리보기가 같은 이름을 쓰도록 여기만 고치면 되게 한다.
 * (스탯이 늘면 STAT_LABELS에만 추가하면 타입 에러로 누락을 잡아준다)
 */

export const STAT_LABELS: Record<StatTarget, string> = {
  cost: "COST",
  delay: "DLY",
  ground_attack: "ATK",
  anti_air_attack: "AA",
  advantage: "ADV",
};

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** "2턴" / "3회" — 남은 지속 */
export function formatBuffDuration(buff: Buff): string {
  return buff.duration.type === "uses"
    ? `${buff.duration.remaining}회`
    : `${buff.duration.remaining}턴`;
}

/** 배지용 짧은 표기 — "ATK+3 2턴" */
export function formatBuffShort(buff: Buff): string {
  const name = buff.label ?? STAT_LABELS[buff.stat];
  return `${name}${signed(buff.delta)} ${formatBuffDuration(buff)}`;
}

/** "attack 카드 · 태그 타격/투척형 · base cost 3~" — 조건이 없으면 null */
export function formatBuffFilter(filter: BuffFilter | undefined): string | null {
  if (!filter) return null;
  const parts = [
    filter.cardType ? `${filter.cardType} 카드` : null,
    filter.tags?.length ? `태그 ${filter.tags.join("/")}` : null,
    filter.statRange
      ? `base ${STAT_LABELS[filter.statRange.stat]} ${filter.statRange.min ?? ""}~${filter.statRange.max ?? ""}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 툴팁용 전체 설명 — 무엇이 얼마나, 어떤 카드에, 얼마나 오래 */
export function formatBuffDetail(buff: Buff): string {
  const name = buff.label ? `${buff.label} — ` : "";
  const scope = buff.scope === "character" ? "현재 캐릭터 (태그 시 소멸)" : "플레이어 (태그해도 유지)";
  const target = formatBuffFilter(buff.filter) ?? "모든 카드";
  const dur = buff.duration.type === "uses"
    ? `해당 카드 ${buff.duration.remaining}회 사용까지`
    : `${buff.duration.remaining}턴 남음`;
  return `${name}${target}의 ${STAT_LABELS[buff.stat]} ${signed(buff.delta)} · ${dur} · ${scope}`;
}

/* ── 중독 ─────────────────────────────────────────────────────────────── */

/** 배지용 짧은 표기 — "☠ 3 x2" (틱당 3, 2턴 남음) */
export function formatPoisonShort(poison: Poison): string {
  const name = poison.label ? `${poison.label} ` : "";
  return `☠ ${name}${poison.damage} ×${poison.turns}`;
}

/** 툴팁·로그용 전체 설명 */
export function formatPoisonDetail(poison: Poison): string {
  const name = poison.label ? `${poison.label} — ` : "";
  const scope = poison.scope === "character" ? "현재 캐릭터 (태그 시 소멸)" : "플레이어 (태그해도 유지)";
  return `${name}턴당 ${poison.damage} 피해 (블록 무시) · ${poison.turns}턴 남음 · ${scope}`;
}
