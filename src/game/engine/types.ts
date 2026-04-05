export type PlayerId = "P1" | "AI";

export type CharacterId = "A" | "B";

export type CharacterDef = {
  id: CharacterId;
  maxHp: number;
  /** 이 캐릭터로 교체될 때 발동 */
  entryEffect: CardEffect | null;
  /** 이 캐릭터에서 다른 캐릭터로 교체될 때 발동 */
  exitEffect: CardEffect | null;
};

/**
 * 카드 효과 타입
 */
export type EffectType =
  | "damage"
  | "block"
  | "draw"
  | "heal"
  | "buff_attack"
  | "burn"
  | "tag";

export type Target = "self" | "enemy";

export type CardEffect = {
  type: EffectType;
  value?: number;
  target?: Target;
};

export type Card = {
  id: string;
  name: string;

  // 코스트 = 덱에서 소모할 카드 수
  cost: number;

  // 스피드 = 이상 정수, 0이 가장 빠름
  speed: number;
  gain: number;

  effects: CardEffect[];
  text: string;
};

export type SelectedCard = {
  cardId: string;
  handIndex: number;
};

export type Status = {
  attackBuff: number;

  burn: {
    turns: number;
    dmgPerTurn: number;
  } | null;

  speedBonus: number;
  speedBonusNext: number;

  exhausted: boolean;
};

export type Combatant = {
  id: PlayerId;

  hp: number;
  block: number;

  /** 현재 활성 캐릭터 */
  activeCharacter: CharacterId;
  /** 캐릭터별 현재 HP */
  characterHp: Record<CharacterId, number>;

  status: Status;

  /**
   * 카드 영역
   */
  deck: string[];
  hand: string[];

  /**
   * 코스트 지불 / 캔슬된 카드
   */
  trash: string[];

  /**
   * 정상적으로 사용된 카드
   */
  cooldown: string[];

  /**
   * 이번 턴 사용 대기 카드
   */
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
  round: number;
  turn: number;
  phase: TurnPhase;

  winner: PlayerId | "DRAW" | null;

  /**
   * 주도권 (속도 동률일 때 우선권)
   */
  initiative: PlayerId;

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
  | { type: "INITIATIVE/RANDOMIZE" }
  | { type: "GAME/INIT" };