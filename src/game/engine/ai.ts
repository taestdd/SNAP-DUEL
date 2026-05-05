import type { Card, GameState, PlayerId } from "./types";
import { getCard } from "./cards";
import { canUseCard } from "./rules";

function opponentOf(player: PlayerId): PlayerId {
  return player === "P1" ? "AI" : "P1";
}

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
function scoreCard(state: GameState, cardId: string, player: PlayerId): number {
  const card = getCard(cardId);
  if (!card) return -Infinity;

  const me = state[player];
  const opp = state[opponentOf(player)];
  const oppAirborne = opp.airborneStack;

  let score = 0;

  // 실효 데미지 (실제로 맞는 데미지만)
  const effDmg = effectiveDamage(card, oppAirborne);
  score += effDmg * 10;

  // 속도: 낮을수록 먼저 행동 → 캔슬 위험 감소
  // 상대 손패가 적을수록 캔슬 위험이 낮아지므로 느린 카드의 페널티를 줄임
  const speedBonus = me.status.speedBonus ?? 0;
  const effSpeed = Math.max(0, card.speed - speedBonus);
  score -= effSpeed * 1.5 * cancelRiskFactor(state, player);

  // 콤보 없이(speedBonus=0) 느린 카드(base speed>=4) 선택 억제
  // gain 기대가치보다 캔슬 위험이 더 크므로 추가 패널티 부여
  if (speedBonus === 0 && card.speed >= 4) score -= 12;

  // Gain: 적중 시 다음 턴 속도 보너스 가치
  // 이미 콤보 중(speedBonus>0)이면 콤보 유지 가치가 더 높음
  score += (card.gain ?? 0) * (speedBonus > 0 ? 7 : 5);

  // 발사 콤보: 지상 상대를 공중으로 띄우면 다음 턴 anti-air 기회
  const launchesOpponent = card.effects.some(
    (e) => e.type === "airborne" && e.target === "enemy"
  );
  if (launchesOpponent && oppAirborne === 0) score += 8;

  // 유틸리티: 아이템 카드의 상황별 가치
  const handSizeAfter = me.hand.length - 1; // 카드 사용 후 손패 수
  const trashSize = me.trash.length;

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
  const hpDiff = me.hp - opp.hp;
  if (hpDiff < -5 && effDmg > 0) {
    score += 5; // 뒤처질 때 데미지 카드에 보너스
  } else if (hpDiff > 5) {
    score += Math.max(0, 3 - effSpeed); // 앞설 때 빠른 카드에 보너스
  }

  return score;
}

/**
 * 상대가 이번 턴에 카드를 낼 가능성을 기반으로 캔슬 위험 계수를 반환한다.
 * 0에 가까울수록 캔슬 위험이 낮아 느린 고데미지 카드를 써도 안전하다.
 *
 * - 상대 손패 0장: 패스만 가능 → 위험 없음
 * - 상대 손패 1장: 낼 수도 있으나 선택지 좁음 → 낮은 위험
 * - 상대 덱 고갈(exhausted): 코스트 지불 불가 → 낮은 위험
 * - 그 외: 일반 위험
 */
function cancelRiskFactor(state: GameState, player: PlayerId): number {
  const opp = state[opponentOf(player)];
  if (opp.hand.length === 0) return 0.1;
  if (opp.status.exhausted || opp.hand.length === 1) return 0.35;
  if (opp.hand.length === 2) return 0.7;
  return 1.0;
}

/**
 * 벤치 캐릭터 HP가 현재 캐릭터보다 높을 때 태그를 권장한다.
 * reducer(AI/SETUP_AUTO)와 시뮬레이션(P1) 양쪽에서 동일하게 사용.
 */
export function shouldTag(state: GameState, player: PlayerId): boolean {
  const me = state[player];
  const benchChar: import("./types").CharacterId = me.activeCharacter === "A" ? "B" : "A";
  const benchHp = me.characterHp[benchChar];
  return benchHp > me.hp && benchHp > 0;
}

/**
 * 지정한 플레이어가 이번 턴에 사용할 카드를 선택한다.
 *
 * 코스트 가능 + useCondition 충족 카드 중 scoreCard 점수가 가장 높은 카드를 반환.
 * 사용 가능한 카드가 없으면 null (pass → 1드로우).
 */
export function selectCard(
  state: GameState,
  player: PlayerId
): { id: string; idx: number } | null {
  const me = state[player];

  const candidates = me.hand
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => {
      const card = getCard(id);
      return card && card.cost <= me.deck.length && canUseCard(state, player, id);
    });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => scoreCard(state, b.id, player) - scoreCard(state, a.id, player));

  return { id: candidates[0].id, idx: candidates[0].idx };
}

/**
 * @deprecated selectCard(state, "AI") 를 사용하세요.
 */
export const aiSelectCard = (state: GameState) => selectCard(state, "AI");

/**
 * ROUND_DRAFT 페이즈에서 지정한 플레이어가 덱에서 뽑아올 카드 목록을 선택한다.
 *
 * 전략:
 * - 실효 데미지가 높은 카드 우선
 * - 빠른 카드(낮은 speed) 포함
 * - 아이템 카드 포함 (덱/묘지 관리)
 * - count 장만큼 선택
 */
export function selectDraftCards(
  state: GameState,
  player: PlayerId,
  count: number
): string[] {
  const me = state[player];
  const opp = state[opponentOf(player)];
  const oppAirborne = opp.airborneStack;

  const scored = me.deck.map((id) => {
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

/**
 * @deprecated selectDraftCards(state, "AI", count) 를 사용하세요.
 */
export const aiSelectDraftCards = (state: GameState, count: number) =>
  selectDraftCards(state, "AI", count);
