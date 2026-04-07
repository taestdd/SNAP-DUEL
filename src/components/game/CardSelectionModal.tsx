"use client";

import { useState } from "react";
import type { PendingSelection } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./CardSelectionModal.module.css";

interface Props {
  pendingSelection: PendingSelection;
  onConfirm: (selectedCards: string[]) => void;
  onSkip: () => void;
}

export default function CardSelectionModal({ pendingSelection, onConfirm, onSkip }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const { candidates, count, fromZone, toZone } = pendingSelection;

  function toggleCard(cardId: string, listIndex: number) {
    // Use "cardId::listIndex" as a unique key to handle duplicates in the list
    const key = `${cardId}::${listIndex}`;
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= count) return prev;
      return [...prev, key];
    });
  }

  function handleConfirm() {
    // Extract the actual cardId from the key
    const actualCardIds = selected.map((key) => key.split("::")[0]);
    onConfirm(actualCardIds);
  }

  const selectedCount = selected.length;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            Select {count} card{count !== 1 ? "s" : ""} from {fromZone}
          </h2>
          <div className={styles.subtitle}>
            Selected cards will be returned to your {toZone}.
          </div>
        </div>

        <div className={styles.cardList}>
          {candidates.length === 0 ? (
            <div className={styles.empty}>No cards available in {fromZone}.</div>
          ) : (
            candidates.map((cardId, idx) => {
              const card = getCard(cardId);
              const key = `${cardId}::${idx}`;
              const isSelected = selected.includes(key);
              const isDisabled = !isSelected && selectedCount >= count;

              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.cardItem} ${isSelected ? styles.cardSelected : ""} ${isDisabled ? styles.cardDisabled : ""}`}
                  onClick={() => !isDisabled && toggleCard(cardId, idx)}
                >
                  <div className={styles.cardName}>{card?.name ?? cardId}</div>
                  {card && (
                    <div className={styles.cardMeta}>
                      C{card.cost} · S{card.speed}
                    </div>
                  )}
                  {card && <div className={styles.cardText}>{card.text}</div>}
                </button>
              );
            })
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirmBtn}
            disabled={selectedCount === 0}
            onClick={handleConfirm}
          >
            Confirm ({selectedCount}/{count})
          </button>
          <button
            type="button"
            className={styles.skipBtn}
            onClick={onSkip}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
