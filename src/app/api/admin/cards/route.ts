import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { CardSchema, CardsRecordSchema } from "@/game/engine/cardSchema";
import { z } from "zod";

const CARDS_PATH = path.join(process.cwd(), "src/data/cards.json");

async function readCards(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(CARDS_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeCards(cards: Record<string, unknown>): Promise<void> {
  await fs.writeFile(CARDS_PATH, JSON.stringify(cards, null, 2) + "\n", "utf-8");
}

export async function GET() {
  try {
    const cards = await readCards();
    return NextResponse.json(cards);
  } catch {
    return NextResponse.json({ error: "카드 데이터를 읽을 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = CardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const card = parsed.data;
    const cards = await readCards();

    if (cards[card.id]) {
      return NextResponse.json({ error: `이미 존재하는 id: ${card.id}` }, { status: 409 });
    }

    cards[card.id] = card;
    const validated = CardsRecordSchema.parse(cards);
    await writeCards(validated as Record<string, unknown>);

    return NextResponse.json(card, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
