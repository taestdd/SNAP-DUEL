import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { DeckSchema } from "@/game/engine/deckSchema";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = DeckSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await getAdminDb().collection("decks").doc(id).get();
    if (!existing.exists) {
      return NextResponse.json({ error: `덱을 찾을 수 없음: ${id}` }, { status: 404 });
    }

    await getAdminDb().collection("decks").doc(id).set(parsed.data);
    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await getAdminDb().collection("decks").doc(id).get();
    if (!existing.exists) {
      return NextResponse.json({ error: `덱을 찾을 수 없음: ${id}` }, { status: 404 });
    }

    await getAdminDb().collection("decks").doc(id).delete();
    return NextResponse.json({ deleted: id });
  } catch {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
