/**
 * Firestore → 로컬 JSON 스냅샷 export
 *
 * Setup:
 *   Firebase Console → Project Settings → Service Accounts
 *   → "Generate new private key" → save as scripts/serviceAccountKey.json
 *
 * Usage:
 *   npx tsx scripts/export-firestore.ts
 *
 * Output:
 *   scripts/data/cards.json
 *   scripts/data/decks.json
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const keyPath = join(process.cwd(), "scripts/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function exportCollection(name: string): Promise<Record<string, unknown>> {
  const snapshot = await db.collection(name).get();
  const result: Record<string, unknown> = {};
  snapshot.forEach((doc) => {
    result[doc.id] = { id: doc.id, ...doc.data() };
  });
  return result;
}

async function run() {
  const dataDir = join(process.cwd(), "scripts/data");
  mkdirSync(dataDir, { recursive: true });

  const collections = ["cards", "decks"] as const;

  for (const name of collections) {
    const data = await exportCollection(name);
    const path = join(dataDir, `${name}.json`);
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✓ ${name}: ${Object.keys(data).length}건 → ${path}`);
  }

  console.log("\nExport complete.");
  process.exit(0);
}

run().catch((e) => {
  console.error("Export failed:", e);
  process.exit(1);
});
