import styles from "./ActionLog.module.css";

type LogStyle = { icon: string; colorClass: string };

function getLogStyle(line: string): LogStyle {
  if (/^━━ Turn/.test(line))
    return { icon: "", colorClass: styles.divider };
  if (/resolves "/i.test(line))
    return { icon: "⚔️", colorClass: styles.red };
  if (/\ddmg|Damage|blocked —|missed —/i.test(line))
    return { icon: "⚔️", colorClass: styles.red };
  if (/cancelled —/i.test(line))
    return { icon: "❌", colorClass: styles.gray };
  if (/heals|gains \d+ Block|recover/i.test(line))
    return { icon: "💚", colorClass: styles.green };
  if (/draws \d|Round \d+ begins/i.test(line))
    return { icon: "✨", colorClass: styles.blue };
  if (/tags out|tags in|tags without/i.test(line))
    return { icon: "🔄", colorClass: styles.yellow };
  if (/takes initiative/i.test(line))
    return { icon: "🔄", colorClass: styles.yellow };
  if (/exhausted|discards|hand limit/i.test(line))
    return { icon: "❌", colorClass: styles.gray };
  if (/SPEED|ATK \+|Burned|gains SPEED/i.test(line))
    return { icon: "⚡", colorClass: styles.orange };
  if (/airborne/i.test(line))
    return { icon: "🌀", colorClass: styles.sky };
  if (/passes and draws/i.test(line))
    return { icon: "✨", colorClass: styles.blue };
  return { icon: "•", colorClass: styles.dim };
}

type CombinedEntry =
  | { source: "game"; line: string; key: string }
  | { source: "anim"; line: string; key: string };

export default function ActionLog({
  log,
  animEntries = [],
}: {
  log: string[];
  animEntries?: string[];
}) {
  const combined: CombinedEntry[] = [
    ...log.map((line, idx) => ({ source: "game" as const, line, key: `g-${idx}` })),
    ...animEntries.map((line, idx) => ({ source: "anim" as const, line, key: `a-${idx}` })),
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        {combined.length === 0 ? (
          <div className={styles.empty}>No actions yet.</div>
        ) : (
          combined.map((entry) => {
            if (entry.source === "anim") {
              return (
                <div key={entry.key} className={`${styles.line} ${styles.purple}`}>
                  <span className={styles.icon}>🟣</span>
                  <span className={styles.text}>{entry.line}</span>
                </div>
              );
            }
            const { icon, colorClass } = getLogStyle(entry.line);
            if (colorClass === styles.divider) {
              return (
                <div key={entry.key} className={styles.divider}>
                  {entry.line}
                </div>
              );
            }
            return (
              <div key={entry.key} className={`${styles.line} ${colorClass}`}>
                {icon && <span className={styles.icon}>{icon}</span>}
                <span className={styles.text}>{entry.line}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
