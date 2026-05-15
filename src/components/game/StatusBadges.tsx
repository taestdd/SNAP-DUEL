import type { Combatant } from "@/game/engine/types";
import styles from "./StatusBadges.module.css";

export default function StatusBadges({
  combatant,
  alignRight = false,
}: {
  combatant: Combatant;
  alignRight?: boolean;
}) {
  const { status, block, airborneStack } = combatant;
  const burn = status.burn;

  const hasAny =
    airborneStack >= 1 ||
    block > 0 ||
    status.attackBuff > 0 ||
    !!burn ||
    status.exhausted ||
    status.speedBonus > 0 ||
    status.speedBonusNext > 0;

  if (!hasAny) return null;

  return (
    <div className={[styles.badges, alignRight ? styles.badgesRight : ""].join(" ")}>
      {airborneStack >= 1 && (
        <span className={[styles.badge, styles.badgeAir].join(" ")}>⬆ ×{airborneStack}</span>
      )}
      {block > 0 && <span className={styles.badge}>🛡 {block}</span>}
      {status.attackBuff > 0 && <span className={styles.badge}>ATK+{status.attackBuff}</span>}
      {burn && (
        <span className={[styles.badge, styles.badgeBurn].join(" ")}>
          BURN {burn.turns}t · {burn.dmgPerTurn}/t
        </span>
      )}
      {status.exhausted && (
        <span className={[styles.badge, styles.badgeWarn].join(" ")}>EXHAUSTED</span>
      )}
      {status.speedBonus > 0 && <span className={styles.badge}>SPD-{status.speedBonus}</span>}
      {status.speedBonusNext > 0 && (
        <span className={styles.badge}>SPD-{status.speedBonusNext} next</span>
      )}
    </div>
  );
}
