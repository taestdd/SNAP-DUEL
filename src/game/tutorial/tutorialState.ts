import type { Combatant, GameState, Status } from "../engine/types";
import type { TutorialStage } from "./tutorialStages";
import { registerCards } from "../engine/cards";
import { TUTORIAL_CARDS } from "./tutorialCards";
import { TUT_CHARS, registerTutorialChars } from "./tutorialChars";

export const TUT_CHAR_ID = TUT_CHARS.trainee.id;

function registerTutorialAssets(traineeMaxHp: number): void {
  registerCards(TUTORIAL_CARDS);
  registerTutorialChars(traineeMaxHp);
}

function emptyStatus(): Status {
  return {
    attackBuff: 0,
    delayAdvantage: 0,
    delayAdvantageNext: 0,
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
    // 튜토리얼은 항상 동일하게 진행되도록 고정 시드 사용
    seed: 1,
    rng: 1,
    winner: null,
    initiative: initialState.initiative,
    P1: makeCombatant("P1", initialState.p1Hp, initialState.p1Hand, initialState.p1Deck, initialState.p1ActiveCharId, initialState.p1BenchChar),
    AI: makeCombatant("AI", initialState.aiHp, initialState.aiHand, initialState.aiDeck, initialState.aiActiveCharId, initialState.aiBenchChar),
    selected: null,
    pendingCostPayment: null,
    pendingSelection: null,
    pendingDiscard: null,
    recentlyCounteredId: null,
    recentlyCounteredPlayer: null,
    log: [],
    p1TaggedThisTurn: false,
    aiTaggedThisTurn: false,
    resolveContext: { queue: [], index: 0, unresolved: [] },
    animScript: [],
    animStartHp: null,
    animStartCombo: null,
    comboCount: 0,
    draftSelections: { P1: null, AI: null },
    turnLog: [],
    // aiScript가 있으면 스크립트 AI, 없으면 실제 대전 AI 룰을 사용
    ...(aiScript ? { tutorialAiScript: aiScript } : {}),
  };
}
