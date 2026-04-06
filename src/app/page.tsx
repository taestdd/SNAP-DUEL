"use client";

import { useEffect, useReducer, useState } from "react";
import { gameReducer } from "@/game/engine/reducer";
import { createInitialState } from "@/game/engine/state";
import type { SetupConfig } from "@/game/engine/types";
import GameScreen from "@/components/game/GameScreen";
import SetupScreen from "@/components/game/SetupScreen";

function GameApp({ config }: { config: SetupConfig }) {
  const [state, dispatch] = useReducer(gameReducer, config, createInitialState);

  useEffect(() => {
    dispatch({ type: "GAME/INIT" });
  }, []);

  // StrictMode에서도 안전: TURN_START일 때만 시작
  useEffect(() => {
    if (state.phase === "TURN_START" && state.P1.hand.length > 0 && state.AI.hand.length > 0) {
      dispatch({ type: "TURN/BEGIN" });
    }
  }, [state.phase, state.P1.hand.length, state.AI.hand.length]);

  /**
   * SETUP 순서 강제:
   * - SETUP_INIT: initiative 플레이어가 먼저 선택
   * - SETUP_OTHER: 나머지 플레이어가 선택
   */
  useEffect(() => {
    if (state.phase === "SETUP_INIT" && state.initiative === "AI") {
      dispatch({ type: "AI/SETUP_AUTO" });
    } else if (state.phase === "SETUP_OTHER" && state.initiative === "P1") {
      dispatch({ type: "AI/SETUP_AUTO" });
    }
  }, [state.phase, state.initiative]);

  // RESOLVE 진입 시 처리
  useEffect(() => {
    if (state.phase === "RESOLVE") {
      dispatch({ type: "RESOLVE/STEP" });
    }
  }, [state.phase]);

  // 턴 종료 후 다음 턴 (게임 오버면 중지)
  useEffect(() => {
    if (state.phase !== "TURN_END") return;
    if (state.winner) return;

    const t = setTimeout(() => {
      dispatch({ type: "TURN/BEGIN" });
    }, 600);

    return () => clearTimeout(t);
  }, [state.phase, state.winner]);

  return <GameScreen state={state} dispatch={dispatch} />;
}

export default function Page() {
  const [config, setConfig] = useState<SetupConfig | null>(null);

  if (!config) {
    return <SetupScreen onConfirm={setConfig} />;
  }

  return <GameApp config={config} />;
}
