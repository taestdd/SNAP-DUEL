import styles from "./ActionLog.module.css";

type LineStyle = {
  color: string;
  opacity?: number;
  textDecoration?: string;
  fontWeight?: string;
  textAlign?: "center" | "left";
  borderBottom?: string;
  paddingBottom?: string;
  marginBottom?: string;
};

function getLineStyle(line: string): LineStyle {
  if (line.startsWith("---")) {
    return {
      color: "#94a3b8",
      fontWeight: "bold",
      textAlign: "center",
      borderBottom: "1px solid rgba(148,163,184,0.25)",
      paddingBottom: "4px",
      marginBottom: "2px",
    };
  }
  if (line.startsWith("⚔️")) return { color: "#ff6b6b" };
  if (line.startsWith("💚")) return { color: "#51cf66" };
  if (line.startsWith("✨")) return { color: "#74c0fc" };
  if (line.startsWith("🔄")) return { color: "#ffd43b" };
  if (line.startsWith("❌")) return { color: "#868e96", textDecoration: "line-through" };
  if (line.startsWith("⚡")) return { color: "#ff922b" };
  if (line.startsWith("🌀")) return { color: "#74c7ec" };
  if (line.startsWith("🔥")) return { color: "#f76707" };
  if (line.startsWith("🛡️")) return { color: "#a9e34b" };
  if (line.startsWith("▶")) return { color: "#e2c58b", fontWeight: "bold" };
  if (line.startsWith("🂠")) return { color: "#b197fc" };
  return { color: "rgba(255,255,255,0.75)" };
}

export default function ActionLog({ log }: { log: string[] }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        {log.length === 0 ? (
          <div className={styles.empty}>No actions yet.</div>
        ) : (
          log.map((line, idx) => {
            const s = getLineStyle(line);
            return (
              <div
                key={idx}
                className={styles.line}
                style={s as React.CSSProperties}
              >
                {line}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
