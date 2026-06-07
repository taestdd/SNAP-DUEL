"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import { gameReducer } from "@/game/engine/reducer";
import { createInitialState } from "@/game/engine/state";
import type { Action, CharacterId, GameState, PlayerId, SetupConfig } from "@/game/engine/types";
import GameScreen from "./GameScreen";
import {
  syncState,
  clearGuestAction,
  clearHostAction,
  sendHostAction,
  sendGuestAction,
  subscribeRoom,
  pushDebugLog,
} from "@/lib/roomService";
import type { RoomData } from "@/lib/roomService";

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

// ── 게스트 로컬 리듀서 ────────────────────────────────────────────────────────
// SYNC/OVERRIDE: 호스트가 보내온 정규 상태로 강제 교체 (매 턴 SETUP_INIT)

type LocalAction = Action | { type: "SYNC/OVERRIDE"; state: GameState };

function guestLocalReducer(
  state: GameState | null,
  action: LocalAction,
): GameState | null {
  if (action.type === "SYNC/OVERRIDE") return action.state;
  if (!state) return null;
  return gameReducer(state, action as Action);
}

// ── 호스트 게임 앱 ───────────────────────────────────────────────────────────

export function HostGameApp({
  config,
  guestConfig,
  roomCode,
  onExit,
}: {
  config: SetupConfig;
  guestConfig: SetupConfig;
  roomCode: string;
  onExit: () => void;
}) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState(config, guestConfig));
  const [isTagAnimating, setIsTagAnimating] = useState(false);
  const [waitingGuest, setWaitingGuest] = useState(false);

  const prevP1CharRef = useRef<CharacterId>(state.P1.activeCharacter);
  const prevAICharRef = useRef<CharacterId>(state.AI.activeCharacter);
  // PLAYER/READY hostAction에 포함할 selected 카드 정보를 안정적으로 참조
  const selectedRef = useRef(state.selected);
  useEffect(() => { selectedRef.current = state.selected; });

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

  // ── 상태 동기화: SETUP_INIT / ROUND_DRAFT / GAME_OVER 진입 시 1회만 전송
  // (round:turn:phase) 키로 추적해 중복 전송 방지
  const lastSyncKeyRef = useRef("");
  useEffect(() => {
    const syncPhases = ["SETUP_INIT", "ROUND_DRAFT", "GAME_OVER"] as const;
    if (!(syncPhases as readonly string[]).includes(state.phase)) return;
    const key = `${state.round}:${state.turn}:${state.phase}`;
    if (key === lastSyncKeyRef.current) return;
    lastSyncKeyRef.current = key;
    syncState(roomCode, state).catch(console.error);
  }, [state, roomCode]);

  // ── wrappedDispatch: 로컬 dispatch + 게스트에게 hostAction 전파 ─────────────
  // 게스트 로컬 리듀서에 그대로 반영해야 하는 호스트 액션들을 hostAction으로 전송.
  // PLAYER/READY: state.selected는 클로저에서 stale할 수 있으므로 selectedRef 사용.
  //   카드 정보(cardId/handIndex)를 포함해 전송 → 게스트 리듀서가 올바르게 큐에 등록.
  const wrappedDispatch = useCallback(
    (action: Action) => {
      dispatch(action);

      let hostAction: Action = action;

      if (action.type === "PLAYER/READY") {
        const sel = selectedRef.current;
        hostAction = sel
          ? { type: "PLAYER/READY", player: action.player, cardId: sel.cardId, handIndex: sel.handIndex }
          : action;
        sendHostAction(roomCode, hostAction).catch(console.error);
        return;
      }

      const hostActionTypes: Action["type"][] = [
        "TURN/TAG",
        "COST/CONFIRM",
        "COST/CANCEL",
        "SELECTION/CONFIRM",
        "SELECTION/SKIP",
        "SUBMIT_DRAFT",
        "DISCARD/CONFIRM",
      ];
      if (hostActionTypes.includes(action.type)) {
        sendHostAction(roomCode, hostAction).catch(console.error);
      }
    },
    [roomCode],
  );

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
      dispatch={wrappedDispatch}
      isAiThinking={waitingGuest}
      isTagAnimating={isTagAnimating}
      disableAiDraft
      onExit={onExit}
    />
  );
}

// ── 게스트 게임 앱 ───────────────────────────────────────────────────────────
// 로컬 리듀서로 게임 로직을 직접 실행 — Firestore는 동기화 포인트
// (SETUP_INIT / ROUND_DRAFT / GAME_OVER)에서만 정규 상태를 수신하고,
// 그 사이 턴 처리(RESOLVE → ANIMATING → TURN_END)는 로컬에서 독립 수행.

export function GuestGameApp({
  roomCode,
  onExit,
}: {
  roomCode: string;
  onExit: () => void;
}) {
  // 로컬 리듀서: null = 첫 SYNC/OVERRIDE 수신 전 미초기화 상태
  const [localState, localDispatch] = useReducer(guestLocalReducer, null);
  const [localSelected, setLocalSelected] = useState<{ cardId: string; handIndex: number } | null>(null);

  // onExit ref (subscription 클로저 안정화)
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; });

  // localState ref — subscription 클로저 안에서 최신 상태 참조용
  const localStateRef = useRef(localState);
  useEffect(() => { localStateRef.current = localState; });

  // 동기화 중복 방지: (round:turn:phase) 키로 추적
  const lastSyncKeyRef = useRef("");

  // ── Firestore 구독 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeRoom(roomCode, (data: RoomData) => {
      const gs = data.gameState;

      // 1. 정규 동기화 포인트 수신 → 로컬 상태 교체
      //    매 턴 시작(SETUP_INIT)에서 호스트 정규 상태로 덮어써
      //    셔플 등 무작위 요소가 반영된 올바른 상태를 확보
      if (gs && (gs.phase === "SETUP_INIT" || gs.phase === "ROUND_DRAFT" || gs.phase === "GAME_OVER")) {
        const syncKey = `${gs.round}:${gs.turn}:${gs.phase}`;
        if (syncKey !== lastSyncKeyRef.current) {
          lastSyncKeyRef.current = syncKey;
          localDispatch({ type: "SYNC/OVERRIDE", state: gs });
        }
      }

      // 2. hostAction: 호스트(P1)의 플레이 액션 → 로컬 리듀서에 직접 반영
      if (data.hostAction) {
        // [CP1] hostAction 수신 시점의 localState phase와 P1.hand 기록
        const cur = localStateRef.current;
        pushDebugLog(roomCode, [
          "[CP1] hostAction 수신",
          `action=${JSON.stringify(data.hostAction)}`,
          `phase=${cur?.phase ?? "null"}`,
          `P1.hand=${JSON.stringify(cur?.P1.hand ?? [])}`,
          `P1.hand[${(data.hostAction as { handIndex?: number }).handIndex}]=${cur?.P1.hand[(data.hostAction as { handIndex?: number }).handIndex ?? -1] ?? "없음"}`,
        ].join(" | ")).catch(console.error);
        localDispatch(data.hostAction as Action);
        clearHostAction(roomCode).catch(console.error);
      }

      if (data.status === "finished") onExitRef.current();
    });
    return () => unsubscribe();
  // onExit은 ref로 관리 — deps에서 제외해 리스너 불필요한 재생성 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // ── 자동 페이즈 전환 (HostGameApp과 동일 로직, localState 사용) ──────────────

  // TURN_START → TURN/BEGIN (드래프트 완료 후)
  useEffect(() => {
    if (!localState) return;
    if (localState.phase === "TURN_START" && localState.P1.hand.length > 0 && localState.AI.hand.length > 0) {
      localDispatch({ type: "TURN/BEGIN" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localState?.phase, localState?.P1.hand.length, localState?.AI.hand.length]);

  // TURN_END → TURN/BEGIN (600ms 딜레이)
  useEffect(() => {
    if (!localState || localState.phase !== "TURN_END" || localState.winner) return;
    const t = setTimeout(() => localDispatch({ type: "TURN/BEGIN" }), 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localState?.phase, localState?.winner]);

  // RESOLVE → RESOLVE/STEP (500ms 딜레이)
  useEffect(() => {
    if (!localState || localState.phase !== "RESOLVE") return;
    // [CP3] RESOLVE 진입 시 양쪽 큐 상태 기록
    pushDebugLog(roomCode, [
      "[CP3] RESOLVE 진입",
      `P1.queue=${JSON.stringify(localState.P1.queue)}`,
      `AI.queue=${JSON.stringify(localState.AI.queue)}`,
      `initiative=${localState.initiative}`,
    ].join(" | ")).catch(console.error);
    const t = setTimeout(() => localDispatch({ type: "RESOLVE/STEP" }), 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localState?.phase]);

  // ── 게스트 dispatch (GameScreen에 전달) ────────────────────────────────────
  const guestDispatch = useCallback(
    (action: Action) => {
      switch (action.type) {

        // 카드 선택: 로컬 UI 상태만 변경 (Firestore 전송 X)
        case "CARD/SELECT":
          setLocalSelected((prev) =>
            prev?.cardId === action.cardId && prev?.handIndex === action.handIndex
              ? null
              : { cardId: action.cardId, handIndex: action.handIndex },
          );
          return;

        // Ready: 게스트(AI) 관점의 PLAYER/READY → AI/GUEST_READY로 변환
        case "PLAYER/READY": {
          const guestAction: Action = localSelected
            ? { type: "AI/GUEST_READY", cardId: localSelected.cardId, handIndex: localSelected.handIndex }
            : { type: "AI/GUEST_READY" };
          setLocalSelected(null);
          localDispatch(guestAction);
          sendGuestAction(roomCode, guestAction).catch(console.error);
          return;
        }

        // 태그: AI/GUEST_TAG로 변환
        case "TURN/TAG":
          localDispatch({ type: "AI/GUEST_TAG" });
          sendGuestAction(roomCode, { type: "AI/GUEST_TAG" }).catch(console.error);
          return;

        // 드래프트: player를 AI로 변환
        case "SUBMIT_DRAFT": {
          const draftAction: Action = { type: "SUBMIT_DRAFT", player: "AI", cardIds: action.cardIds };
          localDispatch(draftAction);
          sendGuestAction(roomCode, draftAction).catch(console.error);
          return;
        }

        // 카드 선택 확정 / 스킵: 로컬 + Firestore 전송
        case "SELECTION/CONFIRM":
        case "SELECTION/SKIP":
          localDispatch(action);
          sendGuestAction(roomCode, action).catch(console.error);
          return;

        // 호스트 전용 액션 — UI에서 발화돼도 무시 (hostAction으로 수신 시 자동 적용)
        case "COST/CONFIRM":
        case "COST/CANCEL":
        case "DISCARD/CONFIRM":
          return;

        // 그 외 시스템 액션 (ANIM/DONE, TURN/BEGIN, RESOLVE/STEP 등): 로컬만
        default:
          localDispatch(action);
          return;
      }
    },
    [roomCode, localSelected],
  );

  // [CP4] ANIMATING 진입 시 animScript(flip 전) 기록
  useEffect(() => {
    if (!localState || localState.phase !== "ANIMATING") return;
    pushDebugLog(roomCode, [
      "[CP4] ANIMATING 진입 (flip 전)",
      `animScript=${JSON.stringify(localState.animScript.map(e => ({ actor: e.actor, cardId: e.cardId })))}`,
    ].join(" | ")).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localState?.phase]);

  // ── 뷰 ────────────────────────────────────────────────────────────────────
  const flippedState: GameState | null = localState
    ? { ...flipState(localState), selected: localSelected }
    : null;

  // 게스트가 직접 카드를 선택해야 하는 턴 (로딩/대기 표시용)
  const isGuestTurn = localState
    ? (localState.phase === "SETUP_INIT" && localState.initiative === "AI") ||
      (localState.phase === "SETUP_OTHER" && localState.initiative === "P1")
    : false;

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
      isAiThinking={!isGuestTurn && (localState?.phase === "SETUP_INIT" || localState?.phase === "SETUP_OTHER")}
      disableAiDraft
      onExit={onExit}
    />
  );
}
