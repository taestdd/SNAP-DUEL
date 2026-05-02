"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gameReducer } from "@/game/engine/reducer";
import { createInitialState } from "@/game/engine/state";
import type { CharacterId, SetupConfig } from "@/game/engine/types";
import GameScreen from "@/components/game/GameScreen";
import SetupScreen from "@/components/game/SetupScreen";

const TAG_ANIM_DURATION = 700;

function GameApp({ config, onExit }: { config: SetupConfig; onExit: () => void }) {
  const [state, dispatch] = useReducer(gameReducer, config, createInitialState);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isTagAnimating, setIsTagAnimating] = useState(false);

  const prevP1CharRef = useRef<CharacterId>(state.P1.activeCharacter);
  const prevAICharRef = useRef<CharacterId>(state.AI.activeCharacter);

  // 캐릭터 교체 감지 → 태그 애니메이션 잠금
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

  useEffect(() => {
    if (state.phase === "TURN_START" && state.P1.hand.length > 0 && state.AI.hand.length > 0) {
      dispatch({ type: "TURN/BEGIN" });
    }
  }, [state.phase, state.P1.hand.length, state.AI.hand.length]);

  // AI 카드 선택: 800ms 딜레이 + isAiThinking 표시 (태그 애니메이션 중 대기)
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

  // SETUP 완료 → RESOLVE 진입: 500ms 딜레이 (태그 애니메이션 중 대기)
  useEffect(() => {
    if (state.phase !== "RESOLVE" || isTagAnimating) return;
    const t = setTimeout(() => {
      dispatch({ type: "RESOLVE/STEP" });
    }, 500);
    return () => clearTimeout(t);
  }, [state.phase, isTagAnimating]);

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

  return <GameScreen state={state} dispatch={dispatch} isAiThinking={isAiThinking} isTagAnimating={isTagAnimating} onExit={onExit} />;
}

export default function Page() {
  const router = useRouter();
  const [config, setConfig] = useState<SetupConfig | null>(null);

  if (!config) {
    return <SetupScreen onConfirm={setConfig} />;
  }

  return <GameApp config={config} onExit={() => router.push("/")} />;
}
