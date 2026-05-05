import { useState } from "react";
import type { Combatant, SelectedCard } from "@/game/engine/types";
import styles from "./Hand.module.css";
import CardView from "./CardView";
import CardDetailModal from "./CardDetailModal";
import { CARDS } from "@/game/engine/cards";
import { CHARACTERS } from "@/game/engine/characters";

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
  const [detailCard, setDetailCard] = useState<{ cardId: string; handIndex: number } | null>(null);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Hand ({me.hand.length}/10)</div>
          {endTurnButton && (
            <div className={styles.headerButtons}>{endTurnButton}</div>
          )}
        </div>
        <div className={styles.help}>
          {disabled ? "Setup only" : "Select 1 card, then Ready / Pass"}
        </div>
      </div>

      <div className={styles.row}>
        {me.hand.map((cardId, idx) => {
          const card = CARDS[cardId];
          const costOk = !!card && card.cost <= me.deck.length;
          const conditionMet =
            !card?.useCondition ||
            (card.useCondition === "ground" && me.airborneStack === 0) ||
            (card.useCondition === "airborne" && me.airborneStack >= 1);
          const charAffinities = CHARACTERS[me.activeCharacter].affinities;
          const affinityMet =
            !card?.tags?.length ||
            card.tags.every((t) => charAffinities.includes(t));
          const canSelect = !disabled && costOk && conditionMet && affinityMet;
          const conditionBlocked = !disabled && costOk && (!conditionMet || !affinityMet);
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
              onLongPress={() => setDetailCard({ cardId, handIndex: idx })}
            />
          );
        })}
      </div>

      {detailCard && (
        <CardDetailModal
          cardId={detailCard.cardId}
          onClose={() => setDetailCard(null)}
        />
      )}
    </div>
  );
}
