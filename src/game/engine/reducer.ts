import type { Action, GameState } from "./types";
import { beginTurn, queueCard, resolveAll, resumeResolve, checkGameOver, draw, canUseCard, enterResolving, resolveOneStep } from "./rules";
import { getCard } from "./cards";
import { shuffle } from "./rng";


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

      // useCondition 불충족 시 선택 불가
      if (!canUseCard(state, "P1", cardId)) return state;

      const same =
        state.selected &&
        state.selected.cardId === cardId &&
        state.selected.handIndex === handIndex;

      return { ...state, selected: same ? null : { cardId, handIndex } };
    }

    case "PLAYER/READY": {
      let s: GameState = state;

      const inSetup =
        s.phase === "SETUP_INIT" || s.phase === "SETUP_OTHER";
      if (!inSetup) return s;

      if (action.player === "P1") {
        // ✅ P1은 자기 차례가 아니면 ready 불가
        if (!isP1TurnToPick(s)) return s;

        const picked = s.selected;

        if (picked) {
          // 선택 카드가 있으면 예약
          s = queueCard(s, "P1", picked.cardId, picked.handIndex);
          s = { ...s, selected: null };
        } else {
          // ✅ 선택 카드가 없으면 pass + 1드로우
          s = draw(s, "P1", 1);
          if (s.phase === "GAME_OVER") return s;

          s = {
            ...s,
            log: [`P1 passes and draws 1`, ...s.log].slice(0, 40),
          };
        }

        // 그 다음 ready=true
        s = { ...s, P1: { ...s.P1, ready: true } };
      } else {
        // AI는 이 액션을 직접 타지 않는 구조라면 그대로 유지
        s = { ...s, AI: { ...s.AI, ready: true } };
      }

      // ✅ 단계 진행: INIT → OTHER → RESOLVE
      if (s.phase === "SETUP_INIT") {
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

      // 후보: 코스트 가능 + useCondition 충족 카드만
      const candidates = s.AI.hand
        .map((id, idx) => ({ id, idx, card: getCard(id) }))
        .filter((x) => x.card && x.card.cost <= s.AI.deck.length && canUseCard(s, "AI", x.id));

      // “가장 강력”: damage면 value 큰 것 우선, 그 다음 cost 큰 것
      candidates.sort((a, b) => {
        const aDamage =
          a.card!.effects
            .filter((effect) => effect.type === "damage")
            .reduce((sum, effect) => sum + (effect.value ?? 0), 0);

        const bDamage =
          b.card!.effects
            .filter((effect) => effect.type === "damage")
            .reduce((sum, effect) => sum + (effect.value ?? 0), 0);

        if (bDamage !== aDamage) return bDamage - aDamage;
        return (b.card!.cost ?? 0) - (a.card!.cost ?? 0);
      });

      if (candidates.length > 0) {
        const pick = candidates[0];
        s = queueCard(s, "AI", pick.id, pick.idx);
      } else {
        // ✅ AI도 pass하면 1드로우
        s = draw(s, "AI", 1);
        if (s.phase === "GAME_OVER") return s;
      }

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
      if (state.phase === "RESOLVE") {
        // 500ms 딜레이 후 진입 — resolveQueue 구성 후 RESOLVING 전환
        return enterResolving(state);
      }
      if (state.phase === "RESOLVING") {
        // 600ms 딜레이마다 카드 한 장씩 처리
        const s1 = resolveOneStep(state);
        if (s1.phase === "GAME_OVER") return s1;
        if (s1.phase === "WAITING_SELECTION") return s1;
        return checkGameOver(s1);
      }
      return state;
    }

    case "SELECTION/CONFIRM": {
      if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return state;
      return resumeResolve(state, action.selectedCards);
    }

    case "SELECTION/SKIP": {
      if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return state;
      return resumeResolve(state, []);
    }

    case "DISCARD/CONFIRM": {
      if (state.phase !== "WAITING_DISCARD" || !state.pendingDiscard) return state;

      const { discardCards } = action;
      const pd = state.pendingDiscard;

      // 정확히 count장을 선택해야 함
      if (discardCards.length !== pd.count) return state;

      // discardCards는 "cardId::handIndex" 형식 키 배열
      const discardIndices = new Set(discardCards.map((key) => Number(key.split("::")[1])));
      const me = state.P1;
      const remainingHand: string[] = [];
      const discardedIds: string[] = [];

      me.hand.forEach((cardId, idx) => {
        if (discardIndices.has(idx)) {
          discardedIds.push(cardId);
        } else {
          remainingHand.push(cardId);
        }
      });

      const s: GameState = {
        ...state,
        P1: {
          ...me,
          hand: remainingHand,
          trash: [...me.trash, ...discardedIds],
        },
        pendingDiscard: null,
        phase: "TURN_END",
        log: [`P1 discards ${discardedIds.length} card(s) to hand limit`, ...state.log].slice(0, 40),
      };

      return s;
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
    
    case "GAME/INIT": {
      let s: GameState = {
        ...state,
        initiative: Math.random() < 0.5 ? "P1" : "AI",
        P1: {
          ...state.P1,
          deck: shuffle([...state.P1.deck]),
        },
        AI: {
          ...state.AI,
          deck: shuffle([...state.AI.deck]),
        },
      };

      s = draw(s, "P1", 3);
      if (s.phase === "GAME_OVER") return s;

      s = draw(s, "AI", 3);
      return s;
    }
    
  }
}