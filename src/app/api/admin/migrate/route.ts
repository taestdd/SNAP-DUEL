import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import cardsData from "@/data/cards.json";
import decksData from "@/data/decks.json";

// One-time migration endpoint — DELETE after use.

async function runMigration() {
  const cards = cardsData as Record<string, unknown>;
  const decks = decksData as Record<string, unknown>;

  for (const [id, card] of Object.entries(cards)) {
    await getAdminDb().collection("cards").doc(id).set(card as object);
  }
  for (const [id, deck] of Object.entries(decks)) {
    await getAdminDb().collection("decks").doc(id).set(deck as object);
  }

  return {
    ok: true,
    uploaded: { cards: Object.keys(cards).length, decks: Object.keys(decks).length },
  };
}

export async function GET() {
  try {
    const result = await runMigration();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runMigration();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
