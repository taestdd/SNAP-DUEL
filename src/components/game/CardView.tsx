import { useRef } from "react";
import styles from "./CardView.module.css";
import { CARDS } from "@/game/engine/cards";
import type { StatTarget } from "@/game/engine/types";
import { effectLabel } from "./cardLabels";

export { effectLabel };

export function effectBadgeClass(type: string, damageType?: string) {
  if (type === "tag") return styles.tagTag;
  if (damageType === "ground") return styles.tagGround;
  if (damageType === "anti-air") return styles.tagAntiAir;
  if (type === "airborne") return styles.tagAirborne;
  return "";
}

function deltaClass(delta: number, higherIsBetter = true) {
  if (delta === 0) return "";
  return (higherIsBetter ? delta > 0 : delta < 0) ? styles.statBoosted : styles.statNerfed;
}

const LONG_PRESS_MS = 480;

export default function CardView({
  cardId,
  disabled,
  conditionBlocked = false,
  selected,
  handMode = false,
  speedBonus = 0,
  statDeltas,
  onClick,
  onLongPress,
}: {
  cardId: string;
  disabled: boolean;
  conditionBlocked?: boolean;
  selected: boolean;
  handMode?: boolean;
  speedBonus?: number;
  statDeltas?: Partial<Record<StatTarget, number>>;
  onClick: () => void;
  onLongPress?: () => void;
}) {
  const card = CARDS[cardId];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  if (!card) return null;

  const costDelta = statDeltas?.cost ?? 0;
  const gaDelta = statDeltas?.ground_attack ?? 0;
  const aaDelta = statDeltas?.anti_air_attack ?? 0;
  const effectiveCost = Math.max(0, card.cost + costDelta);
  const effectiveGA = Math.max(0, (card.groundAttack ?? 0) + gaDelta);
  const effectiveAA = Math.max(0, (card.antiAirAttack ?? 0) + aaDelta);

  function startPress() {
    longFiredRef.current = false;
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      onLongPress?.();
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function handleClick() {
    if (longFiredRef.current) return; // 롱프레스가 발동한 경우 클릭 무시
    onClick();
  }

  return (
    <button
      type="button"
      className={[
        styles.card,
        handMode ? styles.handCard : "",
        disabled ? styles.disabled : "",
        conditionBlocked ? styles.conditionBlocked : "",
        selected ? styles.selected : "",
      ].join(" ")}
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      disabled={disabled}
    >
      {handMode ? (
        <>
          <div className={styles.handStatRow}>
            <div className={[styles.cost, deltaClass(costDelta, false)].join(" ")}>{effectiveCost}</div>
            <div className={[
              styles.speedCircle,
              speedBonus > 0 ? styles.speedDown : speedBonus < 0 ? styles.speedUp : "",
            ].join(" ")}>{Math.max(0, card.speed - speedBonus)}</div>
          </div>
          <div className={styles.handCardName}>{card.name}</div>
          {card.cardType === "attack" && (
            <div className={styles.handAtkList}>
              {(card.antiAirAttack ?? 0) > 0 && (
                <div className={[styles.handAtkLine, deltaClass(aaDelta)].join(" ")}>🔼{effectiveAA}</div>
              )}
              {(card.groundAttack ?? 0) > 0 && (
                <div className={[styles.handAtkLine, deltaClass(gaDelta)].join(" ")}>🔽{effectiveGA}</div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className={styles.top}>
          <div className={styles.cost}>{card.cost}</div>
          <div className={styles.name}>{card.name}</div>
          <div className={styles.speed}>{card.speed}</div>
        </div>
      )}

      {!handMode && (
        <div className={styles.footer}>
          <div className={styles.effectRow}>
            {card.effects.map((eff, i) => (
              <span
                key={i}
                className={[styles.tag, effectBadgeClass(eff.type, eff.damageType)].join(" ")}
              >
                {effectLabel(eff.type, eff.damageType)}
                {eff.value !== undefined ? ` ${eff.value}` : ""}
              </span>
            ))}
          </div>

          {card.useCondition && (
            <span className={styles.conditionTag}>
              {card.useCondition === "ground" ? "⬇" : "⬆"}
            </span>
          )}
        </div>
      )}

      {onLongPress && <div className={styles.longPressHint}>…</div>}
    </button>
  );
}
