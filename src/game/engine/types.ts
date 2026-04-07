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
  | "tag"
  | "airborne"
  | "move_cards";

/** 카드가 속할 수 있는 존 */
export type CardZone = "deck" | "hand" | "trash" | "cooldown";

/** 덱에 카드를 삽입할 위치 */
export type DeckInsertPosition = "top" | "bottom";

/** damage 효과의 적중 조건 */
export type DamageType =
  | "ground"    // 상대 airborneStack === 0 일 때만 적용
  | "anti-air"; // 상대 airborneStack >= 1 일 때만 적용

export type Target = "self" | "enemy";

export type CardEffect = {
  type: EffectType;
  value?: number;
  target?: Target;
  /** damage 효과에만 사용. 미지정 시 항상 적용 */
  damageType?: DamageType;
  /** move_cards 효과 전용 */
  from?: CardZone;
  to?: CardZone;
  count?: number;
  deckPosition?: DeckInsertPosition;
  /** true 이면 P1이 직접 선택, false/미지정이면 자동(첫 번째 카드) */
  playerChooses?: boolean;
};

/** 카드 사용 가능 조건 */
export type UseCondition =
  | "ground"   // 자신의 airborneStack === 0 일 때만 사용 가능
  | "airborne"; // 자신의 airborneStack >= 1 일 때만 사용 가능

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

  /** 미지정 시 항상 사용 가능 */
  useCondition?: UseCondition;
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
  /** 현재 활성 캐릭터의 체공 스택 (0이면 일반, ≥1이면 체공 상태) */
  airborneStack: number;

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
  | "WAITING_SELECTION"
  | "TURN_END"
  | "GAME_OVER";

/** move_cards 효과로 인해 P1이 카드를 선택해야 할 때의 대기 상태 */
export type PendingSelection = {
  fromZone: CardZone;
  fromOwner: PlayerId;
  toZone: CardZone;
  toOwner: PlayerId;
  count: number;
  deckPosition?: DeckInsertPosition;
  /** 선택 완료 후 이어서 처리할 resolve 아이템 */
  resolveItems: { player: PlayerId; cardId: string }[];
  /** 선택 완료 후 처리할 unresolved 플레이어 목록 */
  resolveUnresolved: PlayerId[];
  /** 이 선택을 유발한 카드 정보 (선택 후 cooldown으로 이동) */
  triggerPlayer: PlayerId;
  triggerCardId: string;
};

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

  /** WAITING_SELECTION 페이즈일 때 설정되는 선택 대기 정보 */
  pendingSelection: PendingSelection | null;

  log: string[];
};

/** 게임 시작 전 셋업 설정 */
export type SetupConfig = {
  /** [0] = 선발, [1] = 후발 */
  characters: [CharacterId, CharacterId];
  /** DECK_REGISTRY 키 */
  deckId: string;
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
  | { type: "GAME/INIT" }
  | { type: "SELECTION/CONFIRM"; cardIds: string[] }
  | { type: "SELECTION/SKIP" };