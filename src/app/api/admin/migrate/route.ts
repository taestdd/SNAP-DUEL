import { NextResponse } from "next/server";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import cardsData from "@/data/cards.json";
import decksData from "@/data/decks.json";

// One-time migration endpoint: POST /api/admin/migrate
// Uploads cards.json + decks.json to Firestore.
// Delete this route after migration is complete.
export async function POST() {
  try {
    const cards = cardsData as Record<string, unknown>;
    const decks = decksData as Record<string, unknown>;

    const cardIds = Object.keys(cards);
    const deckIds = Object.keys(decks);

    for (const [id, card] of Object.entries(cards)) {
      await setDoc(doc(db, "cards", id), card as object);
    }

    for (const [id, deck] of Object.entries(decks)) {
      await setDoc(doc(db, "decks", id), deck as object);
    }

    return NextResponse.json({
      ok: true,
      uploaded: { cards: cardIds.length, decks: deckIds.length },
      cardIds,
      deckIds,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}

// Safety: GET returns instructions, not data
export async function GET() {
  return NextResponse.json({
    info: "POST to this endpoint to migrate cards.json + decks.json to Firestore.",
  });
}
