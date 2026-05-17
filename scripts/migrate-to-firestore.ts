/**
 * One-time migration: uploads cards.json and decks.json to Firestore.
 *
 * Setup:
 *   1. Firebase Console → Project Settings → Service Accounts
 *      → "Generate new private key" → save as scripts/serviceAccountKey.json
 *   2. Run: npx tsx scripts/migrate-to-firestore.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

const keyPath = join(process.cwd(), "scripts/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrate() {
  const dataDir = join(process.cwd(), "src/data");

  const cards = JSON.parse(readFileSync(join(dataDir, "cards.json"), "utf-8")) as Record<string, unknown>;
  const decks = JSON.parse(readFileSync(join(dataDir, "decks.json"), "utf-8")) as Record<string, unknown>;

  console.log(`Uploading ${Object.keys(cards).length} cards...`);
  for (const [id, card] of Object.entries(cards)) {
    await db.collection("cards").doc(id).set(card as object);
    console.log(`  ✓ card: ${id}`);
  }

  console.log(`\nUploading ${Object.keys(decks).length} decks...`);
  for (const [id, deck] of Object.entries(decks)) {
    await db.collection("decks").doc(id).set(deck as object);
    console.log(`  ✓ deck: ${id}`);
  }

  console.log("\nMigration complete.");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
