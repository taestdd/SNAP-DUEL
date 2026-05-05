import type { Card, GameState } from "./types";
import { getCard } from "./cards";
import { canUseCard } from "./rules";

/**
 * 상대의 현재 airborne 상태를 기반으로 실제로 적중할 데미지만 계산한다.
 * ground 타입은 상대가 체공 중이면 0, anti-air 타입은 상대가 지상이면 0.
 */
function effectiveDamage(card: Card, oppAirborneStack: number): number {
  let total = 0;
  for (const effect of card.effects) {
    if (effect.type !== "damage") continue;
    const dt = effect.damageType;
    const dmg = effect.value ?? 0;
    if (dt === "ground" && oppAirborneStack >= 1) continue;
    if (dt === "anti-air" && oppAirborneStack === 0) continue;
    total += dmg;
  }
  return total;
}

/**
 * 카드 하나에 대해 현재 게임 상황을 고려한 점수를 계산한다.
 *
 * 고려 요소:
 * - 실효 데미지: 상대 airborne 상태에 맞는 데미지 타입만 집계
 * - 속도: 빠를수록 캔슬 위험 감소 (낮은 speed 값 선호)
 * - Gain: 적중 시 다음 턴 속도 보너스
 * - 발사 콤보: 지상 상대를 띄우면 다음 턴 anti-air 기회 생성
 * - 유틸리티: 손패/덱/묘지 상태에 따른 아이템 카드 가치
 * - HP 상황: 지고 있으면 공격 우선, 이기고 있으면 빠른 플레이 우선
 */
function scoreCard(state: GameState, cardId: string): number {
  const card = getCard(cardId);
  if (!card) return -Infinity;

  const ai = state.AI;
  const opp = state.P1;
  const oppAirborne = opp.airborneStack;

  let score = 0;

  // 실효 데미지 (실제로 맞는 데미지만)
  const effDmg = effectiveDamage(card, oppAirborne);
  score += effDmg * 10;

  // 속도: 낮을수록 먼저 행동 → 캔슬 위험 감소
  const effSpeed = Math.max(0, card.speed - (ai.status.speedBonus ?? 0));
  score -= effSpeed * 1.5;

  // Gain: 적중 시 다음 턴 속도 보너스 가치
  score += (card.gain ?? 0) * 5;

  // 발사 콤보: 지상 상대를 공중으로 띄우면 다음 턴 anti-air 기회
  const launchesOpponent = card.effects.some(
    (e) => e.type === "airborne" && e.target === "enemy"
  );
  if (launchesOpponent && oppAirborne === 0) score += 8;

  // 유틸리티: 아이템 카드의 상황별 가치
  const handSizeAfter = ai.hand.length - 1; // 카드 사용 후 손패 수
  const trashSize = ai.trash.length;

  for (const effect of card.effects) {
    if (effect.type !== "move_cards") continue;
    if (effect.fromZone === "deck") {
      // 덱에서 드로우: 손패가 적을수록 가치 상승
      score += Math.max(0, 4 - handSizeAfter) * 3;
    } else if (effect.fromZone === "trash") {
      // 묘지에서 회수: 묘지 카드가 많을수록 가치 상승
      score += Math.min(trashSize, effect.count ?? 2) * 3;
    }
  }

  // HP 상황: 지고 있으면 공격 우선, 이기고 있으면 빠른 플레이 우선
  const hpDiff = ai.hp - opp.hp;
  if (hpDiff < -5 && effDmg > 0) {
    score += 5; // 뒤처질 때 데미지 카드에 보너스
  } else if (hpDiff > 5) {
    score += Math.max(0, 3 - effSpeed); // 앞설 때 빠른 카드에 보너스
  }

  return score;
}

/**
 * AI가 이번 턴에 사용할 카드를 선택한다.
 *
 * 코스트 가능 + useCondition 충족 카드 중 scoreCard 점수가 가장 높은 카드를 반환.
 * 사용 가능한 카드가 없으면 null (pass → 1드로우).
 */
export function aiSelectCard(state: GameState): { id: string; idx: number } | null {
  const ai = state.AI;

  const candidates = ai.hand
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => {
      const card = getCard(id);
      return card && card.cost <= ai.deck.length && canUseCard(state, "AI", id);
    });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => scoreCard(state, b.id) - scoreCard(state, a.id));

  return { id: candidates[0].id, idx: candidates[0].idx };
}

/**
 * ROUND_DRAFT 페이즈에서 AI가 덱에서 뽑아올 카드 목록을 선택한다.
 *
 * 전략:
 * - 실효 데미지가 높은 카드 우선
 * - 빠른 카드(낮은 speed) 포함
 * - 아이템 카드 1장 포함 (덱/묘지 관리)
 * - count 장만큼 선택
 */
export function aiSelectDraftCards(state: GameState, count: number): string[] {
  const ai = state.AI;
  const opp = state.P1;
  const oppAirborne = opp.airborneStack;

  // 덱 카드를 점수 순으로 정렬
  const scored = ai.deck.map((id) => {
    const card = getCard(id);
    if (!card) return { id, score: -Infinity };

    let score = 0;
    score += effectiveDamage(card, oppAirborne) * 10;
    score -= card.speed * 1.5;
    score += (card.gain ?? 0) * 5;

    const hasLaunch = card.effects.some(
      (e) => e.type === "airborne" && e.target === "enemy"
    );
    if (hasLaunch) score += 6;

    const hasUtility = card.effects.some((e) => e.type === "move_cards");
    if (hasUtility) score += 4;

    return { id, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // 점수 순으로 count장 선택 (덱에 같은 카드가 여러 장 있으면 중복 허용)
  return scored.slice(0, count).map(({ id }) => id);
}
