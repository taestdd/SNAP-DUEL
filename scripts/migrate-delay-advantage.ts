/**
 * 카드 필드명 speed/gain → delay/advantage 마이그레이션 스크립트
 *
 * 기존 Firestore 카드 문서의 구 필드명을 새 이름으로 일괄 변환한다.
 *   - speed → delay
 *   - gain → advantage
 *   - statModifiers[].stat "speed" → "delay", "gain" → "advantage"
 * 값은 그대로 유지 — 이름만 교체 (숫자·부호·비교 방향 불변).
 *
 * 코드 쪽은 zod 읽기 호환(cardSchema.ts acceptLegacyCardKeys)이 있어
 * 마이그레이션 전에도 동작하지만, 데이터를 새 키로 통일하면
 * 이후 호환 코드를 제거할 수 있다.
 *
 * Setup:
 *   1. scripts/serviceAccountKey.json 준비 (seed 스크립트와 동일)
 *   2. 미리보기:  npx tsx scripts/migrate-delay-advantage.ts
 *   3. 실제 반영: npx tsx scripts/migrate-delay-advantage.ts --apply
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

const keyPath = join(process.cwd(), "scripts/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");

const STAT_RENAME: Record<string, string> = { speed: "delay", gain: "advantage" };

async function main() {
  const snap = await db.collection("cards").get();
  let changed = 0;

  for (const docSnap of snap.docs) {
    const card = docSnap.data();
    const update: Record<string, unknown> = {};
    const notes: string[] = [];

    // speed → delay (새 키가 이미 있으면 구 키만 제거)
    if (card.speed !== undefined) {
      if (card.delay === undefined) {
        update.delay = card.speed;
        notes.push(`speed:${card.speed} → delay`);
      } else {
        notes.push(`speed 필드 제거 (delay:${card.delay} 이미 존재)`);
      }
      update.speed = FieldValue.delete();
    }

    // gain → advantage
    if (card.gain !== undefined) {
      if (card.advantage === undefined) {
        update.advantage = card.gain;
        notes.push(`gain:${card.gain} → advantage`);
      } else {
        notes.push(`gain 필드 제거 (advantage:${card.advantage} 이미 존재)`);
      }
      update.gain = FieldValue.delete();
    }

    // statModifiers[].stat 이름 교체
    const mods = card.statModifiers as { stat?: string }[] | undefined;
    if (Array.isArray(mods) && mods.some((m) => m?.stat && STAT_RENAME[m.stat])) {
      update.statModifiers = mods.map((m) =>
        m?.stat && STAT_RENAME[m.stat] ? { ...m, stat: STAT_RENAME[m.stat] } : m,
      );
      notes.push(`statModifiers stat 이름 교체`);
    }

    if (Object.keys(update).length === 0) continue;

    console.log(`${docSnap.id} (${card.name ?? "?"}): ${notes.join(", ")}`);
    changed++;

    if (APPLY) {
      await docSnap.ref.update(update);
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
