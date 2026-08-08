/**
 * 순수 상태 조작 헬퍼 — 게임 규칙(rules.ts)에서 분리된 저수준 함수들
 * 이 파일의 함수는 서로만 의존하며 rules.ts를 import하지 않는다
 */

import type { CardZone, Combatant, DeckInsertPosition, GameState, PlayerId, StatModifier, StatTarget, Status } from "./types";
import { getCard } from "./cards";
import { shuffleSeeded, randomInt } from "./rng";
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

/**
 * 한 플레이어 Combatant의 정적 필드를 패치한 새 GameState를 반환한다.
 * 동적 키 `[player]` 스프레드로 인한 `as GameState` 캐스트를 이 한 곳에 가둔다.
 * (patch는 Partial<Combatant>이므로 호출부에서 필드 오타가 타입 검사됨)
 */
export function updateCombatant(state: GameState, player: PlayerId, patch: Partial<Combatant>): GameState {
  return { ...state, [player]: { ...state[player], ...patch } } as GameState;
}

/** 한 플레이어 status의 정적 필드를 패치한 새 GameState를 반환한다. */
export function updateStatus(state: GameState, player: PlayerId, patch: Partial<Status>): GameState {
  const me = state[player];
  return updateCombatant(state, player, { status: { ...me.status, ...patch } });
}

/**
 * SETUP 단계에서 지정한 플레이어가 카드를 선택할 차례인지 판정한다.
 * SETUP_INIT은 initiative 플레이어, SETUP_OTHER는 나머지 플레이어 차례.
 */
export function isSetupTurnOf(state: GameState, player: PlayerId): boolean {
  if (state.phase === "SETUP_INIT") return state.initiative === player;
  if (state.phase === "SETUP_OTHER") return state.initiative !== player;
  return false;
}

/**
 * 카드들을 대상 영역 배열에 위치 규칙에 맞게 삽입한 새 배열을 반환한다.
 * top/random은 덱에만 적용되며, 그 외에는 하단에 추가한다.
 * random 위치는 시드 rng를 소비하므로 [결과, 다음 rng]를 반환한다.
 */
export function insertCards(
  target: string[],
  cards: string[],
  toZone: CardZone,
  toPosition: DeckInsertPosition,
  rngState: number,
): [result: string[], next: number] {
  if (toZone === "deck" && toPosition === "top") {
    return [[...cards, ...target], rngState];
  }
  if (toZone === "deck" && toPosition === "random") {
    const result = [...target];
    let s = rngState;
    for (const id of cards) {
      let pos: number;
      [pos, s] = randomInt(s, result.length + 1);
      result.splice(pos, 0, id);
    }
    return [result, s];
  }
  return [[...target, ...cards], rngState];
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

  let s = updateStatus(state, player, { exhausted });

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

export function getEffectiveDelay(
  state: GameState,
  player: PlayerId,
  cardId: string
): number {
  const c = getCard(cardId);
  if (!c) return Number.MAX_SAFE_INTEGER;
  const bonus = state[player].status.delayAdvantage ?? 0;
  const modDelta = evaluateModifiers(state, player, c.statModifiers).delay ?? 0;
  return Math.max(0, c.delay - bonus + modDelta);
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

  const next = updateCombatant(state, target, {
    block: t.block - blocked,
    hp: newHp,
    characterHp: { ...t.characterHp, [t.activeCharacter]: newHp },
  });

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
    s = updateCombatant(s, player, { deck: me.deck.slice(1), hand: [...me.hand, top] });
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
  const [newTargetArr, nextRng] = insertCards(targetArr, cardIds, toZone, toPosition, s.rng);

  s = {
    ...s,
    rng: nextRng,
    [toPlayer]: { ...s[toPlayer], [toZone]: newTargetArr },
  } as GameState;

  if (fromZone === "deck") s = syncExhausted(s, fromPlayer);
  if (toZone === "deck") s = syncExhausted(s, toPlayer);

  return s;
}

export function clearAttackBuff(state: GameState, player: PlayerId): GameState {
  return updateStatus(state, player, { attackBuff: 0 });
}

/* ── 라운드/턴 전환 헬퍼 ─────────────────────────── */

export function areBothPlayersExhausted(state: GameState): boolean {
  return state.P1.status.exhausted && state.AI.status.exhausted;
}

export function moveHandToTrash(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.hand.length === 0) return state;
  return updateCombatant(state, player, { hand: [], trash: [...me.trash, ...me.hand] });
}

export function recycleTrashIntoDeck(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.trash.length === 0) return syncExhausted(state, player);

  const [deck, nextRng] = shuffleSeeded([...me.deck, ...me.trash], state.rng);
  const s = updateCombatant({ ...state, rng: nextRng }, player, { deck, trash: [] });
  return syncExhausted(s, player);
}

export function moveCooldownToTrash(state: GameState, player: PlayerId): GameState {
  const me = state[player];
  if (me.cooldown.length === 0) return state;
  return updateCombatant(state, player, { cooldown: [], trash: [...me.trash, ...me.cooldown] });
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

/* ── 공격 적중 판정 ─────────────────────────────── */

/**
 * 공격 카드의 "타격"이 성립했는지 판정한다. (이니셔티브/어드밴티지/카운터의 트리거)
 *
 * 적중은 **공격 스탯(groundAttack/antiAirAttack)이 체력을 깎았을 때만** 성립한다.
 * `attackConnected`는 applyAttackStats가 그 단계에서만 기록한 값이므로,
 * 뒤따르는 damage 효과의 체력 차감은 여기에 섞이지 않는다
 * (damage는 순수 체력 차감이라 적중 효과를 유발하지 못한다).
 *
 * - 태그 효과를 가진 공격 카드는 제외 (캐릭터 교체 목적)
 * - 블록에 전부 흡수되면 체력이 안 줄어 적중 아님
 */
export function didDirectAttackHit(
  state: GameState,
  player: PlayerId,
  cardId: string,
): boolean {
  const card = getCard(cardId);
  if (!card) return false;
  if (card.cardType !== "attack") return false;
  if (card.effects.some((e) => e.type === "tag")) return false;
  return state.attackConnected === true;
}
