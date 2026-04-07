"use client";

import type { Action, Combatant, GameState } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./GameScreen.module.css";
import ArenaHeader from "./ArenaHeader";
import PlayerBar from "./PlayerBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";
import CardSelectionModal from "./CardSelectionModal";

function effectLabel(effect: string, damageType?: string) {
  if (effect === "damage" && damageType === "ground") return "⬇ Ground";
  if (effect === "damage" && damageType === "anti-air") return "⬆ Anti-Air";
  switch (effect) {
    case "damage":      return "Damage";
    case "block":       return "Block";
    case "draw":        return "Draw";
    case "heal":        return "Heal";
    case "buff_attack": return "ATK Buff";
    case "burn":        return "Burn";
    case "tag":         return "⇄ Tag";
    case "airborne":    return "⬆ Launch";
    default:            return effect;
  }
}

function QueuePreview({ title, me }: { title: string; me: Combatant }) {
  const queuedId = me.queue[0];
  const card = queuedId ? getCard(queuedId) : null;

  return (
    <div className={styles.queueBox}>
      <div className={styles.queueTitle}>{title}</div>

      {!card ? (
        <div className={styles.queueEmpty}>—</div>
      ) : (
        <div className={styles.queueCard}>
          <div className={styles.queueCardName}>{card.name}</div>

          <div className={styles.queueStats}>
            <span>Cost {card.cost}</span>
            <span>Speed {card.speed}</span>
            <span>Gain {card.gain}</span>
          </div>

          <div className={styles.queueEffectRow}>
            {card.effects.map((effect, idx) => (
              <span key={`${card.id}-effect-${idx}`} className={styles.effectBadge}>
                {effectLabel(effect.type, effect.damageType)}
                {effect.value !== undefined ? ` ${effect.value}` : ""}
              </span>
            ))}
          </div>

          <div className={styles.queueText}>{card.text}</div>
        </div>
      )}
    </div>
  );
}

export default function GameScreen({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const isGameOver = state.phase === "GAME_OVER";
  const isSetup = state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
  const canAct = isSetup && !state.P1.ready && !isGameOver;
  const hasSelection = !!state.selected;
  const readyLabel = hasSelection ? "Ready" : "Pass";

  return (
    <div className={styles.page}>
      {state.phase === "WAITING_SELECTION" && state.pendingSelection && (
        <CardSelectionModal
          pendingSelection={state.pendingSelection}
          onConfirm={(selectedCards) =>
            dispatch({ type: "SELECTION/CONFIRM", selectedCards })
          }
          onSkip={() => dispatch({ type: "SELECTION/SKIP" })}
        />
      )}

      <div className={styles.shell}>
        {/* Top row: Player | Game Title | AI */}
        <div className={styles.topRow}>
          <div className={styles.topPanel}>
            <PlayerBar me={state.P1} />
          </div>

          <div className={styles.topCenter}>
            <h1 className={styles.title}>Snap Duel (MVP)</h1>
            <div className={styles.sub}>
              Round {state.round}/3 · Turn {state.turn} · Phase {state.phase} · Initiative{" "}
              {state.initiative}
            </div>
            {isGameOver && (
              <div className={styles.gameOver}>
                Winner: {state.winner === "DRAW" ? "DRAW" : state.winner}
              </div>
            )}
          </div>

          <div className={styles.topPanel}>
            <ArenaHeader ai={state.AI} />
          </div>
        </div>

        {/* Middle row: P1 Queue | Action Log | AI Queue */}
        <div className={styles.middleRow}>
          <div className={styles.queuePanel}>
            <QueuePreview title="P1 Queue" me={state.P1} />
          </div>

          <div className={styles.actionLogPanel}>
            <ActionLog log={state.log} />
          </div>

          <div className={styles.queuePanel}>
            <QueuePreview title="AI Queue" me={state.AI} />
          </div>
        </div>

        {/* Bottom: Hand section */}
        <Hand
          me={state.P1}
          selected={state.selected}
          disabled={!canAct}
          onSelectCard={(cardId, handIndex) =>
            dispatch({ type: "CARD/SELECT", cardId, handIndex })
          }
          endTurnButton={
            <EndTurnButton
              label={readyLabel}
              disabled={!isSetup || state.P1.ready || isGameOver}
              onClick={() => dispatch({ type: "PLAYER/READY", player: "P1" })}
            />
          }
        />
      </div>
    </div>
  );
}
