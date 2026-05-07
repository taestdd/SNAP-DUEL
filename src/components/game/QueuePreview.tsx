"use client";

import type { Combatant } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./GameScreen.module.css";

export function effectLabel(effect: string, damageType?: string): string {
  if (effect === "damage" && damageType === "ground") return "⬇ Ground";
  if (effect === "damage" && damageType === "anti-air") return "⬆ Anti-Air";
  switch (effect) {
    case "damage":      return "Damage";
    case "block":       return "Block";
    case "draw":        return "Draw";
    case "heal":        return "Heal";
    case "buff_attack": return "ATK Buff";
    case "burn":        return "Burn";
    case "tag":         return "⇄ Tag";
    case "airborne":    return "⬆ Launch";
    default:            return effect;
  }
}

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
  const queuedId = me.queue[0];
  const card = queuedId ? getCard(queuedId) : null;
  const showCancel = recentlyCancelledPlayer === me.id;

  const isSetup = phase === "SETUP_INIT" || phase === "SETUP_OTHER";
  const isResolving = phase === "RESOLVE";
  const isPassed = isSetup && me.ready && !queuedId;
  const isSelecting = isSetup && !me.ready && !queuedId;

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
          ) : "—"}
        </div>
      ) : (
        <div key={queuedId} className={`${styles.queueCard} ${styles.queueCardAnim}`}>
          <div className={styles.queueCardName}>{card.name}</div>

          <div className={styles.queueStats}>
            <span>Cost {card.cost}</span>
            <span>Speed {card.speed}</span>
            <span>Gain {card.gain}</span>
          </div>

          <div className={styles.queueEffectRow}>
            {card.effects.map((effect, idx) => (
              <span
                key={`${card.id}-effect-${idx}`}
                className={`${styles.effectBadge} ${isResolving ? styles.effectBadgePulse : ""}`}
              >
                {effectLabel(effect.type, effect.damageType)}
                {effect.value !== undefined ? ` ${effect.value}` : ""}
              </span>
            ))}
          </div>

          <div className={styles.queueText}>{card.text}</div>
        </div>
      )}
    </div>
  );
}
