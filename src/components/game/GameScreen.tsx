"use client";

import { useEffect, useRef, useState } from "react";
import type { Action, Combatant, GameState } from "@/game/engine/types";
import { getCard } from "@/game/engine/cards";
import styles from "./GameScreen.module.css";
import ArenaHeader from "./ArenaHeader";
import PlayerBar from "./PlayerBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";

function effectLabel(effect: string) {
  switch (effect) {
    case "damage":
      return "Damage";
    case "block":
      return "Block";
    case "draw":
      return "Draw";
    case "heal":
      return "Heal";
    case "buff_attack":
      return "ATK Buff";
    case "burn":
      return "Burn";
    default:
      return effect;
  }
}

function QueuePreview({
  title,
  me,
}: {
  title: string;
  me: Combatant;
}) {
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
              {effectLabel(effect.type)}
              {effect.value !== undefined ? ` ${effect.value}` : ""}
              {effect.target ? ` · ${effect.target}` : ""}
            </span>
          ))}
        </div>

          <div className={styles.queueText}>{card.text}</div>
        </div>
      )}
    </div>
  );
}

function CardListPopover({
  title,
  ids,
  onClose,
}: {
  title: string;
  ids: string[];
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (!popRef.current) return;
      if (popRef.current.contains(e.target as Node)) return;
      onClose();
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div className={styles.popover} ref={popRef}>
      <div className={styles.popoverHeader}>
        <div className={styles.popoverTitle}>
          {title} <span className={styles.popoverCount}>({ids.length})</span>
        </div>

        <button className={styles.popoverClose} onClick={onClose} type="button">
          ✕
        </button>
      </div>

      {ids.length === 0 ? (
        <div className={styles.popoverEmpty}>No cards</div>
      ) : (
        <div className={styles.popoverList}>
          {ids.map((id, idx) => {
            const card = getCard(id);

            if (!card) {
              return (
                <div key={`${id}-${idx}`} className={styles.popoverItem}>
                  <div className={styles.popoverItemName}>{id}</div>
                </div>
              );
            }

            return (
              <div key={`${id}-${idx}`} className={styles.popoverItem}>
                <div className={styles.popoverItemTop}>
                  <div className={styles.popoverItemName}>{card.name}</div>
                  <div className={styles.popoverItemMeta}>
                    C{card.cost} · S{card.speed} · G{card.gain}
                  </div>
                </div>

                <div className={styles.popoverItemBottom}>
                  <div className={styles.effectList}>
                    {card.effects.map((effect, effectIdx) => (
                      <span
                        key={`${card.id}-popover-effect-${effectIdx}`}
                        className={styles.effectBadge}
                      >
                        {effectLabel(effect.type)}
                        {effect.value !== undefined ? ` ${effect.value}` : ""}
                        {effect.target ? ` · ${effect.target}` : ""}
                      </span>
                    ))}
                  </div>

                  <span className={styles.popoverItemText}>{card.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ZoneStat({
  label,
  count,
  tone = "default",
  popoverTitle,
  popoverIds,
  activeKey,
  statKey,
  onToggle,
}: {
  label: string;
  count: number;
  tone?: "default" | "accent" | "danger";
  popoverTitle?: string;
  popoverIds?: string[];
  activeKey: string | null;
  statKey: string;
  onToggle: (key: string | null) => void;
}) {
  const toneClass =
    tone === "accent"
      ? styles.zoneAccent
      : tone === "danger"
      ? styles.zoneDanger
      : styles.zoneDefault;

  const isOpen = activeKey === statKey;
  const clickable = !!popoverTitle && !!popoverIds;

  return (
    <div className={styles.zoneWrap}>
      <button
        type="button"
        className={`${styles.zoneCard} ${toneClass} ${
          clickable ? styles.zoneButton : ""
        }`}
        onClick={() => {
          if (!clickable) return;
          onToggle(isOpen ? null : statKey);
        }}
      >
        <div className={styles.zoneLabel}>{label}</div>
        <div className={styles.zoneCount}>{count}</div>
      </button>

      {isOpen && popoverTitle && popoverIds ? (
        <CardListPopover
          title={popoverTitle}
          ids={popoverIds}
          onClose={() => onToggle(null)}
        />
      ) : null}
    </div>
  );
}

function GraveyardSection({
  ownerLabel,
  me,
  activeKey,
  onToggle,
}: {
  ownerLabel: string;
  me: Combatant;
  activeKey: string | null;
  onToggle: (key: string | null) => void;
}) {
  return (
    <div className={styles.graveyardSection}>
      <div className={styles.graveyardTitle}>{ownerLabel} Zones</div>

      <div className={styles.zoneGrid}>
        <ZoneStat
          label={`${ownerLabel} Deck`}
          count={me.deck.length}
          activeKey={activeKey}
          statKey={`${ownerLabel}-deck`}
          onToggle={onToggle}
        />

        <ZoneStat
          label={`${ownerLabel} Cooldown`}
          count={me.cooldown.length}
          tone="accent"
          popoverTitle={`${ownerLabel} Cooldown`}
          popoverIds={me.cooldown}
          activeKey={activeKey}
          statKey={`${ownerLabel}-cooldown`}
          onToggle={onToggle}
        />

        <ZoneStat
          label={`${ownerLabel} Trash`}
          count={me.trash.length}
          tone="danger"
          popoverTitle={`${ownerLabel} Trash`}
          popoverIds={me.trash}
          activeKey={activeKey}
          statKey={`${ownerLabel}-trash`}
          onToggle={onToggle}
        />
      </div>
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
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  const isGameOver = state.phase === "GAME_OVER";
  const isSetup = state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
  const canAct = isSetup && !state.P1.ready && !isGameOver;
  const hasSelection = !!state.selected;
  const readyLabel = hasSelection ? "Ready" : "Pass";

  useEffect(() => {
    setOpenPopover(null);
  }, [state.turn, state.phase]);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Snap Duel (MVP)</h1>
            <div className={styles.sub}>
              Round {state.round}/3 · Turn {state.turn} · Phase {state.phase} · Initiative{" "}
              {state.initiative}
            </div>
          </div>

          <div className={styles.headerRight}>
            {isGameOver ? (
              <div className={styles.gameOver}>
                Winner: {state.winner === "DRAW" ? "DRAW" : state.winner}
              </div>
            ) : null}
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.arena}>
            <ArenaHeader ai={state.AI} />
          </section>

          <section className={styles.center}>
            <div className={styles.centerTop}>
              <QueuePreview title="AI Queue" me={state.AI} />
              <QueuePreview title="P1 Queue" me={state.P1} />
            </div>

            <GraveyardSection
              ownerLabel="AI"
              me={state.AI}
              activeKey={openPopover}
              onToggle={setOpenPopover}
            />

            <GraveyardSection
              ownerLabel="P1"
              me={state.P1}
              activeKey={openPopover}
              onToggle={setOpenPopover}
            />

            <ActionLog log={state.log} />
          </section>

          <section className={styles.player}>
            <PlayerBar me={state.P1} />

            <Hand
              me={state.P1}
              selected={state.selected}
              disabled={!canAct}
              onSelectCard={(cardId, handIndex) =>
                dispatch({ type: "CARD/SELECT", cardId, handIndex })
              }
            />

            <div className={styles.controls}>
              <EndTurnButton
                label={readyLabel}
                disabled={!isSetup || state.P1.ready || isGameOver}
                onClick={() =>
                  dispatch({ type: "PLAYER/READY", player: "P1" })
                }
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}