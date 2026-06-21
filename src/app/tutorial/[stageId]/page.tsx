"use client";

import { useEffect, useReducer, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { gameReducer } from "@/game/engine/reducer";
import { createTutorialState } from "@/game/tutorial/tutorialState";
import { TUTORIAL_STAGES } from "@/game/tutorial/tutorialStages";
import type { CharacterId } from "@/game/engine/types";
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
  const [isTagAnimating, setIsTagAnimating] = useState(false);

  const prevP1CharRef = useRef<CharacterId>(state.P1.activeCharacter);
  const prevAICharRef = useRef<CharacterId>(state.AI.activeCharacter);

  useEffect(() => {
    const p1Changed = state.P1.activeCharacter !== prevP1CharRef.current;
    const aiChanged = state.AI.activeCharacter !== prevAICharRef.current;
    prevP1CharRef.current = state.P1.activeCharacter;
    prevAICharRef.current = state.AI.activeCharacter;
    if (!p1Changed && !aiChanged) return;
    setIsTagAnimating(true);
    const t = setTimeout(() => setIsTagAnimating(false), 700);
    return () => clearTimeout(t);
  }, [state.P1.activeCharacter, state.AI.activeCharacter]);

  // TURN_START: always advance (tutorial skips hand-length check)
  useEffect(() => {
    if (state.phase !== "TURN_START") return;
    const t = setTimeout(() => dispatch({ type: "TURN/BEGIN" }), 100);
    return () => clearTimeout(t);
  }, [state.phase, state.turn]);

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
