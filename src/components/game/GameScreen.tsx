import type { GameState, Action } from "@/game/engine/types";
import styles from "./GameScreen.module.css";
import ArenaHeader from "./ArenaHeader";
import PlayerBar from "./PlayerBar";
import Hand from "./Hand";
import ActionLog from "./ActionLog";
import EndTurnButton from "./EndTurnButton";

export default function GameScreen({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const isGameOver = state.phase === "GAME_OVER";
  
  const isSetup = state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
  const canAct = isSetup && !state.P1.ready && state.phase !== "GAME_OVER";

  const hasSelection = !!state.selected;
  const readyLabel = hasSelection ? "Select" : "Pass";


  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Snap Duel (MVP)</h1>
            <div className={styles.sub}>
              Turn <b>{state.turn}</b> · Phase <b>{state.phase}</b>
            </div>
            <div
              className={`${styles.initiative} ${
                state.initiative === "P1"
                  ? styles.initiativeP1
                  : styles.initiativeAI
              }`}
            >
              Initiative: {state.initiative}
            </div>            
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.arena}>
            <ArenaHeader ai={state.AI} />
          </section>

          <section className={styles.center}>
            <ActionLog log={state.log} />
          </section>

          <section className={styles.player}>
            <PlayerBar me={state.P1} />

            <div className={styles.controls}>
              <EndTurnButton
                label={readyLabel}               // EndTurnButton이 label prop 받게 하거나
                disabled={!canAct}
                onClick={() => dispatch({ type: "PLAYER/READY", player: "P1" })}
              />
            </div>

            <Hand
              me={state.P1}
              selected={state.selected}
              disabled={isGameOver || !isSetup || state.P1.ready}
              onSelectCard={(cardId, handIndex) =>
                dispatch({ type: "CARD/SELECT", cardId, handIndex })
              }
            />
          </section>
        </main>
      </div>
    </div>
  );
}