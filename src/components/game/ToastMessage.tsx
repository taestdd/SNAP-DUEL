"use client";

import styles from "./ToastMessage.module.css";

export default function ToastMessage({ message }: { message: string }) {
  return <div className={styles.toast}>{message}</div>;
}
