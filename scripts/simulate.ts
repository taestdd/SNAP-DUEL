#!/usr/bin/env tsx
/**
 * AI vs AI 자동 대전 시뮬레이터
 * 실행: npx tsx scripts/simulate.ts [--games=N]
 */

import { createInitialState } from "../src/game/engine/state";
import { gameReducer } from "../src/game/engine/reducer";
import { getCard } from "../src/game/engine/cards";
import { canUseCard } from "../src/game/engine/rules";
import type { GameState, PlayerId } from "../src/game/engine/types";

// ─── CLI args ────────────────────────────────────────────────────────────────

const GAMES = (() => {
  const eqArg = process.argv.find((a) => a.startsWith("--games="));
  if (eqArg) return parseInt(eqArg.split("=")[1]);
  const idx = process.argv.indexOf("--games");
  if (idx !== -1 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1]);
  return 500;
})();

const DRAFT_COUNT = 4;
const MAX_STEPS = 2000; // 게임당 안전 상한선

// ─── 카드 점수 계산 (플레이어 범용) ──────────────────────────────────────────

function effectiveDamage(cardId: string, oppAirborne: number): number {
  const card = getCard(cardId);
  if (!card) return 0;
  let total = 0;
  for (const e of card.effects) {
    if (e.type !== "damage") continue;
    if (e.damageType === "ground" && oppAirborne >= 1) continue;
    if (e.damageType === "anti-air" && oppAirborne === 0) continue;
    total += e.value ?? 0;
  }
  return total;
}

function scoreCardFor(state: GameState, cardId: string, player: PlayerId): number {
  const card = getCard(cardId);
  if (!card) return -Infinity;

  const me = state[player];
  const opp = state[player === "P1" ? "AI" : "P1"];
  let score = 0;

  const effDmg = effectiveDamage(cardId, opp.airborneStack);
  score += effDmg * 10;

  const effSpeed = Math.max(0, card.speed - (me.status.speedBonus ?? 0));
  score -= effSpeed * 1.5;
  score += (card.gain ?? 0) * 5;

  if (
    card.effects.some((e) => e.type === "airborne" && e.target === "enemy") &&
    opp.airborneStack === 0
  ) {
    score += 8;
  }

  const handAfter = me.hand.length - 1;
  for (const e of card.effects) {
    if (e.type !== "move_cards") continue;
    if (e.fromZone === "deck") score += Math.max(0, 4 - handAfter) * 3;
    else if (e.fromZone === "trash") score += Math.min(me.trash.length, e.count ?? 2) * 3;
  }

  const hpDiff = me.hp - opp.hp;
  if (hpDiff < -5 && effDmg > 0) score += 5;
  else if (hpDiff > 5) score += Math.max(0, 3 - effSpeed);

  return score;
}

function selectCard(state: GameState, player: PlayerId): { id: string; idx: number } | null {
  const me = state[player];
  const candidates = me.hand
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => {
      const card = getCard(id);
      return card && card.cost <= me.deck.length && canUseCard(state, player, id);
    });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => scoreCardFor(state, b.id, player) - scoreCardFor(state, a.id, player));
  return candidates[0];
}

function selectDraftCards(state: GameState, player: PlayerId, count: number): string[] {
  const me = state[player];
  const opp = state[player === "P1" ? "AI" : "P1"];
  const scored = me.deck.map((id) => {
    const card = getCard(id);
    if (!card) return { id, score: -Infinity };
    let score = 0;
    score += effectiveDamage(id, opp.airborneStack) * 10;
    score -= card.speed * 1.5;
    score += (card.gain ?? 0) * 5;
    if (card.effects.some((e) => e.type === "airborne" && e.target === "enemy")) score += 6;
    if (card.effects.some((e) => e.type === "move_cards")) score += 4;
    return { id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((x) => x.id);
}

// ─── 게임 통계 타입 ───────────────────────────────────────────────────────────

interface CardPlay {
  player: PlayerId;
  cardId: string;
  cancelled: boolean;
}

interface GameResult {
  winner: PlayerId | "DRAW";
  plays: CardPlay[];
}

// ─── 단일 게임 시뮬레이션 ─────────────────────────────────────────────────────

function simulateGame(): GameResult {
  let state = createInitialState(
    { characters: ["A", "B"], deckId: "PROTOTYPE" },
    { characters: ["A", "B"], deckId: "PROTOTYPE" }
  );

  const plays: CardPlay[] = [];
  let steps = 0;

  while (state.phase !== "GAME_OVER" && steps < MAX_STEPS) {
    steps++;

    switch (state.phase) {
      case "ROUND_DRAFT": {
        if (state.draftSelections.P1 === null) {
          const cards = selectDraftCards(state, "P1", DRAFT_COUNT);
          state = gameReducer(state, { type: "SUBMIT_DRAFT", player: "P1", cardIds: cards });
        }
        if (state.draftSelections.AI === null) {
          const cards = selectDraftCards(state, "AI", DRAFT_COUNT);
          state = gameReducer(state, { type: "SUBMIT_DRAFT", player: "AI", cardIds: cards });
        }
        break;
      }

      case "TURN_START":
      case "TURN_END": {
        state = gameReducer(state, { type: "TURN/BEGIN" });
        break;
      }

      case "SETUP_INIT":
      case "SETUP_OTHER": {
        const p1Turn =
          state.phase === "SETUP_INIT"
            ? state.initiative === "P1"
            : state.initiative !== "P1";

        if (p1Turn) {
          const pick = selectCard(state, "P1");
          if (pick) {
            state = gameReducer(state, {
              type: "CARD/SELECT",
              cardId: pick.id,
              handIndex: pick.idx,
            });
          }
          state = gameReducer(state, { type: "PLAYER/READY", player: "P1" });
        } else {
          state = gameReducer(state, { type: "AI/SETUP_AUTO" });
        }
        break;
      }

      case "RESOLVE": {
        state = gameReducer(state, { type: "RESOLVE/STEP" });
        break;
      }

      case "ANIMATING": {
        // animScript = 성공적으로 해결된 카드 목록
        for (const entry of state.animScript) {
          plays.push({ player: entry.actor, cardId: entry.cardId, cancelled: false });
        }
        // 캔슬된 카드
        if (state.recentlyCancelledId && state.recentlyCancelledPlayer) {
          plays.push({
            player: state.recentlyCancelledPlayer,
            cardId: state.recentlyCancelledId,
            cancelled: true,
          });
        }
        state = gameReducer(state, { type: "ANIM/DONE" });
        break;
      }

      case "WAITING_SELECTION": {
        const ps = state.pendingSelection!;
        const selected = ps.candidates.slice(0, ps.count);
        state = gameReducer(state, { type: "SELECTION/CONFIRM", selectedCards: selected });
        break;
      }

      case "WAITING_DISCARD": {
        const pd = state.pendingDiscard!;
        // 점수가 낮은 카드부터 버리기
        const scored = pd.candidates.map((id, idx) => ({
          key: `${id}::${idx}`,
          score: scoreCardFor(state, id, "P1"),
        }));
        scored.sort((a, b) => a.score - b.score);
        const toDiscard = scored.slice(0, pd.count).map((x) => x.key);
        state = gameReducer(state, { type: "DISCARD/CONFIRM", discardCards: toDiscard });
        break;
      }

      default:
        steps = MAX_STEPS; // 알 수 없는 페이즈 → 강제 종료
    }
  }

  return {
    winner: state.winner ?? "DRAW",
    plays,
  };
}

// ─── 통계 집계 ────────────────────────────────────────────────────────────────

interface CardStat {
  played: number;       // 플레이 횟수
  playedAndWon: number; // 플레이한 쪽이 게임을 이긴 횟수
  cancelled: number;    // 캔슬된 횟수
}

const stats: Record<string, CardStat> = {};
let p1Wins = 0;
let aiWins = 0;
let draws = 0;

console.log(`\n⚡  SNAP-DUEL 시뮬레이터 — ${GAMES}게임 실행 중...\n`);
const startTime = Date.now();

for (let i = 0; i < GAMES; i++) {
  if (GAMES >= 100 && (i + 1) % Math.floor(GAMES / 10) === 0) {
    process.stdout.write(`  ${Math.round(((i + 1) / GAMES) * 100)}%...\n`);
  }

  const { winner, plays } = simulateGame();

  if (winner === "P1") p1Wins++;
  else if (winner === "AI") aiWins++;
  else draws++;

  for (const { player, cardId, cancelled } of plays) {
    if (!stats[cardId]) stats[cardId] = { played: 0, playedAndWon: 0, cancelled: 0 };
    stats[cardId].played++;
    if (cancelled) {
      stats[cardId].cancelled++;
    } else if (winner === player) {
      stats[cardId].playedAndWon++;
    }
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

// ─── 결과 출력 ────────────────────────────────────────────────────────────────

console.log();
console.log(`${"═".repeat(57)}`);
console.log(` 게임 결과  (총 ${GAMES}게임, ${elapsed}초)`);
console.log(`${"═".repeat(57)}`);
console.log(` P1 승 : ${p1Wins.toString().padStart(5)}  (${((p1Wins / GAMES) * 100).toFixed(1)}%)`);
console.log(` AI 승 : ${aiWins.toString().padStart(5)}  (${((aiWins / GAMES) * 100).toFixed(1)}%)`);
console.log(` 무승부 : ${draws.toString().padStart(4)}  (${((draws / GAMES) * 100).toFixed(1)}%)`);
console.log();
console.log(` 카드별 통계  (승률 내림차순)`);
console.log(`─────────────────────────────────────────────────────────`);
console.log(
  ` ${"카드".padEnd(16)} ${"사용수".padStart(6)} ${"승기여율".padStart(8)} ${"캔슬률".padStart(7)} ${"사용/게임".padStart(9)}`
);
console.log(`─────────────────────────────────────────────────────────`);

const sortedCards = Object.entries(stats).sort((a, b) => {
  const wrA = a[1].played > 0 ? a[1].playedAndWon / a[1].played : 0;
  const wrB = b[1].played > 0 ? b[1].playedAndWon / b[1].played : 0;
  return wrB - wrA;
});

for (const [cardId, s] of sortedCards) {
  const winRate = s.played > 0 ? ((s.playedAndWon / s.played) * 100).toFixed(1) + "%" : "-";
  const cancelRate = s.played > 0 ? ((s.cancelled / s.played) * 100).toFixed(1) + "%" : "-";
  const perGame = (s.played / GAMES).toFixed(2);
  console.log(
    ` ${cardId.padEnd(16)} ${String(s.played).padStart(6)} ${winRate.padStart(8)} ${cancelRate.padStart(7)} ${perGame.padStart(9)}`
  );
}

console.log(`${"═".repeat(57)}`);
console.log();
console.log(` ※ 승기여율: 이 카드를 플레이한 쪽이 그 게임을 이긴 비율`);
console.log(` ※ 사용/게임: 게임당 평균 플레이 횟수 (양쪽 합산)`);
console.log();
