export type PlayerId = "P1" | "AI";

/**
 * 카드 액션 태그 — 애니메이션 포즈 결정에 사용
 */
export type ActionTag =
  | "block"
  | "draw"
  | "tag_switch"
  | "reclaim"
  | "weak_punch"
  | "strong_punch"
  | "aerial_punch"
  | "weak_kick"
  | "strong_kick"
  | "aerial_kick"
  | "dragon_kick"
  | "rising_punch"
  | "hadouken"
  | "use_item";

/**
 * 파이터 포즈 — 스프라이트 시퀀스 키
 */
export type FighterPose =
  | "idle"
  | "block"
  | "hit_weak"
  | "hit_strong"
  | "hit_aerial"
  | "ko"
  | "attack_weak_punch"
  | "attack_strong_punch"
  | "attack_aerial_punch"
  | "attack_weak_kick"
  | "attack_strong_kick"
  | "attack_dragon_kick"
  | "attack_aerial_kick"
  | "attack_rising_punch"
  | "attack_hadouken"
  | "use_item"
  | "tag_exit"
  | "tag_entry";

/** 피격 애니메이션 포즈 — hitTimings 및 visual_hit 이벤트에 사용 */
export type HitPose = "hit_weak" | "hit_strong" | "hit_aerial";

/**
 * 파이터 뷰 상태 (렌더링용)
 */
export interface FighterViewState {
  pose: FighterPose;
  flip: boolean;
}

/**
 * 전투 애니메이션 이벤트 (이벤트 큐 파이프라인용)
 *
 * type:
 *   action_start   — 공격자 포즈 전환
 *   visual_hit     — 피격자 hit 포즈
 *   damage_resolve — 실제 HP 반영 타이밍 마커
 *   action_end     — 마지막 포즈 유지 (idle 복귀는 라운드 경계에서만)
 *
 * delay: 큐 시작 시점으로부터의 절대 지연 (ms)
 */
export interface CombatAnimationEvent {
  type: "action_start" | "visual_hit" | "damage_resolve" | "action_end";
  /** 큐 시작 시점으로부터의 절대 지연 (ms) */
  delay: number;
  /** 행동하는 플레이어 (action_start, action_end) */
  actor?: PlayerId;
  /** 피격자 (visual_hit) */
  target?: PlayerId;
  /** 피격자가 재생할 포즈 (visual_hit). 미지정 시 "hit" fallback */
  hitPose?: HitPose;
  /** 포즈 결정용 액션 태그 (action_start) */
  actionTag?: ActionTag;
}

export type CharacterId = "A" | "B";

export type CharacterDef = {
  id: CharacterId;
  maxHp: number;
  /** 이 캐릭터로 교체될 때 발동 */
  entryEffect: CardEffect | null;
  /** 이 캐릭터에서 다른 캐릭터로 교체될 때 발동 */
  exitEffect: CardEffect | null;
  /** 이 캐릭터가 사용할 수 있는 카드 태그 집합. 카드의 tags가 모두 포함되어야 사용 가능 */
  affinities: string[];
};

/** 카드가 위치할 수 있는 영역 */
export type CardZone = "hand" | "deck" | "trash" | "cooldown" | "queue";

/** 덱에 카드를 삽입할 위치 */
export type DeckInsertPosition = "top" | "bottom" | "random";

/** 카드 필터 조건 (추후 확장 가능) */
// TODO: 태그, 코스트, 타입 등 필터 프로퍼티 추가
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
  | "draw_tagged"
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
  /** draw_tagged: 드로우할 카드의 태그 */
  tag?: CardTag;
  /** draw_tagged: 드로우할 영역 (기본값: "deck") */
  zone?: CardZone;
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

  /** 애니메이션 액션 태그. 미지정 시 idle 유지 */
  actionTag?: ActionTag;
  /** 공격자가 airborne 상태일 때 사용할 액션 태그. 미지정 시 actionTag 그대로 사용 */
  actionTagAirborne?: ActionTag;

  /** 히트 타이밍 목록. 각 항목은 ms 지연과 ground/airborne별 피격 애니를 정의 */
  hitTimings?: { ms: number; ground: HitPose; airborne: HitPose }[];
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
  | "ROUND_DRAFT"
  | "TURN_START"
  | "SETUP_INIT"
  | "SETUP_OTHER"
  | "RESOLVE"
  | "RESOLVING"
  | "ANIMATING"
  | "WAITING_SELECTION"
  | "WAITING_DISCARD"
  | "TURN_END"
  | "GAME_OVER";

/**
 * ANIMATING 페이즈에서 재생할 애니메이션 항목.
 * 캔슬된 카드는 포함되지 않음.
 */
export type AnimScriptEntry = {
  actor: PlayerId;
  cardId: string;
  /** 해결 시점의 행동자 체공 스택 (actionTagAirborne 선택에 사용) */
  actorAirborne: number;
  /** 해결 시점의 피격자 체공 스택 (hitTimings 포즈 선택에 사용) */
  targetAirborne: number;
};

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

  /** 캔슬된 카드의 소유 플레이어. 다음 턴 시작 시 null로 클리어. */
  recentlyCancelledPlayer: PlayerId | null;

  log: string[];

  /** P1이 이번 턴에 태그를 사용했는지 (턴당 1회 제한) */
  p1TaggedThisTurn: boolean;

  /** RESOLVING 페이즈: 처리할 카드 순서 목록 */
  resolveQueue: { player: PlayerId; cardId: string }[];
  /** RESOLVING 페이즈: 다음에 처리할 인덱스 */
  resolveIndex: number;
  /** RESOLVING 페이즈: 아직 카드를 처리하지 않은 플레이어 */
  resolveUnresolved: PlayerId[];

  /** ANIMATING 페이즈: 재생할 애니메이션 항목 목록 (캔슬된 카드 제외) */
  animScript: AnimScriptEntry[];

  /** ROUND_DRAFT 페이즈: 드래프트 제출 현황 (null = 미제출) */
  draftSelections: { P1: string[] | null; AI: string[] | null };
};

/** 덱 정의 — decks.json에 저장 */
export type DeckDef = {
  id: string;
  name: string;
  /** 카드 id 배열 (중복 허용, 최소 20장) */
  cards: string[];
  /** [0] = 선발, [1] = 후발 */
  characters: [CharacterId, CharacterId];
};

/** 게임 시작 전 셋업 설정 */
export type SetupConfig = {
  /** [0] = 선발, [1] = 후발 */
  characters: [CharacterId, CharacterId];
  /** decks.json 키 */
  deckId: string;
};

export type Action =
  | { type: "GAME/START" }
  | { type: "TURN/BEGIN" }
  | { type: "CARD/SELECT"; cardId: string; handIndex: number }
  | { type: "PLAYER/READY"; player: PlayerId }
  | { type: "AI/SETUP_AUTO" }
  | { type: "AI/GUEST_READY"; cardId?: string; handIndex?: number }
  | { type: "AI/GUEST_TAG" }
  | { type: "RESOLVE/STEP" }
  | { type: "TURN/END" }
  | { type: "DEBUG/RESET" }
  | { type: "SELECTION/CONFIRM"; selectedCards: string[] }
  | { type: "SELECTION/SKIP" }
  | { type: "DISCARD/CONFIRM"; discardCards: string[] }
  | { type: "TURN/TAG" }
  | { type: "SUBMIT_DRAFT"; player: PlayerId; cardIds: string[] }
  | { type: "ANIM/DONE" };