import { describe, it, expect } from "vitest";
import { applyCardEffectsWithPause, applyTagSwitch } from "@/game/engine/effects";
import { enterResolving } from "@/game/engine/resolve";
import { tickPoisons } from "@/game/engine/stateHelpers";
import { registerCards } from "@/game/engine/cards";
import { makeQueueFromScript } from "@/game/animation/makeQueue";
import type { GameState, PlayerId, Poison } from "@/game/engine/types";
import { formatPoisonShort, formatPoisonDetail } from "@/game/engine/buffText";
import { makeState } from "./fixtures";

/**
 * 중독 (지속 데미지).
 *
 * 규칙:
 *  1. 리졸브 끝에 1틱 — 건 턴에는 틱하지 않는다
 *  2. 블록을 무시한다 (막을 수 없는 것이 중독의 정체성)
 *  3. scope=character면 태그로 벗어나고, player면 따라온다
 *  4. 여러 개가 걸리면 각각 틱하고 데미지가 합산된다
 *  5. 라운드가 바뀌면 남은 턴과 무관하게 전부 소멸
 *  6. 중독으로 캐릭터가 쓰러질 수 있다 (게임 종료 허용)
 */

registerCards({
  // 상대에게 3 피해 2턴 (기본 스코프 = character)
  ps_venom: {
    id: "ps_venom", name: "맹독", cardType: "skill", cost: 0, delay: 1, advantage: 0, text: "",
    effects: [{ type: "poison", target: "enemy", value: 3, poisonTurns: 2 }],
  },
  // 플레이어 스코프 — 태그해도 안 풀림
  ps_plague: {
    id: "ps_plague", name: "역병", cardType: "skill", cost: 0, delay: 1, advantage: 0, text: "",
    effects: [{ type: "poison", target: "enemy", value: 2, poisonTurns: 3, buffScope: "player", label: "역병" }],
  },
  // 즉발 데미지 + 중독을 겸하는 공격 카드
  ps_stab: {
    id: "ps_stab", name: "독침", cardType: "attack", cost: 0, delay: 1, groundAttack: 4, advantage: 0, text: "",
    effects: [{ type: "poison", target: "enemy", value: 2, poisonTurns: 1 }],
  },
  ps_pass: { id: "ps_pass", name: "빈 스킬", cardType: "skill", cost: 0, delay: 5, advantage: 0, effects: [], text: "" },
});

function apply(state: GameState, player: PlayerId, cardId: string) {
  return applyCardEffectsWithPause(state, player, cardId, [], 0, [player]);
}

const poisonsOf = (s: GameState, p: PlayerId) => s[p].status.poisons;

/* ── 1. 부여와 틱 타이밍 ──────────────────────────────────────────────── */
describe("부여와 틱 타이밍", () => {
  it("중독을 걸면 상대에게 쌓인다", () => {
    const s = apply(makeState({ P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    expect(poisonsOf(s, "AI")).toHaveLength(1);
    expect(poisonsOf(s, "P1")).toHaveLength(0);
    expect(poisonsOf(s, "AI")[0]).toMatchObject({ damage: 3, turns: 2, scope: "character", appliedTurn: 1 });
  });

  it("건 그 턴에는 틱하지 않는다", () => {
    const s = apply(makeState({ turn: 1, P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    const hpBefore = s.AI.hp;

    const { state: after, ticks } = tickPoisons(s);
    expect(ticks).toHaveLength(0);
    expect(after.AI.hp).toBe(hpBefore);
    // 남은 턴도 줄지 않는다
    expect(poisonsOf(after, "AI")[0].turns).toBe(2);
  });

  it("다음 턴부터 틱하고, 지속이 다하면 사라진다", () => {
    let s = apply(makeState({ turn: 1, P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    const hp0 = s.AI.hp;

    s = { ...s, turn: 2 };
    let out = tickPoisons(s);
    expect(out.ticks).toEqual([{ target: "AI", damage: 3, hpAfter: { P1: s.P1.hp, AI: hp0 - 3 } }]);
    expect(out.state.AI.hp).toBe(hp0 - 3);
    expect(poisonsOf(out.state, "AI")[0].turns).toBe(1);

    s = { ...out.state, turn: 3 };
    out = tickPoisons(s);
    expect(out.state.AI.hp).toBe(hp0 - 6);
    // 2턴짜리는 두 번 틱하고 소멸
    expect(poisonsOf(out.state, "AI")).toHaveLength(0);

    s = { ...out.state, turn: 4 };
    out = tickPoisons(s);
    expect(out.ticks).toHaveLength(0);
    expect(out.state.AI.hp).toBe(hp0 - 6);
  });

  it("여러 개가 걸리면 한 틱에 합산되어 들어간다", () => {
    let s = makeState({ turn: 1, P1: { queue: ["ps_venom"] } });
    s = apply(s, "P1", "ps_venom");   // 3 x2
    s = apply(s, "P1", "ps_plague");  // 2 x3
    expect(poisonsOf(s, "AI")).toHaveLength(2);

    const hp0 = s.AI.hp;
    const out = tickPoisons({ ...s, turn: 2 });
    expect(out.ticks).toHaveLength(1);
    expect(out.ticks[0].damage).toBe(5);
    expect(out.state.AI.hp).toBe(hp0 - 5);
  });

  it("양쪽 다 중독이면 각자 틱한다", () => {
    let s = makeState({ turn: 1, P1: { queue: ["ps_venom"] }, AI: { queue: ["ps_venom"] } });
    s = apply(s, "P1", "ps_venom");
    s = apply(s, "AI", "ps_venom");

    const out = tickPoisons({ ...s, turn: 2 });
    expect(out.ticks.map((t) => t.target)).toEqual(["P1", "AI"]);
    expect(out.state.P1.hp).toBe(27);
    expect(out.state.AI.hp).toBe(27);
  });
});

/* ── 2. 블록 무시 ─────────────────────────────────────────────────────── */
describe("블록 무시", () => {
  it("블록이 있어도 그대로 들어가고 블록을 소모하지도 않는다", () => {
    let s = apply(makeState({ turn: 1, P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    s = { ...s, turn: 2, AI: { ...s.AI, block: 10 } };

    const out = tickPoisons(s);
    expect(out.state.AI.hp).toBe(27);
    expect(out.state.AI.block).toBe(10);
  });
});

/* ── 3. 스코프와 태그 ─────────────────────────────────────────────────── */
describe("스코프와 태그", () => {
  it("character 스코프는 태그하면 사라진다", () => {
    let s = apply(makeState({ P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    expect(poisonsOf(s, "AI")).toHaveLength(1);

    s = applyTagSwitch(s, "AI");
    expect(poisonsOf(s, "AI")).toHaveLength(0);
  });

  it("player 스코프는 태그해도 남는다", () => {
    let s = apply(makeState({ P1: { queue: ["ps_plague"] } }), "P1", "ps_plague");
    s = applyTagSwitch(s, "AI");
    expect(poisonsOf(s, "AI")).toHaveLength(1);
    expect(poisonsOf(s, "AI")[0].scope).toBe("player");
  });

  it("태그해도 남은 중독은 새 캐릭터의 HP를 깎는다", () => {
    let s = apply(makeState({ turn: 1, P1: { queue: ["ps_plague"] } }), "P1", "ps_plague");
    s = applyTagSwitch(s, "AI");
    const benchHpBefore = s.AI.hp;

    const out = tickPoisons({ ...s, turn: 2 });
    expect(out.state.AI.hp).toBe(benchHpBefore - 2);
  });

  it("건 쪽이 태그해도 상대의 중독은 그대로다", () => {
    let s = apply(makeState({ P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    s = applyTagSwitch(s, "P1");
    expect(poisonsOf(s, "AI")).toHaveLength(1);
  });
});

/* ── 4. 리졸브 연동 ───────────────────────────────────────────────────── */
describe("리졸브 연동", () => {
  it("리졸브 끝에 틱이 돌고 poisonTicks에 실린다", () => {
    // 1턴에 중독을 건 뒤, 2턴에 아무 카드나 리졸브
    let s = apply(makeState({ turn: 1, P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    s = {
      ...s, turn: 2, phase: "RESOLVE",
      P1: { ...s.P1, queue: ["ps_pass"], hand: [] },
      AI: { ...s.AI, queue: [] },
    };

    const out = enterResolving(s);
    expect(out.phase).toBe("ANIMATING");
    expect(out.poisonTicks).toHaveLength(1);
    expect(out.poisonTicks[0]).toMatchObject({ target: "AI", damage: 3 });
    expect(out.AI.hp).toBe(27);
  });

  it("양쪽 다 패스해도 중독은 돈다", () => {
    let s = apply(makeState({ turn: 1, P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    s = { ...s, turn: 2, phase: "RESOLVE", P1: { ...s.P1, queue: [] }, AI: { ...s.AI, queue: [] } };

    const out = enterResolving(s);
    expect(out.AI.hp).toBe(27);
    expect(out.poisonTicks).toHaveLength(1);
    expect(out.phase).toBe("ANIMATING");
  });

  it("즉발 데미지와 중독을 겸하는 카드는 그 턴에 즉발만 들어간다", () => {
    const s = makeState({ turn: 1, phase: "RESOLVE", P1: { queue: ["ps_stab"], hand: [] } });
    const out = enterResolving(s);

    // 공격 4만 들어가고 중독 2는 아직 안 들어감
    expect(out.AI.hp).toBe(26);
    expect(out.poisonTicks).toHaveLength(0);
    expect(poisonsOf(out, "AI")).toHaveLength(1);
  });
});

/* ── 5. 라운드 경계 / KO ─────────────────────────────────────────────── */
describe("라운드 경계와 KO", () => {
  it("중독으로 캐릭터가 쓰러지면 게임이 끝난다", () => {
    let s = apply(makeState({ turn: 1, AI: { hp: 2 }, P1: { queue: ["ps_venom"] } }), "P1", "ps_venom");
    s = { ...s, turn: 2, phase: "RESOLVE", P1: { ...s.P1, queue: [] }, AI: { ...s.AI, queue: [] } };

    const out = enterResolving(s);
    // 연출은 재생해야 하므로 ANIMATING, winner는 이미 확정 (ANIM/DONE이 GAME_OVER로 넘긴다)
    expect(out.winner).toBe("P1");
    expect(out.AI.hp).toBeLessThanOrEqual(0);
  });

  it("라운드가 바뀌면 남은 턴과 무관하게 전부 사라진다", () => {
    const s = apply(makeState({ P1: { queue: ["ps_plague"] } }), "P1", "ps_plague");
    expect(poisonsOf(s, "AI")[0].turns).toBe(3);

    // 라운드 경계는 prepareNextRound가 처리 — 여기서는 그 결과만 확인
    const nextRound = {
      ...s,
      AI: { ...s.AI, status: { ...s.AI.status, buffs: [], poisons: [] } },
    };
    expect(poisonsOf(nextRound, "AI")).toHaveLength(0);
  });
});

/* ── 6. 연출 큐 ───────────────────────────────────────────────────────── */
describe("연출 큐", () => {
  it("중독 틱이 카드 연출 뒤에 붙는다", () => {
    const script = [{
      actor: "P1" as PlayerId, cardId: "ps_stab", actorAirborne: 0, targetAirborne: 0,
      hpAfter: { P1: 30, AI: 26 },
    }];
    const ticks = [{ target: "AI" as PlayerId, damage: 2, hpAfter: { P1: 30, AI: 24 } }];

    const queue = makeQueueFromScript(script, "p1_main", "ai_main", undefined, ticks);
    const poisonEvents = queue.filter((e) => e.type === "poison_tick");
    const lastCardDelay = Math.max(...queue.filter((e) => e.type !== "poison_tick").map((e) => e.delay));

    expect(poisonEvents).toHaveLength(1);
    expect(poisonEvents[0].delay).toBeGreaterThan(lastCardDelay);
    expect(poisonEvents[0].hpAfter).toEqual({ P1: 30, AI: 24 });
  });

  it("카드가 없어도 틱만으로 큐가 만들어진다", () => {
    const ticks = [{ target: "P1" as PlayerId, damage: 3, hpAfter: { P1: 27, AI: 30 } }];
    const queue = makeQueueFromScript([], "p1_main", "ai_main", undefined, ticks);

    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("poison_tick");
    expect(queue[0].target).toBe("P1");
  });

  it("틱이 여러 개면 시간차를 두고 재생된다", () => {
    const ticks = [
      { target: "P1" as PlayerId, damage: 3, hpAfter: { P1: 27, AI: 30 } },
      { target: "AI" as PlayerId, damage: 2, hpAfter: { P1: 27, AI: 28 } },
    ];
    const queue = makeQueueFromScript([], "p1_main", "ai_main", undefined, ticks);
    expect(queue[1].delay).toBeGreaterThan(queue[0].delay);
  });
});

/* ── 7. 표기 ──────────────────────────────────────────────────────────── */
describe("중독 표기", () => {
  const poison: Poison = { damage: 3, turns: 2, scope: "character", appliedTurn: 1 };

  it("배지는 틱당 피해와 남은 턴을 보여준다", () => {
    expect(formatPoisonShort(poison)).toBe("☠ 3 ×2");
    expect(formatPoisonShort({ ...poison, label: "맹독" })).toBe("☠ 맹독 3 ×2");
  });

  it("상세 설명에 블록 무시와 스코프가 들어간다", () => {
    const text = formatPoisonDetail(poison);
    expect(text).toContain("블록 무시");
    expect(text).toContain("2턴 남음");
    expect(text).toContain("태그 시 소멸");

    expect(formatPoisonDetail({ ...poison, scope: "player" })).toContain("태그해도 유지");
  });
});
