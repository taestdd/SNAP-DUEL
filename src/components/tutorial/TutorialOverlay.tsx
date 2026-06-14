"use client";

import { useState } from "react";
import type { GameState } from "@/game/engine/types";
import type { TutorialStage } from "@/game/tutorial/tutorialStages";
import styles from "./TutorialOverlay.module.css";

interface TutorialOverlayProps {
  stage: TutorialStage;
  state: GameState;
  onRetry: () => void;
  onNextStage: (() => void) | null;
  onExit: () => void;
}

export default function TutorialOverlay({
  stage,
  state,
  onRetry,
  onNextStage,
  onExit,
}: TutorialOverlayProps) {
  const [hintVisible, setHintVisible] = useState(false);

  const isSuccess = stage.successCondition(state);
  const isFail = !isSuccess && stage.failCondition(state, state.turn);

  return (
    <>
      {/* 상단 목표 바 */}
      <div className={styles.topBar}>
        <span className={styles.stageLabel}>{stage.title}</span>
        <span className={styles.goalText}>{stage.goalText}</span>
        {stage.maxTurns != null && (
          <span className={styles.turnCounter}>
            {Math.min(state.turn, stage.maxTurns)} / {stage.maxTurns} 턴
          </span>
        )}
      </div>

      {/* 힌트 토글 버튼 */}
      {!isSuccess && !isFail && (
        <button
          className={styles.hintToggle}
          onClick={() => setHintVisible((v) => !v)}
        >
          {hintVisible ? "힌트 숨기기" : "힌트 보기"}
        </button>
      )}

      {/* 힌트 박스 */}
      {hintVisible && !isSuccess && !isFail && (
        <div className={styles.hintBox}>
          {stage.hint.split("\n").map((line, i) => (
            <p key={i} className={styles.hintLine}>{line}</p>
          ))}
        </div>
      )}

      {/* 성공 오버레이 */}
      {isSuccess && (
        <div className={styles.resultOverlay}>
          <div className={styles.resultCard}>
            <div className={styles.resultIcon}>✓</div>
            <div className={styles.resultTitle}>클리어!</div>
            <div className={styles.resultDesc}>훌륭합니다. 다음 단계로 나아가세요.</div>
            <div className={styles.resultBtns}>
              <button className={styles.retryBtn} onClick={onRetry}>다시 도전</button>
              {onNextStage && (
                <button className={styles.nextBtn} onClick={onNextStage}>다음 →</button>
              )}
              {!onNextStage && (
                <button className={styles.nextBtn} onClick={onExit}>튜토리얼 완료</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 실패 오버레이 */}
      {isFail && (
        <div className={styles.resultOverlay}>
          <div className={`${styles.resultCard} ${styles.failCard}`}>
            <div className={`${styles.resultIcon} ${styles.failIcon}`}>✕</div>
            <div className={styles.resultTitle}>실패</div>
            <div className={styles.resultDesc}>
              {stage.hint.split("\n").map((line, i) => (
                <p key={i} className={styles.hintLine}>{line}</p>
              ))}
            </div>
            <div className={styles.resultBtns}>
              <button className={styles.retryBtn} onClick={onRetry}>다시 도전</button>
              <button className={styles.exitBtn} onClick={onExit}>목록으로</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
