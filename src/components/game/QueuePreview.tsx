"use client";

import { useRef, useState } from "react";
import type { Combatant } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./GameScreen.module.css";
import CardDetailModal from "./CardDetailModal";
export { effectLabel } from "./cardLabels";

const LONG_PRESS_MS = 480;


export default function QueuePreview({
  title,
  me,
  phase,
  recentlyCancelledPlayer,
  isMyTurn = false,
}: {
  title: string;
  me: Combatant;
  phase: string;
  recentlyCancelledPlayer: "P1" | "AI" | null;
  isMyTurn?: boolean;
}) {
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  const queuedId = me.queue[0];
  const card = queuedId ? getCard(queuedId) : null;
  const showCancel = recentlyCancelledPlayer === me.id;

  const isSetup = phase === "SETUP_INIT" || phase === "SETUP_OTHER";
  const isPassed    = isSetup && me.ready && !queuedId;
  const isSelecting = isSetup && !me.ready && !queuedId && isMyTurn;
  const isWaiting   = isSetup && !me.ready && !queuedId && !isMyTurn;

  function startPress() {
    if (!queuedId) return;
    longFiredRef.current = false;
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      setDetailCardId(queuedId);
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  const effectiveSpeed = card ? Math.max(0, card.speed - me.status.speedBonus) : 0;
  const speedBonusApplied = card ? me.status.speedBonus : 0;

  return (
    <div className={styles.queueBox}>
      <div className={styles.queueTitle}>{title}</div>

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
        <div
          key={queuedId}
          className={`${styles.queueCard} ${styles.queueCardAnim}`}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
        >
          <div className={styles.queueCardRow}>
            <div className={styles.queueCost}>{card.cost}</div>
            <div className={[
              styles.queueSpeed,
              speedBonusApplied > 0 ? styles.queueSpeedDown : speedBonusApplied < 0 ? styles.queueSpeedUp : "",
            ].join(" ")}>{effectiveSpeed}</div>
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
