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
 * superFlash 카드는 action_start 전에 super_flash 이벤트를 삽입하고
 * 이후 이벤트를 SUPER_FLASH_DUR(700ms)만큼 뒤로 밀어낸다.
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
  p1Airborne: number,
  aiAirborne: number,
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
    pushSequence(events, "P1", "AI", playerCard!, fd, aiAirborne, p1Airborne, playerHpData);
    return events;
  }

  if (!p1Acts && aiActs) {
    const fd = flashDur(aiCard!);
    if (fd > 0) events.push({ type: "super_flash", delay: 0, actor: "AI" });
    pushSequence(events, "AI", "P1", aiCard!, fd, p1Airborne, aiAirborne, aiHpData);
    return events;
  }

  if (initiative === "tie") {
    const p1fd = flashDur(playerCard!);
    const aifd = flashDur(aiCard!);
    const maxFd = Math.max(p1fd, aifd);
    if (p1fd > 0) events.push({ type: "super_flash", delay: 0, actor: "P1" });
    if (aifd > 0) events.push({ type: "super_flash", delay: 0, actor: "AI" });
    pushSequence(events, "P1", "AI", playerCard!, maxFd, aiAirborne, p1Airborne, playerHpData);
    pushSequence(events, "AI", "P1", aiCard!, maxFd, p1Airborne, aiAirborne, aiHpData);
    return events;
  }

  const first: PlayerId = initiative === "player" ? "P1" : "AI";
  const second: PlayerId = initiative === "player" ? "AI" : "P1";
  const firstCard = initiative === "player" ? playerCard! : aiCard!;
  const secondCard = initiative === "player" ? aiCard! : playerCard!;
  const firstTargetAirborne = initiative === "player" ? aiAirborne : p1Airborne;
  const secondTargetAirborne = initiative === "player" ? p1Airborne : aiAirborne;
  const firstActorAirborne = initiative === "player" ? p1Airborne : aiAirborne;
  const secondActorAirborne = initiative === "player" ? aiAirborne : p1Airborne;
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
    if (hasConnectingAttack(card, targetAirborne)) {
      for (const timing of card.hitTimings) {
        const hitPose: HitPose = targetAirborne >= 1 ? timing.airborne : timing.ground;
        events.push({ type: "visual_hit", delay: offset + timing.ms, target, hitPose });
      }
    }
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
 */
export function makeQueueFromScript(script: AnimScriptEntry[]): CombatAnimationEvent[] {
  if (script.length === 0) return [];

  const p1Entry = script.find((e) => e.actor === "P1");
  const aiEntry = script.find((e) => e.actor === "AI");

  const p1Card = p1Entry ? (getCard(p1Entry.cardId) ?? null) : null;
  const aiCard = aiEntry ? (getCard(aiEntry.cardId) ?? null) : null;

  const p1Airborne = p1Entry?.actorAirborne ?? 0;
  const aiAirborne = aiEntry?.actorAirborne ?? 0;

  const p1HpData: ActorHpData | undefined = p1Entry
    ? { hpAfter: p1Entry.hpAfter, cancelledPlayer: p1Entry.cancelledPlayer, comboAfter: p1Entry.comboAfter, comboHolder: p1Entry.comboHolder }
    : undefined;
  const aiHpData: ActorHpData | undefined = aiEntry
    ? { hpAfter: aiEntry.hpAfter, cancelledPlayer: aiEntry.cancelledPlayer, comboAfter: aiEntry.comboAfter, comboHolder: aiEntry.comboHolder }
    : undefined;

  const initiative: "player" | "ai" =
    script[0].actor === "P1" ? "player" : "ai";

  return makeQueue(p1Card, aiCard, initiative, p1Airborne, aiAirborne, p1HpData, aiHpData);
}
