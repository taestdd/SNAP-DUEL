import type { Combatant } from "@/game/engine/types";
import styles from "./ArenaHeader.module.css";

export default function ArenaHeader({ ai }: { ai: Combatant }) {
  const burn = ai.status.burn;

  return (
    <div className={styles.wrap}>
      <div>
        <div className={styles.name}>AI</div>
        <div className={styles.meta}>
          <span>HP: {ai.hp}</span>
          <span>Block: {ai.block}</span>
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

          {ai.status.speedBonus > 0 ? (
            <span className={styles.badge}>SPD-{ai.status.speedBonus} now</span>
          ) : null}

          {ai.status.speedBonusNext > 0 ? (
            <span className={styles.badge}>
              SPD-{ai.status.speedBonusNext} next
            </span>
          ) : null}
        </div>

        <div className={styles.small}>
          Deck {ai.deck.length} · Hand {ai.hand.length} · Cooldown{" "}
          {ai.cooldown.length} · Trash {ai.trash.length}
        </div>
      </div>
    </div>
  );
}