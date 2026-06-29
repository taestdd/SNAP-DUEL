"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./BattleAnnounce.module.css";

export type AnnounceVariant = "round" | "ready" | "fight" | "turn" | "clash";
export type AnnounceStep = { text: string; variant: AnnounceVariant; ms: number };

/**
 * 격투게임 스타일 중앙 대형 안내 오버레이.
 * steps를 순차로 재생하고(각 step.ms 동안), 마지막까지 끝나면 onDone()을 호출한다.
 * - 라운드 인트로: ROUND N → READY? → FIGHT! (3-step)
 * - 턴 시작: TURN N (1-step)
 * - 전투 시작: 전투 시작 (1-step)
 */
export default function BattleAnnounce({ steps, onDone }: { steps: AnnounceStep[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (let k = 1; k < steps.length; k++) {
      acc += steps[k - 1].ms;
      const idx = k;
      timers.push(setTimeout(() => setI(idx), acc));
    }
    acc += steps[steps.length - 1].ms;
    timers.push(setTimeout(() => onDoneRef.current(), acc));
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = steps[i];
  return (
    <div className={styles.overlay}>
      <div key={i} className={`${styles.text} ${styles[cur.variant]}`}>
        {cur.text}
      </div>
    </div>
  );
}
