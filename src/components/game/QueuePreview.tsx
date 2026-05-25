"use client";

import { useState } from "react";
import type { Combatant } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./GameScreen.module.css";
import CardDetailModal from "./CardDetailModal";
import CostBox from "./CostBox";
import SpeedCircle from "./SpeedCircle";
export { effectLabel } from "./cardLabels";


export default function QueuePreview({
  title,
  me,
  phase,
  recentlyCancelledPlayer,
  isMyTurn = false,
  isInitiative = false,
}: {
  title: string;
  me: Combatant;
  phase: string;
  recentlyCancelledPlayer: "P1" | "AI" | null;
  isMyTurn?: boolean;
  isInitiative?: boolean;
}) {
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const queuedId = me.queue[0];
  const card = queuedId ? getCard(queuedId) : null;
  const showCancel = recentlyCancelledPlayer === me.id;

  const isSetup = phase === "SETUP_INIT" || phase === "SETUP_OTHER";
  const isPassed    = isSetup && me.ready && !queuedId;
  const isSelecting = isSetup && !me.ready && !queuedId && isMyTurn;
  const isWaiting   = isSetup && !me.ready && !queuedId && !isMyTurn;

  const effectiveSpeed = card ? Math.max(0, card.speed - me.status.speedBonus) : 0;
  const speedBonusApplied = card ? me.status.speedBonus : 0;

  return (
    <div className={styles.queueBox}>
      <div className={styles.queueHeader}>
        <span className={styles.queueTitle}>
          {title}
          {isInitiative && <span className={styles.initiativeBadge}>주도권</span>}
        </span>
        <button
          type="button"
          className={styles.queueViewBtn}
          disabled={!queuedId}
          onClick={() => queuedId && setDetailCardId(queuedId)}
        >
          View
        </button>
      </div>

      {!card ? (
        <div className={`${styles.queueEmpty} ${showCancel ? styles.queueCancelAnim : ""}`}>
          {showCancel ? (
            <div className={styles.cancelOverlay} style={{ position: "relative", width: "100%", height: "40px" }} />
          ) : isPassed ? (
            <span className={styles.queuePass}>PASS</span>
          ) : isSelecting ? (
            <span className={styles.queueSelecting}>선택중…</span>
          ) : isWaiting ? (
            <span className={styles.queueWaiting}>선택전</span>
          ) : "—"}
        </div>
      ) : (
        <div key={queuedId} className={`${styles.queueCard} ${styles.queueCardAnim}`}>
          <div className={styles.queueCardRow}>
            <CostBox value={card.cost} />
            <SpeedCircle value={effectiveSpeed} bonus={speedBonusApplied} />
            <div className={styles.queueCardName}>{card.name}</div>
          </div>
        </div>
      )}

      {detailCardId && (
        <CardDetailModal cardId={detailCardId} onClose={() => setDetailCardId(null)} />
      )}
    </div>
  );
}
