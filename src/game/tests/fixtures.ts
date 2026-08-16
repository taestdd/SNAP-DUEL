/**
 * 엔진 테스트용 픽스처 (Phase 0 스캐폴딩).
 *
 * - 합성 카드/캐릭터 레지스트리를 initCards/initCharacters로 주입한다.
 *   (엔진은 Firestore 데이터에 의존하므로, 테스트는 결정적 합성 데이터를 쓴다)
 * - makeState({...})로 원하는 상황의 GameState를 한 줄로 만든다.
 *
 * 프로덕션 코드는 일절 건드리지 않는다 — 전부 추가 전용.
 */
import type { Card, CharacterDef, Combatant, GameState, PlayerId } from "@/game/engine/types";
import { initCards } from "@/game/engine/cards";
import { initCharacters } from "@/game/engine/characters";

/* ── 합성 캐릭터 (id는 ^[a-z0-9_]+$ 만 허용) ─────────────────────────── */

const TEST_CHARACTERS: Record<string, CharacterDef> = {
  p1_main: { id: "p1_main", name: "P1 Main", maxHp: 30, spriteId: "test", entryEffect: null, exitEffect: null, affinities: [] },
  p1_sub:  { id: "p1_sub",  name: "P1 Sub",  maxHp: 30, spriteId: "test", entryEffect: null, exitEffect: null, affinities: [] },
  ai_main: { id: "ai_main", name: "AI Main", maxHp: 30, spriteId: "test", entryEffect: null, exitEffect: null, affinities: [] },
  ai_sub:  { id: "ai_sub",  name: "AI Sub",  maxHp: 30, spriteId: "test", entryEffect: null, exitEffect: null, affinities: [] },
};

/* ── 합성 카드 ──────────────────────────────────────────────────────────
 * 태그가 없어 어피니티 체크를 항상 통과한다.
 * attack: groundAttack/antiAirAttack로 직접 데미지 (적중 시 주도권/카운터/콤보 발동)
 * skill:  공격 스탯 없음. 적중해도 주도권/카운터 미발동
 */
const TEST_CARDS: Record<string, Card> = {
  // 기본 지상 공격
  jab:       { id: "jab",       name: "Jab",       cardType: "attack", cost: 0, delay: 2, groundAttack: 5, advantage: 0, effects: [], text: "" },
  // 빠른 지상 공격 (카운터용)
  quick_jab: { id: "quick_jab", name: "Quick Jab", cardType: "attack", cost: 0, delay: 1, groundAttack: 5, advantage: 0, effects: [], text: "" },
  // 느린 강공격
  heavy:     { id: "heavy",     name: "Heavy",     cardType: "attack", cost: 0, delay: 4, groundAttack: 8, advantage: 0, effects: [], text: "" },
  // 적중 시 다음 턴 딜레이 보너스(advantage)
  swift:     { id: "swift",     name: "Swift",     cardType: "attack", cost: 0, delay: 1, groundAttack: 4, advantage: 2, effects: [], text: "" },
  // 대공 전용
  uppercut:  { id: "uppercut",  name: "Uppercut",  cardType: "attack", cost: 0, delay: 3, groundAttack: 0, antiAirAttack: 6, advantage: 0, effects: [], text: "" },
  // 지상 타격 + 상대를 띄움
  launcher:  { id: "launcher",  name: "Launcher",  cardType: "attack", cost: 0, delay: 2, groundAttack: 3, advantage: 0, effects: [{ type: "airborne", target: "enemy", value: 1 }], text: "" },
  // 스킬: 방어 (주도권/카운터 미발동)
  guard:     { id: "guard",     name: "Guard",     cardType: "skill",  cost: 0, delay: 0, advantage: 0, effects: [{ type: "block", target: "self", value: 5 }], text: "" },
};

let installed = false;
/** 합성 데이터를 엔진 레지스트리에 주입한다 (멱등). */
export function installTestData(): void {
  if (installed) return;
  initCharacters(TEST_CHARACTERS);
  initCards(TEST_CARDS);
  installed = true;
}
// 이 모듈을 import하는 순간 데이터가 준비된다.
installTestData();

/* ── 상태 빌더 ──────────────────────────────────────────────────────────── */

type CombatantOverrides = Partial<Omit<Combatant, "id" | "status">> & {
  /** [활성, 벤치] 캐릭터 id */
  characters?: [string, string];
  status?: Partial<Combatant["status"]>;
};

function makeCombatant(id: PlayerId, o: CombatantOverrides = {}): Combatant {
  const chars = o.characters ?? (id === "P1" ? ["p1_main", "p1_sub"] : ["ai_main", "ai_sub"]);
  const active = o.activeCharacter ?? chars[0];
  const bench = chars.find((c) => c !== active) ?? chars[1];
  const hp = o.hp ?? 30;
  return {
    id,
    hp,
    block: o.block ?? 0,
    activeCharacter: active,
    characterHp: o.characterHp ?? { [active]: hp, [bench]: 30 },
    airborneStack: o.airborneStack ?? 0,
    status: { attackBuff: 0, delayAdvantage: 0, delayAdvantageNext: 0, exhausted: false, buffs: [], poisons: [], ...o.status },
    deck: o.deck ?? [],
    hand: o.hand ?? [],
    trash: o.trash ?? [],
    cooldown: o.cooldown ?? [],
    queue: o.queue ?? [],
    ready: o.ready ?? false,
  };
}

type StateOverrides = Partial<Omit<GameState, "P1" | "AI">> & {
  P1?: CombatantOverrides;
  AI?: CombatantOverrides;
};

/**
 * 테스트용 GameState를 만든다. 기본은 RESOLVE 페이즈, initiative P1, 양쪽 HP 30.
 * 필요한 필드만 override 하면 된다. 예: makeState({ P1: { queue: ["jab"] } })
 */
export function makeState(o: StateOverrides = {}): GameState {
  const { P1, AI, ...rest } = o;
  return {
    round: 1,
    turn: 1,
    phase: "RESOLVE",
    seed: 1,
    rng: 1,
    winner: null,
    initiative: "P1",
    P1: makeCombatant("P1", P1),
    AI: makeCombatant("AI", AI),
    selected: null,
    pendingCostPayment: null,
    pendingSelection: null,
    pendingDiscard: null,
    recentlyCounteredId: null,
    recentlyCounteredPlayer: null,
    log: [],
    p1TaggedThisTurn: false,
    aiTaggedThisTurn: false,
    resolveContext: { queue: [], index: 0, unresolved: [] },
    animScript: [],
    poisonTicks: [],
    animStartHp: null,
    animStartCombo: null,
    comboCount: 0,
    draftSelections: { P1: null, AI: null },
    turnLog: [],
    turnStartHands: null,
    ...rest,
  };
}

/** animScript에서 actor 순서만 뽑아내는 헬퍼 (해결 순서 검증용) */
export function resolveOrder(state: GameState): PlayerId[] {
  return state.animScript.map((e) => e.actor);
}
