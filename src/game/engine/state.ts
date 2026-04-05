import type { Combatant, GameState, Status } from "./types";
import { shuffle } from "./rng";
import { draw } from "./rules";
import { CHARACTERS } from "./characters";


//기본 상태
const emptyStatus = (): Status => ({
  attackBuff: 0,
  burn: null,
  speedBonus: 0,
  speedBonusNext: 0,
  exhausted: false,
});

//초기 덱
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

  // 태그
  "tag_switch", "tag_switch",
];

//플레이어 셋팅
function createCombatant(id: "P1" | "AI"): Combatant {
  return {
    id,
    hp: CHARACTERS.A.maxHp,
    block: 0,

    activeCharacter: "A",
    characterHp: { A: CHARACTERS.A.maxHp, B: CHARACTERS.B.maxHp },

    status: emptyStatus(),

    deck: [...STARTER_DECK],
    hand: [],

    trash: [],
    cooldown: [],

    queue: [],
    ready: false,
  };
}

//턴 시작
export function createInitialState(): GameState {
  let state: GameState = {
    round: 1,
    turn: 0,
    phase: "TURN_START",
    winner: null,

    initiative: "P1",

    P1: createCombatant("P1"),
    AI: createCombatant("AI"),

    selected: null,
    log: [],
  };

  return state;
}