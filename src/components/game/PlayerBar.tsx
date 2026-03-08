import type { Combatant } from "@/game/engine/types";
import styles from "./PlayerBar.module.css";

export default function PlayerBar({ me }: { me: Combatant }) {
  const burn = me.status.burn;

  return (
    <div className={styles.wrap}>
      <div>
        <div className={styles.name}>YOU</div>
        <div className={styles.meta}>
          <span>HP: {me.hp}</span>
          <span>Block: {me.block}</span>
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

          {me.status.speedBonus > 0 ? (
            <span className={styles.badge}>SPD-{me.status.speedBonus} now</span>
          ) : null}

          {me.status.speedBonusNext > 0 ? (
            <span className={styles.badge}>
              SPD-{me.status.speedBonusNext} next
            </span>
          ) : null}
        </div>

        <div className={styles.small}>
          Deck {me.deck.length} · Hand {me.hand.length} · Cooldown{" "}
          {me.cooldown.length} · Trash {me.trash.length}
        </div>
      </div>
    </div>
  );
}