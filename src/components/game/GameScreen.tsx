"use client";

import { useEffect, useRef, useState } from "react";
import type { Action, GameState } from "@/game/engine/types";
import { getBenchChar, isSetupTurnOf } from "@/game/engine/stateHelpers";
import { shuffle } from "@/game/engine/rng";
import { useArenaAnimation } from "@/game/animation/useArenaAnimation";
import { useGameTransitions } from "@/hooks/useGameTransitions";
import styles from "./GameScreen.module.css";
import FightingHPBar from "./FightingHPBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";
import CardSelectionModal from "./CardSelectionModal";
import ToastMessage from "./ToastMessage";
import BattleAnnounce, { type AnnounceStep } from "./BattleAnnounce";
import ArenaStage from "./ArenaStage";
import QueuePreview from "./QueuePreview";
import DiscardModal from "./DiscardModal";
import DraftModal from "./DraftModal";
import DeckCardRows from "./DeckCardRows";




export default function GameScreen({
  state,
  dispatch,
  isAiThinking,
  isTagAnimating = false,
  disableAiDraft = false,
  onExit,
  onRetry,
  topInset = 0,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  isAiThinking: boolean;
  isTagAnimating?: boolean;
  disableAiDraft?: boolean;
  onExit?: () => void;
  /** 제공되면 햄버거 메뉴에 "다시하기" 항목이 노출됨 (튜토리얼 등) */
  onRetry?: () => void;
  /** 상단에 고정 오버레이(예: 튜토리얼 목표 바)가 있을 때 그만큼 콘텐츠를 아래로 밀어내는 여백(px) */
  topInset?: number;
}) {
  const isGameOver = state.phase === "GAME_OVER";
  const isSetup = state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
  // P1(내) 턴인지: SETUP_INIT이면 initiative===P1, SETUP_OTHER면 initiative!==P1
  const isMyTurn = isSetupTurnOf(state, "P1");
  // 중앙 안내 오버레이 (라운드 인트로 / 턴 시작 / 전투 시작). lock=true면 FIGHT!까지 입력 잠금
  const [announce, setAnnounce] = useState<{ key: number; steps: AnnounceStep[]; lock: boolean } | null>(null);
  const announceKeyRef = useRef(0);
  const canAct = isSetup && isMyTurn && !state.P1.ready && !isGameOver && !isTagAnimating && !announce?.lock;
  const hasSelection = !!state.selected;
  const readyLabel = hasSelection ? "Ready" : "Pass";

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
    playerHitShake, aiHitShake,
    playerMove, aiMove,
    zoomScale, bgOffset,
    hitEffectKey, hitEffectTarget, hitEffectStrength,
    superFlashActor,
    displayedHp,
    displayedCancelledPlayer,
    displayedCombo,
    animLog,
  } = useArenaAnimation(state, dispatch);

  const isAnimating = state.phase === "ANIMATING";

  const playerShowTrail = (state.P1.status.speedBonus ?? 0) > 0 || (state.P1.status.speedBonusNext ?? 0) > 0;
  const aiShowTrail = (state.AI.status.speedBonus ?? 0) > 0 || (state.AI.status.speedBonusNext ?? 0) > 0;

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

  // 콤보: ANIMATING 중에는 displayedCombo, 그 외에는 gameState에서 직접
  const effectiveCombo = isAnimating && displayedCombo !== null
    ? displayedCombo
    : { count: state.comboCount, holder: state.initiative };
  const isP1Initiative = effectiveCombo.holder === "P1";
  const isAIInitiative = effectiveCombo.holder === "AI";

  // ROUND_DRAFT: AI 자동 드래프트 (10초 후) — 온라인 모드에서는 비활성화
  useEffect(() => {
    if (disableAiDraft) return;
    if (state.phase !== "ROUND_DRAFT") return;
    if (state.draftSelections.AI !== null) return;

    const t = setTimeout(() => {
      const cardIds = shuffle([...state.AI.deck]).slice(0, 3);
      dispatch({ type: "SUBMIT_DRAFT", player: "AI", cardIds });
    }, 10000);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableAiDraft, state.phase, state.draftSelections.AI]);

  const [logOpen, setLogOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const logPopoverRef = useRef<HTMLDivElement>(null);
  const deckPopoverRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const logBtnRef = useRef<HTMLButtonElement>(null);
  const deckBtnRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // 외부 원인(상대 항복, 게임 종료 등)으로 GAME_OVER가 되면 열린 메뉴/다이얼로그를 닫음
  useEffect(() => {
    if (isGameOver) {
      setMenuOpen(false);
      setConfirmSurrender(false);
    }
  }, [isGameOver]);

  useEffect(() => {
    if (!logOpen && !deckOpen && !menuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (logOpen && logPopoverRef.current && !logPopoverRef.current.contains(target) && logBtnRef.current && !logBtnRef.current.contains(target)) {
        setLogOpen(false);
      }
      if (deckOpen && deckPopoverRef.current && !deckPopoverRef.current.contains(target) && deckBtnRef.current && !deckBtnRef.current.contains(target)) {
        setDeckOpen(false);
      }
      if (menuOpen && menuPanelRef.current && !menuPanelRef.current.contains(target) && menuBtnRef.current && !menuBtnRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [logOpen, deckOpen, menuOpen]);

  // ── 페이즈 전환 → 중앙 안내 오버레이 / 상단 토스트 ─────────────────────────
  useGameTransitions(state, {
    onPhase: (_from, to, s) => {
      const fireAnnounce = (steps: AnnounceStep[], lock: boolean) => {
        announceKeyRef.current += 1;
        setAnnounce({ key: announceKeyRef.current, steps, lock });
      };

      if (to === "SETUP_INIT") {
        if (s.turn === 1) {
          // 라운드 첫 셋업(드래프트 완료 직후) → ROUND N → READY? → FIGHT! (FIGHT!까지 입력 잠금)
          fireAnnounce(
            [
              { text: `ROUND ${s.round}`, variant: "round", ms: 900 },
              { text: "READY?", variant: "ready", ms: 700 },
              { text: "FIGHT!", variant: "fight", ms: 700 },
            ],
            true,
          );
        } else {
          // 일반 턴 시작 → TURN N (잠금 없음)
          fireAnnounce([{ text: `TURN ${s.turn}`, variant: "turn", ms: 800 }], false);
        }
        return;
      }

      if (to === "RESOLVE") {
        fireAnnounce([{ text: "전투 시작", variant: "clash", ms: 650 }], false);
        return;
      }

      // 나머지는 기존 상단 토스트 유지
      let msg = "";
      if (to === "WAITING_DISCARD") {
        msg = "손패 초과 - 카드를 버리세요";
      } else if (to === "GAME_OVER") {
        if (s.winner === "P1") msg = "승리!";
        else if (s.winner === "AI") msg = "패배";
        else msg = "무승부";
      }

      if (msg) {
        toastKeyRef.current += 1;
        setToastKey(toastKeyRef.current);
        setToastText(msg);
      }
    },
  });

  return (
    <div className={styles.page}>
      {toastText && <ToastMessage key={toastKey} message={toastText} />}

      {announce && (
        <BattleAnnounce key={announce.key} steps={announce.steps} onDone={() => setAnnounce(null)} />
      )}

      {state.phase === "ROUND_DRAFT" && (
        <DraftModal state={state} dispatch={dispatch} />
      )}

      {state.phase === "WAITING_COST_PAYMENT" && state.pendingCostPayment && (
        <CardSelectionModal
          pendingSelection={{
            selectingPlayer: "P1",
            candidates: state.pendingCostPayment.candidates,
            count: state.pendingCostPayment.count,
            fromZone: state.pendingCostPayment.fromZone,
            fromPlayerId: state.pendingCostPayment.fromPlayerId,
            toZone: state.pendingCostPayment.toZone,
            toPlayerId: state.pendingCostPayment.toPlayerId,
            toPosition: state.pendingCostPayment.toPosition,
            sourcePlayer: "P1",
            sourceCardId: state.pendingCostPayment.cardId,
            resolveItems: [],
            resolveNextIndex: 0,
            unresolvedPlayers: [],
          }}
          onConfirm={(selectedCards) =>
            dispatch({ type: "COST/CONFIRM", selectedCards })
          }
          onSkip={() => dispatch({ type: "COST/CANCEL" })}
          isCostPayment
        />
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

      {menuOpen && menuPos && (
        <div
          ref={menuPanelRef}
          className={styles.menuPanel}
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {onRetry && (
            <button
              type="button"
              className={styles.menuPanelBtn}
              onClick={() => { setMenuOpen(false); onRetry(); }}
            >
              다시하기
            </button>
          )}
          <button
            type="button"
            className={`${styles.menuPanelBtn} ${styles.menuPanelBtnDanger}`}
            onClick={() => { setMenuOpen(false); setConfirmSurrender(true); }}
          >
            항복
          </button>
        </div>
      )}

      {confirmSurrender && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <div className={styles.confirmTitle}>항복하시겠습니까?</div>
            <div className={styles.confirmDesc}>항복하면 즉시 패배로 처리됩니다.</div>
            <div className={styles.confirmBtns}>
              <button
                type="button"
                className={styles.confirmBtnCancel}
                onClick={() => setConfirmSurrender(false)}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.confirmBtnSurrender}
                onClick={() => {
                  setConfirmSurrender(false);
                  dispatch({ type: "SURRENDER", player: "P1" });
                }}
              >
                항복
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={styles.shell}
        style={topInset ? { paddingTop: `calc(6px + ${topInset}px)` } : undefined}
      >
        {/* AI 패널: 좌측 게임 정보 + 우측 HP 바 */}
        <div className={styles.aiPanel}>
          <div className={styles.gameInfoArea}>
            <button
              ref={menuBtnRef}
              type="button"
              className={`${styles.menuBtn} ${menuOpen ? styles.active : ""}`}
              aria-label="메뉴"
              disabled={isGameOver}
              onClick={() => {
                if (!menuOpen && menuBtnRef.current) {
                  const rect = menuBtnRef.current.getBoundingClientRect();
                  setMenuPos({ top: rect.bottom + 4, left: rect.left });
                }
                setMenuOpen((v) => !v);
              }}
            >☰</button>
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
            <FightingHPBar combatant={state.AI} side="right" label="AI" isThinking={isAiThinking} overrideCharacterHp={aiDisplayCharHp} combo={effectiveCombo.count} isInitiative={isAIInitiative} />
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
                isMyTurn={isSetupTurnOf(state, "P1")}
                isInitiative={isP1Initiative}
              />
            </div>
            <div className={styles.queuePanel}>
              <QueuePreview
                title="AI Queue"
                me={state.AI}
                phase={state.phase}
                recentlyCancelledPlayer={effectiveCancelledPlayer}
                isMyTurn={isSetupTurnOf(state, "AI")}
                isInitiative={isAIInitiative}
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
            playerHitShakeKey={playerHitShake.key}
            playerHitShakeMs={playerHitShake.ms}
            aiHitShakeKey={aiHitShake.key}
            aiHitShakeMs={aiHitShake.ms}
            playerOffset={playerMove.x}
            aiOffset={aiMove.x}
            playerMotion={playerMove.motion}
            aiMotion={aiMove.motion}
            zoomScale={zoomScale}
            bgOffset={bgOffset}
            hitEffectKey={hitEffectKey}
            hitEffectTarget={hitEffectTarget}
            hitEffectStrength={hitEffectStrength}
            superFlashActor={superFlashActor}
            playerShowTrail={playerShowTrail}
            aiShowTrail={aiShowTrail}
          />
          </div>
        </div>

        {/* P1 패널: 좌측 HP 바 + 우측 액션 버튼 */}
        <div className={styles.p1Panel}>
          <div className={styles.hpWrap}>
            <FightingHPBar combatant={state.P1} side="left" label="YOU" overrideCharacterHp={p1DisplayCharHp} combo={effectiveCombo.count} isInitiative={isP1Initiative} />
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
            gameState={state}
            playerId="P1"
            onSelectCard={(cardId, handIndex) =>
              dispatch({ type: "CARD/SELECT", cardId, handIndex })
            }
            onCycleHand={() => dispatch({ type: "HAND/CYCLE" })}
            endTurnButton={
              <EndTurnButton
                label={readyLabel}
                disabled={!canAct}
                onClick={() => dispatch({ type: "PLAYER/READY", player: "P1" })}
                variant={hasSelection ? "primary" : "default"}
              />
            }
            tagButton={
              <EndTurnButton
                label="Tag"
                disabled={
                  !canAct ||
                  isTagAnimating ||
                  state.p1TaggedThisTurn ||
                  state.P1.airborneStack >= 2 ||
                  state.P1.characterHp[getBenchChar(state.P1)] <= 0
                }
                onClick={() => dispatch({ type: "TURN/TAG" })}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
