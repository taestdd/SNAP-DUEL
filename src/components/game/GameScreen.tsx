"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Action,
  ActionTag,
  CharacterId,
  CombatAnimationEvent,
  FighterPose,
  GameState,
} from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import { makeQueueFromScript } from "@/game/animation/makeQueue";
import { useAnimQueue } from "@/game/animation/useAnimQueue";
import styles from "./GameScreen.module.css";
import FightingHPBar from "./FightingHPBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";
import CardSelectionModal from "./CardSelectionModal";
import ToastMessage from "./ToastMessage";
import ArenaStage, { type ShakeLevel, type HitSide } from "./ArenaStage";
import QueuePreview, { effectLabel } from "./QueuePreview";
import DiscardModal from "./DiscardModal";
import DraftModal from "./DraftModal";

function actionTagToPose(tag?: ActionTag): FighterPose | null {
  switch (tag) {
    case "block":     return "block";
    case "aerial_punch": return "attack_aerial_punch";
    case "aerial_kick":  return "attack_aerial_kick";
    case "weak_punch":   return "attack_weak_punch";
    case "strong_punch": return "attack_strong_punch";
    case "weak_kick":    return "attack_weak_kick";
    case "strong_kick":  return "attack_strong_kick";
    case "dragon_kick":  return "attack_dragon_kick";
    case "rising_punch": return "attack_rising_punch";
    case "hadouken":     return "attack_hadouken";
    case "use_item":     return "use_item";

    default:          return null;
  }
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

  // ── 파이터 포즈 상태 ──────────────────────────────────────────
  const [playerPose, setPlayerPose] = useState<FighterPose>("idle");
  const [playerPoseKey, setPlayerPoseKey] = useState<number>(0);
  const [aiPose, setAiPose] = useState<FighterPose>("idle");
  const [aiPoseKey, setAiPoseKey] = useState<number>(0);
  const [shakeLevel, setShakeLevel] = useState<ShakeLevel>("none");
  const [playerFrozenUntil, setPlayerFrozenUntil] = useState(0);
  const [aiFrozenUntil, setAiFrozenUntil] = useState(0);
  const [playerFlashKey, setPlayerFlashKey] = useState(0);
  const [aiFlashKey, setAiFlashKey] = useState(0);
  const [playerKnockbackKey, setPlayerKnockbackKey] = useState(0);
  const [aiKnockbackKey, setAiKnockbackKey] = useState(0);
  const [zoomKey, setZoomKey] = useState(0);
  const [bgOffset, setBgOffset] = useState(0);
  const [hitEffectKey, setHitEffectKey] = useState(0);
  const [hitEffectTarget, setHitEffectTarget] = useState<"P1" | "AI" | null>(null);
  const [hitEffectStrength, setHitEffectStrength] = useState<"weak" | "strong">("weak");

  // 태그 애니메이션: 실제 표시 캐릭터 (exit 재생 후 전환)
  const [displayedP1Char, setDisplayedP1Char] = useState<CharacterId>(state.P1.activeCharacter);
  const [displayedAIChar, setDisplayedAIChar] = useState<CharacterId>(state.AI.activeCharacter);
  const prevP1CharRef2 = useRef<CharacterId>(state.P1.activeCharacter);
  const prevAICharRef2 = useRef<CharacterId>(state.AI.activeCharacter);

  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P1 캐릭터 교체 감지 → exit 애니 → displayedP1Char 전환 → entry 애니
  useEffect(() => {
    if (state.P1.activeCharacter === prevP1CharRef2.current) return;
    const newChar = state.P1.activeCharacter;
    prevP1CharRef2.current = newChar;

    setPlayerPose("tag_exit");
    setPlayerPoseKey((k) => k + 1);
    const t = setTimeout(() => {
      setDisplayedP1Char(newChar);
      setPlayerPose("tag_entry");
      setPlayerPoseKey((k) => k + 1);
    }, 350);
    return () => clearTimeout(t);
  }, [state.P1.activeCharacter]);

  // AI 캐릭터 교체 감지 → exit 애니 → displayedAIChar 전환 → entry 애니
  useEffect(() => {
    if (state.AI.activeCharacter === prevAICharRef2.current) return;
    const newChar = state.AI.activeCharacter;
    prevAICharRef2.current = newChar;

    setAiPose("tag_exit");
    setAiPoseKey((k) => k + 1);
    const t = setTimeout(() => {
      setDisplayedAIChar(newChar);
      setAiPose("tag_entry");
      setAiPoseKey((k) => k + 1);
    }, 350);
    return () => clearTimeout(t);
  }, [state.AI.activeCharacter]);

  const [animQueue, setAnimQueue] = useState<CombatAnimationEvent[]>([]);
  const [animRunning, setAnimRunning] = useState(false);
  const [animLog, setAnimLog] = useState<string[]>([]);
  // dispatch 레퍼런스 (ANIM/DONE 타이머에서 안정적으로 참조)
  const dispatchRef = useRef(dispatch);
  useEffect(() => { dispatchRef.current = dispatch; });

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

  // ANIMATING 진입 시 animScript로 이벤트 큐 생성 및 완료 타이머 설정
  useEffect(() => {
    if (state.phase !== "ANIMATING") {
      setAnimRunning(false);
      return;
    }

    const queue = makeQueueFromScript(state.animScript);
    setAnimQueue(queue);
    setAnimRunning(true);
    setAnimLog([]);

    const maxDelay = queue.reduce((m, e) => Math.max(m, e.delay), 0);
    const t = setTimeout(() => dispatchRef.current({ type: "ANIM/DONE" }), maxDelay + 150);
    return () => clearTimeout(t);
  // animScript는 ANIMATING 진입 시 한 번만 설정되므로 phase만 의존
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

  // 라운드 전환 시 양쪽 idle 리셋 (턴 시작마다 리셋하지 않음)
  const prevRoundRef = useRef(state.round);
  useEffect(() => {
    if (state.round === prevRoundRef.current) return;
    prevRoundRef.current = state.round;
    setPlayerPose("idle");
    setPlayerPoseKey((k) => k + 1);
    setAiPose("idle");
    setAiPoseKey((k) => k + 1);
  }, [state.round]);


  const handleAnimEvent = useCallback((event: CombatAnimationEvent) => {
    switch (event.type) {
      case "action_start":
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
      case "visual_hit": {
        const pose = event.hitPose ?? "hit_weak";
        const freezeMs = pose === "hit_strong" ? 300 : pose === "hit_aerial" ? 220 : 150;
        const frozenUntil = Date.now() + freezeMs;
        setPlayerFrozenUntil(frozenUntil);
        setAiFrozenUntil(frozenUntil);

        // 흔들림은 히트스톱보다 짧게 — 흔들림 종료 후 파이터 재개
        const shakeLevel: ShakeLevel = pose === "hit_strong" ? "heavy" : "light";
        const shakeDuration = pose === "hit_strong" ? 220 : pose === "hit_aerial" ? 160 : 100;
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
        setShakeLevel(shakeLevel);
        shakeTimerRef.current = setTimeout(() => setShakeLevel("none"), shakeDuration);
        setZoomKey((k) => k + 1);
        setHitEffectTarget(event.target ?? null);
        setHitEffectStrength(pose === "hit_strong" ? "strong" : "weak");
        setHitEffectKey((k) => k + 1);
        if (event.target === "P1") {
          setBgOffset((o) => o + 40);
          setPlayerPose(pose);
          setPlayerPoseKey((k) => k + 1);
          setPlayerFlashKey((k) => k + 1);
          setPlayerKnockbackKey((k) => k + 1);
        } else if (event.target === "AI") {
          setBgOffset((o) => o - 40);
          setAiPose(pose);
          setAiPoseKey((k) => k + 1);
          setAiFlashKey((k) => k + 1);
          setAiKnockbackKey((k) => k + 1);
        }
        setAnimLog((prev) => [...prev, `visual_hit: ${event.target ?? "?"} [${pose}]`]);
        break;
      }
      case "action_end":
        // hold last pose — idle reset happens on TURN_END / TURN_START
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
            <FightingHPBar combatant={state.AI} side="right" label="AI" isThinking={isAiThinking} />
          </div>
        </div>

        {/* 아레나 */}
        <div className={styles.arenaWrap}>
          <ArenaStage
            playerPose={playerPose}
            playerPoseKey={playerPoseKey}
            playerCharacter={displayedP1Char}
            aiPose={aiPose}
            aiPoseKey={aiPoseKey}
            aiCharacter={displayedAIChar}
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
          />
        </div>

        {/* P1 패널: 좌측 HP 바 + 우측 액션 버튼 */}
        <div className={styles.p1Panel}>
          <div className={styles.hpWrap}>
            <FightingHPBar combatant={state.P1} side="left" label="YOU" />
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

        {/* 큐 패널 */}
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
