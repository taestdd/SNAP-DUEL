import type { CharacterId, SetupConfig } from "@/game/engine/types";

export function encodeSetupParams(player: SetupConfig, ai?: SetupConfig): URLSearchParams {
  const p = new URLSearchParams();
  p.set("pd", player.deckId);
  p.set("pc", player.characters.join(","));
  if (ai) {
    p.set("ad", ai.deckId);
    p.set("ac", ai.characters.join(","));
  }
  return p;
}

export function decodeSetupParams(params: URLSearchParams): {
  player: SetupConfig | null;
  ai: SetupConfig | null;
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

  return { player, ai };
}
