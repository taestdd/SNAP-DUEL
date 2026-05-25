import styles from "./EndTurnButton.module.css";

export default function EndTurnButton({
  label,
  disabled,
  onClick,
  variant = "default",
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  variant?: "default" | "primary";
}) {
  return (
    <button
      className={[
        styles.btn,
        variant === "primary" ? styles.primary : "",
        disabled ? styles.disabled : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}