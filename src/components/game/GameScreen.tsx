"use client";

import { useEffect, useRef, useState } from "react";
import type { Action, GameState } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import { useArenaAnimation } from "@/game/animation/useArenaAnimation";
import styles from "./GameScreen.module.css";
import FightingHPBar from "./FightingHPBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";
import CardSelectionModal from "./CardSelectionModal";
import ToastMessage from "./ToastMessage";
import ArenaStage, { type HitSide } from "./ArenaStage";
import QueuePreview, { effectLabel } from "./QueuePreview";
import DiscardModal from "./DiscardModal";
import DraftModal from "./DraftModal";

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
  isTagAnimating = false,
  disableAiDraft = false,
  onExit,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  isAiThinking: boolean;
  isTagAnimating?: boolean;
  disableAiDraft?: boolean;
  onExit?: () => void;
}) {
  const isGameOver = state.phase === "GAME_OVER";
  const isSetup = state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
  // P1(내) 턴인지: SETUP_INIT이면 initiative===P1, SETUP_OTHER면 initiative!==P1
  const isMyTurn =
    (state.phase === "SETUP_INIT" && state.initiative === "P1") ||
    (state.phase === "SETUP_OTHER" && state.initiative !== "P1");
  const canAct = isSetup && isMyTurn && !state.P1.ready && !isGameOver && !isTagAnimating;
  const hasSelection = !!state.selected;
  const readyLabel = hasSelection ? "Ready" : "Pass";

  const prevPhaseRef = useRef(state.phase);
  const toastKeyRef = useRef(0);
  const [toastKey, setToastKey] = useState(0);
  const [toastText, setToastText] = useState("");

  // ── 아레나 애니메이션 (포즈·히트스톱·흔들림·태그 전환·ANIM/DONE) ──────────────
  const {
    playerPose, playerPoseKey, playerCharacter,
    aiPose, aiPoseKey, aiCharacter,
    shakeLevel,
    playerFrozenUntil, aiFrozenUntil,
    playerFlashKey, aiFlashKey,
    playerKnockbackKey, aiKnockbackKey,
    zoomKey, bgOffset,
    hitEffectKey, hitEffectTarget, hitEffectStrength,
    superFlashActor,
    displayedHp,
    displayedCancelledPlayer,
    animLog,
  } = useArenaAnimation(state, dispatch);

  const isAnimating = state.phase === "ANIMATING";

  // ANIMATING 중에는 displayedHp로 HP바 표시 (damage_resolve 타이밍까지 이전 HP 유지)
  const p1DisplayCharHp =
    isAnimating && displayedHp !== null
      ? { ...state.P1.characterHp, [state.P1.activeCharacter]: displayedHp.P1 }
      : undefined;
  const aiDisplayCharHp =
    isAnimating && displayedHp !== null
      ? { ...state.AI.characterHp, [state.AI.activeCharacter]: displayedHp.AI }
      : undefined;

  // ANIMATING 중에는 displayedCancelledPlayer로 캔슬 표시 타이밍 제어
  const effectiveCancelledPlayer = isAnimating
    ? displayedCancelledPlayer
    : state.recentlyCancelledPlayer;

  // ROUND_DRAFT: AI 자동 드래프트 (10초 후) — 온라인 모드에서는 비활성화
  useEffect(() => {
    if (disableAiDraft) return;
    if (state.phase !== "ROUND_DRAFT") return;
    if (state.draftSelections.AI !== null) return;

    const t = setTimeout(() => {
      const deck = state.AI.deck;
      const count = Math.min(3, deck.length);
      const indices = [...Array(deck.length).keys()];
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const cardIds = indices.slice(0, count).map((i) => deck[i]);
      dispatch({ type: "SUBMIT_DRAFT", player: "AI", cardIds });
    }, 10000);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableAiDraft, state.phase, state.draftSelections.AI]);

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

      {state.phase === "ROUND_DRAFT" && (
        <DraftModal state={state} dispatch={dispatch} />
      )}

      {state.phase === "WAITING_SELECTION" && state.pendingSelection && state.pendingSelection.selectingPlayer === "P1" && (
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

      {isGameOver && onExit && (
        <div className={styles.gameOverOverlay}>
          <div className={styles.gameOverBox}>
            <div className={styles.gameOverResult}>
              {state.winner === "P1" ? "WIN" : state.winner === "AI" ? "LOSE" : "DRAW"}
            </div>
            <button
              type="button"
              className={styles.gameOverMenuBtn}
              onClick={() => {
                const log = {
                  winner: state.winner,
                  turns: state.turnLog,
                };
                const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `snap-duel-log-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              로그 저장
            </button>
            <button type="button" className={styles.gameOverMenuBtn} onClick={onExit}>
              메인 메뉴
            </button>
          </div>
        </div>
      )}

      <div className={styles.shell}>
        {/* AI 패널: 좌측 게임 정보 + 우측 HP 바 */}
        <div className={styles.aiPanel}>
          <div className={styles.gameInfoArea}>
            <button type="button" className={styles.menuBtn} aria-label="메뉴">☰</button>
            <div className={styles.gameInfo}>
              <span className={styles.gameInfoLine}>R{state.round}/3 · T{state.turn}</span>
              {isGameOver && (
                <span className={styles.gameInfoWinner}>
                  {state.winner === "DRAW" ? "DRAW" : state.winner === "P1" ? "WIN" : "LOSE"}
                </span>
              )}
            </div>
          </div>
          <div className={styles.hpWrap}>
            <FightingHPBar combatant={state.AI} side="right" label="AI" isThinking={isAiThinking} overrideCharacterHp={aiDisplayCharHp} />
          </div>
        </div>

        {/* 큐 + 아레나 묶음 */}
        <div className={styles.arenaBlock}>
          <div className={styles.middleRow}>
            <div className={styles.queuePanel}>
              <QueuePreview
                title="P1 Queue"
                me={state.P1}
                phase={state.phase}
                recentlyCancelledPlayer={effectiveCancelledPlayer}
                isMyTurn={
                  (state.phase === "SETUP_INIT" && state.initiative === "P1") ||
                  (state.phase === "SETUP_OTHER" && state.initiative !== "P1")
                }
              />
            </div>
            <div className={styles.queuePanel}>
              <QueuePreview
                title="AI Queue"
                me={state.AI}
                phase={state.phase}
                recentlyCancelledPlayer={effectiveCancelledPlayer}
                isMyTurn={
                  (state.phase === "SETUP_INIT" && state.initiative === "AI") ||
                  (state.phase === "SETUP_OTHER" && state.initiative !== "AI")
                }
              />
            </div>
          </div>

          {/* 아레나 */}
          <div className={styles.arenaWrap}>
            <ArenaStage
            playerPose={playerPose}
            playerPoseKey={playerPoseKey}
            playerCharacter={playerCharacter}
            aiPose={aiPose}
            aiPoseKey={aiPoseKey}
            aiCharacter={aiCharacter}
            shakeLevel={shakeLevel}
            playerFrozenUntil={playerFrozenUntil}
            aiFrozenUntil={aiFrozenUntil}
            playerFlashKey={playerFlashKey}
            aiFlashKey={aiFlashKey}
            playerKnockbackKey={playerKnockbackKey}
            aiKnockbackKey={aiKnockbackKey}
            zoomKey={zoomKey}
            bgOffset={bgOffset}
            hitEffectKey={hitEffectKey}
            hitEffectTarget={hitEffectTarget}
            hitEffectStrength={hitEffectStrength}
            superFlashActor={superFlashActor}
          />
          </div>
        </div>

        {/* P1 패널: 좌측 HP 바 + 우측 액션 버튼 */}
        <div className={styles.p1Panel}>
          <div className={styles.hpWrap}>
            <FightingHPBar combatant={state.P1} side="left" label="YOU" overrideCharacterHp={p1DisplayCharHp} />
          </div>
          <div className={styles.actionArea}>
            <button
              ref={logBtnRef}
              type="button"
              className={`${styles.actionBtn} ${logOpen ? styles.active : ""}`}
              onClick={() => { setLogOpen((v) => !v); setDeckOpen(false); }}
            >📋</button>
            <button
              ref={deckBtnRef}
              type="button"
              className={`${styles.actionBtn} ${deckOpen ? styles.active : ""}`}
              onClick={() => { setDeckOpen((v) => !v); setLogOpen(false); }}
            >🃏</button>
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

        {/* Hand */}
        <div className={styles.handWrap}>
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
                  disabled={!canAct}
                  onClick={() => dispatch({ type: "PLAYER/READY", player: "P1" })}
                />
                <EndTurnButton
                  label="Tag"
                  disabled={
                    !canAct ||
                    isTagAnimating ||
                    state.p1TaggedThisTurn ||
                    state.P1.characterHp[state.P1.activeCharacter === "A" ? "B" : "A"] <= 0
                  }
                  onClick={() => dispatch({ type: "TURN/TAG" })}
                />
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
