"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterId, Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import StatusBadges from "./StatusBadges";
import styles from "./FightingHPBar.module.css";

const GHOST_DELAY_MS = 500;
const CHARS: CharacterId[] = ["A", "B"];

export default function FightingHPBar({
  combatant,
  side,
  label,
  isThinking,
  overrideCharacterHp,
}: {
  combatant: Combatant;
  side: "left" | "right";
  label: string;
  isThinking?: boolean;
  /** ANIMATING 중 표시용 HP 오버라이드. 설정 시 combatant.characterHp 대신 사용 */
  overrideCharacterHp?: Record<CharacterId, number>;
}) {
  // overrideCharacterHp가 있으면 그 값을, 없으면 combatant.characterHp를 사용
  const effectiveCharHp = overrideCharacterHp ?? combatant.characterHp;
  const charAHp = effectiveCharHp.A;
  const charBHp = effectiveCharHp.B;

  const [ghostHp, setGhostHp] = useState<Record<CharacterId, number>>(
    () => ({ A: charAHp, B: charBHp })
  );
  const prevHpRef = useRef<Record<CharacterId, number>>({ A: charAHp, B: charBHp });

  useEffect(() => {
    const prev = prevHpRef.current;
    const next = { A: charAHp, B: charBHp };
    const hasDamage = CHARS.some((id) => (next as Record<CharacterId, number>)[id] < prev[id]);
    prevHpRef.current = { ...next };
    if (!hasDamage) { setGhostHp({ ...next }); return; }
    const timer = setTimeout(() => setGhostHp({ ...next }), GHOST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [charAHp, charBHp]);

  const { status, block, airborneStack, activeCharacter } = combatant;
  const burn = status.burn;
  const isRight = side === "right";
  const benchChar: CharacterId = activeCharacter === "A" ? "B" : "A";

  function renderPortraits() {
    return (
      <div className={[styles.portraits, isRight ? styles.portraitsRight : ""].join(" ")}>
        {CHARS.map((charId) => {
          const isActive = charId === activeCharacter;
          const dead = combatant.characterHp[charId] <= 0;
          return (
            <div
              key={charId}
              className={[
                styles.portrait,
                isActive ? styles.portraitActive : styles.portraitBench,
                isRight ? styles.portraitRight : "",
                dead ? styles.portraitDead : "",
              ].join(" ")}
            >
              <img
                src={`/sprites/charactor_profile/profile_char_${charId.toLowerCase()}.png`}
                alt={`char ${charId}`}
                className={styles.portraitImg}
              />
            </div>
          );
        })}
      </div>
    );
  }

  function renderBar(charId: CharacterId, isActive: boolean) {
    const maxHp = CHARACTERS[charId].maxHp;
    const currentHp = Math.max(0, effectiveCharHp[charId]);
    const ghost = Math.max(0, ghostHp[charId] ?? maxHp);
    const mainPct = (currentHp / maxHp) * 100;
    const ghostPct = (ghost / maxHp) * 100;
    const hpColor = mainPct > 50 ? styles.barGreen : mainPct > 25 ? styles.barYellow : styles.barRed;
    const dead = currentHp <= 0;

    return (
      <div
        key={charId}
        className={[
          styles.charRow,
          isActive ? styles.charRowActive : styles.charRowBench,
        ].join(" ")}
      >
        {isRight && <div className={styles.hpNum}>{dead ? "KO" : `${currentHp}/${maxHp}`}</div>}

        <div className={styles.barTrackWrap} data-hp-label={`${currentHp} / ${maxHp}`}>
          <div className={styles.barTrack}>
            {!dead && ghostPct > mainPct && (
              <div className={[styles.barFill, styles.barGhost, isRight ? styles.barRight : ""].join(" ")}
                style={{ width: `${ghostPct}%` }} />
            )}
            {!dead && (
              <div className={[styles.barFill, hpColor, isRight ? styles.barRight : ""].join(" ")}
                style={{ width: `${mainPct}%` }} />
            )}
            {dead && <div className={styles.barDead} />}
          </div>
        </div>

        {!isRight && <div className={styles.hpNum}>{dead ? "KO" : `${currentHp}/${maxHp}`}</div>}
      </div>
    );
  }

  const deckTotal = combatant.deck.length + combatant.hand.length + combatant.cooldown.length + combatant.trash.length;
  const deckPct = deckTotal > 0 ? (combatant.deck.length / deckTotal) * 100 : 0;

  return (
    <div className={[styles.wrap, isRight ? styles.wrapRight : ""].join(" ")}>
      {/* 초상화 — 플레이어측: 왼쪽, AI측: 오른쪽 */}
      {!isRight && renderPortraits()}

      <div className={styles.content}>
        <div className={[styles.nameRow, isRight ? styles.nameRowRight : ""].join(" ")}>
          <span className={styles.name}>{label}</span>
          {isThinking && <span className={styles.thinking}>Thinking…</span>}
          <span className={styles.zoneInfo}>
            H:{combatant.hand.length} · CD:{combatant.cooldown.length} · TR:{combatant.trash.length}
          </span>
        </div>

        {renderBar(activeCharacter, true)}
        {renderBar(benchChar, false)}

        <div className={[styles.deckRow, isRight ? styles.charRowRight : ""].join(" ")}>
          <div className={styles.barTrackWrap}>
            <div className={[styles.barTrack, styles.deckBarTrack].join(" ")}>
              <div className={[styles.barFill, styles.barDeck, isRight ? styles.barRight : ""].join(" ")}
                style={{ width: `${deckPct}%` }} />
            </div>
          </div>
          <div className={styles.deckCount}>{combatant.deck.length}</div>
        </div>

        <StatusBadges combatant={combatant} alignRight={isRight} />
      </div>

      {/* AI측 초상화는 오른쪽 */}
      {isRight && renderPortraits()}
    </div>
  );
}
