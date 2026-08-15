import { describe, it, expect } from "vitest";
import { makeQueue, resolveHitTimings, DEFAULT_HIT_TIMINGS, HIT_FREEZE_PRESET, HIT_ZOOM_PRESET, HOME_OFFSET, DASH_MS, CLOSE_OVERLAP_PX, WHIFF_RETURN_MS } from "@/game/animation/makeQueue";
import type { ActionTag, Card, CombatAnimationEvent } from "@/game/engine/types";
import { ACTION_TAG_TO_POSE } from "@/game/engine/types";
import { CHARACTER_SPRITES } from "@/game/animation/spriteMap";

/**
 * makeQueue — 프레임 기반 히트 타이밍 + 히트스탑 인지 타임라인.
 *
 * 핵심 검증:
 *  - frame → ms 환산 (actor 포즈 fps 기준)
 *  - 다단히트에서 후속 히트가 앞선 freeze 합만큼 밀린다 (스프라이트 동결과 정렬)
 *  - freeze/zoom 미지정 시 강도별 프리셋 적용
 *  - 동일 입력 → 동일 출력 (온라인 양측 결정론)
 */

// attack_weak_punch 포즈: frames 3개, fps 6(모든 포즈 공통) → 프레임당 round(1000/6)=167ms (스프라이트 'a' 기준)
// meleeAttack: false — 타이밍 검증이 대시 지연과 섞이지 않도록 원거리로 고정
function attackCard(hitTimings: Card["hitTimings"]): Card {
  return {
    id: "test_atk",
    name: "테스트 공격",
    cardType: "attack",
    cost: 0,
    delay: 2,
    advantage: 0,
    groundAttack: 1,
    effects: [],
    text: "",
    actionTag: "weak_punch",
    hitTimings,
    meleeAttack: false,
  };
}

function visualHits(events: CombatAnimationEvent[]): CombatAnimationEvent[] {
  return events.filter((e) => e.type === "visual_hit");
}

/**
 * 가드 히트 — 스윙은 닿았지만(landed) 블록에 전부 흡수돼 체력이 안 깎인 경우(!connected).
 * 히트스탑·흔들림은 재생하되 피격 포즈는 생략하도록 guarded 플래그가 실려야 한다.
 */
describe("가드 히트 (landed / connected 분리)", () => {
  const timing = [{ frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 100, zoom: 1.1 }] as Card["hitTimings"];
  const hpData = (landed: boolean, connected: boolean) => ({
    hpAfter: { P1: 30, AI: 30 }, attackLanded: landed, attackConnected: connected,
  });

  it("블록에 전부 막히면 visual_hit이 나되 guarded=true", () => {
    const events = makeQueue(attackCard(timing), null, "player", 0, 0, 0, 0, "a", "a", hpData(true, false));
    const hits = visualHits(events);
    expect(hits).toHaveLength(1);
    expect(hits[0].guarded).toBe(true);
  });

  it("체력이 깎인 온전한 타격은 guarded=false", () => {
    const events = makeQueue(attackCard(timing), null, "player", 0, 0, 0, 0, "a", "a", hpData(true, true));
    expect(visualHits(events)[0].guarded).toBe(false);
  });

  it("스윙이 빗나가면 visual_hit 자체가 없다", () => {
    const events = makeQueue(attackCard(timing), null, "player", 0, 0, 0, 0, "a", "a", hpData(false, false));
    expect(visualHits(events)).toHaveLength(0);
  });

  it("엔진 판정이 없으면 카드 스탯 추정으로 폴백한다 (종전 동작)", () => {
    const events = makeQueue(attackCard(timing), null, "player", 0, 0, 0, 0, "a", "a");
    const hits = visualHits(events);
    expect(hits).toHaveLength(1);
    expect(hits[0].guarded).toBe(false);
  });
});

describe("frame → ms 환산", () => {
  it("frame 1은 6fps 포즈에서 167ms에 발화한다", () => {
    const card = attackCard([{ frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 100, zoom: 1.1 }]);
    const events = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    const hits = visualHits(events);
    expect(hits).toHaveLength(1);
    expect(hits[0].delay).toBe(167);
    expect(hits[0].freezeMs).toBe(100);
    expect(hits[0].zoom).toBe(1.1);
  });

  it("포즈 프레임 수를 넘는 frame은 마지막 프레임으로 clamp된다", () => {
    // attack_weak_punch는 3프레임(idx 0~2) → frame 9는 idx 2 = round(2000/6) = 333ms
    const card = attackCard([{ frame: 9, ground: "hit_weak", airborne: "hit_weak", freeze: 100 }]);
    const events = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    expect(visualHits(events)[0].delay).toBe(333);
  });
});

describe("히트스탑 인지 다단히트", () => {
  it("두 번째 히트는 첫 히트의 freeze만큼 뒤로 밀린다", () => {
    const card = attackCard([
      { frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 100, zoom: 1.1 },
      { frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 200, zoom: 1.2 },
    ]);
    const events = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    const hits = visualHits(events);
    expect(hits).toHaveLength(2);
    // hit1: 167ms(frame) + 0(acc)
    expect(hits[0].delay).toBe(167);
    // hit2: 167ms(frame) + 100(앞선 freeze)
    expect(hits[1].delay).toBe(267);
    expect(hits[1].freezeMs).toBe(200);
  });

  it("3단 히트는 freeze가 누적된다", () => {
    const card = attackCard([
      { frame: 0, ground: "hit_weak", airborne: "hit_weak", freeze: 50 },
      { frame: 0, ground: "hit_weak", airborne: "hit_weak", freeze: 50 },
      { frame: 0, ground: "hit_weak", airborne: "hit_weak", freeze: 50 },
    ]);
    const events = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    const hits = visualHits(events);
    expect(hits.map((h) => h.delay)).toEqual([0, 50, 100]);
  });
});

describe("freeze/zoom 프리셋", () => {
  it("미지정 시 강도별 프리셋이 적용된다", () => {
    const card = attackCard([{ frame: 1, ground: "hit_strong", airborne: "hit_strong" }]);
    const events = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    const hit = visualHits(events)[0];
    expect(hit.freezeMs).toBe(HIT_FREEZE_PRESET.hit_strong);
    expect(hit.zoom).toBe(HIT_ZOOM_PRESET.hit_strong);
  });
});

describe("결정론 (온라인 양측 동일성)", () => {
  it("동일 입력은 동일 이벤트 큐를 생성한다", () => {
    const card = attackCard([
      { frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 120, zoom: 1.15 },
      { frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 120, zoom: 1.15 },
    ]);
    const a = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    const b = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    expect(a).toEqual(b);
  });
});

describe("미적중 시 visual_hit 없음", () => {
  it("지상 공격이 공중 타겟에 빗나가면 visual_hit이 없다 (damage_resolve는 존재)", () => {
    const card = attackCard([{ frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 100 }]);
    // targetAirborne = 1 → groundAttack은 미적중
    const events = makeQueue(card, null, "player", 0, 1, 0, 0, "a", "a");
    expect(visualHits(events)).toHaveLength(0);
    expect(events.some((e) => e.type === "damage_resolve")).toBe(true);
  });
});

/* ── 거리(근접/비근접) 연출: 대시-인 / 넉백 ─────────────────────────────── */

const HT = [{ frame: 1, ground: "hit_weak" as const, airborne: "hit_weak" as const, freeze: 100, zoom: 1.1 }];

function meleeCard(opts?: Partial<Card>): Card {
  return { ...attackCard(HT), meleeAttack: true, ...opts };
}

function moves(events: CombatAnimationEvent[]): CombatAnimationEvent[] {
  return events.filter((e) => e.type === "fighter_move");
}

describe("대시-인 (근접공격)", () => {
  it("비근접 + 근접공격 + 적중: 상대에 겹치는 위치까지 대시 후 시퀀스가 DASH_MS만큼 밀린다", () => {
    const events = makeQueue(meleeCard(), null, "player", 0, 0, 0, 0, "a", "a");
    const dash = moves(events);
    expect(dash).toHaveLength(1);
    // 근접 = 상대 오프셋 + 겹침량 (스프라이트 여백을 파고들어 몸통이 거의 붙음)
    expect(dash[0]).toMatchObject({ subject: "P1", toOffset: HOME_OFFSET.AI + CLOSE_OVERLAP_PX, motion: "dash", delay: 0 });
    // 포즈·히트가 대시 시간만큼 뒤로 밀림
    expect(events.find((e) => e.type === "action_start")!.delay).toBe(DASH_MS);
    expect(visualHits(events)[0].delay).toBe(DASH_MS + 167);
  });

  it("근접 상태(이전 턴 대시 상태 보존)면 대시하지 않는다", () => {
    const close = { P1: HOME_OFFSET.AI + CLOSE_OVERLAP_PX, AI: HOME_OFFSET.AI };
    const events = makeQueue(meleeCard(), null, "player", 0, 0, 0, 0, "a", "a", undefined, undefined, close);
    expect(moves(events)).toHaveLength(0);
    expect(events.find((e) => e.type === "action_start")!.delay).toBe(0);
  });

  it("근접공격 off(원거리)면 비근접이어도 대시하지 않는다", () => {
    const events = makeQueue(attackCard(HT), null, "player", 0, 0, 0, 0, "a", "a");
    expect(moves(events)).toHaveLength(0);
  });

  it("meleeAttack 미지정 카드는 기본 근접(true)으로 대시한다", () => {
    const legacy: Card = { ...attackCard(HT) };
    delete legacy.meleeAttack; // 기존 Firestore 카드 = 필드 없음
    const events = makeQueue(legacy, null, "player", 0, 0, 0, 0, "a", "a");
    const mv = moves(events);
    expect(mv).toHaveLength(1);
    expect(mv[0].motion).toBe("dash");
  });

  it("빗나간 근접공격은 휘핑 — 돌진 후 헛스윙하고 원위치로 복귀한다", () => {
    // targetAirborne=1 → groundAttack 미적중
    const events = makeQueue(meleeCard(), null, "player", 0, 1, 0, 0, "a", "a");
    const mv = moves(events);
    expect(mv).toHaveLength(2);
    // 돌진은 동일하게 발생
    expect(mv[0]).toMatchObject({ subject: "P1", toOffset: HOME_OFFSET.AI + CLOSE_OVERLAP_PX, motion: "dash", delay: 0 });
    // 임팩트 프레임(167ms) 직후 복귀 — bgPush 없음 (아무것도 맞지 않았으므로)
    expect(mv[1]).toMatchObject({
      subject: "P1",
      toOffset: HOME_OFFSET.P1,
      motion: "recover",
      delay: DASH_MS + 167 + WHIFF_RETURN_MS,
    });
    expect(mv[1].bgPush).toBeUndefined();
    // 헛침이므로 피격 연출은 없음
    expect(visualHits(events)).toHaveLength(0);
  });

  it("휘핑은 거리 상태를 바꾸지 않는다 — 후공 근접공격은 여전히 대시한다", () => {
    // 선공 P1은 공중 상대에 헛침(휘핑), 후공 AI는 지상 P1에 적중
    const events = makeQueue(meleeCard(), meleeCard(), "player", 0, 1, 0, 0, "a", "a");
    const dashes = moves(events).filter((e) => e.motion === "dash");
    expect(dashes.map((e) => e.subject)).toEqual(["P1", "AI"]); // 비근접 유지 → AI도 대시
  });

  it("빗나간 원거리 공격은 이동이 전혀 없다", () => {
    const events = makeQueue(attackCard(HT), null, "player", 0, 1, 0, 0, "a", "a");
    expect(moves(events)).toHaveLength(0);
  });
});

describe("넉백", () => {
  it("대시 후 넉백: 공격자가 홈으로 복귀(recover)하며 배경 착시(bgPush)를 만든다", () => {
    const events = makeQueue(meleeCard({ knockback: true }), null, "player", 0, 0, 0, 0, "a", "a");
    const mv = moves(events);
    // 대시(P1→상대) + 복귀(P1→홈). 수비자(AI)는 이미 홈이라 이동 이벤트 없음
    expect(mv).toHaveLength(2);
    expect(mv[0]).toMatchObject({ subject: "P1", motion: "dash" });
    expect(mv[1]).toMatchObject({ subject: "P1", toOffset: HOME_OFFSET.P1, motion: "recover" });
    expect(mv[1].bgPush).toBeLessThan(0); // P1 왼쪽 복귀 → 배경 -
    // 복귀는 action_end 시점
    expect(mv[1].delay).toBe(events.find((e) => e.type === "action_end")!.delay);
  });

  it("근접 상태에서 넉백: 홈이 아닌 수비자가 밀려난다(knockback 모션)", () => {
    // AI가 이전에 P1 쪽으로 대시해 온 근접 상태
    const close = { P1: HOME_OFFSET.P1, AI: HOME_OFFSET.P1 - CLOSE_OVERLAP_PX };
    const events = makeQueue(meleeCard({ knockback: true }), null, "player", 0, 0, 0, 0, "a", "a", undefined, undefined, close);
    const mv = moves(events);
    // 근접이라 대시 없음. 수비자(AI)만 홈으로 밀려남 (공격자는 이미 홈 → 복귀 없음)
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ subject: "AI", toOffset: HOME_OFFSET.AI, motion: "knockback" });
  });

  it("넉백 off면 대시 후 위치를 유지한다 (근접 상태 지속)", () => {
    const events = makeQueue(meleeCard(), null, "player", 0, 0, 0, 0, "a", "a");
    const mv = moves(events);
    expect(mv).toHaveLength(1); // 대시만, 복귀 없음
    expect(mv[0].motion).toBe("dash");
  });
});

describe("온라인 미러 정합성 (호스트 ↔ 게스트 flip)", () => {
  // 게스트는 P1/AI가 뒤집힌 스크립트로 자기 좌표계에서 시뮬레이션한다.
  // 호스트의 fighter_move와 게스트의 fighter_move는 정확한 거울상이어야 한다:
  // subject 반전, toOffset·bgPush 부호 반전, delay·motion 동일.
  it("호스트와 게스트의 fighter_move는 거울상이다 (선공 대시+넉백, 후공 대시)", () => {
    const first = meleeCard({ knockback: true });
    const second = meleeCard();

    // 호스트 시점: P1(호스트)이 선공
    const host = makeQueue(first, second, "player", 0, 0, 0, 0, "a", "a");
    // 게스트 시점: 같은 턴이 flip되어 AI(호스트)가 선공
    const guest = makeQueue(second, first, "ai", 0, 0, 0, 0, "a", "a");

    const hostMoves = moves(host);
    const guestMoves = moves(guest);
    expect(guestMoves).toHaveLength(hostMoves.length);
    for (let i = 0; i < hostMoves.length; i++) {
      expect(guestMoves[i].subject).toBe(hostMoves[i].subject === "P1" ? "AI" : "P1");
      expect(guestMoves[i].toOffset).toBe(-hostMoves[i].toOffset!);
      expect(guestMoves[i].delay).toBe(hostMoves[i].delay);
      expect(guestMoves[i].motion).toBe(hostMoves[i].motion);
      if (hostMoves[i].bgPush !== undefined) {
        expect(guestMoves[i].bgPush).toBe(-hostMoves[i].bgPush!);
      }
    }
  });

  it("턴 사이 보존된 근접 상태에서 시작해도 거울상이 유지된다", () => {
    // 이전 턴에 호스트(P1)가 대시해 온 근접 상태 (AI 홈 쪽에 겹쳐 붙음)
    const hostStart = { P1: HOME_OFFSET.AI + CLOSE_OVERLAP_PX, AI: HOME_OFFSET.AI };
    // 게스트 좌표계의 같은 상태: 키 교환 + 부호 반전
    const guestStart = { P1: -hostStart.AI, AI: -hostStart.P1 };

    const card = meleeCard({ knockback: true });
    const host = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a", undefined, undefined, hostStart);
    const guest = makeQueue(null, card, "ai", 0, 0, 0, 0, "a", "a", undefined, undefined, guestStart);

    const hostMoves = moves(host);
    const guestMoves = moves(guest);
    // 근접이라 대시 없음 + 공격자 복귀만 (수비자는 이미 홈)
    expect(hostMoves).toHaveLength(1);
    expect(hostMoves[0]).toMatchObject({ subject: "P1", toOffset: HOME_OFFSET.P1, motion: "recover" });
    expect(guestMoves).toHaveLength(1);
    expect(guestMoves[0]).toMatchObject({ subject: "AI", toOffset: HOME_OFFSET.AI, motion: "recover" });
    expect(guestMoves[0].bgPush).toBe(-hostMoves[0].bgPush!);
  });
});

describe("거리 시뮬레이션 스레딩 (양측 시퀀스)", () => {
  it("선공이 대시해 근접이 되면 후공 근접공격은 대시하지 않는다", () => {
    const events = makeQueue(meleeCard(), meleeCard(), "player", 0, 0, 0, 0, "a", "a");
    const mv = moves(events);
    expect(mv).toHaveLength(1); // P1의 대시만
    expect(mv[0].subject).toBe("P1");
  });

  it("선공이 넉백까지 하면 후공 근접공격은 다시 대시한다", () => {
    const events = makeQueue(meleeCard({ knockback: true }), meleeCard(), "player", 0, 0, 0, 0, "a", "a");
    const dashes = moves(events).filter((e) => e.motion === "dash");
    expect(dashes).toHaveLength(2);
    expect(dashes.map((e) => e.subject)).toEqual(["P1", "AI"]);
  });
});

/* ── 동작별 기본 히트 타이밍 ───────────────────────────────────────────
 * hitTimings를 안 적은 공격 카드는 actionTag의 기본값으로 히트를 재생한다.
 * 카드에 적힌 값은 언제나 기본값을 이기고, 스킬 카드는 기본값을 받지 않는다.
 */
describe("resolveHitTimings — 동작별 기본값", () => {
  const card = (over: Partial<Card>): Card => ({
    id: "t", name: "t", cardType: "attack", cost: 0, delay: 1, advantage: 0,
    groundAttack: 1, effects: [], text: "", ...over,
  });

  it("hitTimings가 없는 공격 카드는 actionTag 기본값을 쓴다", () => {
    const c = card({ actionTag: "strong_punch" });
    expect(resolveHitTimings(c, "strong_punch")).toEqual(
      DEFAULT_HIT_TIMINGS.strong_punch,
    );
  });

  it("카드에 적힌 값이 기본값을 이긴다", () => {
    const own = [{ frame: 7, ground: "hit_weak" as const, airborne: "hit_weak" as const }];
    const c = card({ actionTag: "strong_punch", hitTimings: own });
    expect(resolveHitTimings(c, "strong_punch")).toBe(own);
  });

  it("스킬 카드는 actionTag가 있어도 기본값을 받지 않는다", () => {
    const c = card({ cardType: "skill", actionTag: "strong_punch", groundAttack: 0 });
    expect(resolveHitTimings(c, "strong_punch")).toEqual([]);
  });

  it("타격이 아닌 동작(block/draw/jump)은 기본값이 없다", () => {
    for (const tag of ["block", "draw", "jump", "use_item", "reclaim", "tag_switch"] as const) {
      expect(DEFAULT_HIT_TIMINGS[tag]).toBeUndefined();
      expect(resolveHitTimings(card({ actionTag: tag }), tag)).toEqual([]);
    }
  });

  it("actionTag가 없으면 기본값도 없다", () => {
    expect(resolveHitTimings(card({}), undefined)).toEqual([]);
  });

  it("돌려차기는 시퀀스가 두 바퀴 돌므로 기본값이 2히트다", () => {
    expect(DEFAULT_HIT_TIMINGS.dragon_kick).toHaveLength(2);
    expect(DEFAULT_HIT_TIMINGS.dragon_kick!.map((t) => t.frame)).toEqual([1, 5]);
  });

  it("모든 기본값의 frame이 해당 포즈 시퀀스 안에 있다 (clamp되지 않는다)", () => {
    // frame은 시트 번호가 아니라 재생 순번이라, 배열 길이를 넘으면 조용히 잘린다.
    // 표에 적힌 숫자와 실제 재생 위치가 어긋나는 것을 막는다.
    const sprite = CHARACTER_SPRITES["a"];
    for (const [tag, timings] of Object.entries(DEFAULT_HIT_TIMINGS)) {
      const pose = ACTION_TAG_TO_POSE[tag as ActionTag];
      const seq = pose ? sprite.poses[pose] : undefined;
      expect(seq, `${tag} 포즈 없음`).toBeDefined();
      for (const t of timings!) {
        expect(t.frame, `${tag} frame ${t.frame}`).toBeLessThan(seq!.frames.length);
      }
    }
  });
});

describe("기본값이 실제 이벤트 큐에 반영된다", () => {
  const bare: Card = {
    id: "bare", name: "기본값 카드", cardType: "attack", cost: 0, delay: 1, advantage: 0,
    groundAttack: 3, effects: [], text: "", actionTag: "strong_punch", meleeAttack: false,
  };

  it("hitTimings 없는 공격 카드도 visual_hit이 생성된다", () => {
    const q = makeQueue(bare, null, "player", 0, 0, 0, 0, "a", "a");
    const hits = q.filter((e) => e.type === "visual_hit");
    expect(hits).toHaveLength(1);
    expect(hits[0].hitPose).toBe("hit_strong");
  });

  it("체공 상대에게는 기본값의 airborne 포즈가 쓰인다", () => {
    // 지상 전용 카드는 체공 상대에게 애초에 안 닿으므로 대공 수단이 있는 카드로 본다
    const antiAir: Card = { ...bare, antiAirAttack: 3 };
    const q = makeQueue(antiAir, null, "player", 0, 1, 0, 0, "a", "a");
    const hit = q.find((e) => e.type === "visual_hit");
    expect(hit?.hitPose).toBe("hit_aerial");
  });

  it("지상 전용 카드는 체공 상대에게 히트가 나지 않는다 (기본값이 생겨도 마찬가지)", () => {
    const q = makeQueue(bare, null, "player", 0, 1, 0, 0, "a", "a");
    expect(q.filter((e) => e.type === "visual_hit")).toHaveLength(0);
  });

  it("근접 카드는 기본값만으로도 대시-인이 생긴다", () => {
    const melee: Card = { ...bare, meleeAttack: true };
    const q = makeQueue(melee, null, "player", 0, 0, 0, 0, "a", "a");
    expect(q.some((e) => e.type === "fighter_move" && e.motion === "dash")).toBe(true);
  });

  it("스킬 카드는 여전히 히트 없이 지나간다", () => {
    const skill: Card = {
      id: "sk", name: "스킬", cardType: "skill", cost: 0, delay: 1, advantage: 0,
      effects: [], text: "", actionTag: "block",
    };
    const q = makeQueue(skill, null, "player", 0, 0, 0, 0, "a", "a");
    expect(q.filter((e) => e.type === "visual_hit")).toHaveLength(0);
  });
});
