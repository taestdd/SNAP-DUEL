import type { Combatant, GameState, Status } from "../engine/types";
import type { TutorialStage } from "./tutorialStages";
import { registerCharacter } from "../engine/characters";
import { registerCards } from "../engine/cards";
import { TUTORIAL_CARDS } from "./tutorialCards";

export const TUT_CHAR_ID = "tut_char";

function registerTutorialAssets(tutCharMaxHp: number): void {
  registerCards(TUTORIAL_CARDS);
  registerCharacter(TUT_CHAR_ID, {
    id: TUT_CHAR_ID,
    name: "훈련병",
    maxHp: tutCharMaxHp,
    spriteId: "default",
    entryEffect: null,
    exitEffect: null,
    affinities: [],
  });
  registerCharacter("tut_char_warrior", {
    id: "tut_char_warrior",
    name: "전사",
    maxHp: 1,
    spriteId: "default",
    entryEffect: null,
    exitEffect: null,
    affinities: ["power"],
  });
  registerCharacter("tut_char_fighter", {
    id: "tut_char_fighter",
    name: "격투가",
    maxHp: 8,
    spriteId: "default",
    entryEffect: null,
    exitEffect: null,
    affinities: [],
  });
  registerCharacter("tut_team_a", {
    id: "tut_team_a",
    name: "팀원 A",
    maxHp: 15,
    spriteId: "default",
    entryEffect: null,
    exitEffect: null,
    affinities: [],
  });
  registerCharacter("tut_team_b", {
    id: "tut_team_b",
    name: "팀원 B",
    maxHp: 15,
    spriteId: "default",
    entryEffect: null,
    exitEffect: null,
    affinities: [],
  });
}

function emptyStatus(): Status {
  return {
    attackBuff: 0,
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
  activeCharId = TUT_CHAR_ID,
  benchChar?: { id: string; hp: number },
): Combatant {
  const characterHp: Record<string, number> = { [activeCharId]: hp };
  if (benchChar) characterHp[benchChar.id] = benchChar.hp;
  return {
    id,
    hp,
    block: 0,
    activeCharacter: activeCharId,
    characterHp,
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
    round: initialState.startingRound ?? 3,
    turn: 0,
    phase: initialState.startingPhase ?? "TURN_START",
    winner: null,
    initiative: initialState.initiative,
    P1: makeCombatant("P1", initialState.p1Hp, initialState.p1Hand, initialState.p1Deck, initialState.p1ActiveCharId, initialState.p1BenchChar),
    AI: makeCombatant("AI", initialState.aiHp, initialState.aiHand, initialState.aiDeck, initialState.aiActiveCharId, initialState.aiBenchChar),
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
