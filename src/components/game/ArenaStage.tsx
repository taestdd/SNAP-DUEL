"use client";

import type { CharacterId, FighterPose } from "@/game/engine/types";
import FighterSprite from "./FighterSprite";
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
}: ArenaStageProps) {
  const shakeClass =
    shakeLevel === "light"
      ? styles.shakeLight
      : shakeLevel === "heavy"
        ? styles.shakeHeavy
        : "";

  return (
    <div className={`${styles.arena} ${shakeClass}`}>
      <div className={styles.fighterLeft}>
        <FighterSprite pose={playerPose} poseKey={playerPoseKey} characterId={playerCharacter} flip={false} />
      </div>
      <div className={styles.fighterRight}>
        <FighterSprite pose={aiPose} poseKey={aiPoseKey} characterId={aiCharacter} flip={true} />
      </div>
    </div>
  );
}
