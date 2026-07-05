import { useEffect, useRef } from "react";
import type { CharacterId, GameState, PlayerId, TurnPhase } from "@/game/engine/types";

/**
 * 게임 상태 전환 이벤트 — "방금 무엇이 바뀌었나"의 단일 진실원.
 *
 * 기존에는 GameScreen·useArenaAnimation·게임 페이지들이 각자 prevXRef로
 * 이전 상태를 추적하며 전환을 재구성했다. 이 모듈이 그 감지 로직을
 * 한 곳(detectTransitions)으로 모으고, UI는 useGameTransitions 핸들러로 소비한다.
 */
export type GameTransition =
  | { type: "phase"; from: TurnPhase; to: TurnPhase }
  | { type: "round"; from: number; to: number }
  | { type: "characterSwitch"; player: PlayerId; from: CharacterId; to: CharacterId }
  /** 턴 시작으로 airborne이 1+→0이 된 착지 (태그로 인한 리셋은 turn이 안 올라 제외) */
  | { type: "landing"; player: PlayerId };

const PLAYERS = ["P1", "AI"] as const;

/** 두 상태를 비교해 발생한 전환 목록을 반환한다 (순수 함수). */
export function detectTransitions(prev: GameState, next: GameState): GameTransition[] {
  const out: GameTransition[] = [];

  if (prev.phase !== next.phase) {
    out.push({ type: "phase", from: prev.phase, to: next.phase });
  }
  if (prev.round !== next.round) {
    out.push({ type: "round", from: prev.round, to: next.round });
  }
  for (const p of PLAYERS) {
    if (prev[p].activeCharacter !== next[p].activeCharacter) {
      out.push({
        type: "characterSwitch",
        player: p,
        from: prev[p].activeCharacter,
        to: next[p].activeCharacter,
      });
    }
  }
  if (next.turn > prev.turn) {
    for (const p of PLAYERS) {
      if (prev[p].airborneStack >= 1 && next[p].airborneStack === 0) {
        out.push({ type: "landing", player: p });
      }
    }
  }

  return out;
}

export type TransitionHandlers = {
  /** 페이즈 전환. state는 전환 직후 스냅샷 */
  onPhase?: (from: TurnPhase, to: TurnPhase, state: GameState) => void;
  onRound?: (from: number, to: number, state: GameState) => void;
  onCharacterSwitch?: (player: PlayerId, from: CharacterId, to: CharacterId) => void;
  onLanding?: (player: PlayerId) => void;
};

/**
 * 상태 전환을 감지해 핸들러를 호출한다.
 * - 이전 상태 추적(ref)은 훅 내부에서 처리 — 소비자는 prevXRef가 필요 없다.
 * - 핸들러는 ref로 보관되어 최신 클로저가 호출된다 (의존성 재구독 없음).
 * - state가 null이면(게스트 동기화 전) 아무것도 하지 않는다.
 */
export function useGameTransitions(state: GameState | null, handlers: TransitionHandlers): void {
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });

  const prevRef = useRef<GameState | null>(state);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!prev || !state || prev === state) return;

    for (const t of detectTransitions(prev, state)) {
      const h = handlersRef.current;
      switch (t.type) {
        case "phase":           h.onPhase?.(t.from, t.to, state); break;
        case "round":           h.onRound?.(t.from, t.to, state); break;
        case "characterSwitch": h.onCharacterSwitch?.(t.player, t.from, t.to); break;
        case "landing":         h.onLanding?.(t.player); break;
      }
    }
  }, [state]);
}
