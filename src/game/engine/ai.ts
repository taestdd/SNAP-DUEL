import { GameState } from "./types";
import { getCard } from "./cards";

export function aiChooseCardToPlay(state: GameState): string | null {
  const ai = state.AI;
  if (ai.energy <= 0) return null;

  const playable = ai.hand
    .map(getCard)
    .filter(Boolean)
    .filter((c) => c.cost <= ai.energy);

  if (playable.length === 0) return null;

  // 아주 단순한 점수화(추후 개선)
  const scored = playable.map((c) => {
    let score = 0;

    if (c.effect === "damage") score += c.value * 2;
    if (c.effect === "block") score += c.value * 1.5;
    if (c.effect === "heal") score += c.value * 1.2;
    if (c.effect === "draw") score += 1.0;
    if (c.effect === "burn") score += c.value * 2.5;

    // 막판(턴 5~6)은 공격 가중치
    if (state.turn >= 5 && c.effect === "damage") score += 5;

    // 에너지 효율
    score += 0.2 * (10 - c.cost);

    return { id: c.id, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // 약간 랜덤성(매번 똑같지 않게)
  const r = Math.random();
  if (r < 0.15 && scored.length >= 2) return scored[1].id;

  return scored[0].id;
}