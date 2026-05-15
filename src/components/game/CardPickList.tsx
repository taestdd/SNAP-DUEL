"use client";

import { useState } from "react";
import { getCard } from "@/game/engine/cards";
import styles from "./CardPickList.module.css";

interface Props {
  candidates: string[];
  count: number;
  confirmLabel?: string;
  onConfirm: (cardIds: string[]) => void;
  onSkip?: () => void;
  renderExtra?: (cardId: string) => React.ReactNode;
}

export default function CardPickList({
  candidates,
  count,
  confirmLabel = "Confirm",
  onConfirm,
  onSkip,
  renderExtra,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggleCard(cardId: string, listIndex: number) {
    const key = `${cardId}::${listIndex}`;
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= count) return prev;
      return [...prev, key];
    });
  }

  function handleConfirm() {
    onConfirm(selected.map((key) => key.split("::")[0]));
  }

  const selectedCount = selected.length;
  const sorted = [...candidates.map((cardId, idx) => ({ cardId, idx }))]
    .sort((a, b) => {
      const ca = getCard(a.cardId);
      const cb = getCard(b.cardId);
      return (ca?.cost ?? 0) - (cb?.cost ?? 0)
        || (ca?.speed ?? 0) - (cb?.speed ?? 0)
        || (ca?.name ?? a.cardId).localeCompare(cb?.name ?? b.cardId);
    });

  return (
    <>
      <div className={styles.cardList}>
        {candidates.length === 0 ? (
          <div className={styles.empty}>선택 가능한 카드가 없습니다.</div>
        ) : (
          sorted.map(({ cardId, idx }) => {
            const card = getCard(cardId);
            const key = `${cardId}::${idx}`;
            const isSelected = selected.includes(key);
            const isDisabled = !isSelected && selectedCount >= count;
            return (
              <button
                key={key}
                type="button"
                className={[
                  styles.cardItem,
                  isSelected ? styles.cardSelected : "",
                  isDisabled ? styles.cardDisabled : "",
                ].join(" ")}
                onClick={() => !isDisabled && toggleCard(cardId, idx)}
              >
                <div className={styles.cardName}>{card?.name ?? cardId}</div>
                {card && (
                  <div className={styles.cardMeta}>C{card.cost} · S{card.speed}</div>
                )}
                {card && <div className={styles.cardText}>{card.text}</div>}
                {renderExtra?.(cardId)}
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
          {confirmLabel} ({selectedCount}/{count})
        </button>
        {onSkip && (
          <button type="button" className={styles.skipBtn} onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
    </>
  );
}
