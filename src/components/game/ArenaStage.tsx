"use client";

import FighterSprite from "./FighterSprite";
import styles from "./ArenaStage.module.css";

export default function ArenaStage() {
  return (
    <div className={styles.arena}>
      <div className={styles.fighterLeft}>
        <FighterSprite pose="idle" poseKey="p1-idle" flip={false} />
      </div>
      <div className={styles.fighterRight}>
        <FighterSprite pose="idle" poseKey="ai-idle" flip={true} />
      </div>
    </div>
  );
}
