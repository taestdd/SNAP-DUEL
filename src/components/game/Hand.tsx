import type { Combatant, SelectedCard } from "@/game/engine/types";
import styles from "./Hand.module.css";
import CardView from "./CardView";
import { CARDS } from "@/game/engine/cards";

export default function Hand({
  me,
  selected,
  disabled,
  onSelectCard,
  endTurnButton,
}: {
  me: Combatant;
  selected: SelectedCard | null;
  disabled: boolean;
  onSelectCard: (cardId: string, handIndex: number) => void;
  endTurnButton?: React.ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.topLeft}>
          <div className={styles.title}>Hand ({me.hand.length}/10)</div>
          <div className={styles.help}>
            {disabled ? "Setup only" : "Select 1 card, then Ready / Pass"}
          </div>
        </div>
        {endTurnButton && (
          <div className={styles.topRight}>{endTurnButton}</div>
        )}
      </div>

      <div className={styles.row}>
        {me.hand.map((cardId, idx) => {
          const card = CARDS[cardId];
          const costOk = !!card && card.cost <= me.deck.length;
          const conditionMet =
            !card?.useCondition ||
            (card.useCondition === "ground" && me.airborneStack === 0) ||
            (card.useCondition === "airborne" && me.airborneStack >= 1);
          const canSelect = !disabled && costOk && conditionMet;
          const conditionBlocked = !disabled && costOk && !conditionMet;
          const isSelected =
            selected?.cardId === cardId && selected?.handIndex === idx;

          return (
            <CardView
              key={`${cardId}-${idx}`}
              cardId={cardId}
              disabled={!canSelect}
              conditionBlocked={conditionBlocked}
              selected={isSelected}
              onClick={() => onSelectCard(cardId, idx)}
            />
          );
        })}
      </div>
    </div>
  );
}
