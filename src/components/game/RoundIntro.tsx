"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./RoundIntro.module.css";

// 각 단계 표시 시간 (ms): ROUND N → READY? → FIGHT!
const STEP_MS = [900, 700, 700];

/**
 * 격투게임 스타일 라운드 인트로 오버레이.
 * "ROUND N" → "READY?" → "FIGHT!"를 순차로 중앙에 크게 띄우고,
 * 마지막 단계까지 끝나면 onDone()을 호출한다 (입력 잠금 해제용).
 */
export default function RoundIntro({ round, onDone }: { round: number; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (let i = 1; i < STEP_MS.length; i++) {
      acc += STEP_MS[i - 1];
      const idx = i;
      timers.push(setTimeout(() => setStep(idx), acc));
    }
    acc += STEP_MS[STEP_MS.length - 1];
    timers.push(setTimeout(() => onDoneRef.current(), acc));
    return () => timers.forEach(clearTimeout);
  }, []);

  const labels = [`ROUND ${round}`, "READY?", "FIGHT!"];
  const stepClass = step === 2 ? styles.fight : step === 1 ? styles.ready : styles.round;

  return (
    <div className={styles.overlay}>
      <div key={step} className={`${styles.text} ${stepClass}`}>
        {labels[step]}
      </div>
    </div>
  );
}
