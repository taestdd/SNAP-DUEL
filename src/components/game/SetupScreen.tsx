"use client";

import { useState } from "react";
import { CHARACTERS } from "@/game/engine/characters";
import { DECK_REGISTRY } from "@/game/engine/state";
import type { CardEffect, CharacterId, SetupConfig } from "@/game/engine/types";
import styles from "./SetupScreen.module.css";

function effectText(effect: CardEffect | null): string {
  if (!effect) return "—";
  const val = effect.value != null ? ` ${effect.value}` : "";
  const tgt = effect.target ? ` → ${effect.target}` : "";
  return `${effect.type}${val}${tgt}`;
}

function SlotPreview({
  label,
  charId,
}: {
  label: string;
  charId: CharacterId | null;
}) {
  return (
    <div className={`${styles.slot} ${charId ? styles.slotFilled : ""}`}>
      <div className={styles.slotLabel}>{label}</div>
      <div className={styles.slotValue}>{charId ?? "—"}</div>
    </div>
  );
}

export default function SetupScreen({
  onConfirm,
}: {
  onConfirm: (config: SetupConfig) => void;
}) {
  // [선발, 후발]
  const [slots, setSlots] = useState<[CharacterId | null, CharacterId | null]>([
    null,
    null,
  ]);
  const [deckId, setDeckId] = useState<string | null>(null);

  const allCharIds = Object.keys(CHARACTERS) as CharacterId[];

  function handleCharClick(id: CharacterId) {
    setSlots((prev) => {
      const [s1, s2] = prev;
      if (s1 === id) return [s2, null];       // 선발 해제 → 후발 올림
      if (s2 === id) return [s1, null];       // 후발 해제
      if (s1 === null) return [id, s2];       // 선발 빈칸 채우기
      if (s2 === null) return [s1, id];       // 후발 빈칸 채우기
      return [s1, id];                        // 둘 다 찼으면 후발 교체
    });
  }

  const canConfirm = slots[0] !== null && slots[1] !== null && deckId !== null;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({ characters: [slots[0]!, slots[1]!], deckId: deckId! });
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Snap Duel</h1>
          <p className={styles.sub}>캐릭터와 덱을 선택하세요</p>
        </header>

        {/* 선택 현황 미리보기 */}
        <div className={styles.slotsRow}>
          <SlotPreview label="1st (선발)" charId={slots[0]} />
          <div className={styles.slotsDivider}>→</div>
          <SlotPreview label="2nd (후발)" charId={slots[1]} />
        </div>

        {/* 캐릭터 선택 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            캐릭터 선택
            <span className={styles.sectionHint}>순서대로 2개 선택</span>
          </h2>
          <div className={styles.charGrid}>
            {allCharIds.map((id) => {
              const char = CHARACTERS[id];
              const slotNum = slots[0] === id ? 1 : slots[1] === id ? 2 : null;

              return (
                <button
                  key={id}
                  type="button"
                  className={`${styles.charCard} ${slotNum ? styles.charSelected : ""}`}
                  onClick={() => handleCharClick(id)}
                >
                  {slotNum !== null && (
                    <div className={styles.charSlotBadge}>#{slotNum}</div>
                  )}
                  <div className={styles.charName}>{id}</div>
                  <div className={styles.charHp}>HP {char.maxHp}</div>
                  <div className={styles.charEffect}>
                    <span className={styles.effectLabel}>Entry</span>
                    <span className={styles.effectVal}>
                      {effectText(char.entryEffect)}
                    </span>
                  </div>
                  <div className={styles.charEffect}>
                    <span className={styles.effectLabel}>Exit</span>
                    <span className={styles.effectVal}>
                      {effectText(char.exitEffect)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 덱 선택 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>내 덱 선택</h2>
          <div className={styles.deckGrid}>
            {Object.entries(DECK_REGISTRY).map(([id, info]) => (
              <button
                key={id}
                type="button"
                className={`${styles.deckCard} ${deckId === id ? styles.deckSelected : ""}`}
                onClick={() => setDeckId(id)}
              >
                <div className={styles.deckName}>{info.name}</div>
                <div className={styles.deckCount}>{info.cards.length} cards</div>
              </button>
            ))}
          </div>
        </section>

        {/* AI 덱 (고정 표시) */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            AI 덱
            <span className={styles.sectionHint}>고정</span>
          </h2>
          <div className={`${styles.deckCard} ${styles.deckFixed}`}>
            <div className={styles.deckName}>{DECK_REGISTRY["STARTER"].name}</div>
            <div className={styles.deckCount}>
              {DECK_REGISTRY["STARTER"].cards.length} cards
            </div>
          </div>
        </section>

        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.confirmBtn} ${!canConfirm ? styles.confirmDisabled : ""}`}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            게임 시작
          </button>
        </div>
      </div>
    </div>
  );
}
