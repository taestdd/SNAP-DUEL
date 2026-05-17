import { NextResponse } from "next/server";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import cardsData from "@/data/cards.json";
import decksData from "@/data/decks.json";

// One-time migration endpoint.
// Delete this route after migration is complete.

export async function POST() {
  try {
    const cards = cardsData as Record<string, unknown>;
    const decks = decksData as Record<string, unknown>;

    const cardIds = Object.keys(cards);
    const deckIds = Object.keys(decks);

    for (const [id, card] of Object.entries(cards)) {
      await setDoc(doc(db, "cards", id), card as object);
    }

    for (const [id, deck] of Object.entries(decks)) {
      await setDoc(doc(db, "decks", id), deck as object);
    }

    return NextResponse.json({
      ok: true,
      uploaded: { cards: cardIds.length, decks: deckIds.length },
      cardIds,
      deckIds,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Firestore 마이그레이션</title>
  <style>
    body { font-family: monospace; background: #0f0f0f; color: #e0e0e0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    h1 { font-size: 18px; margin-bottom: 8px; }
    p { color: #888; font-size: 14px; margin-bottom: 32px; }
    button { background: #3a3aff; color: #fff; border: none; padding: 14px 32px; font-size: 16px; font-family: monospace; border-radius: 4px; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    pre { background: #1a1a1a; border: 1px solid #333; padding: 16px; border-radius: 4px; font-size: 13px; white-space: pre-wrap; max-width: 480px; width: 100%; margin-top: 24px; }
  </style>
</head>
<body>
  <h1>Firestore 마이그레이션</h1>
  <p>cards.json + decks.json 데이터를 Firestore에 업로드합니다.</p>
  <button id="btn" onclick="run()">마이그레이션 실행</button>
  <pre id="out" style="display:none"></pre>
  <script>
    async function run() {
      const btn = document.getElementById('btn');
      const out = document.getElementById('out');
      btn.disabled = true;
      btn.textContent = '실행 중...';
      out.style.display = 'none';
      try {
        const res = await fetch('/api/admin/migrate', { method: 'POST' });
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
        out.style.display = 'block';
        btn.textContent = data.ok ? '완료!' : '오류 발생';
      } catch(e) {
        out.textContent = String(e);
        out.style.display = 'block';
        btn.textContent = '오류 발생';
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
