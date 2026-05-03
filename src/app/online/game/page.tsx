"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { subscribeRoom } from "@/lib/roomService";
import type { RoomData } from "@/lib/roomService";
import type { SetupConfig } from "@/game/engine/types";
import { HostGameApp, GuestGameApp } from "@/components/game/OnlineGameApp";

function OnlineGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const role = searchParams.get("role") as "host" | "guest" | null;

  const [hostConfig, setHostConfig] = useState<SetupConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!code) return;

    const unsubscribe = subscribeRoom(code, (data: RoomData) => {
      if (data.status === "in_progress" && data.hostConfig) {
        setHostConfig(data.hostConfig);
        setReady(true);
      }
    });

    return () => unsubscribe();
  }, [code]);

  if (!code || !role) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#fff" }}>
        잘못된 접근입니다.
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#888", fontSize: "1.1rem" }}>
        게임 시작 대기 중...
      </div>
    );
  }

  if (role === "host" && hostConfig) {
    return <HostGameApp config={hostConfig} roomCode={code} onExit={() => router.push("/")} />;
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
