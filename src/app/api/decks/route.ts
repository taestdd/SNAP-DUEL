import { NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DecksRecordSchema } from "@/game/engine/deckSchema";

export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, "decks"));
    const raw: Record<string, unknown> = {};
    snapshot.forEach((d) => { raw[d.id] = d.data(); });

    const result = DecksRecordSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: "덱 데이터 유효성 오류" }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json({ error: "덱 데이터를 읽을 수 없습니다." }, { status: 500 });
  }
}
