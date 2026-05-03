import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { CardSchema } from "@/game/engine/cardSchema";
import { z } from "zod";

const CARDS_PATH = path.join(process.cwd(), "src/data/cards.json");

async function readCards(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(CARDS_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeCards(cards: Record<string, unknown>): Promise<void> {
  await fs.writeFile(CARDS_PATH, JSON.stringify(cards, null, 2) + "\n", "utf-8");
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = CardSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const cards = await readCards();
    if (!cards[id]) {
      return NextResponse.json({ error: `카드를 찾을 수 없음: ${id}` }, { status: 404 });
    }

    cards[id] = parsed.data;
    await writeCards(cards);

    return NextResponse.json(parsed.data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cards = await readCards();

    if (!cards[id]) {
      return NextResponse.json({ error: `카드를 찾을 수 없음: ${id}` }, { status: 404 });
    }

    delete cards[id];
    await writeCards(cards);

    return NextResponse.json({ deleted: id });
  } catch {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
