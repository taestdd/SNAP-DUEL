"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FighterPose } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import { CHARACTER_SPRITES, frameToBackgroundPosition, backgroundSize } from "@/game/animation/spriteMap";
import styles from "./FighterSprite.module.css";

interface FighterSpriteProps {
  pose: FighterPose;
  /**
   * 값이 바뀌면 애니메이션을 첫 프레임부터 재시작
   * (같은 포즈를 다시 재생할 때도 key처럼 사용)
   */
  poseKey: string | number;
  characterId: string;
  /** true = scaleX(-1) 로 좌우 반전 (AI측 파이터) */
  flip?: boolean;
  className?: string;
  /** Date.now() + durationMs — 이 시각까지 프레임 진행을 멈춤 (히트스톱) */
  frozenUntil?: number;
  /** 값이 바뀔 때마다 흰색 플래시 재생 (피격 시) */
  flashKey?: number;
  /** delayAdvantage/delayAdvantageNext 활성 시 청록 잔상 표시 */
  showTrail?: boolean;
}

export default function FighterSprite({
  pose,
  poseKey,
  characterId,
  flip = false,
  className,
  frozenUntil = 0,
  flashKey = 0,
  showTrail = false,
}: FighterSpriteProps) {
  const spriteId = CHARACTERS[characterId]?.spriteId ?? characterId;
  const config = CHARACTER_SPRITES[spriteId] ?? Object.values(CHARACTER_SPRITES)[0]!;
  const entry = config.poses[pose];
  const [frameIdx, setFrameIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frozenUntilRef = useRef(frozenUntil);
  frozenUntilRef.current = frozenUntil;
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const spriteRef = useRef<HTMLDivElement>(null);

  const startInterval = useCallback((ms: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setFrameIdx((prev) => {
        if (Date.now() < frozenUntilRef.current) return prev;
        const next = prev + 1;
        if (next >= entryRef.current.frames.length) {
          if (entryRef.current.hold) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            return prev;
          }
          return 0;
        }
        return next;
      });
    }, ms);
  }, []);

  useEffect(() => {
    setFrameIdx(0);
    startInterval(Math.round(1000 / entry.fps));
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseKey, pose]);

  // hold:true 포즈에서 interval이 클리어된 뒤 frozenUntil이 세팅되면 interval 재시작
  useEffect(() => {
    if (frozenUntil <= Date.now()) return;
    if (intervalRef.current !== null) return; // 이미 살아있으면 스킵
    startInterval(Math.round(1000 / entry.fps));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenUntil]);

  useLayoutEffect(() => {
    if (flashKey === 0) return;
    const el = spriteRef.current;
    if (!el) return;
    el.classList.remove(styles.flashing);
    void el.offsetWidth; // reflow → 애니메이션 재시작
    el.classList.add(styles.flashing);
  }, [flashKey]);

  const absoluteFrame = entry.frames[frameIdx] ?? entry.frames[0];
  const bgStyle = {
    backgroundImage: `url("${config.imagePath}")`,
    backgroundPosition: frameToBackgroundPosition(absoluteFrame, config.sheet),
    backgroundSize: backgroundSize(config.sheet),
  };

  return (
    <div className={`${styles.spriteWrap} ${flip ? styles.flip : ""} ${className ?? ""}`}>
      {/* 속도 잔상: flip 컨텍스트 안에 있으므로 translateX(-N)이 항상 '뒤쪽'으로 이동 */}
      <div className={styles.trailWrap} style={{ opacity: showTrail ? 1 : 0 }}>
        <div className={`${styles.sprite} ${styles.trail2}`} style={bgStyle} aria-hidden="true" />
        <div className={`${styles.sprite} ${styles.trail1}`} style={bgStyle} aria-hidden="true" />
      </div>
      <div
        ref={spriteRef}
        className={`${styles.sprite} ${styles.spriteMain}`}
        style={bgStyle}
        aria-hidden="true"
      />
    </div>
  );
}
