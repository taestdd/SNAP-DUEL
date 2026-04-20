"use client";

import { useEffect, useState } from "react";
import type { Action, GameState } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import { effectLabel } from "./QueuePreview";
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

  // selected: 덱 인덱스 기준 (같은 cardId가 여러 장 있을 수 있으므로)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  // P1이 제출하면 선택 초기화
  useEffect(() => {
    if (p1Submitted) setSelectedIndices([]);
  }, [p1Submitted]);

  // AI 카운트다운
  const [countdown, setCountdown] = useState(10);
  useEffect(() => {
    if (aiSubmitted) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, aiSubmitted]);

  function toggleIndex(idx: number) {
    if (p1Submitted) return;
    setSelectedIndices((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= maxPick) return prev;
      return [...prev, idx];
    });
  }

  function handleConfirm() {
    if (p1Submitted || selectedIndices.length === 0) return;
    const cardIds = selectedIndices.map((i) => state.P1.deck[i]);
    dispatch({ type: "SUBMIT_DRAFT", player: "P1", cardIds });
  }

  const initiativeLabel = state.initiative === "P1" ? "Player" : "AI";

  return (
    <div className={modalStyles.overlay}>
      <div className={`${modalStyles.modal} ${styles.draftModal}`}>
        <div className={modalStyles.header}>
          <h2 className={modalStyles.title}>
            라운드 {state.round} — 드래프트
          </h2>
          <div className={modalStyles.subtitle}>
            ⚡ 이번 라운드 선공: {initiativeLabel} &nbsp;|&nbsp;
            덱에서 최대 {maxPick}장 선택
          </div>
        </div>

        {/* P1 선택 영역 */}
        {!p1Submitted ? (
          <>
            <div className={styles.counter}>
              {selectedIndices.length} / {maxPick} 선택
            </div>
            <div className={modalStyles.cardList}>
              {state.P1.deck.map((cardId, idx) => {
                const card = getCard(cardId);
                const isSelected = selectedIndices.includes(idx);
                const isDisabled = !isSelected && selectedIndices.length >= maxPick;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`${modalStyles.cardItem} ${isSelected ? modalStyles.cardSelected : ""} ${isDisabled ? modalStyles.cardDisabled : ""}`}
                    onClick={() => toggleIndex(idx)}
                  >
                    <div className={modalStyles.cardName}>{card?.name ?? cardId}</div>
                    {card && (
                      <div className={modalStyles.cardMeta}>
                        C{card.cost} · S{card.speed} · G{card.gain}
                      </div>
                    )}
                    {card && (
                      <div className={styles.effectRow}>
                        {card.effects.map((e, i) => (
                          <span key={i} className={styles.effectBadge}>
                            {effectLabel(e.type, e.damageType)}{e.value !== undefined ? ` ${e.value}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className={modalStyles.actions}>
              <button
                type="button"
                className={modalStyles.confirmBtn}
                disabled={selectedIndices.length === 0}
                onClick={handleConfirm}
              >
                확정 ({selectedIndices.length}/{maxPick})
              </button>
            </div>
          </>
        ) : (
          <div className={styles.waitingBox}>
            <div className={styles.waitingText}>
              {aiSubmitted ? "양쪽 모두 확정 완료!" : "AI 대기 중..."}
            </div>
            {!aiSubmitted && (
              <div className={styles.countdown}>{countdown}s</div>
            )}
          </div>
        )}

        {/* AI 상태 표시 */}
        <div className={styles.aiStatus}>
          AI: {aiSubmitted ? "✅ 확정" : `선택 중... (${countdown}s)`}
        </div>
      </div>
    </div>
  );
}
