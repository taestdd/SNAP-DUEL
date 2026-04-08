"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterId, Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import styles from "./ArenaHeader.module.css";

export default function ArenaHeader({ ai }: { ai: Combatant }) {
  const burn = ai.status.burn;

  const prevHpRef = useRef<Record<CharacterId, number>>(ai.characterHp);
  const [damagedChars, setDamagedChars] = useState<Set<CharacterId>>(new Set());

  useEffect(() => {
    const prev = prevHpRef.current;
    const damaged = new Set<CharacterId>();

    (["A", "B"] as CharacterId[]).forEach((charId) => {
      if (ai.characterHp[charId] < prev[charId]) {
        damaged.add(charId);
      }
    });

    prevHpRef.current = ai.characterHp;

    if (damaged.size > 0) {
      setDamagedChars(damaged);
      const timer = setTimeout(() => setDamagedChars(new Set()), 500);
      return () => clearTimeout(timer);
    }
  }, [ai.characterHp]);

  return (
    <div className={styles.wrap}>
      <div className={styles.name}>AI</div>

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

      {(ai.status.attackBuff > 0 || burn || ai.status.exhausted || ai.status.speedBonus > 0 || ai.status.speedBonusNext > 0) && (
        <div className={styles.badges}>
          {ai.status.attackBuff > 0 && (
            <span className={styles.badge}>ATK+ {ai.status.attackBuff}</span>
          )}
          {burn && (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          )}
          {ai.status.exhausted && (
            <span className={styles.badge}>EXHAUSTED</span>
          )}
          {ai.status.speedBonus > 0 && (
            <span className={styles.badge}>SPD-{ai.status.speedBonus} now</span>
          )}
          {ai.status.speedBonusNext > 0 && (
            <span className={styles.badge}>SPD-{ai.status.speedBonusNext} next</span>
          )}
        </div>
      )}
    </div>
  );
}
