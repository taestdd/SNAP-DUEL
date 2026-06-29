import { useRef } from "react";
import styles from "./CardView.module.css";
import { getCard } from "@/game/engine/cards";
import type { CardStats } from "@/game/engine/types";
import { effectLabel } from "./cardLabels";
import CostBox from "./CostBox";
import SpeedCircle from "./SpeedCircle";

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
  stats,
  onClick,
  onLongPress,
}: {
  cardId: string;
  disabled: boolean;
  conditionBlocked?: boolean;
  selected: boolean;
  handMode?: boolean;
  /** 실효 스탯 (deriveCardStats). 없으면 base 스탯으로 표시 */
  stats?: CardStats;
  onClick: () => void;
  onLongPress?: () => void;
}) {
  const card = getCard(cardId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  if (!card) return null;

  const effectiveCost = stats ? stats.cost : card.cost;
  const effectiveSpeed = stats ? stats.speed : card.speed;
  const effectiveGA = stats ? stats.groundAttack : (card.groundAttack ?? 0);
  const effectiveAA = stats ? stats.antiAirAttack : (card.antiAirAttack ?? 0);
  const costDelta = effectiveCost - card.cost;
  const speedBonus = card.speed - effectiveSpeed; // 양수 = 더 빠름(속도 감소)

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
          {/* 상단 헤더: 코스트 박스 + 카드 이름 */}
          <div className={styles.header}>
            <CostBox
              value={effectiveCost}
              size="lg"
              disabled={disabled}
              className={deltaClass(costDelta, false)}
            >
              {card.altCost && (
                <span className={card.altCost.type === "hp" ? styles.altCostHp : styles.altCostDot}>
                  {card.altCost.type === "hp" ? "♥" : "•"}
                </span>
              )}
            </CostBox>
            <div className={styles.handCardName}>{card.name}</div>
          </div>

          {/* 일러스트 영역: 스피드 원 + 공격 스트립 */}
          <div className={styles.illustArea}>
            <SpeedCircle
              value={effectiveSpeed}
              bonus={speedBonus}
              disabled={disabled}
            />

            {(card.antiAirAttack !== undefined || card.groundAttack !== undefined) && (
              <div className={styles.atkStrip}>
                <span className={[styles.atkValue, effectiveAA === 0 ? styles.atkDim : ""].join(" ")}>
                  {effectiveAA}
                </span>
                <span className={styles.atkSep}>·</span>
                <span className={[styles.atkValue, effectiveGA === 0 ? styles.atkDim : ""].join(" ")}>
                  {effectiveGA}
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={styles.top}>
          <div className={styles.cost}>{effectiveCost}</div>
          <div className={styles.name}>{card.name}</div>
          <div className={styles.speed}>{effectiveSpeed}</div>
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
