"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { subscribeRoom } from "@/lib/roomService";
import type { RoomData } from "@/lib/roomService";
import type { SetupConfig } from "@/game/engine/types";
import { HostGameApp, GuestGameApp } from "@/components/game/OnlineGameApp";
import { useGameData } from "@/hooks/useGameData";

function OnlineGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const role = searchParams.get("role") as "host" | "guest" | null;

  const dataStatus = useGameData();
  const [hostConfig, setHostConfig] = useState<SetupConfig | null>(null);
  const [guestConfig, setGuestConfig] = useState<SetupConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!code || dataStatus !== "ready") return;

    // 초기 설정 수신 후엔 state 업데이트 불필요 — 매 syncState마다 재렌더 방지
    let initialized = false;
    const unsubscribe = subscribeRoom(code, (data: RoomData) => {
      if (initialized) return;
      if (data.status === "in_progress" && data.hostConfig && data.guestConfig) {
        initialized = true;
        setHostConfig(data.hostConfig);
        setGuestConfig(data.guestConfig);
        setReady(true);
      }
    });

    return () => unsubscribe();
  }, [code, dataStatus]);

  if (!code || !role) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#fff" }}>
        잘못된 접근입니다.
      </div>
    );
  }

  if (dataStatus === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#f66" }}>
        데이터를 불러올 수 없습니다. 새로고침 해주세요.
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#888", fontSize: "1.1rem" }}>
        {dataStatus === "loading" ? "로딩 중..." : "게임 시작 대기 중..."}
      </div>
    );
  }

  if (role === "host" && hostConfig && guestConfig) {
    return <HostGameApp config={hostConfig} guestConfig={guestConfig} roomCode={code} onExit={() => router.push("/")} />;
  }

  if (role === "guest") {
    return <GuestGameApp roomCode={code} onExit={() => router.push("/")} />;
  }

  return null;
}

export default function OnlineGamePage() {
  return (
    <Suspense>
      <OnlineGame />
    </Suspense>
  );
}
