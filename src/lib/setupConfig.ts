import type { CharacterId, SetupConfig } from "@/game/engine/types";

export function encodeSetupParams(
  player: SetupConfig,
  ai?: SetupConfig,
  /** AI 대전 옵션 — 기본값과 같으면 URL에 싣지 않는다 */
  options?: { noTimeLimit?: boolean },
): URLSearchParams {
  const p = new URLSearchParams();
  p.set("pd", player.deckId);
  p.set("pc", player.characters.join(","));
  if (ai) {
    p.set("ad", ai.deckId);
    p.set("ac", ai.characters.join(","));
  }
  if (options?.noTimeLimit) p.set("nt", "1");
  return p;
}

export function decodeSetupParams(params: URLSearchParams): {
  player: SetupConfig | null;
  ai: SetupConfig | null;
  /** 시간제약 해제 여부 — 파라미터가 없으면 false(=제한 있음)가 기본 */
  noTimeLimit: boolean;
} {
  const pd = params.get("pd");
  const pc = params.get("pc")?.split(",");
  const ad = params.get("ad");
  const ac = params.get("ac")?.split(",");

  const player =
    pd && pc?.length === 2
      ? { deckId: pd, characters: pc as [CharacterId, CharacterId] }
      : null;

  const ai =
    ad && ac?.length === 2
      ? { deckId: ad, characters: ac as [CharacterId, CharacterId] }
      : null;

  return { player, ai, noTimeLimit: params.get("nt") === "1" };
}
