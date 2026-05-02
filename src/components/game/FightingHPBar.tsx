"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterId, Combatant } from "@/game/engine/types";
import { CHARACTERS } from "@/game/engine/characters";
import styles from "./FightingHPBar.module.css";

const GHOST_DELAY_MS = 500;

export default function FightingHPBar({
  combatant,
  side,
  label,
  isThinking,
}: {
  combatant: Combatant;
  side: "left" | "right";
  label: string;
  isThinking?: boolean;
}) {
  const [ghostHp, setGhostHp] = useState<Record<CharacterId, number>>(
    () => ({ ...combatant.characterHp })
  );
  const prevHpRef = useRef<Record<CharacterId, number>>({ ...combatant.characterHp });

  useEffect(() => {
    const prev = prevHpRef.current;
    const next = combatant.characterHp;

    const hasDamage = (["A", "B"] as CharacterId[]).some(
      (id) => next[id] < prev[id]
    );

    prevHpRef.current = { ...next };

    if (!hasDamage) {
      // 회복 또는 변화 없음 — 즉시 동기화
      setGhostHp({ ...next });
      return;
    }

    // 피해 — ghost는 이전 값 유지, delay 후 따라붙기
    const timer = setTimeout(() => {
      setGhostHp({ ...next });
    }, GHOST_DELAY_MS);

    return () => clearTimeout(timer);
  }, [combatant.characterHp]);

  const { status, block, airborneStack, activeCharacter } = combatant;
  const burn = status.burn;
  const isRight = side === "right";

  function renderBar(charId: CharacterId, isActive: boolean) {
    const maxHp = CHARACTERS[charId].maxHp;
    const currentHp = Math.max(0, combatant.characterHp[charId]);
    const ghost = Math.max(0, ghostHp[charId] ?? maxHp);

    const mainPct = (currentHp / maxHp) * 100;
    const ghostPct = (ghost / maxHp) * 100;

    const hpColor =
      mainPct > 50 ? styles.barGreen :
      mainPct > 25 ? styles.barYellow :
      styles.barRed;

    const dead = currentHp <= 0;

    return (
      <div
        key={charId}
        className={[
          styles.charRow,
          isActive ? styles.charRowActive : styles.charRowBench,
          isRight ? styles.charRowRight : "",
        ].join(" ")}
      >
        {/* 캐릭터 라벨 (오른쪽 사이드면 라벨이 오른쪽에) */}
        {!isRight && (
          <div className={styles.charLabel}>{charId}</div>
        )}

        {/* 바 래퍼 — 툴팁 overflow 처리 */}
        <div
          className={styles.barTrackWrap}
          data-hp-label={`${currentHp} / ${maxHp}`}
        >
          {/* 바 트랙 — overflow: hidden 으로 fill 클리핑 */}
          <div className={styles.barTrack}>
            {/* 잔상(ghost) 바 */}
            {!dead && ghostPct > mainPct && (
              <div
                className={[styles.barFill, styles.barGhost, isRight ? styles.barRight : ""].join(" ")}
                style={{ width: `${ghostPct}%` }}
              />
            )}
            {/* 메인 바 */}
            {!dead && (
              <div
                className={[styles.barFill, hpColor, isRight ? styles.barRight : ""].join(" ")}
                style={{ width: `${mainPct}%` }}
              />
            )}
            {dead && (
              <div className={styles.barDead} />
            )}
          </div>
        </div>

        {isRight && (
          <div className={styles.charLabel}>{charId}</div>
        )}
      </div>
    );
  }

  // 활성/벤치 순서
  const benchChar: CharacterId = activeCharacter === "A" ? "B" : "A";

  // 덱 바 계산
  const deckTotal =
    combatant.deck.length +
    combatant.hand.length +
    combatant.cooldown.length +
    combatant.trash.length;
  const deckPct = deckTotal > 0 ? (combatant.deck.length / deckTotal) * 100 : 0;

  return (
    <div className={[styles.wrap, isRight ? styles.wrapRight : ""].join(" ")}>
      {/* 플레이어 이름 + 존 카운트 (D: 제외) */}
      <div className={[styles.nameRow, isRight ? styles.nameRowRight : ""].join(" ")}>
        <span className={styles.name}>{label}</span>
        {isThinking && <span className={styles.thinking}>Thinking…</span>}
        <span className={styles.zoneInfo}>
          H:{combatant.hand.length} · CD:{combatant.cooldown.length} · TR:{combatant.trash.length}
        </span>
      </div>

      {/* 활성 캐릭터 바 */}
      {renderBar(activeCharacter, true)}

      {/* 벤치 캐릭터 바 */}
      {renderBar(benchChar, false)}

      {/* 덱 바 */}
      <div className={[styles.deckRow, isRight ? styles.charRowRight : ""].join(" ")}>
        {!isRight && <div className={styles.charLabel}>D</div>}
        <div className={styles.barTrackWrap}>
          <div className={[styles.barTrack, styles.deckBarTrack].join(" ")}>
            <div
              className={[styles.barFill, styles.barDeck, isRight ? styles.barRight : ""].join(" ")}
              style={{ width: `${deckPct}%` }}
            />
          </div>
        </div>
        <div className={styles.deckCount}>{combatant.deck.length}</div>
        {isRight && <div className={styles.charLabel}>D</div>}
      </div>

      {/* 상태 배지 */}
      {(airborneStack >= 1 ||
        block > 0 ||
        status.attackBuff > 0 ||
        burn ||
        status.exhausted ||
        status.speedBonus > 0 ||
        status.speedBonusNext > 0) && (
        <div className={[styles.badges, isRight ? styles.badgesRight : ""].join(" ")}>
          {airborneStack >= 1 && (
            <span className={[styles.badge, styles.badgeAir].join(" ")}>⬆ ×{airborneStack}</span>
          )}
          {block > 0 && <span className={styles.badge}>🛡 {block}</span>}
          {status.attackBuff > 0 && (
            <span className={styles.badge}>ATK+{status.attackBuff}</span>
          )}
          {burn && (
            <span className={[styles.badge, styles.badgeBurn].join(" ")}>
              BURN {burn.turns}t
            </span>
          )}
          {status.exhausted && (
            <span className={[styles.badge, styles.badgeWarn].join(" ")}>EXHAUSTED</span>
          )}
          {status.speedBonus > 0 && (
            <span className={styles.badge}>SPD-{status.speedBonus}</span>
          )}
          {status.speedBonusNext > 0 && (
            <span className={styles.badge}>SPD-{status.speedBonusNext} next</span>
          )}
        </div>
      )}
    </div>
  );
}
