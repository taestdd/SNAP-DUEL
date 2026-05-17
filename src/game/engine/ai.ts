import type { Card, GameState, PlayerId } from "./types";
import { getAllCards, getCard } from "./cards";
import { canUseCard, getBenchChar } from "./rules";

function opponentOf(player: PlayerId): PlayerId {
  return player === "P1" ? "AI" : "P1";
}

function getMinAttackSpeed(): number {
  const speeds = Object.values(getAllCards())
    .filter((c) => c.effects.some((e) => e.type === "damage"))
    .map((c) => c.speed);
  return speeds.length > 0 ? Math.min(...speeds) : 0;
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

  // 실효 데미지 × 코스트 할인 가중치
  // 코스트가 높을수록 카드 1장당 데미지 가치가 감소 (덱 자원 대비 효율 반영)
  // cost-3 카드: ×7, cost-5 카드: ×5, 아이템(effDmg=0): 영향 없음
  const effDmg = effectiveDamage(card, oppAirborne);
  score += effDmg * Math.max(1, 10 - card.cost);

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

  // 빠른 카드 안전 보너스: base speed ≤ 2는 getMinAttackSpeed() 이하라 캔슬당하지 않음
  if (card.speed <= 2) score += 6;

  // 발사 콤보: 지상 상대를 공중으로 띄우면 다음 턴 anti-air 기회 생성
  const launchesOpponent = card.effects.some(
    (e) => e.type === "airborne" && e.target === "enemy"
  );
  if (launchesOpponent && oppAirborne === 0) score += 3;

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
  const benchChar = getBenchChar(me);
  const benchHp = me.characterHp[benchChar];
  return benchHp > me.hp && benchHp > 0;
}

/**
 * 상대가 이번 턴에 낼 공격 카드의 유효 속도(speedBonus 적용)를 반환한다.
 * 상대에게 위협이 없으면 Infinity를 반환한다.
 *
 * - SETUP_OTHER(내가 나중에 선택): 상대 queue를 확인한다.
 *   · queue에 공격 카드 있음 → 이미 확정된 위협 → 그 속도 반환
 *   · queue가 비어있음 → 상대가 패스했다는 뜻 → 위협 없음(Infinity)
 * - SETUP_INIT(내가 먼저 선택): 상대 아직 미결정 → hand 기준 최속 추정
 */
function oppFastestAttackSpeed(state: GameState, player: PlayerId): number {
  const opp = state[opponentOf(player)];
  const oppBonus = opp.status.speedBonus ?? 0;

  // 상대가 이미 카드를 큐에 올린 경우(SETUP_OTHER) → queue가 실제 위협
  if (opp.queue.length > 0) {
    let fastest = Infinity;
    for (const cardId of opp.queue) {
      const card = getCard(cardId);
      if (!card) continue;
      if (!card.effects.some((e) => e.type === "damage")) continue;
      fastest = Math.min(fastest, Math.max(0, card.speed - oppBonus));
    }
    return fastest;
  }

  // 상대 queue가 비어있는 경우:
  // · ready=true → 상대가 패스 완료 → 위협 없음
  // · ready=false → 상대 아직 미결정, 핸드 내용은 비공개
  //   카드가 있으면 최악 케이스(게임 내 최속 공격 카드) 가정
  if (opp.ready) return Infinity;
  if (opp.hand.length === 0 || opp.status.exhausted) return Infinity;

  return Math.max(0, getMinAttackSpeed() - oppBonus);
}

/**
 * 지정한 플레이어가 이번 턴에 사용할 카드를 선택한다.
 *
 * 코스트 가능 + useCondition 충족 카드 중 scoreCard 점수가 가장 높은 카드를 선택한 뒤,
 * 아래 조건을 모두 충족하면 패스(null)로 전환한다:
 *   - 주도권이 없을 것
 *   - 선택 카드가 공격 카드(캔슬 대상)일 것
 *   - 내 유효 속도 >= 상대 최속 공격 카드의 유효 속도
 *     (즉, 상대가 먼저 행동하거나 동속 타이를 initiative로 이겨 내 카드를 캔슬할 수 있음)
 *
 * 사용 가능한 카드가 없거나 패스가 유리하면 null (pass → 1드로우).
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

  const best = candidates[0];
  const bestCard = getCard(best.id)!;
  const myEffSpeed = Math.max(0, bestCard.speed - (me.status.speedBonus ?? 0));
  const isAttack = bestCard.effects.some((e) => e.type === "damage");

  // 패스 판단: 공격 카드인데 주도권 없고 상대 최속 공격보다 느리거나 같으면 캔슬 확정
  if (isAttack && state.initiative !== player && myEffSpeed > oppFastestAttackSpeed(state, player)) {
    // 공격 대신 아이템 카드(캔슬 불가)가 있으면 그것을 사용
    const safeCard = candidates.find(({ id }) => {
      const c = getCard(id);
      return c && !c.effects.some((e) => e.type === "damage");
    });
    return safeCard ?? null;
  }

  return best;
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
    const effDmg = effectiveDamage(card, oppAirborne);
    score += effDmg * Math.max(1, 10 - card.cost);
    score -= card.speed * 1.5;
    score += (card.gain ?? 0) * 5;
    if (card.speed <= 2) score += 6;

    const hasLaunch = card.effects.some(
      (e) => e.type === "airborne" && e.target === "enemy"
    );
    if (hasLaunch) score += 3;

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
