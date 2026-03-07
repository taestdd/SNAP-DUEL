import styles from "./EndTurnButton.module.css";

export default function EndTurnButton({
  label,
  disabled,
  onClick,
}: {
  label: string; 
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
    className={`${styles.btn} ${disabled ? styles.disabled : ""}`}
    disabled={disabled}
    onClick={onClick}>
      {label}
    </button>
  );
}