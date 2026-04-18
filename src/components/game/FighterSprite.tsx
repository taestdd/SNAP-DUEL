"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterId, FighterPose } from "@/game/engine/types";
import { CHARACTER_SPRITES, frameToBackgroundPosition, backgroundSize } from "@/game/animation/spriteMap";
import styles from "./FighterSprite.module.css";

interface FighterSpriteProps {
  pose: FighterPose;
  /**
   * 값이 바뀌면 애니메이션을 첫 프레임부터 재시작
   * (같은 포즈를 다시 재생할 때도 key처럼 사용)
   */
  poseKey: string | number;
  characterId: CharacterId;
  /** true = scaleX(-1) 로 좌우 반전 (AI측 파이터) */
  flip?: boolean;
  className?: string;
}

export default function FighterSprite({
  pose,
  poseKey,
  characterId,
  flip = false,
  className,
}: FighterSpriteProps) {
  const config = CHARACTER_SPRITES[characterId];
  const entry = config.poses[pose];
  const [frameIdx, setFrameIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setFrameIdx(0);

    if (intervalRef.current) clearInterval(intervalRef.current);

    const ms = Math.round(1000 / entry.fps);

    intervalRef.current = setInterval(() => {
      setFrameIdx((prev) => {
        const next = prev + 1;
        if (next >= entry.frames.length) {
          if (entry.hold) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return prev;
          }
          return 0;
        }
        return next;
      });
    }, ms);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseKey, pose]);

  const absoluteFrame = entry.frames[frameIdx] ?? entry.frames[0];

  return (
    <div
      className={`${styles.sprite} ${flip ? styles.flip : ""} ${className ?? ""}`}
      style={{
        backgroundImage: `url("${config.imagePath}")`,
        backgroundPosition: frameToBackgroundPosition(absoluteFrame, config.sheet),
        backgroundSize: backgroundSize(config.sheet),
      }}
      aria-hidden="true"
    />
  );
}
