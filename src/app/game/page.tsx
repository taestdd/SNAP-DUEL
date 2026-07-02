"use client";

import { useEffect, useReducer, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { gameReducer } from "@/game/engine/reducer";
import { createInitialState } from "@/game/engine/state";
import type { CharacterId, SetupConfig } from "@/game/engine/types";
import GameScreen from "@/components/game/GameScreen";
import { useGameData } from "@/hooks/useGameData";
import { useFlowDriver } from "@/hooks/useFlowDriver";
import { decodeSetupParams } from "@/lib/setupConfig";

const TAG_ANIM_DURATION = 700;

function GameApp({ config, aiConfig, onExit }: { config: SetupConfig; aiConfig?: SetupConfig; onExit: () => void }) {
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => createInitialState(config, aiConfig)
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
    const t = setTimeout(() => setIsTagAnimating(false), TAG_ANIM_DURATION);
    return () => clearTimeout(t);
  }, [state.P1.activeCharacter, state.AI.activeCharacter]);

  // 페이즈 자동 전환 (TURN_START / RESOLVE / TURN_END) — 공용 훅
  useFlowDriver(state, dispatch, { paused: isTagAnimating });

  useEffect(() => {
    const shouldAiAct =
      (state.phase === "SETUP_INIT" && state.initiative === "AI") ||
      (state.phase === "SETUP_OTHER" && state.initiative === "P1");
    if (!shouldAiAct || isTagAnimating) return;
    setIsAiThinking(true);
    const t = setTimeout(() => {
      setIsAiThinking(false);
      dispatch({ type: "AI/SETUP_AUTO" });
    }, 800);
    return () => clearTimeout(t);
  }, [state.phase, state.initiative, isTagAnimating]);

  useEffect(() => {
    if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return;
    if (state.pendingSelection.selectingPlayer !== "AI") return;
    const { candidates, count } = state.pendingSelection;
    const autoSelected = candidates.slice(0, count);
    if (autoSelected.length > 0) dispatch({ type: "SELECTION/CONFIRM", selectedCards: autoSelected });
    else dispatch({ type: "SELECTION/SKIP" });
  }, [state.phase, state.pendingSelection]);

  return <GameScreen state={state} dispatch={dispatch} isAiThinking={isAiThinking} isTagAnimating={isTagAnimating} onExit={onExit} />;
}

function GamePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const dataStatus = useGameData();

  const { player, ai } = decodeSetupParams(params);

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

  return <GameApp config={player} aiConfig={ai ?? undefined} onExit={() => router.push("/")} />;
}

export default function Page() {
  return (
    <Suspense>
      <GamePageInner />
    </Suspense>
  );
}
