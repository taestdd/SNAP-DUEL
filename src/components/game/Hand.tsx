import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import type { Combatant, GameState, PlayerId, SelectedCard } from "@/game/engine/types";
import styles from "./Hand.module.css";
import CardView from "./CardView";
import CardDetailModal from "./CardDetailModal";
import { getCard } from "@/game/engine/cards";
import { CHARACTERS } from "@/game/engine/characters";
import { evaluateModifiers } from "@/game/engine/stateHelpers";

const CARD_W = 110;
const CARD_H = 144;
const CYCLE_DURATION = 220;

export default function Hand({
  me,
  selected,
  disabled,
  onSelectCard,
  onCycleHand,
  endTurnButton,
  gameState,
  playerId,
}: {
  me: Combatant;
  selected: SelectedCard | null;
  disabled: boolean;
  onSelectCard: (cardId: string, handIndex: number) => void;
  onCycleHand: () => void;
  endTurnButton?: React.ReactNode;
  gameState: GameState;
  playerId: PlayerId;
}) {
  const [detailCard, setDetailCard] = useState<{ cardId: string; handIndex: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);
  const [cyclingIdx, setCyclingIdx] = useState<number | null>(null);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => () => {
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
  }, []);

  const n = me.hand.length;
  const step = n <= 1 ? 0 : Math.min(CARD_W, (containerWidth - CARD_W) / (n - 1));
  const totalSpread = n === 0 ? 0 : CARD_W + step * (n - 1);
  const groupLeft = Math.max(0, (containerWidth - totalSpread) / 2);

  const handleCycle = useCallback(() => {
    if (n < 2 || cyclingIdx !== null) return;
    setCyclingIdx(n - 1);
    cycleTimerRef.current = setTimeout(() => {
      setCyclingIdx(null);
      onCycleHand();
    }, CYCLE_DURATION);
  }, [n, cyclingIdx, onCycleHand]);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Hand ({me.hand.length}/10)</div>
          <div className={styles.headerButtons}>
            {endTurnButton}
            <button
              type="button"
              className={styles.cycleBtn}
              onClick={handleCycle}
              disabled={n < 2}
              title="핸드 순환"
            >
              ↺
            </button>
          </div>
        </div>
      </div>

      <div className={styles.row} ref={rowRef}>
        {me.hand.map((cardId, idx) => {
          const card = getCard(cardId);
          const mods = evaluateModifiers(gameState, playerId, card?.statModifiers);
          const effectiveCost = card ? Math.max(0, card.cost + (mods.cost ?? 0)) : 0;
          const costOk = !!card && effectiveCost <= me.deck.length;
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
          const isCycling = cyclingIdx === idx;

          // 우측 끝 카드가 좌측 끝으로 이동하는 오프셋
          const cycleOffset = isCycling ? -(n - 1) * step : 0;

          return (
            <div
              key={`${cardId}-${idx}`}
              style={{
                position: "absolute",
                left: groupLeft + idx * step,
                width: CARD_W,
                height: CARD_H,
                zIndex: isCycling ? n + 20 : isSelected ? n + 10 : idx + 1,
                transform: isCycling
                  ? `translateX(${cycleOffset}px) translateY(-8px)`
                  : isSelected
                  ? "translateY(-10px)"
                  : "translateY(0)",
                transition: isCycling
                  ? `transform ${CYCLE_DURATION}ms ease`
                  : "transform 150ms ease, left 200ms ease",
                opacity: isCycling ? 0.85 : 1,
              }}
            >
              <CardView
                cardId={cardId}
                disabled={!canSelect}
                conditionBlocked={conditionBlocked}
                selected={isSelected}
                handMode
                speedBonus={me.status.speedBonus - (mods.speed ?? 0)}
                statDeltas={mods}
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
