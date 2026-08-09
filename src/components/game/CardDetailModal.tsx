import { useState } from "react";
import { getCard } from "@/game/engine/cards";
import { effectLabel, cardArtSrc } from "./CardView";
import styles from "./CardDetailModal.module.css";
import type { GameState, PlayerId, StatModifier } from "@/game/engine/types";
import { evaluateModifiers } from "@/game/engine/stateHelpers";

const CHECK_LABEL: Record<string, string> = {
  hand_count: "Hand",
  deck_count: "Deck",
  cooldown_count: "Cooldown",
  hp: "HP",
  bench_hp: "Bench HP",
  airborne_stack: "Airborne",
  turn: "Turn",
  round: "Round",
};

const STAT_LABEL: Record<string, string> = {
  cost: "Cost",
  delay: "Delay",
  ground_attack: "⬇ Atk",
  anti_air_attack: "⬆ Atk",
  advantage: "Advantage",
};

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function modifierText(mod: StatModifier): string {
  const statLabel = STAT_LABEL[mod.stat] ?? mod.stat;

  if (mod.mode === "scaling") {
    const who = mod.source.target === "enemy" ? "Enemy " : "";
    const check = CHECK_LABEL[mod.source.check] ?? mod.source.check;
    // "per 2 Hand" 처럼 몇 단위당인지 드러낸다 (divisor 1이면 생략)
    const per = mod.divisor && mod.divisor > 1 ? `per ${mod.divisor} ${who}${check}` : `per ${who}${check}`;
    const over = mod.baseline ? ` over ${mod.baseline}` : "";
    const cap = mod.max !== undefined ? ` (max ${signed(mod.max)})` : "";
    return `${per}${over} → ${statLabel} ${signed(mod.perUnit)}${cap}`;
  }

  const { condition } = mod;
  const who = condition.target === "enemy" ? "Enemy " : "";
  const check = CHECK_LABEL[condition.check] ?? condition.check;
  return `${who}${check} ${condition.op} ${condition.value} → ${statLabel} ${signed(mod.delta)}`;
}

export default function CardDetailModal({
  cardId,
  onClose,
  gameState,
  playerId,
}: {
  cardId: string;
  onClose: () => void;
  gameState?: GameState;
  playerId?: PlayerId;
}) {
  const [artError, setArtError] = useState(false);
  const card = getCard(cardId);
  if (!card) return null;

  const activeMods = gameState && playerId && card.statModifiers
    ? evaluateModifiers(gameState, playerId, card.statModifiers)
    : null;

  return (
    <div className={styles.overlay} onPointerDown={onClose}>
      <div
        className={styles.panel}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 헤더: 이름 + 닫기 */}
        <div className={styles.header}>
          <span className={styles.headerName}>{card.name}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 일러스트 — 카드 ID 기반 경로. 파일이 없으면 숨김 */}
        {!artError && (
          <div className={styles.artWrap}>
            <img
              src={cardArtSrc(card.id)}
              alt=""
              className={styles.artImg}
              onError={() => setArtError(true)}
            />
          </div>
        )}

        {/* 메타 행: 코스트 · 속도 · 공격 스탯 */}
        <div className={styles.metaRow}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Cost</span>
            <span className={styles.metaValue}>
              {card.cost}
              {activeMods?.cost ? (
                <span className={activeMods.cost < 0 ? styles.modActive : styles.modMalus}>
                  {activeMods.cost > 0 ? `+${activeMods.cost}` : activeMods.cost}
                </span>
              ) : null}
            </span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Delay</span>
            <span className={styles.metaValue}>
              {card.delay}
              {activeMods?.delay ? (
                <span className={activeMods.delay < 0 ? styles.modActive : styles.modMalus}>
                  {activeMods.delay > 0 ? `+${activeMods.delay}` : activeMods.delay}
                </span>
              ) : null}
            </span>
          </div>
          {card.cardType === "attack" ? (
            <>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>⬇ Atk</span>
                <span className={styles.metaValue}>
                  {card.groundAttack ?? 0}
                  {activeMods?.ground_attack ? (
                    <span className={activeMods.ground_attack > 0 ? styles.modActive : styles.modMalus}>
                      {activeMods.ground_attack > 0 ? `+${activeMods.ground_attack}` : activeMods.ground_attack}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>⬆ Atk</span>
                <span className={styles.metaValue}>
                  {card.antiAirAttack ?? 0}
                  {activeMods?.anti_air_attack ? (
                    <span className={activeMods.anti_air_attack > 0 ? styles.modActive : styles.modMalus}>
                      {activeMods.anti_air_attack > 0 ? `+${activeMods.anti_air_attack}` : activeMods.anti_air_attack}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Advantage</span>
                <span className={styles.metaValue}>
                  {card.advantage}
                  {activeMods?.advantage ? (
                    <span className={activeMods.advantage > 0 ? styles.modActive : styles.modMalus}>
                      {activeMods.advantage > 0 ? `+${activeMods.advantage}` : activeMods.advantage}
                    </span>
                  ) : null}
                </span>
              </div>
            </>
          ) : null}
        </div>

        {/* 카드 텍스트 */}
        <p className={styles.text}>{card.text}</p>

        {/* 효과 목록 */}
        <div className={styles.effectList}>
          {card.effects.map((eff, i) => (
            <div key={i} className={styles.effectRow}>
              <span className={styles.effBadge}>
                {effectLabel(eff.type, eff.damageType)}
              </span>
              {eff.value !== undefined && (
                <span className={styles.effValue}>{eff.value}</span>
              )}
              {eff.target && (
                <span className={styles.effTarget}>{eff.target}</span>
              )}
            </div>
          ))}
        </div>

        {/* StatModifier 목록 */}
        {card.statModifiers && card.statModifiers.length > 0 && (
          <div className={styles.modifierList}>
            {card.statModifiers.map((mod, i) => {
              const active = activeMods !== null;
              const stat = mod.stat as keyof typeof activeMods;
              const isActive = active && activeMods && (activeMods[stat] ?? 0) !== 0;
              return (
                <div
                  key={i}
                  className={[
                    styles.modifierRow,
                    isActive ? styles.modifierActive : styles.modifierInactive,
                  ].join(" ")}
                >
                  {modifierText(mod)}
                </div>
              );
            })}
          </div>
        )}

        {/* 태그 */}
        {card.tags && card.tags.length > 0 && (
          <div className={styles.tagRow}>
            {card.tags.map((t) => (
              <span key={t} className={styles.tagBadge}>{t}</span>
            ))}
          </div>
        )}

        {/* 사용 조건 */}
        {card.useCondition && (
          <div className={styles.condition}>
            {card.useCondition === "ground"
              ? "⬇ Ground only (not airborne)"
              : "⬆ Airborne only"}
          </div>
        )}
      </div>
    </div>
  );
}
