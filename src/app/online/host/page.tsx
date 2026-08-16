"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import { createRoom, subscribeRoom, saveHostConfig, startGame } from "@/lib/roomService";
import type { RoomData } from "@/lib/roomService";
import { createInitialState } from "@/game/engine/state";
import { decodeSetupParams } from "@/lib/setupConfig";
import type { SetupConfig } from "@/game/engine/types";
import styles from "./page.module.css";
import { Button } from "@/components/ui/button";

type Stage = "creating" | "waiting" | "waitingGuest" | "starting";

function HostPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { player } = decodeSetupParams(params);

  const [stage, setStage] = useState<Stage>("creating");
  const [roomCode, setRoomCode] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!player) router.replace("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!player) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!roomCode || stage !== "waiting" || !player) return;
    const unsubscribe = subscribeRoom(roomCode, (data: RoomData) => {
      if (data.status !== "ready") return;
      unsubscribe();
      handleGuestConnected(player);
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, stage]);

  async function handleGuestConnected(config: SetupConfig) {
    setStage("waitingGuest");
    try {
      await saveHostConfig(roomCode, config);
    } catch (e: unknown) {
      setError((e as Error).message ?? "저장 실패");
      setStage("waiting");
      return;
    }

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

  if (!player) return null;

  if (error) {
    return (
      <div className={styles.center}>
        <p className={styles.error}>{error}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/online")}>돌아가기</Button>
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
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/online")}>취소</Button>
        </div>
      </div>
    );
  }

  if (stage === "waitingGuest") {
    return (
      <div className={styles.center}>
        <p className={styles.waiting}>게스트 덱 선택 대기 중...</p>
        <p className={styles.sub}>상대방이 덱을 선택하고 있습니다</p>
      </div>
    );
  }

  return <div className={styles.center}><p className={styles.loading}>게임 시작 중...</p></div>;
}

export default function HostPage() {
  return (
    <Suspense>
      <HostPageInner />
    </Suspense>
  );
}
