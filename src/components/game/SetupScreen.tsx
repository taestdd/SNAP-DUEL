"use client";

import { useEffect, useState } from "react";
import { getDeckRegistry } from "@/game/engine/state";
import { CHARACTERS } from "@/game/engine/characters";
import type { CharacterId, DeckDef, SetupConfig } from "@/game/engine/types";
import styles from "./SetupScreen.module.css";

interface PlayerSetupProps {
  label: string;
  deckId: string | null;
  charOrder: [CharacterId, CharacterId] | null;
  onDeckSelect: (id: string) => void;
  onSwap: () => void;
  onCharSelect: (char: CharacterId) => void;
}

function PlayerSetup({ label, deckId, charOrder, onDeckSelect, onSwap, onCharSelect }: PlayerSetupProps) {
  const decks = Object.values(getDeckRegistry());
  const selectedDeck: DeckDef | null = deckId ? getDeckRegistry()[deckId] : null;

  return (
    <div className={styles.playerBlock}>
      {label && <div className={styles.playerLabel}>{label}</div>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>덱 선택</h2>
        <div className={styles.deckGrid}>
          {decks.map((deck) => (
            <button
              key={deck.id}
              type="button"
              className={`${styles.deckCard} ${deckId === deck.id ? styles.deckSelected : ""}`}
              onClick={() => onDeckSelect(deck.id)}
            >
              <div className={styles.deckName}>{deck.name}</div>
              <div className={styles.deckMeta}>
                {deck.cards.length}장 · {deck.characters.join(", ")}
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedDeck && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            캐릭터 순서
            <span className={styles.sectionHint}>선발로 내보낼 캐릭터를 선택하세요</span>
          </h2>
          <div className={styles.orderRow}>
            {selectedDeck.characters.map((charId) => {
              const char = CHARACTERS[charId];
              const isStarter = charOrder?.[0] === charId;
              const isBackup = charOrder?.[1] === charId;
              return (
                <button
                  key={charId}
                  type="button"
                  className={`${styles.charCard} ${isStarter ? styles.charStarter : ""} ${isBackup ? styles.charBackup : ""}`}
                  onClick={() => onCharSelect(charId)}
                >
                  {isStarter && <div className={styles.charBadge}>선발</div>}
                  {isBackup && <div className={`${styles.charBadge} ${styles.charBadgeBackup}`}>후발</div>}
                  <div className={styles.charName}>{charId}</div>
                  <div className={styles.charHp}>HP {char.maxHp}</div>
                </button>
              );
            })}
            <button type="button" className={styles.swapBtn} onClick={onSwap} disabled={!charOrder}>
              ↔
            </button>
          </div>
          {charOrder && (
            <div className={styles.orderPreview}>
              <span className={styles.orderChar}>{charOrder[0]}</span>
              <span className={styles.orderArrow}>→</span>
              <span className={styles.orderChar}>{charOrder[1]}</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface Props {
  showAi?: boolean;
  onConfirm: (playerConfig: SetupConfig, aiConfig?: SetupConfig) => void;
}

export default function SetupScreen({ showAi = false, onConfirm }: Props) {
  const [playerDeckId, setPlayerDeckId] = useState<string | null>(null);
  const [playerCharOrder, setPlayerCharOrder] = useState<[CharacterId, CharacterId] | null>(null);
  const [aiDeckId, setAiDeckId] = useState<string | null>(null);
  const [aiCharOrder, setAiCharOrder] = useState<[CharacterId, CharacterId] | null>(null);

  useEffect(() => {
    document.body.style.overflow = "auto";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleDeckSelect(who: "player" | "ai", deckId: string) {
    const deck = getDeckRegistry()[deckId];
    const defaultOrder: [string, string] = [deck.characters[0], deck.characters[1]];
    if (who === "player") {
      setPlayerDeckId(deckId);
      setPlayerCharOrder(defaultOrder);
    } else {
      setAiDeckId(deckId);
      setAiCharOrder(defaultOrder);
    }
  }

  function handleCharSelect(who: "player" | "ai", charId: CharacterId) {
    const deckId = who === "player" ? playerDeckId : aiDeckId;
    if (!deckId) return;
    const deck = getDeckRegistry()[deckId];
    const other = deck.characters.find((c) => c !== charId)!;
    const newOrder: [string, string] = [charId, other];
    if (who === "player") setPlayerCharOrder(newOrder);
    else setAiCharOrder(newOrder);
  }

  function handleSwap(who: "player" | "ai") {
    if (who === "player") {
      setPlayerCharOrder((prev) => prev ? [prev[1], prev[0]] : prev);
    } else {
      setAiCharOrder((prev) => prev ? [prev[1], prev[0]] : prev);
    }
  }

  const canConfirm = playerDeckId !== null && playerCharOrder !== null &&
    (!showAi || (aiDeckId !== null && aiCharOrder !== null));

  function handleConfirm() {
    if (!canConfirm || !playerCharOrder) return;
    const playerConfig: SetupConfig = { deckId: playerDeckId!, characters: playerCharOrder };
    const aiConfig: SetupConfig | undefined = showAi && aiDeckId && aiCharOrder
      ? { deckId: aiDeckId, characters: aiCharOrder }
      : undefined;
    onConfirm(playerConfig, aiConfig);
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Snap Duel</h1>
          <p className={styles.sub}>덱을 선택하고 캐릭터 순서를 정하세요</p>
        </header>

        <PlayerSetup
          label={showAi ? "내 설정" : ""}
          deckId={playerDeckId}
          charOrder={playerCharOrder}
          onDeckSelect={(id) => handleDeckSelect("player", id)}
          onSwap={() => handleSwap("player")}
          onCharSelect={(c) => handleCharSelect("player", c)}
        />

        {showAi && (
          <>
            <div className={styles.divider}>AI 설정</div>
            <PlayerSetup
              label=""
              deckId={aiDeckId}
              charOrder={aiCharOrder}
              onDeckSelect={(id) => handleDeckSelect("ai", id)}
              onSwap={() => handleSwap("ai")}
              onCharSelect={(c) => handleCharSelect("ai", c)}
            />
          </>
        )}

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
