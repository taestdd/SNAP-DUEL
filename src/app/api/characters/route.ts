import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { CharactersRecordSchema } from "@/game/engine/characterSchema";

const getCachedCharacters = unstable_cache(
  async () => {
    const snapshot = await getAdminDb().collection("characters").get();
    const raw: Record<string, unknown> = {};
    snapshot.forEach((d) => { raw[d.id] = d.data(); });
    return CharactersRecordSchema.parse(raw);
  },
  ["characters"],
  { tags: ["characters"] }
);

export async function GET() {
  try {
    const data = await getCachedCharacters();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "캐릭터 데이터를 읽을 수 없습니다." }, { status: 500 });
  }
}
