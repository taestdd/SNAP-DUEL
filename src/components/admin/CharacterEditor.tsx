"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";
import { CardTagSchema } from "@/game/engine/cardSchema";
import styles from "./DeckEditor.module.css";

interface Props {
  initial?: CharacterDefSchemaType;
  mode: "create" | "edit";
}

const AVAILABLE_TAGS = CardTagSchema.options;

export default function CharacterEditor({ initial, mode }: Props) {
  const router = useRouter();

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [maxHp, setMaxHp] = useState(initial?.maxHp ?? 10);
  const [spriteId, setSpriteId] = useState(initial?.spriteId ?? "");
  const [affinities, setAffinities] = useState<string[]>(initial?.affinities ?? []);
  const [entryEffect, setEntryEffect] = useState(
    initial?.entryEffect ? JSON.stringify(initial.entryEffect, null, 2) : ""
  );
  const [exitEffect, setExitEffect] = useState(
    initial?.exitEffect ? JSON.stringify(initial.exitEffect, null, 2) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleAffinity(tag: string) {
    setAffinities((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function parseEffect(raw: string) {
    if (!raw.trim()) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("효과 JSON 파싱 실패");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const payload: CharacterDefSchemaType = {
        id,
        name,
        maxHp,
        spriteId,
        affinities,
        entryEffect: parseEffect(entryEffect),
        exitEffect: parseEffect(exitEffect),
      };

      const url = mode === "create" ? "/api/admin/characters" : `/api/admin/characters/${id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data.error?.fieldErrors
          ? Object.entries(data.error.fieldErrors)
              .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
              .join("\n")
          : data.error ?? "저장 실패";
        setError(msg);
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/admin?tab=characters"), 800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/admin" className={styles.backLink}>← 목록</Link>
        <h1 className={styles.title}>
          {mode === "create" ? "새 캐릭터 만들기" : `편집: ${initial?.id}`}
        </h1>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {success && <div className={styles.successBox}>저장 완료! 목록으로 이동 중...</div>}

      <form onSubmit={handleSubmit}>
        <div className={styles.metaRow}>
          <div className={styles.field}>
            <label className={styles.label}>ID * (소문자, 숫자, _)</label>
            <input
              className={styles.input}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="fighter"
              disabled={mode === "edit"}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>이름 *</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="길거리 격투가"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>최대 HP *</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={maxHp}
              onChange={(e) => setMaxHp(Number(e.target.value))}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>스프라이트 ID * (예: a, b)</label>
            <input
              className={styles.input}
              value={spriteId}
              onChange={(e) => setSpriteId(e.target.value)}
              placeholder="a"
              required
            />
          </div>
        </div>

        <div className={styles.charSection}>
          <div className={styles.sectionTitle}>친화 태그 (사용 가능한 카드 조건)</div>
          <div className={styles.charBtns}>
            {AVAILABLE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`${styles.charBtn} ${affinities.includes(tag) ? styles.charBtnActive : ""}`}
                onClick={() => toggleAffinity(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.metaRow}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>진입 효과 (JSON, 없으면 빈칸)</label>
            <textarea
              className={styles.input}
              rows={4}
              value={entryEffect}
              onChange={(e) => setEntryEffect(e.target.value)}
              placeholder={'{"type": "draw", "value": 1, "target": "self"}'}
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>퇴장 효과 (JSON, 없으면 빈칸)</label>
            <textarea
              className={styles.input}
              rows={4}
              value={exitEffect}
              onChange={(e) => setExitEffect(e.target.value)}
              placeholder={'{"type": "draw", "value": 1, "target": "self"}'}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <Link href="/admin" className={styles.cancelLink}>취소</Link>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? "저장 중..." : mode === "create" ? "캐릭터 생성" : "캐릭터 수정"}
          </button>
        </div>
      </form>
    </div>
  );
}
