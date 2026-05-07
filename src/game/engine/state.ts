import type { CharacterId, Combatant, DeckDef, GameState, SetupConfig, Status } from "./types";
import { shuffle } from "./rng";
import { CHARACTERS } from "./characters";
import { DecksRecordSchema } from "./deckSchema";
import decksData from "@/data/decks.json";

export const DECK_REGISTRY: Record<string, DeckDef> = DecksRecordSchema.parse(decksData);

const FALLBACK_DECK = DECK_REGISTRY["PROTOTYPE"];

const emptyStatus = (): Status => ({
  attackBuff: 0,
  burn: null,
  speedBonus: 0,
  speedBonusNext: 0,
  exhausted: false,
});

function createCombatant(
  id: "P1" | "AI",
  activeChar: CharacterId,
  deck: string[]
): Combatant {
  return {
    id,
    hp: CHARACTERS[activeChar].maxHp,
    block: 0,

    activeCharacter: activeChar,
    characterHp: { A: CHARACTERS.A.maxHp, B: CHARACTERS.B.maxHp },
    airborneStack: 0,

    status: emptyStatus(),

    deck: [...deck],
    hand: [],

    trash: [],
    cooldown: [],

    queue: [],
    ready: false,
  };
}

export function createInitialState(config: SetupConfig, aiConfig?: SetupConfig): GameState {
  const p1DeckDef = DECK_REGISTRY[config.deckId] ?? FALLBACK_DECK;
  const aiDeckDef = aiConfig ? (DECK_REGISTRY[aiConfig.deckId] ?? FALLBACK_DECK) : FALLBACK_DECK;
  const aiChar = aiConfig ? aiConfig.characters[0] : FALLBACK_DECK.characters[0];

  const state: GameState = {
    round: 1,
    turn: 0,
    phase: "ROUND_DRAFT",
    winner: null,

    initiative: Math.random() < 0.5 ? "P1" : "AI",

    P1: createCombatant("P1", config.characters[0], shuffle([...p1DeckDef.cards])),
    AI: createCombatant("AI", aiChar, shuffle([...aiDeckDef.cards])),

    selected: null,
    pendingSelection: null,
    pendingDiscard: null,
    recentlyCancelledId: null,
    recentlyCancelledPlayer: null,
    log: [],
    p1TaggedThisTurn: false,

    resolveQueue: [],
    resolveIndex: 0,
    resolveUnresolved: [],
    animScript: [],
    draftSelections: { P1: null, AI: null },
    turnLog: [],
  };

  return state;
}
