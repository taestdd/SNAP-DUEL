/**
 * 순수 상태 조작 헬퍼 — 게임 규칙(rules.ts)에서 분리된 저수준 함수들
 * 이 파일의 함수는 서로만 의존하며 rules.ts를 import하지 않는다
 */

import type { CardZone, DeckInsertPosition, GameState, PlayerId } from "./types";
import { getCard } from "./cards";
import { shuffle } from "./rng";
import { LOG_LIMIT, HAND_LIMIT } from "./constants";

export { LOG_LIMIT };

/* ── 공통 유틸 ──────────────────────────────────── */

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

export function getEffectiveSpeed(
  state: GameState,
  player: PlayerId,
  cardId: string
): number {
  const c = getCard(cardId);
  if (!c) return Number.MAX_SAFE_INTEGER;
  const bonus = state[player].status.speedBonus ?? 0;
  return Math.max(0, c.speed - bonus);
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
  const p1Dead = state.P1.characterHp.A <= 0 || state.P1.characterHp.B <= 0;
  const aiDead = state.AI.characterHp.A <= 0 || state.AI.characterHp.B <= 0;

  if (p1Dead && aiDead) return { ...state, phase: "GAME_OVER", winner: "DRAW" };
  if (p1Dead) return { ...state, phase: "GAME_OVER", winner: "AI" };
  if (aiDead) return { ...state, phase: "GAME_OVER", winner: "P1" };
  return state;
}

export function decideWinnerByHp(state: GameState): GameState {
  const p1Total = state.P1.characterHp.A + state.P1.characterHp.B;
  const aiTotal = state.AI.characterHp.A + state.AI.characterHp.B;

  if (p1Total > aiTotal) return { ...state, phase: "GAME_OVER", winner: "P1" };
  if (aiTotal > p1Total) return { ...state, phase: "GAME_OVER", winner: "AI" };
  return { ...state, phase: "GAME_OVER", winner: "DRAW" };
}

/* ── 존 조작 ────────────────────────────────────── */

/** 조건에 맞는 카드 필터 (현재는 전체 반환) */
export function filterCards(cards: string[]): string[] {
  return cards;
}

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
