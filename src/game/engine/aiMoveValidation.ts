/**
 * Claude(등 외부 판단 주체)가 돌려준 tool 응답을 실제로 적용 가능한 결정으로
 * 검증/변환한다. 라우트(네트워크·Firestore 의존)에서 분리한 순수 함수라 —
 * "이상한 응답이 들어와도 게임이 멈추거나 깨지지 않는지"를 테스트로 고정해 둔다.
 *
 * 공통 원칙: 형식이 어긋나거나(개수 불일치·존재하지 않는 id 등) 애매하면
 * 전부 호출자가 넘긴 fallback(로컬 규칙 AI의 결정)으로 떨어진다.
 */

import type { GameState } from "./types";
import { getPlayableCards } from "./effects";

export type SetupDecision = { tag: boolean; play: { id: string; idx: number } | null };

/** SETUP: 태그 여부 + 낼 카드 id. 카드는 실제로 손패에 있고 낼 수 있어야 한다. */
export function resolveSetupDecision(
  state: GameState,
  raw: { tag?: unknown; cardId?: unknown } | null | undefined,
  fallback: SetupDecision,
): SetupDecision {
  if (!raw) return fallback;

  const tag = typeof raw.tag === "boolean" ? raw.tag : fallback.tag;
  const cardId = typeof raw.cardId === "string" ? raw.cardId : "";
  if (!cardId) return { tag, play: null };

  const idx = state.AI.hand.indexOf(cardId);
  const playable = getPlayableCards(state, "AI").some((p) => p.id === cardId && p.idx === idx);
  if (idx < 0 || !playable) return { tag, play: fallback.play };

  return { tag, play: { id: cardId, idx } };
}

/** WAITING_SELECTION: 후보 목록의 부분집합, count장 이하만 허용. */
export function resolveSelectionDecision(
  candidates: string[],
  count: number,
  raw: { cardIds?: unknown } | null | undefined,
  fallback: { selectedCards: string[] },
): { selectedCards: string[] } {
  if (!raw || !Array.isArray(raw.cardIds)) return fallback;

  const requested = raw.cardIds.filter((v): v is string => typeof v === "string");
  if (requested.length > count) return fallback;

  return { selectedCards: requested.filter((id) => candidates.includes(id)) };
}

/** ROUND_DRAFT: 덱에 실제로 있는 카드만, 정확히 count장. */
export function resolveDraftDecision(
  deck: string[],
  count: number,
  raw: { cardIds?: unknown } | null | undefined,
  fallback: { cardIds: string[] },
): { cardIds: string[] } {
  if (!raw || !Array.isArray(raw.cardIds)) return fallback;

  const requested = raw.cardIds.filter((v): v is string => typeof v === "string");
  if (requested.length !== count) return fallback;

  const remaining = [...deck];
  for (const id of requested) {
    const idx = remaining.indexOf(id);
    if (idx < 0) return fallback;
    remaining.splice(idx, 1);
  }
  return { cardIds: requested };
}

/**
 * WAITING_DISCARD: 손패에 실제로 있는 카드만, 정확히 count장.
 * DISCARD/CONFIRM은 개수가 하나라도 안 맞으면 조용히 무시하고 WAITING_DISCARD에
 * 그대로 머무르므로(게임이 멈춘다), 여기서 정확히 count장을 만들어 보장한다.
 */
export function resolveDiscardDecision(
  hand: string[],
  count: number,
  raw: { cardIds?: unknown } | null | undefined,
  fallback: { discardCards: string[] },
): { discardCards: string[] } {
  if (!raw || !Array.isArray(raw.cardIds)) return fallback;

  const requested = raw.cardIds.filter((v): v is string => typeof v === "string");
  if (requested.length !== count) return fallback;

  const usedIdx = new Set<number>();
  const discardCards: string[] = [];
  for (const id of requested) {
    const idx = hand.findIndex((h, i) => h === id && !usedIdx.has(i));
    if (idx < 0) return fallback;
    usedIdx.add(idx);
    discardCards.push(`${id}::${idx}`);
  }
  return { discardCards };
}
