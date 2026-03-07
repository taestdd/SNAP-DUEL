import type { Combatant } from "@/game/engine/types";
import styles from "./PlayerBar.module.css";

export default function PlayerBar({ me }: { me: Combatant }) {
  const burn = me.status.burn;

  return (
    <div className={styles.wrap}>
      <div className={styles.left}>
        <div className={styles.name}>YOU</div>
        <div className={styles.meta}>
          <span>HP: <b>{me.hp}</b></span>
          <span>Block: <b>{me.block}</b></span>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.badges}>
          {me.status.attackBuff > 0 ? (
            <span className={styles.badge}>ATK+ {me.status.attackBuff}</span>
          ) : null}
          {burn ? (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          ) : null}
        </div>
        <div className={styles.small}>
          Deck {me.deck.length} · Discard {me.discard.length}
        </div>
      </div>
    </div>
  );
}