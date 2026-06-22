import { describe, it, expect } from "vitest";
import { makeQueue, HIT_FREEZE_PRESET, HIT_ZOOM_PRESET } from "@/game/animation/makeQueue";
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
