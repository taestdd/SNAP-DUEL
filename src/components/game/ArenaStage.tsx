"use client";

import FighterSprite from "./FighterSprite";
import styles from "./ArenaStage.module.css";
import type { FighterPose } from "@/game/engine/types";

export interface AnimViewState {
  pose: FighterPose;
  poseKey: number;
  impactTick: number;
}

interface ArenaStageProps {
  playerView: AnimViewState;
  aiView: AnimViewState;
}

export default function ArenaStage({ playerView, aiView }: ArenaStageProps) {
  return (
    <div className={styles.arena}>
      <div className={styles.fighterLeft}>
        <FighterSprite pose={playerView.pose} poseKey={playerView.poseKey} flip={false} />
      </div>
      <div className={styles.fighterRight}>
        <FighterSprite pose={aiView.pose} poseKey={aiView.poseKey} flip={true} />
      </div>
    </div>
  );
}
