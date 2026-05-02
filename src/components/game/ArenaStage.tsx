"use client";

import { useLayoutEffect, useRef } from "react";
import type { CharacterId, FighterPose } from "@/game/engine/types";
import FighterSprite from "./FighterSprite";
import HitEffect from "./HitEffect";
import styles from "./ArenaStage.module.css";

export type ShakeLevel = "none" | "light" | "heavy";
export type HitSide = "player" | "ai" | null;

interface ArenaStageProps {
  playerPose?: FighterPose;
  playerPoseKey?: string | number;
  playerCharacter?: CharacterId;
  aiPose?: FighterPose;
  aiPoseKey?: string | number;
  aiCharacter?: CharacterId;
  shakeLevel?: ShakeLevel;
  hitSide?: HitSide;
  playerFrozenUntil?: number;
  aiFrozenUntil?: number;
  playerFlashKey?: number;
  aiFlashKey?: number;
  playerKnockbackKey?: number;
  aiKnockbackKey?: number;
  zoomKey?: number;
  bgOffset?: number;
  hitEffectKey?: number;
  hitEffectTarget?: "P1" | "AI" | null;
  hitEffectStrength?: "weak" | "strong";
}

export default function ArenaStage({
  playerPose = "idle",
  playerPoseKey = "p1-idle",
  playerCharacter = "A",
  aiPose = "idle",
  aiPoseKey = "ai-idle",
  aiCharacter = "A",
  shakeLevel = "none",
  hitSide = null,
  playerFrozenUntil = 0,
  aiFrozenUntil = 0,
  playerFlashKey = 0,
  aiFlashKey = 0,
  playerKnockbackKey = 0,
  aiKnockbackKey = 0,
  zoomKey = 0,
  bgOffset = 0,
  hitEffectKey = 0,
  hitEffectTarget = null,
  hitEffectStrength = "weak",
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

  useLayoutEffect(() => {
    if (zoomKey === 0) return;
    const el = zoomRef.current;
    if (!el) return;
    el.classList.remove(styles.zooming);
    void el.offsetWidth;
    el.classList.add(styles.zooming);
  }, [zoomKey]);
  const shakeClass =
    shakeLevel === "light"
      ? styles.shakeLight
      : shakeLevel === "heavy"
        ? styles.shakeHeavy
        : "";

  return (
    <div ref={zoomRef} className={styles.zoomWrap}>
      <div className={`${styles.arena} ${shakeClass}`}>
        <div className={styles.arenaBg} style={{ backgroundPositionX: `${bgOffset}px` }} />
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
        <div ref={playerRef} className={styles.fighterLeft}>
          <FighterSprite pose={playerPose} poseKey={playerPoseKey} characterId={playerCharacter} flip={false} frozenUntil={playerFrozenUntil} flashKey={playerFlashKey} />
        </div>
        <div ref={aiRef} className={styles.fighterRight}>
          <FighterSprite pose={aiPose} poseKey={aiPoseKey} characterId={aiCharacter} flip={true} frozenUntil={aiFrozenUntil} flashKey={aiFlashKey} />
        </div>
      </div>
    </div>
  );
}
