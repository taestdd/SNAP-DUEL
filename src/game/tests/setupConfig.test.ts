import { describe, it, expect } from "vitest";
import { encodeSetupParams, decodeSetupParams } from "@/lib/setupConfig";
import type { SetupConfig } from "@/game/engine/types";

/**
 * 셋업 URL 파라미터 왕복.
 * 메뉴에서 고른 설정이 /game으로 넘어가는 유일한 통로라, 인코딩/디코딩이
 * 어긋나면 옵션이 조용히 무시된다 (기본값으로 게임이 시작됨).
 */

const player: SetupConfig = { deckId: "deck_p", characters: ["nagi", "ukai"] };
const ai: SetupConfig = { deckId: "deck_a", characters: ["dm7", "nagi"] };

const roundTrip = (...args: Parameters<typeof encodeSetupParams>) =>
  decodeSetupParams(encodeSetupParams(...args));

describe("덱·캐릭터 왕복", () => {
  it("플레이어만 있으면 ai는 null이다", () => {
    const out = roundTrip(player);
    expect(out.player).toEqual(player);
    expect(out.ai).toBeNull();
  });

  it("AI 설정도 함께 왕복한다", () => {
    const out = roundTrip(player, ai);
    expect(out.player).toEqual(player);
    expect(out.ai).toEqual(ai);
  });

  it("캐릭터가 2명이 아니면 null로 떨어진다", () => {
    const params = new URLSearchParams({ pd: "deck_p", pc: "nagi" });
    expect(decodeSetupParams(params).player).toBeNull();
  });
});

describe("시간제한 없음 옵션", () => {
  it("기본은 시간제한 있음 (false)", () => {
    expect(roundTrip(player, ai).noTimeLimit).toBe(false);
  });

  it("옵션을 켜면 왕복해도 유지된다", () => {
    expect(roundTrip(player, ai, { noTimeLimit: true }).noTimeLimit).toBe(true);
  });

  it("기본값일 때는 URL을 더럽히지 않는다", () => {
    expect(encodeSetupParams(player, ai).has("nt")).toBe(false);
    expect(encodeSetupParams(player, ai, { noTimeLimit: false }).has("nt")).toBe(false);
    expect(encodeSetupParams(player, ai, { noTimeLimit: true }).get("nt")).toBe("1");
  });

  it("파라미터가 없거나 값이 이상하면 시간제한 있음으로 본다", () => {
    // 안전한 쪽(기본 규칙)으로 떨어져야 한다 — 오타로 제한이 풀리면 안 됨
    expect(decodeSetupParams(new URLSearchParams()).noTimeLimit).toBe(false);
    expect(decodeSetupParams(new URLSearchParams({ nt: "true" })).noTimeLimit).toBe(false);
    expect(decodeSetupParams(new URLSearchParams({ nt: "0" })).noTimeLimit).toBe(false);
  });

  it("온라인 경로(ai 없음)에서도 파라미터가 섞이지 않는다", () => {
    // 온라인은 옵션을 넘기지 않으므로 항상 제한이 걸린다
    expect(decodeSetupParams(encodeSetupParams(player)).noTimeLimit).toBe(false);
  });
});

describe("상대 결정 주체(opponentType) 옵션", () => {
  it("기본은 local(규칙 기반 AI)", () => {
    expect(roundTrip(player, ai).opponentType).toBe("local");
  });

  it("claude로 지정하면 왕복해도 유지된다", () => {
    expect(roundTrip(player, ai, { opponentType: "claude" }).opponentType).toBe("claude");
  });

  it("기본값(local)일 때는 URL을 더럽히지 않는다", () => {
    expect(encodeSetupParams(player, ai).has("op")).toBe(false);
    expect(encodeSetupParams(player, ai, { opponentType: "local" }).has("op")).toBe(false);
    expect(encodeSetupParams(player, ai, { opponentType: "claude" }).get("op")).toBe("claude");
  });

  it("파라미터가 없거나 값이 이상하면 local로 본다", () => {
    expect(decodeSetupParams(new URLSearchParams()).opponentType).toBe("local");
    expect(decodeSetupParams(new URLSearchParams({ op: "gpt" })).opponentType).toBe("local");
  });
});
