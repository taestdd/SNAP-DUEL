"use client";

import { useState } from "react";
import type { Action, GameState } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./CardSelectionModal.module.css";

export default function CardSelectionModal({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const pending = state.pendingSelection;
  if (state.phase !== "WAITING_SELECTION" || !pending) return null;

  const zone = (() => {
    const owner = state[pending.fromOwner];
    switch (pending.fromZone) {
      case "deck":     return owner.deck;
      case "hand":     return owner.hand;
      case "trash":    return owner.trash;
      case "cooldown": return owner.cooldown;
    }
  })();

  function toggle(cardId: string, idx: number) {
    const key = `${cardId}:${idx}`;
    if (selectedIds.includes(key)) {
      setSelectedIds(selectedIds.filter(k => k !== key));
    } else if (selectedIds.length < pending!.count) {
      setSelectedIds([...selectedIds, key]);
    }
  }

  function handleConfirm() {
    const cardIds = selectedIds.map(k => k.split(":")[0]);
    dispatch({ type: "SELECTION/CONFIRM", cardIds });
    setSelectedIds([]);
  }

  function handleSkip() {
    dispatch({ type: "SELECTION/SKIP" });
    setSelectedIds([]);
  }

  const zoneLabel: Record<string, string> = {
    deck: "덱",
    hand: "패",
    trash: "트래시",
    cooldown: "쿨다운",
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {zoneLabel[pending.fromZone]}에서 카드 선택
          </h2>
          <div className={styles.subtitle}>
            최대 {pending.count}장 선택 → {zoneLabel[pending.toZone]}으로 이동
          </div>
        </div>

        {zone.length === 0 ? (
          <div className={styles.empty}>선택 가능한 카드가 없습니다.</div>
        ) : (
          <div className={styles.cardList}>
            {zone.map((cardId, idx) => {
              const card = getCard(cardId);
              const key = `${cardId}:${idx}`;
              const isSelected = selectedIds.includes(key);
              const isDisabled = !isSelected && selectedIds.length >= pending.count;

              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.cardBtn} ${isSelected ? styles.selected : ""} ${isDisabled ? styles.disabled : ""}`}
                  onClick={() => !isDisabled && toggle(cardId, idx)}
                  disabled={isDisabled}
                >
                  <div className={styles.cardName}>{card?.name ?? cardId}</div>
                  {card && (
                    <>
                      <div className={styles.cardStats}>
                        Cost {card.cost} · Speed {card.speed}
                      </div>
                      <div className={styles.cardText}>{card.text}</div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirmBtn}
            disabled={selectedIds.length === 0}
            onClick={handleConfirm}
          >
            확인 ({selectedIds.length}/{pending.count})
          </button>
          <button
            type="button"
            className={styles.skipBtn}
            onClick={handleSkip}
          >
            건너뛰기
          </button>
        </div>
      </div>
    </div>
  );
}
