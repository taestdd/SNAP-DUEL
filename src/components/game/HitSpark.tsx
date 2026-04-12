"use client";

import styles from "./HitSpark.module.css";

const ANGLES = [0, 60, 120, 180, 240, 300];

export default function HitSpark({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className={styles.spark}>
      {ANGLES.map((deg) => (
        <div
          key={deg}
          className={styles.rayWrapper}
          style={{ transform: `rotate(${deg}deg)` }}
        >
          <div className={styles.ray} />
        </div>
      ))}
    </div>
  );
}
