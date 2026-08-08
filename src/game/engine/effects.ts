import type { Card, CardEffect, CardPlayability, CardStats, CardZone, DeckInsertPosition, EffectType, GameState, PendingSelection, PlayerId } from "./types";
import { getCard } from "./cards";
import { CHARACTERS } from "./characters";
import {
  opponentOf,
  pushLog,
  dealDamage,
  draw,
  checkGameOver,

  moveCardsBetweenZones,
  insertCards,
  syncExhausted,
  clearAttackBuff,
  evaluateModifiers,
  getEffectiveDelay,
  getBenchChar,
  updateCombatant,
  updateStatus,
} from "./stateHelpers";
import { shuffleSeeded } from "./rng";

/* -------------------------- */
/* 태그 (캐릭터 교체)          */
/* -------------------------- */

/**
 * 태그 처리 순서:
 * 1. 현재 캐릭터 탈출 효과
 * 2. 캐릭터 교체
 * 3. 새 캐릭터 진입 효과
 */
export function applyTagSwitch(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  const currentChar = me.activeCharacter;
  const newChar = getBenchChar(me);

  const currentDef = CHARACTERS[currentChar];
  const newDef = CHARACTERS[newChar];

  // hp를 characterHp에 반영 (동기화)
  let s = updateCombatant(state, player, { characterHp: { ...me.characterHp, [currentChar]: me.hp } });

  // 1. 탈출 효과
  if (currentDef.exitEffect) {
    s = applyEffect(s, currentDef.exitEffect, tagEffectContext(player));
    if (s.phase === "GAME_OVER") return s;
    s = updateCombatant(s, player, { characterHp: { ...s[player].characterHp, [currentChar]: s[player].hp } });
  }

  // 2. 캐릭터 교체 — 새 캐릭터의 hp로 전환, airborne 초기화
  const newHp = s[player].characterHp[newChar];
  s = updateCombatant(s, player, { activeCharacter: newChar, hp: newHp, airborneStack: 0 });

  s = pushLog(s, `${player} tags out Char ${currentChar} → tags in Char ${newChar} (HP: ${newHp})`);

  // 3. 진입 효과
  if (newDef.entryEffect) {
    s = applyEffect(s, newDef.entryEffect, tagEffectContext(player));
    if (s.phase === "GAME_OVER") return s;
  }

  return s;
}

/* -------------------------- */
/* 효과 디스패치 (단일 레지스트리) */
/* -------------------------- */

/**
 * 효과 핸들러가 받는 실행 컨텍스트.
 * pauseable=false(캐릭터 진입/퇴장 효과 등)일 때 카드 선택형 효과(draw_tagged/move_cards)는
 * 무동작으로 보존한다 — 기존 applySingleEffect의 default(no-op) 동작과 동일.
 */
type EffectContext = {
  player: PlayerId;
  cardId: string;
  pauseable: boolean;
  resolveItems: { player: PlayerId; cardId: string }[];
  resolveNextIndex: number;
  unresolved: PlayerId[];
};

type EffectHandler = (state: GameState, effect: CardEffect, ctx: EffectContext) => GameState;

/** effect.target(self/enemy) → 실제 대상 플레이어. 미지정 시 self(사용자). */
function resolveTarget(effect: CardEffect, player: PlayerId): PlayerId {
  return effect.target === "self" ? player
    : effect.target === "enemy" ? opponentOf(player)
    : player;
}

/** 모든 효과 타입의 단일 처리 지점. 새 효과는 여기에만 한 줄 추가한다. */
const EFFECT_HANDLERS: Record<EffectType, EffectHandler> = {
  /**
   * damage 효과 — "순수 체력 차감". 공격(attack)과는 별개의 개념이다.
   *
   * 공격과 달리 의도적으로 다음을 **하지 않는다**:
   *  - attackBuff를 참조하지 않는다 (합산도, 소모도 없음) — 버프는 공격 전용
   *  - statModifiers 보정을 받지 않는다 (보정 대상 스탯은 공격력뿐)
   *  - 적중으로 취급되지 않는다 → 이니셔티브/어드밴티지/카운터를 유발하지 못한다
   *  - 핸드의 스탯 표시(deriveCardStats)에 집계되지 않는다
   *
   * 그 대가로 대상이 자유롭고(self/enemy), 스킬 카드에도 자연스럽게 실린다.
   * damageType은 버프가 아니라 이 효과 자체의 조준 조건(지상/대공)이다.
   */
  damage: (state, effect, ctx) => {
    const target = resolveTarget(effect, ctx.player);
    const dt = effect.damageType;
    const targetStack = state[target].airborneStack;

    if (dt === "ground" && targetStack >= 1) {
      return pushLog(state, `Damage (ground) blocked — ${target} is airborne`);
    }
    if (dt === "anti-air" && targetStack === 0) {
      return pushLog(state, `Damage (anti-air) missed — ${target} is grounded`);
    }

    return dealDamage(state, target, effect.value ?? 0, dt ? `Damage(${dt})` : "Damage");
  },

  block: (state, effect, ctx) => {
    const target = resolveTarget(effect, ctx.player);
    const amount = effect.value ?? 0;
    return pushLog(
      updateCombatant(state, target, { block: state[target].block + amount }),
      `${target} gains ${amount} Block`,
    );
  },

  draw: (state, effect, ctx) => draw(state, resolveTarget(effect, ctx.player), effect.value ?? 0),

  heal: (state, effect, ctx) => {
    const target = resolveTarget(effect, ctx.player);
    const amount = effect.value ?? 0;
    const t = state[target];
    const newHp = t.hp + amount;
    return pushLog(
      updateCombatant(state, target, { hp: newHp, characterHp: { ...t.characterHp, [t.activeCharacter]: newHp } }),
      `${target} (Char ${t.activeCharacter}) heals ${amount}`,
    );
  },

  buff_attack: (state, effect, ctx) => {
    const target = resolveTarget(effect, ctx.player);
    const amount = effect.value ?? 0;
    return pushLog(
      updateStatus(state, target, { attackBuff: (state[target].status.attackBuff ?? 0) + amount }),
      `${target} gains ATK +${amount}`,
    );
  },

  tag: (state, _effect, ctx) => applyTagSwitch(state, ctx.player),

  airborne: (state, effect, ctx) => {
    const target = resolveTarget(effect, ctx.player);
    const stack = effect.value ?? 0;
    const prevStack = state[target].airborneStack;
    return pushLog(
      updateCombatant(state, target, { airborneStack: stack }),
      `${target} airborne ${prevStack}→${stack}`,
    );
  },

  shuffle: (state, effect, ctx) => {
    const target = resolveTarget(effect, ctx.player);
    const zone = effect.zone ?? "deck";
    const arr = state[target][zone] as string[];
    if (arr.length === 0) return pushLog(state, `${target} shuffles ${zone} (empty)`);
    const [shuffled, nextRng] = shuffleSeeded([...arr], state.rng);
    return pushLog(
      { ...state, rng: nextRng, [target]: { ...state[target], [zone]: shuffled } } as GameState,
      `${target} shuffles ${zone}`,
    );
  },

  generate: (state, effect, ctx) => {
    const target = resolveTarget(effect, ctx.player);
    const genCardId = effect.cardId;
    if (!genCardId) return state;
    const genCard = getCard(genCardId);
    if (!genCard) return pushLog(state, `generate: unknown card "${genCardId}"`);

    const count = effect.count ?? 1;
    const toZone = effect.toZone ?? "hand";
    const toPosition = effect.toPosition ?? "bottom";
    const generated = Array.from({ length: count }, () => genCardId);

    const targetArr = state[target][toZone] as string[];
    const [newArr, nextRng] = insertCards(targetArr, generated, toZone, toPosition, state.rng);

    let s = { ...state, rng: nextRng, [target]: { ...state[target], [toZone]: newArr } } as GameState;
    if (toZone === "deck") s = syncExhausted(s, target);
    return pushLog(s, `${target} generates ${count}x "${genCard.name}" → ${toZone}`);
  },

  draw_tagged: (state, effect, ctx) => {
    // 진입/퇴장 효과 등 일시정지 불가 컨텍스트에서는 무동작 (기존 default no-op 보존)
    if (!ctx.pauseable) return state;
    const tag = effect.tag;
    if (!tag) return state;

    const { player } = ctx;
    const fromPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
    const zone: CardZone = effect.zone ?? "deck";
    const count = effect.value ?? 1;

    const pool = state[fromPlayerId][zone] as string[];
    const candidates = pool.filter((id) => getCard(id)?.tags?.includes(tag));

    if (player === "P1") {
      return { ...state, phase: "WAITING_SELECTION", pendingSelection: makePendingSelection(ctx, {
        candidates, count, fromZone: zone, fromPlayerId, toZone: "hand", toPlayerId: player, toPosition: "bottom",
      }) };
    }

    const autoSelected = candidates.slice(0, count);
    const moved = moveCardsBetweenZones(state, fromPlayerId, zone, player, "hand", autoSelected, "bottom");
    return pushLog(moved, `${player} draw_tagged [${tag}] ${autoSelected.length} card(s) from ${zone}`);
  },

  move_cards: (state, effect, ctx) => {
    // 진입/퇴장 효과 등 일시정지 불가 컨텍스트에서는 무동작 (기존 default no-op 보존)
    if (!ctx.pauseable) return state;

    const { player } = ctx;
    const fromPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
    const toPlayerId: PlayerId = (effect.toTarget ?? effect.target) === "enemy" ? opponentOf(player) : player;
    const fromZone: CardZone = effect.fromZone ?? "trash";
    const toZone: CardZone = effect.toZone ?? "hand";
    const toPosition: DeckInsertPosition = effect.toPosition ?? "bottom";
    const count = effect.count ?? 1;

    const allCards = state[fromPlayerId][fromZone] as string[];
    const candidates = effect.tag
      ? allCards.filter((id) => getCard(id)?.tags?.includes(effect.tag!))
      : allCards;

    if (effect.userSelects) {
      return { ...state, phase: "WAITING_SELECTION", pendingSelection: makePendingSelection(ctx, {
        candidates, count, fromZone, fromPlayerId, toZone, toPlayerId, toPosition,
      }) };
    }

    const autoSelected = candidates.slice(0, count);
    if (autoSelected.length === 0) return state;
    const moved = moveCardsBetweenZones(state, fromPlayerId, fromZone, toPlayerId, toZone, autoSelected, toPosition);
    return pushLog(moved, `${player} moves ${autoSelected.length} card(s) from ${fromZone} to ${toZone}`);
  },
};

/** WAITING_SELECTION 진입 시 PendingSelection 구성 — draw_tagged/move_cards 공통. */
function makePendingSelection(
  ctx: EffectContext,
  sel: {
    candidates: string[];
    count: number;
    fromZone: CardZone;
    fromPlayerId: PlayerId;
    toZone: CardZone;
    toPlayerId: PlayerId;
    toPosition: DeckInsertPosition;
  },
): PendingSelection {
  return {
    selectingPlayer: ctx.player,
    candidates: [...sel.candidates],
    count: sel.count,
    fromZone: sel.fromZone,
    fromPlayerId: sel.fromPlayerId,
    toZone: sel.toZone,
    toPlayerId: sel.toPlayerId,
    toPosition: sel.toPosition,
    sourcePlayer: ctx.player,
    sourceCardId: ctx.cardId,
    resolveItems: ctx.resolveItems,
    resolveNextIndex: ctx.resolveNextIndex,
    unresolvedPlayers: ctx.unresolved.filter((p) => p !== ctx.player),
  };
}

/** 단일 효과를 레지스트리로 디스패치. */
function applyEffect(state: GameState, effect: CardEffect, ctx: EffectContext): GameState {
  const handler = EFFECT_HANDLERS[effect.type];
  return handler ? handler(state, effect, ctx) : state;
}

/** 캐릭터 진입/퇴장 효과용 컨텍스트 (카드 선택형 효과는 pauseable=false로 무동작). */
function tagEffectContext(player: PlayerId): EffectContext {
  return { player, cardId: "", pauseable: false, resolveItems: [], resolveNextIndex: 0, unresolved: [player] };
}

/* -------------------------- */
/* 공격 스탯 데미지            */
/* -------------------------- */

/**
 * 공격(attack) 스탯 데미지 — damage 효과와 구분되는 "타격" 개념.
 *
 * damage 효과와 달리 다음을 모두 수행한다:
 *  - statModifiers의 ground_attack / anti_air_attack 보정을 반영
 *  - attackBuff를 합산한 뒤 소모(clearAttackBuff)
 *  - 연결되면 적중으로 취급 → 이니셔티브/어드밴티지/카운터의 트리거가 된다
 *  - 핸드 표시(deriveCardStats)와 같은 식(base + mods + attackBuff)을 사용
 *
 * 지상/대공 선택은 카드가 고르는 게 아니라 **대상의 체공 상태**가 결정한다.
 *
 * 결과를 두 단계로 구분해 돌려준다 — 규칙과 연출이 서로 다른 기준을 쓰기 때문:
 * @returns landed    — 스윙이 대상에 닿았는지 (체공 조건 통과 + 실효 공격력 > 0).
 *                      블록에 전부 막혀도 true. → 연출용(가드 임팩트·거리 전이)
 * @returns connected — 실제로 체력을 깎았는지(=적중). 블록에 전부 흡수되면 false.
 *                      → 규칙용(카운터·주도권·어드밴티지·콤보·피격 포즈)
 */
function applyAttackStats(
  state: GameState,
  player: PlayerId,
  card: Card,
): { state: GameState; landed: boolean; connected: boolean } {
  if (card.cardType !== "attack") return { state, landed: false, connected: false };

  const opponent = opponentOf(player);
  const targetAirborne = state[opponent].airborneStack;
  const attackBuff = state[player].status.attackBuff ?? 0;
  const mods = evaluateModifiers(state, player, card.statModifiers);
  const groundAtk = Math.max(0, (card.groundAttack ?? 0) + (mods.ground_attack ?? 0));
  const antiAirAtk = Math.max(0, (card.antiAirAttack ?? 0) + (mods.anti_air_attack ?? 0));

  const swing =
    groundAtk > 0 && targetAirborne === 0 ? { amount: groundAtk, label: "Ground" }
    : antiAirAtk > 0 && targetAirborne >= 1 ? { amount: antiAirAtk, label: "Anti-Air" }
    : null;

  if (!swing) return { state, landed: false, connected: false };

  const hpBefore = state[opponent].hp;
  let s = dealDamage(state, opponent, Math.max(0, swing.amount + attackBuff), swing.label);
  s = clearAttackBuff(s, player);

  // 스윙은 닿았다(landed). 다만 블록에 전부 흡수되면 체력이 그대로 → 적중은 아님
  return { state: s, landed: true, connected: s[opponent].hp < hpBefore };
}

/* -------------------------- */
/* 카드 효과 순차 적용          */
/* -------------------------- */

/**
 * 카드 효과를 순서대로 적용하되, move_cards+userSelects 효과를 만나면
 * WAITING_SELECTION 페이즈로 전환하고 resolve 컨텍스트를 저장한다.
 * AI가 사용하는 경우에는 자동으로 첫 번째 후보를 선택한다.
 */
export function applyCardEffectsWithPause(
  state: GameState,
  player: PlayerId,
  cardId: string,
  resolveItems: { player: PlayerId; cardId: string }[],
  resolveNextIndex: number,
  currentUnresolved: PlayerId[],
): GameState {
  const card = getCard(cardId);
  if (!card) return state;

  let s = pushLog(state, `${player} resolves "${card.name}"`);

  // 1) 공격 스탯 타격 — 적중 여부를 상태에 기록한다.
  //    적중은 오직 이 단계로만 성립하며, 뒤따르는 damage 효과의 체력 차감은
  //    적중으로 취급되지 않는다 (resolve의 이니셔티브/어드밴티지/카운터 판정 입력).
  const attack = applyAttackStats(s, player, card);
  s = { ...attack.state, attackLanded: attack.landed, attackConnected: attack.connected };

  if (attack.connected) {
    s = checkGameOver(s);
    if (s.phase === "GAME_OVER") return s;
  }

  // 2) 태그 효과 제외 공격 카드는 타격이 성립해야 추가 효과가 발동한다.
  const isTagAttack = card.cardType === "attack" && card.effects.some((e) => e.type === "tag");
  if (card.cardType === "attack" && !isTagAttack && !attack.connected) {
    return pushLog(s, `${player}'s attack missed — bonus effects skipped`);
  }

  const ctx: EffectContext = {
    player,
    cardId,
    pauseable: true,
    resolveItems,
    resolveNextIndex,
    unresolved: currentUnresolved,
  };

  for (const effect of card.effects) {
    s = applyEffect(s, effect, ctx);
    if (s.phase === "WAITING_SELECTION") return s;
    s = checkGameOver(s);
    if (s.phase === "GAME_OVER") return s;
  }

  return s;
}

/* -------------------------- */
/* 카드 사용 조건 체크          */
/* -------------------------- */

/** statModifiers 보정을 반영한 카드의 실효 코스트. */
export function getEffectiveCost(state: GameState, player: PlayerId, card: Card): number {
  const mods = evaluateModifiers(state, player, card.statModifiers);
  return Math.max(0, card.cost + (mods.cost ?? 0));
}

/**
 * 카드의 실효 스탯을 한 번에 계산하는 표시·미리보기용 단일 진실원.
 * statModifiers(조건부 보정) + status 버프(delayAdvantage/attackBuff)를 모두 합산하며,
 * 공격력은 전투 해결(applyCardEffectsWithPause)과 동일한 식(base + mods + attackBuff)을 쓴다.
 */
export function deriveCardStats(state: GameState, player: PlayerId, cardId: string): CardStats {
  const card = getCard(cardId);
  if (!card) return { cost: 0, delay: 0, groundAttack: 0, antiAirAttack: 0, advantage: 0 };

  const mods = evaluateModifiers(state, player, card.statModifiers);
  const attackBuff = state[player].status.attackBuff ?? 0;

  return {
    cost: getEffectiveCost(state, player, card),
    delay: getEffectiveDelay(state, player, cardId),
    groundAttack: Math.max(0, (card.groundAttack ?? 0) + (mods.ground_attack ?? 0) + attackBuff),
    antiAirAttack: Math.max(0, (card.antiAirAttack ?? 0) + (mods.anti_air_attack ?? 0) + attackBuff),
    advantage: Math.max(0, (card.advantage ?? 0) + (mods.advantage ?? 0)),
  };
}

/**
 * 카드 사용 가능 판정의 단일 진실원(Single Source of Truth).
 * UI(Hand)·AI(selectCard)·집행(queueCard)이 모두 이 함수에서 파생한다.
 * 개별 플래그를 노출해 UI가 코스트 부족과 조건 차단을 구분 표시할 수 있다.
 */
export function getCardPlayability(state: GameState, player: PlayerId, cardId: string): CardPlayability {
  const card = getCard(cardId);
  if (!card) {
    return { playable: false, effectiveCost: 0, costOk: false, conditionMet: false, affinityMet: false, altCostOk: false };
  }
  const me = state[player];

  // 코스트 (statModifiers 보정 반영)
  const effectiveCost = getEffectiveCost(state, player, card);
  const costOk = effectiveCost <= me.deck.length;

  // 어피니티: 카드 태그가 모두 캐릭터 어피니티에 포함되어야 함
  let affinityMet = true;
  if (card.tags && card.tags.length > 0) {
    const charAffinities = CHARACTERS[me.activeCharacter].affinities;
    affinityMet = card.tags.every((t) => charAffinities.includes(t));
  }

  // altCost: HP 또는 덱/묘지 카드 지불 가능 여부
  let altCostOk = true;
  if (card.altCost) {
    const cost = card.altCost;
    if (cost.type === "hp") {
      altCostOk = me.hp > cost.amount;
    } else {
      const fromPlayerId: PlayerId = cost.target === "enemy" ? opponentOf(player) : player;
      const pool = (state[fromPlayerId][cost.fromZone] as string[])
        .filter(id => id !== cardId)
        .filter(id => !cost.tag || getCard(id)?.tags?.includes(cost.tag));
      altCostOk = pool.length >= cost.count;
    }
  }

  // useCondition: ground/airborne 충족 여부
  let conditionMet = true;
  if (card.useCondition === "ground") conditionMet = me.airborneStack === 0;
  else if (card.useCondition === "airborne") conditionMet = me.airborneStack >= 1;

  const playable = costOk && affinityMet && altCostOk && conditionMet;
  return { playable, effectiveCost, costOk, conditionMet, affinityMet, altCostOk };
}

/**
 * 덱 코스트를 제외한 규칙 자격(어피니티·altCost·useCondition)만 검사한다.
 * 코스트 지불은 queueCard가 별도로 처리하므로 기존 동작을 유지한다.
 */
export function canUseCard(state: GameState, player: PlayerId, cardId: string): boolean {
  const p = getCardPlayability(state, player, cardId);
  return p.affinityMet && p.altCostOk && p.conditionMet;
}

/** 코스트까지 포함해 실제로 사용 가능한지. */
export function canPlayCard(state: GameState, player: PlayerId, cardId: string): boolean {
  return getCardPlayability(state, player, cardId).playable;
}

/** 핸드에서 실제 사용 가능한 카드 목록을 인덱스와 함께 반환. */
export function getPlayableCards(state: GameState, player: PlayerId): { id: string; idx: number }[] {
  return state[player].hand
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => canPlayCard(state, player, id));
}
