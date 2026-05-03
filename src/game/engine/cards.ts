import type { Card } from "./types";
import { CardsRecordSchema } from "./cardSchema";
import cardsData from "@/data/cards.json";

export const CARDS: Record<string, Card> = CardsRecordSchema.parse(cardsData);

export function getCard(id: string): Card | undefined {
  return CARDS[id];
}
