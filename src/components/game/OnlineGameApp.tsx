"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import { gameReducer } from "@/game/engine/reducer";
import { createInitialState } from "@/game/engine/state";
import type { Action, CharacterId, GameState, PlayerId, SetupConfig } from "@/game/engine/types";
import GameScreen from "./GameScreen";
import { syncState, clearGuestAction, subscribeRoom } from "@/lib/roomService";
import type { RoomData } from "@/lib/roomService";
import { sendGuestAction } from "@/lib/roomService";

const TAG_ANIM_DURATION = 700;

// ── 게스트용 상태 뒤집기 ────────────────────────────────────────────────────
// 게스트는 AI 역할 → P1/AI를 교환해 게스트가 항상 P1처럼 보이도록 함

function flipId(id: PlayerId): PlayerId {
  return id === "P1" ? "AI" : "P1";
}

function flipState(state: GameState): GameState {
  return {
    ...state,
    P1: { ...state.AI, id: "P1" },
    AI: { ...state.P1, id: "AI" },
    initiative: flipId(state.initiative),
    winner:
      state.winner === "P1" ? "AI"
      : state.winner === "AI" ? "P1"
      : state.winner,
    draftSelections: {
      P1: state.draftSelections.AI,
      AI: state.draftSelections.P1,
    },
    pendingCostPayment: state.pendingCostPayment
      ? {
          ...state.pendingCostPayment,
          player: flipId(state.pendingCostPayment.player),
          fromPlayerId: flipId(state.pendingCostPayment.fromPlayerId),
          toPlayerId: flipId(state.pendingCostPayment.toPlayerId),
        }
      : null,
    pendingSelection: state.pendingSelection
      ? {
          ...state.pendingSelection,
          selectingPlayer: flipId(state.pendingSelection.selectingPlayer),
          fromPlayerId: flipId(state.pendingSelection.fromPlayerId),
          toPlayerId: flipId(state.pendingSelection.toPlayerId),
          sourcePlayer: flipId(state.pendingSelection.sourcePlayer),
          resolveItems: state.pendingSelection.resolveItems.map((item) => ({
            ...item,
            player: flipId(item.player),
          })),
          unresolvedPlayers: state.pendingSelection.unresolvedPlayers.map(flipId),
        }
      : null,
    resolveContext: {
      queue: state.resolveContext.queue.map((item) => ({ ...item, player: flipId(item.player) })),
      index: state.resolveContext.index,
      unresolved: state.resolveContext.unresolved.map(flipId),
    },
    animScript: state.animScript.map((entry) => ({
      ...entry,
      actor: flipId(entry.actor),
      cancelledPlayer: entry.cancelledPlayer ? flipId(entry.cancelledPlayer) : undefined,
      comboHolder: entry.comboHolder ? flipId(entry.comboHolder) : undefined,
    })),
    animStartCombo: state.animStartCombo
      ? { ...state.animStartCombo, holder: flipId(state.animStartCombo.holder) }
      : null,
    recentlyCancelledPlayer:
      state.recentlyCancelledPlayer ? flipId(state.recentlyCancelledPlayer) : null,
    p1TaggedThisTurn: false,
  };
}

// ── 호스트 게임 앱 ───────────────────────────────────────────────────────────

export function HostGameApp({
  config,
  roomCode,
  onExit,
}: {
  config: SetupConfig;
  roomCode: string;
  onExit: () => void;
}) {
  const [state, dispatch] = useReducer(gameReducer, config, createInitialState);
  const [isTagAnimating, setIsTagAnimating] = useState(false);
  const [waitingGuest, setWaitingGuest] = useState(false);

  const prevP1CharRef = useRef<CharacterId>(state.P1.activeCharacter);
  const prevAICharRef = useRef<CharacterId>(state.AI.activeCharacter);

  // 캐릭터 교체 감지
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

  // 상태 변경 시 Firestore 동기화
  useEffect(() => {
    syncState(roomCode, state).catch(console.error);
  }, [state, roomCode]);

  // TURN_START → TURN/BEGIN
  useEffect(() => {
    if (state.phase === "TURN_START" && state.P1.hand.length > 0 && state.AI.hand.length > 0) {
      dispatch({ type: "TURN/BEGIN" });
    }
  }, [state.phase, state.P1.hand.length, state.AI.hand.length]);

  // 게스트 액션 대기: AI 차례일 때 Firestore에서 guestAction 수신
  useEffect(() => {
    const isGuestTurn =
      (state.phase === "SETUP_INIT" && state.initiative === "AI") ||
      (state.phase === "SETUP_OTHER" && state.initiative === "P1");

    if (!isGuestTurn || isTagAnimating) {
      setWaitingGuest(false);
      return;
    }

    setWaitingGuest(true);
    const unsubscribe = subscribeRoom(roomCode, (data: RoomData) => {
      if (!data.guestAction) return;
      const action = data.guestAction;
      clearGuestAction(roomCode).catch(console.error);
      dispatch(action);
    });

    return () => {
      unsubscribe();
      setWaitingGuest(false);
    };
  }, [state.phase, state.initiative, isTagAnimating, roomCode]);

  // 드래프트: AI(게스트) 선택을 Firestore에서 수신
  useEffect(() => {
    if (state.phase !== "ROUND_DRAFT") return;
    if (state.draftSelections.AI !== null) return;

    const unsubscribe = subscribeRoom(roomCode, (data: RoomData) => {
      if (!data.guestAction) return;
      const action = data.guestAction;
      if (action.type !== "SUBMIT_DRAFT" || action.player !== "AI") return;
      clearGuestAction(roomCode).catch(console.error);
      dispatch(action);
    });

    return () => unsubscribe();
  }, [state.phase, state.draftSelections.AI, roomCode]);

  // RESOLVE 진입: 500ms 딜레이 후 모든 카드 즉시 처리
  useEffect(() => {
    if (state.phase !== "RESOLVE" || isTagAnimating) return;
    const t = setTimeout(() => dispatch({ type: "RESOLVE/STEP" }), 500);
    return () => clearTimeout(t);
  }, [state.phase, isTagAnimating]);

  // WAITING_SELECTION: AI 차례면 게스트 액션 대기
  useEffect(() => {
    if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return;
    if (state.pendingSelection.selectingPlayer !== "AI") return;

    const unsubscribe = subscribeRoom(roomCode, (data: RoomData) => {
      if (!data.guestAction) return;
      const action = data.guestAction;
      if (action.type !== "SELECTION/CONFIRM" && action.type !== "SELECTION/SKIP") return;
      clearGuestAction(roomCode).catch(console.error);
      dispatch(action);
    });

    return () => unsubscribe();
  }, [state.phase, state.pendingSelection, roomCode]);

  // 턴 종료
  useEffect(() => {
    if (state.phase !== "TURN_END" || state.winner) return;
    const t = setTimeout(() => dispatch({ type: "TURN/BEGIN" }), 600);
    return () => clearTimeout(t);
  }, [state.phase, state.winner]);

  return (
    <GameScreen
      state={state}
      dispatch={dispatch}
      isAiThinking={waitingGuest}
      isTagAnimating={isTagAnimating}
      disableAiDraft
      onExit={onExit}
    />
  );
}

// ── 게스트 게임 앱 ───────────────────────────────────────────────────────────

export function GuestGameApp({
  roomCode,
  onExit,
}: {
  roomCode: string;
  onExit: () => void;
}) {
  const [rawState, setRawState] = useState<GameState | null>(null);
  // 게스트 로컬: 뒤집힌 상태에서 선택한 카드 (아직 전송 전)
  const [localSelected, setLocalSelected] = useState<{ cardId: string; handIndex: number } | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRoom(roomCode, (data: RoomData) => {
      if (data.gameState) setRawState(data.gameState);
      if (data.status === "finished") onExit();
    });
    return () => unsubscribe();
  }, [roomCode, onExit]);

  // 게스트 상태: P1/AI 뒤집힌 버전 + 로컬 선택 반영
  const flippedState: GameState | null = rawState
    ? { ...flipState(rawState), selected: localSelected }
    : null;

  // 게스트가 보내는 턴 (원본 상태 기준 AI 차례)
  const isGuestTurn = rawState
    ? (rawState.phase === "SETUP_INIT" && rawState.initiative === "AI") ||
      (rawState.phase === "SETUP_OTHER" && rawState.initiative === "P1")
    : false;

  const guestDispatch = useCallback(
    (action: Action) => {
      switch (action.type) {
        // 카드 선택: 로컬에만 저장 (Firestore 전송 X)
        case "CARD/SELECT":
          setLocalSelected((prev) =>
            prev?.cardId === action.cardId && prev?.handIndex === action.handIndex
              ? null
              : { cardId: action.cardId, handIndex: action.handIndex }
          );
          return;

        // Ready: AI/GUEST_READY로 변환해 Firestore 전송
        case "PLAYER/READY": {
          const guestAction: Action = localSelected
            ? { type: "AI/GUEST_READY", cardId: localSelected.cardId, handIndex: localSelected.handIndex }
            : { type: "AI/GUEST_READY" };
          setLocalSelected(null);
          sendGuestAction(roomCode, guestAction).catch(console.error);
          return;
        }

        // 태그: AI/GUEST_TAG로 변환
        case "TURN/TAG":
          sendGuestAction(roomCode, { type: "AI/GUEST_TAG" }).catch(console.error);
          return;

        // 드래프트: player를 AI로 변환
        case "SUBMIT_DRAFT":
          sendGuestAction(roomCode, { type: "SUBMIT_DRAFT", player: "AI", cardIds: action.cardIds }).catch(console.error);
          return;

        // 카드 선택 확정/스킵: 그대로 전송
        case "SELECTION/CONFIRM":
        case "SELECTION/SKIP":
          sendGuestAction(roomCode, action).catch(console.error);
          return;

        default:
          return;
      }
    },
    [roomCode, localSelected]
  );

  if (!flippedState) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "#fff", fontSize: "1.2rem" }}>
        연결 중...
      </div>
    );
  }

  return (
    <GameScreen
      state={flippedState}
      dispatch={guestDispatch}
      isAiThinking={!isGuestTurn && (rawState?.phase === "SETUP_INIT" || rawState?.phase === "SETUP_OTHER")}
      disableAiDraft
      onExit={onExit}
    />
  );
}
