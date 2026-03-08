import type { Combatant, SelectedCard } from "@/game/engine/types";
import styles from "./Hand.module.css";
import CardView from "./CardView";
import { CARDS } from "@/game/engine/cards";

export default function Hand({
  me,
  selected,
  disabled,
  onSelectCard,
}: {
  me: Combatant;
  selected: SelectedCard | null;
  disabled: boolean;
  onSelectCard: (cardId: string, handIndex: number) => void;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.title}>Hand ({me.hand.length}/10)</div>
        <div className={styles.help}>
          {disabled ? "Setup only" : "Select 1 card, then Ready / Pass"}
        </div>
      </div>

      <div className={styles.row}>
        {me.hand.map((cardId, idx) => {
          const card = CARDS[cardId];
          const canSelect = !disabled && !!card && card.cost <= me.deck.length;
          const isSelected =
            selected?.cardId === cardId && selected?.handIndex === idx;

          return (
            <CardView
              key={`${cardId}-${idx}`}
              cardId={cardId}
              disabled={!canSelect}
              selected={isSelected}
              onClick={() => onSelectCard(cardId, idx)}
            />
          );
        })}
      </div>
    </div>
  );
}