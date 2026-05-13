import { useRef } from "react";
import styles from "./CardView.module.css";
import { CARDS } from "@/game/engine/cards";

export function effectBadgeClass(type: string, damageType?: string) {
  if (type === "tag") return styles.tagTag;
  if (damageType === "ground") return styles.tagGround;
  if (damageType === "anti-air") return styles.tagAntiAir;
  if (type === "airborne") return styles.tagAirborne;
  return "";
}

export function effectLabel(type: string, damageType?: string): string {
  if (type === "damage" && damageType === "ground") return "⬇ Ground";
  if (type === "damage" && damageType === "anti-air") return "⬆ Anti-Air";
  if (type === "tag") return "⇄ Tag";
  if (type === "airborne") return "⬆ Launch";
  if (type === "heal") return "Heal";
  if (type === "block") return "Block";
  if (type === "draw") return "Draw";
  if (type === "buff_attack") return "ATK+";
  if (type === "move_cards") return "Move";
  if (type === "shuffle") return "Shuffle";
  if (type === "generate") return "Generate";
  return type;
}

const LONG_PRESS_MS = 480;

export default function CardView({
  cardId,
  disabled,
  conditionBlocked = false,
  selected,
  handMode = false,
  speedBonus = 0,
  onClick,
  onLongPress,
}: {
  cardId: string;
  disabled: boolean;
  conditionBlocked?: boolean;
  selected: boolean;
  handMode?: boolean;
  speedBonus?: number;
  onClick: () => void;
  onLongPress?: () => void;
}) {
  const card = CARDS[cardId];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  if (!card) return null;

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
            <div className={styles.cost}>{card.cost}</div>
            <div className={[
              styles.speedCircle,
              speedBonus > 0 ? styles.speedDown : speedBonus < 0 ? styles.speedUp : "",
            ].join(" ")}>{Math.max(0, card.speed - speedBonus)}</div>
            {card.cardType === "attack" && (
              <div className={styles.atkBadge}>
                {(card.groundAttack ?? 0) > 0 && <span>⬇{card.groundAttack}</span>}
                {(card.antiAirAttack ?? 0) > 0 && <span>⬆{card.antiAirAttack}</span>}
              </div>
            )}
          </div>
          <div className={styles.handCardName}>{card.name}</div>
        </>
      ) : (
        <div className={styles.top}>
          <div className={styles.cost}>{card.cost}</div>
          <div className={styles.name}>{card.name}</div>
          <div className={styles.speed}>{card.speed}</div>
        </div>
      )}

      {/* 효과 배지 — 핸드 모드에서는 숨김 */}
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

      {/* 롱프레스 힌트 */}
      {onLongPress && <div className={styles.longPressHint}>…</div>}
    </button>
  );
}