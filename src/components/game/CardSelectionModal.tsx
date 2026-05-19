"use client";

import type { PendingSelection } from "@/game/engine/types";
import CardPickList from "./CardPickList";
import styles from "./CardSelectionModal.module.css";

interface Props {
  pendingSelection: PendingSelection;
  onConfirm: (selectedCards: string[]) => void;
  onSkip: () => void;
  isCostPayment?: boolean;
}

export default function CardSelectionModal({ pendingSelection, onConfirm, onSkip, isCostPayment }: Props) {
  const { candidates, count, fromZone, toZone } = pendingSelection;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isCostPayment ? `코스트: ${fromZone}에서 ${count}장 선택` : `${fromZone}에서 ${count}장 선택`}
          </h2>
          <div className={styles.subtitle}>
            {isCostPayment
              ? `선택한 카드를 ${toZone}으로 보내야 카드를 발동할 수 있습니다.`
              : `선택한 카드는 ${toZone}으로 이동합니다.`}
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
