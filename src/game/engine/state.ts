import type { CharacterId, Combatant, DeckDef, GameState, SetupConfig, Status } from "./types";
import { shuffleSeeded, nextRandom, makeSeed } from "./rng";
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

export function createInitialState(config: SetupConfig, aiConfig?: SetupConfig, seed?: number): GameState {
  const p1DeckDef = _decks[config.deckId];
  if (!p1DeckDef) throw new Error(`덱을 찾을 수 없습니다: ${config.deckId}`);
  const aiDeckId = aiConfig?.deckId ?? config.deckId;
  const aiDeckDef = _decks[aiDeckId];
  if (!aiDeckDef) throw new Error(`덱을 찾을 수 없습니다: ${aiDeckId}`);

  // 시드 기반 결정론: 초기 덱 셔플·initiative를 같은 rng 시퀀스로 도출
  const initialSeed = seed ?? makeSeed();
  const [p1Deck, rng1] = shuffleSeeded([...p1DeckDef.cards], initialSeed);
  const [aiDeck, rng2] = shuffleSeeded([...aiDeckDef.cards], rng1);
  const [initRoll, rng] = nextRandom(rng2);

  const state: GameState = {
    round: 1,
    turn: 0,
    phase: "ROUND_DRAFT",
    seed: initialSeed,
    rng,
    winner: null,

    initiative: initRoll < 0.5 ? "P1" : "AI",

    P1: createCombatant("P1", config.characters, p1Deck),
    AI: createCombatant("AI", aiConfig ? aiConfig.characters : aiDeckDef.characters, aiDeck),

    selected: null,
    pendingCostPayment: null,
    pendingSelection: null,
    pendingDiscard: null,
    recentlyCancelledId: null,
    recentlyCancelledPlayer: null,
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
  };

  return state;
}
