import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import type { Combatant, GameState, PlayerId, SelectedCard } from "@/game/engine/types";
import styles from "./Hand.module.css";
import CardView from "./CardView";
import CardDetailModal from "./CardDetailModal";
import { getCardPlayability, deriveCardStats } from "@/game/engine/effects";

const CARD_W = 110;
const CARD_H = 144;
const CYCLE_DURATION = 220;
const RIPPLE_STAGGER = 35;

// 부채꼴 레이아웃
const FAN_RADIUS = 600;     // 피벗 위치 (카드 바닥 아래 px)
const ANGLE_PER_CARD = 3.5; // 카드 1장당 각도 (deg)
const MAX_HALF_ANGLE = 18;  // 중앙에서 최대 각도 (deg)
const SELECTED_LIFT = 24;   // 선택 시 위로 올리는 거리 (px)

function cardFanAngle(idx: number, n: number): number {
  if (n <= 1) return 0;
  const half = Math.min(MAX_HALF_ANGLE, ((n - 1) / 2) * ANGLE_PER_CARD);
  const t = (idx / (n - 1)) * 2 - 1; // -1 ~ +1
  return t * half;
}

export default function Hand({
  me,
  selected,
  disabled,
  onSelectCard,
  onCycleHand,
  endTurnButton,
  tagButton,
  gameState,
  playerId,
}: {
  me: Combatant;
  selected: SelectedCard | null;
  disabled: boolean;
  onSelectCard: (cardId: string, handIndex: number) => void;
  onCycleHand: () => void;
  endTurnButton?: React.ReactNode;
  tagButton?: React.ReactNode;
  gameState: GameState;
  playerId: PlayerId;
}) {
  const [detailCard, setDetailCard] = useState<{ cardId: string; handIndex: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);
  const [cyclingIdx, setCyclingIdx] = useState<number | null>(null);
  const [isRippling, setIsRippling] = useState(false);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current);
  }, []);

  const n = me.hand.length;
  const cardLeft = Math.max(0, containerWidth / 2 - CARD_W / 2);

  const handleCycle = useCallback(() => {
    if (n < 2 || cyclingIdx !== null) return;
    setCyclingIdx(n - 1);
    setIsRippling(true);
    cycleTimerRef.current = setTimeout(() => {
      setCyclingIdx(null);
      onCycleHand();
    }, CYCLE_DURATION);
    const rippleClearDelay = CYCLE_DURATION + (n - 2) * RIPPLE_STAGGER + 200;
    rippleTimerRef.current = setTimeout(() => setIsRippling(false), rippleClearDelay);
  }, [n, cyclingIdx, onCycleHand]);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <div className={styles.headerButtons}>
            {tagButton}
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
          <div className={styles.headerButtons}>
            {endTurnButton}
          </div>
        </div>
      </div>

      <div className={styles.rowWrap}>
      <div className={styles.row} ref={rowRef}>
        {me.hand.map((cardId, idx) => {
          // 사용 가능 판정·실효 스탯 모두 엔진의 단일 진실원에 위임
          const play = getCardPlayability(gameState, playerId, cardId);
          const stats = deriveCardStats(gameState, playerId, cardId);
          const canSelect = !disabled && play.playable;
          // 코스트·altCost는 충족하나 조건/어피니티로 막힌 경우만 "차단" 스타일
          const conditionBlocked =
            !disabled && play.costOk && play.altCostOk && (!play.conditionMet || !play.affinityMet);
          const isSelected = selected?.cardId === cardId && selected?.handIndex === idx;
          const isCycling = cyclingIdx === idx;
          const angle = cardFanAngle(idx, n);
          const rippleDelay = (n - 2 - idx) * RIPPLE_STAGGER;
          const showRipple = isRippling && !isCycling && !isSelected;

          return (
            // 바깥 div: 부채꼴 회전 담당 (피벗 = 카드 바닥 아래 FAN_RADIUS px)
            <div
              key={`${cardId}-${idx}`}
              style={{
                position: "absolute",
                left: cardLeft,
                top: 0,
                width: CARD_W,
                height: CARD_H,
                transformOrigin: `50% calc(100% + ${FAN_RADIUS}px)`,
                transform: `rotate(${angle}deg)`,
                zIndex: isCycling ? 0 : isSelected ? n + 10 : idx + 1,
                transition: "transform 150ms ease",
              }}
            >
              {/* 안쪽 div: 선택 lift / 사이클 fade / 리플 담당 */}
              <div
                className={showRipple ? styles.ripple : undefined}
                style={{
                  width: "100%",
                  height: "100%",
                  transform: isSelected
                    ? `translateY(-${SELECTED_LIFT}px)`
                    : "translateY(0)",
                  opacity: isCycling ? 0 : 1,
                  transition: isCycling
                    ? `opacity ${CYCLE_DURATION}ms ease, transform ${CYCLE_DURATION}ms ease`
                    : "transform 150ms ease",
                  animationDelay: showRipple ? `${rippleDelay}ms` : undefined,
                }}
              >
                <CardView
                  cardId={cardId}
                  disabled={!canSelect}
                  conditionBlocked={conditionBlocked}
                  selected={isSelected}
                  handMode
                  stats={stats}
                  onClick={() => onSelectCard(cardId, idx)}
                  onLongPress={() => setDetailCard({ cardId, handIndex: idx })}
                />
              </div>
            </div>
          );
        })}
      </div>
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
