"use client";

import { useEffect, useState } from "react";
import type { Action, GameState } from "@/game/engine/types";
import CardPickList from "./CardPickList";
import modalStyles from "./CardSelectionModal.module.css";
import styles from "./DraftModal.module.css";

export default function DraftModal({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const maxPick = Math.min(3, state.P1.deck.length);
  const p1Submitted = state.draftSelections.P1 !== null;
  const aiSubmitted = state.draftSelections.AI !== null;

  const [countdown, setCountdown] = useState(10);
  useEffect(() => {
    if (aiSubmitted || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, aiSubmitted]);

  function handleConfirm(cardIds: string[]) {
    dispatch({ type: "SUBMIT_DRAFT", player: "P1", cardIds });
  }

  const initiativeLabel = state.initiative === "P1" ? "Player" : "AI";

  return (
    <div className={modalStyles.overlay}>
      <div className={`${modalStyles.modal} ${styles.draftModal}`}>
        <div className={modalStyles.header}>
          <h2 className={modalStyles.title}>라운드 {state.round} — 드래프트</h2>
          <div className={modalStyles.subtitle}>
            ⚡ 이번 라운드 선공: {initiativeLabel} &nbsp;|&nbsp; 덱에서 최대 {maxPick}장 선택
          </div>
        </div>

        {!p1Submitted ? (
          <CardPickList
            candidates={state.P1.deck}
            count={maxPick}
            confirmLabel="확정"
            onConfirm={handleConfirm}
          />
        ) : (
          <div className={styles.waitingBox}>
            <div className={styles.waitingText}>
              {aiSubmitted ? "양쪽 모두 확정 완료!" : "AI 대기 중..."}
            </div>
            {!aiSubmitted && <div className={styles.countdown}>{countdown}s</div>}
          </div>
        )}

        <div className={styles.aiStatus}>
          AI: {aiSubmitted ? "✅ 확정" : `선택 중... (${countdown}s)`}
        </div>
      </div>
    </div>
  );
}
