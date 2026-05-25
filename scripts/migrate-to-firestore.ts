/**
 * One-time migration: uploads characters to Firestore.
 * Cards/Decks는 어드민 UI(/admin)에서 직접 관리.
 * 스냅샷이 필요하면: npx tsx scripts/export-firestore.ts
 *
 * Setup:
 *   Firebase Console → Project Settings → Service Accounts
 *   → "Generate new private key" → save as scripts/serviceAccountKey.json
 *
 * Usage:
 *   npx tsx scripts/migrate-to-firestore.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

const keyPath = join(process.cwd(), "scripts/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const CHARACTERS = {
  fighter: {
    id: "fighter",
    name: "길거리 격투가",
    maxHp: 12,
    spriteId: "a",
    entryEffect: null,
    exitEffect: null,
    affinities: ["격투", "구룡권"],
  },
  ninja: {
    id: "ninja",
    name: "닌자",
    maxHp: 10,
    spriteId: "b",
    entryEffect: null,
    exitEffect: { type: "draw", value: 1, target: "self" },
    affinities: ["MOLAR", "인법", "격투", "암기"],
  },
};

async function migrate() {
  console.log(`Uploading ${Object.keys(CHARACTERS).length} characters...`);
  for (const [id, char] of Object.entries(CHARACTERS)) {
    await db.collection("characters").doc(id).set(char);
    console.log(`  ✓ character: ${id}`);
  }

  console.log("\nMigration complete.");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
