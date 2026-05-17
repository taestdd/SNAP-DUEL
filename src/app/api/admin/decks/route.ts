import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { DeckSchema } from "@/game/engine/deckSchema";

export async function GET() {
  try {
    const snapshot = await getAdminDb().collection("decks").get();
    const decks: Record<string, unknown> = {};
    snapshot.forEach((d) => { decks[d.id] = { id: d.id, ...d.data() }; });
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
    const existing = await getAdminDb().collection("decks").doc(deck.id).get();
    if (existing.exists) {
      return NextResponse.json({ error: `이미 존재하는 id: ${deck.id}` }, { status: 409 });
    }

    await getAdminDb().collection("decks").doc(deck.id).set(deck);
    revalidateTag("decks", "default");
    return NextResponse.json(deck, { status: 201 });
  } catch {
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
