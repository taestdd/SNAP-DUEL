import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { CardsRecordSchema } from "@/game/engine/cardSchema";

export async function GET() {
  try {
    const snapshot = await getAdminDb().collection("cards").get();
    const raw: Record<string, unknown> = {};
    snapshot.forEach((d) => { raw[d.id] = d.data(); });

    const result = CardsRecordSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: "카드 데이터 유효성 오류" }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json({ error: "카드 데이터를 읽을 수 없습니다." }, { status: 500 });
  }
}
