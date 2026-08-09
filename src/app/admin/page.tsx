"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import type { DeckSchemaType } from "@/game/engine/deckSchema";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";
import { CardTagSchema } from "@/game/engine/cardSchema";
import BulkImportModal from "@/components/admin/BulkImportModal";

type Tab = "cards" | "decks" | "characters";
type SortField = "id" | "name" | "cost" | "delay" | "advantage";
type SortDir = "asc" | "desc";

const CARD_TAGS = CardTagSchema.options;
const FILTER_KEY = "adminCardFilter";

function loadFilter(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? "{}"); } catch { return {}; }
}

const TABS: Tab[] = ["cards", "decks", "characters"];

function isTab(v: string | null): v is Tab {
  return v !== null && (TABS as string[]).includes(v);
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("cards");

  // ?tab= 복원 — 마운트 후에 읽어야 SSR 결과와 어긋나지 않는다.
  // (편집기가 저장 후 ?tab=characters 로 돌려보내도 종전에는 항상 카드 탭이 열렸다)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (isTab(t)) setTab(t);
  }, []);

  /** 탭 전환 시 URL도 맞춘다 — 새로고침·뒤로가기·편집 후 복귀가 같은 탭을 연다 */
  function changeTab(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", next === "cards" ? "/admin" : `/admin?tab=${next}`);
  }
  const [cards, setCards] = useState<Record<string, CardSchemaType>>({});
  const [decks, setDecks] = useState<Record<string, DeckSchemaType>>({});
  const [characters, setCharacters] = useState<Record<string, CharacterDefSchemaType>>({});
  const [loading, setLoading] = useState(true);
  const [showBulkImport, setShowBulkImport] = useState(false);

  // 카드 필터/정렬 상태 — sessionStorage로 복원
  const [search, setSearch] = useState(() => loadFilter().search ?? "");
  const [filterType, setFilterType] = useState(() => loadFilter().filterType ?? "");
  const [filterTag, setFilterTag] = useState(() => loadFilter().filterTag ?? "");
  const [filterCondition, setFilterCondition] = useState(() => loadFilter().filterCondition ?? "");
  const [filterAltCost, setFilterAltCost] = useState(() => loadFilter().filterAltCost ?? "");
  const [sortField, setSortField] = useState<SortField>(() => (loadFilter().sortField as SortField) ?? "id");
  const [sortDir, setSortDir] = useState<SortDir>(() => (loadFilter().sortDir as SortDir) ?? "asc");

  useEffect(() => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ search, filterType, filterTag, filterCondition, filterAltCost, sortField, sortDir }));
  }, [search, filterType, filterTag, filterCondition, filterAltCost, sortField, sortDir]);

  useEffect(() => {
    setLoading(true);
    const url =
      tab === "cards" ? "/api/admin/cards"
      : tab === "decks" ? "/api/admin/decks"
      : "/api/admin/characters";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (tab === "cards") setCards(data);
        else if (tab === "decks") setDecks(data);
        else setCharacters(data);
      })
      .finally(() => setLoading(false));
  }, [tab]);

  const filteredCards = useMemo(() => {
    let list = Object.values(cards);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    if (filterType) {
      list = list.filter((c) => c.cardType === filterType);
    }
    if (filterTag) {
      list = list.filter((c) => (c.tags ?? []).includes(filterTag as NonNullable<CardSchemaType["tags"]>[number]));
    }
    if (filterCondition) {
      list = list.filter((c) => c.useCondition === filterCondition);
    }
    if (filterAltCost === "yes") {
      list = list.filter((c) => !!c.altCost);
    } else if (filterAltCost === "no") {
      list = list.filter((c) => !c.altCost);
    }

    list.sort((a, b) => {
      const av: string | number = sortField === "name" ? a.name : sortField === "id" ? a.id : a[sortField] ?? 0;
      const bv: string | number = sortField === "name" ? b.name : sortField === "id" ? b.id : b[sortField] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return list;
  }, [cards, search, filterType, filterTag, filterCondition, filterAltCost, sortField, sortDir]);

  function toggleSortDir() {
    setSortDir((d) => d === "asc" ? "desc" : "asc");
  }

  async function handleDeleteCard(id: string) {
    if (!confirm(`"${id}" 카드를 삭제하시겠습니까?`)) return;
    await fetch(`/api/admin/cards/${id}`, { method: "DELETE" });
    setCards((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  async function handleDeleteDeck(id: string) {
    if (!confirm(`"${id}" 덱을 삭제하시겠습니까?`)) return;
    await fetch(`/api/admin/decks/${id}`, { method: "DELETE" });
    setDecks((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  async function handleDeleteCharacter(id: string) {
    if (!confirm(`"${id}" 캐릭터를 삭제하시겠습니까?`)) return;
    await fetch(`/api/admin/characters/${id}`, { method: "DELETE" });
    setCharacters((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  const newHref =
    tab === "cards" ? "/admin/cards/new"
    : tab === "decks" ? "/admin/decks/new"
    : "/admin/characters/new";
  const newLabel =
    tab === "cards" ? "새 카드"
    : tab === "decks" ? "새 덱"
    : "새 캐릭터";

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span className={styles.title}>SNAP-DUEL Admin</span>
        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${tab === "cards" ? styles.tabActive : ""}`}
            onClick={() => changeTab("cards")}
          >
            카드
          </button>
          <button
            className={`${styles.tabBtn} ${tab === "decks" ? styles.tabActive : ""}`}
            onClick={() => changeTab("decks")}
          >
            덱
          </button>
          <button
            className={`${styles.tabBtn} ${tab === "characters" ? styles.tabActive : ""}`}
            onClick={() => changeTab("characters")}
          >
            캐릭터
          </button>
        </div>
        <div className={styles.headerActions}>
          {tab === "cards" && (
            <button className={styles.bulkBtn} onClick={() => setShowBulkImport(true)}>
              ↑ 일괄 등록
            </button>
          )}
          <Link href={newHref} className={styles.newBtn}>
            + {newLabel}
          </Link>
        </div>
      </div>

      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => {
            setShowBulkImport(false);
            fetch("/api/admin/cards")
              .then((r) => r.json())
              .then(setCards);
          }}
        />
      )}

      {loading && <div className={styles.empty}>로딩 중...</div>}

      {/* 카드 목록 */}
      {!loading && tab === "cards" && (
        <>
          {/* 필터 & 정렬 바 */}
          <div className={styles.filterBar}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="이름 / ID 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className={styles.filterSelect} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">타입 전체</option>
              <option value="attack">attack</option>
              <option value="skill">skill</option>
            </select>
            <select className={styles.filterSelect} value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="">태그 전체</option>
              {CARD_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={styles.filterSelect} value={filterCondition} onChange={(e) => setFilterCondition(e.target.value)}>
              <option value="">조건 전체</option>
              <option value="ground">ground</option>
              <option value="airborne">airborne</option>
            </select>
            <select className={styles.filterSelect} value={filterAltCost} onChange={(e) => setFilterAltCost(e.target.value)}>
              <option value="">altCost 전체</option>
              <option value="yes">altCost 있음</option>
              <option value="no">altCost 없음</option>
            </select>
            <div className={styles.sortGroup}>
              <select className={styles.filterSelect} value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                <option value="id">ID</option>
                <option value="name">이름</option>
                <option value="cost">코스트</option>
                <option value="delay">딜레이</option>
                <option value="advantage">어드밴티지</option>
              </select>
              <button className={styles.sortDirBtn} onClick={toggleSortDir} title="정렬 방향 전환">
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>
            <span className={styles.resultCount}>{filteredCards.length}개</span>
          </div>

          {filteredCards.length === 0 && (
            <div className={styles.empty}>조건에 맞는 카드가 없습니다.</div>
          )}
          <div className={styles.grid}>
            {filteredCards.map((card) => (
              <div key={card.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.cardName}>{card.name}</div>
                    <div className={styles.cardId}>{card.id}</div>
                  </div>
                  {card.altCost && <span className={styles.altCostBadge}>altCost</span>}
                </div>
                <div className={styles.stats}>
                  <span className={styles.stat}>코스트 <span className={styles.statVal}>{card.cost}</span></span>
                  <span className={styles.stat}>딜레이 <span className={styles.statVal}>{card.delay}</span></span>
                  <span className={styles.stat}>어드밴티지 <span className={styles.statVal}>{card.advantage}</span></span>
                  {card.useCondition && (
                    <span className={styles.stat}>조건 <span className={styles.statVal}>{card.useCondition}</span></span>
                  )}
                  {card.actionTag && (
                    <span className={styles.stat}>애니 <span className={styles.statVal}>{card.actionTag}</span></span>
                  )}
                  {card.actionTagAirborne && (
                    <span className={styles.stat}>애니↑ <span className={styles.statVal}>{card.actionTagAirborne}</span></span>
                  )}
                </div>
                <div className={styles.effectList}>
                  {(card.tags ?? []).map((t) => (
                    <span key={t} className={styles.tagBadge}>{t}</span>
                  ))}
                  {(card.effects ?? []).map((e, i) => (
                    <span key={i} className={styles.effectTag}>
                      {e.type}{e.value !== undefined ? ` ${e.value}` : ""}{e.target ? ` → ${e.target}` : ""}
                    </span>
                  ))}
                </div>
                <div className={styles.cardText}>{card.text}</div>
                <div className={styles.actions}>
                  <Link href={`/admin/cards/${card.id}/edit`} className={styles.editBtn}>편집</Link>
                  <button className={styles.deleteBtn} onClick={() => handleDeleteCard(card.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 덱 목록 */}
      {!loading && tab === "decks" && (
        <>
          {Object.keys(decks).length === 0 && (
            <div className={styles.empty}>덱이 없습니다.</div>
          )}
          <div className={styles.grid}>
            {Object.values(decks).map((deck) => (
              <div key={deck.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.cardName}>{deck.name}</div>
                    <div className={styles.cardId}>{deck.id}</div>
                  </div>
                </div>
                <div className={styles.stats}>
                  <span className={styles.stat}>카드 <span className={styles.statVal}>{deck.cards.length}장</span></span>
                  <span className={styles.stat}>선발 <span className={styles.statVal}>{deck.characters[0]}</span></span>
                  <span className={styles.stat}>후발 <span className={styles.statVal}>{deck.characters[1]}</span></span>
                </div>
                <div className={styles.effectList}>
                  {Array.from(new Set(deck.cards)).map((cardId) => {
                    const count = deck.cards.filter((c) => c === cardId).length;
                    return (
                      <span key={cardId} className={styles.effectTag}>
                        {cardId} ×{count}
                      </span>
                    );
                  })}
                </div>
                <div className={styles.actions}>
                  <Link href={`/admin/decks/${deck.id}/edit`} className={styles.editBtn}>편집</Link>
                  <button className={styles.deleteBtn} onClick={() => handleDeleteDeck(deck.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 캐릭터 목록 */}
      {!loading && tab === "characters" && (
        <>
          {Object.keys(characters).length === 0 && (
            <div className={styles.empty}>캐릭터가 없습니다.</div>
          )}
          <div className={styles.grid}>
            {Object.values(characters).map((char) => (
              <div key={char.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.cardName}>{char.name}</div>
                    <div className={styles.cardId}>{char.id}</div>
                  </div>
                </div>
                <div className={styles.stats}>
                  <span className={styles.stat}>HP <span className={styles.statVal}>{char.maxHp}</span></span>
                  <span className={styles.stat}>스프라이트 <span className={styles.statVal}>{char.spriteId}</span></span>
                </div>
                <div className={styles.effectList}>
                  {char.affinities.map((tag) => (
                    <span key={tag} className={styles.effectTag}>{tag}</span>
                  ))}
                </div>
                <div className={styles.actions}>
                  <Link href={`/admin/characters/${char.id}/edit`} className={styles.editBtn}>편집</Link>
                  <button className={styles.deleteBtn} onClick={() => handleDeleteCharacter(char.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
