import type { AnimScriptEntry, Card, CombatAnimationEvent, FighterPose, HitPose, PlayerId } from "@/game/engine/types";
import { ACTION_TAG_TO_POSE } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import { CHARACTERS } from "@/game/engine/characters";
import { CHARACTER_SPRITES } from "./spriteMap";

export const SUPER_FLASH_DUR = 700;

/* ── 거리(근접/비근접) 연출 상수 ─────────────────────────────────────────
 * 거리 상태는 연출 전용이다. 파이터별 X 오프셋(px, 기본 인접 배치 기준)으로 표현:
 *   - 비근접(홈): P1 = -SPREAD_PX, AI = +SPREAD_PX (양쪽으로 벌어짐)
 *   - 근접: 대시한 쪽이 상대 스프라이트에 겹치도록 붙음
 *     (스프라이트 프레임에 투명 여백이 있어 박스 겹침 = 몸통이 거의 맞닿는 위치)
 * makeQueue가 animScript를 따라 오프셋을 시뮬레이션하며 fighter_move 이벤트를
 * 생성하고, useArenaAnimation이 이벤트를 소비해 턴 사이 오프셋을 보존한다.
 */

/** 비근접 시 홈 오프셋 크기 (px) — 박스 간격 ≈ SPREAD_PX×2 (+flex gap 0~4px) */
export const SPREAD_PX = 7;
/** 파이터별 홈(비근접) 오프셋 */
export const HOME_OFFSET: Record<PlayerId, number> = { P1: -SPREAD_PX, AI: SPREAD_PX };
/** 근접 시 상대 박스에 겹치는 깊이 (px) — 클수록 몸통이 더 붙음 */
export const CLOSE_OVERLAP_PX = 60;
/** 대시-인에 걸리는 시간 (ms) — 돌진 후 공격 포즈가 시작되도록 시퀀스를 뒤로 민다 */
export const DASH_MS = 160;
/** 공격자 복귀(넉백) 시 배경 밀림 착시량 (px) */
export const RETURN_BG_PX = 60;
/** 헛스윙(휘핑) 후 복귀까지의 여백 (ms) — 임팩트 프레임 직후 한 박자 쉬고 돌아온다 */
export const WHIFF_RETURN_MS = 180;

type FighterOffsets = { P1: number; AI: number };

/** 비근접(양쪽 다 홈) 여부 — 대시 도달 지점이 겹침 오프셋이라 동등 비교 대신 홈 기준으로 판정 */
function isFar(sim: FighterOffsets): boolean {
  return sim.P1 === HOME_OFFSET.P1 && sim.AI === HOME_OFFSET.AI;
}

/** 대시 도달 오프셋 — 상대의 현재 위치에서 상대 쪽으로 CLOSE_OVERLAP_PX 만큼 파고듦 */
function engagedOffset(actor: PlayerId, targetOffset: number): number {
  return targetOffset + (actor === "P1" ? CLOSE_OVERLAP_PX : -CLOSE_OVERLAP_PX);
}

/**
 * 히트 강도별 기본 히트스탑(ms) — 카드의 freeze 미지정 시 적용.
 * 이 값과 줌은 visual_hit 이벤트에 실려 양쪽 클라이언트가 동일하게 사용한다.
 */
export const HIT_FREEZE_PRESET: Record<HitPose, number> = {
  hit_strong: 900,
  hit_aerial: 660,
  hit_weak:   450,
};

/** 히트 강도별 기본 줌인 배율 — 카드의 zoom 미지정 시 적용 */
export const HIT_ZOOM_PRESET: Record<HitPose, number> = {
  hit_strong: 1.24,
  hit_aerial: 1.15,
  hit_weak:   1.09,
};

/** characterId → 스프라이트 ID (fps 조회용) */
function spriteIdOf(characterId: string): string {
  return CHARACTERS[characterId]?.spriteId ?? characterId;
}

/** 카드 + 행동자 체공 상태로 실제 재생 포즈를 결정 (actionTagAirborne 우선) */
function resolveActorPose(card: Card, actorAirborne: number): FighterPose | null {
  const tag = (actorAirborne >= 1 && card.actionTagAirborne)
    ? card.actionTagAirborne
    : card.actionTag;
  if (!tag) return null;
  return ACTION_TAG_TO_POSE[tag] ?? null;
}

/**
 * 임팩트 프레임(재생 순번)을 actor 포즈 fps 기준 ms로 환산.
 * 포즈 frames 범위를 벗어나면 마지막 프레임으로 clamp.
 */
function frameToMs(frame: number, pose: FighterPose | null, spriteId: string): number {
  if (!pose) return 0;
  const config = CHARACTER_SPRITES[spriteId] ?? Object.values(CHARACTER_SPRITES)[0]!;
  const entry = config.poses[pose];
  if (!entry) return 0;
  const fps = entry.fps || 10;
  const maxIdx = Math.max(0, entry.frames.length - 1);
  const clamped = Math.min(Math.max(Math.round(frame), 0), maxIdx);
  return Math.round(clamped * (1000 / fps));
}

export type ActorHpData = {
  hpAfter: { P1: number; AI: number };
  counteredPlayer?: PlayerId;
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
 * 대시-인(근접공격 + 비근접)이 있으면 t=0에 fighter_move(dash)가 먼저 발화하고
 * 해당 액터의 시퀀스 전체(포즈·히트·종료)가 DASH_MS만큼 뒤로 밀린다.
 * 넉백은 action_end 시점에 fighter_move(knockback/recover)로 발화한다.
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
  /** P1 활성 캐릭터 스프라이트 ID (frame→ms 환산 fps 조회용) */
  p1SpriteId: string,
  /** AI 활성 캐릭터 스프라이트 ID (frame→ms 환산 fps 조회용) */
  aiSpriteId: string,
  playerHpData?: ActorHpData,
  aiHpData?: ActorHpData,
  /** 턴 시작 시점의 파이터 오프셋 (미지정 시 홈=비근접). useArenaAnimation이 턴 사이 보존값을 전달 */
  startOffsets?: FighterOffsets,
): CombatAnimationEvent[] {
  const events: CombatAnimationEvent[] = [];
  // 거리 시뮬레이션 상태 — 시퀀스 처리 순서대로 대시/넉백이 갱신한다
  const sim: FighterOffsets = { ...(startOffsets ?? HOME_OFFSET) };

  const p1Acts = playerCard !== null;
  const aiActs = aiCard !== null;

  if (!p1Acts && !aiActs) return events;

  if (p1Acts && !aiActs) {
    const fd = flashDur(playerCard!);
    if (fd > 0) events.push({ type: "super_flash", delay: 0, actor: "P1" });
    pushSequence(events, "P1", "AI", playerCard!, fd, p1TargetAirborne, p1ActorAirborne, p1SpriteId, sim, playerHpData);
    return events;
  }

  if (!p1Acts && aiActs) {
    const fd = flashDur(aiCard!);
    if (fd > 0) events.push({ type: "super_flash", delay: 0, actor: "AI" });
    pushSequence(events, "AI", "P1", aiCard!, fd, aiTargetAirborne, aiActorAirborne, aiSpriteId, sim, aiHpData);
    return events;
  }

  if (initiative === "tie") {
    const p1fd = flashDur(playerCard!);
    const aifd = flashDur(aiCard!);
    const maxFd = Math.max(p1fd, aifd);
    if (p1fd > 0) events.push({ type: "super_flash", delay: 0, actor: "P1" });
    if (aifd > 0) events.push({ type: "super_flash", delay: 0, actor: "AI" });
    pushSequence(events, "P1", "AI", playerCard!, maxFd, p1TargetAirborne, p1ActorAirborne, p1SpriteId, sim, playerHpData);
    pushSequence(events, "AI", "P1", aiCard!, maxFd, aiTargetAirborne, aiActorAirborne, aiSpriteId, sim, aiHpData);
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
  const firstSpriteId = initiative === "player" ? p1SpriteId : aiSpriteId;
  const secondSpriteId = initiative === "player" ? aiSpriteId : p1SpriteId;
  const firstHpData = initiative === "player" ? playerHpData : aiHpData;
  const secondHpData = initiative === "player" ? aiHpData : playerHpData;

  const ffd = flashDur(firstCard);
  const sfd = flashDur(secondCard);

  if (ffd > 0) events.push({ type: "super_flash", delay: 0, actor: first });
  pushSequenceWithHold(events, first, second, firstCard, ffd, 1200 + ffd, firstTargetAirborne, firstActorAirborne, firstSpriteId, sim, firstHpData);

  const secondFlashAt = 700 + ffd;
  if (sfd > 0) events.push({ type: "super_flash", delay: secondFlashAt, actor: second });
  pushSequence(events, second, first, secondCard, secondFlashAt + sfd, secondTargetAirborne, secondActorAirborne, secondSpriteId, sim, secondHpData);

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
  actorSpriteId: string,
  sim: FighterOffsets,
  hpData?: ActorHpData,
): void {
  pushSequenceWithHold(events, actor, target, card, offset, offset + 800, targetAirborne, actorAirborne, actorSpriteId, sim, hpData);
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
  actorSpriteId: string,
  sim: FighterOffsets,
  hpData?: ActorHpData,
): void {
  const pose = resolveActorPose(card, actorAirborne);
  const resolvedTag = (actorAirborne >= 1 && card.actionTagAirborne)
    ? card.actionTagAirborne
    : card.actionTag;
  const hasTimings = !!(card.hitTimings && card.hitTimings.length > 0);
  // 넉백·거리 상태 전이는 "타격이 성립하는 공격"에만 적용
  // (카운터된 카드는 애초에 스크립트에 없음)
  const willConnect = hasTimings && hasConnectingAttack(card, targetAirborne);
  // 근접 스윙: 공격 스탯이 있는 근접 카드의 휘두름 — 적중 여부와 무관 (빗나가면 휘핑)
  const meleeSwing = hasTimings
    && card.cardType === "attack"
    && ((card.groundAttack ?? 0) > 0 || (card.antiAirAttack ?? 0) > 0)
    && card.meleeAttack !== false;

  // ── 대시-인: 근접 스윙 + 비근접이면 상대에게 겹치도록 돌진 후 공격 ──
  // 대시 시간만큼 시퀀스 전체(포즈·히트·종료)를 뒤로 민다.
  // meleeAttack 미지정 = true (근접이 기본, 원거리 카드만 명시적 false)
  // 적중 시에만 근접 상태로 전이하고, 빗나가면(휘핑) 스윙 후 홈으로 복귀한다.
  let shift = 0;
  let isWhiff = false;
  if (meleeSwing && isFar(sim)) {
    const to = engagedOffset(actor, sim[target]);
    events.push({ type: "fighter_move", delay: offset, subject: actor, toOffset: to, motion: "dash" });
    shift = DASH_MS;
    if (willConnect) {
      sim[actor] = to;
    } else {
      isWhiff = true; // sim 무변화 — 거리 상태는 성립한 타격만 바꾼다
    }
  }

  events.push({ type: "action_start", delay: offset + shift, actor, actionTag: resolvedTag });

  let lastImpactAt = 0;  // offset+shift 기준 마지막 히트(임팩트 프레임) 발화 시각
  if (card.hitTimings && card.hitTimings.length > 0) {
    const connects = hasConnectingAttack(card, targetAirborne);

    // 히트스탑 인지 타임라인:
    // 각 히트가 freeze만큼 스프라이트 프레임을 멈추므로, 후속 히트의 발화 시점에
    // 앞선 freeze 합(acc)을 더해야 스프라이트의 임팩트 프레임과 정확히 맞는다.
    // (단발 히트는 acc가 0이라 기존과 동일한 결과)
    let acc = 0;
    let lastFreeze = 0;

    for (const timing of card.hitTimings) {
      const hitPose: HitPose = targetAirborne >= 1 ? timing.airborne : timing.ground;
      const freezeMs = timing.freeze ?? HIT_FREEZE_PRESET[hitPose];
      const zoom = timing.zoom ?? HIT_ZOOM_PRESET[hitPose];
      const impactAt = frameToMs(timing.frame, pose, actorSpriteId) + acc;

      // visual_hit은 실제로 타격이 성립할 때만 생성
      // hasConnectingAttack이 false면 데미지도 없고 피격 포즈도 없음
      if (connects) {
        events.push({ type: "visual_hit", delay: offset + shift + impactAt, target, hitPose, freezeMs, zoom });
      }

      lastImpactAt = impactAt;
      lastFreeze = freezeMs;
      acc += freezeMs;  // 다음 히트는 이 freeze만큼 뒤로 밀림
    }

    // damage_resolve는 타격 성사 여부와 무관하게 항상 생성
    // HP바·콤보·카운터 UI 갱신 타이밍 마커로 사용됨 (마지막 임팩트 직후)
    events.push({
      type: "damage_resolve",
      delay: offset + shift + lastImpactAt + 100,
      actor,
      hpAfter: hpData?.hpAfter,
      counteredPlayer: hpData?.counteredPlayer,
      comboAfter: hpData?.comboAfter,
      comboHolder: hpData?.comboHolder,
    });

    // 마지막 히트의 freeze가 끝난 뒤 포즈를 마무리하도록 action_end를 늦춤
    endDelay = Math.max(endDelay + shift, offset + shift + lastImpactAt + lastFreeze + 100);
  } else {
    endDelay += shift;
  }

  events.push({ type: "action_end", delay: endDelay, actor });

  // ── 휘핑 복귀: 헛친 근접 스윙은 임팩트 프레임 직후 원위치로 돌아온다 ─────────
  // 배경 착시(bgPush)는 없음 — 아무것도 맞지 않았으므로 "적이 밀리는" 느낌을 주면 안 됨.
  // action_end(freeze 연장 포함)보다 일찍 복귀시켜, 후공의 대시 목표(sim 기준 홈)와
  // 화면 위치가 어긋나는 구간을 최소화한다.
  if (isWhiff) {
    events.push({
      type: "fighter_move",
      delay: offset + shift + lastImpactAt + WHIFF_RETURN_MS,
      subject: actor,
      toOffset: sim[actor],
      motion: "recover",
    });
  }

  // ── 넉백: 연출 종료 후 양측을 홈으로 → 비근접 복귀 ──────────────────────────
  // 수비자는 밀려나는 이동(knockback), 공격자는 복귀(recover) + 배경 밀림 착시.
  // 이미 홈이면 이동 이벤트를 생략한다 (배경 착시는 공격자가 실제 복귀할 때만).
  if (willConnect && card.knockback) {
    if (sim[target] !== HOME_OFFSET[target]) {
      events.push({ type: "fighter_move", delay: endDelay, subject: target, toOffset: HOME_OFFSET[target], motion: "knockback" });
      sim[target] = HOME_OFFSET[target];
    }
    if (sim[actor] !== HOME_OFFSET[actor]) {
      events.push({
        type: "fighter_move",
        delay: endDelay,
        subject: actor,
        toOffset: HOME_OFFSET[actor],
        motion: "recover",
        // 복귀와 같은 방향으로 배경을 밀어 "적이 밀려나는" 착시 생성 (P1 왼쪽 복귀 → 배경 -)
        bgPush: actor === "P1" ? -RETURN_BG_PX : RETURN_BG_PX,
      });
      sim[actor] = HOME_OFFSET[actor];
    }
  }
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
export function makeQueueFromScript(
  script: AnimScriptEntry[],
  /** P1 활성 캐릭터 ID (frame→ms fps 조회용). 게스트는 flip된 state 기준 */
  p1Character?: string,
  /** AI 활성 캐릭터 ID (frame→ms fps 조회용). 게스트는 flip된 state 기준 */
  aiCharacter?: string,
  /** 턴 시작 시점의 파이터 오프셋 (미지정 시 홈=비근접) */
  startOffsets?: FighterOffsets,
): CombatAnimationEvent[] {
  if (script.length === 0) return [];

  const fallbackSprite = Object.keys(CHARACTER_SPRITES)[0]!;
  const p1SpriteId = p1Character ? spriteIdOf(p1Character) : fallbackSprite;
  const aiSpriteId = aiCharacter ? spriteIdOf(aiCharacter) : fallbackSprite;

  const p1Entry = script.find((e) => e.actor === "P1");
  const aiEntry = script.find((e) => e.actor === "AI");

  const p1Card = p1Entry ? (getCard(p1Entry.cardId) ?? null) : null;
  const aiCard = aiEntry ? (getCard(aiEntry.cardId) ?? null) : null;

  const p1ActorAirborne = p1Entry?.actorAirborne ?? 0;
  const p1TargetAirborne = p1Entry?.targetAirborne ?? 0;
  const aiActorAirborne = aiEntry?.actorAirborne ?? 0;
  const aiTargetAirborne = aiEntry?.targetAirborne ?? 0;

  const p1HpData: ActorHpData | undefined = p1Entry
    ? { hpAfter: p1Entry.hpAfter, counteredPlayer: p1Entry.counteredPlayer, comboAfter: p1Entry.comboAfter, comboHolder: p1Entry.comboHolder }
    : undefined;
  const aiHpData: ActorHpData | undefined = aiEntry
    ? { hpAfter: aiEntry.hpAfter, counteredPlayer: aiEntry.counteredPlayer, comboAfter: aiEntry.comboAfter, comboHolder: aiEntry.comboHolder }
    : undefined;

  const initiative: "player" | "ai" =
    script[0].actor === "P1" ? "player" : "ai";

  return makeQueue(p1Card, aiCard, initiative, p1ActorAirborne, p1TargetAirborne, aiActorAirborne, aiTargetAirborne, p1SpriteId, aiSpriteId, p1HpData, aiHpData, startOffsets);
}
