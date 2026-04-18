import type { GameState } from "./types";
import { getCard } from "./cards";
import { canUseCard } from "./rules";

/**
 * AI가 이번 턴에 사용할 카드를 선택한다.
 * 코스트 가능 + useCondition 충족 카드 중 데미지 합계 → 코스트 순으로 정렬해 첫 번째를 반환.
 * 사용 가능한 카드가 없으면 null (pass → 1드로우).
 */
export function aiSelectCard(state: GameState): { id: string; idx: number } | null {
  const ai = state.AI;

  const candidates = ai.hand
    .map((id, idx) => ({ id, idx, card: getCard(id) }))
    .filter((x) => x.card && x.card.cost <= ai.deck.length && canUseCard(state, "AI", x.id));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const totalDamage = (entry: typeof a) =>
      entry.card!.effects
        .filter((e) => e.type === "damage")
        .reduce((sum, e) => sum + (e.value ?? 0), 0);

    const dmgDiff = totalDamage(b) - totalDamage(a);
    if (dmgDiff !== 0) return dmgDiff;
    return (b.card!.cost ?? 0) - (a.card!.cost ?? 0);
  });

  return { id: candidates[0].id, idx: candidates[0].idx };
}
