/**
 * hitTimings: ms → frame 마이그레이션 스크립트
 *
 * 기존 카드의 hitTimings[].ms 를 프레임 기반(frame)으로 일괄 변환한다.
 *   frame = round(ms ÷ (1000 / fps))  (포즈 frames 길이로 clamp)
 * fps는 actionTag → 포즈 → 스프라이트 설정에서 가져온다.
 * (모든 캐릭터가 DEFAULT_POSES를 공유하므로 아래 테이블을 인라인으로 둔다.
 *  src/game/animation/spriteMap.ts 의 DEFAULT_POSES 와 동기 유지 필요.)
 *
 * Setup:
 *   1. scripts/serviceAccountKey.json 준비 (seed 스크립트와 동일)
 *   2. 미리보기:  npx tsx scripts/migrate-hittimings-to-frame.ts
 *   3. 실제 반영: npx tsx scripts/migrate-hittimings-to-frame.ts --apply
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

const keyPath = join(process.cwd(), "scripts/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");

// actionTag → { fps, frameCount } (spriteMap.ts DEFAULT_POSES 기준)
const POSE_INFO: Record<string, { fps: number; frames: number }> = {
  weak_punch:   { fps: 10, frames: 2 },
  strong_punch: { fps: 10, frames: 2 },
  aerial_punch: { fps: 10, frames: 2 },
  weak_kick:    { fps: 8,  frames: 3 },
  strong_kick:  { fps: 8,  frames: 3 },
  aerial_kick:  { fps: 8,  frames: 3 },
  hadouken:     { fps: 8,  frames: 3 },
  dragon_kick:  { fps: 6,  frames: 7 },
  rising_punch: { fps: 6,  frames: 4 },
  use_item:     { fps: 8,  frames: 2 },
  block:        { fps: 6,  frames: 2 },
  throw:        { fps: 6,  frames: 3 },
  jump:         { fps: 8,  frames: 2 },
};

const DEFAULT_INFO = { fps: 10, frames: 2 };

function msToFrame(ms: number, actionTag?: string): number {
  const info = (actionTag && POSE_INFO[actionTag]) || DEFAULT_INFO;
  const raw = Math.round(ms / (1000 / info.fps));
  return Math.min(Math.max(raw, 0), info.frames - 1);
}

async function main() {
  const snap = await db.collection("cards").get();
  let changed = 0;

  for (const docSnap of snap.docs) {
    const card = docSnap.data();
    const timings = card.hitTimings as
      | { ms?: number; frame?: number; ground: string; airborne: string; freeze?: number; zoom?: number }[]
      | undefined;
    if (!timings || timings.length === 0) continue;

    // 이미 frame 기반이면 스킵
    const needsMigration = timings.some((t) => typeof t.ms === "number" && typeof t.frame !== "number");
    if (!needsMigration) continue;

    const converted = timings.map((t) => {
      if (typeof t.frame === "number") return t; // 이미 변환됨
      const frame = msToFrame(t.ms ?? 0, card.actionTag);
      const { ms: _ms, ...rest } = t;
      void _ms;
      return { frame, ...rest };
    });

    console.log(`${docSnap.id} (${card.name ?? "?"}): ${JSON.stringify(timings)} → ${JSON.stringify(converted)}`);
    changed++;

    if (APPLY) {
      await docSnap.ref.update({ hitTimings: converted });
    }
  }

  console.log(
    `\n${changed}개 카드 ${APPLY ? "변환 완료" : "변환 대상(미적용 — --apply로 실제 반영)"}.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
