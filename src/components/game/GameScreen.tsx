import type { Action, Combatant, GameState } from "@/game/engine/types";
import styles from "./GameScreen.module.css";
import ArenaHeader from "./ArenaHeader";
import PlayerBar from "./PlayerBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";

function ZoneStat({
  label,
  count,
  tone = "default",
}: {
  label: string;
  count: number;
  tone?: "default" | "accent" | "danger";
}) {
  const toneClass =
    tone === "accent"
      ? styles.zoneAccent
      : tone === "danger"
      ? styles.zoneDanger
      : styles.zoneDefault;

  return (
    <div className={`${styles.zoneCard} ${toneClass}`}>
      <div className={styles.zoneLabel}>{label}</div>
      <div className={styles.zoneCount}>{count}</div>
    </div>
  );
}

function QueuePreview({
  title,
  me,
}: {
  title: string;
  me: Combatant;
}) {
  const queued = me.queue[0] ?? null;

  return (
    <div className={styles.queueBox}>
      <div className={styles.queueTitle}>{title}</div>
      <div className={styles.queueValue}>{queued ?? "—"}</div>
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
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Snap Duel (MVP)</h1>
            <div className={styles.sub}>
              Turn {state.turn} · Phase {state.phase} · Initiative{" "}
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

            <div className={styles.zoneGrid}>
              <ZoneStat label="AI Deck" count={state.AI.deck.length} />
              <ZoneStat label="AI Cooldown" count={state.AI.cooldown.length} tone="accent" />
              <ZoneStat label="AI Trash" count={state.AI.trash.length} tone="danger" />

              <ZoneStat label="P1 Deck" count={state.P1.deck.length} />
              <ZoneStat label="P1 Cooldown" count={state.P1.cooldown.length} tone="accent" />
              <ZoneStat label="P1 Trash" count={state.P1.trash.length} tone="danger" />
            </div>

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