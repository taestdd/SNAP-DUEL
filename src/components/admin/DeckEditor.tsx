"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./DeckEditor.module.css";
import type { DeckSchemaType } from "@/game/engine/deckSchema";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";
import { affinityAllows } from "@/game/engine/rules";
import type { CardType } from "@/game/engine/types";
import { parseDeckBulkInput, formatDeckBulkInput } from "./deckBulkInput";
import { AddButton, SubmitButton } from "./AdminButtons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MIN_CARDS = 20;

/** 어피니티 판정은 엔진의 단일 진실원(affinityAllows)에 위임한다 */
function canCharacterUse(card: CardSchemaType, char: CharacterDefSchemaType): boolean {
  return affinityAllows(card.tags, char.affinities);
}

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
  const [hideUnusable, setHideUnusable] = useState(false);
  const [typeFilter, setTypeFilter] = useState<CardType | "all">("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
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

  // generateOnly 카드(파츠·토큰 등)는 효과로만 등장하므로 덱 구축 대상에서 제외한다
  const buildableCards = allCards.filter((c) => !c.generateOnly);

  // 지정된 캐릭터들 — 둘 중 누구든 쓸 수 있으면 덱에 넣을 수 있다 (태그로 교체해 쓰면 되므로)
  const selectedChars = chars
    .map((id) => availableChars.find((c) => c.id === id))
    .filter((c): c is CharacterDefSchemaType => !!c);

  /** 이 카드를 쓸 수 있는 지정 캐릭터 목록. 캐릭터 미지정이면 판정 불가라 빈 배열 */
  function usersOf(card: CardSchemaType): CharacterDefSchemaType[] {
    return selectedChars.filter((ch) => canCharacterUse(card, ch));
  }

  /** 캐릭터를 아직 안 골랐으면 제한하지 않는다 */
  function isUsable(card: CardSchemaType): boolean {
    return selectedChars.length === 0 || usersOf(card).length > 0;
  }

  // cardType 미지정(구 카드)은 스킬로 취급 — 게임 엔진도 공격 스탯이 없으면 스킬처럼 동작한다
  const typeOf = (c: CardSchemaType): CardType => (c.cardType === "attack" ? "attack" : "skill");

  const searched = buildableCards.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase())
  );

  const typeCounts = {
    all: searched.length,
    attack: searched.filter((c) => typeOf(c) === "attack").length,
    skill: searched.filter((c) => typeOf(c) === "skill").length,
  };

  const typeFiltered = typeFilter === "all" ? searched : searched.filter((c) => typeOf(c) === typeFilter);

  const usableCount = typeFiltered.filter(isUsable).length;
  const filteredCards = hideUnusable ? typeFiltered.filter(isUsable) : typeFiltered;

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

  /** 일괄 입력 열기 — 현재 덱을 채워 넣어 편집 후 되붙일 수 있게 한다 */
  function openBulk() {
    setBulkText(formatDeckBulkInput(deckCounts));
    setBulkOpen(true);
  }

  const bulkResult = bulkOpen
    ? parseDeckBulkInput(
        bulkText,
        (cardId) => allCards.some((c) => c.id === cardId),
        (cardId) => !!allCards.find((c) => c.id === cardId)?.generateOnly,
      )
    : null;

  const bulkTotal = bulkResult?.entries.reduce((s, e) => s + e.count, 0) ?? 0;

  function applyBulk(mode: "replace" | "merge") {
    if (!bulkResult) return;
    const parsed = Object.fromEntries(bulkResult.entries.map((e) => [e.cardId, e.count]));

    setDeckCounts((prev) => {
      if (mode === "replace") return parsed;
      const next = { ...prev };
      for (const { cardId, count } of bulkResult.entries) {
        next[cardId] = (next[cardId] ?? 0) + count;
      }
      return next;
    });
    setBulkOpen(false);
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
        setTimeout(() => router.push("/admin?tab=decks"), 800);
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
        <Link href="/admin?tab=decks" className={styles.backLink}>← 목록</Link>
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
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="MY_DECK"
              disabled={mode === "edit"}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>덱 이름 *</label>
            <Input
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
              <span className={styles.panelCount}>
                {selectedChars.length > 0
                  ? `사용 가능 ${usableCount} / ${typeFiltered.length}종`
                  : `${typeFiltered.length}종`}
              </span>
            </div>
            <Input
              className={styles.searchInput}
              placeholder="카드 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.typeFilter}>
              {([
                ["all", "전체", typeCounts.all],
                ["attack", "공격", typeCounts.attack],
                ["skill", "스킬", typeCounts.skill],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.typeFilterBtn} ${typeFilter === value ? styles.typeFilterBtnActive : ""}`}
                  onClick={() => setTypeFilter(value)}
                >
                  {label} <span className={styles.typeFilterCount}>{count}</span>
                </button>
              ))}
            </div>
            {selectedChars.length === 0 ? (
              <div className={styles.poolHint}>
                캐릭터를 지정하면 그 캐릭터가 쓸 수 있는 카드만 활성화됩니다.
              </div>
            ) : (
              <label className={styles.poolToggle}>
                <input
                  type="checkbox"
                  checked={hideUnusable}
                  onChange={(e) => setHideUnusable(e.target.checked)}
                />
                사용 불가 카드 숨기기
              </label>
            )}
            <div className={styles.cardList}>
              {filteredCards.map((card) => {
                const users = usersOf(card);
                const usable = isUsable(card);
                const isAttack = card.cardType === "attack";
                // 한쪽 캐릭터만 쓸 수 있으면 누구인지 알려준다 (태그 교체가 필요하다는 뜻)
                const onlyOne = selectedChars.length === 2 && users.length === 1 ? users[0] : null;

                return (
                  <div
                    key={card.id}
                    className={`${styles.cardRow} ${usable ? "" : styles.cardRowDisabled}`}
                    onClick={() => usable && addCard(card.id)}
                    title={usable ? undefined : `${card.tags?.join(", ") ?? ""} — 지정 캐릭터의 어피니티에 없음`}
                  >
                    <div className={styles.cardRowInfo}>
                      <div className={styles.cardRowName}>
                        <span className={`${styles.typeBadge} ${isAttack ? styles.typeBadgeAttack : styles.typeBadgeSkill}`}>
                          {isAttack ? "공격" : "스킬"}
                        </span>
                        {card.name}
                        {onlyOne && <span className={styles.charOnlyBadge}>{onlyOne.name} 전용</span>}
                      </div>
                      <div className={styles.cardRowMeta}>
                        코스트 {card.cost} · 딜레이 {card.delay}
                        {isAttack && (card.groundAttack || card.antiAirAttack)
                          ? ` · ${[
                              card.groundAttack ? `지상 ${card.groundAttack}` : null,
                              card.antiAirAttack ? `대공 ${card.antiAirAttack}` : null,
                            ].filter(Boolean).join(" / ")}`
                          : ""}
                        {card.effects.length > 0 ? ` · ${card.effects.map((e) => e.type).join(", ")}` : ""}
                      </div>
                    </div>
                    <AddButton
                      disabled={!usable}
                      onClick={(ev) => { ev.stopPropagation(); addCard(card.id); }}
                    >
                      +
                    </AddButton>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 우: 현재 덱 */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>현재 덱</span>
              <div className={styles.panelHeaderRight}>
                <button
                  type="button"
                  className={styles.bulkOpenBtn}
                  onClick={() => (bulkOpen ? setBulkOpen(false) : openBulk())}
                >
                  {bulkOpen ? "닫기" : "일괄 입력"}
                </button>
                <span className={`${styles.panelCount} ${totalCards < MIN_CARDS ? styles.panelCountWarn : ""}`}>
                  {totalCards}장 {totalCards < MIN_CARDS ? `(최소 ${MIN_CARDS}장)` : ""}
                </span>
              </div>
            </div>

            {bulkOpen && bulkResult && (
              <div className={styles.bulkPanel}>
                <textarea
                  className={styles.bulkTextarea}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  spellCheck={false}
                  rows={10}
                  placeholder={"카드 id와 매수를 한 줄에 하나씩\n\nkoan_search 1\nmech_joint 3\nnagi_calm x2\n\n매수를 생략하면 1장, # 로 시작하면 주석"}
                />

                <div className={styles.bulkSummary}>
                  <span className={styles.bulkSummaryOk}>
                    {bulkResult.entries.length}종 · {bulkTotal}장
                  </span>
                  {bulkResult.unknown.length > 0 && (
                    <span className={styles.bulkSummaryErr}>
                      없는 카드 {bulkResult.unknown.length}: {bulkResult.unknown.join(", ")}
                    </span>
                  )}
                  {bulkResult.generateOnly.length > 0 && (
                    <span className={styles.bulkSummaryErr}>
                      덱 구축 불가(생성 전용) {bulkResult.generateOnly.length}: {bulkResult.generateOnly.join(", ")}
                    </span>
                  )}
                  {bulkResult.invalid.length > 0 && (
                    <span className={styles.bulkSummaryErr}>
                      형식 오류 {bulkResult.invalid.length}줄: {bulkResult.invalid.slice(0, 3).join(" / ")}
                      {bulkResult.invalid.length > 3 ? " …" : ""}
                    </span>
                  )}
                </div>

                <div className={styles.bulkBtns}>
                  <button
                    type="button"
                    className={styles.bulkApplyBtn}
                    disabled={bulkResult.entries.length === 0}
                    onClick={() => applyBulk("replace")}
                  >
                    덱 교체
                  </button>
                  <button
                    type="button"
                    className={styles.bulkApplyBtn}
                    disabled={bulkResult.entries.length === 0}
                    onClick={() => applyBulk("merge")}
                  >
                    덱에 추가
                  </button>
                  <button type="button" className={styles.bulkCancelBtn} onClick={() => setBulkOpen(false)}>
                    취소
                  </button>
                </div>
              </div>
            )}
            <div className={styles.cardList}>
              {deckEntries.length === 0 && (
                <div className={styles.emptyDeck}>← 카드 풀에서 카드를 추가하세요</div>
              )}
              {deckEntries.map(([cardId, count]) => {
                const card = allCards.find((c) => c.id === cardId);
                // 캐릭터를 나중에 바꾸면 이미 담은 카드가 못 쓰게 될 수 있다 — 눈에 띄게 표시
                const unusable = !!card && !isUsable(card);
                return (
                  <div key={cardId} className={`${styles.deckCardRow} ${unusable ? styles.deckCardRowWarn : ""}`}>
                    <div className={styles.deckCardName}>
                      {card && (
                        <span className={`${styles.typeBadge} ${card.cardType === "attack" ? styles.typeBadgeAttack : styles.typeBadgeSkill}`}>
                          {card.cardType === "attack" ? "공격" : "스킬"}
                        </span>
                      )}
                      {card?.name ?? cardId}
                      {unusable && <span className={styles.unusableBadge} title="지정 캐릭터가 쓸 수 없는 카드">사용 불가</span>}
                    </div>
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
          <Button asChild variant="outline" size="sm">
            <Link href="/admin?tab=decks">취소</Link>
          </Button>
          <SubmitButton disabled={saving}>
            {saving ? "저장 중..." : mode === "create" ? "덱 생성" : "덱 수정"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
