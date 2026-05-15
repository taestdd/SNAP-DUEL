import { getCard } from "@/game/engine/cards";
import { effectLabel } from "./cardLabels";
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
            {((card.tags?.length ?? 0) > 0 || card.effects.length > 0) && (
              <div className={styles.metaRow}>
                {card.tags?.map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
                {card.effects.map((e, i) => (
                  <span key={i} className={styles.effect}>
                    {effectLabel(e.type, e.damageType)}{e.value !== undefined ? ` ${e.value}` : ""}
                  </span>
                ))}
              </div>
            )}
            <div className={pickStyles.cardText}>{card.text}</div>
          </div>
        );
      })}
    </div>
  );
}
