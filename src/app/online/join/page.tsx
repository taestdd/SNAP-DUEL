"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { joinRoom, saveGuestConfig, subscribeRoom } from "@/lib/roomService";
import type { RoomData } from "@/lib/roomService";
import { decodeSetupParams } from "@/lib/setupConfig";
import styles from "./page.module.css";

type Stage = "input" | "joining" | "waitingHost" | "error";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { player } = decodeSetupParams(searchParams);

  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [stage, setStage] = useState<Stage>("input");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!player) router.replace("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // QR 스캔으로 들어온 경우 자동 참여
  useEffect(() => {
    const qrCode = searchParams.get("code");
    if (qrCode) handleJoin(qrCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleJoin(joinCode?: string) {
    if (!player) return;
    const target = (joinCode ?? code).toUpperCase().trim();
    if (target.length !== 6) {
      setError("6자리 코드를 입력해주세요");
      return;
    }

    setStage("joining");
    setError("");

    try {
      const ok = await joinRoom(target);
      if (!ok) {
        setError("방을 찾을 수 없거나 이미 시작된 게임입니다");
        setStage("input");
        return;
      }

      // 게스트 config 바로 저장
      await saveGuestConfig(target, player);
      setStage("waitingHost");

      // 호스트가 게임 시작하면 이동
      const unsubscribe = subscribeRoom(target, (data: RoomData) => {
        if (data.status === "in_progress") {
          unsubscribe();
          router.push(`/online/game?code=${target}&role=guest`);
        }
      });
    } catch {
      setError("연결 오류. 다시 시도해주세요");
      setStage("input");
    }
  }

  if (!player) return null;

  if (stage === "waitingHost") {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.waiting}>호스트 대기 중...</p>
          <p className={styles.sub}>상대방이 게임을 시작하면 자동으로 입장합니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <h1 className={styles.title}>방 참여</h1>
        <p className={styles.sub}>호스트에게 받은 6자리 코드를 입력하세요</p>

        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="XXXXXX"
            disabled={stage === "joining"}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            autoFocus
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="button"
          className={styles.joinBtn}
          disabled={stage === "joining" || code.length !== 6}
          onClick={() => handleJoin()}
        >
          {stage === "joining" ? "연결 중..." : "참여하기"}
        </button>

        <button
          type="button"
          className={styles.backBtn}
          onClick={() => router.push("/online")}
          disabled={stage === "joining"}
        >
          돌아가기
        </button>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
