"use client";

import type { CardEffect } from "@/game/engine/types";
import { CardTagSchema } from "@/game/engine/cardSchema";
import { SelectField, NumericField, ItemCard } from "./AdminFields";
import styles from "./AdminForm.module.css";

/**
 * 효과 목록 편집기 — 카드의 effects와 캐릭터의 entry/exitEffect가 함께 쓴다.
 *
 * 캐릭터 효과가 생 JSON 입력이던 걸 이 컴포넌트로 대체했다. 두 곳이 같은 UI를 쓰므로
 * 새 효과 타입이나 필드를 추가할 때 한 곳만 고치면 된다.
 */

const CARD_TAGS = CardTagSchema.options;
const EFFECT_TYPES = [
  "damage", "block", "draw", "draw_tagged",
  "heal", "buff_attack", "tag", "airborne", "move_cards", "shuffle", "generate",
] as const;
const TARGETS = ["self", "enemy"] as const;
const DAMAGE_TYPES = ["ground", "anti-air"] as const;
const ZONES = ["hand", "deck", "trash", "cooldown", "queue"] as const;
const POSITIONS = ["top", "bottom", "random"] as const;

/** value가 없으면 무동작이 되는 효과들 — 이들만 Value 입력을 노출한다 */
const NEEDS_VALUE = ["damage", "block", "draw", "heal", "buff_attack", "airborne", "draw_tagged"];

export function emptyEffect(): CardEffect {
  return { type: "damage", value: 0, target: "enemy" };
}

export default function EffectListEditor({
  effects,
  onChange,
  addLabel = "+ 효과 추가",
  emptyHint,
}: {
  effects: CardEffect[];
  onChange: (next: CardEffect[]) => void;
  addLabel?: string;
  /** 효과가 하나도 없을 때 보여줄 안내 (없으면 생략) */
  emptyHint?: string;
}) {
  function update(index: number, patch: Partial<CardEffect>) {
    onChange(effects.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function remove(index: number) {
    onChange(effects.filter((_, i) => i !== index));
  }

  return (
    <>
      {effects.length === 0 && emptyHint && <div className={styles.hint}>{emptyHint}</div>}

      {effects.map((effect, i) => (
        <ItemCard key={i} title={`효과 #${i + 1}`} onRemove={() => remove(i)}>
          <div className={styles.row}>
            <SelectField label="Type *" value={effect.type} onChange={(v) => update(i, { type: v as CardEffect["type"] })}>
              {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </SelectField>
            {NEEDS_VALUE.includes(effect.type) && (
              <NumericField label="Value" value={effect.value ?? 0} onChange={(n) => update(i, { value: n })} />
            )}
            {/* Target 미지정 시 엔진은 self로 처리한다(resolveTarget) — 표시도 self여야 실제 동작과 맞는다 */}
            {effect.type !== "tag" && (
              <SelectField label="Target" value={effect.target ?? "self"} onChange={(v) => update(i, { target: v as "self" | "enemy" })}>
                {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectField>
            )}
            {effect.type === "heal" && (
              <SelectField
                label="회복 캐릭터"
                value={effect.character ?? "active"}
                onChange={(v) => update(i, { character: v as CardEffect["character"] })}
              >
                <option value="active">active (활성)</option>
                <option value="bench">bench (벤치)</option>
              </SelectField>
            )}
          </div>

          {effect.type === "damage" && (
            <div className={styles.row}>
              <SelectField label="Damage Type" value={effect.damageType ?? ""} onChange={(v) => update(i, { damageType: (v || undefined) as CardEffect["damageType"] })}>
                <option value="">항상 적용</option>
                {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectField>
            </div>
          )}

          {effect.type === "move_cards" && (
            <>
              <div className={styles.row}>
                <SelectField label="From Zone" value={effect.fromZone ?? "deck"} onChange={(v) => update(i, { fromZone: v as CardEffect["fromZone"] })}>
                  {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </SelectField>
                <SelectField label="To Zone" value={effect.toZone ?? "hand"} onChange={(v) => update(i, { toZone: v as CardEffect["toZone"] })}>
                  {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </SelectField>
                <NumericField label="Count" min={1} value={effect.count ?? 1} onChange={(n) => update(i, { count: n })} />
                <SelectField label="To Position" value={effect.toPosition ?? ""} onChange={(v) => update(i, { toPosition: (v || undefined) as CardEffect["toPosition"] })}>
                  <option value="">기본</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </SelectField>
              </div>
              <div className={styles.row}>
                <SelectField label="Tag 필터" value={effect.tag ?? ""} onChange={(v) => update(i, { tag: (v || undefined) as CardEffect["tag"] })}>
                  <option value="">전체</option>
                  {CARD_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </SelectField>
              </div>
              <div className={styles.checkRow}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  id={`userSelects-${i}`}
                  checked={effect.userSelects ?? false}
                  onChange={(e) => update(i, { userSelects: e.target.checked })}
                />
                <label htmlFor={`userSelects-${i}`}>P1이 직접 선택 (userSelects)</label>
              </div>
            </>
          )}

          {effect.type === "generate" && (
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Card ID *</label>
                <input
                  className={styles.input}
                  value={effect.cardId ?? ""}
                  onChange={(e) => update(i, { cardId: e.target.value || undefined })}
                  placeholder="arm_shield"
                />
              </div>
              <NumericField label="Count" min={1} value={effect.count ?? 1} onChange={(n) => update(i, { count: n })} />
              <SelectField label="To Zone" value={effect.toZone ?? "hand"} onChange={(v) => update(i, { toZone: v as CardEffect["toZone"] })}>
                {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </SelectField>
              <SelectField label="To Position" value={effect.toPosition ?? ""} onChange={(v) => update(i, { toPosition: (v || undefined) as CardEffect["toPosition"] })}>
                <option value="">기본</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </SelectField>
            </div>
          )}

          {effect.type === "shuffle" && (
            <div className={styles.row}>
              <SelectField label="Zone" value={effect.zone ?? "deck"} onChange={(v) => update(i, { zone: v as CardEffect["zone"] })}>
                {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </SelectField>
            </div>
          )}

          {effect.type === "draw_tagged" && (
            <div className={styles.row}>
              <SelectField label="Tag" value={effect.tag ?? ""} onChange={(v) => update(i, { tag: (v || undefined) as CardEffect["tag"] })}>
                <option value="">선택</option>
                {CARD_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectField>
              <SelectField label="Zone" value={effect.zone ?? "deck"} onChange={(v) => update(i, { zone: v as CardEffect["zone"] })}>
                {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </SelectField>
            </div>
          )}
        </ItemCard>
      ))}

      <button type="button" className={styles.addBtn} onClick={() => onChange([...effects, emptyEffect()])}>
        {addLabel}
      </button>
    </>
  );
}
