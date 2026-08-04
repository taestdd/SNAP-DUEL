"use client";

import { useEffect, useState } from "react";
import styles from "./HitEffect.module.css";

/** 타격 이펙트 프레임 — hit1 → hit2 → hit3 순서로 연속 재생 */
const FRAME_SRCS = [
  "/sprites/effects/hit1.png",
  "/sprites/effects/hit2.png",
  "/sprites/effects/hit3.png",
];

/** 프레임당 표시 시간 (ms) — 전체 재생 ≈ FRAME_MS × 3 후 페이드아웃 */
const FRAME_MS = 90;

// 첫 타격에서 프레임 로딩 깜빡임이 없도록 모듈 로드 시 미리 캐시
if (typeof window !== "undefined") {
  for (const src of FRAME_SRCS) {
    const img = new Image();
    img.src = src;
  }
}

export default function HitEffect({
  strength = "weak",
  style,
}: {
  strength?: "weak" | "strong";
  style?: React.CSSProperties;
}) {
  const [frameIdx, setFrameIdx] = useState(0);
  // 에셋 미배포 상태에서 깨진 이미지 아이콘이 노출되지 않도록 로드 실패 시 숨김
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIdx((prev) => {
        if (prev >= FRAME_SRCS.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, FRAME_MS);
    return () => clearInterval(interval);
  }, []);

  if (failed) return null;

  return (
    <div className={styles.wrap} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={FRAME_SRCS[frameIdx]}
        alt=""
        className={`${styles.burst} ${strength === "strong" ? styles.burstStrong : ""}`}
        draggable={false}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
