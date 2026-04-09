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

/** 카드가 위치할 수 있는 영역 */
export type CardZone = "hand" | "deck" | "trash" | "cooldown" | "queue";

/** 덱에 카드를 삽입할 위치 */
export type DeckInsertPosition = "top" | "bottom" | "random";

/** 카드 필터 조건 (추후 확장 가능) */
export type CardCondition = {
  // Future: filter by card properties
};

/**
 * 카드 태그 — 카드 분류 및 태그 기반 효과 타게팅에 사용
 * 새 태그 추가 시 이 한 곳만 수정하면 됨
 */
export type CardTag =
  | "마법"
  | "검술"
  | "격투"
  | "방어"
  | "방패"
  | "한손검";

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
  /** move_cards: 카드를 가져올 영역 */
  fromZone?: CardZone;
  /** move_cards: 카드를 보낼 영역 */
  toZone?: CardZone;
  /** move_cards: 덱에 넣을 위치 */
  toPosition?: DeckInsertPosition;
  /** move_cards: 이동할 카드 수 */
  count?: number;
  /** move_cards: P1이 직접 선택 (AI는 자동 선택) */
  userSelects?: boolean;
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

  /** 카드 분류 태그. 미지정 시 태그 없음 */
  tags?: CardTag[];
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
  | "RESOLVING"
  | "WAITING_SELECTION"
  | "WAITING_DISCARD"
  | "TURN_END"
  | "GAME_OVER";

/**
 * 턴 종료 시 핸드 사이즈 초과로 인한 버리기 대기 상태
 */
export type PendingDiscard = {
  /** 버려야 할 카드 수 */
  count: number;
  /** 현재 P1 핸드 카드 목록 (선택 대상) */
  candidates: string[];
};

/**
 * 카드 선택 대기 상태 (move_cards + userSelects 효과 처리 중)
 */
export type PendingSelection = {
  /** 선택하는 플레이어 */
  selectingPlayer: PlayerId;
  /** 선택 가능한 카드 id 목록 */
  candidates: string[];
  /** 선택해야 할 최대 카드 수 */
  count: number;
  /** 카드를 가져올 영역 */
  fromZone: CardZone;
  fromPlayerId: PlayerId;
  /** 카드를 보낼 영역 */
  toZone: CardZone;
  toPlayerId: PlayerId;
  toPosition: DeckInsertPosition;
  /** 이 선택을 유발한 카드 */
  sourcePlayer: PlayerId;
  sourceCardId: string;
  /** resolve 재개용 컨텍스트 */
  resolveItems: { player: PlayerId; cardId: string }[];
  resolveNextIndex: number;
  /** 선택 대기 이후 아직 처리 안 된 플레이어 (sourcePlayer 제외) */
  unresolvedPlayers: PlayerId[];
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

  /** WAITING_SELECTION 페이즈일 때 설정됨 */
  pendingSelection: PendingSelection | null;

  /** WAITING_DISCARD 페이즈일 때 설정됨 (턴 종료 핸드 사이즈 초과 버리기) */
  pendingDiscard: PendingDiscard | null;

  /** 캔슬된 카드 id (애니메이션 트리거용). 다음 턴 시작 시 null로 클리어. */
  recentlyCancelledId: string | null;

  log: string[];

  /** RESOLVING 페이즈: 처리할 카드 순서 목록 */
  resolveQueue: { player: PlayerId; cardId: string }[];
  /** RESOLVING 페이즈: 다음에 처리할 인덱스 */
  resolveIndex: number;
  /** RESOLVING 페이즈: 아직 카드를 처리하지 않은 플레이어 */
  resolveUnresolved: PlayerId[];
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
  | { type: "SELECTION/CONFIRM"; selectedCards: string[] }
  | { type: "SELECTION/SKIP" }
  | { type: "DISCARD/CONFIRM"; discardCards: string[] };