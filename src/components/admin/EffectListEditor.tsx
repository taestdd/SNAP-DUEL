"use client";

import type { BuffFilter, CardEffect, CardTag, StatTarget } from "@/game/engine/types";
import { CardTagSchema, StatTargetSchema, BuffScopeSchema } from "@/game/engine/cardSchema";
import { SelectField, NumericField, OptionalNumericField, ItemCard } from "./AdminFields";
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
  "heal", "buff", "poison", "buff_attack", "tag", "airborne", "move_cards", "shuffle", "generate",
] as const;
const STAT_TARGETS = StatTargetSchema.options;
/** 스코프 목록은 스키마에서 뽑고, 설명만 여기서 붙인다 — 스코프가 늘면 이 표만 채우면 된다 */
const BUFF_SCOPE_LABELS: Record<(typeof BuffScopeSchema.options)[number], string> = {
  player: "player (태그해도 유지)",
  character: "character (태그 시 소멸)",
};
const BUFF_SCOPES = BuffScopeSchema.options;
const TARGETS = ["self", "enemy"] as const;
const DAMAGE_TYPES = ["ground", "anti-air"] as const;
const ZONES = ["hand", "deck", "trash", "cooldown", "queue"] as const;
const POSITIONS = ["top", "bottom", "random"] as const;

/**
 * value가 없으면 무동작이 되는 효과들 — 이들만 Value 입력을 노출한다.
 * buff는 값의 의미가 "증감량"이라 전용 입력(음수 허용)을 따로 둔다.
 */
const NEEDS_VALUE = ["damage", "block", "draw", "heal", "buff_attack", "airborne", "draw_tagged"];

export function emptyEffect(): CardEffect {
  return { type: "damage", value: 0, target: "enemy" };
}

/** 버프 설정을 문장으로 되풀이 — 입력한 조합이 의도대로인지 눈으로 확인하기 위함 */
/** 중독 설정을 문장으로 되풀이 */
function describePoison(effect: CardEffect): string {
  const who = effect.target === "enemy" ? "상대" : "자신";
  const scope = effect.buffScope === "player" ? "플레이어 (태그해도 유지)" : "현재 캐릭터 (태그 시 소멸)";
  return `${who}의 ${scope}에게: 턴당 ${effect.value ?? 0} 피해 (블록 무시) · ${effect.poisonTurns ?? 2}턴 · 건 턴에는 틱하지 않음`;
}

function describeBuff(effect: CardEffect): string {
  const who = effect.target === "enemy" ? "상대" : "자신";
  const scope = effect.buffScope === "character" ? "현재 캐릭터" : "플레이어";
  const sign = (effect.value ?? 0) >= 0 ? "+" : "";
  const d = effect.buffDuration ?? { type: "turns" as const, value: 1 };
  const dur = d.type === "uses" ? `해당 카드 ${d.value}회 사용` : `${d.value}턴`;

  const f = effect.buffFilter;
  const scopeText = !f
    ? "모든 카드"
    : [
        f.cardType ? `${f.cardType} 카드` : null,
        f.tags?.length ? `태그 ${f.tags.join("/")}` : null,
        f.statRange
          ? `base ${f.statRange.stat} ${f.statRange.min ?? "-"}~${f.statRange.max ?? "-"}`
          : null,
      ].filter(Boolean).join(" · ") || "모든 카드";

  return `${who}의 ${scope}에게: ${scopeText}의 ${effect.stat ?? "?"} ${sign}${effect.value ?? 0} · ${dur}`;
}

/** 버프가 영향을 줄 카드를 한정하는 조건 편집기 */
function BuffFilterEditor({
  filter,
  onChange,
}: {
  filter: BuffFilter | undefined;
  onChange: (f: BuffFilter | undefined) => void;
}) {
  if (!filter) {
    return (
      <button type="button" className={styles.addBtn} onClick={() => onChange({})}>
        + 영향받을 카드 한정
      </button>
    );
  }

  const patch = (p: Partial<BuffFilter>) => onChange({ ...filter, ...p });

  const toggleTag = (tag: string) => {
    const tags = filter.tags ?? [];
    const next = tags.includes(tag as CardTag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag as CardTag];
    patch({ tags: next.length > 0 ? next : undefined });
  };

  return (
    <div className={styles.effectItem}>
      <div className={styles.effectHeader}>
        <span className={styles.effectIndex}>영향받을 카드 한정</span>
        <button type="button" className={styles.removeBtn} onClick={() => onChange(undefined)}>
          ✕ 한정 해제
        </button>
      </div>

      <div className={styles.row}>
        <SelectField
          label="카드 타입"
          value={filter.cardType ?? ""}
          onChange={(v) => patch({ cardType: (v || undefined) as BuffFilter["cardType"] })}
        >
          <option value="">전체</option>
          <option value="attack">attack</option>
          <option value="skill">skill</option>
        </SelectField>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>태그 (하나라도 맞으면 적용)</label>
        <div className={styles.tagGroup}>
          {CARD_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.tagBtn} ${filter.tags?.includes(t) ? styles.active : ""}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {filter.statRange ? (
        <div className={styles.row}>
          <SelectField
            label="base 스탯"
            value={filter.statRange.stat}
            onChange={(v) => patch({ statRange: { ...filter.statRange!, stat: v as StatTarget } })}
          >
            {STAT_TARGETS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectField>
          <OptionalNumericField
            label="최소"
            value={filter.statRange.min}
            fallback={0}
            onChange={(n) => patch({ statRange: { ...filter.statRange!, min: n } })}
          />
          <OptionalNumericField
            label="최대"
            value={filter.statRange.max}
            fallback={9}
            onChange={(n) => patch({ statRange: { ...filter.statRange!, max: n } })}
          />
          <button type="button" className={styles.removeBtn} onClick={() => patch({ statRange: undefined })}>
            범위 제거
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => patch({ statRange: { stat: "cost", min: 3 } })}
        >
          + 스탯 범위 조건
        </button>
      )}

      <div className={styles.hint}>
        지정한 조건을 <b>모두</b> 만족하는 카드에만 적용됩니다. 태그는 하나만 맞아도 통과.
        스탯 범위는 버프 적용 전 <b>base 값</b>으로 판정합니다.
      </div>
    </div>
  );
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

          {effect.type === "buff" && (
            <>
              <div className={styles.row}>
                <SelectField label="보정 스탯 *" value={effect.stat ?? "ground_attack"} onChange={(v) => update(i, { stat: v as CardEffect["stat"] })}>
                  {STAT_TARGETS.map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectField>
                <NumericField label="증감량 (음수=디버프)" value={effect.value ?? 0} onChange={(n) => update(i, { value: n })} />
                <SelectField
                  label="스코프"
                  value={effect.buffScope ?? "player"}
                  onChange={(v) => update(i, { buffScope: v as CardEffect["buffScope"] })}
                >
                  {BUFF_SCOPES.map((s) => <option key={s} value={s}>{BUFF_SCOPE_LABELS[s]}</option>)}
                </SelectField>
              </div>
              <div className={styles.row}>
                <SelectField
                  label="지속 방식"
                  value={effect.buffDuration?.type ?? "turns"}
                  onChange={(v) => update(i, {
                    buffDuration: { type: v as "turns" | "uses", value: effect.buffDuration?.value ?? 1 },
                  })}
                >
                  <option value="turns">turns (턴 시작마다 감소)</option>
                  <option value="uses">uses (해당 카드를 쓸 때만 감소)</option>
                </SelectField>
                <NumericField
                  label="지속 값"
                  min={1}
                  value={effect.buffDuration?.value ?? 1}
                  onChange={(n) => update(i, {
                    buffDuration: { type: effect.buffDuration?.type ?? "turns", value: Math.max(1, n) },
                  })}
                />
                <div className={styles.field}>
                  <label className={styles.label}>표시 이름 (선택)</label>
                  <input
                    className={styles.input}
                    value={effect.label ?? ""}
                    onChange={(e) => update(i, { label: e.target.value || undefined })}
                    placeholder="집중"
                  />
                </div>
              </div>

              <BuffFilterEditor
                filter={effect.buffFilter}
                onChange={(f) => update(i, { buffFilter: f })}
              />

              <div className={styles.hint}>{describeBuff(effect)}</div>
            </>
          )}

          {effect.type === "poison" && (
            <>
              <div className={styles.row}>
                <NumericField label="턴당 데미지 *" min={1} value={effect.value ?? 1} onChange={(n) => update(i, { value: Math.max(1, n) })} />
                <NumericField label="지속 턴" min={1} value={effect.poisonTurns ?? 2} onChange={(n) => update(i, { poisonTurns: Math.max(1, n) })} />
                <SelectField
                  label="스코프"
                  value={effect.buffScope ?? "character"}
                  onChange={(v) => update(i, { buffScope: v as CardEffect["buffScope"] })}
                >
                  {BUFF_SCOPES.map((s) => <option key={s} value={s}>{BUFF_SCOPE_LABELS[s]}</option>)}
                </SelectField>
                <div className={styles.field}>
                  <label className={styles.label}>표시 이름 (선택)</label>
                  <input
                    className={styles.input}
                    value={effect.label ?? ""}
                    onChange={(e) => update(i, { label: e.target.value || undefined })}
                    placeholder="맹독"
                  />
                </div>
              </div>
              <div className={styles.hint}>{describePoison(effect)}</div>
            </>
          )}

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
