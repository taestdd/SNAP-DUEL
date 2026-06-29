import type { Card, CardEffect, CardPlayability, CardZone, DeckInsertPosition, GameState, PendingSelection, PlayerId } from "./types";
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
  getBenchChar,
  updateCombatant,
  updateStatus,
} from "./stateHelpers";
import { shuffle } from "./rng";

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
    s = applySingleEffect(s, player, currentDef.exitEffect);
    if (s.phase === "GAME_OVER") return s;
    s = updateCombatant(s, player, { characterHp: { ...s[player].characterHp, [currentChar]: s[player].hp } });
  }

  // 2. 캐릭터 교체 — 새 캐릭터의 hp로 전환, airborne 초기화
  const newHp = s[player].characterHp[newChar];
  s = updateCombatant(s, player, { activeCharacter: newChar, hp: newHp, airborneStack: 0 });

  s = pushLog(s, `${player} tags out Char ${currentChar} → tags in Char ${newChar} (HP: ${newHp})`);

  // 3. 진입 효과
  if (newDef.entryEffect) {
    s = applySingleEffect(s, player, newDef.entryEffect);
    if (s.phase === "GAME_OVER") return s;
  }

  return s;
}

/* -------------------------- */
/* 단일 효과 적용              */
/* -------------------------- */

function applySingleEffect(state: GameState, player: PlayerId, effect: CardEffect): GameState {
  const target =
    effect.target === "self" ? player
    : effect.target === "enemy" ? opponentOf(player)
    : player;

  switch (effect.type) {
    case "damage": {
      const dt = effect.damageType;
      const targetStack = state[target].airborneStack;

      if (dt === "ground" && targetStack >= 1) {
        return pushLog(state, `Damage (ground) blocked — ${target} is airborne`);
      }
      if (dt === "anti-air" && targetStack === 0) {
        return pushLog(state, `Damage (anti-air) missed — ${target} is grounded`);
      }

      const amount = effect.value ?? 0;
      const bonus = state[player].status.attackBuff ?? 0;
      const total = amount + bonus;

      const next = dealDamage(state, target, total, dt ? `Damage(${dt})` : "Damage");
      return clearAttackBuff(next, player);
    }

    case "block": {
      const amount = effect.value ?? 0;
      return pushLog(
        updateCombatant(state, target, { block: state[target].block + amount }),
        `${target} gains ${amount} Block`,
      );
    }

    case "draw":
      return draw(state, target, effect.value ?? 0);

    case "heal": {
      const amount = effect.value ?? 0;
      const t = state[target];
      const newHp = t.hp + amount;
      return pushLog(
        updateCombatant(state, target, { hp: newHp, characterHp: { ...t.characterHp, [t.activeCharacter]: newHp } }),
        `${target} (Char ${t.activeCharacter}) heals ${amount}`,
      );
    }

    case "buff_attack": {
      const amount = effect.value ?? 0;
      return pushLog(
        updateStatus(state, target, { attackBuff: (state[target].status.attackBuff ?? 0) + amount }),
        `${target} gains ATK +${amount}`,
      );
    }

    case "tag":
      return applyTagSwitch(state, player);

    case "airborne": {
      const stack = effect.value ?? 0;
      const prevStack = state[target].airborneStack;
      return pushLog(
        updateCombatant(state, target, { airborneStack: stack }),
        `${target} airborne ${prevStack}→${stack}`,
      );
    }

    case "shuffle": {
      const zone = effect.zone ?? "deck";
      const arr = state[target][zone] as string[];
      if (arr.length === 0) return pushLog(state, `${target} shuffles ${zone} (empty)`);
      return pushLog(
        { ...state, [target]: { ...state[target], [zone]: shuffle([...arr]) } } as GameState,
        `${target} shuffles ${zone}`,
      );
    }

    case "generate": {
      const genCardId = effect.cardId;
      if (!genCardId) return state;
      const genCard = getCard(genCardId);
      if (!genCard) return pushLog(state, `generate: unknown card "${genCardId}"`);

      const count = effect.count ?? 1;
      const toZone = effect.toZone ?? "hand";
      const toPosition = effect.toPosition ?? "bottom";
      const generated = Array.from({ length: count }, () => genCardId);

      const targetArr = state[target][toZone] as string[];
      const newArr = insertCards(targetArr, generated, toZone, toPosition);

      let s = { ...state, [target]: { ...state[target], [toZone]: newArr } } as GameState;
      if (toZone === "deck") s = syncExhausted(s, target);
      return pushLog(s, `${target} generates ${count}x "${genCard.name}" → ${toZone}`);
    }

    default:
      return state;
  }
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

  const opponent = opponentOf(player);
  const hpBeforeAttack = s[opponent].hp;

  if (card.cardType === "attack") {
    const targetAirborne = s[opponent].airborneStack;
    const attackBuff = s[player].status.attackBuff ?? 0;
    const mods = evaluateModifiers(s, player, card.statModifiers);
    const groundAtk = Math.max(0, (card.groundAttack ?? 0) + (mods.ground_attack ?? 0));
    const antiAirAtk = Math.max(0, (card.antiAirAttack ?? 0) + (mods.anti_air_attack ?? 0));

    if (groundAtk > 0 && targetAirborne === 0) {
      s = dealDamage(s, opponent, Math.max(0, groundAtk + attackBuff), "Ground");
      s = clearAttackBuff(s, player);
      s = checkGameOver(s);
      if (s.phase === "GAME_OVER") return s;
    } else if (antiAirAtk > 0 && targetAirborne >= 1) {
      s = dealDamage(s, opponent, Math.max(0, antiAirAtk + attackBuff), "Anti-Air");
      s = clearAttackBuff(s, player);
      s = checkGameOver(s);
      if (s.phase === "GAME_OVER") return s;
    }
  }

  // 태그 효과 제외 공격 카드는 데미지가 1 이상 들어가야 추가 효과 발동
  const isTagAttack = card.cardType === "attack" && card.effects.some((e) => e.type === "tag");
  if (card.cardType === "attack" && !isTagAttack && s[opponent].hp >= hpBeforeAttack) {
    return pushLog(s, `${player}'s attack missed — bonus effects skipped`);
  }

  for (const effect of card.effects) {
    if (effect.type === "draw_tagged") {
      const tag = effect.tag;
      if (!tag) continue;
      const fromPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const zone: CardZone = effect.zone ?? "deck";
      const count = effect.value ?? 1;

      const pool = s[fromPlayerId][zone] as string[];
      const candidates = pool.filter((id) => getCard(id)?.tags?.includes(tag));

      if (player === "P1") {
        const pendingSelection: PendingSelection = {
          selectingPlayer: player,
          candidates: [...candidates],
          count,
          fromZone: zone,
          fromPlayerId,
          toZone: "hand",
          toPlayerId: player,
          toPosition: "bottom",
          sourcePlayer: player,
          sourceCardId: cardId,
          resolveItems,
          resolveNextIndex,
          unresolvedPlayers: currentUnresolved.filter((p) => p !== player),
        };
        return { ...s, phase: "WAITING_SELECTION", pendingSelection };
      }

      const autoSelected = candidates.slice(0, count);
      s = moveCardsBetweenZones(s, fromPlayerId, zone, player, "hand", autoSelected, "bottom");
      s = pushLog(s, `${player} draw_tagged [${tag}] ${autoSelected.length} card(s) from ${zone}`);
      continue;
    }

    if (effect.type === "move_cards") {
      const fromPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const toPlayerId: PlayerId = (effect.toTarget ?? effect.target) === "enemy" ? opponentOf(player) : player;
      const fromZone: CardZone = effect.fromZone ?? "trash";
      const toZone: CardZone = effect.toZone ?? "hand";
      const toPosition: DeckInsertPosition = effect.toPosition ?? "bottom";
      const count = effect.count ?? 1;

      const allCards = s[fromPlayerId][fromZone] as string[];
      const candidates = effect.tag
        ? allCards.filter((id) => getCard(id)?.tags?.includes(effect.tag!))
        : allCards;

      if (effect.userSelects) {
        const pendingSelection: PendingSelection = {
          selectingPlayer: player,
          candidates: [...candidates],
          count,
          fromZone,
          fromPlayerId,
          toZone,
          toPlayerId,
          toPosition,
          sourcePlayer: player,
          sourceCardId: cardId,
          resolveItems,
          resolveNextIndex,
          unresolvedPlayers: currentUnresolved.filter((p) => p !== player),
        };
        return { ...s, phase: "WAITING_SELECTION", pendingSelection };
      }

      const autoSelected = candidates.slice(0, count);
      if (autoSelected.length > 0) {
        s = moveCardsBetweenZones(s, fromPlayerId, fromZone, toPlayerId, toZone, autoSelected, toPosition);
        s = pushLog(s, `${player} moves ${autoSelected.length} card(s) from ${fromZone} to ${toZone}`);
      }
      continue;
    }

    s = applySingleEffect(s, player, effect);
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
