"use client";

import styles from "./HitEffect.module.css";

const SPARKS_WEAK = [
  { dx:   0, dy: -24 },
  { dx:  17, dy: -17 },
  { dx:  24, dy:   0 },
  { dx:  17, dy:  17 },
  { dx:   0, dy:  24 },
  { dx: -17, dy:  17 },
  { dx: -24, dy:   0 },
  { dx: -17, dy: -17 },
];

const SPARKS_STRONG = SPARKS_WEAK.map(({ dx, dy }) => ({
  dx: Math.round(dx * 1.7),
  dy: Math.round(dy * 1.7),
}));

export default function HitEffect({
  strength = "weak",
  style,
}: {
  strength?: "weak" | "strong";
  style?: React.CSSProperties;
}) {
  const sparks = strength === "strong" ? SPARKS_STRONG : SPARKS_WEAK;
  const isStrong = strength === "strong";

  return (
    <div className={styles.wrap} style={style}>
      <div className={`${styles.center} ${isStrong ? styles.centerStrong : ""}`} />
      <div className={`${styles.ring}   ${isStrong ? styles.ringStrong   : ""}`} />
      {sparks.map(({ dx, dy }, i) => (
        <div
          key={i}
          className={`${styles.spark} ${isStrong ? styles.sparkStrong : ""}`}
          style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
