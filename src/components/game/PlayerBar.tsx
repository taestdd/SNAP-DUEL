import type { Combatant } from "@/game/engine/types";
import styles from "./PlayerBar.module.css";

export default function PlayerBar({ me }: { me: Combatant }) {
  const burn = me.status.burn;
  const isAirborne = me.airborneStack >= 1;

  return (
    <div className={styles.wrap}>
      <div className={styles.name}>YOU</div>

      <div className={styles.stats}>
        <span>HP: {me.hp}</span>
        <span>Block: {me.block}</span>
      </div>

      <div className={styles.zones}>
        Deck {me.deck.length} · Hand {me.hand.length} · Cooldown {me.cooldown.length} · Trash {me.trash.length}
      </div>

      {(isAirborne || me.status.attackBuff > 0 || burn || me.status.exhausted || me.status.speedBonus > 0 || me.status.speedBonusNext > 0) && (
        <div className={styles.badges}>
          {isAirborne && (
            <span className={`${styles.badge} ${styles.badgeAirborne}`}>
              AIR ×{me.airborneStack}
            </span>
          )}
          {me.status.attackBuff > 0 && (
            <span className={styles.badge}>ATK+ {me.status.attackBuff}</span>
          )}
          {burn && (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          )}
          {me.status.exhausted && (
            <span className={styles.badge}>EXHAUSTED</span>
          )}
          {me.status.speedBonus > 0 && (
            <span className={styles.badge}>SPD-{me.status.speedBonus} now</span>
          )}
          {me.status.speedBonusNext > 0 && (
            <span className={styles.badge}>SPD-{me.status.speedBonusNext} next</span>
          )}
        </div>
      )}
    </div>
  );
}
