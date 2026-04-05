import type { Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import styles from "./PlayerBar.module.css";

export default function PlayerBar({ me }: { me: Combatant }) {
  const burn = me.status.burn;
  const isAirborne = me.airborneStack >= 1;

  return (
    <div className={styles.wrap}>
      <div>
        <div className={styles.name}>YOU</div>

        <div className={styles.charRow}>
          {(["A", "B"] as const).map((charId) => {
            const isActive = me.activeCharacter === charId;
            const hp = me.characterHp[charId];
            const maxHp = CHARACTERS[charId].maxHp;
            return (
              <div
                key={charId}
                className={`${styles.charSlot} ${isActive ? styles.charActive : ""}`}
              >
                <span className={styles.charLabel}>
                  {isActive ? "● " : ""}Char {charId}
                </span>
                <span className={styles.charHp}>{hp}/{maxHp}</span>
              </div>
            );
          })}
        </div>

        <div className={styles.meta}>
          <span>Block: {me.block}</span>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.badges}>
          {isAirborne ? (
            <span className={`${styles.badge} ${styles.badgeAirborne}`}>
              AIR ×{me.airborneStack}
            </span>
          ) : null}

          {me.status.attackBuff > 0 ? (
            <span className={styles.badge}>ATK+ {me.status.attackBuff}</span>
          ) : null}

          {burn ? (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          ) : null}

          {me.status.exhausted ? (
            <span className={styles.badge}>EXHAUSTED</span>
          ) : null}

          {me.status.speedBonus > 0 ? (
            <span className={styles.badge}>SPD-{me.status.speedBonus} now</span>
          ) : null}

          {me.status.speedBonusNext > 0 ? (
            <span className={styles.badge}>
              SPD-{me.status.speedBonusNext} next
            </span>
          ) : null}
        </div>

        <div className={styles.small}>
          Deck {me.deck.length} · Hand {me.hand.length} · Cooldown{" "}
          {me.cooldown.length} · Trash {me.trash.length}
        </div>
      </div>
    </div>
  );
}