import type { Combatant } from "@/game/engine/types";
import styles from "./ArenaHeader.module.css";

export default function ArenaHeader({ ai }: { ai: Combatant }) {
  const burn = ai.status.burn;

  return (
    <div className={styles.wrap}>
      <div className={styles.left}>
        <div className={styles.name}>AI</div>
        <div className={styles.meta}>
          <span>HP: <b>{ai.hp}</b></span>
          <span>Block: <b>{ai.block}</b></span>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.badges}>
          {ai.status.attackBuff > 0 ? (
            <span className={styles.badge}>ATK+ {ai.status.attackBuff}</span>
          ) : null}
          {burn ? (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          ) : null}
        </div>
        <div className={styles.small}>
          Deck {ai.deck.length} · Hand {ai.hand.length} · Discard {ai.discard.length}
        </div>
      </div>
    </div>
  );
}