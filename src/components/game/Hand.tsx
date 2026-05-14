import { useRef, useState, useEffect, useLayoutEffect } from "react";
import type { Combatant, GameState, PlayerId, SelectedCard } from "@/game/engine/types";
import styles from "./Hand.module.css";
import CardView from "./CardView";
import CardDetailModal from "./CardDetailModal";
import { CARDS } from "@/game/engine/cards";
import { CHARACTERS } from "@/game/engine/characters";
import { evaluateModifiers } from "@/game/engine/stateHelpers";

const CARD_W = 110;
const CARD_H = 100;

export default function Hand({
  me,
  selected,
  disabled,
  onSelectCard,
  endTurnButton,
  gameState,
  playerId,
}: {
  me: Combatant;
  selected: SelectedCard | null;
  disabled: boolean;
  onSelectCard: (cardId: string, handIndex: number) => void;
  endTurnButton?: React.ReactNode;
  gameState: GameState;
  playerId: PlayerId;
}) {
  const [detailCard, setDetailCard] = useState<{ cardId: string; handIndex: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);

  useLayoutEffect(() => {
    if (rowRef.current) {
      setContainerWidth(rowRef.current.getBoundingClientRect().width);
    }
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = me.hand.length;
  const step = n <= 1 ? 0 : Math.min(CARD_W, (containerWidth - CARD_W) / (n - 1));
  const totalSpread = n === 0 ? 0 : CARD_W + step * (n - 1);
  const groupLeft = Math.max(0, (containerWidth - totalSpread) / 2);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Hand ({me.hand.length}/10)</div>
          {endTurnButton && (
            <div className={styles.headerButtons}>{endTurnButton}</div>
          )}
        </div>

      </div>

      <div className={styles.row} ref={rowRef}>
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
          const isSelected = selected?.cardId === cardId && selected?.handIndex === idx;

          return (
            <div
              key={`${cardId}-${idx}`}
              style={{
                position: "absolute",
                left: groupLeft + idx * step,
                width: CARD_W,
                height: CARD_H,
                zIndex: isSelected ? n + 10 : idx + 1,
                transform: isSelected ? "translateY(-10px)" : "translateY(0)",
                transition: "transform 150ms ease, left 200ms ease",
              }}
            >
              <CardView
                cardId={cardId}
                disabled={!canSelect}
                conditionBlocked={conditionBlocked}
                selected={isSelected}
                handMode
                speedBonus={
                  me.status.speedBonus -
                  (card?.statModifiers
                    ? (evaluateModifiers(gameState, playerId, card.statModifiers).speed ?? 0)
                    : 0)
                }
                onClick={() => onSelectCard(cardId, idx)}
                onLongPress={() => setDetailCard({ cardId, handIndex: idx })}
              />
            </div>
          );
        })}
      </div>

      {detailCard && (
        <CardDetailModal
          cardId={detailCard.cardId}
          onClose={() => setDetailCard(null)}
          gameState={gameState}
          playerId={playerId}
        />
      )}
    </div>
  );
}
