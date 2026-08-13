export type PlayerId = "P1" | "AI";

/**
 * ActionTag → FighterPose 매핑 (단일 소스).
 * 새 액션 추가 시 이 객체에만 한 줄 추가하면 ActionTag 타입·스키마·매핑이 자동 반영됨.
 * null = 포즈 전환 없음 (효과음/이펙트 전용 태그)
 */
export const ACTION_TAG_TO_POSE = {
  block:         "block",
  draw:          null,
  tag_switch:    null,
  reclaim:       null,
  weak_punch:    "attack_weak_punch",
  strong_punch:  "attack_strong_punch",
  aerial_punch:  "attack_aerial_punch",
  weak_kick:     "attack_weak_kick",
  strong_kick:   "attack_strong_kick",
  aerial_kick:   "attack_aerial_kick",
  dragon_kick:   "attack_dragon_kick",
  rising_punch:  "attack_rising_punch",
  hadouken:      "attack_hadouken",
  use_item:      "use_item",
  throw:         "throw",
  jump:          "jump",
} as const satisfies Record<string, FighterPose | null>;

/** 카드 액션 태그 — ACTION_TAG_TO_POSE 키에서 자동 파생 */
export type ActionTag = keyof typeof ACTION_TAG_TO_POSE;

/**
 * 파이터 포즈 — 스프라이트 시퀀스 키
 */
export type FighterPose =
  | "idle"
  | "dash"
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
  | "tag_entry"
  | "throw"
  | "jump"
  | "land";

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
 *   super_flash    — 기술 발동 전 플래시 연출
 *   fighter_move   — 파이터 위치 이동 (대시-인 / 넉백 / 복귀). 거리(근접/비근접) 연출 전용
 *   action_start   — 공격자 포즈 전환
 *   visual_hit     — 피격자 hit 포즈
 *   damage_resolve — 실제 HP 반영 타이밍 마커
 *   action_end     — 마지막 포즈 유지 (idle 복귀는 라운드 경계에서만)
 *
 * delay: 큐 시작 시점으로부터의 절대 지연 (ms)
 */
export interface CombatAnimationEvent {
  type: "action_start" | "visual_hit" | "damage_resolve" | "action_end" | "super_flash" | "fighter_move" | "poison_tick";
  /** 큐 시작 시점으로부터의 절대 지연 (ms) */
  delay: number;
  /** 행동하는 플레이어 (action_start, action_end, damage_resolve) */
  actor?: PlayerId;
  /** 피격자 (visual_hit) */
  target?: PlayerId;
  /** 피격자가 재생할 포즈 (visual_hit). 미지정 시 "hit" fallback */
  hitPose?: HitPose;
  /** visual_hit: 히트스탑 = 줌 유지 윈도우 (ms). makeQueue가 카드 freeze/프리셋으로 산출 */
  freezeMs?: number;
  /** visual_hit: 줌인 배율. makeQueue가 카드 zoom/프리셋으로 산출 */
  zoom?: number;
  /**
   * visual_hit: 가드 히트 — 스윙은 닿았지만 블록에 전부 흡수돼 체력이 안 깎인 경우.
   * 격겜의 가드 임팩트처럼 히트스탑·흔들림은 재생하되 피격 포즈로 전환하지 않는다
   * (가드 자세가 흐트러지지 않음).
   */
  guarded?: boolean;
  /** 포즈 결정용 액션 태그 (action_start) */
  actionTag?: ActionTag;
  /** fighter_move: 이동하는 파이터 */
  subject?: PlayerId;
  /** fighter_move: 목표 X 오프셋 (px, 아레나 기본 배치 기준) */
  toOffset?: number;
  /** fighter_move: 이동 성격 — 트랜지션 속도/커브 선택에 사용 */
  motion?: "dash" | "recover" | "knockback";
  /** fighter_move: 배경 밀림 착시량 (공격자 복귀 시 배경을 같은 방향으로 이동) */
  bgPush?: number;
  /** damage_resolve: 이 카드 효과 적용 후의 HP (UI 표시용) */
  hpAfter?: { P1: number; AI: number };
  /** damage_resolve: 이 카드로 인해 카운터된 플레이어 (UI 표시용) */
  counteredPlayer?: PlayerId;
  /** damage_resolve: 이 카드 효과 적용 후의 콤보 카운트 (UI 표시용) */
  comboAfter?: number;
  /** damage_resolve: 이 카드 효과 적용 후의 콤보 보유 플레이어 (UI 표시용) */
  comboHolder?: PlayerId;
}

export type CharacterId = string;

export type CharacterDef = {
  id: CharacterId;
  name: string;
  maxHp: number;
  /** spriteMap.ts의 CHARACTER_SPRITES 키. 스프라이트 에셋과 캐릭터 ID를 분리 */
  spriteId: string;
  /** 이 캐릭터로 교체될 때 발동. 배열이면 순서대로 적용 */
  entryEffect: CardEffect | CardEffect[] | null;
  /** 이 캐릭터에서 다른 캐릭터로 교체될 때 발동. 배열이면 순서대로 적용 */
  exitEffect: CardEffect | CardEffect[] | null;
  /** 이 캐릭터가 사용할 수 있는 카드 태그 집합. 카드의 tags가 모두 포함되어야 사용 가능 */
  affinities: string[];
};

/** 카드가 위치할 수 있는 영역 */
export type CardZone = "hand" | "deck" | "trash" | "cooldown" | "queue";

/** 덱에 카드를 삽입할 위치 */
export type DeckInsertPosition = "top" | "bottom" | "random";

/**
 * 카드 태그 — 카드 분류 및 태그 기반 효과 타게팅에 사용
 * 새 태그 추가 시 이 한 곳만 수정하면 됨
 */
export const CARD_TAGS = [
  "마법", "격투", "구룡권", "독", "마나", "특공인법", "혈계권", "혈계", "제압투척구 3형",
  "검술", "방어", "방패", "한손검", "제압독", "투척형", "MOLAR", "인법", "제압기",
  "필살", "준비", "암기", "power",
  // 어피니티 3층 구조: 공통 / 조직 / 개인
  "공통",
  // 조직
  "공안", "기계", "의료", "교단", "흥행",
  // 개인
  "나기", "우카이", "DM-7",
  "싯토우", "네무리", "호도코시", "마키", "소나에", "아카리", "짓쿄",
  // 파츠: DM-7 팔 3종 (기계 태그를 함께 가져 회수 대상이 된다) / 토큰: 덱 구축 불가 더미
  "파츠", "토큰",
] as const;

export type CardTag = typeof CARD_TAGS[number];

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
  | "tag"
  | "airborne"
  | "move_cards"
  | "shuffle"
  | "generate"
  | "buff"
  | "poison";

/** damage 효과의 적중 조건 */
export type DamageType =
  | "ground"    // 상대 airborneStack === 0 일 때만 적용
  | "anti-air"; // 상대 airborneStack >= 1 일 때만 적용

export type Target = "self" | "enemy";

/**
 * 카드 발동 전 지불하는 추가 코스트.
 * move_cards 타입: 카드 이동으로 지불 (target/fromZone/toZone/count/tag/userSelects)
 * hp 타입: HP를 직접 지불
 */
export type AltCostMoveCards = {
  type?: "move_cards";
  /** 카드를 가져올 플레이어 ("self" = 사용자, "enemy" = 상대, 미지정 시 self) */
  target?: Target;
  fromZone: CardZone;
  toZone: CardZone;
  toPosition?: DeckInsertPosition;
  count: number;
  tag?: CardTag;
  /** true면 P1이 직접 선택. AI는 항상 자동 선택 */
  userSelects?: boolean;
};

export type AltCostHp = {
  type: "hp";
  /** 지불할 HP 량. 사용자 HP가 이 값보다 많아야 사용 가능 (= 즉사 불가) */
  amount: number;
};

export type AltCost = AltCostMoveCards | AltCostHp;

/** additionalCost가 요구하는 카드 한 종류 */
export type AdditionalCostRequirement = {
  /** 요구 카드 id */
  cardId: string;
  /** 그 카드가 있어야 할 영역 */
  zone: CardZone;
  /** 필요한 장수 */
  count: number;
};

/**
 * 추가 코스트 — 지정한 카드들이 특정 영역에 있어야 사용 가능하고, 사용 시 소모된다.
 *
 * altCost가 "아무 카드 N장"을 지불한다면 이쪽은 **특정 카드를 지목**한다.
 * (예: cooldown에 팔 3종이 모여야 열리는 피니셔)
 * 조건 미충족 시 getCardPlayability가 사용 불가로 판정한다.
 */
export type AdditionalCost = {
  requires: AdditionalCostRequirement[];
  /** 소모된 카드가 이동할 영역 */
  consumeTo: CardZone;
};

export type CardEffect = {
  type: EffectType;
  value?: number;
  target?: Target;
  /** move_cards: 카드를 보낼 대상 플레이어 (미지정 시 target과 동일) */
  toTarget?: Target;
  /** damage 효과에만 사용. 미지정 시 항상 적용 */
  damageType?: DamageType;
  /** move_cards: 카드를 가져올 영역 */
  fromZone?: CardZone;
  /** move_cards / generate: 카드를 보낼 영역 */
  toZone?: CardZone;
  /** move_cards / generate: 덱에 넣을 위치 */
  toPosition?: DeckInsertPosition;
  /** move_cards / generate: 이동하거나 생성할 카드 수 */
  count?: number;
  /** move_cards: P1이 직접 선택 (AI는 자동 선택) */
  userSelects?: boolean;
  /** draw_tagged: 드로우할 카드의 태그 */
  tag?: CardTag;
  /** draw_tagged / shuffle: 대상 영역 (기본값: "deck") */
  zone?: CardZone;
  /** generate: 생성할 카드 id */
  cardId?: string;
  /** heal: 대상 플레이어의 어느 캐릭터를 회복할지 (미지정 시 활성 캐릭터) */
  character?: HealCharacter;

  /* ── buff 효과 전용 ─────────────────────────────────────────────
   * 증감량은 value를 쓴다 (음수 = 디버프). */
  /** 보정할 스탯 */
  stat?: StatTarget;
  /** 플레이어에 걸지, 지금 활성 캐릭터에 걸지 (미지정 시 player) */
  buffScope?: BuffScope;
  /** 지속 방식 (미지정 시 1턴) */
  buffDuration?: { type: "turns" | "uses"; value: number };
  /** 영향받을 카드 한정 (미지정 시 전부) */
  buffFilter?: BuffFilter;
  /** 로그·UI 표시용 이름 (buff / poison 공용) */
  label?: string;

  /* ── poison 효과 전용 ───────────────────────────────────────────
   * 틱당 데미지는 value를 쓴다. 스코프는 buff와 같은 buffScope를 공유한다. */
  /** 지속 턴 수 (미지정 시 2) */
  poisonTurns?: number;
};

/**
 * heal 대상 캐릭터.
 * `target`(self/enemy)이 "누구"를 고르고, 이 필드가 그 플레이어의 "어느 캐릭터"를 고른다.
 * bench는 characterHp만 갱신하고 활성 hp는 건드리지 않는다.
 */
export type HealCharacter = "active" | "bench";

/** StatModifier 조건 체크 대상 */
export type ConditionCheck =
  | "hand_count"
  | "deck_count"
  | "cooldown_count"
  | "hp"
  | "bench_hp"
  | "airborne_stack"
  | "turn"
  | "round";

export type CompareOp = "<" | ">" | "=";

/** StatModifier가 보정할 카드 스탯 */
export type StatTarget = "cost" | "delay" | "ground_attack" | "anti_air_attack" | "advantage";

/** 게임 상태에서 읽어올 수치의 출처 (누구의 무엇을 볼 것인가) */
export type StatSource = {
  check: ConditionCheck;
  target: "self" | "enemy";
};

export type ModifierCondition = StatSource & {
  op: CompareOp;
  value: number;
};

/** 임계값 보정 — 조건 충족 시 고정 delta. mode 생략 = threshold (기존 카드 호환) */
export type ThresholdModifier = {
  mode?: "threshold";
  condition: ModifierCondition;
  stat: StatTarget;
  delta: number;
};

/**
 * 비례 보정 — 소스 수치에 비례해 보정치를 산출한다.
 *
 *   delta = clamp(trunc((source - baseline) * perUnit / divisor), min, max)
 *
 * 예) "상대 손패 1장당 공격력 +1, 최대 +6"
 *   { mode: "scaling", source: { check: "hand_count", target: "enemy" },
 *     stat: "ground_attack", perUnit: 1, max: 6 }
 *
 * 예) "내 덱 2장당 딜레이 -1"
 *   { mode: "scaling", source: { check: "deck_count", target: "self" },
 *     stat: "delay", perUnit: -1, divisor: 2 }
 *
 * 나눗셈은 0 방향 버림(trunc)이라 부호에 대칭이다.
 * 소스 값은 **리졸브 시점**에 다시 읽으므로, 핸드 표시는 그 시점의 추정치다.
 */
export type ScalingModifier = {
  mode: "scaling";
  source: StatSource;
  stat: StatTarget;
  /** 소스 1단위당 증감 (음수 = 소스가 클수록 약해짐) */
  perUnit: number;
  /** 이 값을 기준으로 차이만큼만 반영 (기본 0) */
  baseline?: number;
  /** N단위당 perUnit 적용 (기본 1). 0 이하는 1로 취급 */
  divisor?: number;
  /** 보정치 하한 — "초과분만 반영"처럼 한쪽 방향만 쓸 때 0으로 지정 */
  min?: number;
  /** 보정치 상한 — 밸런스 안전장치 */
  max?: number;
};

/** 조건부 스탯 보정 — 결과 delta를 해당 스탯에 누적 적용. 최종 스탯은 0 하한 */
export type StatModifier = ThresholdModifier | ScalingModifier;

/** 카드 사용 가능 조건 */
export type UseCondition =
  | "ground"   // 자신의 airborneStack === 0 일 때만 사용 가능
  | "airborne"; // 자신의 airborneStack >= 1 일 때만 사용 가능

/**
 * 카드 타입
 * - attack: 공격 스탯(groundAttack, antiAirAttack, advantage)을 가지며, 적중 시 이니셔티브·카운터 발동
 * - skill:  공격 스탯 없음. 효과만 처리. 적중해도 이니셔티브·카운터 발동 안 함
 */
export type CardType = "attack" | "skill";

export type Card = {
  id: string;
  name: string;

  /** 카드 타입. 미지정 시 기존 동작 유지 (하위 호환) */
  cardType?: CardType;

  // 코스트 = 덱에서 소모할 카드 수
  cost: number;

  // 딜레이 = 이상 정수, 0이 가장 빠름
  delay: number;

  /** 공격 타입 전용 — 지상 공격력 (target.airborneStack === 0 일 때 적용) */
  groundAttack?: number;
  /** 공격 타입 전용 — 대공 공격력 (target.airborneStack >= 1 일 때 적용) */
  antiAirAttack?: number;
  /** 공격 타입 전용 — 적중 시 다음 턴 딜레이 보너스 */
  advantage: number;

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

  /**
   * 히트 타이밍 목록. 각 항목은 임팩트 프레임과 ground/airborne별 피격 애니를 정의.
   * - frame: 공격 포즈 재생 시퀀스 내 순번(0-based). actor 포즈 fps로 ms 환산
   * - freeze: 히트스탑 = 줌 유지 윈도우(ms). 미지정 시 강도별 프리셋
   * - zoom: 줌인 배율. 미지정 시 강도별 프리셋
   */
  hitTimings?: { frame: number; ground: HitPose; airborne: HitPose; freeze?: number; zoom?: number }[];

  /** true면 기술 발동 전 슈퍼 플래시 연출 재생 */
  superFlash?: boolean;

  /**
   * 연출 전용 — 근접 공격. 비근접 상태면 공격자가 상대 앞까지 돌진한 뒤
   * 공격 연출을 재생한다 (게임 로직 무관). 적중 시 근접 상태로 남고,
   * 빗나가면 헛스윙 후 원위치로 복귀한다(휘핑 — 거리 상태 무변화).
   * **미지정 시 true** — 원거리 카드만 명시적으로 false를 저장한다.
   */
  meleeAttack?: boolean;
  /**
   * 연출 전용 — 넉백. true면 타격 성립 시 공격 연출이 끝난 후
   * 양측이 홈 위치로 밀려나 비근접 상태가 된다 (게임 로직 무관).
   */
  knockback?: boolean;

  /** 조건부 스탯 보정 목록. 조건 충족 시 해당 스탯에 delta 누적 */
  statModifiers?: StatModifier[];

  /** 카드 발동 전 지불하는 추가 코스트. ready 시점에 처리 */
  altCost?: AltCost;

  /** 특정 카드를 특정 영역에 요구하고 사용 시 소모하는 추가 코스트 */
  additionalCost?: AdditionalCost;

  /**
   * true면 효과로 생성될 때만 등장하는 카드 — 덱 구축에 넣을 수 없다.
   * (DM-7 파츠 3종, 나기가 상대 덱에 심는 토큰 등)
   */
  generateOnly?: boolean;
};

export type SelectedCard = {
  cardId: string;
  handIndex: number;
};

/**
 * 카드의 실효 스탯 (표시·미리보기용 단일 진실원).
 * base 스탯에 statModifiers(조건부 보정)와 status 버프(delayAdvantage/attackBuff)를 모두 합산한다.
 * 전투 해결(effects.ts)과 동일한 계산식을 사용해 핸드 표시와 실제 결과가 일치한다.
 */
export type CardStats = {
  /** 실효 코스트 (base + mods.cost) */
  cost: number;
  /** 실효 속도 (base - delayAdvantage + mods.delay, 낮을수록 빠름) */
  delay: number;
  /** 실효 지상 공격력 (base + mods + attackBuff) */
  groundAttack: number;
  /** 실효 대공 공격력 (base + mods + attackBuff) */
  antiAirAttack: number;
  /** 실효 advantage (base + mods.advantage) */
  advantage: number;
};

/**
 * 카드 사용 가능 판정 결과 (UI·AI·집행 공용 단일 진실원).
 * 각 플래그는 독립적으로 노출되어 UI가 "코스트 부족"과 "조건 차단"을 구분 표시할 수 있다.
 */
export type CardPlayability = {
  /** 모든 조건 충족 (costOk && affinityMet && altCostOk && conditionMet) */
  playable: boolean;
  /** statModifiers 보정이 반영된 실효 코스트 */
  effectiveCost: number;
  /** effectiveCost ≤ 덱 장수 */
  costOk: boolean;
  /** useCondition(ground/airborne) 충족 */
  conditionMet: boolean;
  /** 카드 태그가 캐릭터 어피니티에 포함됨 */
  affinityMet: boolean;
  /** altCost(HP/덱 지불) 지불 가능 */
  altCostOk: boolean;
  /** additionalCost가 요구하는 카드가 모두 갖춰짐 */
  additionalCostOk: boolean;
};

/**
 * 버프 지속 방식.
 *  - turns: 턴 시작마다 1 감소, 0이 되면 소멸. 라운드가 바뀌면 남은 턴과 무관하게 전부 소멸
 *  - uses:  **필터에 맞는 카드를 사용할 때만** 1 감소 (스킬만 써서는 줄지 않는다)
 */
export type BuffDuration =
  | { type: "turns"; remaining: number }
  | { type: "uses"; remaining: number };

/**
 * 버프가 붙는 단위.
 *  - player:    플레이어에게 붙어 캐릭터를 교체해도 유지된다
 *  - character: 걸릴 당시의 활성 캐릭터에게 붙어, **그 쪽이 태그하면 소멸**한다
 */
export type BuffScope = "player" | "character";

/**
 * 어떤 카드가 이 버프의 영향을 받는지.
 * 지정한 조건을 **모두** 만족해야 하고(AND), tags는 그중 하나만 있어도 통과한다(OR).
 * 조건이 없으면 모든 카드에 적용된다.
 */
export type BuffFilter = {
  cardType?: CardType;
  tags?: CardTag[];
  /**
   * 스탯 범위 조건. **버프가 적용되기 전 base 스탯**으로 판정한다 —
   * 실효 스탯으로 보면 "코스트 3 이상 카드의 코스트 -1"이 스스로 조건을 무너뜨려
   * 적용 순서에 따라 결과가 달라진다.
   */
  statRange?: { stat: StatTarget; min?: number; max?: number };
};

/** 실제로 걸려 있는 버프/디버프 (delta 음수 = 디버프) */
export type Buff = {
  /** 로그·UI 표시용 이름 (없으면 스탯명으로 대체) */
  label?: string;
  stat: StatTarget;
  delta: number;
  duration: BuffDuration;
  scope: BuffScope;
  /** scope가 character일 때 걸린 캐릭터 — 태그로 바뀌면 소멸 판정에 쓴다 */
  characterId?: CharacterId;
  filter?: BuffFilter;
};

/**
 * 걸려 있는 중독(지속 데미지).
 *
 * 버프와 수명주기 규칙을 공유한다 — scope로 태그 소멸 여부가 갈리고, 라운드가 바뀌면 전부 사라진다.
 * 다른 점은 스탯을 바꾸는 대신 **매 턴 리졸브 끝에 HP를 깎는다**는 것.
 */
export type Poison = {
  /** 로그·UI 표시용 이름 (없으면 "독"으로 대체) */
  label?: string;
  /** 틱당 데미지 — 블록을 무시하고 그대로 들어간다 */
  damage: number;
  /** 남은 틱 수. 리졸브 끝에 1씩 줄고 0이 되면 소멸 */
  turns: number;
  scope: BuffScope;
  /** scope가 character일 때 걸린 캐릭터 — 태그로 바뀌면 소멸 판정에 쓴다 */
  characterId?: CharacterId;
  /**
   * 걸린 턴. **그 턴에는 틱하지 않는다** — 건 턴에 바로 깎이면
   * 같은 카드가 즉발 데미지 + 지속 데미지를 겸하게 되어 지속의 의미가 흐려진다.
   */
  appliedTurn: number;
};

export type Status = {
  attackBuff: number;

  delayAdvantage: number;
  delayAdvantageNext: number;

  exhausted: boolean;

  /**
   * 걸려 있는 버프/디버프 목록. 같은 스탯에 여러 개가 걸리면 전부 합산된다.
   * (기존 attackBuff·delayAdvantage와는 당분간 병존한다)
   */
  buffs: Buff[];

  /** 걸려 있는 중독 목록. 여러 개면 전부 따로 틱하고 데미지가 합산된다 */
  poisons: Poison[];
};

/**
 * 한 번의 중독 틱 결과 — ANIMATING 재생용.
 * animScript는 "카드 1장당 1항목" 구조라 카드가 없는 틱을 담을 수 없어 별도 배열로 싣는다.
 */
export type PoisonTick = {
  target: PlayerId;
  damage: number;
  /** 이 틱 적용 후의 HP 스냅샷 (HP 바 지연 표시용) */
  hpAfter: { P1: number; AI: number };
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
   * 코스트 지불 / 카운터된 카드
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
  | "WAITING_COST_PAYMENT"
  | "WAITING_DISCARD"
  | "TURN_END"
  | "GAME_OVER";

/**
 * ANIMATING 페이즈에서 재생할 애니메이션 항목.
 * 카운터된 카드는 포함되지 않음.
 */
export type AnimScriptEntry = {
  actor: PlayerId;
  cardId: string;
  /** 해결 시점의 행동자 체공 스택 (actionTagAirborne 선택에 사용) */
  actorAirborne: number;
  /** 해결 시점의 피격자 체공 스택 (hitTimings 포즈 선택에 사용) */
  targetAirborne: number;
  /** 이 카드 효과 완전 적용 후의 HP 스냅샷 (UI 지연 표시용) */
  hpAfter: { P1: number; AI: number };
  /** 이 카드 공격으로 인해 카운터된 플레이어 (UI 지연 표시용) */
  counteredPlayer?: PlayerId;
  /**
   * 스윙이 대상에 닿았는지 (블록에 전부 막혀도 true) — 연출용.
   * 애니메이션이 카드 스탯으로 적중을 재계산하지 않도록 엔진 판정을 그대로 싣는다.
   */
  attackLanded?: boolean;
  /** 실제로 체력을 깎았는지(=적중) — 피격 포즈 재생 여부를 가른다. */
  attackConnected?: boolean;
  /** 이 카드 효과 적용 후의 콤보 카운트 (UI 지연 표시용) */
  comboAfter?: number;
  /** 이 카드 효과 적용 후의 콤보 보유 플레이어 (UI 지연 표시용) */
  comboHolder?: PlayerId;
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
 * altCost 코스트 지불 대기 상태 (WAITING_COST_PAYMENT 페이즈)
 * ready 시점에 P1이 직접 카드를 선택해 코스트를 지불할 때 사용
 */
export type PendingCostPayment = {
  player: PlayerId;
  /** 코스트 지불 후 큐에 올릴 카드 */
  cardId: string;
  handIndex: number;
  /** 취소 시 복귀할 페이즈 */
  originalPhase: "SETUP_INIT" | "SETUP_OTHER";
  /** 코스트 지불 완료 후 진행할 페이즈 */
  returnPhase: "SETUP_OTHER" | "RESOLVE";
  /** 선택 가능한 카드 목록 */
  candidates: string[];
  /** altCost 이동 파라미터 */
  fromPlayerId: PlayerId;
  fromZone: CardZone;
  toPlayerId: PlayerId;
  toZone: CardZone;
  toPosition: DeckInsertPosition;
  count: number;
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
  /**
   * 선택 종료 후 이어서 처리할 효과의 인덱스 (선택을 유발한 효과의 다음).
   * 이게 없으면 "선택 뒤에 오는 효과"(예: 회수 후 shuffle, userSelects 2연속)가
   * 조용히 누락된다.
   */
  resumeEffectIndex: number;
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

  /** 게임 시작 시드 (재현/리플레이용, 불변) */
  seed: number;
  /** 현재 RNG 상태 (난수 소비 시마다 전진) */
  rng: number;

  winner: PlayerId | "DRAW" | null;

  /**
   * 주도권 (속도 동률일 때 우선권)
   */
  initiative: PlayerId;

  P1: Combatant;
  AI: Combatant;

  selected: SelectedCard | null;

  /** WAITING_COST_PAYMENT 페이즈일 때 설정됨 */
  pendingCostPayment: PendingCostPayment | null;

  /** WAITING_SELECTION 페이즈일 때 설정됨 */
  pendingSelection: PendingSelection | null;

  /** WAITING_DISCARD 페이즈일 때 설정됨 (턴 종료 핸드 사이즈 초과 버리기) */
  pendingDiscard: PendingDiscard | null;

  /** 카운터된 카드 id (애니메이션 트리거용). 다음 턴 시작 시 null로 클리어. */
  recentlyCounteredId: string | null;

  /** 카운터된 카드의 소유 플레이어. 다음 턴 시작 시 null로 클리어. */
  recentlyCounteredPlayer: PlayerId | null;

  /**
   * 직전에 해결한 카드의 스윙이 대상에 닿았는지 (블록에 전부 막혀도 true).
   * 연출 기준 — 가드 임팩트(히트스탑·흔들림)와 거리 전이(대시 인게이지)에 쓰인다.
   * 체력이 깎였는지는 attackConnected로 따로 판단한다.
   */
  attackLanded?: boolean;

  /**
   * 직전에 해결한 카드의 공격 스탯이 실제로 체력을 깎았는지(=적중).
   * 리졸브 1스텝 안에서만 의미가 있는 일시값 — applyCardEffectsWithPause가 쓰고
   * 곧바로 resolve의 적중 판정(didDirectAttackHit)이 읽는다.
   *
   * 적중을 "카드 해결 전후 HP 차이"로 추정하지 않기 위해 존재한다.
   * damage 효과는 순수 체력 차감이라 적중이 아니므로, HP 비교로 판정하면
   * damage가 이니셔티브/어드밴티지/카운터를 잘못 유발하게 된다.
   */
  attackConnected?: boolean;

  log: string[];

  /** P1이 이번 턴에 태그를 사용했는지 (턴당 1회 제한) */
  p1TaggedThisTurn: boolean;

  /**
   * AI(온라인에서는 게스트)가 이번 턴에 태그를 사용했는지 (턴당 1회 제한).
   * 싱글플레이 AI는 구조상 턴당 1회만 태그하지만, 온라인 게스트는 사람이
   * AI/GUEST_TAG를 반복 전송할 수 있어 리듀서 가드에 이 플래그가 필요하다.
   */
  aiTaggedThisTurn: boolean;

  /** RESOLVING 페이즈: 리졸브 루프 컨텍스트 (큐·인덱스·미처리 플레이어를 하나로 묶음) */
  resolveContext: {
    queue: { player: PlayerId; cardId: string }[];
    index: number;
    unresolved: PlayerId[];
  };

  /** ANIMATING 페이즈: 재생할 애니메이션 항목 목록 (카운터된 카드 제외) */
  animScript: AnimScriptEntry[];

  /** ANIMATING 페이즈: 카드 연출이 모두 끝난 뒤 재생할 중독 틱 (리졸브 끝에 계산) */
  poisonTicks: PoisonTick[];

  /** ANIMATING 페이즈: 카드 효과 적용 직전 HP 스냅샷 (UI 지연 표시 초기값) */
  animStartHp: { P1: number; AI: number } | null;

  /** ANIMATING 페이즈: resolve 직전 콤보 스냅샷 (UI 지연 표시 초기값) */
  animStartCombo: { count: number; holder: PlayerId } | null;

  /** 현재 initiative 보유자의 연속 타격 횟수. 타격 시 +1, 주도권 이동 시 1로 리셋, 라운드 변경 시 0으로 리셋. */
  comboCount: number;

  /** ROUND_DRAFT 페이즈: 드래프트 제출 현황 (null = 미제출) */
  draftSelections: { P1: string[] | null; AI: string[] | null };

  /** 플레이 로그: 턴별 요약 (게임 종료 후 JSON 다운로드용) */
  turnLog: TurnLogEntry[];

  /** 튜토리얼 전용: 턴별 AI 행동 스크립트. index = turn-1. 빈 배열 = 패스 */
  tutorialAiScript?: string[][];
};

/** 턴 요약 — 게임 로그 분석용 */
export type TurnLogEntry = {
  turn: number;
  initiative: PlayerId;
  P1: { card: string | null; countered: boolean };
  AI: { card: string | null; countered: boolean };
  hp: { P1: number; AI: number };
  airborne: { P1: number; AI: number };
};

/** 덱 정의 */
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
  deckId: string;
};

export type Action =
  | { type: "GAME/START" }
  | { type: "TURN/BEGIN" }
  | { type: "CARD/SELECT"; cardId: string; handIndex: number }
  | { type: "PLAYER/READY"; player: PlayerId; cardId?: string; handIndex?: number }
  | { type: "AI/SETUP_AUTO" }
  | { type: "AI/GUEST_READY"; cardId?: string; handIndex?: number }
  | { type: "AI/GUEST_TAG" }
  | { type: "RESOLVE/STEP" }
  | { type: "TURN/END" }
  | { type: "DEBUG/RESET" }
  | { type: "SELECTION/CONFIRM"; selectedCards: string[] }
  | { type: "SELECTION/SKIP" }
  | { type: "COST/CONFIRM"; selectedCards: string[] }
  | { type: "COST/CANCEL" }
  | { type: "DISCARD/CONFIRM"; discardCards: string[] }
  | { type: "TURN/TAG" }
  | { type: "HAND/CYCLE" }
  | { type: "SUBMIT_DRAFT"; player: PlayerId; cardIds: string[] }
  | { type: "ANIM/DONE" }
  | { type: "SURRENDER"; player: PlayerId }
  /** 턴 시간제약 만료 — 해당 플레이어의 대기 중 결정을 자동 처리 (패스/스킵/자동 버리기) */
  | { type: "TURN/TIMEOUT"; player: PlayerId };