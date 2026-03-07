import type { Action, GameState } from "./types";
import { beginTurn, queueCard, resolveAll, checkGameOver } from "./rules";
import { getCard } from "./cards";

function isP1TurnToPick(state: GameState): boolean {
  if (state.phase === "SETUP_INIT") return state.initiative === "P1";
  if (state.phase === "SETUP_OTHER") return state.initiative !== "P1";
  return false;
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "GAME/START": {
      return state;
    }

    case "TURN/BEGIN": {
      const s = beginTurn(state);
      if (s.phase === "GAME_OVER") return s;
      return { ...s, selected: null };
    }

    case "CARD/SELECT": {
      // ✅ P1 선택은 SETUP 단계에서만, 그리고 "자기 차례"에서만 가능
      if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;
      if (!isP1TurnToPick(state)) return state;
      if (state.P1.ready) return state;

      const { cardId, handIndex } = action;

      const same =
        state.selected &&
        state.selected.cardId === cardId &&
        state.selected.handIndex === handIndex;

      return { ...state, selected: same ? null : { cardId, handIndex } };
    }

    case "PLAYER/READY": {
      let s: GameState = state;

      // ✅ SETUP 단계에서만 ready 처리
      const inSetup = s.phase === "SETUP_INIT" || s.phase === "SETUP_OTHER";
      if (!inSetup) return s;

      if (action.player === "P1") {
        // ✅ P1은 자기 차례가 아니면 ready 불가
        if (!isP1TurnToPick(s)) return s;

        // 선택 카드 있으면 먼저 예약(큐)
        if (s.selected) {
          s = queueCard(s, "P1", s.selected.cardId, s.selected.handIndex);
          s = { ...s, selected: null };
        }

        // 그 다음 ready=true
        s = { ...s, P1: { ...s.P1, ready: true } };
      } else {
        // ✅ AI는 자기 차례에서만 ready되도록 page.tsx가 호출해줄 예정이지만,
        // 혹시라도 잘못 호출되면 안전하게 막아도 됨(선택).
        s = { ...s, AI: { ...s.AI, ready: true } };
      }

      // ✅ 단계 진행: INIT → OTHER → RESOLVE
      if (s.phase === "SETUP_INIT") {
        // 다음 차례로 넘어갈 때 P1의 selected는 어차피 null이어야 안전
        return { ...s, phase: "SETUP_OTHER" };
      }
      if (s.phase === "SETUP_OTHER") {
        return { ...s, phase: "RESOLVE" };
      }

      return s;
    }

    case "AI/SETUP_AUTO": {
      // ✅ AI 자동 선택은 SETUP 단계에서만
      if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;
      if (state.AI.ready) return state;

      let s = state;

      // 후보: 코스트(=덱 소모) 가능한 카드만
      const candidates = s.AI.hand
        .map((id, idx) => ({ id, idx, card: getCard(id) }))
        .filter((x) => x.card && x.card.cost <= s.AI.deck.length);

      // “가장 강력”: damage면 value 큰 것 우선, 그 다음 cost 큰 것
      candidates.sort((a, b) => {
        const av = a.card!.effect === "damage" ? a.card!.value : 0;
        const bv = b.card!.effect === "damage" ? b.card!.value : 0;
        if (bv !== av) return bv - av;
        return (b.card!.cost ?? 0) - (a.card!.cost ?? 0);
      });

      if (candidates.length > 0) {
        const pick = candidates[0];
        s = queueCard(s, "AI", pick.id, pick.idx);
      }

      // ✅ AI ready 처리 + 단계 전환
      s = { ...s, AI: { ...s.AI, ready: true } };

      if (s.phase === "SETUP_INIT") {
        return { ...s, phase: "SETUP_OTHER" };
      }
      if (s.phase === "SETUP_OTHER") {
        return { ...s, phase: "RESOLVE" };
      }

      return s;
    }

    case "RESOLVE/STEP": {
      const s1 = resolveAll(state);
      if (s1.phase === "GAME_OVER") return s1;
      return checkGameOver(s1);
    }

    case "TURN/END": {
      return { ...state, phase: "TURN_END" };
    }

    case "DEBUG/RESET": {
      return state;
    }

    default: {
      return state;
    }

    case "INITIATIVE/RANDOMIZE": {
      // 클라이언트에서만 실행될 예정이지만, 혹시 GAME_OVER면 그대로 두는 것도 가능
      const init = Math.random() < 0.5 ? "P1" : "AI";
      return { ...state, initiative: init };
    }    
    
  }
}