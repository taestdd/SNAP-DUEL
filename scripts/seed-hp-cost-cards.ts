/**
 * HP 코스트 샘플 카드 Firestore 시딩 스크립트
 *
 * Setup:
 *   1. Firebase Console → Project Settings → Service Accounts
 *      → "Generate new private key" → save as scripts/serviceAccountKey.json
 *   2. Run: npx tsx scripts/seed-hp-cost-cards.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

const keyPath = join(process.cwd(), "scripts/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const HP_COST_CARDS = [
  {
    id: "blood_pact",
    name: "혈계",
    cardType: "skill",
    cost: 1,
    speed: 2,
    gain: 0,
    groundAttack: undefined,
    antiAirAttack: undefined,
    text: "HP 3 소모: 카드를 2장 드로우한다.",
    effects: [{ type: "draw", value: 2, target: "self" }],
    altCost: { type: "hp", amount: 3 },
    tags: ["필살"],
  },
  {
    id: "soul_strike",
    name: "단혼격",
    cardType: "attack",
    cost: 1,
    speed: 1,
    gain: 2,
    groundAttack: 6,
    antiAirAttack: 0,
    text: "HP 2 소모: 지상 공격력 6. 빠른 속도로 강력한 일격을 가한다.",
    effects: [],
    altCost: { type: "hp", amount: 2 },
    actionTag: "strong_punch",
    hitTimings: [{ frame: 1, ground: "hit_strong", airborne: "hit_strong" }],
    tags: ["격투", "필살"],
  },
  {
    id: "ghost_fire",
    name: "귀화",
    cardType: "attack",
    cost: 2,
    speed: 3,
    gain: 1,
    groundAttack: 0,
    antiAirAttack: 4,
    text: "HP 4 소모: 대공 공격력 4. 체공 상태로 전환하며 공중에서 불꽃을 날린다.",
    effects: [{ type: "airborne", value: 2, target: "self" }],
    altCost: { type: "hp", amount: 4 },
    actionTag: "aerial_kick",
    hitTimings: [{ frame: 2, ground: "hit_aerial", airborne: "hit_aerial" }],
    tags: ["격투", "필살"],
    superFlash: true,
  },
  {
    id: "death_match",
    name: "사투",
    cardType: "attack",
    cost: 0,
    speed: 5,
    gain: 3,
    groundAttack: 8,
    antiAirAttack: 0,
    text: "HP 5 소모: 덱 코스트 0. 지상 공격력 8. 목숨을 걸고 모든 것을 쏟아붓는다.",
    effects: [],
    altCost: { type: "hp", amount: 5 },
    actionTag: "strong_kick",
    hitTimings: [{ frame: 2, ground: "hit_strong", airborne: "hit_strong" }],
    tags: ["격투", "필살"],
    superFlash: true,
  },
];

async function seed() {
  for (const card of HP_COST_CARDS) {
    const ref = db.collection("cards").doc(card.id);
    await ref.set(card);
    console.log(`✓ ${card.id} (${card.name})`);
  }
  console.log("\nDone. HP 코스트 샘플 카드 4장 시딩 완료.");
}

seed().catch(console.error);
