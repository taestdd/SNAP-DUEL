import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Action, GameState, SetupConfig } from "@/game/engine/types";

export type RoomStatus = "waiting" | "ready" | "in_progress" | "finished";

export type RoomData = {
  status: RoomStatus;
  createdAt: unknown;
  hostConfig: SetupConfig | null;
  guestConfig: SetupConfig | null;
  gameState: GameState | null;
  guestAction: Action | null;
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createRoom(): Promise<string> {
  let code = generateCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = doc(db, "rooms", code);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        status: "waiting",
        createdAt: serverTimestamp(),
        hostConfig: null,
        guestConfig: null,
        gameState: null,
        guestAction: null,
      });
      return code;
    }
    code = generateCode();
  }
  throw new Error("방 코드 생성 실패. 다시 시도해주세요.");
}

export async function joinRoom(code: string): Promise<boolean> {
  const ref = doc(db, "rooms", code.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data() as RoomData;
  if (data.status !== "waiting") return false;
  await updateDoc(ref, { status: "ready" });
  return true;
}

export async function saveHostConfig(code: string, config: SetupConfig): Promise<void> {
  const ref = doc(db, "rooms", code);
  await updateDoc(ref, { hostConfig: config });
}

export async function saveGuestConfig(code: string, config: SetupConfig): Promise<void> {
  const ref = doc(db, "rooms", code);
  await updateDoc(ref, { guestConfig: config });
}

export async function startGame(code: string, hostConfig: SetupConfig, guestConfig: SetupConfig, initialState: GameState): Promise<void> {
  const ref = doc(db, "rooms", code);
  await updateDoc(ref, {
    status: "in_progress",
    hostConfig,
    guestConfig,
    gameState: initialState,
  });
}

export async function syncState(code: string, state: GameState): Promise<void> {
  const ref = doc(db, "rooms", code);
  await updateDoc(ref, { gameState: state });
}

export async function sendGuestAction(code: string, action: Action): Promise<void> {
  const ref = doc(db, "rooms", code);
  await updateDoc(ref, { guestAction: action });
}

export async function clearGuestAction(code: string): Promise<void> {
  const ref = doc(db, "rooms", code);
  await updateDoc(ref, { guestAction: deleteField() });
}

export function subscribeRoom(
  code: string,
  onUpdate: (data: RoomData) => void,
): () => void {
  const ref = doc(db, "rooms", code);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      onUpdate(snap.data() as RoomData);
    }
  });
}
