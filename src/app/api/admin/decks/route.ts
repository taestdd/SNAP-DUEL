import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { DeckSchema } from "@/game/engine/deckSchema";

const DECKS_PATH = path.join(process.cwd(), "src/data/decks.json");

async function readDecks(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(DECKS_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeDecks(decks: Record<string, unknown>): Promise<void> {
  await fs.writeFile(DECKS_PATH, JSON.stringify(decks, null, 2) + "\n", "utf-8");
}

export async function GET() {
  try {
    const decks = await readDecks();
    return NextResponse.json(decks);
  } catch {
    return NextResponse.json({ error: "덱 데이터를 읽을 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = DeckSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const deck = parsed.data;
    const decks = await readDecks();

    if (decks[deck.id]) {
      return NextResponse.json({ error: `이미 존재하는 id: ${deck.id}` }, { status: 409 });
    }

    decks[deck.id] = deck;
    await writeDecks(decks);

    return NextResponse.json(deck, { status: 201 });
  } catch {
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
