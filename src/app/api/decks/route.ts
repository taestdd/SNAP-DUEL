import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { DecksRecordSchema } from "@/game/engine/deckSchema";

const getCachedDecks = unstable_cache(
  async () => {
    const snapshot = await getAdminDb().collection("decks").get();
    const raw: Record<string, unknown> = {};
    snapshot.forEach((d) => { raw[d.id] = d.data(); });
    return DecksRecordSchema.parse(raw);
  },
  ["decks"],
  { tags: ["decks"] }
);

export async function GET() {
  try {
    const data = await getCachedDecks();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "덱 데이터를 읽을 수 없습니다." }, { status: 500 });
  }
}
