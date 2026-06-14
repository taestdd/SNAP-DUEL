import type { Card } from "./types";
import { CardsRecordSchema } from "./cardSchema";

let _cards: Record<string, Card> = {};

export function initCards(data: unknown): void {
  _cards = CardsRecordSchema.parse(data);
}

export function registerCards(extra: Record<string, Card>): void {
  Object.assign(_cards, extra);
}

export function getCard(id: string): Card | undefined {
  return _cards[id];
}

export function getAllCards(): Record<string, Card> {
  return _cards;
}
