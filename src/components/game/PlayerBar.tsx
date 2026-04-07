import type { CharacterId, Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import styles from "./PlayerBar.module.css";

export default function PlayerBar({ me }: { me: Combatant }) {
  const burn = me.status.burn;

  return (
    <div className={styles.wrap}>
      <div className={styles.name}>YOU</div>

      <div className={styles.charRow}>
        {(["A", "B"] as CharacterId[]).map((charId) => {
          const isActive = me.activeCharacter === charId;
          const charHp = me.characterHp[charId];
          const maxHp = CHARACTERS[charId].maxHp;
          return (
            <div key={charId} className={`${styles.charSlot} ${isActive ? styles.charActive : ""}`}>
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

      {(me.status.attackBuff > 0 || burn || me.status.exhausted || me.status.speedBonus > 0 || me.status.speedBonusNext > 0) && (
        <div className={styles.badges}>
          {me.status.attackBuff > 0 && (
            <span className={styles.badge}>ATK+ {me.status.attackBuff}</span>
          )}
          {burn && (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          )}
          {me.status.exhausted && (
            <span className={styles.badge}>EXHAUSTED</span>
          )}
          {me.status.speedBonus > 0 && (
            <span className={styles.badge}>SPD-{me.status.speedBonus} now</span>
          )}
          {me.status.speedBonusNext > 0 && (
            <span className={styles.badge}>SPD-{me.status.speedBonusNext} next</span>
          )}
        </div>
      )}
    </div>
  );
}
