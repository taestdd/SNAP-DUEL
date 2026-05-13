"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./CardEditor.module.css";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import type { CardEffect } from "@/game/engine/types";

const ACTION_TAGS = [
  "block", "draw", "tag_switch", "reclaim",
  "weak_punch", "strong_punch", "aerial_punch",
  "weak_kick", "strong_kick", "aerial_kick",
  "dragon_kick", "rising_punch", "hadouken", "use_item",
] as const;

const HIT_POSES = ["hit_weak", "hit_strong", "hit_aerial"] as const;
const CARD_TAGS = ["마법", "검술", "격투", "방어", "방패", "한손검"] as const;
const EFFECT_TYPES = [
  "damage", "block", "draw", "draw_tagged",
  "heal", "buff_attack", "burn", "tag", "airborne", "move_cards", "shuffle", "generate",
] as const;
const TARGETS = ["self", "enemy"] as const;
const DAMAGE_TYPES = ["ground", "anti-air"] as const;
const ZONES = ["hand", "deck", "trash", "cooldown", "queue"] as const;
const POSITIONS = ["top", "bottom", "random"] as const;

function emptyEffect(): CardEffect {
  return { type: "damage", value: 0, target: "enemy" };
}

interface Props {
  initial?: CardSchemaType;
  mode: "create" | "edit";
}

export default function CardEditor({ initial, mode }: Props) {
  const router = useRouter();

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [cost, setCost] = useState(initial?.cost ?? 0);
  const [speed, setSpeed] = useState(initial?.speed ?? 1);
  const [gain, setGain] = useState(initial?.gain ?? 0);
  const [text, setText] = useState(initial?.text ?? "");
  const [useCondition, setUseCondition] = useState<string>(initial?.useCondition ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [actionTag, setActionTag] = useState<string>(initial?.actionTag ?? "");
  const [actionTagAirborne, setActionTagAirborne] = useState<string>(initial?.actionTagAirborne ?? "");
  const [effects, setEffects] = useState<CardEffect[]>(
    initial?.effects ?? [emptyEffect()]
  );
  const [hitTimings, setHitTimings] = useState(
    initial?.hitTimings ?? []
  );
  const [superFlash, setSuperFlash] = useState(initial?.superFlash ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function updateEffect(index: number, patch: Partial<CardEffect>) {
    setEffects((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function removeEffect(index: number) {
    setEffects((prev) => prev.filter((_, i) => i !== index));
  }

  function addHitTiming() {
    setHitTimings((prev) => [...prev, { ms: 200, ground: "hit_weak" as const, airborne: "hit_aerial" as const }]);
  }

  function updateHitTiming(index: number, patch: Partial<{ ms: number; ground: "hit_weak" | "hit_strong" | "hit_aerial"; airborne: "hit_weak" | "hit_strong" | "hit_aerial" }>) {
    setHitTimings((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeHitTiming(index: number) {
    setHitTimings((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    const payload: CardSchemaType = {
      id,
      name,
      cost,
      speed,
      gain,
      text,
      effects,
      ...(useCondition ? { useCondition: useCondition as "ground" | "airborne" } : {}),
      ...(tags.length > 0 ? { tags: tags as CardSchemaType["tags"] } : {}),
      ...(actionTag ? { actionTag: actionTag as CardSchemaType["actionTag"] } : {}),
      ...(actionTagAirborne ? { actionTagAirborne: actionTagAirborne as CardSchemaType["actionTag"] } : {}),
      ...(hitTimings.length > 0 ? { hitTimings: hitTimings as CardSchemaType["hitTimings"] } : {}),
      ...(superFlash ? { superFlash: true } : {}),
    };

    try {
      const url = mode === "create" ? "/api/admin/cards" : `/api/admin/cards/${id}`;
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
        setTimeout(() => router.push("/admin"), 800);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/admin" className={styles.backLink}>← 목록</Link>
        <h1 className={styles.title}>
          {mode === "create" ? "새 카드 만들기" : `편집: ${initial?.id}`}
        </h1>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {success && <div className={styles.successBox}>저장 완료! 목록으로 이동 중...</div>}

      <form onSubmit={handleSubmit}>
        {/* 기본 정보 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>기본 정보</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>ID *</label>
              <input
                className={styles.input}
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="weak_punch"
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
                placeholder="Weak Punch"
                required
              />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>코스트</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>스피드</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>게인</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={gain}
                onChange={(e) => setGain(Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>사용 조건</label>
              <select
                className={styles.select}
                value={useCondition}
                onChange={(e) => setUseCondition(e.target.value)}
              >
                <option value="">없음</option>
                <option value="ground">ground</option>
                <option value="airborne">airborne</option>
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>슈퍼 플래시</label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={superFlash}
                onChange={(e) => setSuperFlash(e.target.checked)}
              />
              발동 시 슈퍼 플래시 연출
            </label>
          </div>
          <div className={styles.fieldFull}>
            <label className={styles.label}>카드 설명 *</label>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="카드 효과를 설명하는 텍스트"
              required
            />
          </div>
        </div>

        {/* 태그 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>카드 태그</div>
          <div className={styles.tagGroup}>
            {CARD_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`${styles.tagBtn} ${tags.includes(tag) ? styles.active : ""}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* 애니메이션 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>애니메이션</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Action Tag</label>
              <select
                className={styles.select}
                value={actionTag}
                onChange={(e) => setActionTag(e.target.value)}
              >
                <option value="">없음</option>
                {ACTION_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Action Tag (공중)</label>
              <select
                className={styles.select}
                value={actionTagAirborne}
                onChange={(e) => setActionTagAirborne(e.target.value)}
              >
                <option value="">없음</option>
                {ACTION_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Hit Timings */}
          <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Hit Timings</div>
          {hitTimings.map((ht, i) => (
            <div key={i} className={styles.hitTimingItem}>
              <div className={styles.field}>
                <label className={styles.label}>ms</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  value={ht.ms}
                  onChange={(e) => updateHitTiming(i, { ms: Number(e.target.value) })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Ground 포즈</label>
                <select
                  className={styles.select}
                  value={ht.ground}
                  onChange={(e) => updateHitTiming(i, { ground: e.target.value as "hit_weak" | "hit_strong" | "hit_aerial" })}
                >
                  {HIT_POSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Airborne 포즈</label>
                <select
                  className={styles.select}
                  value={ht.airborne}
                  onChange={(e) => updateHitTiming(i, { airborne: e.target.value as "hit_weak" | "hit_strong" | "hit_aerial" })}
                >
                  {HIT_POSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button type="button" className={styles.removeBtn} onClick={() => removeHitTiming(i)}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className={styles.addBtn} onClick={addHitTiming}>
            + Hit Timing 추가
          </button>
        </div>

        {/* 효과 빌더 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>효과 (Effects) *</div>
          {effects.map((effect, i) => (
            <div key={i} className={styles.effectItem}>
              <div className={styles.effectHeader}>
                <span className={styles.effectIndex}>효과 #{i + 1}</span>
                {effects.length > 1 && (
                  <button type="button" className={styles.removeBtn} onClick={() => removeEffect(i)}>
                    ✕ 삭제
                  </button>
                )}
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Type *</label>
                  <select
                    className={styles.select}
                    value={effect.type}
                    onChange={(e) => updateEffect(i, { type: e.target.value as CardEffect["type"] })}
                  >
                    {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* value - 대부분 타입에 해당 */}
                {!["tag", "move_cards", "shuffle", "generate"].includes(effect.type) && (
                  <div className={styles.field}>
                    <label className={styles.label}>Value</label>
                    <input
                      className={styles.input}
                      type="number"
                      value={effect.value ?? 0}
                      onChange={(e) => updateEffect(i, { value: Number(e.target.value) })}
                    />
                  </div>
                )}

                {/* target */}
                {!["tag"].includes(effect.type) && (
                  <div className={styles.field}>
                    <label className={styles.label}>Target</label>
                    <select
                      className={styles.select}
                      value={effect.target ?? "enemy"}
                      onChange={(e) => updateEffect(i, { target: e.target.value as "self" | "enemy" })}
                    >
                      {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* damage 전용: damageType */}
              {effect.type === "damage" && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Damage Type</label>
                    <select
                      className={styles.select}
                      value={effect.damageType ?? ""}
                      onChange={(e) => updateEffect(i, { damageType: (e.target.value || undefined) as CardEffect["damageType"] })}
                    >
                      <option value="">항상 적용</option>
                      {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* move_cards 전용 */}
              {effect.type === "move_cards" && (
                <>
                  <div className={styles.row}>
                    <div className={styles.field}>
                      <label className={styles.label}>From Zone</label>
                      <select
                        className={styles.select}
                        value={effect.fromZone ?? "deck"}
                        onChange={(e) => updateEffect(i, { fromZone: e.target.value as CardEffect["fromZone"] })}
                      >
                        {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>To Zone</label>
                      <select
                        className={styles.select}
                        value={effect.toZone ?? "hand"}
                        onChange={(e) => updateEffect(i, { toZone: e.target.value as CardEffect["toZone"] })}
                      >
                        {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Count</label>
                      <input
                        className={styles.input}
                        type="number"
                        min={1}
                        value={effect.count ?? 1}
                        onChange={(e) => updateEffect(i, { count: Number(e.target.value) })}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>To Position</label>
                      <select
                        className={styles.select}
                        value={effect.toPosition ?? ""}
                        onChange={(e) => updateEffect(i, { toPosition: (e.target.value || undefined) as CardEffect["toPosition"] })}
                      >
                        <option value="">기본</option>
                        {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className={styles.checkRow}>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      id={`userSelects-${i}`}
                      checked={effect.userSelects ?? false}
                      onChange={(e) => updateEffect(i, { userSelects: e.target.checked })}
                    />
                    <label htmlFor={`userSelects-${i}`}>P1이 직접 선택 (userSelects)</label>
                  </div>
                </>
              )}

              {/* generate 전용 */}
              {effect.type === "generate" && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Card ID *</label>
                    <input
                      className={styles.input}
                      value={effect.cardId ?? ""}
                      onChange={(e) => updateEffect(i, { cardId: e.target.value || undefined })}
                      placeholder="weak_punch"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Count</label>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={effect.count ?? 1}
                      onChange={(e) => updateEffect(i, { count: Number(e.target.value) })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>To Zone</label>
                    <select
                      className={styles.select}
                      value={effect.toZone ?? "hand"}
                      onChange={(e) => updateEffect(i, { toZone: e.target.value as CardEffect["toZone"] })}
                    >
                      {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>To Position</label>
                    <select
                      className={styles.select}
                      value={effect.toPosition ?? ""}
                      onChange={(e) => updateEffect(i, { toPosition: (e.target.value || undefined) as CardEffect["toPosition"] })}
                    >
                      <option value="">기본</option>
                      {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* shuffle 전용 */}
              {effect.type === "shuffle" && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Zone</label>
                    <select
                      className={styles.select}
                      value={effect.zone ?? "deck"}
                      onChange={(e) => updateEffect(i, { zone: e.target.value as CardEffect["zone"] })}
                    >
                      {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* draw_tagged 전용 */}
              {effect.type === "draw_tagged" && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Tag</label>
                    <select
                      className={styles.select}
                      value={effect.tag ?? ""}
                      onChange={(e) => updateEffect(i, { tag: (e.target.value || undefined) as CardEffect["tag"] })}
                    >
                      <option value="">선택</option>
                      {CARD_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Zone</label>
                    <select
                      className={styles.select}
                      value={effect.zone ?? "deck"}
                      onChange={(e) => updateEffect(i, { zone: e.target.value as CardEffect["zone"] })}
                    >
                      {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setEffects((prev) => [...prev, emptyEffect()])}
          >
            + 효과 추가
          </button>
        </div>

        <div className={styles.submitRow}>
          <Link href="/admin" className={styles.cancelLink}>취소</Link>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? "저장 중..." : mode === "create" ? "카드 생성" : "카드 수정"}
          </button>
        </div>
      </form>
    </div>
  );
}
