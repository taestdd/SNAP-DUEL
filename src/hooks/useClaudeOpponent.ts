"use client";

import { useEffect, useRef, useState } from "react";
import type { Action, GameState } from "@/game/engine/types";
import { selectCard, shouldTag, selectDraftCards, selectDiscards } from "@/game/engine/ai";
import { getCard } from "@/game/engine/cards";

/** 기보 다운로드용 — Claude가 내린 결정 하나의 요약 + 판단 근거 */
export type ClaudeDecisionEntry = {
  round: number;
  turn: number;
  kind: "setup" | "selection" | "draft" | "discard";
  /** 사람이 읽을 수 있는 결정 요약 (카드 이름 기준) */
  summary: string;
  /** Claude가 tool 응답에 남긴 이유. API 실패 등으로 로컬 규칙 폴백된 경우 null */
  reasoning: string | null;
};

function cardName(id: string): string {
  return getCard(id)?.name ?? id;
}

/**
 * "Claude 상대" 모드 — 4개 AI 결정 지점(SETUP/선택효과/드래프트/버리기)을
 * /api/ai/move에 위임한다. 로컬 규칙 AI(ai.ts 직접 호출) 대신 쓰이는 훅으로,
 * page.tsx의 로컬 효과들과 정확히 같은 트리거 조건 위에서 동작한다.
 *
 * 서버는 Claude 응답을 검증하고 실패 시 자체적으로 로컬 규칙 폴백을 반환하지만,
 * fetch 자체가 실패(네트워크 단절 등)하면 서버에 닿지도 못하므로 그 경우엔
 * 여기서도 같은 로컬 규칙으로 즉시 폴백한다 — API가 완전히 죽어도 게임이
 * 멈추지 않아야 한다.
 *
 * decisionLog는 GameState가 아니라 이 훅 안에서만 쌓인다 — 게임 결과에
 * 영향을 주지 않는 분석용 부가 데이터라 리듀서/온라인 동기화에 태울 이유가
 * 없다(Claude 상대는 싱글플레이 전용이라 flipState 미러링 대상도 아니다).
 */
export function useClaudeOpponent(
  state: GameState,
  dispatch: React.Dispatch<Action>,
  opts: { enabled: boolean; isTagAnimating: boolean },
): { thinking: boolean; decisionLog: ClaudeDecisionEntry[] } {
  const [thinking, setThinking] = useState(false);
  const [decisionLog, setDecisionLog] = useState<ClaudeDecisionEntry[]>([]);
  const activeCount = useRef(0);
  const setupKeyRef = useRef<string | null>(null);
  const selectionKeyRef = useRef<string | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  const discardKeyRef = useRef<string | null>(null);

  function begin() {
    activeCount.current += 1;
    setThinking(true);
  }
  function end() {
    activeCount.current = Math.max(0, activeCount.current - 1);
    if (activeCount.current === 0) setThinking(false);
  }

  function logDecision(entry: ClaudeDecisionEntry) {
    setDecisionLog((prev) => [...prev, entry]);
  }

  async function postMove<T>(body: object): Promise<T> {
    const res = await fetch("/api/ai/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ai/move ${res.status}`);
    return res.json();
  }

  const { enabled, isTagAnimating } = opts;

  // ── SETUP: 카드 선택 + 태그 ──────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const shouldAiAct =
      (state.phase === "SETUP_INIT" && state.initiative === "AI") ||
      (state.phase === "SETUP_OTHER" && state.initiative === "P1");
    if (!shouldAiAct || isTagAnimating) return;

    const key = `${state.round}:${state.turn}:${state.phase}`;
    if (setupKeyRef.current === key) return;
    setupKeyRef.current = key;

    let cancelled = false;
    begin();
    postMove<{ tag: boolean; play: { id: string; idx: number } | null; reasoning: string | null }>({ kind: "setup", state })
      .catch(() => ({ tag: shouldTag(state, "AI"), play: selectCard(state, "AI"), reasoning: null }))
      .then((decision) => {
        if (cancelled) return;
        dispatch({ type: "AI/SETUP_DECIDE", tag: decision.tag, play: decision.play });
        const cardPart = decision.play ? `${cardName(decision.play.id)} 사용` : "패스";
        logDecision({
          round: state.round, turn: state.turn, kind: "setup",
          summary: decision.tag ? `${cardPart} + 태그` : cardPart,
          reasoning: decision.reasoning,
        });
      })
      .finally(end);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state.phase, state.initiative, state.round, state.turn, isTagAnimating]);

  // ── WAITING_SELECTION: 카드 선택 효과 ────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return;
    if (state.pendingSelection.selectingPlayer !== "AI") return;

    const ps = state.pendingSelection;
    const key = `${ps.sourceCardId}:${ps.candidates.join(",")}:${ps.count}`;
    if (selectionKeyRef.current === key) return;
    selectionKeyRef.current = key;

    let cancelled = false;
    begin();
    postMove<{ selectedCards: string[]; reasoning: string | null }>({ kind: "selection", state })
      .catch(() => ({ selectedCards: ps.candidates.slice(0, ps.count), reasoning: null }))
      .then(({ selectedCards, reasoning }) => {
        if (cancelled) return;
        if (selectedCards.length > 0) dispatch({ type: "SELECTION/CONFIRM", selectedCards });
        else dispatch({ type: "SELECTION/SKIP" });
        logDecision({
          round: state.round, turn: state.turn, kind: "selection",
          summary: selectedCards.length > 0 ? `선택: ${selectedCards.map(cardName).join(", ")}` : "선택 안 함",
          reasoning,
        });
      })
      .finally(end);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state.phase, state.pendingSelection]);

  // ── ROUND_DRAFT ──────────────────────────────────────────────────────────
  const DRAFT_COUNT = 3;
  useEffect(() => {
    if (!enabled) return;
    if (state.phase !== "ROUND_DRAFT") return;
    if (state.draftSelections.AI !== null) return;

    const key = `${state.round}`;
    if (draftKeyRef.current === key) return;
    draftKeyRef.current = key;

    let cancelled = false;
    begin();
    postMove<{ cardIds: string[]; reasoning: string | null }>({ kind: "draft", state, count: DRAFT_COUNT })
      .catch(() => ({ cardIds: selectDraftCards(state, "AI", DRAFT_COUNT), reasoning: null }))
      .then(({ cardIds, reasoning }) => {
        if (cancelled) return;
        dispatch({ type: "SUBMIT_DRAFT", player: "AI", cardIds });
        logDecision({
          round: state.round, turn: state.turn, kind: "draft",
          summary: `드래프트: ${cardIds.map(cardName).join(", ")}`,
          reasoning,
        });
      })
      .finally(end);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state.phase, state.round, state.draftSelections.AI]);

  // ── WAITING_DISCARD: AI 자기 초과분 ──────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (state.phase !== "WAITING_DISCARD" || !state.pendingDiscard) return;
    if (state.pendingDiscard.player !== "AI") return;

    const pd = state.pendingDiscard;
    const key = `${state.round}:${state.turn}:${pd.candidates.join(",")}:${pd.count}`;
    if (discardKeyRef.current === key) return;
    discardKeyRef.current = key;

    let cancelled = false;
    begin();
    postMove<{ discardCards: string[]; reasoning: string | null }>({ kind: "discard", state })
      .catch(() => ({ discardCards: selectDiscards(state, "AI", pd.count), reasoning: null }))
      .then(({ discardCards, reasoning }) => {
        if (cancelled) return;
        dispatch({ type: "DISCARD/CONFIRM", discardCards });
        const names = discardCards.map((key) => cardName(key.split("::")[0]));
        logDecision({
          round: state.round, turn: state.turn, kind: "discard",
          summary: `버림: ${names.join(", ")}`,
          reasoning,
        });
      })
      .finally(end);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state.phase, state.pendingDiscard, state.round, state.turn]);

  return { thinking, decisionLog };
}
