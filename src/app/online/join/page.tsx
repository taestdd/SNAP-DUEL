"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { joinRoom } from "@/lib/roomService";
import styles from "./page.module.css";
import { Suspense } from "react";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  // QR 스캔으로 들어온 경우 자동 참여
  useEffect(() => {
    const qrCode = searchParams.get("code");
    if (qrCode) {
      handleJoin(qrCode);
    }
  // 마운트 시 1회만
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleJoin(joinCode?: string) {
    const target = (joinCode ?? code).toUpperCase().trim();
    if (target.length !== 6) {
      setError("6자리 코드를 입력해주세요");
      return;
    }

    setJoining(true);
    setError("");

    try {
      const ok = await joinRoom(target);
      if (!ok) {
        setError("방을 찾을 수 없거나 이미 시작된 게임입니다");
        setJoining(false);
        return;
      }
      router.push(`/online/game?code=${target}&role=guest`);
    } catch {
      setError("연결 오류. 다시 시도해주세요");
      setJoining(false);
    }
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
            disabled={joining}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            autoFocus
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="button"
          className={styles.joinBtn}
          disabled={joining || code.length !== 6}
          onClick={() => handleJoin()}
        >
          {joining ? "연결 중..." : "참여하기"}
        </button>

        <button
          type="button"
          className={styles.backBtn}
          onClick={() => router.push("/online")}
          disabled={joining}
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
