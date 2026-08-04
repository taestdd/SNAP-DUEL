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
import { useGameTransitions } from "@/hooks/useGameTransitions";
import { makeQueueFromScript, SUPER_FLASH_DUR, HIT_FREEZE_PRESET, HOME_OFFSET } from "./makeQueue";
import { useAnimQueue } from "./useAnimQueue";

// ── 타이밍 상수 ────────────────────────────────────────────────────────────────

const TAG_TRANSITION_MS = 350;
const ANIM_DONE_BUFFER_MS = 150;
/** 착지 포즈 유지 시간 (ms) — 이후 idle 복귀 */
const LAND_MS = 380;

/** 파이터 위치 연출 상태 — x: 오프셋(px), motion: 트랜지션 선택용 이동 성격 */
export type FighterMove = { x: number; motion: "dash" | "recover" | "knockback" };

const HOME_MOVE: Record<PlayerId, FighterMove> = {
  P1: { x: HOME_OFFSET.P1, motion: "recover" },
  AI: { x: HOME_OFFSET.AI, motion: "recover" },
};

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
  /** 피격 잔떨림 — key: visual_hit마다 증가, ms: 히트스탑 freeze 윈도우 길이 */
  playerHitShake: { key: number; ms: number };
  aiHitShake: { key: number; ms: number };
  /** 파이터 위치 연출 (근접/비근접 오프셋 + 대시/넉백/복귀 모션). 턴 사이 보존됨 */
  playerMove: FighterMove;
  aiMove: FighterMove;
  /** 줌 배율 (1 = 기본). 히트 임팩트 윈도우 동안 확대 후 복귀 */
  zoomScale: number;
  bgOffset: number;
  hitEffectKey: number;
  hitEffectTarget: "P1" | "AI" | null;
  hitEffectStrength: "weak" | "strong";
  superFlashActor: "P1" | "AI" | null;
  /** ANIMATING 중 UI에 표시할 HP (damage_resolve 이벤트 타이밍에 갱신). null이면 gameState HP 그대로. */
  displayedHp: { P1: number; AI: number } | null;
  /** ANIMATING 중 UI에 표시할 카운터 플레이어 (damage_resolve 이벤트 타이밍에 갱신). null이면 gameState 값 그대로. */
  displayedCounteredPlayer: "P1" | "AI" | null;
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
  // 피격 잔떨림 (히트스탑 freeze 윈도우 동안 피격자 진동)
  const [playerHitShake, setPlayerHitShake] = useState({ key: 0, ms: 0 });
  const [aiHitShake, setAiHitShake] = useState({ key: 0, ms: 0 });
  // 파이터 위치 연출 — 대시/넉백이 갱신하고 턴 사이 보존된다 (라운드·태그 시 홈 리셋)
  const [playerMove, setPlayerMove] = useState<FighterMove>(HOME_MOVE.P1);
  const [aiMove, setAiMove] = useState<FighterMove>(HOME_MOVE.AI);
  // ANIMATING 진입 시 makeQueue에 현재 오프셋을 전달하기 위한 최신값 참조
  const moveRef = useRef({ P1: HOME_OFFSET.P1, AI: HOME_OFFSET.AI });
  useEffect(() => { moveRef.current = { P1: playerMove.x, AI: aiMove.x }; }, [playerMove, aiMove]);
  const [zoomScale, setZoomScale] = useState(1);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bgOffset, setBgOffset] = useState(0);
  const [hitEffectKey, setHitEffectKey] = useState(0);
  const [hitEffectTarget, setHitEffectTarget] = useState<"P1" | "AI" | null>(null);
  const [hitEffectStrength, setHitEffectStrength] = useState<"weak" | "strong">("weak");
  const [superFlashActor, setSuperFlashActor] = useState<"P1" | "AI" | null>(null);
  const superFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 애니메이션 중 표시용 HP / 카운터 플레이어 / 콤보 (damage_resolve 이벤트 타이밍에 갱신)
  const [displayedHp, setDisplayedHp] = useState<{ P1: number; AI: number } | null>(null);
  const [displayedCounteredPlayer, setDisplayedCounteredPlayer] = useState<"P1" | "AI" | null>(null);
  const [displayedCombo, setDisplayedCombo] = useState<{ count: number; holder: PlayerId } | null>(null);

  // 태그 애니메이션: exit 재생 후 스프라이트 전환
  const [displayedP1Char, setDisplayedP1Char] = useState<CharacterId>(state.P1.activeCharacter);
  const [displayedAIChar, setDisplayedAIChar] = useState<CharacterId>(state.AI.activeCharacter);
  // 태그/착지 연출 타이머 (플레이어별 1개 — 재발화 시 이전 타이머 교체, 언마운트 시 정리)
  const tagTimerRef = useRef<Record<PlayerId, ReturnType<typeof setTimeout> | null>>({ P1: null, AI: null });
  const landTimerRef = useRef<Record<PlayerId, ReturnType<typeof setTimeout> | null>>({ P1: null, AI: null });

  // 애니메이션 큐
  const [animQueue, setAnimQueue] = useState<CombatAnimationEvent[]>([]);
  const [animRunning, setAnimRunning] = useState(false);
  const [animLog, setAnimLog] = useState<string[]>([]);

  // dispatch 레퍼런스 (타이머 클로저에서 안정적으로 사용)
  const dispatchRef = useRef(dispatch);
  useEffect(() => { dispatchRef.current = dispatch; });

  // ── 상태 전환 반응 (태그 연출 / 라운드 idle 리셋 / 착지) ─────────────────────
  // 전환 감지는 useGameTransitions가 단일 담당 — prevXRef를 직접 두지 않는다.
  useGameTransitions(state, {
    onCharacterSwitch: (player, _from, to) => {
      const isP1 = player === "P1";
      const setPose = isP1 ? setPlayerPose : setAiPose;
      const setKey = isP1 ? setPlayerPoseKey : setAiPoseKey;
      const setChar = isP1 ? setDisplayedP1Char : setDisplayedAIChar;

      setPose("tag_exit");
      setKey((k) => k + 1);
      if (tagTimerRef.current[player]) clearTimeout(tagTimerRef.current[player]!);
      tagTimerRef.current[player] = setTimeout(() => {
        setChar(to);
        setPose("tag_entry");
        setKey((k) => k + 1);
      }, TAG_TRANSITION_MS);
      // 거리 상태는 태그에도 유지 — 새 캐릭터가 이전 캐릭터 위치에서 등장 (리셋은 라운드 전환만)
    },

    onRound: () => {
      setPlayerPose("idle");
      setPlayerPoseKey((k) => k + 1);
      setAiPose("idle");
      setAiPoseKey((k) => k + 1);
      // 라운드 전환 시 거리 상태를 비근접(홈)으로 리셋
      setPlayerMove(HOME_MOVE.P1);
      setAiMove(HOME_MOVE.AI);
    },

    onLanding: (player) => {
      const isP1 = player === "P1";
      const setPose = isP1 ? setPlayerPose : setAiPose;
      const setKey = isP1 ? setPlayerPoseKey : setAiPoseKey;

      setPose("land");
      setKey((k) => k + 1);
      if (landTimerRef.current[player]) clearTimeout(landTimerRef.current[player]!);
      landTimerRef.current[player] = setTimeout(() => {
        setPose("idle");
        setKey((k) => k + 1);
      }, LAND_MS);
    },
  });

  // 언마운트 시 태그/착지 타이머 정리
  useEffect(() => () => {
    for (const p of ["P1", "AI"] as const) {
      if (tagTimerRef.current[p]) clearTimeout(tagTimerRef.current[p]!);
      if (landTimerRef.current[p]) clearTimeout(landTimerRef.current[p]!);
    }
  }, []);

  // ── ANIMATING 진입: animScript → 이벤트 큐 생성 + 완료 타이머 ────────────────
  useEffect(() => {
    if (state.phase !== "ANIMATING") {
      setAnimRunning(false);
      setDisplayedHp(null);
      setDisplayedCounteredPlayer(null);
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
    setDisplayedCounteredPlayer(null);

    // 현재 파이터 오프셋을 시작점으로 대시/넉백 거리 시뮬레이션 (턴 사이 보존값)
    const queue = makeQueueFromScript(state.animScript, state.P1.activeCharacter, state.AI.activeCharacter, moveRef.current);
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
          const setHitShake  = isP1 ? setPlayerHitShake  : setAiHitShake;
          setBgOffset((o) => o + (isP1 ? 40 : -40));
          setPose(pose);
          setPoseKey((k) => k + 1);
          setFlashKey((k) => k + 1);
          setKnockback((k) => k + 1);
          // 히트스탑 동안 피격자 잔떨림 — freeze 윈도우와 같은 길이로 재생
          setHitShake((prev) => ({ key: prev.key + 1, ms: freezeMs }));
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
      case "fighter_move": {
        // 대시/넉백/복귀 — makeQueue가 시뮬레이션한 목표 오프셋을 그대로 적용.
        // bgPush(공격자 복귀 시)는 배경을 같은 방향으로 밀어 "적이 밀리는" 착시를 만든다.
        if (event.subject === undefined || event.toOffset === undefined) break;
        const move: FighterMove = { x: event.toOffset, motion: event.motion ?? "recover" };
        if (event.subject === "P1") setPlayerMove(move);
        else setAiMove(move);
        // 대시 슬라이드 구간에는 전용 대시 프레임을 표시 (공격 포즈는 이후 action_start가 덮어씀)
        if (move.motion === "dash") {
          if (event.subject === "P1") { setPlayerPose("dash"); setPlayerPoseKey((k) => k + 1); }
          else { setAiPose("dash"); setAiPoseKey((k) => k + 1); }
        }
        if (event.bgPush) setBgOffset((o) => o + event.bgPush!);
        setAnimLog((prev) => [...prev, `fighter_move: ${event.subject} → ${event.toOffset}px [${event.motion}]`]);
        break;
      }
      case "damage_resolve": {
        if (event.hpAfter) {
          setDisplayedHp({ ...event.hpAfter });
        }
        if (event.counteredPlayer) {
          setDisplayedCounteredPlayer(event.counteredPlayer);
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
    playerHitShake,
    aiHitShake,
    playerMove,
    aiMove,
    zoomScale,
    bgOffset,
    hitEffectKey,
    hitEffectTarget,
    hitEffectStrength,
    superFlashActor,
    displayedHp,
    displayedCounteredPlayer,
    displayedCombo,
    animLog,
  };
}
