import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { CardSchema } from "@/game/engine/cardSchema";
import { z } from "zod";

export async function GET() {
  try {
    const snapshot = await getAdminDb().collection("cards").get();
    const cards: Record<string, unknown> = {};
    snapshot.forEach((d) => { cards[d.id] = d.data(); });
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
    const existing = await getAdminDb().collection("cards").doc(card.id).get();
    if (existing.exists) {
      return NextResponse.json({ error: `이미 존재하는 id: ${card.id}` }, { status: 409 });
    }

    await getAdminDb().collection("cards").doc(card.id).set(card);
    revalidateTag("cards", "default");
    return NextResponse.json(card, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
