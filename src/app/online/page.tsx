"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import { Button } from "@/components/ui/button";

function OnlineLobbyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qs = params.toString() ? `?${params.toString()}` : "";

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <h1 className={styles.title}>온라인 대전</h1>
        <p className={styles.sub}>방을 만들거나 코드로 참여하세요</p>

        <div className={styles.btnGroup}>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/online/host${qs}`)}
            className="h-auto flex-col gap-1 bg-primary-bg py-5 text-lg font-semibold"
          >
            방 만들기
            <span className={styles.btnSub}>코드 생성 후 친구 초대</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/online/join${qs}`)}
            className="h-auto flex-col gap-1 bg-primary-bg py-5 text-lg font-semibold"
          >
            방 참여
            <span className={styles.btnSub}>6자리 코드로 입장</span>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
        >
          돌아가기
        </Button>
      </div>
    </div>
  );
}

export default function OnlineLobby() {
  return (
    <Suspense>
      <OnlineLobbyInner />
    </Suspense>
  );
}
