"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
  const frozenUntilRef = useRef(frozenUntil);
  frozenUntilRef.current = frozenUntil;
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const spriteRef = useRef<HTMLDivElement>(null);

  // 포즈 클럭 기준점 + 누적 freeze 시간. rAF마다 "지금이 몇 번째 프레임인지"를
  // 경과시간으로 다시 계산한다 — setInterval 카운터(+1씩 누적)와 달리 한 틱이
  // 늦게 걸려도 다음 틱에서 스스로 보정되고, 리액트 effect 스케줄 지연(useEffect는
  // 페인트 이후 실행)으로 클럭 시작점 자체가 밀리는 것도 useLayoutEffect로 시작점을
  // 커밋 직후(페인트 전)에 못박아 없앤다. (히트 프레임이 한 프레임 일찍 보이던 버그 수정)
  const startedAtRef = useRef(0);
  const frozenAccumRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const now = Date.now();
    startedAtRef.current = now;
    frozenAccumRef.current = 0;
    lastTickRef.current = now;
    setFrameIdx(0);

    const frameMs = 1000 / entry.fps;

    function tick() {
      const nowTick = Date.now();
      if (nowTick < frozenUntilRef.current) {
        frozenAccumRef.current += nowTick - lastTickRef.current;
      }
      lastTickRef.current = nowTick;

      const elapsed = nowTick - startedAtRef.current - frozenAccumRef.current;
      const raw = Math.round(elapsed / frameMs);
      const len = entryRef.current.frames.length;
      const idx = entryRef.current.hold
        ? Math.min(Math.max(raw, 0), len - 1)
        : ((raw % len) + len) % len;

      setFrameIdx((prev) => (prev === idx ? prev : idx));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseKey, pose]);

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
