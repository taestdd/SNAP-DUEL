"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Action,
  ActionTag,
  CharacterId,
  CombatAnimationEvent,
  FighterPose,
  GameState,
  PlayerId,
} from "@/game/engine/types";
import { ACTION_TAG_TO_POSE } from "@/game/engine/types";
import type { ShakeLevel } from "@/components/game/ArenaStage";
import { makeQueueFromScript, SUPER_FLASH_DUR, HIT_FREEZE_PRESET } from "./makeQueue";
import { useAnimQueue } from "./useAnimQueue";

// ── 타이밍 상수 ────────────────────────────────────────────────────────────────

const TAG_TRANSITION_MS = 350;
const ANIM_DONE_BUFFER_MS = 150;
/** 착지 포즈 유지 시간 (ms) — 이후 idle 복귀 */
const LAND_MS = 380;

/** event.freezeMs 미지정 시 폴백 (정상 경로에서는 makeQueue가 항상 채움) */
function freezeOf(event: CombatAnimationEvent): number {
  return event.freezeMs ?? HIT_FREEZE_PRESET[event.hitPose ?? "hit_weak"] ?? 150;
}

/** 히트 포즈별 화면 흔들림 지속 시간 (ms) */
const SHAKE_DURATION_MS: Record<string, number> = {
  hit_strong: 220,
  hit_aerial: 160,
  hit_weak:   100,
};

// ── 유틸 ────────────────────────────────────────────────────────────────────────

function actionTagToPose(tag?: ActionTag): FighterPose | null {
  if (!tag) return null;
  return ACTION_TAG_TO_POSE[tag] ?? null;
}

// ── 훅 반환 타입 ────────────────────────────────────────────────────────────────

export type ArenaAnimState = {
  playerPose: FighterPose;
  playerPoseKey: number;
  playerCharacter: CharacterId;
  aiPose: FighterPose;
  aiPoseKey: number;
  aiCharacter: CharacterId;
  shakeLevel: ShakeLevel;
  playerFrozenUntil: number;
  aiFrozenUntil: number;
  playerFlashKey: number;
  aiFlashKey: number;
  playerKnockbackKey: number;
  aiKnockbackKey: number;
  /** 줌 배율 (1 = 기본). 히트 임팩트 윈도우 동안 확대 후 복귀 */
  zoomScale: number;
  bgOffset: number;
  hitEffectKey: number;
  hitEffectTarget: "P1" | "AI" | null;
  hitEffectStrength: "weak" | "strong";
  superFlashActor: "P1" | "AI" | null;
  /** ANIMATING 중 UI에 표시할 HP (damage_resolve 이벤트 타이밍에 갱신). null이면 gameState HP 그대로. */
  displayedHp: { P1: number; AI: number } | null;
  /** ANIMATING 중 UI에 표시할 캔슬 플레이어 (damage_resolve 이벤트 타이밍에 갱신). null이면 gameState 값 그대로. */
  displayedCancelledPlayer: "P1" | "AI" | null;
  /** ANIMATING 중 UI에 표시할 콤보 (damage_resolve 이벤트 타이밍에 갱신). null이면 gameState 값 그대로. */
  displayedCombo: { count: number; holder: PlayerId } | null;
  animLog: string[];
};

// ── 훅 ─────────────────────────────────────────────────────────────────────────

export function useArenaAnimation(
  state: GameState,
  dispatch: React.Dispatch<Action>,
): ArenaAnimState {
  // 포즈
  const [playerPose, setPlayerPose] = useState<FighterPose>("idle");
  const [playerPoseKey, setPlayerPoseKey] = useState(0);
  const [aiPose, setAiPose] = useState<FighterPose>("idle");
  const [aiPoseKey, setAiPoseKey] = useState(0);

  // 히트스톱 / 흔들림
  const [shakeLevel, setShakeLevel] = useState<ShakeLevel>("none");
  const [playerFrozenUntil, setPlayerFrozenUntil] = useState(0);
  const [aiFrozenUntil, setAiFrozenUntil] = useState(0);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 시각 효과 키
  const [playerFlashKey, setPlayerFlashKey] = useState(0);
  const [aiFlashKey, setAiFlashKey] = useState(0);
  const [playerKnockbackKey, setPlayerKnockbackKey] = useState(0);
  const [aiKnockbackKey, setAiKnockbackKey] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bgOffset, setBgOffset] = useState(0);
  const [hitEffectKey, setHitEffectKey] = useState(0);
  const [hitEffectTarget, setHitEffectTarget] = useState<"P1" | "AI" | null>(null);
  const [hitEffectStrength, setHitEffectStrength] = useState<"weak" | "strong">("weak");
  const [superFlashActor, setSuperFlashActor] = useState<"P1" | "AI" | null>(null);
  const superFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 애니메이션 중 표시용 HP / 캔슬 플레이어 / 콤보 (damage_resolve 이벤트 타이밍에 갱신)
  const [displayedHp, setDisplayedHp] = useState<{ P1: number; AI: number } | null>(null);
  const [displayedCancelledPlayer, setDisplayedCancelledPlayer] = useState<"P1" | "AI" | null>(null);
  const [displayedCombo, setDisplayedCombo] = useState<{ count: number; holder: PlayerId } | null>(null);

  // 태그 애니메이션: exit 재생 후 스프라이트 전환
  const [displayedP1Char, setDisplayedP1Char] = useState<CharacterId>(state.P1.activeCharacter);
  const [displayedAIChar, setDisplayedAIChar] = useState<CharacterId>(state.AI.activeCharacter);
  const prevP1CharRef = useRef<CharacterId>(state.P1.activeCharacter);
  const prevAICharRef = useRef<CharacterId>(state.AI.activeCharacter);

  // 애니메이션 큐
  const [animQueue, setAnimQueue] = useState<CombatAnimationEvent[]>([]);
  const [animRunning, setAnimRunning] = useState(false);
  const [animLog, setAnimLog] = useState<string[]>([]);

  // dispatch 레퍼런스 (타이머 클로저에서 안정적으로 사용)
  const dispatchRef = useRef(dispatch);
  useEffect(() => { dispatchRef.current = dispatch; });

  // ── 태그 애니메이션 (P1 + AI 통합) ───────────────────────────────────────────
  useEffect(() => {
    const p1Changed = state.P1.activeCharacter !== prevP1CharRef.current;
    const aiChanged = state.AI.activeCharacter !== prevAICharRef.current;
    if (!p1Changed && !aiChanged) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (p1Changed) {
      const newChar = state.P1.activeCharacter;
      prevP1CharRef.current = newChar;
      setPlayerPose("tag_exit");
      setPlayerPoseKey((k) => k + 1);
      timers.push(setTimeout(() => {
        setDisplayedP1Char(newChar);
        setPlayerPose("tag_entry");
        setPlayerPoseKey((k) => k + 1);
      }, TAG_TRANSITION_MS));
    }

    if (aiChanged) {
      const newChar = state.AI.activeCharacter;
      prevAICharRef.current = newChar;
      setAiPose("tag_exit");
      setAiPoseKey((k) => k + 1);
      timers.push(setTimeout(() => {
        setDisplayedAIChar(newChar);
        setAiPose("tag_entry");
        setAiPoseKey((k) => k + 1);
      }, TAG_TRANSITION_MS));
    }

    return () => timers.forEach(clearTimeout);
  }, [state.P1.activeCharacter, state.AI.activeCharacter]);

  // ── ANIMATING 진입: animScript → 이벤트 큐 생성 + 완료 타이머 ────────────────
  useEffect(() => {
    if (state.phase !== "ANIMATING") {
      setAnimRunning(false);
      setDisplayedHp(null);
      setDisplayedCancelledPlayer(null);
      setDisplayedCombo(null);
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
      setZoomScale(1);
      return;
    }

    // 카드 효과 적용 직전 스냅샷으로 초기화 → damage_resolve까지 이전 값 유지
    if (state.animStartHp) {
      setDisplayedHp({ ...state.animStartHp });
    }
    if (state.animStartCombo) {
      setDisplayedCombo({ ...state.animStartCombo });
    }
    setDisplayedCancelledPlayer(null);

    const queue = makeQueueFromScript(state.animScript, state.P1.activeCharacter, state.AI.activeCharacter);
    setAnimQueue(queue);
    setAnimRunning(true);
    setAnimLog([]);

    const maxDelay = queue.reduce((m, e) => {
      const freeze = e.type === "visual_hit" ? freezeOf(e) : 0;
      return Math.max(m, e.delay + freeze);
    }, 0);
    const t = setTimeout(
      () => dispatchRef.current({ type: "ANIM/DONE" }),
      maxDelay + ANIM_DONE_BUFFER_MS,
    );
    return () => clearTimeout(t);
  // animScript는 ANIMATING 진입 시 한 번만 설정되므로 phase만 의존
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // ── GAME_OVER: KO 포즈 ───────────────────────────────────────────────────────
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

  // ── 라운드 전환: idle 리셋 ──────────────────────────────────────────────────
  const prevRoundRef = useRef(state.round);
  useEffect(() => {
    if (state.round === prevRoundRef.current) return;
    prevRoundRef.current = state.round;
    setPlayerPose("idle");
    setPlayerPoseKey((k) => k + 1);
    setAiPose("idle");
    setAiPoseKey((k) => k + 1);
  }, [state.round]);

  // ── 착지: 턴 시작 시 airborne 1→0 전환 감지 → land 포즈 재생 후 idle ─────────
  // airborneStack은 매 턴 시작(beginTurn)에 1씩 감소하므로, 공중(≥1)이던 파이터가
  // 이번 턴 시작으로 0이 되면 착지 동작을 재생한다. (태그는 turn을 올리지 않아 제외됨)
  const prevP1AirborneRef = useRef(state.P1.airborneStack);
  const prevAIAirborneRef = useRef(state.AI.airborneStack);
  const prevTurnForLandRef = useRef(state.turn);
  useEffect(() => {
    const turnAdvanced = state.turn > prevTurnForLandRef.current;
    const p1Prev = prevP1AirborneRef.current;
    const aiPrev = prevAIAirborneRef.current;
    prevTurnForLandRef.current = state.turn;
    prevP1AirborneRef.current = state.P1.airborneStack;
    prevAIAirborneRef.current = state.AI.airborneStack;

    if (!turnAdvanced) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const playLanding = (setPose: typeof setPlayerPose, setKey: typeof setPlayerPoseKey) => {
      setPose("land");
      setKey((k) => k + 1);
      timers.push(setTimeout(() => { setPose("idle"); setKey((k) => k + 1); }, LAND_MS));
    };

    if (p1Prev >= 1 && state.P1.airborneStack === 0) playLanding(setPlayerPose, setPlayerPoseKey);
    if (aiPrev >= 1 && state.AI.airborneStack === 0) playLanding(setAiPose, setAiPoseKey);

    return () => timers.forEach(clearTimeout);
  }, [state.turn, state.P1.airborneStack, state.AI.airborneStack]);

  // ── 애니메이션 이벤트 핸들러 ────────────────────────────────────────────────
  const handleAnimEvent = useCallback((event: CombatAnimationEvent) => {
    switch (event.type) {
      case "action_start": {
        const pose = actionTagToPose(event.actionTag);
        if (event.actor === "P1") {
          if (pose) { setPlayerPose(pose); setPlayerPoseKey((k) => k + 1); }
        } else if (event.actor === "AI") {
          if (pose) { setAiPose(pose); setAiPoseKey((k) => k + 1); }
        }
        setAnimLog((prev) => [
          ...prev,
          `action_start: ${event.actor ?? "?"}${event.actionTag ? ` [${event.actionTag}]` : ""}`,
        ]);
        break;
      }
      case "visual_hit": {
        const pose = event.hitPose ?? "hit_weak";
        const freezeMs = freezeOf(event);
        const shakeDuration = SHAKE_DURATION_MS[pose] ?? 100;
        const sl: ShakeLevel = pose === "hit_strong" ? "heavy" : "light";

        // 임팩트 윈도우: 줌인·히트스탑·셰이크가 같은 freeze 구간에 묶여 동작.
        // freeze가 끝나면 줌아웃 + 프레임 재개(frozenUntil 만료)가 동시에 일어난다.
        const freezeUntil = Date.now() + freezeMs;
        setPlayerFrozenUntil(freezeUntil);
        setAiFrozenUntil(freezeUntil);

        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
        setShakeLevel(sl);
        shakeTimerRef.current = setTimeout(() => setShakeLevel("none"), shakeDuration);

        // 줌인 → freeze 동안 유지 → 줌아웃
        if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
        setZoomScale(event.zoom ?? 1);
        zoomTimerRef.current = setTimeout(() => setZoomScale(1), freezeMs);

        setHitEffectTarget(event.target ?? null);
        setHitEffectStrength(pose === "hit_strong" ? "strong" : "weak");
        setHitEffectKey((k) => k + 1);

        const target = event.target;
        if (target === "P1" || target === "AI") {
          const isP1 = target === "P1";
          const setPose      = isP1 ? setPlayerPose      : setAiPose;
          const setPoseKey   = isP1 ? setPlayerPoseKey   : setAiPoseKey;
          const setFlashKey  = isP1 ? setPlayerFlashKey  : setAiFlashKey;
          const setKnockback = isP1 ? setPlayerKnockbackKey : setAiKnockbackKey;
          setBgOffset((o) => o + (isP1 ? 40 : -40));
          setPose(pose);
          setPoseKey((k) => k + 1);
          setFlashKey((k) => k + 1);
          setKnockback((k) => k + 1);
        }
        setAnimLog((prev) => [...prev, `visual_hit: ${event.target ?? "?"} [${pose}]`]);
        break;
      }
      case "super_flash": {
        if (superFlashTimerRef.current) clearTimeout(superFlashTimerRef.current);
        setSuperFlashActor(event.actor ?? null);
        superFlashTimerRef.current = setTimeout(
          () => setSuperFlashActor(null),
          SUPER_FLASH_DUR,
        );
        break;
      }
      case "action_end":
        break;
      case "damage_resolve": {
        if (event.hpAfter) {
          setDisplayedHp({ ...event.hpAfter });
        }
        if (event.cancelledPlayer) {
          setDisplayedCancelledPlayer(event.cancelledPlayer);
        }
        if (event.comboAfter !== undefined && event.comboHolder) {
          setDisplayedCombo({ count: event.comboAfter, holder: event.comboHolder });
        }
        break;
      }
    }
  }, []);

  useAnimQueue(animQueue, handleAnimEvent, animRunning);

  return {
    playerPose,
    playerPoseKey,
    playerCharacter: displayedP1Char,
    aiPose,
    aiPoseKey,
    aiCharacter: displayedAIChar,
    shakeLevel,
    playerFrozenUntil,
    aiFrozenUntil,
    playerFlashKey,
    aiFlashKey,
    playerKnockbackKey,
    aiKnockbackKey,
    zoomScale,
    bgOffset,
    hitEffectKey,
    hitEffectTarget,
    hitEffectStrength,
    superFlashActor,
    displayedHp,
    displayedCancelledPlayer,
    displayedCombo,
    animLog,
  };
}
