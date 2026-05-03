"use client";

import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function OnlineLobby() {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <h1 className={styles.title}>온라인 대전</h1>
        <p className={styles.sub}>방을 만들거나 코드로 참여하세요</p>

        <div className={styles.btnGroup}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => router.push("/online/host")}
          >
            방 만들기
            <span className={styles.btnSub}>코드 생성 후 친구 초대</span>
          </button>

          <button
            type="button"
            className={styles.btn}
            onClick={() => router.push("/online/join")}
          >
            방 참여
            <span className={styles.btnSub}>6자리 코드로 입장</span>
          </button>
        </div>

        <button
          type="button"
          className={styles.backBtn}
          onClick={() => router.push("/")}
        >
          돌아가기
        </button>
      </div>
    </div>
  );
}
