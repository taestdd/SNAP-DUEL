"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import type { DeckSchemaType } from "@/game/engine/deckSchema";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";

type Tab = "cards" | "decks" | "characters";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("cards");
  const [cards, setCards] = useState<Record<string, CardSchemaType>>({});
  const [decks, setDecks] = useState<Record<string, DeckSchemaType>>({});
  const [characters, setCharacters] = useState<Record<string, CharacterDefSchemaType>>({});
  const [loading, setLoading] = useState(true);

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
            onClick={() => setTab("cards")}
          >
            카드 관리
          </button>
          <button
            className={`${styles.tabBtn} ${tab === "decks" ? styles.tabActive : ""}`}
            onClick={() => setTab("decks")}
          >
            덱 관리
          </button>
          <button
            className={`${styles.tabBtn} ${tab === "characters" ? styles.tabActive : ""}`}
            onClick={() => setTab("characters")}
          >
            캐릭터 관리
          </button>
        </div>
        <Link href={newHref} className={styles.newBtn}>
          + {newLabel}
        </Link>
      </div>

      {loading && <div className={styles.empty}>로딩 중...</div>}

      {/* 카드 목록 */}
      {!loading && tab === "cards" && (
        <>
          {Object.keys(cards).length === 0 && (
            <div className={styles.empty}>카드가 없습니다.</div>
          )}
          <div className={styles.grid}>
            {Object.values(cards).map((card) => (
              <div key={card.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.cardName}>{card.name}</div>
                    <div className={styles.cardId}>{card.id}</div>
                  </div>
                </div>
                <div className={styles.stats}>
                  <span className={styles.stat}>코스트 <span className={styles.statVal}>{card.cost}</span></span>
                  <span className={styles.stat}>스피드 <span className={styles.statVal}>{card.speed}</span></span>
                  <span className={styles.stat}>게인 <span className={styles.statVal}>{card.gain}</span></span>
                  {card.useCondition && (
                    <span className={styles.stat}>조건 <span className={styles.statVal}>{card.useCondition}</span></span>
                  )}
                </div>
                <div className={styles.effectList}>
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
