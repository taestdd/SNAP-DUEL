"use client";

import { useState } from "react";
import type { Combatant } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./GameScreen.module.css";
import CardDetailModal from "./CardDetailModal";
import CostBox from "./CostBox";
import DelayCircle from "./DelayCircle";
export { effectLabel } from "./cardLabels";


export default function QueuePreview({
  title,
  me,
  phase,
  recentlyCounteredPlayer,
  isMyTurn = false,
  isInitiative = false,
}: {
  title: string;
  me: Combatant;
  phase: string;
  recentlyCounteredPlayer: "P1" | "AI" | null;
  isMyTurn?: boolean;
  isInitiative?: boolean;
}) {
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const queuedId = me.queue[0];
  const card = queuedId ? getCard(queuedId) : null;
  const showCounter = recentlyCounteredPlayer === me.id;

  const isSetup = phase === "SETUP_INIT" || phase === "SETUP_OTHER";
  const isPassed    = isSetup && me.ready && !queuedId;
  const isSelecting = isSetup && !me.ready && !queuedId && isMyTurn;
  const isWaiting   = isSetup && !me.ready && !queuedId && !isMyTurn;

  const effectiveDelay = card ? Math.max(0, card.delay - me.status.delayAdvantage) : 0;
  const delayAdvantageApplied = card ? me.status.delayAdvantage : 0;

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
        <div className={`${styles.queueEmpty} ${showCounter ? styles.queueCounterAnim : ""}`}>
          {showCounter ? (
            <div className={styles.counterOverlay} style={{ position: "relative", width: "100%", height: "40px" }} />
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
            <DelayCircle value={effectiveDelay} bonus={delayAdvantageApplied} />
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
