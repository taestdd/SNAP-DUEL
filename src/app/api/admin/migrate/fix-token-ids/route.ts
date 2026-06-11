import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";

// token-001, token-002 (하이픈) → token_001, token_002 (언더스코어) 참조 수정
// 영향 카드: st01_016, st01_017, st01_022, st01_023
function fixTokenIds(obj: unknown): unknown {
  if (typeof obj === "string") return obj.replace(/token-(\d+)/g, "token_$1");
  if (Array.isArray(obj)) return obj.map(fixTokenIds);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, fixTokenIds(v)])
    );
  }
  return obj;
}

export async function POST() {
  const db = getAdminDb();
  const targetIds = ["st01_016", "st01_017", "st01_022", "st01_023"];
  const results: Record<string, string> = {};

  for (const id of targetIds) {
    try {
      const doc = await db.collection("cards").doc(id).get();
      if (!doc.exists) { results[id] = "not found"; continue; }

      const data = doc.data()!;
      const fixed = fixTokenIds(data) as Record<string, unknown>;
      await db.collection("cards").doc(id).set(fixed);
      results[id] = "fixed";
    } catch (e) {
      results[id] = `error: ${e}`;
    }
  }

  revalidateTag("cards", "default");
  return NextResponse.json({ results });
}
