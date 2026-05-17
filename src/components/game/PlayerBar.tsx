"use client";

import type { Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import { useDamagedChars } from "./useDamagedChars";
import StatusBadges from "./StatusBadges";
import styles from "./PlayerBar.module.css";

export default function PlayerBar({ me }: { me: Combatant }) {
  const damagedChars = useDamagedChars(me.characterHp);

  return (
    <div className={styles.wrap}>
      <div className={styles.name}>YOU</div>

      <div className={styles.charRow}>
        {Object.keys(me.characterHp).map((charId) => {
          const isActive = me.activeCharacter === charId;
          const charHp = me.characterHp[charId];
          const maxHp = CHARACTERS[charId].maxHp;
          return (
            <div
              key={charId}
              className={`${styles.charSlot} ${isActive ? styles.charActive : ""} ${damagedChars.has(charId) ? styles.charDamaged : ""}`}
            >
              <span className={styles.charName}>{charId}</span>
              <span className={styles.charHp}>{charHp}/{maxHp}</span>
              {isActive && me.airborneStack >= 1 && (
                <span className={styles.airBadge}>⬆×{me.airborneStack}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.stats}>
        <span>Block: {me.block}</span>
      </div>

      <div className={styles.zones}>
        Deck {me.deck.length} · Hand {me.hand.length} · Cooldown {me.cooldown.length} · Trash {me.trash.length}
      </div>

      <StatusBadges combatant={me} />
    </div>
  );
}
