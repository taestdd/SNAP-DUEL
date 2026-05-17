import { NextResponse } from "next/server";
import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DeckSchema } from "@/game/engine/deckSchema";

async function readDecks(): Promise<Record<string, unknown>> {
  const snapshot = await getDocs(collection(db, "decks"));
  const decks: Record<string, unknown> = {};
  snapshot.forEach((d) => { decks[d.id] = d.data(); });
  return decks;
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
    const existing = await getDoc(doc(db, "decks", deck.id));
    if (existing.exists()) {
      return NextResponse.json({ error: `이미 존재하는 id: ${deck.id}` }, { status: 409 });
    }

    await setDoc(doc(db, "decks", deck.id), deck);
    return NextResponse.json(deck, { status: 201 });
  } catch {
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
