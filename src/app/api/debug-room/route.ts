import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

/** GET /api/debug-room?code=XXXXXX — 디버그 로그 조회 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const db = getAdminDb();
  const snap = await db.collection("rooms").doc(code.toUpperCase()).get();
  if (!snap.exists) return NextResponse.json({ error: "room not found" }, { status: 404 });

  const logs: string[] = snap.data()?.debugLogs ?? [];
  return NextResponse.json({ code: code.toUpperCase(), count: logs.length, logs });
}

/** DELETE /api/debug-room?code=XXXXXX — 디버그 로그 초기화 */
export async function DELETE(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const db = getAdminDb();
  await db.collection("rooms").doc(code.toUpperCase()).update({ debugLogs: [] });
  return NextResponse.json({ ok: true });
}
