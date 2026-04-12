"use client";

import { useEffect, useRef, useState } from "react";
import type { FighterPose } from "@/game/engine/types";
import {
  SPRITE_MAP,
  BACKGROUND_SIZE,
  frameToBackgroundPosition,
} from "@/game/animation/spriteMap";
import styles from "./FighterSprite.module.css";

interface FighterSpriteProps {
  pose: FighterPose;
  /**
   * 값이 바뀌면 애니메이션을 첫 프레임부터 재시작
   * (같은 포즈를 다시 재생할 때도 key처럼 사용)
   */
  poseKey: string | number;
  /** true = scaleX(-1) 로 좌우 반전 (AI측 파이터) */
  flip?: boolean;
  className?: string;
}

export default function FighterSprite({
  pose,
  poseKey,
  flip = false,
  className,
}: FighterSpriteProps) {
  const entry = SPRITE_MAP[pose];
  const [frameIdx, setFrameIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // poseKey 또는 pose 변경 → 프레임 리셋 + 타이머 재시작
  useEffect(() => {
    setFrameIdx(0);

    if (intervalRef.current) clearInterval(intervalRef.current);

    const ms = Math.round(1000 / entry.fps);

    intervalRef.current = setInterval(() => {
      setFrameIdx((prev) => {
        const next = prev + 1;
        if (next >= entry.frames.length) {
          if (entry.hold) {
            // 마지막 프레임 고정 → 타이머 중지
            if (intervalRef.current) clearInterval(intervalRef.current);
            return prev;
          }
          return 0; // 루프
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
  const bgPos = frameToBackgroundPosition(absoluteFrame);

  return (
    <div
      className={`${styles.sprite} ${flip ? styles.flip : ""} ${className ?? ""}`}
      style={{
        backgroundPosition: bgPos,
        backgroundSize: BACKGROUND_SIZE,
      }}
      aria-hidden="true"
    />
  );
}
