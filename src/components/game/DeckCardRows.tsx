import { getCard } from "@/game/engine/cards";
import pickStyles from "./CardPickList.module.css";
import styles from "./DeckCardRows.module.css";

export default function DeckCardRows({ cards }: { cards: string[] }) {
  if (cards.length === 0) {
    return <div className={styles.empty}>비어 있습니다.</div>;
  }

  return (
    <div className={pickStyles.cardList}>
      {cards.map((cardId, idx) => {
        const card = getCard(cardId);
        if (!card) return null;
        return (
          <div key={`${cardId}-${idx}`} className={pickStyles.cardItem}>
            <div className={pickStyles.cardName}>{card.name}</div>
            <div className={pickStyles.cardMeta}>C{card.cost} · S{card.speed}</div>
            <div className={pickStyles.cardText}>{card.text}</div>
          </div>
        );
      })}
    </div>
  );
}
