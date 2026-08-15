"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./AdminForm.module.css";
import { SelectField, NumericField, OptionalNumericField, ItemCard } from "./AdminFields";
import EffectListEditor, { emptyEffect } from "./EffectListEditor";
import { CardTagSchema, ActionTagSchema, CardTypeSchema, ConditionCheckSchema, CompareOpSchema, StatTargetSchema } from "@/game/engine/cardSchema";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import type { ActionTag, AdditionalCost, AltCost, AltCostMoveCards, CardEffect, CardType, CardZone, ModifierCondition, ScalingModifier, StatModifier, StatSource, ThresholdModifier } from "@/game/engine/types";
import { ACTION_TAG_TO_POSE } from "@/game/engine/types";
import { CHARACTER_SPRITES } from "@/game/animation/spriteMap";

const ACTION_TAGS = ActionTagSchema.options;

/**
 * 이 액션 태그가 재생하는 프레임 수 (스프라이트 기준, 없으면 null).
 *
 * frame은 시트 번호가 아니라 재생 순번이라, 이 길이를 넘기면 makeQueue의 frameToMs가
 * 조용히 마지막 프레임으로 잘라 버린다 — 적어둔 값과 실제 타격 위치가 어긋난다.
 * 기준 스프라이트가 없으면 첫 번째 것으로 폴백한다 (포즈 구성은 모두 동일).
 */
function poseFrameCount(tag: string): number | null {
  if (!tag) return null;
  const pose = ACTION_TAG_TO_POSE[tag as ActionTag];
  if (!pose) return null;
  const sprite = CHARACTER_SPRITES["a"] ?? Object.values(CHARACTER_SPRITES)[0];
  return sprite?.poses[pose]?.frames.length ?? null;
}

const HIT_POSES = ["hit_weak", "hit_strong", "hit_aerial"] as const;
const CARD_TAGS = CardTagSchema.options;
const ZONES = ["hand", "deck", "trash", "cooldown", "queue"] as const;
const POSITIONS = ["top", "bottom", "random"] as const;

// ── 공용 UI 컴포넌트 ──────────────────────────────────────────

/** 비례 보정을 사람이 읽는 문장으로 — 어드민에서 식을 눈으로 검증하기 위함 */
function describeScaling(mod: ScalingModifier): string {
  const who = mod.source.target === "enemy" ? "상대" : "자신";
  const per = mod.divisor && mod.divisor > 1 ? `${mod.divisor}당` : "1당";
  const sign = mod.perUnit >= 0 ? "+" : "";
  const base = mod.baseline ? ` (기준선 ${mod.baseline} 초과분)` : "";
  const bounds = [
    mod.min !== undefined ? `하한 ${mod.min}` : null,
    mod.max !== undefined ? `상한 ${mod.max}` : null,
  ].filter(Boolean).join(", ");
  return `${who} ${mod.source.check} ${per} ${mod.stat} ${sign}${mod.perUnit}${base}${bounds ? ` — ${bounds}` : ""}`;
}

// ─────────────────────────────────────────────────────────────

interface Props {
  initial?: CardSchemaType;
  mode: "create" | "edit";
}

export default function CardEditor({ initial, mode }: Props) {
  const router = useRouter();

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [cardType, setCardType] = useState<CardType>(initial?.cardType ?? "skill");
  const [cost, setCost] = useState(initial?.cost ?? 0);
  const [delay, setDelay] = useState(initial?.delay ?? 1);
  const [groundAttack, setGroundAttack] = useState(initial?.groundAttack ?? 0);
  const [antiAirAttack, setAntiAirAttack] = useState(initial?.antiAirAttack ?? 0);
  const [advantage, setAdvantage] = useState(initial?.advantage ?? 0);
  const [text, setText] = useState(initial?.text ?? "");
  const [useCondition, setUseCondition] = useState<string>(initial?.useCondition ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [actionTag, setActionTag] = useState<string>(initial?.actionTag ?? "");
  const [actionTagAirborne, setActionTagAirborne] = useState<string>(initial?.actionTagAirborne ?? "");
  const [effects, setEffects] = useState<CardEffect[]>(initial?.effects ?? [emptyEffect()]);
  const [hitTimings, setHitTimings] = useState(initial?.hitTimings ?? []);
  // 이 액션이 몇 프레임짜리인지 — frame 범위 안내·경고에 쓴다
  const frameCount = poseFrameCount(actionTag);
  const [superFlash, setSuperFlash] = useState(initial?.superFlash ?? false);
  // meleeAttack은 미지정 = true가 기본 (원거리 카드만 false 저장)
  const [meleeAttack, setMeleeAttack] = useState(initial?.meleeAttack ?? true);
  const [knockback, setKnockback] = useState(initial?.knockback ?? false);
  const [generateOnly, setGenerateOnly] = useState(initial?.generateOnly ?? false);
  const [additionalCost, setAdditionalCost] = useState<AdditionalCost | null>(initial?.additionalCost ?? null);
  const [statModifiers, setStatModifiers] = useState<StatModifier[]>(initial?.statModifiers ?? []);
  const [altCost, setAltCost] = useState<AltCost | null>(initial?.altCost ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function addModifier(mode: "threshold" | "scaling") {
    setStatModifiers((prev) => [
      ...prev,
      mode === "scaling"
        ? { mode: "scaling", source: { check: "hand_count", target: "enemy" }, stat: "ground_attack", perUnit: 1 }
        : { condition: { check: "hand_count", target: "self", op: "<", value: 3 }, stat: "delay", delta: -1 },
    ]);
  }

  /** 모드 전환 — 보정 스탯과 소스(대상·항목)는 유지하고 나머지는 기본값으로 재구성 */
  function setModifierMode(index: number, mode: "threshold" | "scaling") {
    setStatModifiers((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m;
        const src: StatSource = m.mode === "scaling"
          ? m.source
          : { check: m.condition.check, target: m.condition.target };

        if (mode === "scaling") {
          return m.mode === "scaling" ? m : { mode: "scaling", source: src, stat: m.stat, perUnit: 1 };
        }
        return m.mode === "scaling"
          ? { condition: { ...src, op: ">", value: 0 }, stat: m.stat, delta: 1 }
          : m;
      })
    );
  }

  /** 두 모드가 공통으로 갖는 필드(stat)만 패치 */
  function updateModifier(index: number, patch: { stat: StatModifier["stat"] }) {
    setStatModifiers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function updateThreshold(index: number, patch: Partial<ThresholdModifier>) {
    setStatModifiers((prev) =>
      prev.map((m, i) => (i === index && m.mode !== "scaling" ? { ...m, ...patch } : m))
    );
  }

  function updateScaling(index: number, patch: Partial<ScalingModifier>) {
    setStatModifiers((prev) =>
      prev.map((m, i) => (i === index && m.mode === "scaling" ? { ...m, ...patch } : m))
    );
  }

  function updateModifierCondition(index: number, patch: Partial<ModifierCondition>) {
    setStatModifiers((prev) =>
      prev.map((m, i) =>
        i === index && m.mode !== "scaling" ? { ...m, condition: { ...m.condition, ...patch } } : m
      )
    );
  }

  function updateModifierSource(index: number, patch: Partial<StatSource>) {
    setStatModifiers((prev) =>
      prev.map((m, i) =>
        i === index && m.mode === "scaling" ? { ...m, source: { ...m.source, ...patch } } : m
      )
    );
  }

  function removeModifier(index: number) {
    setStatModifiers((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  function addHitTiming() {
    setHitTimings((prev) => [...prev, { frame: 1, ground: "hit_weak" as const, airborne: "hit_aerial" as const }]);
  }

  function updateHitTiming(index: number, patch: Partial<{ frame: number; ground: "hit_weak" | "hit_strong" | "hit_aerial"; airborne: "hit_weak" | "hit_strong" | "hit_aerial"; freeze: number; zoom: number }>) {
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

    // freeze 0 / zoom ≤1 은 "프리셋 사용" 의미이므로 저장 시 생략
    const cleanedHitTimings = hitTimings.map((ht) => ({
      frame: ht.frame,
      ground: ht.ground,
      airborne: ht.airborne,
      ...(ht.freeze && ht.freeze > 0 ? { freeze: ht.freeze } : {}),
      ...(ht.zoom && ht.zoom > 1 ? { zoom: ht.zoom } : {}),
    }));

    const payload: CardSchemaType = {
      id,
      name,
      cardType,
      cost,
      delay,
      ...(cardType === "attack" ? { groundAttack, antiAirAttack, advantage } : { advantage: 0 }),
      text,
      effects,
      ...(useCondition ? { useCondition: useCondition as "ground" | "airborne" } : {}),
      ...(tags.length > 0 ? { tags: tags as CardSchemaType["tags"] } : {}),
      ...(actionTag ? { actionTag: actionTag as CardSchemaType["actionTag"] } : {}),
      ...(actionTagAirborne ? { actionTagAirborne: actionTagAirborne as CardSchemaType["actionTag"] } : {}),
      ...(hitTimings.length > 0 ? { hitTimings: cleanedHitTimings as CardSchemaType["hitTimings"] } : {}),
      ...(superFlash ? { superFlash: true } : {}),
      // 기본값 true — 체크 해제(원거리)일 때만 명시적으로 false 저장
      ...(meleeAttack ? {} : { meleeAttack: false }),
      ...(knockback ? { knockback: true } : {}),
      ...(statModifiers.length > 0 ? { statModifiers } : {}),
      ...(altCost ? { altCost } : {}),
      ...(additionalCost && additionalCost.requires.length > 0 ? { additionalCost } : {}),
      ...(generateOnly ? { generateOnly: true } : {}),
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
          {mode === "create" ? "새 카드" : initial?.id}
        </h1>
        <div className={styles.headerActions}>
          <Link href="/admin" className={styles.cancelLink}>취소</Link>
          <button type="submit" form="card-editor-form" className={styles.submitBtn} disabled={saving}>
            {saving ? "저장 중..." : mode === "create" ? "카드 생성" : "카드 수정"}
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {success && <div className={styles.successBox}>저장 완료! 목록으로 이동 중...</div>}

      <div className={styles.formBody}>
        <form id="card-editor-form" onSubmit={handleSubmit}>

          {/* 식별 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>식별</div>
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
              <SelectField label="카드 타입" value={cardType} onChange={(v) => setCardType(v as CardType)}>
                {CardTypeSchema.options.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectField>
            </div>
            <div className={styles.fieldFull}>
              <label className={styles.label}>카드 설명</label>
              <textarea
                className={styles.textarea}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="카드 효과를 설명하는 텍스트"
              />
            </div>
            <div className={styles.fieldFull}>
              <label className={styles.label}>일러스트 (카드 ID로 자동 지정)</label>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <code
                    style={{
                      display: "block",
                      padding: "8px 10px",
                      borderRadius: 4,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      fontSize: 13,
                      color: id ? "#c8ced8" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    {id ? `/sprites/cards/${id}.png` : "먼저 ID를 입력하세요"}
                  </code>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
                    이 경로에 맞춰 <b>public/sprites/cards/{id || "{ID}"}.png</b> 파일을 넣으면 자동 적용됩니다.
                  </div>
                </div>
                {id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/sprites/cards/${id}.png`}
                    alt="일러스트 미리보기"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    style={{
                      width: 72,
                      height: 72,
                      objectFit: "cover",
                      borderRadius: 4,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "#131418",
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>카드 태그</label>
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
          </div>

          {/* 수치 & 스탯 보정 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>수치 & 스탯 보정</div>
            <div className={styles.row}>
              <NumericField label="코스트" min={0} value={cost} onChange={setCost} />
              <NumericField label="딜레이" min={0} value={delay} onChange={setDelay} />
            </div>
            {cardType === "attack" && (
              <div className={styles.row}>
                <NumericField label="지상 공격력" min={0} value={groundAttack} onChange={setGroundAttack} />
                <NumericField label="대공 공격력" min={0} value={antiAirAttack} onChange={setAntiAirAttack} />
                <NumericField label="어드밴티지" min={0} value={advantage} onChange={setAdvantage} />
              </div>
            )}
            {statModifiers.map((mod, i) => (
              <ItemCard key={i} title={`보정 #${i + 1}`} onRemove={() => removeModifier(i)}>
                <div className={styles.row}>
                  <SelectField
                    label="보정 방식"
                    value={mod.mode === "scaling" ? "scaling" : "threshold"}
                    onChange={(v) => setModifierMode(i, v as "threshold" | "scaling")}
                  >
                    <option value="threshold">임계값 (조건 충족 시 고정)</option>
                    <option value="scaling">비례 (수치에 비례)</option>
                  </SelectField>
                  <SelectField label="보정 스탯" value={mod.stat} onChange={(v) => updateModifier(i, { stat: v as StatModifier["stat"] })}>
                    {StatTargetSchema.options.map((s) => <option key={s} value={s}>{s}</option>)}
                  </SelectField>
                </div>

                {mod.mode === "scaling" ? (
                  <>
                    <div className={styles.row}>
                      <SelectField label="소스 대상" value={mod.source.target} onChange={(v) => updateModifierSource(i, { target: v as "self" | "enemy" })}>
                        <option value="self">self</option>
                        <option value="enemy">enemy</option>
                      </SelectField>
                      <SelectField label="소스 항목" value={mod.source.check} onChange={(v) => updateModifierSource(i, { check: v as StatSource["check"] })}>
                        {ConditionCheckSchema.options.map((c) => <option key={c} value={c}>{c}</option>)}
                      </SelectField>
                      <NumericField label="1단위당 (perUnit)" value={mod.perUnit} onChange={(n) => updateScaling(i, { perUnit: n })} />
                    </div>
                    <div className={styles.row}>
                      <NumericField label="기준선 (baseline)" value={mod.baseline ?? 0} onChange={(n) => updateScaling(i, { baseline: n })} />
                      <NumericField label="N단위당 (divisor)" min={1} value={mod.divisor ?? 1} onChange={(n) => updateScaling(i, { divisor: Math.max(1, n) })} />
                      <OptionalNumericField label="하한 (min)" value={mod.min} fallback={0} onChange={(n) => updateScaling(i, { min: n })} />
                      <OptionalNumericField label="상한 (max)" value={mod.max} fallback={5} onChange={(n) => updateScaling(i, { max: n })} />
                    </div>
                    <div className={styles.hint}>{describeScaling(mod)}</div>
                  </>
                ) : (
                  <div className={styles.row}>
                    <SelectField label="조건 대상" value={mod.condition.target} onChange={(v) => updateModifierCondition(i, { target: v as "self" | "enemy" })}>
                      <option value="self">self</option>
                      <option value="enemy">enemy</option>
                    </SelectField>
                    <SelectField label="체크 항목" value={mod.condition.check} onChange={(v) => updateModifierCondition(i, { check: v as ModifierCondition["check"] })}>
                      {ConditionCheckSchema.options.map((c) => <option key={c} value={c}>{c}</option>)}
                    </SelectField>
                    <SelectField label="연산자" value={mod.condition.op} onChange={(v) => updateModifierCondition(i, { op: v as "<" | ">" | "=" })}>
                      {CompareOpSchema.options.map((op) => <option key={op} value={op}>{op}</option>)}
                    </SelectField>
                    <NumericField label="값" value={mod.condition.value} onChange={(n) => updateModifierCondition(i, { value: n })} />
                    <NumericField label="Delta" value={mod.delta} onChange={(n) => updateThreshold(i, { delta: n })} />
                  </div>
                )}
              </ItemCard>
            ))}
            <div className={styles.row}>
              <button type="button" className={styles.addBtn} onClick={() => addModifier("threshold")}>
                + 임계값 보정
              </button>
              <button type="button" className={styles.addBtn} onClick={() => addModifier("scaling")}>
                + 비례 보정
              </button>
            </div>
          </div>

          {/* 추가 코스트 (altCost) */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>추가 코스트 (altCost)</div>
            {altCost ? (
              <>
                <div className={styles.row}>
                  <SelectField
                    label="타입"
                    value={altCost.type === "hp" ? "hp" : "move_cards"}
                    onChange={(v) => {
                      if (v === "hp") setAltCost({ type: "hp", amount: 3 });
                      else setAltCost({ type: "move_cards", fromZone: "hand", toZone: "trash", count: 1 });
                    }}
                  >
                    <option value="move_cards">move_cards (카드 이동)</option>
                    <option value="hp">hp (체력 지불)</option>
                  </SelectField>
                </div>

                {altCost.type === "hp" ? (
                  <div className={styles.row}>
                    <NumericField
                      label="HP 소모량"
                      min={1}
                      value={altCost.amount}
                      onChange={(n) => setAltCost({ type: "hp", amount: n })}
                    />
                  </div>
                ) : (
                  <>
                    <div className={styles.row}>
                      <SelectField label="대상" value={(altCost as AltCostMoveCards).target ?? "self"} onChange={(v) => setAltCost({ ...(altCost as AltCostMoveCards), target: v as AltCostMoveCards["target"] })}>
                        <option value="self">self</option>
                        <option value="enemy">enemy</option>
                      </SelectField>
                      <SelectField label="From Zone" value={(altCost as AltCostMoveCards).fromZone} onChange={(v) => setAltCost({ ...(altCost as AltCostMoveCards), fromZone: v as AltCostMoveCards["fromZone"] })}>
                        {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                      </SelectField>
                      <SelectField label="To Zone" value={(altCost as AltCostMoveCards).toZone} onChange={(v) => setAltCost({ ...(altCost as AltCostMoveCards), toZone: v as AltCostMoveCards["toZone"] })}>
                        {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                      </SelectField>
                    </div>
                    <div className={styles.row}>
                      <NumericField label="Count" min={1} value={(altCost as AltCostMoveCards).count} onChange={(n) => setAltCost({ ...(altCost as AltCostMoveCards), count: n })} />
                      <SelectField label="To Position" value={(altCost as AltCostMoveCards).toPosition ?? ""} onChange={(v) => setAltCost({ ...(altCost as AltCostMoveCards), toPosition: (v || undefined) as AltCostMoveCards["toPosition"] })}>
                        <option value="">기본</option>
                        {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </SelectField>
                      <SelectField label="Tag 필터" value={(altCost as AltCostMoveCards).tag ?? ""} onChange={(v) => setAltCost({ ...(altCost as AltCostMoveCards), tag: (v || undefined) as AltCostMoveCards["tag"] })}>
                        <option value="">없음</option>
                        {CARD_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </SelectField>
                    </div>
                    <div className={styles.checkRow}>
                      <input
                        className={styles.checkbox}
                        type="checkbox"
                        id="altCostUserSelects"
                        checked={(altCost as AltCostMoveCards).userSelects ?? false}
                        onChange={(e) => setAltCost({ ...(altCost as AltCostMoveCards), userSelects: e.target.checked || undefined })}
                      />
                      <label htmlFor="altCostUserSelects">userSelects (P1이 직접 선택)</label>
                    </div>
                  </>
                )}

                <button type="button" className={styles.removeBtn} onClick={() => setAltCost(null)}>
                  altCost 제거
                </button>
              </>
            ) : (
              <button type="button" className={styles.addBtn} onClick={() => setAltCost({ type: "move_cards", fromZone: "hand", toZone: "trash", count: 1 })}>
                + altCost 추가
              </button>
            )}
          </div>

          {/* 요구 카드 코스트 (additionalCost) */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>요구 카드 코스트 (additionalCost)</div>
            <div className={styles.hint}>
              지정한 카드가 해당 영역에 있어야 사용 가능하고, 사용 시 그 카드들을 소모합니다.
              조건이 안 맞으면 핸드에서 사용 불가로 표시됩니다.
            </div>
            {additionalCost ? (
              <>
                {additionalCost.requires.map((req, i) => (
                  <ItemCard
                    key={i}
                    title={`요구 #${i + 1}`}
                    onRemove={() => {
                      const next = additionalCost.requires.filter((_, j) => j !== i);
                      setAdditionalCost(next.length > 0 ? { ...additionalCost, requires: next } : null);
                    }}
                  >
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label className={styles.label}>카드 ID</label>
                        <input
                          className={styles.input}
                          value={req.cardId}
                          placeholder="arm_shield"
                          onChange={(e) => {
                            const requires = additionalCost.requires.map((r, j) => j === i ? { ...r, cardId: e.target.value } : r);
                            setAdditionalCost({ ...additionalCost, requires });
                          }}
                        />
                      </div>
                      <SelectField
                        label="영역"
                        value={req.zone}
                        onChange={(v) => {
                          const requires = additionalCost.requires.map((r, j) => j === i ? { ...r, zone: v as CardZone } : r);
                          setAdditionalCost({ ...additionalCost, requires });
                        }}
                      >
                        {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                      </SelectField>
                      <NumericField
                        label="장수"
                        min={1}
                        value={req.count}
                        onChange={(n) => {
                          const requires = additionalCost.requires.map((r, j) => j === i ? { ...r, count: Math.max(1, n) } : r);
                          setAdditionalCost({ ...additionalCost, requires });
                        }}
                      />
                    </div>
                  </ItemCard>
                ))}
                <div className={styles.row}>
                  <SelectField
                    label="소모 후 이동 영역"
                    value={additionalCost.consumeTo}
                    onChange={(v) => setAdditionalCost({ ...additionalCost, consumeTo: v as CardZone })}
                  >
                    {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                  </SelectField>
                </div>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => setAdditionalCost({
                      ...additionalCost,
                      requires: [...additionalCost.requires, { cardId: "", zone: "cooldown", count: 1 }],
                    })}
                  >
                    + 요구 카드 추가
                  </button>
                  <button type="button" className={styles.removeBtn} onClick={() => setAdditionalCost(null)}>
                    additionalCost 제거
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className={styles.addBtn}
                onClick={() => setAdditionalCost({ requires: [{ cardId: "", zone: "cooldown", count: 1 }], consumeTo: "trash" })}
              >
                + additionalCost 추가
              </button>
            )}
          </div>

          {/* 발동 조건 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>발동 조건</div>
            <div className={styles.row}>
              <SelectField label="사용 조건" value={useCondition} onChange={setUseCondition}>
                <option value="">없음</option>
                <option value="ground">ground</option>
                <option value="airborne">airborne</option>
              </SelectField>
            </div>
          </div>

          {/* 효과 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>효과 (Effects) *</div>
            <EffectListEditor effects={effects} onChange={setEffects} />
          </div>

          {/* 애니메이션 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>애니메이션</div>
            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={superFlash}
                  onChange={(e) => setSuperFlash(e.target.checked)}
                />
                슈퍼 플래시 연출
              </label>
            </div>
            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={meleeAttack}
                  onChange={(e) => setMeleeAttack(e.target.checked)}
                />
                근접 공격 — 비근접 상태면 상대에게 돌진 후 공격
              </label>
            </div>
            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={knockback}
                  onChange={(e) => setKnockback(e.target.checked)}
                />
                넉백 — 타격 후 상대를 밀어내 비근접 상태로
              </label>
            </div>
            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={generateOnly}
                  onChange={(e) => setGenerateOnly(e.target.checked)}
                />
                생성 전용 — 효과로만 등장하며 덱 구축에 넣을 수 없음 (파츠·토큰)
              </label>
            </div>
            <div className={styles.row} style={{ marginTop: 12 }}>
              <SelectField label="Action Tag" value={actionTag} onChange={setActionTag}>
                <option value="">없음</option>
                {ACTION_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectField>
              <SelectField label="Action Tag (공중)" value={actionTagAirborne} onChange={setActionTagAirborne}>
                <option value="">없음</option>
                {ACTION_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectField>
            </div>
            <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Hit Timings</div>
            <div className={styles.hintText} style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              frame = 공격 포즈 재생 순번(0부터). freeze=0이면 강도별 프리셋, zoom=1이면 프리셋.
              {frameCount !== null && (
                <> 현재 액션(<code>{actionTag}</code>)은 <b>{frameCount}프레임</b> — frame은 0~{frameCount - 1}.</>
              )}
              {cardType === "attack" && hitTimings.length === 0 && (
                <> 비워 두면 액션별 기본 타이밍이 적용됩니다.</>
              )}
            </div>
            {hitTimings.map((ht, i) => (
              <ItemCard key={i} title={`Hit Timing #${i + 1}`} onRemove={() => removeHitTiming(i)}>
                <div className={styles.row}>
                  <NumericField label="frame" min={0} value={ht.frame} onChange={(n) => updateHitTiming(i, { frame: n })} />
                  {frameCount !== null && ht.frame > frameCount - 1 && (
                    <div className={styles.hintText} style={{ color: "#e0524f", fontSize: 12, alignSelf: "center" }}>
                      frame {ht.frame}은 범위 밖 — 재생 시 {frameCount - 1}로 잘립니다
                    </div>
                  )}
                  <SelectField label="Ground 포즈" value={ht.ground} onChange={(v) => updateHitTiming(i, { ground: v as "hit_weak" | "hit_strong" | "hit_aerial" })}>
                    {HIT_POSES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </SelectField>
                  <SelectField label="Airborne 포즈" value={ht.airborne} onChange={(v) => updateHitTiming(i, { airborne: v as "hit_weak" | "hit_strong" | "hit_aerial" })}>
                    {HIT_POSES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </SelectField>
                </div>
                <div className={styles.row}>
                  <NumericField label="freeze (ms, 0=프리셋)" min={0} value={ht.freeze ?? 0} onChange={(n) => updateHitTiming(i, { freeze: n })} />
                  <NumericField label="zoom (배율, 1=프리셋)" min={1} step="0.01" value={ht.zoom ?? 1} onChange={(n) => updateHitTiming(i, { zoom: n })} />
                </div>
              </ItemCard>
            ))}
            <button type="button" className={styles.addBtn} onClick={addHitTiming}>
              + Hit Timing 추가
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
