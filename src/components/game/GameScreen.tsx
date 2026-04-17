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
import ArenaStage, { type ShakeLevel, type HitSide } from "./ArenaStage";

function actionTagToPose(tag?: ActionTag): FighterPose | null {
  switch (tag) {
    case "slash":     return "attack_slash";
    case "strike":    return "attack_strike";
    case "magic":     return "attack_magic";
    case "block":     return "block";
    case "launch":    return "attack_strike";
    case "anti_air":  return "attack_slash";
    case "aerial":    return "airborne";
    case "week_punch":   return "attack_week_punch";
    case "strong_punch": return "attack_strong_punch";
    case "week_kick":    return "attack_week_kick";
    case "strong_kick":  return "attack_strong_kick";
    case "dragon_kick":  return "attack_dragon_kick";
    case "rising_punch": return "attack_rising_punch";
    case "hadouken":     return "attack_hadouken";
    case "use_item":     return "use_item";

    default:          return null;
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
  recentlyCancelledPlayer,
}: {
  title: string;
  me: Combatant;
  phase: string;
  recentlyCancelledPlayer: "P1" | "AI" | null;
}) {
  const queuedId = me.queue[0];
  const card = queuedId ? getCard(queuedId) : null;

  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    if (recentlyCancelledPlayer === me.id) {
      setShowCancel(true);
      const timer = setTimeout(() => setShowCancel(false), 850);
      return () => clearTimeout(timer);
    }
  }, [recentlyCancelledPlayer, me.id]);

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
  const [shakeLevel, setShakeLevel] = useState<ShakeLevel>("none");

  const prevP1HpRef = useRef(state.P1.hp);
  const prevAiHpRef = useRef(state.AI.hp);

  const [animQueue, setAnimQueue] = useState<CombatAnimationEvent[]>([]);
  const [animRunning, setAnimRunning] = useState(false);
  const [animLog, setAnimLog] = useState<string[]>([]);
  // RESOLVING 중 캔슬된 플레이어 추적 (action_start 스킵용)
  const cancelledActorRef = useRef<"P1" | "AI" | null>(null);

  useEffect(() => {
    if (state.phase !== "RESOLVING") {
      cancelledActorRef.current = null;
      return;
    }
    cancelledActorRef.current = state.recentlyCancelledPlayer ?? null;
    if (state.recentlyCancelledPlayer && state.recentlyCancelledId) {
      const cardDef = getCard(state.recentlyCancelledId);
      setAnimLog((prev) => [
        ...prev,
        `cancel: ${state.recentlyCancelledPlayer} [${cardDef?.name ?? state.recentlyCancelledId}]`,
      ]);
    }
  }, [state.phase, state.recentlyCancelledPlayer, state.recentlyCancelledId]);

  // RESOLVING 진입 시 이벤트 큐 생성
  useEffect(() => {
    if (state.phase !== "RESOLVING") {
      setAnimRunning(false);
      return;
    }

    // WAITING_SELECTION 복귀 시 이미 처리된 카드를 재생하지 않도록 resolveIndex부터 탐색
    const remainingQueue = state.resolveQueue.slice(state.resolveIndex);
    const p1Entry = remainingQueue.find((e) => e.player === "P1");
    const aiEntry = remainingQueue.find((e) => e.player === "AI");
    const playerCard = p1Entry ? (getCard(p1Entry.cardId) ?? null) : null;
    const aiCard = aiEntry ? (getCard(aiEntry.cardId) ?? null) : null;

    // resolveQueue 순서(speed 기준)로 선공자 결정 — state.initiative는 동속도 타이브레이커일 뿐
    let animInitiative: "player" | "ai" | "tie";
    if (p1Entry && aiEntry) {
      const p1Idx = remainingQueue.indexOf(p1Entry);
      const aiIdx = remainingQueue.indexOf(aiEntry);
      animInitiative = p1Idx < aiIdx ? "player" : "ai";
    } else {
      animInitiative = state.initiative === "P1" ? "player" : "ai";
    }

    const queue = makeQueue(playerCard, aiCard, animInitiative, false, false);
    setAnimQueue(queue);
    setAnimRunning(true);
    setAnimLog([]);
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

  // 라운드 시작 시 양쪽 idle 리셋
  useEffect(() => {
    if (state.phase !== "TURN_START") return;
    setPlayerPose("idle");
    setPlayerPoseKey((k) => k + 1);
    setAiPose("idle");
    setAiPoseKey((k) => k + 1);
  }, [state.phase]);

  // HP 변화 감지 → 화면 흔들림
  useEffect(() => {
    const p1Dmg = prevP1HpRef.current - state.P1.hp;
    const aiDmg = prevAiHpRef.current - state.AI.hp;
    prevP1HpRef.current = state.P1.hp;
    prevAiHpRef.current = state.AI.hp;
    const maxDmg = Math.max(p1Dmg, aiDmg);
    if (maxDmg <= 0) return;
    const level: ShakeLevel = maxDmg <= 5 ? "light" : "heavy";
    setShakeLevel(level);
    const timer = setTimeout(() => setShakeLevel("none"), 300);
    return () => clearTimeout(timer);
  }, [state.P1.hp, state.AI.hp]);

  const handleAnimEvent = useCallback((event: CombatAnimationEvent) => {
    switch (event.type) {
      case "action_start":
        // 캔슬된 플레이어의 action_start는 스킵
        if (cancelledActorRef.current === event.actor) break;
        if (event.actor === "P1") {
          const pose = actionTagToPose(event.actionTag);
          if (pose) { setPlayerPose(pose); setPlayerPoseKey((k) => k + 1); }
        } else if (event.actor === "AI") {
          const pose = actionTagToPose(event.actionTag);
          if (pose) { setAiPose(pose); setAiPoseKey((k) => k + 1); }
        }
        setAnimLog((prev) => [
          ...prev,
          `action_start: ${event.actor ?? "?"}${event.actionTag ? ` [${event.actionTag}]` : ""}`,
        ]);
        break;
      case "visual_hit":
        if (event.target === "P1") {
          setPlayerPose("hit");
          setPlayerPoseKey((k) => k + 1);
        } else if (event.target === "AI") {
          setAiPose("hit");
          setAiPoseKey((k) => k + 1);
        }
        setAnimLog((prev) => [...prev, `visual_hit: ${event.target ?? "?"} hit`]);
        break;
      case "action_end":
        // hold last pose — idle reset happens on TURN_START
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
          shakeLevel={shakeLevel}
        />

        {/* Middle row: P1 Queue | AI Queue */}
        <div className={styles.middleRow}>
          <div className={styles.queuePanel}>
            <QueuePreview title="P1 Queue" me={state.P1} phase={state.phase} recentlyCancelledPlayer={state.recentlyCancelledPlayer} />
          </div>

          <div className={styles.queuePanel}>
            <QueuePreview title="AI Queue" me={state.AI} phase={state.phase} recentlyCancelledPlayer={state.recentlyCancelledPlayer} />
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
              <ActionLog log={state.log} animEntries={animLog} />
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
            <>
              <EndTurnButton
                label={readyLabel}
                disabled={!isSetup || state.P1.ready || isGameOver}
                onClick={() => dispatch({ type: "PLAYER/READY", player: "P1" })}
              />
              <EndTurnButton
                label="Tag"
                disabled={
                  !isSetup ||
                  state.P1.ready ||
                  isGameOver ||
                  state.P1.characterHp[state.P1.activeCharacter === "A" ? "B" : "A"] <= 0
                }
                onClick={() => dispatch({ type: "TURN/TAG" })}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
