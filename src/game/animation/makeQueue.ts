import type { Card, CombatAnimationEvent, PlayerId } from "@/game/engine/types";

/**
 * 두 카드와 이니셔티브 정보를 받아 CombatAnimationEvent[] 를 생성한다.
 *
 * 이벤트 절대 지연 설계 (큐 시작 = t=0)
 *
 * 단일 공격자:
 *   t=  0  action_start (공격자)
 *   t=300  visual_hit   (피격자)
 *   t=400  damage_resolve
 *   t=800  action_end   (공격자 포즈 유지)
 *
 * 양측 모두 카드 있음 + 이니셔티브 우위 (선공자 먼저):
 *   t=  0  action_start (선공자)
 *   t=300  visual_hit   (상대방)
 *   t=400  damage_resolve
 *   t=700  action_start (후공자)          ← 600ms 게임 스텝 + 100ms 버퍼 (캔슬 감지 선행)
 *   t=1000 visual_hit   (선공자)
 *   t=1100 damage_resolve
 *   t=1200 action_end   (선공자, hold-frame 유지)
 *   t=1500 action_end   (후공자)
 *
 * 동시 공격 (tie):
 *   t=  0  action_start (P1 + AI 동시)
 *   t=300  visual_hit   (P1 + AI 동시)
 *   t=400  damage_resolve
 *   t=800  action_end   (P1 + AI 동시)
 */
function hasDamage(card: Card): boolean {
  return card.effects.some((e) => e.type === "damage");
}

export function makeQueue(
  playerCard: Card | null,
  aiCard: Card | null,
  initiative: "player" | "ai" | "tie",
): CombatAnimationEvent[] {
  const events: CombatAnimationEvent[] = [];

  const p1Acts = playerCard !== null;
  const aiActs = aiCard !== null;

  if (!p1Acts && !aiActs) return events;

  if (p1Acts && !aiActs) {
    // P1만 공격
    pushSequence(events, "P1", "AI", playerCard!.actionTag, 0, hasDamage(playerCard!));
    return events;
  }

  if (!p1Acts && aiActs) {
    // AI만 공격
    pushSequence(events, "AI", "P1", aiCard!.actionTag, 0, hasDamage(aiCard!));
    return events;
  }

  // 양측 모두 공격
  if (initiative === "tie") {
    // 동시 공격
    pushSequence(events, "P1", "AI", playerCard!.actionTag, 0, hasDamage(playerCard!));
    pushSequence(events, "AI", "P1", aiCard!.actionTag, 0, hasDamage(aiCard!));
    return events;
  }

  const first: PlayerId = initiative === "player" ? "P1" : "AI";
  const second: PlayerId = initiative === "player" ? "AI" : "P1";
  const firstCard = initiative === "player" ? playerCard! : aiCard!;
  const secondCard = initiative === "player" ? aiCard! : playerCard!;

  // 선공자 시퀀스 (hold-frame: action_end를 t=1200까지 지연)
  pushSequenceWithHold(events, first, second, firstCard.actionTag, 0, 1200, hasDamage(firstCard));
  // 후공자 시퀀스 (t=700 오프셋 — 600ms 게임 스텝 후 100ms 버퍼로 캔슬 감지 선행)
  pushSequence(events, second, first, secondCard.actionTag, 700, hasDamage(secondCard));

  return events;
}

/** 기본 시퀀스: action_start → (visual_hit → damage_resolve)? → action_end */
function pushSequence(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  actionTag: Card["actionTag"],
  offset: number,
  showHit: boolean,
): void {
  pushSequenceWithHold(events, actor, target, actionTag, offset, offset + 800, showHit);
}

/** hold-frame 지원 시퀀스: action_end를 endDelay(절대값)로 지정 */
function pushSequenceWithHold(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  actionTag: Card["actionTag"],
  offset: number,
  endDelay: number,
  showHit: boolean,
): void {
  events.push({
    type: "action_start",
    delay: offset,
    actor,
    actionTag,
  });
  if (showHit) {
    events.push({
      type: "visual_hit",
      delay: offset + 300,
      target,
    });
    events.push({
      type: "damage_resolve",
      delay: offset + 400,
    });
  }
  events.push({
    type: "action_end",
    delay: endDelay,
    actor,
  });
}
