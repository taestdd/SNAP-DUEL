"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { createRoom, subscribeRoom, saveHostConfig, startGame } from "@/lib/roomService";
import type { RoomData } from "@/lib/roomService";
import { createInitialState } from "@/game/engine/state";
import SetupScreen from "@/components/game/SetupScreen";
import type { SetupConfig } from "@/game/engine/types";
import styles from "./page.module.css";

type Stage = "creating" | "waiting" | "setup" | "waitingGuest" | "starting";

export default function HostPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("creating");
  const [roomCode, setRoomCode] = useState<string>("");
  const [error, setError] = useState("");

  // 방 생성
  useEffect(() => {
    let cancelled = false;
    createRoom()
      .then((code) => {
        if (cancelled) return;
        setRoomCode(code);
        setStage("waiting");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message ?? "방 생성 실패");
      });
    return () => { cancelled = true; };
  }, []);

  // 게스트 연결 대기
  useEffect(() => {
    if (!roomCode || stage !== "waiting") return;
    const unsubscribe = subscribeRoom(roomCode, (data: RoomData) => {
      if (data.status === "ready") setStage("setup");
    });
    return () => unsubscribe();
  }, [roomCode, stage]);

  // 호스트 SetupScreen 확인 → hostConfig 저장 → 게스트 config 대기
  async function handleSetupConfirm(config: SetupConfig, _aiConfig?: SetupConfig) {
    setStage("waitingGuest");
    try {
      await saveHostConfig(roomCode, config);
    } catch (e: unknown) {
      setError((e as Error).message ?? "저장 실패");
      setStage("setup");
      return;
    }

    // 게스트 config가 올라오면 게임 시작
    const unsubscribe = subscribeRoom(roomCode, async (data: RoomData) => {
      if (!data.guestConfig) return;
      unsubscribe();
      setStage("starting");
      try {
        const initialState = createInitialState(config, data.guestConfig);
        await startGame(roomCode, config, data.guestConfig, initialState);
        router.push(`/online/game?code=${roomCode}&role=host`);
      } catch (e: unknown) {
        setError((e as Error).message ?? "게임 시작 실패");
        setStage("waitingGuest");
      }
    });
  }

  const joinUrl = typeof window !== "undefined"
    ? `${window.location.origin}/online/join?code=${roomCode}`
    : "";

  if (error) {
    return (
      <div className={styles.center}>
        <p className={styles.error}>{error}</p>
        <button type="button" className={styles.backBtn} onClick={() => router.push("/online")}>돌아가기</button>
      </div>
    );
  }

  if (stage === "creating") {
    return <div className={styles.center}><p className={styles.loading}>방 생성 중...</p></div>;
  }

  if (stage === "waiting") {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <h1 className={styles.title}>방 만들기</h1>
          <p className={styles.sub}>친구에게 코드를 공유하거나 QR을 스캔하게 하세요</p>

          <div className={styles.codeBox}>
            <span className={styles.codeLabel}>방 코드</span>
            <span className={styles.code}>{roomCode}</span>
          </div>

          {joinUrl && (
            <div className={styles.qrWrap}>
              <QRCode value={joinUrl} size={180} bgColor="#0a0a0f" fgColor="#ffffff" />
            </div>
          )}

          <p className={styles.waiting}>게스트 연결 대기 중...</p>
          <button type="button" className={styles.backBtn} onClick={() => router.push("/online")}>취소</button>
        </div>
      </div>
    );
  }

  if (stage === "setup") {
    return <SetupScreen onConfirm={handleSetupConfirm} />;
  }

  if (stage === "waitingGuest") {
    return (
      <div className={styles.center}>
        <p className={styles.waiting}>게스트 덱 선택 대기 중...</p>
        <p className={styles.sub}>상대방이 캐릭터와 덱을 선택하고 있습니다</p>
      </div>
    );
  }

  if (stage === "starting") {
    return <div className={styles.center}><p className={styles.loading}>게임 시작 중...</p></div>;
  }

  return null;
}
