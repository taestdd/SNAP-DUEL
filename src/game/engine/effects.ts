import type { CardEffect, CardZone, DeckInsertPosition, GameState, PendingSelection, PlayerId } from "./types";
import { getCard } from "./cards";
import { CHARACTERS } from "./characters";
import {
  opponentOf,
  pushLog,
  dealDamage,
  draw,
  checkGameOver,
  filterCards,
  moveCardsBetweenZones,
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
  const newChar = (currentChar === "A" ? "B" : "A") as import("./types").CharacterId;

  const currentDef = CHARACTERS[currentChar];
  const newDef = CHARACTERS[newChar];

  // hp를 characterHp에 반영 (동기화)
  let s: GameState = {
    ...state,
    [player]: {
      ...me,
      characterHp: { ...me.characterHp, [currentChar]: me.hp },
    },
  } as GameState;

  // 1. 탈출 효과
  if (currentDef.exitEffect) {
    s = applySingleEffect(s, player, currentDef.exitEffect);
    if (s.phase === "GAME_OVER") return s;
    s = {
      ...s,
      [player]: {
        ...s[player],
        characterHp: { ...s[player].characterHp, [currentChar]: s[player].hp },
      },
    } as GameState;
  }

  // 2. 캐릭터 교체 — 새 캐릭터의 hp로 전환, airborne 초기화
  const newHp = s[player].characterHp[newChar];
  s = {
    ...s,
    [player]: {
      ...s[player],
      activeCharacter: newChar,
      hp: newHp,
      airborneStack: 0,
    },
  } as GameState;

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

      let next = dealDamage(state, target, total, dt ? `Damage(${dt})` : "Damage");
      next = {
        ...next,
        [player]: {
          ...next[player],
          status: { ...next[player].status, attackBuff: 0 },
        },
      } as GameState;
      return next;
    }

    case "block": {
      const amount = effect.value ?? 0;
      return pushLog(
        { ...state, [target]: { ...state[target], block: state[target].block + amount } } as GameState,
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
        {
          ...state,
          [target]: { ...t, hp: newHp, characterHp: { ...t.characterHp, [t.activeCharacter]: newHp } },
        } as GameState,
        `${target} (Char ${t.activeCharacter}) heals ${amount}`,
      );
    }

    case "buff_attack": {
      const amount = effect.value ?? 0;
      return pushLog(
        {
          ...state,
          [target]: {
            ...state[target],
            status: { ...state[target].status, attackBuff: (state[target].status.attackBuff ?? 0) + amount },
          },
        } as GameState,
        `${target} gains ATK +${amount}`,
      );
    }

    case "burn": {
      const amount = effect.value ?? 0;
      return pushLog(
        {
          ...state,
          [target]: {
            ...state[target],
            status: { ...state[target].status, burn: { turns: 2, dmgPerTurn: amount } },
          },
        } as GameState,
        `${target} is Burned (${amount}/turn)`,
      );
    }

    case "tag":
      return applyTagSwitch(state, player);

    case "airborne": {
      const stack = effect.value ?? 0;
      const prevStack = state[target].airborneStack;
      return pushLog(
        { ...state, [target]: { ...state[target], airborneStack: stack } } as GameState,
        `${target} airborne ${prevStack}→${stack}`,
      );
    }

    case "draw_tagged": {
      const tag = effect.tag;
      const count = effect.value ?? 1;
      const zone = effect.zone ?? "deck";
      if (!tag) return state;

      const me = state[target];
      const pool = zone === "cooldown" ? me.cooldown : me.deck;

      const matchedIndices: number[] = [];
      for (let i = 0; i < pool.length; i++) {
        const c = getCard(pool[i]);
        if (c?.tags?.includes(tag)) matchedIndices.push(i);
      }
      if (matchedIndices.length === 0) {
        return pushLog(state, `draw_tagged(${tag}): no matching cards in ${zone}`);
      }

      const toDraw = matchedIndices.slice(0, count);
      const newPool = pool.filter((_, i) => !toDraw.includes(i));
      const drawnIds = toDraw.map((i) => pool[i]);
      const newHand = [...me.hand, ...drawnIds].slice(0, 10);

      return pushLog(
        {
          ...state,
          [target]: {
            ...me,
            ...(zone === "cooldown" ? { cooldown: newPool } : { deck: newPool }),
            hand: newHand,
          },
        },
        `${target} draws ${drawnIds.length} tagged card(s) [${tag}] from ${zone}`,
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

  for (const effect of card.effects) {
    if (effect.type === "move_cards") {
      const fromPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const toPlayerId: PlayerId = effect.target === "enemy" ? opponentOf(player) : player;
      const fromZone: CardZone = effect.fromZone ?? "trash";
      const toZone: CardZone = effect.toZone ?? "hand";
      const toPosition: DeckInsertPosition = effect.toPosition ?? "bottom";
      const count = effect.count ?? 1;

      const candidates = filterCards(s[fromPlayerId][fromZone] as string[]);

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
        return { ...s, phase: "WAITING_SELECTION", pendingSelection } as GameState;
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

export function canUseCard(state: GameState, player: PlayerId, cardId: string): boolean {
  const card = getCard(cardId);
  if (!card) return false;

  if (card.tags && card.tags.length > 0) {
    const charAffinities = CHARACTERS[state[player].activeCharacter].affinities;
    if (!card.tags.every((t) => charAffinities.includes(t))) return false;
  }

  if (!card.useCondition) return true;
  const stack = state[player].airborneStack;
  if (card.useCondition === "ground") return stack === 0;
  if (card.useCondition === "airborne") return stack >= 1;
  return true;
}
