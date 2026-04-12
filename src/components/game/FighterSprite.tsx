"use client";

import { useEffect, useRef, useState } from "react";
import type { FighterViewState } from "@/game/engine/types";
import { SPRITE_MAP } from "@/game/animation/spriteMap";
import styles from "./FighterSprite.module.css";

/**
 * 스프라이트 렌더링 설정
 * 원본 프레임: 360×360px → 0.5 스케일 → 180×180px
 * background-size: (6 * 360 * 0.5) × (5 * 360 * 0.5) = 1080 × 900
 */
const FRAME_W = 180;
const FRAME_H = 180;
const BG_W = 1080;
const BG_H = 900;

interface FighterSpriteProps {
  viewState: FighterViewState;
  /** AI 캐릭터에 scaleX(-1) 적용 */
  flip?: boolean;
}

export default function FighterSprite({ viewState, flip = false }: FighterSpriteProps) {
  const { pose, poseKey, hold, impactTick } = viewState;
  const sequence = SPRITE_MAP[pose];
  const [frameIndex, setFrameIndex] = useState(0);
  const [knockback, setKnockback] = useState(false);

  // poseKey 변경 시 프레임 0으로 리셋 후 인터벌 시작
  useEffect(() => {
    setFrameIndex(0);

    if (sequence.frames.length <= 1) return;

    const intervalMs = 1000 / sequence.fps;
    const intervalId = setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1;
        if (next >= sequence.frames.length) {
          if (sequence.loop) return 0;
          clearInterval(intervalId);
          return hold ? sequence.frames.length - 1 : prev;
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseKey]);

  // impactTick 변경 시 넉백 애니메이션 트리거
  const prevImpactRef = useRef(impactTick);
  useEffect(() => {
    if (impactTick !== prevImpactRef.current) {
      prevImpactRef.current = impactTick;
      setKnockback(true);
      const timer = setTimeout(() => setKnockback(false), 300);
      return () => clearTimeout(timer);
    }
  }, [impactTick]);

  const frame = sequence.frames[Math.min(frameIndex, sequence.frames.length - 1)];
  const bgX = -(frame.x / 2);
  const bgY = -(frame.y / 2);

  const spriteStyle: React.CSSProperties = {
    width: FRAME_W,
    height: FRAME_H,
    backgroundImage: "url('/sprites/sheet.png')",
    backgroundSize: `${BG_W}px ${BG_H}px`,
    backgroundPosition: `${bgX}px ${bgY}px`,
    backgroundRepeat: "no-repeat",
    transform: flip ? "scaleX(-1)" : undefined,
    imageRendering: "pixelated",
  };

  return (
    <div
      className={`${styles.sprite} ${knockback ? (flip ? styles.knockbackLeft : styles.knockbackRight) : ""}`}
      style={spriteStyle}
    />
  );
}
