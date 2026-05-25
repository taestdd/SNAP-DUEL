import styles from "./SpeedCircle.module.css";

export default function SpeedCircle({
  value,
  bonus = 0,
  disabled = false,
}: {
  value: number;
  bonus?: number;
  disabled?: boolean;
}) {
  return (
    <div
      className={[
        styles.circle,
        bonus > 0 ? styles.down : bonus < 0 ? styles.up : "",
        disabled ? styles.disabled : "",
      ].join(" ")}
    >
      {value}
    </div>
  );
}
