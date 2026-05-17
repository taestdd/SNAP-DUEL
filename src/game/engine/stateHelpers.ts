/**
 * 순수 상태 조작 헬퍼 — 게임 규칙(rules.ts)에서 분리된 저수준 함수들
 * 이 파일의 함수는 서로만 의존하며 rules.ts를 import하지 않는다
 */

import type { CardZone, Combatant, DeckInsertPosition, GameState, PlayerId, StatModifier, StatTarget } from "./types";
import { getCard } from "./cards";
import { shuffle } from "./rng";
import { LOG_LIMIT, HAND_LIMIT } from "./constants";

export { LOG_LIMIT };

/* ── 공통 유틸 ──────────────────────────────────── */

/** 벤치(비활성) 캐릭터 ID를 반환한다. characterHp의 키에서 활성 캐릭터를 제외한 첫 번째. */
export function getBenchChar(combatant: Combatant): string {
  return Object.keys(combatant.characterHp).find((id) => id !== combatant.activeCharacter) ?? combatant.activeCharacter;
}

export function opponentOf(p: PlayerId): PlayerId {
  return p === "P1" ? "AI" : "P1";
}

export function pushLog(state: GameState, msg: string): GameState {
  return {
    ...state,
    log: [msg, ...state.log].slice(0, LOG_LIMIT),
  };
}

export function syncExhausted(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  const exhausted = me.deck.length === 0;

  if (me.status.exhausted === exhausted) return state;

  let s = {
    ...state,
    [player]: {
      ...me,
      status: { ...me.status, exhausted },
    },
  } as GameState;

  s = pushLog(
    s,
    exhausted ? `${player} is exhausted` : `${player} recovered from exhaustion`
  );
  return s;
}

export function evaluateModifiers(
  state: GameState,
  player: PlayerId,
  modifiers: StatModifier[] | undefined,
): Partial<Record<StatTarget, number>> {
  if (!modifiers || modifiers.length === 0) return {};
  const result: Partial<Record<StatTarget, number>> = {};

  for (const mod of modifiers) {
    const { condition, stat, delta } = mod;
    const condPlayer = condition.target === "enemy"
      ? (player === "P1" ? "AI" : "P1") as PlayerId
      : player;
    const condTarget = state[condPlayer];

    let checkVal: number;
    switch (condition.check) {
      case "hand_count":     checkVal = condTarget.hand.length; break;
      case "deck_count":     checkVal = condTarget.deck.length; break;
      case "cooldown_count": checkVal = condTarget.cooldown.length; break;
      case "hp":             checkVal = condTarget.hp; break;
      case "bench_hp": {
        checkVal = condTarget.characterHp[getBenchChar(condTarget)] ?? 0;
        break;
      }
      case "airborne_stack": checkVal = condTarget.airborneStack; break;
      case "turn":           checkVal = state.turn; break;
      case "round":          checkVal = state.round; break;
      default:               continue;
    }

    const met =
      condition.op === "<" ? checkVal < condition.value :
      condition.op === ">" ? checkVal > condition.value :
      condition.op === "=" ? checkVal === condition.value :
      false;

    if (met) {
      result[stat] = (result[stat] ?? 0) + delta;
    }
  }

  return result;
}

export function getEffectiveSpeed(
  state: GameState,
  player: PlayerId,
  cardId: string
): number {
  const c = getCard(cardId);
  if (!c) return Number.MAX_SAFE_INTEGER;
  const bonus = state[player].status.speedBonus ?? 0;
  const modDelta = evaluateModifiers(state, player, c.statModifiers).speed ?? 0;
  return Math.max(0, c.speed - bonus + modDelta);
}

export function moveQueuedCard(
  state: GameState,
  player: PlayerId,
  cardId: string,
  to: "cooldown" | "trash"
): GameState {
  const me = state[player];
  const nextQueue = [...me.queue];
  const idx = nextQueue.indexOf(cardId);
  if (idx >= 0) nextQueue.splice(idx, 1);

  return {
    ...state,
    [player]: {
      ...me,
      queue: nextQueue,
      [to]: [...me[to], cardId],
    },
  } as GameState;
}

/* ── 데미지 / 드로우 / 게임오버 ─────────────────── */

export function dealDamage(
  state: GameState,
  target: PlayerId,
  amount: number,
  label?: string
): GameState {
  const t = state[target];
  const blocked = Math.min(t.block, amount);
  const dmg = amount - blocked;
  const hpBefore = t.hp;
  const newHp = hpBefore - dmg;

  const next = {
    ...state,
    [target]: {
      ...t,
      block: t.block - blocked,
      hp: newHp,
      characterHp: { ...t.characterHp, [t.activeCharacter]: newHp },
    },
  } as GameState;

  const blockedStr = blocked > 0 ? `, ${blocked} blocked` : "";
  return pushLog(
    next,
    `${label ?? "Damage"} → ${target} (Char ${t.activeCharacter}) ${dmg}dmg [${hpBefore}→${newHp} HP]${blockedStr}`
  );
}

export function draw(state: GameState, player: PlayerId, n: number): GameState {
  let s = state;
  let drawnCount = 0;

  for (let i = 0; i < n; i++) {
    const me = s[player];
    if (me.deck.length === 0) {
      s = syncExhausted(s, player);
      break;
    }
    const top = me.deck[0];
    s = {
      ...s,
      [player]: {
        ...me,
        deck: me.deck.slice(1),
        hand: [...me.hand, top],
      },
    } as GameState;
    s = syncExhausted(s, player);
    drawnCount++;
  }

  if (drawnCount > 0) {
    s = pushLog(s, `${player} draws ${drawnCount} card(s)`);
  }
  return s;
}

export function checkGameOver(state: GameState): GameState {
  const p1Dead = Object.values(state.P1.characterHp).some((hp) => hp <= 0);
  const aiDead = Object.values(state.AI.characterHp).some((hp) => hp <= 0);

  if (p1Dead && aiDead) return { ...state, phase: "GAME_OVER", winner: "DRAW" };
  if (p1Dead) return { ...state, phase: "GAME_OVER", winner: "AI" };
  if (aiDead) return { ...state, phase: "GAME_OVER", winner: "P1" };
  return state;
}

export function decideWinnerByHp(state: GameState): GameState {
  const sum = (hp: Record<string, number>) => Object.values(hp).reduce((a, b) => a + b, 0);
  const p1Total = sum(state.P1.characterHp);
  const aiTotal = sum(state.AI.characterHp);

  if (p1Total > aiTotal) return { ...state, phase: "GAME_OVER", winner: "P1" };
  if (aiTotal > p1Total) return { ...state, phase: "GAME_OVER", winner: "AI" };
  return { ...state, phase: "GAME_OVER", winner: "DRAW" };
}

/* ── 존 조작 ────────────────────────────────────── */


export function moveCardsBetweenZones(
  state: GameState,
  fromPlayer: PlayerId,
  fromZone: CardZone,
  toPlayer: PlayerId,
  toZone: CardZone,
  cardIds: string[],
  toPosition: DeckInsertPosition = "bottom"
): GameState {
  if (cardIds.length === 0) return state;

  const sourceArr = state[fromPlayer][fromZone] as string[];
  const remaining = [...sourceArr];
  for (const id of cardIds) {
    const idx = remaining.indexOf(id);
    if (idx >= 0) remaining.splice(idx, 1);
  }

  let s: GameState = {
    ...state,
    [fromPlayer]: { ...state[fromPlayer], [fromZone]: remaining },
  } as GameState;

  const targetArr = s[toPlayer][toZone] as string[];
  let newTargetArr: string[];

  if (toZone === "deck" && toPosition === "top") {
    newTargetArr = [...cardIds, ...targetArr];
  } else if (toZone === "deck" && toPosition === "random") {
    newTargetArr = [...targetArr];
    for (const id of cardIds) {
      const pos = Math.floor(Math.random() * (newTargetArr.length + 1));
      newTargetArr.splice(pos, 0, id);
    }
  } else {
    newTargetArr = [...targetArr, ...cardIds];
  }

  s = {
    ...s,
    [toPlayer]: { ...s[toPlayer], [toZone]: newTargetArr },
  } as GameState;

  if (fromZone === "deck") s = syncExhausted(s, fromPlayer);
  if (toZone === "deck") s = syncExhausted(s, toPlayer);

  return s;
}

export function clearAttackBuff(state: GameState, player: PlayerId): GameState {
  return {
    ...state,
    [player]: { ...state[player], status: { ...state[player].status, attackBuff: 0 } },
  } as GameState;
}

/* ── 라운드/턴 전환 헬퍼 ─────────────────────────── */

export function areBothPlayersExhausted(state: GameState): boolean {
  return state.P1.status.exhausted && state.AI.status.exhausted;
}

export function moveHandToTrash(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.hand.length === 0) return state;
  return {
    ...state,
    [player]: { ...me, hand: [], trash: [...me.trash, ...me.hand] },
  } as GameState;
}

export function recycleTrashIntoDeck(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.trash.length === 0) return syncExhausted(state, player);

  let s = {
    ...state,
    [player]: { ...me, deck: shuffle([...me.deck, ...me.trash]), trash: [] },
  } as GameState;
  return syncExhausted(s, player);
}

export function moveCooldownToTrash(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.cooldown.length === 0) return state;
  return {
    ...state,
    [player]: { ...me, cooldown: [], trash: [...me.trash, ...me.cooldown] },
  } as GameState;
}

export function discardAIExcess(state: GameState): GameState {
  const excess = state.AI.hand.length - HAND_LIMIT;
  if (excess <= 0) return state;

  const newHand = state.AI.hand.slice(0, HAND_LIMIT);
  const discarded = state.AI.hand.slice(HAND_LIMIT);
  const s: GameState = {
    ...state,
    AI: { ...state.AI, hand: newHand, trash: [...state.AI.trash, ...discarded] },
  };
  return pushLog(s, `AI discards ${excess} card(s) to hand limit`);
}
