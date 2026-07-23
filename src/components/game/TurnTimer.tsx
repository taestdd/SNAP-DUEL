import styles from "./TurnTimer.module.css";

/** 남은 시간이 이 미만이면 경고 스타일 (ms) */
const URGENT_MS = 5_000;

/**
 * 턴 시간제약 카운트다운 표시 (표시 전용 — 만료 강제는 useTurnTimer가 담당).
 * 내 차례면 강조, 상대 차례면 흐리게.
 */
export default function TurnTimer({
  remainingMs,
  isMyTimer,
}: {
  remainingMs: number;
  isMyTimer: boolean;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = isMyTimer && remainingMs < URGENT_MS;

  return (
    <div
      className={[
        styles.pill,
        isMyTimer ? styles.mine : styles.theirs,
        urgent ? styles.urgent : "",
      ].join(" ")}
    >
      <span className={styles.icon}>⏱</span>
      <span className={styles.seconds}>{seconds}</span>
    </div>
  );
}
