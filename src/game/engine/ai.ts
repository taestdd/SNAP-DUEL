import type { Card, GameState } from "./types";
import { getCard } from "./cards";

function getEffectValue(card: Card, type: Card["effects"][number]["type"]): number {
  return card.effects
    .filter((effect) => effect.type === type)
    .reduce((sum, effect) => sum + (effect.value ?? 0), 0);
}

function scoreCard(card: Card): number {
  let score = 0;

  const damage = getEffectValue(card, "damage");
  const block = getEffectValue(card, "block");
  const draw = getEffectValue(card, "draw");
  const heal = getEffectValue(card, "heal");
  const buffAttack = getEffectValue(card, "buff_attack");
  const burn = getEffectValue(card, "burn");
  const hasTag = card.effects.some((effect) => effect.type === "tag");

  score += damage * 2.0;
  score += block * 1.25;
  score += draw * 1.0;
  score += heal * 1.1;
  score += buffAttack * 1.15;
  score += burn * 1.4;

  if (hasTag) {
    score += 1.5;
  }

  score += card.gain * 0.9;
  score += card.speed <= 0 ? 1.2 : Math.max(0, 1 - card.speed * 0.15);
  score += card.cost * 0.15;

  return score;
}

export function aiChooseCardToPlay(state: GameState): string | null {
  const ai = state.AI;

  const playable = ai.hand
    .map((id) => getCard(id))
    .filter((card): card is Card => !!card)
    .filter((card) => card.cost <= ai.deck.length);

  if (playable.length === 0) {
    return null;
  }

  const scored = playable.map((card) => ({
    id: card.id,
    score: scoreCard(card),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.id ?? null;
}