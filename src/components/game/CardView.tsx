import styles from "./CardView.module.css";
import { CARDS } from "@/game/engine/cards";

function effectBadgeClass(type: string, damageType?: string) {
  if (type === "tag") return styles.tagTag;
  if (damageType === "ground") return styles.tagGround;
  if (damageType === "anti-air") return styles.tagAntiAir;
  if (type === "airborne") return styles.tagAirborne;
  return "";
}

function effectLabel(type: string, damageType?: string): string {
  if (type === "damage" && damageType === "ground") return "⬇ Ground";
  if (type === "damage" && damageType === "anti-air") return "⬆ Anti-Air";
  if (type === "tag") return "⇄ Tag";
  if (type === "airborne") return "⬆ Launch";
  if (type === "heal") return "Heal";
  if (type === "block") return "Block";
  if (type === "draw") return "Draw";
  if (type === "buff_attack") return "ATK+";
  return type;
}

export default function CardView({
  cardId,
  disabled,
  conditionBlocked = false,
  selected,
  onClick,
}: {
  cardId: string;
  disabled: boolean;
  conditionBlocked?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const card = CARDS[cardId];
  if (!card) return null;

  return (
    <button
      type="button"
      className={[
        styles.card,
        disabled ? styles.disabled : "",
        conditionBlocked ? styles.conditionBlocked : "",
        selected ? styles.selected : "",
      ].join(" ")}
      onClick={onClick}
      disabled={disabled}
      title={card.text}
    >
      <div className={styles.top}>
        <div className={styles.cost}>{card.cost}</div>
        <div className={styles.name}>{card.name}</div>
        <div className={styles.speed}>SPD {card.speed}</div>
        {card.gain > 0 ? <span className={styles.meta}>GAIN {card.gain}</span> : null}
      </div>

      <div className={styles.body}>
        <div className={styles.text}>{card.text}</div>
      </div>

      {card.tags && card.tags.length > 0 && (
        <div className={styles.tagRow}>
          {card.tags.map((t) => (
            <span key={t} className={styles.cardTagBadge}>#{t}</span>
          ))}
        </div>
      )}

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

        {card.useCondition ? (
          <span className={styles.conditionTag}>
            {card.useCondition === "ground" ? "⬇ only" : "⬆ only"}
          </span>
        ) : null}
      </div>
    </button>
  );
}