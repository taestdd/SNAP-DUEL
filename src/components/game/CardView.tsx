import styles from "./CardView.module.css";
import { CARDS } from "@/game/engine/cards";

export default function CardView({
  cardId,
  disabled,
  selected,
  onClick,
}: {
  cardId: string;
  disabled: boolean;
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
      </div>

      <div className={styles.body}>
        <div className={styles.text}>{card.text}</div>
      </div>

      <div className={styles.footer}>
        <span className={styles.tag}>{card.effect}</span>
        <span className={styles.val}>{card.value}</span>
      </div>
    </button>
  );
}