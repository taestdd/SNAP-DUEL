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
import type { ShakeLevel } from "@/components/game/ArenaStage";
import { makeQueueFromScript } from "./makeQueue";
import { useAnimQueue } from "./useAnimQueue";

// ── 타이밍 상수 ────────────────────────────────────────────────────────────────

const TAG_TRANSITION_MS = 350;
const ANIM_DONE_BUFFER_MS = 150;

/** 히트 포즈별 히트스톱 지속 시간 (ms) */
const HIT_FREEZE_MS: Record<string, number> = {
  hit_strong: 300,
  hit_aerial: 220,
  hit_weak:   150,
};

/** 히트 포즈별 화면 흔들림 지속 시간 (ms) */
const SHAKE_DURATION_MS: Record<string, number> = {
  hit_strong: 220,
  hit_aerial: 160,
  hit_weak:   100,
};

// ── 유틸 ────────────────────────────────────────────────────────────────────────

function actionTagToPose(tag?: ActionTag): FighterPose | null {
  switch (tag) {
    case "block":         return "block";
    case "aerial_punch":  return "attack_aerial_punch";
    case "aerial_kick":   return "attack_aerial_kick";
    case "weak_punch":    return "attack_weak_punch";
    case "strong_punch":  return "attack_strong_punch";
    case "weak_kick":     return "attack_weak_kick";
    case "strong_kick":   return "attack_strong_kick";
    case "dragon_kick":   return "attack_dragon_kick";
    case "rising_punch":  return "attack_rising_punch";
    case "hadouken":      return "attack_hadouken";
    case "use_item":      return "use_item";
    default:              return null;
  }
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
  zoomKey: number;
  bgOffset: number;
  hitEffectKey: number;
  hitEffectTarget: "P1" | "AI" | null;
  hitEffectStrength: "weak" | "strong";
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
  const [zoomKey, setZoomKey] = useState(0);
  const [bgOffset, setBgOffset] = useState(0);
  const [hitEffectKey, setHitEffectKey] = useState(0);
  const [hitEffectTarget, setHitEffectTarget] = useState<"P1" | "AI" | null>(null);
  const [hitEffectStrength, setHitEffectStrength] = useState<"weak" | "strong">("weak");

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
      return;
    }

    const queue = makeQueueFromScript(state.animScript);
    setAnimQueue(queue);
    setAnimRunning(true);
    setAnimLog([]);

    const maxDelay = queue.reduce((m, e) => Math.max(m, e.delay), 0);
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
        const freezeMs = HIT_FREEZE_MS[pose] ?? 150;
        const shakeDuration = SHAKE_DURATION_MS[pose] ?? 100;
        const sl: ShakeLevel = pose === "hit_strong" ? "heavy" : "light";

        setPlayerFrozenUntil(Date.now() + freezeMs);
        setAiFrozenUntil(Date.now() + freezeMs);

        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
        setShakeLevel(sl);
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
      case "damage_resolve":
        break;
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
    zoomKey,
    bgOffset,
    hitEffectKey,
    hitEffectTarget,
    hitEffectStrength,
    animLog,
  };
}
