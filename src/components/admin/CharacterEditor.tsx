"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";
import type { CardEffect } from "@/game/engine/types";
import { CardTagSchema } from "@/game/engine/cardSchema";
import { CHARACTER_SPRITES } from "@/game/animation/spriteMap";
import EffectListEditor from "./EffectListEditor";
import styles from "./DeckEditor.module.css";

interface Props {
  initial?: CharacterDefSchemaType;
  mode: "create" | "edit";
}

const AVAILABLE_TAGS = CardTagSchema.options;
const SPRITE_IDS = Object.keys(CHARACTER_SPRITES);

/** 저장된 효과(단일 | 배열 | null)를 편집용 배열로 편다 */
function toEffectList(value: CharacterDefSchemaType["entryEffect"] | undefined): CardEffect[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** 편집용 배열을 저장 형태로 — 0개는 null, 1개는 단일(기존 데이터 형태 유지) */
function fromEffectList(list: CardEffect[]): CharacterDefSchemaType["entryEffect"] {
  if (list.length === 0) return null;
  return list.length === 1 ? list[0] : list;
}

export default function CharacterEditor({ initial, mode }: Props) {
  const router = useRouter();

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [maxHp, setMaxHp] = useState(initial?.maxHp ?? 10);
  const [spriteId, setSpriteId] = useState(initial?.spriteId ?? "");
  const [affinities, setAffinities] = useState<string[]>(initial?.affinities ?? []);
  const [entryEffects, setEntryEffects] = useState<CardEffect[]>(toEffectList(initial?.entryEffect));
  const [exitEffects, setExitEffects] = useState<CardEffect[]>(toEffectList(initial?.exitEffect));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleAffinity(tag: string) {
    setAffinities((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
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
        entryEffect: fromEffectList(entryEffects),
        exitEffect: fromEffectList(exitEffects),
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
        <Link href="/admin?tab=characters" className={styles.backLink}>← 목록</Link>
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
            <label className={styles.label}>스프라이트 *</label>
            <select
              className={styles.input}
              value={spriteId}
              onChange={(e) => setSpriteId(e.target.value)}
              required
            >
              <option value="">선택...</option>
              {SPRITE_IDS.map((sid) => <option key={sid} value={sid}>{sid}</option>)}
              {/* 목록에 없는 기존 값도 잃지 않도록 남겨둔다 */}
              {spriteId && !SPRITE_IDS.includes(spriteId) && (
                <option value={spriteId}>{spriteId} (등록되지 않은 스프라이트)</option>
              )}
            </select>
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

        <div className={styles.charSection}>
          <div className={styles.sectionTitle}>진입 효과 (이 캐릭터로 교체될 때)</div>
          <EffectListEditor
            effects={entryEffects}
            onChange={setEntryEffects}
            addLabel="+ 진입 효과 추가"
            emptyHint="효과 없음 — 등장할 때 아무 일도 일어나지 않습니다."
          />
        </div>

        <div className={styles.charSection}>
          <div className={styles.sectionTitle}>퇴장 효과 (이 캐릭터에서 교체될 때)</div>
          <EffectListEditor
            effects={exitEffects}
            onChange={setExitEffects}
            addLabel="+ 퇴장 효과 추가"
            emptyHint="효과 없음 — 물러날 때 아무 일도 일어나지 않습니다."
          />
        </div>

        <div className={styles.footer}>
          <Link href="/admin?tab=characters" className={styles.cancelLink}>취소</Link>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? "저장 중..." : mode === "create" ? "캐릭터 생성" : "캐릭터 수정"}
          </button>
        </div>
      </form>
    </div>
  );
}
