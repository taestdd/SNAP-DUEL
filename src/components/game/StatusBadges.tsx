import type { Combatant } from "@/game/engine/types";
import styles from "./StatusBadges.module.css";

export default function StatusBadges({
  combatant,
  alignRight = false,
  combo = 0,
  isInitiative = false,
}: {
  combatant: Combatant;
  alignRight?: boolean;
  combo?: number;
  isInitiative?: boolean;
}) {
  const { status, block, airborneStack } = combatant;

  const hasAny =
    (combo > 0 && isInitiative) ||
    airborneStack >= 1 ||
    block > 0 ||
    status.attackBuff > 0 ||
    status.exhausted ||
    status.delayAdvantage > 0 ||
    status.delayAdvantageNext > 0;

  if (!hasAny) return null;

  return (
    <div className={[styles.badges, alignRight ? styles.badgesRight : ""].join(" ")}>
      {combo > 0 && isInitiative && (
        <span className={[styles.badge, styles.badgeCombo].join(" ")}>{combo} HIT</span>
      )}
      {airborneStack >= 1 && (
        <span className={[styles.badge, styles.badgeAir].join(" ")}>⬆ ×{airborneStack}</span>
      )}
      {block > 0 && <span className={styles.badge}>🛡 {block}</span>}
      {status.attackBuff > 0 && <span className={styles.badge}>ATK+{status.attackBuff}</span>}
      {status.exhausted && (
        <span className={[styles.badge, styles.badgeWarn].join(" ")}>EXHAUSTED</span>
      )}
      {status.delayAdvantage > 0 && <span className={styles.badge}>ADV+{status.delayAdvantage}</span>}
      {status.delayAdvantageNext > 0 && (
        <span className={styles.badge}>ADV+{status.delayAdvantageNext} next</span>
      )}
    </div>
  );
}
