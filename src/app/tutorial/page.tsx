"use client";

import { useRouter } from "next/navigation";
import { TUTORIAL_STAGES } from "@/game/tutorial/tutorialStages";
import styles from "./page.module.css";

export default function TutorialPage() {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>튜토리얼</h1>
          <p className={styles.subtitle}>단계별로 게임 규칙을 배워보세요</p>
        </header>

        <div className={styles.stageList}>
          {TUTORIAL_STAGES.map((stage, idx) => (
            <button
              key={stage.id}
              className={styles.stageCard}
              onClick={() => router.push(`/tutorial/${stage.id}`)}
            >
              <span className={styles.stageNum}>{idx + 1}</span>
              <div className={styles.stageInfo}>
                <div className={styles.stageName}>{stage.title}</div>
                <div className={styles.stageGoal}>{stage.goalText}</div>
              </div>
              <span className={styles.stageArrow}>→</span>
            </button>
          ))}
        </div>

        <button className={styles.backBtn} onClick={() => router.push("/")}>
          ← 메인 메뉴
        </button>
      </div>
    </div>
  );
}
