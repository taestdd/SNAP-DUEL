"use client";

import type { CharacterId, Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import { useDamagedChars } from "./useDamagedChars";
import StatusBadges from "./StatusBadges";
import styles from "./ArenaHeader.module.css";

export default function ArenaHeader({ ai, isThinking }: { ai: Combatant; isThinking?: boolean }) {
  const damagedChars = useDamagedChars(ai.characterHp);

  return (
    <div className={styles.wrap}>
      <div className={styles.nameRow}>
        <div className={styles.name}>AI</div>
        {isThinking && <span className={styles.thinking}>🤔 Thinking…</span>}
      </div>

      <div className={styles.charRow}>
        {(["A", "B"] as CharacterId[]).map((charId) => {
          const isActive = ai.activeCharacter === charId;
          const charHp = ai.characterHp[charId];
          const maxHp = CHARACTERS[charId].maxHp;
          return (
            <div
              key={charId}
              className={`${styles.charSlot} ${isActive ? styles.charActive : ""} ${damagedChars.has(charId) ? styles.charDamaged : ""}`}
            >
              <span className={styles.charName}>{charId}</span>
              <span className={styles.charHp}>{charHp}/{maxHp}</span>
              {isActive && ai.airborneStack >= 1 && (
                <span className={styles.airBadge}>⬆×{ai.airborneStack}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.stats}>
        <span>Block: {ai.block}</span>
      </div>

      <div className={styles.zones}>
        Deck {ai.deck.length} · Hand {ai.hand.length} · Cooldown {ai.cooldown.length} · Trash {ai.trash.length}
      </div>

      <StatusBadges combatant={ai} />
    </div>
  );
}
