#!/usr/bin/env tsx
/**
 * AI vs AI 자동 대전 시뮬레이터
 * 실행: npx tsx scripts/simulate.ts [--games=N]
 */

import { createInitialState } from "../src/game/engine/state";
import { gameReducer } from "../src/game/engine/reducer";
import { selectCard, selectDraftCards, shouldTag } from "../src/game/engine/ai";
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

// ─── 카드 점수 기반 버리기 선택 ───────────────────────────────────────────────
// WAITING_DISCARD 시 손패에서 가장 가치 낮은 카드를 버린다.
// scoreCard는 ai.ts 내부 함수라 직접 접근 불가 → 대신 selectCard로 가장 좋은 카드를 역산.
function pickCardsToDiscard(state: GameState, hand: string[], count: number): string[] {
  // 간단히 앞에서 count장 버리기 (랜덤 덱이므로 큰 차이 없음)
  return hand.slice(0, count).map((id, i) => `${id}::${i}`);
}

// ─── 게임 통계 타입 ───────────────────────────────────────────────────────────

interface CardPlay {
  player: PlayerId;
  cardId: string;
  countered: boolean;
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
          state = gameReducer(state, {
            type: "SUBMIT_DRAFT",
            player: "P1",
            cardIds: selectDraftCards(state, "P1", DRAFT_COUNT),
          });
        }
        if (state.draftSelections.AI === null) {
          state = gameReducer(state, {
            type: "SUBMIT_DRAFT",
            player: "AI",
            cardIds: selectDraftCards(state, "AI", DRAFT_COUNT),
          });
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
          // P1: AI와 동일한 태그 판단 + 카드 선택
          if (shouldTag(state, "P1")) {
            state = gameReducer(state, { type: "TURN/TAG" });
          }
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
          // AI: reducer 내 AI/SETUP_AUTO (태그 판단 포함)
          state = gameReducer(state, { type: "AI/SETUP_AUTO" });
        }
        break;
      }

      case "RESOLVE": {
        state = gameReducer(state, { type: "RESOLVE/STEP" });
        break;
      }

      case "ANIMATING": {
        // animScript = 이번 턴 성공적으로 해결된 카드 목록
        for (const entry of state.animScript) {
          plays.push({ player: entry.actor, cardId: entry.cardId, countered: false });
        }
        // 카운터된 카드
        if (state.recentlyCounteredId && state.recentlyCounteredPlayer) {
          plays.push({
            player: state.recentlyCounteredPlayer,
            cardId: state.recentlyCounteredId,
            countered: true,
          });
        }
        state = gameReducer(state, { type: "ANIM/DONE" });
        break;
      }

      case "WAITING_SELECTION": {
        const ps = state.pendingSelection!;
        state = gameReducer(state, {
          type: "SELECTION/CONFIRM",
          selectedCards: ps.candidates.slice(0, ps.count),
        });
        break;
      }

      case "WAITING_DISCARD": {
        const pd = state.pendingDiscard!;
        state = gameReducer(state, {
          type: "DISCARD/CONFIRM",
          discardCards: pickCardsToDiscard(state, pd.candidates, pd.count),
        });
        break;
      }

      default:
        steps = MAX_STEPS;
    }
  }

  return { winner: state.winner ?? "DRAW", plays };
}

// ─── 통계 집계 ────────────────────────────────────────────────────────────────

interface CardStat {
  played: number;       // 플레이 횟수 (양쪽 합산)
  playedAndWon: number; // 플레이한 쪽이 게임을 이긴 횟수
  countered: number;    // 카운터된 횟수
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

  for (const { player, cardId, countered } of plays) {
    if (!stats[cardId]) stats[cardId] = { played: 0, playedAndWon: 0, countered: 0 };
    stats[cardId].played++;
    if (countered) {
      stats[cardId].countered++;
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
console.log(` 카드별 통계  (승기여율 내림차순)`);
console.log(`─────────────────────────────────────────────────────────`);
console.log(
  ` ${"카드".padEnd(16)} ${"사용수".padStart(6)} ${"승기여율".padStart(8)} ${"카운터률".padStart(7)} ${"사용/게임".padStart(9)}`
);
console.log(`─────────────────────────────────────────────────────────`);

const sortedCards = Object.entries(stats).sort((a, b) => {
  const wrA = a[1].played > 0 ? a[1].playedAndWon / a[1].played : 0;
  const wrB = b[1].played > 0 ? b[1].playedAndWon / b[1].played : 0;
  return wrB - wrA;
});

for (const [cardId, s] of sortedCards) {
  const winRate = s.played > 0 ? ((s.playedAndWon / s.played) * 100).toFixed(1) + "%" : "-";
  const counterRate = s.played > 0 ? ((s.countered / s.played) * 100).toFixed(1) + "%" : "-";
  const perGame = (s.played / GAMES).toFixed(2);
  console.log(
    ` ${cardId.padEnd(16)} ${String(s.played).padStart(6)} ${winRate.padStart(8)} ${counterRate.padStart(7)} ${perGame.padStart(9)}`
  );
}

console.log(`${"═".repeat(57)}`);
console.log();
console.log(` ※ 승기여율: 이 카드를 플레이한 쪽이 그 게임을 이긴 비율`);
console.log(` ※ 사용/게임: 게임당 평균 플레이 횟수 (양쪽 합산)`);
console.log();
