import type { CharacterId, Combatant, GameState, SetupConfig, Status } from "./types";
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

// 모든 카드 타입을 골고루 포함하는 테스트 덱
// ground damage / anti-air damage / block / draw / heal / airborne / tag / useCondition 전부 포함
const DEBUG_DECK: string[] = [
  // ground damage (저~고 코스트)
  "quick_strike",
  "heavy_slash",
  "power_strike",
  "crushing_blow",
  "meteor_strike",

  // block + draw
  "minor_guard",
  "minor_guard",
  "peek",
  "peek",

  // heal + damage 복합
  "life_drain",
  "life_drain",

  // 에어본 유발 + 대공 콤보
  "launcher",
  "launcher",
  "anti_air_strike",
  "anti_air_strike",
  "aerial_combo",  // useCondition: airborne

  // 태그
  "tag_switch",
  "tag_switch",
];

/** 덱 레지스트리 — 키를 추가하면 SetupScreen에 자동 반영 */
export const DECK_REGISTRY: Record<string, { name: string; cards: string[] }> = {
  STARTER: { name: "Starter Deck", cards: STARTER_DECK },
  DEBUG: { name: "Debug Deck", cards: DEBUG_DECK },
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

//턴 시작
export function createInitialState(config: SetupConfig): GameState {
  const p1Deck = DECK_REGISTRY[config.deckId]?.cards ?? STARTER_DECK;

  const state: GameState = {
    round: 1,
    turn: 0,
    phase: "TURN_START",
    winner: null,

    initiative: "P1",

    P1: createCombatant("P1", config.characters[0], p1Deck),
    AI: createCombatant("AI", "A", STARTER_DECK),

    selected: null,
    pendingSelection: null,
    log: [],
  };

  return state;
}
