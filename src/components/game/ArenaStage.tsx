"use client";

import type { FighterPose } from "@/game/engine/types";
import FighterSprite from "./FighterSprite";
import styles from "./ArenaStage.module.css";

interface ArenaStageProps {
  playerPose?: FighterPose;
  playerPoseKey?: string | number;
  aiPose?: FighterPose;
  aiPoseKey?: string | number;
}

export default function ArenaStage({
  playerPose = "idle",
  playerPoseKey = "p1-idle",
  aiPose = "idle",
  aiPoseKey = "ai-idle",
}: ArenaStageProps) {
  return (
    <div className={styles.arena}>
      <div className={styles.fighterLeft}>
        <FighterSprite pose={playerPose} poseKey={playerPoseKey} flip={false} />
      </div>
      <div className={styles.fighterRight}>
        <FighterSprite pose={aiPose} poseKey={aiPoseKey} flip={true} />
      </div>
    </div>
  );
}
