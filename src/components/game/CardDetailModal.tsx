import { CARDS } from "@/game/engine/cards";
import { effectBadgeClass, effectLabel } from "./CardView";
import styles from "./CardDetailModal.module.css";

export default function CardDetailModal({
  cardId,
  onClose,
}: {
  cardId: string;
  onClose: () => void;
}) {
  const card = CARDS[cardId];
  if (!card) return null;

  return (
    <div className={styles.overlay} onPointerDown={onClose}>
      <div
        className={styles.panel}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 헤더: 이름 + 닫기 */}
        <div className={styles.header}>
          <span className={styles.headerName}>{card.name}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 메타 행: 코스트 · 속도 · 획득 */}
        <div className={styles.metaRow}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Cost</span>
            <span className={styles.metaValue}>{card.cost}</span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Speed</span>
            <span className={styles.metaValue}>{card.speed}</span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Gain</span>
            <span className={styles.metaValue}>{card.gain}</span>
          </div>
        </div>

        {/* 카드 텍스트 */}
        <p className={styles.text}>{card.text}</p>

        {/* 효과 목록 */}
        <div className={styles.effectList}>
          {card.effects.map((eff, i) => (
            <div key={i} className={styles.effectRow}>
              <span
                className={[styles.effBadge, effectBadgeClass(eff.type, eff.damageType)].join(" ")}
              >
                {effectLabel(eff.type, eff.damageType)}
              </span>
              {eff.value !== undefined && (
                <span className={styles.effValue}>{eff.value}</span>
              )}
              {eff.target && (
                <span className={styles.effTarget}>{eff.target}</span>
              )}
            </div>
          ))}
        </div>

        {/* 태그 */}
        {card.tags && card.tags.length > 0 && (
          <div className={styles.tagRow}>
            {card.tags.map((t) => (
              <span key={t} className={styles.tagBadge}>{t}</span>
            ))}
          </div>
        )}

        {/* 사용 조건 */}
        {card.useCondition && (
          <div className={styles.condition}>
            {card.useCondition === "ground"
              ? "⬇ Ground only (not airborne)"
              : "⬆ Airborne only"}
          </div>
        )}
      </div>
    </div>
  );
}
