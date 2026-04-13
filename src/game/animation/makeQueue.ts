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
 *   t=600  action_start (후공자)          ← 600ms 게임 스텝과 일치
 *   t=900  visual_hit   (선공자)
 *   t=1000 damage_resolve
 *   t=1100 action_end   (선공자, hold-frame 유지)
 *   t=1300 action_end   (후공자)
 *
 * 동시 공격 (tie):
 *   t=  0  action_start (P1 + AI 동시)
 *   t=300  visual_hit   (P1 + AI 동시)
 *   t=400  damage_resolve
 *   t=800  action_end   (P1 + AI 동시)
 *
 * 캔슬된 카드: action_start 생략, action_end 즉시(t=0) 처리.
 */
export function makeQueue(
  playerCard: Card | null,
  aiCard: Card | null,
  initiative: "player" | "ai" | "tie",
  playerCardCancelled: boolean,
  aiCardCancelled: boolean,
): CombatAnimationEvent[] {
  const events: CombatAnimationEvent[] = [];

  const p1Acts = playerCard !== null && !playerCardCancelled;
  const aiActs = aiCard !== null && !aiCardCancelled;

  if (!p1Acts && !aiActs) return events;

  if (p1Acts && !aiActs) {
    // P1만 공격
    pushSequence(events, "P1", "AI", playerCard!.actionTag, 0);
    return events;
  }

  if (!p1Acts && aiActs) {
    // AI만 공격
    pushSequence(events, "AI", "P1", aiCard!.actionTag, 0);
    return events;
  }

  // 양측 모두 공격
  if (initiative === "tie") {
    // 동시 공격
    pushSequence(events, "P1", "AI", playerCard!.actionTag, 0);
    pushSequence(events, "AI", "P1", aiCard!.actionTag, 0);
    return events;
  }

  const first: PlayerId = initiative === "player" ? "P1" : "AI";
  const second: PlayerId = initiative === "player" ? "AI" : "P1";
  const firstCard = initiative === "player" ? playerCard! : aiCard!;
  const secondCard = initiative === "player" ? aiCard! : playerCard!;

  // 선공자 시퀀스 (hold-frame: action_end를 t=1100까지 지연)
  pushSequenceWithHold(events, first, second, firstCard.actionTag, 0, 1100);
  // 후공자 시퀀스 (t=600 오프셋)
  pushSequence(events, second, first, secondCard.actionTag, 600);

  return events;
}

/** 기본 시퀀스: action_start → visual_hit → damage_resolve → action_end */
function pushSequence(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  actionTag: Card["actionTag"],
  offset: number,
): void {
  pushSequenceWithHold(events, actor, target, actionTag, offset, offset + 800);
}

/** hold-frame 지원 시퀀스: action_end를 endDelay(절대값)로 지정 */
function pushSequenceWithHold(
  events: CombatAnimationEvent[],
  actor: PlayerId,
  target: PlayerId,
  actionTag: Card["actionTag"],
  offset: number,
  endDelay: number,
): void {
  events.push({
    type: "action_start",
    delay: offset,
    actor,
    actionTag,
  });
  events.push({
    type: "visual_hit",
    delay: offset + 300,
    target,
  });
  events.push({
    type: "damage_resolve",
    delay: offset + 400,
  });
  events.push({
    type: "action_end",
    delay: endDelay,
    actor,
  });
}
