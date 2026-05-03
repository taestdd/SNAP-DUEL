import type { CharacterId, Combatant, GameState, SetupConfig, Status } from "./types";
import { shuffle } from "./rng";
import { CHARACTERS } from "./characters";


//기본 상태
const emptyStatus = (): Status => ({
  attackBuff: 0,
  burn: null,
  speedBonus: 0,
  speedBonusNext: 0,
  exhausted: false,
});

const PROTOTYPE_DECK: string[] = [
  "weak_punch", "weak_punch", "weak_punch",
  "strong_punch", "strong_punch", "strong_punch",
  "weak_kick", "weak_kick", "weak_kick",
  "strong_kick", "strong_kick", "strong_kick",
  "dragon_kick", "dragon_kick",
  "rising_punch", "rising_punch",
  "hadouken", "hadouken",

  "item_a", "item_a",
  "item_b", "item_b",
  "item_c", "item_c",
];

/** 덱 레지스트리 — 키를 추가하면 SetupScreen에 자동 반영 */
export const DECK_REGISTRY: Record<string, { name: string; cards: string[] }> = {
  PROTOTYPE: { name: "Prototype Deck", cards: PROTOTYPE_DECK },
};

//플레이어 셋팅
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
  const p1Deck = DECK_REGISTRY[config.deckId]?.cards ?? PROTOTYPE_DECK;
  const aiDeck = aiConfig ? (DECK_REGISTRY[aiConfig.deckId]?.cards ?? PROTOTYPE_DECK) : PROTOTYPE_DECK;
  const aiChar = aiConfig ? aiConfig.characters[0] : "A";

  const state: GameState = {
    round: 1,
    turn: 0,
    phase: "ROUND_DRAFT",
    winner: null,

    initiative: Math.random() < 0.5 ? "P1" : "AI",

    P1: createCombatant("P1", config.characters[0], shuffle([...p1Deck])),
    AI: createCombatant("AI", aiChar, shuffle([...aiDeck])),

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
    draftSelections: { P1: null, AI: null },
  };

  return state;
}
