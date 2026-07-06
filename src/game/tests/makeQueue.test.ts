import { describe, it, expect } from "vitest";
import { makeQueue, HIT_FREEZE_PRESET, HIT_ZOOM_PRESET, HOME_OFFSET, DASH_MS } from "@/game/animation/makeQueue";
import type { Card, CombatAnimationEvent } from "@/game/engine/types";

/**
 * makeQueue — 프레임 기반 히트 타이밍 + 히트스탑 인지 타임라인.
 *
 * 핵심 검증:
 *  - frame → ms 환산 (actor 포즈 fps 기준)
 *  - 다단히트에서 후속 히트가 앞선 freeze 합만큼 밀린다 (스프라이트 동결과 정렬)
 *  - freeze/zoom 미지정 시 강도별 프리셋 적용
 *  - 동일 입력 → 동일 출력 (온라인 양측 결정론)
 */

// attack_weak_punch 포즈: frames 2개, fps 10 → 프레임당 100ms (스프라이트 'a' 기준)
function attackCard(hitTimings: Card["hitTimings"]): Card {
  return {
    id: "test_atk",
    name: "테스트 공격",
    cardType: "attack",
    cost: 0,
    speed: 2,
    gain: 0,
    groundAttack: 1,
    effects: [],
    text: "",
    actionTag: "weak_punch",
    hitTimings,
  };
}

function visualHits(events: CombatAnimationEvent[]): CombatAnimationEvent[] {
  return events.filter((e) => e.type === "visual_hit");
}

describe("frame → ms 환산", () => {
  it("frame 1은 fps 10 포즈에서 100ms에 발화한다", () => {
    const card = attackCard([{ frame: 1, ground: "hit_weak", airborne: "hit_weak", freeze: 100, zoom: 1.1 }]);
    const events = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    const hits = visualHits(events);
    expect(hits).toHaveLength(1);
    expect(hits[0].delay).toBe(100);
    expect(hits[0].freezeMs).toBe(100);
    expect(hits[0].zoom).toBe(1.1);
  });

  it("포즈 프레임 수를 넘는 frame은 마지막 프레임으로 clamp된다", () => {
    // attack_weak_punch는 2프레임(idx 0,1) → frame 9는 idx 1 = 100ms
    const card = attackCard([{ frame: 9, ground: "hit_weak", airborne: "hit_weak", freeze: 100 }]);
    const events = makeQueue(card, null, "player", 0, 0, 0, 0, "a", "a");
    expect(visualHits(events)[0].delay).toBe(100);
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
    // hit1: 100ms(frame) + 0(acc)
    expect(hits[0].delay).toBe(100);
    // hit2: 100ms(frame) + 100(앞선 freeze)
    expect(hits[1].delay).toBe(200);
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
  it("비근접 + 근접공격 + 적중: 상대 오프셋까지 대시 후 시퀀스가 DASH_MS만큼 밀린다", () => {
    const events = makeQueue(meleeCard(), null, "player", 0, 0, 0, 0, "a", "a");
    const dash = moves(events);
    expect(dash).toHaveLength(1);
    expect(dash[0]).toMatchObject({ subject: "P1", toOffset: HOME_OFFSET.AI, motion: "dash", delay: 0 });
    // 포즈·히트가 대시 시간만큼 뒤로 밀림
    expect(events.find((e) => e.type === "action_start")!.delay).toBe(DASH_MS);
    expect(visualHits(events)[0].delay).toBe(DASH_MS + 100);
  });

  it("근접 상태(오프셋 동일)면 대시하지 않는다", () => {
    const close = { P1: HOME_OFFSET.AI, AI: HOME_OFFSET.AI };
    const events = makeQueue(meleeCard(), null, "player", 0, 0, 0, 0, "a", "a", undefined, undefined, close);
    expect(moves(events)).toHaveLength(0);
    expect(events.find((e) => e.type === "action_start")!.delay).toBe(0);
  });

  it("근접공격 off(원거리)면 비근접이어도 대시하지 않는다", () => {
    const events = makeQueue(attackCard(HT), null, "player", 0, 0, 0, 0, "a", "a");
    expect(moves(events)).toHaveLength(0);
  });

  it("빗나간 근접공격은 대시하지 않는다", () => {
    // targetAirborne=1 → groundAttack 미적중
    const events = makeQueue(meleeCard(), null, "player", 0, 1, 0, 0, "a", "a");
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
    // 둘 다 P1 홈 쪽에 붙어 있는 근접 상태 (AI가 이전에 대시해 온 상황)
    const close = { P1: HOME_OFFSET.P1, AI: HOME_OFFSET.P1 };
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
    // 이전 턴에 호스트(P1)가 대시해 온 근접 상태 (둘 다 AI 홈 쪽)
    const hostStart = { P1: HOME_OFFSET.AI, AI: HOME_OFFSET.AI };
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
