"use client";

import FighterSprite from "./FighterSprite";
import HitSpark from "./HitSpark";
import styles from "./ArenaStage.module.css";

export type ShakeLevel = "none" | "light" | "heavy";
export type HitSide = "player" | "ai" | null;

interface ArenaStageProps {
  shakeLevel?: ShakeLevel;
  hitSide?: HitSide;
}

export default function ArenaStage({
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
        <FighterSprite pose="idle" poseKey="p1-idle" flip={false} />
        <HitSpark active={hitSide === "player"} />
      </div>
      <div className={styles.fighterRight}>
        <FighterSprite pose="idle" poseKey="ai-idle" flip={true} />
        <HitSpark active={hitSide === "ai"} />
      </div>
    </div>
  );
}
