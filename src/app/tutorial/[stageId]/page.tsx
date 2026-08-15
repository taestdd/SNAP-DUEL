"use client";

import { useEffect, useReducer, useState, use } from "react";
import { useRouter } from "next/navigation";
import { gameReducer } from "@/game/engine/reducer";
import { createTutorialState } from "@/game/tutorial/tutorialState";
import { TUTORIAL_STAGES } from "@/game/tutorial/tutorialStages";
import { selectDraftCards, selectDiscards } from "@/game/engine/ai";
import { useTagAnimating } from "@/hooks/useTagAnimating";
import GameScreen from "@/components/game/GameScreen";
import TutorialOverlay from "@/components/tutorial/TutorialOverlay";

// 튜토리얼 상단 목표 바(.topBar) 높이만큼 게임 화면을 아래로 밀어 헤더 가림 방지
const TUTORIAL_TOPBAR_HEIGHT = 32;

function TutorialGame({
  stageId,
  onRetry,
  onExit,
}: {
  stageId: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  const router = useRouter();
  const stage = TUTORIAL_STAGES.find((s) => s.id === stageId)!;
  const stageIndex = TUTORIAL_STAGES.indexOf(stage);
  const nextStage = TUTORIAL_STAGES[stageIndex + 1] ?? null;

  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => createTutorialState(stage),
  );
  const [isAiThinking, setIsAiThinking] = useState(false);
  const isTagAnimating = useTagAnimating(state);

  // TURN_START: always advance (tutorial skips hand-length check)
  useEffect(() => {
    if (state.phase !== "TURN_START") return;
    const t = setTimeout(() => dispatch({ type: "TURN/BEGIN" }), 100);
    return () => clearTimeout(t);
  }, [state.phase, state.turn]);

  // ROUND_DRAFT: AI 자동 드래프트 (실제 대전 AI 룰)
  useEffect(() => {
    if (state.phase !== "ROUND_DRAFT") return;
    if (state.draftSelections.AI !== null) return;
    const pick = selectDraftCards(state, "AI", 3);
    const t = setTimeout(
      () => dispatch({ type: "SUBMIT_DRAFT", player: "AI", cardIds: pick }),
      300,
    );
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.draftSelections.AI]);

  // AI auto-play
  useEffect(() => {
    const shouldAiAct =
      (state.phase === "SETUP_INIT" && state.initiative === "AI") ||
      (state.phase === "SETUP_OTHER" && state.initiative === "P1");
    if (!shouldAiAct || isTagAnimating) return;
    setIsAiThinking(true);
    const t = setTimeout(() => {
      setIsAiThinking(false);
      dispatch({ type: "AI/SETUP_AUTO" });
    }, 600);
    return () => clearTimeout(t);
  }, [state.phase, state.initiative, isTagAnimating]);

  // RESOLVE auto-step
  useEffect(() => {
    if (state.phase !== "RESOLVE" || isTagAnimating) return;
    const t = setTimeout(() => dispatch({ type: "RESOLVE/STEP" }), 500);
    return () => clearTimeout(t);
  }, [state.phase, isTagAnimating]);

  // WAITING_SELECTION: AI auto-confirm
  useEffect(() => {
    if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return;
    if (state.pendingSelection.selectingPlayer !== "AI") return;
    const { candidates, count } = state.pendingSelection;
    const autoSelected = candidates.slice(0, count);
    if (autoSelected.length > 0) dispatch({ type: "SELECTION/CONFIRM", selectedCards: autoSelected });
    else dispatch({ type: "SELECTION/SKIP" });
  }, [state.phase, state.pendingSelection]);

  // WAITING_DISCARD: AI 자기 초과분은 즉시 자동 처리
  useEffect(() => {
    if (state.phase !== "WAITING_DISCARD" || !state.pendingDiscard) return;
    if (state.pendingDiscard.player !== "AI") return;
    const discardCards = selectDiscards(state, "AI", state.pendingDiscard.count);
    dispatch({ type: "DISCARD/CONFIRM", discardCards });
  }, [state.phase, state.pendingDiscard]);

  // TURN_END: advance to next turn
  useEffect(() => {
    if (state.phase !== "TURN_END" || state.winner) return;
    const t = setTimeout(() => dispatch({ type: "TURN/BEGIN" }), 600);
    return () => clearTimeout(t);
  }, [state.phase, state.winner]);

  function handleNextStage() {
    if (nextStage) router.push(`/tutorial/${nextStage.id}`);
  }

  return (
    <div style={{ position: "relative" }}>
      <GameScreen
        state={state}
        dispatch={dispatch}
        isAiThinking={isAiThinking}
        isTagAnimating={isTagAnimating}
        onExit={onExit}
        onRetry={onRetry}
        topInset={TUTORIAL_TOPBAR_HEIGHT}
      />
      <TutorialOverlay
        stage={stage}
        state={state}
        onRetry={onRetry}
        onNextStage={nextStage ? handleNextStage : null}
        onExit={onExit}
      />
    </div>
  );
}

export default function TutorialStagePage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = use(params);
  const router = useRouter();
  const [retryKey, setRetryKey] = useState(0);

  const stage = TUTORIAL_STAGES.find((s) => s.id === stageId);
  if (!stage) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#f66" }}>
        스테이지를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <TutorialGame
      key={retryKey}
      stageId={stageId}
      onRetry={() => setRetryKey((k) => k + 1)}
      onExit={() => router.push("/tutorial")}
    />
  );
}
