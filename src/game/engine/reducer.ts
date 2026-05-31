import type { Action, GameState } from "./types";
import { beginTurn, queueCard, resumeResolve, resumeCostPayment, checkGameOver, draw, canUseCard, enterResolving, endTurnCleanup, applyTagSwitch, submitDraft, LOG_LIMIT, getBenchChar } from "./rules";
import { getCard } from "./cards";
import { selectCard, shouldTag } from "./ai";


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

        // action.cardId가 있으면 사용 (hostAction 경유 — 게스트 로컬 리듀서용)
        // 없으면 로컬 state.selected 사용 (일반 dispatch)
        const picked =
          action.cardId !== undefined && action.handIndex !== undefined
            ? { cardId: action.cardId, handIndex: action.handIndex }
            : s.selected;

        if (picked) {
          const pickedCard = getCard(picked.cardId);
          // altCost + userSelects → 코스트 선택 UI 진입 (move_cards 타입만)
          if (pickedCard?.altCost && pickedCard.altCost.type !== "hp" && pickedCard.altCost.userSelects) {
            const cost = pickedCard.altCost;
            const fromPlayerId = cost.target === "enemy" ? ("AI" as const) : ("P1" as const);
            const allCards = s[fromPlayerId][cost.fromZone] as string[];
            const candidates = cost.tag
              ? allCards.filter(id => id !== picked.cardId && getCard(id)?.tags?.includes(cost.tag!))
              : allCards.filter(id => id !== picked.cardId);
            const originalPhase = s.phase as "SETUP_INIT" | "SETUP_OTHER";
            const returnPhase = s.phase === "SETUP_INIT" ? "SETUP_OTHER" : "RESOLVE";
            return {
              ...s,
              phase: "WAITING_COST_PAYMENT",
              selected: null,
              pendingCostPayment: {
                player: "P1",
                cardId: picked.cardId,
                handIndex: picked.handIndex,
                originalPhase,
                returnPhase,
                candidates,
                fromPlayerId,
                fromZone: cost.fromZone,
                toPlayerId: "P1",
                toZone: cost.toZone,
                toPosition: cost.toPosition ?? "bottom",
                count: cost.count,
              },
            };
          }
          // 선택 카드가 있으면 예약
          s = queueCard(s, "P1", picked.cardId, picked.handIndex);
          s = { ...s, selected: null };
        } else {
          // ✅ 선택 카드가 없으면 pass + 1드로우
          s = draw(s, "P1", 1);
          if (s.phase === "GAME_OVER") return s;

          s = {
            ...s,
            log: [`P1 passes and draws 1`, ...s.log].slice(0, LOG_LIMIT),
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

    case "TURN/TAG": {
      const inSetupTag =
        state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
      if (!inSetupTag) return state;
      if (!isP1TurnToPick(state)) return state;
      if (state.P1.ready) return state;
      if (state.p1TaggedThisTurn) return state;

      if (state.P1.characterHp[getBenchChar(state.P1)] <= 0) return state;

      let s = applyTagSwitch(state, "P1");
      if (s.phase === "GAME_OVER") return s;

      // airborne 카드가 선택된 상태였다면 클리어
      let nextSelected = s.selected;
      if (nextSelected) {
        const selCard = getCard(nextSelected.cardId);
        if (selCard?.useCondition === "airborne") {
          nextSelected = null;
        }
      }

      return {
        ...s,
        p1TaggedThisTurn: true,
        selected: nextSelected,
        log: [`P1 tags (free action)`, ...s.log].slice(0, LOG_LIMIT),
      };
    }

    case "HAND/CYCLE": {
      const hand = state.P1.hand;
      if (hand.length < 2) return state;
      const cycled = [hand[hand.length - 1], ...hand.slice(0, hand.length - 1)];
      return { ...state, P1: { ...state.P1, hand: cycled }, selected: null };
    }

    case "AI/GUEST_TAG": {
      if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;
      if (state.AI.ready) return state;

      if (state.AI.characterHp[getBenchChar(state.AI)] <= 0) return state;

      const s = applyTagSwitch(state, "AI");
      if (s.phase === "GAME_OVER") return s;
      return { ...s, log: [`P2 tags`, ...s.log].slice(0, LOG_LIMIT) };
    }

    case "AI/GUEST_READY": {
      if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;
      if (state.AI.ready) return state;

      let s = state;
      const { cardId, handIndex } = action;

      if (cardId !== undefined && handIndex !== undefined && canUseCard(s, "AI", cardId)) {
        s = queueCard(s, "AI", cardId, handIndex);
      } else {
        s = draw(s, "AI", 1);
        if (s.phase === "GAME_OVER") return s;
        s = { ...s, log: [`P2 passes and draws 1`, ...s.log].slice(0, LOG_LIMIT) };
      }

      s = { ...s, AI: { ...s.AI, ready: true } };

      if (s.phase === "SETUP_INIT") return { ...s, phase: "SETUP_OTHER" };
      if (s.phase === "SETUP_OTHER") return { ...s, phase: "RESOLVE" };
      return s;
    }

    case "AI/SETUP_AUTO": {
      // ✅ AI 자동 선택은 SETUP 단계에서만
      if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;
      if (state.AI.ready) return state;

      let s = state;

      // AI 태그: shouldTag 판단 (ai.ts와 동일 로직)
      if (shouldTag(s, "AI")) {
        s = applyTagSwitch(s, "AI");
        if (s.phase === "GAME_OVER") return s;
      }

      // 태그 여부와 무관하게 카드 선택 또는 패스
      const pick = selectCard(s, "AI");
      if (pick) {
        s = queueCard(s, "AI", pick.id, pick.idx);
      } else {
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
        // 500ms 딜레이 후 진입 — 모든 카드를 즉시 처리 후 ANIMATING 전환
        return enterResolving(state);
      }
      return state;
    }

    case "ANIM/DONE": {
      if (state.phase !== "ANIMATING") return state;
      // 애니메이션 완료: winner 있으면 GAME_OVER, 아니면 턴 종료 처리
      if (state.winner) return { ...state, phase: "GAME_OVER", animScript: [] };
      return endTurnCleanup({ ...state, animScript: [] });
    }

    case "SELECTION/CONFIRM": {
      if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return state;
      return resumeResolve(state, action.selectedCards);
    }

    case "SELECTION/SKIP": {
      if (state.phase !== "WAITING_SELECTION" || !state.pendingSelection) return state;
      return resumeResolve(state, []);
    }

    case "COST/CONFIRM": {
      if (state.phase !== "WAITING_COST_PAYMENT" || !state.pendingCostPayment) return state;
      return resumeCostPayment(state, action.selectedCards);
    }

    case "COST/CANCEL": {
      if (state.phase !== "WAITING_COST_PAYMENT" || !state.pendingCostPayment) return state;
      return {
        ...state,
        phase: state.pendingCostPayment.originalPhase,
        pendingCostPayment: null,
        selected: null,
      };
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
        log: [`P1 discards ${discardedIds.length} card(s) to hand limit`, ...state.log].slice(0, LOG_LIMIT),
      };

      return s;
    }

    case "TURN/END": {
      return { ...state, phase: "TURN_END" };
    }

    case "SUBMIT_DRAFT": {
      return submitDraft(state, action.player, action.cardIds);
    }

    case "DEBUG/RESET": {
      return state;
    }

    default: {
      return state;
    }
  }
}