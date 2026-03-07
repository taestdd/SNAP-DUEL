export type PlayerId = "P1" | "AI";

/**
 * 카드 효과 타입
 */
export type EffectType =
  | "damage"
  | "block"
  | "draw"
  | "heal"
  | "buff_attack"
  | "burn";

export type Target = "self" | "enemy";

export type Card = {
  id: string;
  name: string;

  //코스트 = 덱에서 소모할 카드 수
  cost: number;

  //스피드 =  이상 정수, 0이 가장 빠름
  speed: number;
  gain: number;

  effect: EffectType;
  value: number;
  target: Target;
  text: string;
};

export type SelectedCard = { cardId: string; handIndex: number };

export type Status = {
  attackBuff: number;
  burn: { turns: number; dmgPerTurn: number } | null;
  speedBonus: number;
  speedBonusNext: number;

};

export type Combatant = {
  id: PlayerId;
  hp: number;
  block: number;
  status: Status;

  deck: string[];
  hand: string[];
  discard: string[];

  queue: string[];
  ready: boolean;
};

export type TurnPhase =
  | "TURN_START"
  | "SETUP_INIT"
  | "SETUP_OTHER"
  | "RESOLVE"
  | "TURN_END"
  | "GAME_OVER";

export type GameState = {
  turn: number;
  phase: TurnPhase;
  winner: PlayerId | "DRAW" | null;

  initiative: PlayerId; // ✅ 주도권

  P1: Combatant;
  AI: Combatant;

  selected: SelectedCard | null;
  log: string[];
};

export type Action =
  | { type: "GAME/START" }
  | { type: "TURN/BEGIN" }
  | { type: "CARD/SELECT"; cardId: string; handIndex: number }
  | { type: "PLAYER/READY"; player: PlayerId }
  | { type: "AI/SETUP_AUTO" }
  | { type: "RESOLVE/STEP" }
  | { type: "TURN/END" }
  | { type: "DEBUG/RESET" }
  | { type: "INITIATIVE/RANDOMIZE" };