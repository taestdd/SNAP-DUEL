"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDeckRegistry } from "@/game/engine/state";
import { CHARACTERS } from "@/game/engine/characters";
import { useGameData } from "@/hooks/useGameData";
import { encodeSetupParams } from "@/lib/setupConfig";
import type { CharacterId, DeckDef, SetupConfig } from "@/game/engine/types";
import styles from "./MainMenu.module.css";

/* ── 덱 + 캐릭터 순서 선택 블록 ── */
function DeckPicker({
  label,
  deckId,
  charOrder,
  onDeckSelect,
  onCharSelect,
  onSwap,
}: {
  label: string;
  deckId: string | null;
  charOrder: [CharacterId, CharacterId] | null;
  onDeckSelect: (id: string) => void;
  onCharSelect: (id: CharacterId) => void;
  onSwap: () => void;
}) {
  const decks = Object.values(getDeckRegistry());
  const selectedDeck: DeckDef | null = deckId ? getDeckRegistry()[deckId] : null;

  return (
    <div className={styles.pickerBlock}>
      {label && <div className={styles.pickerLabel}>{label}</div>}

      <select
        className={styles.deckSelect}
        value={deckId ?? ""}
        onChange={(e) => e.target.value && onDeckSelect(e.target.value)}
      >
        <option value="">덱을 선택하세요</option>
        {decks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name} ({deck.cards.length}장)
          </option>
        ))}
      </select>

      {selectedDeck && (
        <div className={styles.charRow}>
          {selectedDeck.characters.map((charId) => {
            const char = CHARACTERS[charId];
            const isStarter = charOrder?.[0] === charId;
            return (
              <button
                key={charId}
                type="button"
                className={`${styles.charCard} ${isStarter ? styles.charStarter : styles.charBackup}`}
                onClick={() => onCharSelect(charId)}
              >
                {isStarter
                  ? <span className={styles.charBadge}>선발</span>
                  : <span className={`${styles.charBadge} ${styles.charBadgeBackup}`}>후발</span>
                }
                <span className={styles.charName}>{char?.name ?? charId}</span>
                <span className={styles.charHp}>HP {char?.maxHp}</span>
              </button>
            );
          })}
          <button type="button" className={styles.swapBtn} onClick={onSwap} disabled={!charOrder}>↔</button>
        </div>
      )}
    </div>
  );
}

/* ── 메인 ── */
export default function MainMenu() {
  const router = useRouter();
  const dataStatus = useGameData();

  const [playerDeckId, setPlayerDeckId] = useState<string | null>(null);
  const [playerCharOrder, setPlayerCharOrder] = useState<[CharacterId, CharacterId] | null>(null);

  const [showAi, setShowAi] = useState(false);
  const [aiDeckId, setAiDeckId] = useState<string | null>(null);
  const [aiCharOrder, setAiCharOrder] = useState<[CharacterId, CharacterId] | null>(null);

  function pickDeck(who: "player" | "ai", deckId: string) {
    const deck = getDeckRegistry()[deckId];
    const order: [CharacterId, CharacterId] = [deck.characters[0], deck.characters[1]];
    if (who === "player") { setPlayerDeckId(deckId); setPlayerCharOrder(order); }
    else { setAiDeckId(deckId); setAiCharOrder(order); }
  }

  function pickChar(who: "player" | "ai", charId: CharacterId) {
    const deckId = who === "player" ? playerDeckId : aiDeckId;
    if (!deckId) return;
    const deck = getDeckRegistry()[deckId];
    const other = deck.characters.find((c) => c !== charId)!;
    const order: [CharacterId, CharacterId] = [charId, other];
    if (who === "player") setPlayerCharOrder(order);
    else setAiCharOrder(order);
  }

  function swap(who: "player" | "ai") {
    if (who === "player") setPlayerCharOrder((p) => p ? [p[1], p[0]] : p);
    else setAiCharOrder((p) => p ? [p[1], p[0]] : p);
  }

  const playerReady = !!(playerDeckId && playerCharOrder);
  const aiReady = !!(aiDeckId && aiCharOrder);

  function startAiGame() {
    if (!playerReady || !aiReady) return;
    const player: SetupConfig = { deckId: playerDeckId!, characters: playerCharOrder! };
    const ai: SetupConfig = { deckId: aiDeckId!, characters: aiCharOrder! };
    router.push(`/game?${encodeSetupParams(player, ai)}`);
  }

  function goOnline() {
    if (!playerReady) return;
    const player: SetupConfig = { deckId: playerDeckId!, characters: playerCharOrder! };
    router.push(`/online?${encodeSetupParams(player)}`);
  }

  if (dataStatus === "loading") {
    return (
      <div className={styles.center}>
        <p className={styles.loadingText}>로딩 중...</p>
      </div>
    );
  }

  if (dataStatus === "error") {
    return (
      <div className={styles.center}>
        <p className={styles.errorText}>데이터를 불러올 수 없습니다. 새로고침 해주세요.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        <header className={styles.header}>
          <h1 className={styles.title}>Snap Duel</h1>
          <span className={styles.subtitle}>Card Fighting Game</span>
        </header>

        {/* 내 덱 선택 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>내 덱</h2>
          <DeckPicker
            label=""
            deckId={playerDeckId}
            charOrder={playerCharOrder}
            onDeckSelect={(id) => pickDeck("player", id)}
            onCharSelect={(c) => pickChar("player", c)}
            onSwap={() => swap("player")}
          />
        </section>

        {/* 튜토리얼 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>처음이신가요?</h2>
          <Link href="/tutorial" className={styles.tutorialBtn}>
            튜토리얼 시작
          </Link>
        </section>

        {/* 모드 선택 */}
        <section className={`${styles.section} ${!playerReady ? styles.sectionLocked : ""}`}>
          <h2 className={styles.sectionTitle}>모드 선택</h2>
          <div className={styles.modeList}>
            <button
              type="button"
              className={`${styles.modeBtn} ${showAi ? styles.modeBtnActive : ""}`}
              disabled={!playerReady}
              onClick={() => setShowAi((v) => !v)}
            >
              AI 대전
            </button>
            <button
              type="button"
              className={styles.modeBtn}
              disabled={!playerReady}
              onClick={goOnline}
            >
              온라인 대전
            </button>
            <button type="button" className={styles.modeBtn} disabled>
              랭크 대전
              <span className={styles.soon}>준비 중</span>
            </button>
          </div>
        </section>

        {/* AI 덱 선택 (AI 대전 선택 시) */}
        {showAi && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>AI 덱</h2>
            <DeckPicker
              label=""
              deckId={aiDeckId}
              charOrder={aiCharOrder}
              onDeckSelect={(id) => pickDeck("ai", id)}
              onCharSelect={(c) => pickChar("ai", c)}
              onSwap={() => swap("ai")}
            />
            <button
              type="button"
              className={`${styles.startBtn} ${!aiReady ? styles.startBtnDisabled : ""}`}
              disabled={!aiReady}
              onClick={startAiGame}
            >
              게임 시작
            </button>
          </section>
        )}

        <a href="/admin" target="_blank" rel="noopener noreferrer" className={styles.adminLink}>
          ⚙ 카드 에디터
        </a>

      </div>
    </div>
  );
}
