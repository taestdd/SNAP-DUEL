"use client";

import { useCallback, useEffect, useReducer, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { gameReducer } from "@/game/engine/reducer";
import { createInitialState } from "@/game/engine/state";
import { selectDiscards } from "@/game/engine/ai";
import type { PlayerId, SetupConfig } from "@/game/engine/types";
import GameScreen from "@/components/game/GameScreen";
import { useGameData } from "@/hooks/useGameData";
import { useFlowDriver } from "@/hooks/useFlowDriver";
import { useTagAnimating } from "@/hooks/useTagAnimating";
import { useTurnTimer } from "@/hooks/useTurnTimer";
import { useClaudeOpponent } from "@/hooks/useClaudeOpponent";
import { decodeSetupParams, type OpponentType } from "@/lib/setupConfig";

function GameApp({ config, aiConfig, onExit, noTimeLimit = false, opponentType = "local" }: {
  config: SetupConfig;
  aiConfig?: SetupConfig;
  onExit: () => void;
  /** 시간제약 해제 — 카운트다운도 자동 패스도 없앤다 */
  noTimeLimit?: boolean;
  /** 상대 결정 주체 — "claude"면 4개 AI 결정 지점을 /api/ai/move에 위임 */
  opponentType?: OpponentType;
}) {
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => createInitialState(config, aiConfig)
  );
  const [localAiThinking, setLocalAiThinking] = useState(false);
  const isTagAnimating = useTagAnimating(state);
  const isClaude = opponentType === "claude";

  // 페이즈 자동 전환 (TURN_START / RESOLVE / TURN_END) — 공용 훅
  useFlowDriver(state, dispatch, { paused: isTagAnimating });

  // 턴 시간제약: P1의 결정 창만 강제 (AI는 즉시 행동).
  // noTimeLimit이면 훅이 창을 열지 않아 카운트다운·자동 패스가 모두 사라진다.
  const onTimeout = useCallback((player: PlayerId) => {
    dispatch({ type: "TURN/TIMEOUT", player });
  }, []);
  const { timedActor, remainingMs } = useTurnTimer(state, {
    role: "single",
    onTimeout,
    paused: isTagAnimating,
    enabled: !noTimeLimit,
  });

  // Claude 상대: 4개 결정 지점을 API에 위임 (로컬 규칙 효과들과 상호 배타적)
  const { thinking: claudeThinking } = useClaudeOpponent(state, dispatch, {
    enabled: isClaude,
    isTagAnimating,
  });

  // 로컬 규칙 AI: SETUP 카드+태그 선택
  useEffect(() => {
    if (isClaude) return;
    const shouldAiAct =
      (state.phase === "SETUP_INIT" && state.initiative === "AI") ||
      (state.phase === "SETUP_OTHER" && state.initiative === "P1");
    if (!shouldAiAct || isTagAnimating) return;
    setLocalAiThinking(true);
    const t = setTimeout(() => {
      setLocalAiThinking(false);
      dispatch({ type: "AI/SETUP_AUTO" });
    }, 800);
    return () => clearTimeout(t);
  }, [isClaude, state.phase, state.initiative, isTagAnimating]);

  // 로컬 규칙 AI: 카드 선택 효과
  useEffect(() => {
    if (isClaude) return;
    if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return;
    if (state.pendingSelection.selectingPlayer !== "AI") return;
    const { candidates, count } = state.pendingSelection;
    const autoSelected = candidates.slice(0, count);
    if (autoSelected.length > 0) dispatch({ type: "SELECTION/CONFIRM", selectedCards: autoSelected });
    else dispatch({ type: "SELECTION/SKIP" });
  }, [isClaude, state.phase, state.pendingSelection]);

  // 로컬 규칙 AI: 자기 초과분 버리기 (P1 것은 DiscardModal 대기)
  useEffect(() => {
    if (isClaude) return;
    if (state.phase !== "WAITING_DISCARD" || !state.pendingDiscard) return;
    if (state.pendingDiscard.player !== "AI") return;
    const discardCards = selectDiscards(state, "AI", state.pendingDiscard.count);
    dispatch({ type: "DISCARD/CONFIRM", discardCards });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClaude, state.phase, state.pendingDiscard]);

  // 싱글플레이는 P1 창만 표시 (AI는 즉시 행동하므로 타이머 무의미)
  const turnTimer =
    timedActor === "P1" && remainingMs !== null
      ? { remainingMs, isMyTimer: true }
      : null;

  return (
    <GameScreen
      state={state}
      dispatch={dispatch}
      isAiThinking={isClaude ? claudeThinking : localAiThinking}
      isTagAnimating={isTagAnimating}
      disableAiDraft={isClaude}
      onExit={onExit}
      turnTimer={turnTimer}
    />
  );
}

function GamePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const dataStatus = useGameData();

  const { player, ai, noTimeLimit, opponentType } = decodeSetupParams(params);

  if (dataStatus === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#888" }}>
        로딩 중...
      </div>
    );
  }

  if (dataStatus === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#f66" }}>
        데이터를 불러올 수 없습니다. 새로고침 해주세요.
      </div>
    );
  }

  if (!player) {
    router.replace("/");
    return null;
  }

  return (
    <GameApp
      config={player}
      aiConfig={ai ?? undefined}
      onExit={() => router.push("/")}
      noTimeLimit={noTimeLimit}
      opponentType={opponentType}
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <GamePageInner />
    </Suspense>
  );
}
