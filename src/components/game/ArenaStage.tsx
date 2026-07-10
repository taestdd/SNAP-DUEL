"use client";

import { useLayoutEffect, useRef } from "react";
import type { FighterPose } from "@/game/engine/types";
import FighterSprite from "./FighterSprite";
import HitEffect from "./HitEffect";
import styles from "./ArenaStage.module.css";

export type ShakeLevel = "none" | "light" | "heavy";
/** 파이터 위치 이동의 성격 — 트랜지션 속도/커브 선택 */
export type MoveMotion = "dash" | "recover" | "knockback";

interface ArenaStageProps {
  playerPose?: FighterPose;
  playerPoseKey?: string | number;
  playerCharacter?: string;
  aiPose?: FighterPose;
  aiPoseKey?: string | number;
  aiCharacter?: string;
  shakeLevel?: ShakeLevel;
  playerFrozenUntil?: number;
  aiFrozenUntil?: number;
  playerFlashKey?: number;
  aiFlashKey?: number;
  playerKnockbackKey?: number;
  aiKnockbackKey?: number;
  /** 피격 잔떨림 재생 트리거 (visual_hit마다 증가) */
  playerHitShakeKey?: number;
  aiHitShakeKey?: number;
  /** 피격 잔떨림 지속 시간 (ms) — 히트스탑 freeze 윈도우와 동일 */
  playerHitShakeMs?: number;
  aiHitShakeMs?: number;
  /** 파이터 X 오프셋 (px, 기본 인접 배치 기준). 비근접=홈(±SPREAD_PX), 근접=상대 박스에 겹침 */
  playerOffset?: number;
  aiOffset?: number;
  /** 오프셋 이동의 성격 — dash 빠르게 / recover·knockback 부드럽게 */
  playerMotion?: MoveMotion;
  aiMotion?: MoveMotion;
  zoomScale?: number;
  bgOffset?: number;
  hitEffectKey?: number;
  hitEffectTarget?: "P1" | "AI" | null;
  hitEffectStrength?: "weak" | "strong";
  superFlashActor?: "P1" | "AI" | null;
  playerShowTrail?: boolean;
  aiShowTrail?: boolean;
}

export default function ArenaStage({
  playerPose = "idle",
  playerPoseKey = "p1-idle",
  playerCharacter = "fighter",
  aiPose = "idle",
  aiPoseKey = "ai-idle",
  aiCharacter = "fighter",
  shakeLevel = "none",
  playerFrozenUntil = 0,
  aiFrozenUntil = 0,
  playerFlashKey = 0,
  aiFlashKey = 0,
  playerKnockbackKey = 0,
  aiKnockbackKey = 0,
  playerHitShakeKey = 0,
  aiHitShakeKey = 0,
  playerHitShakeMs = 0,
  aiHitShakeMs = 0,
  playerOffset = 0,
  aiOffset = 0,
  playerMotion = "recover",
  aiMotion = "recover",
  zoomScale = 1,
  bgOffset = 0,
  hitEffectKey = 0,
  hitEffectTarget = null,
  hitEffectStrength = "weak",
  superFlashActor = null,
  playerShowTrail = false,
  aiShowTrail = false,
}: ArenaStageProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const playerShakeRef = useRef<HTMLDivElement>(null);
  const aiShakeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (playerKnockbackKey === 0) return;
    const el = playerRef.current;
    if (!el) return;
    el.classList.remove(styles.knockbackLeft);
    void el.offsetWidth;
    el.classList.add(styles.knockbackLeft);
  }, [playerKnockbackKey]);

  useLayoutEffect(() => {
    if (aiKnockbackKey === 0) return;
    const el = aiRef.current;
    if (!el) return;
    el.classList.remove(styles.knockbackRight);
    void el.offsetWidth;
    el.classList.add(styles.knockbackRight);
  }, [aiKnockbackKey]);

  // 피격 잔떨림: 히트스탑 freeze 윈도우 동안 무한 진동 클래스를 붙였다가 타이머로 제거
  useLayoutEffect(() => {
    if (playerHitShakeKey === 0) return;
    const el = playerShakeRef.current;
    if (!el) return;
    el.classList.add(styles.victimShaking);
    const t = setTimeout(() => el.classList.remove(styles.victimShaking), playerHitShakeMs);
    return () => { clearTimeout(t); el.classList.remove(styles.victimShaking); };
  }, [playerHitShakeKey, playerHitShakeMs]);

  useLayoutEffect(() => {
    if (aiHitShakeKey === 0) return;
    const el = aiShakeRef.current;
    if (!el) return;
    el.classList.add(styles.victimShaking);
    const t = setTimeout(() => el.classList.remove(styles.victimShaking), aiHitShakeMs);
    return () => { clearTimeout(t); el.classList.remove(styles.victimShaking); };
  }, [aiHitShakeKey, aiHitShakeMs]);

  const shakeClass =
    shakeLevel === "light"
      ? styles.shakeLight
      : shakeLevel === "heavy"
        ? styles.shakeHeavy
        : "";

  // 줌인(scale>1)은 임팩트 느낌을 위해 빠르게, 줌아웃(scale=1 복귀)은 카메라가
  // 천천히 물러나듯 부드럽게. 목표 배율로 방향을 판별해 transition을 전환한다.
  const zoomTransition =
    zoomScale > 1
      ? "transform 120ms cubic-bezier(0.22, 1, 0.36, 1)"
      : "transform 420ms cubic-bezier(0.33, 1, 0.68, 1)";

  // 이동 성격별 트랜지션 — 대시는 빠르게, 넉백은 튕기듯, 복귀는 배경 이동과 동기화되도록 느리게
  const moveTransition = (motion: MoveMotion) => {
    switch (motion) {
      case "dash":      return "transform 130ms cubic-bezier(0.3, 0.7, 0.4, 1)";
      case "knockback": return "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)";
      case "recover":   return "transform 360ms cubic-bezier(0.33, 1, 0.68, 1)";
    }
  };

  return (
    <div className={styles.zoomWrap}>
      <div className={`${styles.arena} ${shakeClass}`}>
        <div
          className={styles.arenaInner}
          style={{ transform: `scale(${zoomScale})`, transition: zoomTransition }}
        >
          <div className={styles.arenaBg} style={{ backgroundPositionX: `${bgOffset}px` }} />
          {superFlashActor && (
            <div key={superFlashActor} className={styles.superFlashOverlay} />
          )}
          <div
            ref={playerRef}
            className={`${styles.fighterLeft} ${superFlashActor === "P1" ? styles.superFlashActor : ""}`}
          >
            {/* 위치 레이어: knockback 셰이크(keyframe)와 transform 충돌 방지를 위해 별도 래퍼 */}
            <div className={styles.advanceWrap} style={{ transform: `translateX(${playerOffset}px)`, transition: moveTransition(playerMotion) }}>
              {/* 잔떨림 레이어: 히트스탑 동안 스프라이트만 진동 (히트 이펙트는 제외) */}
              <div ref={playerShakeRef} className={styles.hitShakeWrap}>
                <FighterSprite pose={playerPose} poseKey={playerPoseKey} characterId={playerCharacter} flip={false} frozenUntil={playerFrozenUntil} flashKey={playerFlashKey} showTrail={playerShowTrail} />
              </div>
              {/* 히트 이펙트를 스프라이트 기준으로 배치 → 전진·넉백을 자동 추종. P1은 AI(오른쪽)에게 맞으므로 오른쪽 근접면 */}
              {hitEffectKey > 0 && hitEffectTarget === "P1" && (
                <HitEffect key={hitEffectKey} strength={hitEffectStrength} style={{ left: "62%", top: "55%" }} />
              )}
            </div>
          </div>
          <div
            ref={aiRef}
            className={`${styles.fighterRight} ${superFlashActor === "AI" ? styles.superFlashActor : ""}`}
          >
            <div className={styles.advanceWrap} style={{ transform: `translateX(${aiOffset}px)`, transition: moveTransition(aiMotion) }}>
              <div ref={aiShakeRef} className={styles.hitShakeWrap}>
                <FighterSprite pose={aiPose} poseKey={aiPoseKey} characterId={aiCharacter} flip={true} frozenUntil={aiFrozenUntil} flashKey={aiFlashKey} showTrail={aiShowTrail} />
              </div>
              {/* AI는 P1(왼쪽)에게 맞으므로 왼쪽 근접면 */}
              {hitEffectKey > 0 && hitEffectTarget === "AI" && (
                <HitEffect key={hitEffectKey} strength={hitEffectStrength} style={{ left: "38%", top: "55%" }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
