import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { CharacterDefSchema } from "@/game/engine/characterSchema";

export async function GET() {
  try {
    const snapshot = await getAdminDb().collection("characters").get();
    const characters: Record<string, unknown> = {};
    snapshot.forEach((d) => { characters[d.id] = { id: d.id, ...d.data() }; });
    return NextResponse.json(characters);
  } catch {
    return NextResponse.json({ error: "캐릭터 데이터를 읽을 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = CharacterDefSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const character = parsed.data;
    const existing = await getAdminDb().collection("characters").doc(character.id).get();
    if (existing.exists) {
      return NextResponse.json({ error: `이미 존재하는 id: ${character.id}` }, { status: 409 });
    }

    await getAdminDb().collection("characters").doc(character.id).set(character);
    revalidateTag("characters", "default");
    return NextResponse.json(character, { status: 201 });
  } catch {
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
