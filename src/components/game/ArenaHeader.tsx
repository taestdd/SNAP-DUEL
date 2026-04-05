import type { Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import styles from "./ArenaHeader.module.css";

export default function ArenaHeader({ ai }: { ai: Combatant }) {
  const burn = ai.status.burn;
  const isAirborne = ai.airborneStack >= 1;

  return (
    <div className={styles.wrap}>
      <div>
        <div className={styles.name}>AI</div>

        <div className={styles.charRow}>
          {(["A", "B"] as const).map((charId) => {
            const isActive = ai.activeCharacter === charId;
            const hp = ai.characterHp[charId];
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
          <span>Block: {ai.block}</span>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.badges}>
          {isAirborne ? (
            <span className={`${styles.badge} ${styles.badgeAirborne}`}>
              AIR ×{ai.airborneStack}
            </span>
          ) : null}

          {ai.status.attackBuff > 0 ? (
            <span className={styles.badge}>ATK+ {ai.status.attackBuff}</span>
          ) : null}

          {burn ? (
            <span className={styles.badge}>
              BURN {burn.turns}t · {burn.dmgPerTurn}/t
            </span>
          ) : null}

          {ai.status.exhausted ? (
            <span className={styles.badge}>EXHAUSTED</span>
          ) : null}

          {ai.status.speedBonus > 0 ? (
            <span className={styles.badge}>SPD-{ai.status.speedBonus} now</span>
          ) : null}

          {ai.status.speedBonusNext > 0 ? (
            <span className={styles.badge}>
              SPD-{ai.status.speedBonusNext} next
            </span>
          ) : null}
        </div>

        <div className={styles.small}>
          Deck {ai.deck.length} · Hand {ai.hand.length} · Cooldown{" "}
          {ai.cooldown.length} · Trash {ai.trash.length}
        </div>
      </div>
    </div>
  );
}