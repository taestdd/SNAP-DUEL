import styles from "./CostBox.module.css";

export default function CostBox({
  value,
  size = "sm",
  disabled = false,
  className,
  children,
}: {
  value: number | string;
  size?: "sm" | "lg";
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={[
        styles.box,
        size === "lg" ? styles.lg : styles.sm,
        disabled ? styles.disabled : "",
        className ?? "",
      ].join(" ")}
    >
      {value}
      {children}
    </div>
  );
}
