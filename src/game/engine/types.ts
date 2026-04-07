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
  | "draw_tagged"; // 특정 태그를 가진 카드를 덱/쿨다운에서 드로우

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
  /**
   * draw_tagged 효과에만 사용.
   * 어느 존에서 탐색할지 지정 (미지정 시 "deck")
   * 예: { type: "draw_tagged", tag: "검술", zone: "deck", value: 1 }
   */
  tag?: CardTag;
  zone?: "deck" | "cooldown";
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
  | { type: "GAME/INIT" };