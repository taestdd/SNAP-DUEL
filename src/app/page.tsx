"use client";

import { useEffect, useReducer, useState } from "react";
import { gameReducer } from "@/game/engine/reducer";
import { createInitialState } from "@/game/engine/state";
import type { SetupConfig } from "@/game/engine/types";
import GameScreen from "@/components/game/GameScreen";
import SetupScreen from "@/components/game/SetupScreen";

function GameApp({ config }: { config: SetupConfig }) {
  const [state, dispatch] = useReducer(gameReducer, config, createInitialState);
  const [isAiThinking, setIsAiThinking] = useState(false);

  useEffect(() => {
    dispatch({ type: "GAME/INIT" });
  }, []);

  // StrictMode에서도 안전: TURN_START일 때만 시작
  useEffect(() => {
    if (state.phase === "TURN_START" && state.P1.hand.length > 0 && state.AI.hand.length > 0) {
      dispatch({ type: "TURN/BEGIN" });
    }
  }, [state.phase, state.P1.hand.length, state.AI.hand.length]);

  // AI 카드 선택: 800ms 딜레이 + isAiThinking 표시
  useEffect(() => {
    const shouldAiAct =
      (state.phase === "SETUP_INIT" && state.initiative === "AI") ||
      (state.phase === "SETUP_OTHER" && state.initiative === "P1");

    if (!shouldAiAct) return;

    setIsAiThinking(true);
    const t = setTimeout(() => {
      setIsAiThinking(false);
      dispatch({ type: "AI/SETUP_AUTO" });
    }, 800);

    return () => clearTimeout(t);
  }, [state.phase, state.initiative]);

  // SETUP 완료 → RESOLVE 진입: 500ms 딜레이
  useEffect(() => {
    if (state.phase !== "RESOLVE") return;
    const t = setTimeout(() => {
      dispatch({ type: "RESOLVE/STEP" });
    }, 500);
    return () => clearTimeout(t);
  }, [state.phase]);

  // RESOLVING: 카드 한 장씩 600ms 딜레이
  useEffect(() => {
    if (state.phase !== "RESOLVING") return;
    const t = setTimeout(() => {
      dispatch({ type: "RESOLVE/STEP" });
    }, 600);
    return () => clearTimeout(t);
  }, [state.phase, state.resolveIndex]);

  // 턴 종료 후 다음 턴 (게임 오버면 중지)
  useEffect(() => {
    if (state.phase !== "TURN_END") return;
    if (state.winner) return;

    const t = setTimeout(() => {
      dispatch({ type: "TURN/BEGIN" });
    }, 600);

    return () => clearTimeout(t);
  }, [state.phase, state.winner]);

  return <GameScreen state={state} dispatch={dispatch} isAiThinking={isAiThinking} />;
}

export default function Page() {
  const [config, setConfig] = useState<SetupConfig | null>(null);

  if (!config) {
    return <SetupScreen onConfirm={setConfig} />;
  }

  return <GameApp config={config} />;
}
