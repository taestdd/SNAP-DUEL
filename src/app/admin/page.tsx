"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import type { CardSchemaType } from "@/game/engine/cardSchema";

export default function AdminPage() {
  const [cards, setCards] = useState<Record<string, CardSchemaType>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/cards")
      .then((r) => r.json())
      .then(setCards)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm(`"${id}" 카드를 삭제하시겠습니까?`)) return;
    await fetch(`/api/admin/cards/${id}`, { method: "DELETE" });
    setCards((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const cardList = Object.values(cards);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.title}>SNAP-DUEL Admin</span>
          <span className={styles.badge}>Card Editor</span>
        </div>
        <Link href="/admin/cards/new" className={styles.newBtn}>
          + 새 카드
        </Link>
      </div>

      {loading && <div className={styles.empty}>로딩 중...</div>}

      {!loading && cardList.length === 0 && (
        <div className={styles.empty}>카드가 없습니다. 새 카드를 만들어보세요.</div>
      )}

      {!loading && (
        <div className={styles.grid}>
          {cardList.map((card) => (
            <div key={card.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.cardName}>{card.name}</div>
                  <div className={styles.cardId}>{card.id}</div>
                </div>
              </div>

              <div className={styles.stats}>
                <span className={styles.stat}>
                  코스트 <span className={styles.statVal}>{card.cost}</span>
                </span>
                <span className={styles.stat}>
                  스피드 <span className={styles.statVal}>{card.speed}</span>
                </span>
                <span className={styles.stat}>
                  게인 <span className={styles.statVal}>{card.gain}</span>
                </span>
                {card.useCondition && (
                  <span className={styles.stat}>
                    조건 <span className={styles.statVal}>{card.useCondition}</span>
                  </span>
                )}
              </div>

              <div className={styles.effectList}>
                {card.effects.map((e, i) => (
                  <span key={i} className={styles.effectTag}>
                    {e.type}
                    {e.value !== undefined ? ` ${e.value}` : ""}
                    {e.target ? ` → ${e.target}` : ""}
                  </span>
                ))}
              </div>

              <div className={styles.cardText}>{card.text}</div>

              <div className={styles.actions}>
                <Link href={`/admin/cards/${card.id}/edit`} className={styles.editBtn}>
                  편집
                </Link>
                <button className={styles.deleteBtn} onClick={() => handleDelete(card.id)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
