"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Action,
  ActionTag,
  Combatant,
  CombatAnimationEvent,
  FighterPose,
  GameState,
} from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import { makeQueue } from "@/game/animation/makeQueue";
import { useAnimQueue } from "@/game/animation/useAnimQueue";
import styles from "./GameScreen.module.css";
import modalStyles from "./CardSelectionModal.module.css";
import ArenaHeader from "./ArenaHeader";
import PlayerBar from "./PlayerBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";
import CardSelectionModal from "./CardSelectionModal";
import ToastMessage from "./ToastMessage";
import ArenaStage from "./ArenaStage";

function actionTagToPose(tag?: ActionTag): FighterPose {
  switch (tag) {
    case "slash":    return "attack_slash";
    case "strike":   return "attack_strike";
    case "magic":    return "attack_magic";
    case "block":    return "block";
    case "launch":
    case "aerial":   return "airborne";
    default:         return "attack_slash";
  }
}

function effectLabel(effect: string, damageType?: string) {
  if (effect === "damage" && damageType === "ground") return "⬇ Ground";
  if (effect === "damage" && damageType === "anti-air") return "⬆ Anti-Air";
  switch (effect) {
    case "damage":      return "Damage";
    case "block":       return "Block";
    case "draw":        return "Draw";
    case "heal":        return "Heal";
    case "buff_attack": return "ATK Buff";
    case "burn":        return "Burn";
    case "tag":         return "⇄ Tag";
    case "airborne":    return "⬆ Launch";
    default:            return effect;
  }
}

function QueuePreview({
  title,
  me,
  phase,
  recentlyCancelledId,
}: {
  title: string;
  me: Combatant;
  phase: string;
  recentlyCancelledId: string | null;
}) {
  const queuedId = me.queue[0];
  const card = queuedId ? getCard(queuedId) : null;

  // Cancel detection: track previous queued id
  const prevQueuedIdRef = useRef<string | undefined>(queuedId);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    const prev = prevQueuedIdRef.current;
    prevQueuedIdRef.current = queuedId;

    if (!queuedId && recentlyCancelledId && prev === recentlyCancelledId) {
      setShowCancel(true);
      const timer = setTimeout(() => setShowCancel(false), 850);
      return () => clearTimeout(timer);
    }
  }, [queuedId, recentlyCancelledId]);

  const isResolving = phase === "RESOLVE";

  return (
    <div className={styles.queueBox}>
      <div className={styles.queueTitle}>{title}</div>

      {!card ? (
        <div className={`${styles.queueEmpty} ${showCancel ? styles.queueCancelAnim : ""}`}>
          {showCancel ? (
            <div className={`${styles.cancelOverlay}`} style={{ position: "relative", width: "100%", height: "40px" }} />
          ) : "—"}
        </div>
      ) : (
        <div key={queuedId} className={`${styles.queueCard} ${styles.queueCardAnim}`}>
          <div className={styles.queueCardName}>{card.name}</div>

          <div className={styles.queueStats}>
            <span>Cost {card.cost}</span>
            <span>Speed {card.speed}</span>
            <span>Gain {card.gain}</span>
          </div>

          <div className={styles.queueEffectRow}>
            {card.effects.map((effect, idx) => (
              <span
                key={`${card.id}-effect-${idx}`}
                className={`${styles.effectBadge} ${isResolving ? styles.effectBadgePulse : ""}`}
              >
                {effectLabel(effect.type, effect.damageType)}
                {effect.value !== undefined ? ` ${effect.value}` : ""}
              </span>
            ))}
          </div>

          <div className={styles.queueText}>{card.text}</div>
        </div>
      )}
    </div>
  );
}

function DiscardModal({
  count,
  candidates,
  onConfirm,
}: {
  count: number;
  candidates: string[];
  onConfirm: (keys: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggleCard(cardId: string, idx: number) {
    const key = `${cardId}::${idx}`;
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= count) return prev;
      return [...prev, key];
    });
  }

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.modal}>
        <div className={modalStyles.header}>
          <h2 className={modalStyles.title}>
            핸드 사이즈 초과 — {count}장을 버리세요
          </h2>
          <div className={modalStyles.subtitle}>
            현재 핸드 {candidates.length}장 → {candidates.length - count}장으로 줄여야 합니다. 버릴 카드 {count}장을 선택하세요. 선택한 카드는 trash로 이동합니다.
          </div>
        </div>

        <div className={modalStyles.cardList}>
          {candidates.map((cardId, idx) => {
            const card = getCard(cardId);
            const key = `${cardId}::${idx}`;
            const isSelected = selected.includes(key);
            const isDisabled = !isSelected && selected.length >= count;

            return (
              <button
                key={key}
                type="button"
                className={`${modalStyles.cardItem} ${isSelected ? modalStyles.cardSelected : ""} ${isDisabled ? modalStyles.cardDisabled : ""}`}
                onClick={() => !isDisabled && toggleCard(cardId, idx)}
              >
                <div className={modalStyles.cardName}>{card?.name ?? cardId}</div>
                {card && (
                  <div className={modalStyles.cardMeta}>
                    C{card.cost} · S{card.speed}
                  </div>
                )}
                {card && <div className={modalStyles.cardText}>{card.text}</div>}
              </button>
            );
          })}
        </div>

        <div className={modalStyles.actions}>
          <button
            type="button"
            className={modalStyles.confirmBtn}
            disabled={selected.length !== count}
            onClick={() => onConfirm(selected)}
          >
            버리기 ({selected.length}/{count})
          </button>
        </div>
      </div>
    </div>
  );
}

function DeckCardRows({ cards }: { cards: string[] }) {
  return (
    <div className={styles.deckCardList}>
      {cards.length === 0 ? (
        <div className={styles.deckEmpty}>비어 있습니다.</div>
      ) : (
        cards.map((cardId, idx) => {
          const card = getCard(cardId);
          if (!card) return null;
          return (
            <div key={`${cardId}-${idx}`} className={styles.deckCardRow}>
              <div className={styles.deckCardName}>{card.name}</div>
              <div className={styles.deckCardMeta}>
                {card.tags?.map((tag) => (
                  <span key={tag} className={styles.deckCardTag}>{tag}</span>
                ))}
                <div className={styles.deckCardEffects}>
                  {card.effects.map((e, i) => (
                    <span key={i} className={styles.deckCardEffect}>
                      {effectLabel(e.type, e.damageType)}{e.value !== undefined ? ` ${e.value}` : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles.deckCardText}>{card.text}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function GameScreen({
  state,
  dispatch,
  isAiThinking,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  isAiThinking: boolean;
}) {
  const isGameOver = state.phase === "GAME_OVER";
  const isSetup = state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
  const canAct = isSetup && !state.P1.ready && !isGameOver;
  const hasSelection = !!state.selected;
  const readyLabel = hasSelection ? "Ready" : "Pass";

  const prevPhaseRef = useRef(state.phase);
  const toastKeyRef = useRef(0);
  const [toastKey, setToastKey] = useState(0);
  const [toastText, setToastText] = useState("");

  // ── 파이터 포즈 상태 ──────────────────────────────────────────
  const [playerPose, setPlayerPose] = useState<FighterPose>("idle");
  const [playerPoseKey, setPlayerPoseKey] = useState<number>(0);
  const [aiPose, setAiPose] = useState<FighterPose>("idle");
  const [aiPoseKey, setAiPoseKey] = useState<number>(0);

  const [animQueue, setAnimQueue] = useState<CombatAnimationEvent[]>([]);
  const [animRunning, setAnimRunning] = useState(false);

  // RESOLVING 진입 시 이벤트 큐 생성
  useEffect(() => {
    if (state.phase !== "RESOLVING") {
      setAnimRunning(false);
      return;
    }

    const p1Entry = state.resolveQueue.find((e) => e.player === "P1");
    const aiEntry = state.resolveQueue.find((e) => e.player === "AI");
    const playerCard = p1Entry ? (getCard(p1Entry.cardId) ?? null) : null;
    const aiCard = aiEntry ? (getCard(aiEntry.cardId) ?? null) : null;
    const initiative = state.initiative === "P1" ? "player" : "ai";

    const queue = makeQueue(playerCard, aiCard, initiative, false, false);
    setAnimQueue(queue);
    setAnimRunning(true);
  // resolveQueue 내용이 같아도 phase가 RESOLVING으로 바뀔 때만 재생성
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // GAME_OVER 시 KO 포즈
  useEffect(() => {
    if (state.phase !== "GAME_OVER") return;
    if (state.winner === "AI") {
      setPlayerPose("ko");
      setPlayerPoseKey((k) => k + 1);
    } else if (state.winner === "P1") {
      setAiPose("ko");
      setAiPoseKey((k) => k + 1);
    }
  }, [state.phase, state.winner]);

  const handleAnimEvent = useCallback((event: CombatAnimationEvent) => {
    switch (event.type) {
      case "action_start":
        if (event.actor === "P1") {
          setPlayerPose(actionTagToPose(event.actionTag));
          setPlayerPoseKey((k) => k + 1);
        } else if (event.actor === "AI") {
          setAiPose(actionTagToPose(event.actionTag));
          setAiPoseKey((k) => k + 1);
        }
        break;
      case "visual_hit":
        if (event.target === "P1") {
          setPlayerPose("hit");
          setPlayerPoseKey((k) => k + 1);
        } else if (event.target === "AI") {
          setAiPose("hit");
          setAiPoseKey((k) => k + 1);
        }
        break;
      case "action_end":
        if (event.actor === "P1") {
          setPlayerPose("idle");
          setPlayerPoseKey((k) => k + 1);
        } else if (event.actor === "AI") {
          setAiPose("idle");
          setAiPoseKey((k) => k + 1);
        }
        break;
      case "damage_resolve":
        // HP 반영은 게임 상태(resolveOneStep)가 자동 처리
        break;
    }
  }, []);

  useAnimQueue(animQueue, handleAnimEvent, animRunning);

  const [logOpen, setLogOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const logPopoverRef = useRef<HTMLDivElement>(null);
  const deckPopoverRef = useRef<HTMLDivElement>(null);
  const logBtnRef = useRef<HTMLButtonElement>(null);
  const deckBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!logOpen && !deckOpen) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (logOpen && logPopoverRef.current && !logPopoverRef.current.contains(target) && logBtnRef.current && !logBtnRef.current.contains(target)) {
        setLogOpen(false);
      }
      if (deckOpen && deckPopoverRef.current && !deckPopoverRef.current.contains(target) && deckBtnRef.current && !deckBtnRef.current.contains(target)) {
        setDeckOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [logOpen, deckOpen]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    const curr = state.phase;
    prevPhaseRef.current = curr;

    if (prev === curr) return;

    let msg = "";
    if (curr === "SETUP_INIT") {
      msg = `Turn ${state.turn} 시작`;
    } else if (curr === "RESOLVE") {
      msg = "전투 시작!";
    } else if (curr === "WAITING_DISCARD") {
      msg = "손패 초과 - 카드를 버리세요";
    } else if (curr === "GAME_OVER") {
      if (state.winner === "P1") msg = "승리!";
      else if (state.winner === "AI") msg = "패배";
      else msg = "무승부";
    }

    if (msg) {
      toastKeyRef.current += 1;
      setToastKey(toastKeyRef.current);
      setToastText(msg);
    }
  }, [state.phase, state.turn, state.winner]);

  return (
    <div className={styles.page}>
      {toastText && <ToastMessage key={toastKey} message={toastText} />}

      {state.phase === "WAITING_SELECTION" && state.pendingSelection && (
        <CardSelectionModal
          pendingSelection={state.pendingSelection}
          onConfirm={(selectedCards) =>
            dispatch({ type: "SELECTION/CONFIRM", selectedCards })
          }
          onSkip={() => dispatch({ type: "SELECTION/SKIP" })}
        />
      )}

      {state.phase === "WAITING_DISCARD" && state.pendingDiscard && (
        <DiscardModal
          count={state.pendingDiscard.count}
          candidates={state.pendingDiscard.candidates}
          onConfirm={(discardCards) =>
            dispatch({ type: "DISCARD/CONFIRM", discardCards })
          }
        />
      )}

      <div className={styles.shell}>
        {/* Top row: Player | Game Title | AI */}
        <div className={styles.topRow}>
          <div className={styles.topPanel}>
            <PlayerBar me={state.P1} />
          </div>

          <div className={styles.topCenter}>
            <h1 className={styles.title}>Snap Duel (MVP)</h1>
            <div className={styles.sub}>
              Round {state.round}/3 · Turn {state.turn} · Phase {state.phase} · Initiative{" "}
              {state.initiative}
            </div>
            {isGameOver && (
              <div className={styles.gameOver}>
                Winner: {state.winner === "DRAW" ? "DRAW" : state.winner}
              </div>
            )}
            <div className={styles.popoverBtnRow}>
              <button
                ref={logBtnRef}
                type="button"
                className={`${styles.popoverBtn} ${logOpen ? styles.active : ""}`}
                onClick={() => { setLogOpen((v) => !v); setDeckOpen(false); }}
              >
                📋 로그
              </button>
              <button
                ref={deckBtnRef}
                type="button"
                className={`${styles.popoverBtn} ${deckOpen ? styles.active : ""}`}
                onClick={() => { setDeckOpen((v) => !v); setLogOpen(false); }}
              >
                🃏 덱
              </button>
            </div>
          </div>

          <div className={styles.topPanel}>
            <ArenaHeader ai={state.AI} isThinking={isAiThinking} />
          </div>
        </div>

        {/* Arena stage: fighters face each other */}
        <ArenaStage
          playerPose={playerPose}
          playerPoseKey={playerPoseKey}
          aiPose={aiPose}
          aiPoseKey={aiPoseKey}
        />

        {/* Middle row: P1 Queue | AI Queue */}
        <div className={styles.middleRow}>
          <div className={styles.queuePanel}>
            <QueuePreview title="P1 Queue" me={state.P1} phase={state.phase} recentlyCancelledId={state.recentlyCancelledId} />
          </div>

          <div className={styles.queuePanel}>
            <QueuePreview title="AI Queue" me={state.AI} phase={state.phase} recentlyCancelledId={state.recentlyCancelledId} />
          </div>
        </div>

        {/* Popovers */}
        {logOpen && (
          <div ref={logPopoverRef} className={styles.popover}>
            <div className={styles.popoverHeader}>
              <span className={styles.popoverTitle}>📋 액션 로그</span>
              <button type="button" className={styles.popoverClose} onClick={() => setLogOpen(false)}>✕</button>
            </div>
            <div className={styles.popoverBody}>
              <ActionLog log={state.log} />
            </div>
          </div>
        )}
        {deckOpen && (
          <div ref={deckPopoverRef} className={styles.popover}>
            <div className={styles.popoverHeader}>
              <span className={styles.popoverTitle}>🃏 덱 트레커</span>
              <button type="button" className={styles.popoverClose} onClick={() => setDeckOpen(false)}>✕</button>
            </div>
            <div className={styles.popoverBody}>
              <div className={styles.deckSection}>
                <div className={styles.deckSectionTitle}>내 덱 ({state.P1.deck.length}장)</div>
                <DeckCardRows cards={state.P1.deck} />
              </div>
              <div className={styles.deckSection}>
                <div className={styles.deckSectionTitle}>내 묘지 ({state.P1.trash.length}장)</div>
                <DeckCardRows cards={state.P1.trash} />
              </div>
              <div className={styles.deckSection}>
                <div className={styles.deckSectionTitle}>AI 덱</div>
                <div className={styles.aiDeckCount}>잔여 {state.AI.deck.length}장 (목록 숨김)</div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom: Hand section */}
        <Hand
          me={state.P1}
          selected={state.selected}
          disabled={!canAct}
          onSelectCard={(cardId, handIndex) =>
            dispatch({ type: "CARD/SELECT", cardId, handIndex })
          }
          endTurnButton={
            <EndTurnButton
              label={readyLabel}
              disabled={!isSetup || state.P1.ready || isGameOver}
              onClick={() => dispatch({ type: "PLAYER/READY", player: "P1" })}
            />
          }
        />
      </div>
    </div>
  );
}
