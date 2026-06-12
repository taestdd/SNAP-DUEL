import type { Combatant, GameState, Status } from "../engine/types";
import type { TutorialStage } from "./tutorialStages";
import { registerCharacter } from "../engine/characters";
import { registerCards } from "../engine/cards";
import { TUTORIAL_CARDS } from "./tutorialCards";

export const TUT_CHAR_ID = "tut_char";

function registerTutorialAssets(maxHp: number): void {
  registerCards(TUTORIAL_CARDS);
  registerCharacter(TUT_CHAR_ID, {
    id: TUT_CHAR_ID,
    name: "훈련병",
    maxHp,
    spriteId: "default",
    entryEffect: null,
    exitEffect: null,
    affinities: [],
  });
}

function emptyStatus(): Status {
  return {
    attackBuff: 0,
    burn: null,
    speedBonus: 0,
    speedBonusNext: 0,
    exhausted: false,
  };
}

function makeCombatant(
  id: "P1" | "AI",
  hp: number,
  hand: string[],
  deck: string[],
): Combatant {
  return {
    id,
    hp,
    block: 0,
    activeCharacter: TUT_CHAR_ID,
    characterHp: { [TUT_CHAR_ID]: hp },
    airborneStack: 0,
    status: emptyStatus(),
    deck: [...deck],
    hand: [...hand],
    trash: [],
    cooldown: [],
    queue: [],
    ready: false,
  };
}

export function createTutorialState(stage: TutorialStage): GameState {
  const maxHp = Math.max(stage.initialState.p1Hp, stage.initialState.aiHp);
  registerTutorialAssets(maxHp);
  const { initialState, aiScript } = stage;

  return {
    round: 3,
    turn: 0,
    phase: "TURN_START",
    winner: null,
    initiative: initialState.initiative,
    P1: makeCombatant("P1", initialState.p1Hp, initialState.p1Hand, initialState.p1Deck),
    AI: makeCombatant("AI", initialState.aiHp, initialState.aiHand, initialState.aiDeck),
    selected: null,
    pendingCostPayment: null,
    pendingSelection: null,
    pendingDiscard: null,
    recentlyCancelledId: null,
    recentlyCancelledPlayer: null,
    log: [],
    p1TaggedThisTurn: false,
    resolveContext: { queue: [], index: 0, unresolved: [] },
    animScript: [],
    animStartHp: null,
    animStartCombo: null,
    comboCount: 0,
    draftSelections: { P1: null, AI: null },
    turnLog: [],
    tutorialAiScript: aiScript,
  };
}
