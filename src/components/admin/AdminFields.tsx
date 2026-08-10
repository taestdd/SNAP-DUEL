"use client";

import { useEffect, useState } from "react";
import styles from "./AdminForm.module.css";

/**
 * 어드민 폼 공용 입력 컴포넌트.
 * CardEditor·EffectListEditor·CharacterEditor가 같은 모양을 쓰도록 한 곳에 모은다.
 */

export function NumericInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: number;
  onChange: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [str, setStr] = useState(String(value));

  useEffect(() => { setStr(String(value)); }, [value]);

  return (
    <input
      {...rest}
      type="number"
      className={className}
      value={str}
      onChange={(e) => setStr(e.target.value)}
      onBlur={() => {
        const n = Number(str);
        const final = str.trim() === "" || isNaN(n) ? 0 : n;
        onChange(final);
        setStr(String(final));
      }}
    />
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  children: React.ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {children}
      </select>
    </div>
  );
}

export function NumericField({
  label,
  ...rest
}: {
  label: string;
} & Omit<React.ComponentProps<typeof NumericInput>, "className">) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <NumericInput className={styles.input} {...rest} />
    </div>
  );
}

/** 체크박스로 "미지정"을 표현하는 숫자 입력 — min/max처럼 생략 가능한 필드용 */
export function OptionalNumericField({
  label,
  value,
  onChange,
  fallback,
  ...rest
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  /** 체크를 켤 때 채워 넣을 초기값 (HTML placeholder와 무관) */
  fallback: number;
} & Omit<React.ComponentProps<typeof NumericInput>, "value" | "onChange" | "className">) {
  const enabled = value !== undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? fallback : undefined)}
        />{" "}
        {label}
      </label>
      <NumericInput
        {...rest}
        className={styles.input}
        value={value ?? fallback}
        onChange={(n) => { if (enabled) onChange(n); }}
        disabled={!enabled}
      />
    </div>
  );
}

export function ItemCard({ title, onRemove, children }: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.effectItem}>
      <div className={styles.effectHeader}>
        <span className={styles.effectIndex}>{title}</span>
        <button type="button" className={styles.removeBtn} onClick={onRemove}>
          ✕ 삭제
        </button>
      </div>
      {children}
    </div>
  );
}
