"use client";

import { useState } from "react";
import { getCard } from "@/game/engine/cards";
import modalStyles from "./CardSelectionModal.module.css";

export default function DiscardModal({
  count,
  candidates,
  onConfirm,
}: {
  count: number;
  candidates: string[];
  onConfirm: (keys: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggleCard(cardId: string, idx: number) {
    const key = `${cardId}::${idx}`;
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= count) return prev;
      return [...prev, key];
    });
  }

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.modal}>
        <div className={modalStyles.header}>
          <h2 className={modalStyles.title}>
            핸드 사이즈 초과 — {count}장을 버리세요
          </h2>
          <div className={modalStyles.subtitle}>
            현재 핸드 {candidates.length}장 → {candidates.length - count}장으로 줄여야 합니다. 버릴 카드 {count}장을 선택하세요. 선택한 카드는 trash로 이동합니다.
          </div>
        </div>

        <div className={modalStyles.cardList}>
          {candidates.map((cardId, idx) => {
            const card = getCard(cardId);
            const key = `${cardId}::${idx}`;
            const isSelected = selected.includes(key);
            const isDisabled = !isSelected && selected.length >= count;

            return (
              <button
                key={key}
                type="button"
                className={`${modalStyles.cardItem} ${isSelected ? modalStyles.cardSelected : ""} ${isDisabled ? modalStyles.cardDisabled : ""}`}
                onClick={() => !isDisabled && toggleCard(cardId, idx)}
              >
                <div className={modalStyles.cardName}>{card?.name ?? cardId}</div>
                {card && (
                  <div className={modalStyles.cardMeta}>
                    C{card.cost} · S{card.speed}
                  </div>
                )}
                {card && <div className={modalStyles.cardText}>{card.text}</div>}
              </button>
            );
          })}
        </div>

        <div className={modalStyles.actions}>
          <button
            type="button"
            className={modalStyles.confirmBtn}
            disabled={selected.length !== count}
            onClick={() => onConfirm(selected)}
          >
            버리기 ({selected.length}/{count})
          </button>
        </div>
      </div>
    </div>
  );
}
