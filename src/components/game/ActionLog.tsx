import styles from "./ActionLog.module.css";

export default function ActionLog({ log }: { log: string[] }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Action Log</div>
      <div className={styles.box}>
        {log.length === 0 ? (
          <div className={styles.empty}>No actions yet.</div>
        ) : (
          log.slice(0, 16).map((line, idx) => (
            <div key={idx} className={styles.line}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}