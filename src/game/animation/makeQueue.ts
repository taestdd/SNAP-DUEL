import type { AnimScriptEntry, Card, CombatAnimationEvent, HitPose, PlayerId } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";

export const SUPER_FLASH_DUR = 700;

export type ActorHpData = {
  hpAfter: { P1: number; AI: number };
  cancelledPlayer?: PlayerId;
  comboAfter?: number;
  comboHolder?: PlayerId;
};

/**
 * 두 카드와 이니셔티브 정보를 받아 CombatAnimationEvent[] 를 생성한다.
 *
 * ## actor/target airborne을 4개 파라미터로 분리하는 이유
 *
 * 직관적으로는 "P1의 airborne"과 "AI의 airborne" 두 값이면 충분해 보이지만,
 * 순차 리졸브에서 선공 카드가 에어본 상태를 바꿀 수 있기 때문에 그렇지 않다.
 *
 * 예시: P1 점프(speed 1) vs AI 잽(speed 3)
 *   - 점프가 먼저 처리 → P1.airborneStack 0 → 1
 *   - 잽이 처리되는 시점에 P1은 이미 에어본
 *
 * 이 경우 잽의 hitiAnimation 여부를 판단할 때:
 *   - p1ActorAirborne(점프 발동 시 P1 상태) = 0  ← 액션 포즈 결정에 사용
 *   - aiTargetAirborne(잽 발동 시 P1 상태)  = 1  ← 히트 판정에 사용  ← 핵심
 *
 * 과거에는 "P1의 airborne"을 단일값(= p1ActorAirborne = 0)으로만 관리했고,
 * AI 잽의 target airborne 판정도 이 값(0)을 써서 지상 히트 애니메이션이
 * 잘못 재생되는 버그가 있었다.
 *
 * resolve.ts의 AnimScriptEntry에는 각 카드가 처리되는 시점의
 * actorAirborne / targetAirborne이 이미 정확하게 기록되어 있으므로,
 * makeQueueFromScript에서 이 값을 그대로 넘겨 사용한다.
 *
 * ## 타임라인 구조
 *
 * 단일 공격자 (슈퍼 플래시 없음):
 *   t=  0  action_start
 *   t=N    visual_hit
 *   t=800  action_end
 *
 * 단일 공격자 (슈퍼 플래시 있음):
 *   t=  0  super_flash
 *   t=700  action_start
 *   t=700+N visual_hit
 *   t=1500 action_end
 *
 * 양측 + 이니셔티브 (선공·후공 모두 슈퍼 플래시):
 *   t=   0  super_flash (선공)
 *   t= 700  action_start (선공)
 *   t=1400  super_flash (후공)
 *   t=2100  action_start (후공)
 */
export function makeQueue(
  playerCard: Card | null,
  aiCard: Card | null,
  initiative: "player" | "ai" | "tie",
  /** P1 카드가 처리되는 시점의 P1 airborne (액션 포즈 결정용) */
  p1ActorAirborne: number,
  /** P1 카드가 처리되는 시점의 AI airborne (P1→AI 히트 판정용) */
  p1TargetAirborne: number,
  /** AI 카드가 처리되는 시점의 AI airborne (액션 포즈 결정용) */
  aiActorAirborne: number,
  /** AI 카드가 처리되는 시점의 P1 airborne (AI→P1 히트 판정용) */
  aiTargetAirborne: number,
  playerHpData?: ActorHpData,
  aiHpData?: ActorHpData,
): CombatAnimationEvent[] {
  const events: CombatAnimationEvent[] = [];

  const p1Acts = playerCard !== null;
  const aiActs = aiCard !== null;

  if (!p1Acts && !aiActs) return events;

  if (p1Acts && !aiActs) {
    const fd = flashDur(playerCard!);
    if (fd > 0) events.push({ type: "super_flash", delay: 0, actor: "P1" });
    pushSequence(events, "P1", "AI", playerCard!, fd, p1TargetAirborne, p1ActorAirborne, playerHpData);
    return events;
  }

  if (!p1Acts && aiActs) {
    const fd = flashDur(aiCard!);
    if (fd > 0) events.push({ type: "super_flash", delay: 0, actor: "AI" });
    pushSequence(events, "AI", "P1", aiCard!, fd, aiTargetAirborne, aiActorAirborne, aiHpData);
    return events;
  }

  if (initiative === "tie") {
    const p1fd = flashDur(playerCard!);
    const aifd = flashDur(aiCard!);
    const maxFd = Math.max(p1fd, aifd);
    if (p1fd > 0) events.push({ type: "super_flash", delay: 0, actor: "P1" });
    if (aifd > 0) events.push({ type: "super_flash", delay: 0, actor: "AI" });
    pushSequence(events, "P1", "AI", playerCard!, maxFd, p1TargetAirborne, p1ActorAirborne, playerHpData);
    pushSequence(events, "AI", "P1", aiCard!, maxFd, aiTargetAirborne, aiActorAirborne, aiHpData);
    return events;
  }

  const first: PlayerId = initiative === "player" ? "P1" : "AI";
  const second: PlayerId = initiative === "player" ? "AI" : "P1";
  const firstCard = initiative === "player" ? playerCard! : aiCard!;
  const secondCard = initiative === "player" ? aiCard! : playerCard!;
  const firstActorAirborne = initiative === "player" ? p1ActorAirborne : aiActorAirborne;
  const firstTargetAirborne = initiative === "player" ? p1TargetAirborne : aiTargetAirborne;
  const secondActorAirborne = initiative === "player" ? aiActorAirborne : p1ActorAirborne;
  // 후공의 targetAirborne은 선공 처리 이후 상태 — 선공 카드가 에어본을 바꿨을 수 있음
  const secondTargetAirborne = initiative === "player" ? aiTargetAirborne : p1TargetAirborne;
  const firstHpData = initiative === "player" ? playerHpData : aiHpData;
  const secondHpData = initiative === "player" ? aiHpData : playerHpData;

  const ffd = flashDur(firstCard);
  const sfd = flashDur(secondCard);

  if (ffd > 0) events.push({ type: "super_flash", delay: 0, actor: first });
  pushSequenceWithHold(events, first, second, firstCard, ffd, 1200 + ffd, firstTargetAirborne, firstActorAirborne, firstHpData);

  const secondFlashAt = 700 + ffd;
  if (sfd > 0) events.push({ type: "super_flash", delay: secondFlashAt, actor: second });
  pushSequence(events, second, first, secondCard, secondFlashAt + sfd, secondTargetAirborne, secondActorAirborne, secondHpData);

  return events;
}

function flashDur(card: Card): number {
  return card.superFlash ? SUPER_FLASH_DUR : 0;
}

/** 공격 타입 카드의 공격 스탯이 타겟에 실제로 적중하는지 확인 */
function hasConnectingAttack(card: Card, targetAirborne: number): boolean {
  if (card.cardType !== "attack") return false;
  const groundHits = (card.groundAttack ?? 0) > 0 && targetAirborne === 0;
  const antiAirHits = (card.antiAirAttack ?? 0) > 0 && targetAirborne >= 1;
  return groundHits || antiAirHits;
}

function pushSequence(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  card: Card,
  offset: number,
  targetAirborne: number,
  actorAirborne: number,
  hpData?: ActorHpData,
): void {
  pushSequenceWithHold(events, actor, target, card, offset, offset + 800, targetAirborne, actorAirborne, hpData);
}

function pushSequenceWithHold(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  card: Card,
  offset: number,
  endDelay: number,
  targetAirborne: number,
  actorAirborne: number,
  hpData?: ActorHpData,
): void {
  const resolvedTag = (actorAirborne >= 1 && card.actionTagAirborne)
    ? card.actionTagAirborne
    : card.actionTag;
  events.push({ type: "action_start", delay: offset, actor, actionTag: resolvedTag });

  if (card.hitTimings && card.hitTimings.length > 0) {
    // visual_hit은 실제로 타격이 성립할 때만 생성
    // hasConnectingAttack이 false면 데미지도 없고 피격 포즈도 없음
    if (hasConnectingAttack(card, targetAirborne)) {
      for (const timing of card.hitTimings) {
        const hitPose: HitPose = targetAirborne >= 1 ? timing.airborne : timing.ground;
        events.push({ type: "visual_hit", delay: offset + timing.ms, target, hitPose });
      }
    }
    // damage_resolve는 타격 성사 여부와 무관하게 항상 생성
    // HP바·콤보·캔슬 UI 갱신 타이밍 마커로 사용됨
    const lastMs = card.hitTimings[card.hitTimings.length - 1].ms;
    events.push({
      type: "damage_resolve",
      delay: offset + lastMs + 100,
      actor,
      hpAfter: hpData?.hpAfter,
      cancelledPlayer: hpData?.cancelledPlayer,
      comboAfter: hpData?.comboAfter,
      comboHolder: hpData?.comboHolder,
    });
  }

  events.push({ type: "action_end", delay: endDelay, actor });
}

/**
 * animScript 배열에서 CombatAnimationEvent[]를 생성한다.
 *
 * ## actorAirborne / targetAirborne을 entry에서 직접 읽는 이유
 *
 * resolve.ts의 resolveAll()은 카드를 스피드 순으로 순차 처리하면서
 * 각 카드가 처리되는 시점의 스냅샷을 AnimScriptEntry에 기록한다.
 *
 *   actorAirborne  = 이 카드가 처리될 때의 액터 airborne 스택
 *   targetAirborne = 이 카드가 처리될 때의 타겟 airborne 스택
 *
 * 선공 카드(예: 점프)가 타겟의 airborne을 바꿨다면,
 * 후공 카드(예: 잽)의 entry.targetAirborne에는 이미 변경된 값이 담겨 있다.
 * 이 값을 그대로 makeQueue에 전달해야 히트 판정이 정확하다.
 *
 * 과거 구현: p1Airborne / aiAirborne 단일값 → 후공의 targetAirborne이
 * 선공 처리 이전 값으로 고정되어 에어본 히트 판정이 틀리는 버그 존재.
 */
export function makeQueueFromScript(script: AnimScriptEntry[]): CombatAnimationEvent[] {
  if (script.length === 0) return [];

  const p1Entry = script.find((e) => e.actor === "P1");
  const aiEntry = script.find((e) => e.actor === "AI");

  const p1Card = p1Entry ? (getCard(p1Entry.cardId) ?? null) : null;
  const aiCard = aiEntry ? (getCard(aiEntry.cardId) ?? null) : null;

  const p1ActorAirborne = p1Entry?.actorAirborne ?? 0;
  const p1TargetAirborne = p1Entry?.targetAirborne ?? 0;
  const aiActorAirborne = aiEntry?.actorAirborne ?? 0;
  const aiTargetAirborne = aiEntry?.targetAirborne ?? 0;

  const p1HpData: ActorHpData | undefined = p1Entry
    ? { hpAfter: p1Entry.hpAfter, cancelledPlayer: p1Entry.cancelledPlayer, comboAfter: p1Entry.comboAfter, comboHolder: p1Entry.comboHolder }
    : undefined;
  const aiHpData: ActorHpData | undefined = aiEntry
    ? { hpAfter: aiEntry.hpAfter, cancelledPlayer: aiEntry.cancelledPlayer, comboAfter: aiEntry.comboAfter, comboHolder: aiEntry.comboHolder }
    : undefined;

  const initiative: "player" | "ai" =
    script[0].actor === "P1" ? "player" : "ai";

  return makeQueue(p1Card, aiCard, initiative, p1ActorAirborne, p1TargetAirborne, aiActorAirborne, aiTargetAirborne, p1HpData, aiHpData);
}
