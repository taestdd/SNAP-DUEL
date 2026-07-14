import { describe, it, expect } from "vitest";
import { enterResolving } from "@/game/engine/resolve";
import { makeState, resolveOrder } from "./fixtures";

/**
 * Phase 1 — 리졸브 핵심 규칙.
 * enterResolving(state)는 RESOLVE 상태를 받아 모든 카드를 즉시 해결하고
 * 최종 GameState(phase: ANIMATING)를 반환한다.
 */

describe("해결 순서 (딜레이 / tie-break)", () => {
  it("딜레이가 낮은 카드가 먼저 해결된다", () => {
    // P1 guard(dly0) vs AI jab(dly2) → guard 먼저
    const s = enterResolving(
      makeState({ initiative: "P1", P1: { queue: ["guard"] }, AI: { queue: ["jab"] } }),
    );
    expect(resolveOrder(s)).toEqual(["P1", "AI"]);
  });

  it("딜레이 동률이면 주도권 보유자가 먼저 해결된다", () => {
    // 둘 다 guard(dly0). initiative=AI → AI 먼저
    const s = enterResolving(
      makeState({ initiative: "AI", P1: { queue: ["guard"] }, AI: { queue: ["guard"] } }),
    );
    expect(resolveOrder(s)).toEqual(["AI", "P1"]);
  });
});

describe("데미지 적용", () => {
  it("지상 공격은 지상 상대에게 적중한다", () => {
    const s = enterResolving(makeState({ P1: { queue: ["jab"] } }));
    expect(s.AI.hp).toBe(25); // 30 - 5
    expect(s.P1.hp).toBe(30);
  });

  it("지상 공격은 체공 중인 상대에게 빗나간다", () => {
    const s = enterResolving(
      makeState({ P1: { queue: ["jab"] }, AI: { airborneStack: 1 } }),
    );
    expect(s.AI.hp).toBe(30); // ground blocked
    expect(s.initiative).toBe("P1"); // 적중 안 함 → 주도권 이동 없음
    expect(s.recentlyCounteredPlayer).toBeNull();
  });

  it("대공 공격은 체공 중인 상대에게 적중한다", () => {
    const s = enterResolving(
      makeState({ P1: { queue: ["uppercut"] }, AI: { airborneStack: 1 } }),
    );
    expect(s.AI.hp).toBe(24); // 30 - 6
  });

  it("대공 공격은 지상 상대에게 빗나간다", () => {
    const s = enterResolving(makeState({ P1: { queue: ["uppercut"] } }));
    expect(s.AI.hp).toBe(30);
  });

  it("launcher는 데미지를 주고 상대를 체공시킨다", () => {
    const s = enterResolving(makeState({ P1: { queue: ["launcher"] } }));
    expect(s.AI.hp).toBe(27); // 30 - 3
    expect(s.AI.airborneStack).toBe(1);
  });
});

describe("카운터", () => {
  it("먼저 적중한 직접 타격이 상대 큐의 카드를 카운터한다", () => {
    // P1 quick_jab(dly1) 먼저 적중 → AI jab(dly2) 카운터
    const s = enterResolving(
      makeState({ initiative: "P1", P1: { queue: ["quick_jab"] }, AI: { queue: ["jab"] } }),
    );
    expect(s.recentlyCounteredPlayer).toBe("AI");
    expect(s.AI.hp).toBe(25); // P1 타격은 적중
    expect(s.P1.hp).toBe(30); // AI 카드는 카운터되어 미적중
    expect(s.animScript).toHaveLength(1); // 카운터된 카드는 animScript 제외
  });
});

describe("주도권 (initiative)", () => {
  it("직접 타격 적중 시 공격자가 주도권을 가져온다", () => {
    const s = enterResolving(
      makeState({ initiative: "AI", P1: { queue: ["jab"] } }),
    );
    expect(s.initiative).toBe("P1");
  });
});

describe("Advantage (다음 턴 딜레이 보너스)", () => {
  it("advantage 카드가 적중하면 delayAdvantageNext가 증가한다", () => {
    const s = enterResolving(makeState({ P1: { queue: ["swift"] } }));
    expect(s.AI.hp).toBe(26); // 30 - 4
    expect(s.P1.status.delayAdvantageNext).toBe(2);
  });
});

describe("콤보", () => {
  it("주도권을 유지한 채 적중하면 콤보가 증가한다", () => {
    const s = enterResolving(
      makeState({ initiative: "P1", comboCount: 2, P1: { queue: ["jab"] } }),
    );
    expect(s.comboCount).toBe(3);
  });

  it("주도권을 새로 획득하며 적중하면 콤보가 1로 리셋된다", () => {
    const s = enterResolving(
      makeState({ initiative: "AI", comboCount: 5, P1: { queue: ["jab"] } }),
    );
    expect(s.comboCount).toBe(1);
    expect(s.initiative).toBe("P1");
  });
});

describe("스킬 카드는 주도권/카운터을 발동하지 않는다", () => {
  it("양쪽 스킬은 주도권 이동·카운터·콤보가 없다", () => {
    const s = enterResolving(
      makeState({ initiative: "P1", P1: { queue: ["guard"] }, AI: { queue: ["guard"] } }),
    );
    expect(s.initiative).toBe("P1");
    expect(s.recentlyCounteredPlayer).toBeNull();
    expect(s.comboCount).toBe(0);
  });

  it("먼저 해결된 스킬은 상대 공격을 카운터하지 않는다", () => {
    // P1 guard(dly0) 먼저 해결 → AI jab(dly2)은 카운터되지 않고 그대로 해결된다.
    // (guard의 block 5가 jab 5를 흡수하므로 HP가 아닌 animScript로 "해결됨"을 검증)
    const s = enterResolving(
      makeState({ initiative: "P1", P1: { queue: ["guard"] }, AI: { queue: ["jab"] } }),
    );
    expect(s.recentlyCounteredPlayer).toBeNull();
    expect(resolveOrder(s)).toEqual(["P1", "AI"]); // 양쪽 모두 해결 (카운터 시 length 1)
  });
});
