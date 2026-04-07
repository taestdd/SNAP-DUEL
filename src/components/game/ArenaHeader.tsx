import type { Combatant } from "@/game/engine/types";
import styles from "./ArenaHeader.module.css";

export default function ArenaHeader({ ai }: { ai: Combatant }) {
  const burn = ai.status.burn;
  const isAirborne = ai.airborneStack >= 1;

  return (
    <div className={styles.wrap}>
      <div className={styles.name}>AI</div>

      <div className={styles.stats}>
        <span>HP: {ai.hp}</span>
        <span>Block: {ai.block}</span>
      </div>

      <div className={styles.zones}>
        Deck {ai.deck.length} · Hand {ai.hand.length} · Cooldown {ai.cooldown.length} · Trash {ai.trash.length}
      </div>

      {(isAirborne || ai.status.attackBuff > 0 || burn || ai.status.exhausted || ai.status.speedBonus > 0 || ai.status.speedBonusNext > 0) && (
        <div className={styles.badges}>
          {isAirborne && (
            <span className={`${styles.badge} ${styles.badgeAirborne}`}>
              AIR ×{ai.airborneStack}
            </span>
          )}
          {ai.status.attackBuff > 0 && (
            <span className={styles.badge}>ATK+ {ai.status.attackBuff}</span>
          )}
          {burn && (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          )}
          {ai.status.exhausted && (
            <span className={styles.badge}>EXHAUSTED</span>
          )}
          {ai.status.speedBonus > 0 && (
            <span className={styles.badge}>SPD-{ai.status.speedBonus} now</span>
          )}
          {ai.status.speedBonusNext > 0 && (
            <span className={styles.badge}>SPD-{ai.status.speedBonusNext} next</span>
          )}
        </div>
      )}
    </div>
  );
}
