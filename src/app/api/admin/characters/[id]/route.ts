import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { CharacterDefSchema } from "@/game/engine/characterSchema";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await getAdminDb().collection("characters").doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: "없는 캐릭터" }, { status: 404 });
    return NextResponse.json({ id: doc.id, ...doc.data() });
  } catch {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = CharacterDefSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await getAdminDb().collection("characters").doc(id).set(parsed.data);
    revalidateTag("characters", "default");
    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await getAdminDb().collection("characters").doc(id).delete();
    revalidateTag("characters", "default");
    return NextResponse.json({ deleted: id });
  } catch {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
