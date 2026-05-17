/**
 * One-time migration: uploads cards.json and decks.json to Firestore.
 *
 * Run with:
 *   npx tsx scripts/migrate-to-firestore.ts
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "fs";
import { join } from "path";

const firebaseConfig = {
  apiKey: "AIzaSyB2WrnkhwrysAi5qlWLFl1l9EnkVDNzdlM",
  authDomain: "snap-duel-5252.firebaseapp.com",
  projectId: "snap-duel-5252",
  storageBucket: "snap-duel-5252.firebasestorage.app",
  messagingSenderId: "779186063602",
  appId: "1:779186063602:web:adbbf5b6723e3a0e9f686b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
  const dataDir = join(process.cwd(), "src/data");

  const cards = JSON.parse(readFileSync(join(dataDir, "cards.json"), "utf-8")) as Record<string, unknown>;
  const decks = JSON.parse(readFileSync(join(dataDir, "decks.json"), "utf-8")) as Record<string, unknown>;

  console.log(`Uploading ${Object.keys(cards).length} cards...`);
  for (const [id, card] of Object.entries(cards)) {
    await setDoc(doc(db, "cards", id), card as object);
    console.log(`  ✓ card: ${id}`);
  }

  console.log(`\nUploading ${Object.keys(decks).length} decks...`);
  for (const [id, deck] of Object.entries(decks)) {
    await setDoc(doc(db, "decks", id), deck as object);
    console.log(`  ✓ deck: ${id}`);
  }

  console.log("\nMigration complete.");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
