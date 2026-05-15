"use client";

import type { PendingSelection } from "@/game/engine/types";
import CardPickList from "./CardPickList";
import styles from "./CardSelectionModal.module.css";

interface Props {
  pendingSelection: PendingSelection;
  onConfirm: (selectedCards: string[]) => void;
  onSkip: () => void;
}

export default function CardSelectionModal({ pendingSelection, onConfirm, onSkip }: Props) {
  const { candidates, count, fromZone, toZone } = pendingSelection;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {fromZone}에서 {count}장 선택
          </h2>
          <div className={styles.subtitle}>
            선택한 카드는 {toZone}으로 이동합니다.
          </div>
        </div>

        <CardPickList
          candidates={candidates}
          count={count}
          confirmLabel="확정"
          onConfirm={onConfirm}
          onSkip={onSkip}
        />
      </div>
    </div>
  );
}
