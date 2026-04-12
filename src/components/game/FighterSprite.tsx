"use client";

import { useEffect, useRef, useState } from "react";
import type { FighterViewState } from "@/game/engine/types";
import { SPRITE_MAP } from "@/game/animation/spriteMap";
import styles from "./FighterSprite.module.css";

export default function FighterSprite({
  viewState,
  flip = false,
}: {
  viewState: FighterViewState;
  flip?: boolean;
}) {
  const { pose, poseKey, hold, impactTick } = viewState;
  const seq = SPRITE_MAP[pose];

  const [frameIndex, setFrameIndex] = useState(0);
  const [knockback, setKnockback] = useState(false);

  const holdRef = useRef(hold);
  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);

  const prevImpactTickRef = useRef(impactTick);

  // poseKey 변경 시 프레임 리셋 + 인터벌 재시작
  useEffect(() => {
    setFrameIndex(0);

    const handle = { id: undefined as ReturnType<typeof setInterval> | undefined };
    handle.id = setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1;
        if (next >= seq.frames.length) {
          if (seq.loop && !holdRef.current) return 0;
          clearInterval(handle.id);
          return seq.frames.length - 1;
        }
        return next;
      });
    }, 1000 / seq.fps);

    return () => { if (handle.id !== undefined) clearInterval(handle.id); };
  }, [poseKey, seq]);

  // impactTick 변경 시 넉백 애니메이션
  useEffect(() => {
    if (prevImpactTickRef.current !== impactTick) {
      prevImpactTickRef.current = impactTick;
      setKnockback(true);
      const timer = setTimeout(() => setKnockback(false), 300);
      return () => clearTimeout(timer);
    }
  }, [impactTick]);

  const frame = seq.frames[Math.min(frameIndex, seq.frames.length - 1)];

  const transforms: string[] = [];
  if (flip) transforms.push("scaleX(-1)");
  if (knockback) {
    // 넉백: flip=false(플레이어, 왼쪽)→왼쪽, flip=true(AI, 오른쪽)→오른쪽
    transforms.push(flip ? "translateX(12px)" : "translateX(-12px)");
  }

  return (
    <div
      className={styles.sprite}
      style={{
        backgroundPosition: `${frame.x}px ${frame.y}px`,
        transform: transforms.length > 0 ? transforms.join(" ") : undefined,
      }}
    />
  );
}
