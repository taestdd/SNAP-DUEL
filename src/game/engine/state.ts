import type { Combatant, GameState, Status } from "./types";
import { shuffle } from "./rng";
import { draw } from "./rules";

const emptyStatus = (): Status => ({
  attackBuff: 0,
  burn: null,
  speedBonus: 0,
  speedBonusNext: 0,
});

const STARTER_DECK: string[] = [
  // 1 cost
  "quick_strike", "quick_strike", "quick_strike",
  "minor_guard", "minor_guard", "minor_guard",
  "peek", "peek", "peek",

  // 2 cost
  "heavy_slash", "heavy_slash", "heavy_slash",
  "piercing_strike", "piercing_strike", "piercing_strike",

  // 3 cost
  "power_strike", "power_strike", "power_strike",
  "crushing_blow", "crushing_blow", "crushing_blow",

  // 4 cost
  "execution_blade", "execution_blade", "execution_blade",
  "arcane_burst", "arcane_burst", "arcane_burst",
  "meteor_strike", "meteor_strike", "meteor_strike",
];

function createCombatant(id: "P1" | "AI"): Combatant {
  return {
    id,
    hp: 25,
    block: 0,
    status: emptyStatus(),

    deck: [...STARTER_DECK],
    hand: [],
    discard: [],

    queue: [],
    ready: false,
  };
}

export function createInitialState(): GameState {
  let state: GameState = {
    turn: 0,
    phase: "TURN_START",
    winner: null,

    initiative: "P1",

    P1: createCombatant("P1"),
    AI: createCombatant("AI"),

    selected: null,
    log: [],
  };


}