import type { Card, CombatAnimationEvent, HitPose, PlayerId } from "@/game/engine/types";

/**
 * 두 카드와 이니셔티브 정보를 받아 CombatAnimationEvent[] 를 생성한다.
 *
 * p1Airborne / aiAirborne: 큐 생성 시점(첫 히트 이전)의 체공 상태. 이후 변경돼도 고정.
 *
 * 이벤트 절대 지연 설계 (큐 시작 = t=0)
 *
 * 단일 공격자:
 *   t=  0  action_start (공격자)
 *   t=N    visual_hit × hitTimings.length  (카드 hitTimings 기준)
 *   t=800  action_end
 *
 * 양측 모두 카드 있음 + 이니셔티브 우위 (선공자 먼저):
 *   t=  0  action_start (선공자)
 *   t=N    visual_hit   (hitTimings 기준)
 *   t=700  action_start (후공자)
 *   t=M    visual_hit   (hitTimings 기준)
 *   t=1200 action_end   (선공자)
 *   t=1500 action_end   (후공자)
 *
 * 동시 공격 (tie): 두 시퀀스 모두 offset=0
 */
export function makeQueue(
  playerCard: Card | null,
  aiCard: Card | null,
  initiative: "player" | "ai" | "tie",
  p1Airborne: number,
  aiAirborne: number,
): CombatAnimationEvent[] {
  const events: CombatAnimationEvent[] = [];

  const p1Acts = playerCard !== null;
  const aiActs = aiCard !== null;

  if (!p1Acts && !aiActs) return events;

  if (p1Acts && !aiActs) {
    pushSequence(events, "P1", "AI", playerCard!, 0, aiAirborne);
    return events;
  }

  if (!p1Acts && aiActs) {
    pushSequence(events, "AI", "P1", aiCard!, 0, p1Airborne);
    return events;
  }

  if (initiative === "tie") {
    pushSequence(events, "P1", "AI", playerCard!, 0, aiAirborne);
    pushSequence(events, "AI", "P1", aiCard!, 0, p1Airborne);
    return events;
  }

  const first: PlayerId = initiative === "player" ? "P1" : "AI";
  const second: PlayerId = initiative === "player" ? "AI" : "P1";
  const firstCard = initiative === "player" ? playerCard! : aiCard!;
  const secondCard = initiative === "player" ? aiCard! : playerCard!;
  const firstTargetAirborne = initiative === "player" ? aiAirborne : p1Airborne;
  const secondTargetAirborne = initiative === "player" ? p1Airborne : aiAirborne;

  pushSequenceWithHold(events, first, second, firstCard, 0, 1200, firstTargetAirborne);
  pushSequence(events, second, first, secondCard, 700, secondTargetAirborne);

  return events;
}

function pushSequence(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  card: Card,
  offset: number,
  targetAirborne: number,
): void {
  pushSequenceWithHold(events, actor, target, card, offset, offset + 800, targetAirborne);
}

function pushSequenceWithHold(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  card: Card,
  offset: number,
  endDelay: number,
  targetAirborne: number,
): void {
  events.push({ type: "action_start", delay: offset, actor, actionTag: card.actionTag });

  if (card.hitTimings && card.hitTimings.length > 0) {
    for (const timing of card.hitTimings) {
      const hitPose: HitPose = targetAirborne >= 1 ? timing.airborne : timing.ground;
      events.push({ type: "visual_hit", delay: offset + timing.ms, target, hitPose });
    }
    const lastMs = card.hitTimings[card.hitTimings.length - 1].ms;
    events.push({ type: "damage_resolve", delay: offset + lastMs + 100 });
  }

  events.push({ type: "action_end", delay: endDelay, actor });
}
