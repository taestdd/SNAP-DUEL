"use client";

import { useLayoutEffect, useRef } from "react";
import type { FighterPose } from "@/game/engine/types";
import FighterSprite from "./FighterSprite";
import HitEffect from "./HitEffect";
import styles from "./ArenaStage.module.css";

export type ShakeLevel = "none" | "light" | "heavy";
export type HitSide = "player" | "ai" | null;

interface ArenaStageProps {
  playerPose?: FighterPose;
  playerPoseKey?: string | number;
  playerCharacter?: string;
  aiPose?: FighterPose;
  aiPoseKey?: string | number;
  aiCharacter?: string;
  shakeLevel?: ShakeLevel;
  hitSide?: HitSide;
  playerFrozenUntil?: number;
  aiFrozenUntil?: number;
  playerFlashKey?: number;
  aiFlashKey?: number;
  playerKnockbackKey?: number;
  aiKnockbackKey?: number;
  playerAdvance?: number;
  aiAdvance?: number;
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
  hitSide = null,
  playerFrozenUntil = 0,
  aiFrozenUntil = 0,
  playerFlashKey = 0,
  aiFlashKey = 0,
  playerKnockbackKey = 0,
  aiKnockbackKey = 0,
  playerAdvance = 0,
  aiAdvance = 0,
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
  const zoomRef = useRef<HTMLDivElement>(null);

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

  // 전진(offset≠0)은 빠르게(대시-인), 복귀(offset=0)는 배경 이동과 동기화되도록 느리게.
  const advTransition = (offset: number) =>
    offset !== 0
      ? "transform 130ms cubic-bezier(0.3, 0.7, 0.4, 1)"
      : "transform 360ms cubic-bezier(0.33, 1, 0.68, 1)";

  return (
    <div className={styles.zoomWrap}>
      <div className={`${styles.arena} ${shakeClass}`}>
        <div
          ref={zoomRef}
          className={styles.arenaInner}
          style={{ transform: `scale(${zoomScale})`, transition: zoomTransition }}
        >
          <div className={styles.arenaBg} style={{ backgroundPositionX: `${bgOffset}px` }} />
          {superFlashActor && (
            <div key={superFlashActor} className={styles.superFlashOverlay} />
          )}
          {hitEffectKey > 0 && hitEffectTarget && (
            <HitEffect
              key={hitEffectKey}
              strength={hitEffectStrength}
              style={{
                left: hitEffectTarget === "P1" ? "32%" : "68%",
                top: "55%",
              }}
            />
          )}
          <div
            ref={playerRef}
            className={`${styles.fighterLeft} ${superFlashActor === "P1" ? styles.superFlashActor : ""}`}
          >
            {/* 전진 레이어: knockback(keyframe)과 transform 충돌 방지를 위해 별도 래퍼 */}
            <div className={styles.advanceWrap} style={{ transform: `translateX(${playerAdvance}px)`, transition: advTransition(playerAdvance) }}>
              <FighterSprite pose={playerPose} poseKey={playerPoseKey} characterId={playerCharacter} flip={false} frozenUntil={playerFrozenUntil} flashKey={playerFlashKey} showTrail={playerShowTrail} />
            </div>
          </div>
          <div
            ref={aiRef}
            className={`${styles.fighterRight} ${superFlashActor === "AI" ? styles.superFlashActor : ""}`}
          >
            <div className={styles.advanceWrap} style={{ transform: `translateX(${aiAdvance}px)`, transition: advTransition(aiAdvance) }}>
              <FighterSprite pose={aiPose} poseKey={aiPoseKey} characterId={aiCharacter} flip={true} frozenUntil={aiFrozenUntil} flashKey={aiFlashKey} showTrail={aiShowTrail} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
