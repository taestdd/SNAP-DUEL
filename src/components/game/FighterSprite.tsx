"use client";

import { useEffect, useState } from "react";
import type { FighterPose } from "@/game/engine/types";
import {
  SPRITE_MAP,
  SPRITE_DISPLAY_SIZE,
  SPRITE_SHEET_COLS,
  SPRITE_FRAME_MS,
  DEFAULT_FRAME_MS,
  LOOPING_POSES,
} from "@/game/animation/spriteMap";
import styles from "./FighterSprite.module.css";

interface Props {
  pose: FighterPose;
  /**
   * 이 값이 바뀌면 같은 포즈라도 애니메이션을 처음부터 재생.
   * 연속 공격 등 동일 포즈 반복 트리거에 사용.
   */
  poseKey?: number;
  /** true 이면 마지막 프레임에서 멈춤 */
  hold?: boolean;
  /** true 이면 좌우 반전 (AI 측 파이터) */
  flip?: boolean;
}

export default function FighterSprite({
  pose,
  poseKey = 0,
  hold = false,
  flip = false,
}: Props) {
  const frames = SPRITE_MAP[pose];
  const frameDuration = SPRITE_FRAME_MS[pose] ?? DEFAULT_FRAME_MS;
  const isLooping = LOOPING_POSES.has(pose);

  const [frameIdx, setFrameIdx] = useState(0);

  // pose 또는 poseKey 가 바뀌면 처음 프레임으로 리셋
  useEffect(() => {
    setFrameIdx(0);
  }, [pose, poseKey]);

  // 프레임 진행
  useEffect(() => {
    if (hold) return;

    const atLast = frameIdx >= frames.length - 1;
    if (atLast && !isLooping) return; // 원샷 포즈: 마지막 프레임 유지

    const id = setTimeout(() => {
      setFrameIdx((prev) => {
        if (isLooping) return (prev + 1) % frames.length;
        return Math.min(prev + 1, frames.length - 1);
      });
    }, frameDuration);

    return () => clearTimeout(id);
  }, [frameIdx, frames, frameDuration, hold, isLooping]);

  const frameNum = frames[frameIdx] ?? 0;
  const col = frameNum % SPRITE_SHEET_COLS;
  const row = Math.floor(frameNum / SPRITE_SHEET_COLS);
  const bgX = -(col * SPRITE_DISPLAY_SIZE);
  const bgY = -(row * SPRITE_DISPLAY_SIZE);

  return (
    <div
      className={`${styles.sprite} ${flip ? styles.flip : ""}`}
      style={{ backgroundPosition: `${bgX}px ${bgY}px` }}
    />
  );
}
