import type { CharacterId, Combatant, DeckDef, GameState, SetupConfig, Status } from "./types";
import { shuffle } from "./rng";
import { CHARACTERS } from "./characters";
import { DecksRecordSchema } from "./deckSchema";

let _decks: Record<string, DeckDef> = {};

export function initDecks(data: unknown): void {
  _decks = DecksRecordSchema.parse(data);
}

export function getDeckRegistry(): Record<string, DeckDef> {
  return _decks;
}

const emptyStatus = (): Status => ({
  attackBuff: 0,
  burn: null,
  speedBonus: 0,
  speedBonusNext: 0,
  exhausted: false,
});

function createCombatant(
  id: "P1" | "AI",
  characters: CharacterId[],
  deck: string[]
): Combatant {
  const activeChar = characters[0];
  return {
    id,
    hp: CHARACTERS[activeChar].maxHp,
    block: 0,

    activeCharacter: activeChar,
    characterHp: Object.fromEntries(characters.map((cid) => [cid, CHARACTERS[cid].maxHp])),
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
  const p1DeckDef = _decks[config.deckId];
  if (!p1DeckDef) throw new Error(`덱을 찾을 수 없습니다: ${config.deckId}`);
  const aiDeckId = aiConfig?.deckId ?? config.deckId;
  const aiDeckDef = _decks[aiDeckId];
  if (!aiDeckDef) throw new Error(`덱을 찾을 수 없습니다: ${aiDeckId}`);

  const state: GameState = {
    round: 1,
    turn: 0,
    phase: "ROUND_DRAFT",
    winner: null,

    initiative: Math.random() < 0.5 ? "P1" : "AI",

    P1: createCombatant("P1", config.characters, shuffle([...p1DeckDef.cards])),
    AI: createCombatant("AI", aiConfig ? aiConfig.characters : aiDeckDef.characters, shuffle([...aiDeckDef.cards])),

    selected: null,
    pendingSelection: null,
    pendingDiscard: null,
    recentlyCancelledId: null,
    recentlyCancelledPlayer: null,
    log: [],
    p1TaggedThisTurn: false,

    resolveContext: { queue: [], index: 0, unresolved: [] },
    animScript: [],
    animStartHp: null,
    draftSelections: { P1: null, AI: null },
    turnLog: [],
  };

  return state;
}
