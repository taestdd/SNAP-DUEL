"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./DeckEditor.module.css";
import type { DeckSchemaType } from "@/game/engine/deckSchema";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";

const MIN_CARDS = 20;

interface Props {
  initial?: DeckSchemaType;
  mode: "create" | "edit";
}

export default function DeckEditor({ initial, mode }: Props) {
  const router = useRouter();

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [chars, setChars] = useState<[string | null, string | null]>([
    initial?.characters[0] ?? null,
    initial?.characters[1] ?? null,
  ]);
  const [availableChars, setAvailableChars] = useState<CharacterDefSchemaType[]>([]);
  // 덱 = cardId별 카운트
  const [deckCounts, setDeckCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const cardId of initial?.cards ?? []) {
      counts[cardId] = (counts[cardId] ?? 0) + 1;
    }
    return counts;
  });

  const [allCards, setAllCards] = useState<CardSchemaType[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/admin/cards")
      .then((r) => r.json())
      .then((data: Record<string, CardSchemaType>) => setAllCards(Object.values(data)));
    fetch("/api/admin/characters")
      .then((r) => r.json())
      .then((data: Record<string, CharacterDefSchemaType>) => setAvailableChars(Object.values(data)));
  }, []);

  const totalCards = Object.values(deckCounts).reduce((s, c) => s + c, 0);

  const filteredCards = allCards.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase())
  );

  function addCard(cardId: string) {
    setDeckCounts((prev) => ({ ...prev, [cardId]: (prev[cardId] ?? 0) + 1 }));
  }

  function changeCount(cardId: string, delta: number) {
    setDeckCounts((prev) => {
      const next = { ...prev };
      const newVal = (next[cardId] ?? 0) + delta;
      if (newVal <= 0) delete next[cardId];
      else next[cardId] = newVal;
      return next;
    });
  }

  function handleCharClick(charId: string) {
    setChars((prev) => {
      const [s1, s2] = prev;
      if (s1 === charId) return [s2, null];
      if (s2 === charId) return [s1, null];
      if (s1 === null) return [charId, s2];
      if (s2 === null) return [s1, charId];
      return [s1, charId];
    });
  }

  function buildCardArray(): string[] {
    const arr: string[] = [];
    for (const [cardId, count] of Object.entries(deckCounts)) {
      for (let i = 0; i < count; i++) arr.push(cardId);
    }
    return arr;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (chars[0] === null || chars[1] === null) {
      setError("캐릭터 2개를 모두 선택해주세요.");
      return;
    }
    if (totalCards < MIN_CARDS) {
      setError(`최소 ${MIN_CARDS}장 이상이어야 합니다. (현재 ${totalCards}장)`);
      return;
    }

    setSaving(true);
    const payload: DeckSchemaType = {
      id,
      name,
      characters: [chars[0], chars[1]],
      cards: buildCardArray(),
    };

    try {
      const url = mode === "create" ? "/api/admin/decks" : `/api/admin/decks/${id}`;
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

  const deckEntries = Object.entries(deckCounts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/admin" className={styles.backLink}>← 목록</Link>
        <h1 className={styles.title}>
          {mode === "create" ? "새 덱 만들기" : `편집: ${initial?.id}`}
        </h1>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {success && <div className={styles.successBox}>저장 완료! 목록으로 이동 중...</div>}

      <form onSubmit={handleSubmit}>
        {/* 기본 정보 */}
        <div className={styles.metaRow}>
          <div className={styles.field}>
            <label className={styles.label}>ID *</label>
            <input
              className={styles.input}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="MY_DECK"
              disabled={mode === "edit"}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>덱 이름 *</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Deck"
              required
            />
          </div>
        </div>

        {/* 캐릭터 선택 */}
        <div className={styles.charSection}>
          <div className={styles.sectionTitle}>캐릭터 지정 (선발 → 후발)</div>
          <div className={styles.charSlots}>
            <div className={`${styles.charSlot} ${chars[0] ? styles.charSlotFilled : ""}`}>
              <div className={styles.charSlotLabel}>1st 선발</div>
              <div className={styles.charSlotValue}>{chars[0] ?? "—"}</div>
            </div>
            <span className={styles.slotArrow}>→</span>
            <div className={`${styles.charSlot} ${chars[1] ? styles.charSlotFilled : ""}`}>
              <div className={styles.charSlotLabel}>2nd 후발</div>
              <div className={styles.charSlotValue}>{chars[1] ?? "—"}</div>
            </div>
          </div>
          <div className={styles.charBtns}>
            {availableChars.map((char) => (
              <button
                key={char.id}
                type="button"
                className={`${styles.charBtn} ${chars.includes(char.id) ? styles.charBtnActive : ""}`}
                onClick={() => handleCharClick(char.id)}
              >
                {char.name} ({char.id})
                {chars[0] === char.id ? " · 선발" : chars[1] === char.id ? " · 후발" : ""}
              </button>
            ))}
          </div>
        </div>

        {/* 2단 덱 에디터 */}
        <div className={styles.editorLayout}>
          {/* 좌: 카드 풀 */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>카드 풀</span>
              <span className={styles.panelCount}>{allCards.length}종</span>
            </div>
            <input
              className={styles.searchInput}
              placeholder="카드 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.cardList}>
              {filteredCards.map((card) => (
                <div key={card.id} className={styles.cardRow} onClick={() => addCard(card.id)}>
                  <div className={styles.cardRowInfo}>
                    <div className={styles.cardRowName}>{card.name}</div>
                    <div className={styles.cardRowMeta}>
                      코스트 {card.cost} · 딜레이 {card.delay} · {card.effects.map(e => e.type).join(", ")}
                    </div>
                  </div>
                  <button type="button" className={styles.addBtn} onClick={(ev) => { ev.stopPropagation(); addCard(card.id); }}>
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 우: 현재 덱 */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>현재 덱</span>
              <span className={`${styles.panelCount} ${totalCards < MIN_CARDS ? styles.panelCountWarn : ""}`}>
                {totalCards}장 {totalCards < MIN_CARDS ? `(최소 ${MIN_CARDS}장)` : ""}
              </span>
            </div>
            <div className={styles.cardList}>
              {deckEntries.length === 0 && (
                <div className={styles.emptyDeck}>← 카드 풀에서 카드를 추가하세요</div>
              )}
              {deckEntries.map(([cardId, count]) => {
                const card = allCards.find((c) => c.id === cardId);
                return (
                  <div key={cardId} className={styles.deckCardRow}>
                    <div className={styles.deckCardName}>{card?.name ?? cardId}</div>
                    <div className={styles.countCtrl}>
                      <button type="button" className={styles.countBtn} onClick={() => changeCount(cardId, -1)}>−</button>
                      <span className={styles.countNum}>{count}</span>
                      <button type="button" className={styles.countBtn} onClick={() => changeCount(cardId, +1)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <Link href="/admin" className={styles.cancelLink}>취소</Link>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? "저장 중..." : mode === "create" ? "덱 생성" : "덱 수정"}
          </button>
        </div>
      </form>
    </div>
  );
}
