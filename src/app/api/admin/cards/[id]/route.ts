import { NextResponse } from "next/server";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CardSchema } from "@/game/engine/cardSchema";
import { z } from "zod";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = CardSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await getDoc(doc(db, "cards", id));
    if (!existing.exists()) {
      return NextResponse.json({ error: `카드를 찾을 수 없음: ${id}` }, { status: 404 });
    }

    await setDoc(doc(db, "cards", id), parsed.data);
    return NextResponse.json(parsed.data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await getDoc(doc(db, "cards", id));
    if (!existing.exists()) {
      return NextResponse.json({ error: `카드를 찾을 수 없음: ${id}` }, { status: 404 });
    }

    await deleteDoc(doc(db, "cards", id));
    return NextResponse.json({ deleted: id });
  } catch {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
