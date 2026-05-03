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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = DeckSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const decks = await readDecks();
    if (!decks[id]) {
      return NextResponse.json({ error: `덱을 찾을 수 없음: ${id}` }, { status: 404 });
    }

    decks[id] = parsed.data;
    await writeDecks(decks);

    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const decks = await readDecks();

    if (!decks[id]) {
      return NextResponse.json({ error: `덱을 찾을 수 없음: ${id}` }, { status: 404 });
    }

    delete decks[id];
    await writeDecks(decks);

    return NextResponse.json({ deleted: id });
  } catch {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
