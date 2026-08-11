import type { Combatant } from "@/game/engine/types";
import { formatBuffShort, formatBuffDetail, formatPoisonShort, formatPoisonDetail } from "@/game/engine/buffText";
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
  const buffs = status.buffs ?? [];
  const poisons = status.poisons ?? [];

  const hasAny =
    (combo > 0 && isInitiative) ||
    airborneStack >= 1 ||
    block > 0 ||
    status.attackBuff > 0 ||
    status.exhausted ||
    status.delayAdvantage > 0 ||
    status.delayAdvantageNext > 0 ||
    buffs.length > 0 ||
    poisons.length > 0;

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
      {/* 중독 — 남은 턴이 줄어드는 게 보이도록 틱당 피해와 함께 표시 */}
      {poisons.map((poison, i) => (
        <span
          key={`poison-${i}`}
          className={[styles.badge, styles.badgePoison].join(" ")}
          title={formatPoisonDetail(poison)}
        >
          {formatPoisonShort(poison)}
        </span>
      ))}
      {/* 버프/디버프 — delta 부호로 색을 갈라 한눈에 유불리가 보이게 한다 */}
      {buffs.map((buff, i) => (
        <span
          key={`${buff.stat}-${i}`}
          className={[styles.badge, buff.delta >= 0 ? styles.badgeBuff : styles.badgeDebuff].join(" ")}
          title={formatBuffDetail(buff)}
        >
          {buff.filter ? "◈ " : ""}{formatBuffShort(buff)}
        </span>
      ))}
    </div>
  );
}
