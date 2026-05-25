"use client";

import { useState } from "react";
import { getCard } from "@/game/engine/cards";
import CardDetailModal from "./CardDetailModal";
import CostBox from "./CostBox";
import SpeedCircle from "./SpeedCircle";
import styles from "./CardListItem.module.css";

export default function CardListItem({
  cardId,
  listIndex,
  selected,
  disabled,
  onToggle,
  renderExtra,
}: {
  cardId: string;
  listIndex: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  renderExtra?: (cardId: string) => React.ReactNode;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const card = getCard(cardId);

  return (
    <>
      <div
        className={[
          styles.item,
          selected ? styles.selected : "",
          disabled ? styles.disabled : "",
        ].join(" ")}
      >
        <CostBox value={card?.cost ?? "?"} />
        <SpeedCircle value={card?.speed ?? 0} />
        <div className={styles.name}>{card?.name ?? cardId}</div>

        {renderExtra && (
          <div className={styles.extra}>{renderExtra(cardId)}</div>
        )}

        <button
          type="button"
          className={styles.viewBtn}
          onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
          tabIndex={-1}
        >
          View
        </button>

        <button
          type="button"
          className={[styles.checkBtn, selected ? styles.checkBtnSelected : ""].join(" ")}
          onClick={onToggle}
          disabled={disabled && !selected}
          aria-label={selected ? "선택 해제" : "선택"}
        >
          ✓
        </button>
      </div>

      {showDetail && (
        <CardDetailModal cardId={cardId} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}
