import { getCard } from "@/game/engine/cards";
import { effectBadgeClass, effectLabel } from "./CardView";
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
  speed: "Speed",
  ground_attack: "⬇ Atk",
  anti_air_attack: "⬆ Atk",
  gain: "Gain",
};

function modifierText(mod: StatModifier): string {
  const { condition, stat, delta } = mod;
  const who = condition.target === "enemy" ? "Enemy " : "";
  const check = CHECK_LABEL[condition.check] ?? condition.check;
  const sign = delta >= 0 ? `+${delta}` : `${delta}`;
  return `${who}${check} ${condition.op} ${condition.value} → ${STAT_LABEL[stat] ?? stat} ${sign}`;
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
            <span className={styles.metaLabel}>Speed</span>
            <span className={styles.metaValue}>
              {card.speed}
              {activeMods?.speed ? (
                <span className={activeMods.speed < 0 ? styles.modActive : styles.modMalus}>
                  {activeMods.speed > 0 ? `+${activeMods.speed}` : activeMods.speed}
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
                <span className={styles.metaLabel}>Gain</span>
                <span className={styles.metaValue}>
                  {card.gain}
                  {activeMods?.gain ? (
                    <span className={activeMods.gain > 0 ? styles.modActive : styles.modMalus}>
                      {activeMods.gain > 0 ? `+${activeMods.gain}` : activeMods.gain}
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
              <span
                className={[styles.effBadge, effectBadgeClass(eff.type, eff.damageType)].join(" ")}
              >
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
