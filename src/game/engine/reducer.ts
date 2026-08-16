import type { Action, GameState } from "./types";
import { beginTurn, queueCard, resumeResolve, resumeCostPayment, draw, canUseCard, enterResolving, endTurnCleanup, applyTagSwitch, submitDraft, resolveHandLimits, LOG_LIMIT, getBenchChar } from "./rules";
import { getCard } from "./cards";
import { selectCard, shouldTag } from "./ai";
import { isSetupTurnOf } from "./stateHelpers";


function isP1TurnToPick(state: GameState): boolean {
  return isSetupTurnOf(state, "P1");
}

/** SETUP_INIT → SETUP_OTHER → RESOLVE 로 한 단계 진행한다. */
function advanceSetupPhase(s: GameState): GameState {
  if (s.phase === "SETUP_INIT") return { ...s, phase: "SETUP_OTHER" };
  if (s.phase === "SETUP_OTHER") return { ...s, phase: "RESOLVE" };
  return s;
}

/**
 * SETUP에서 AI가 낼 결정을 적용한다 — 결정의 출처(로컬 규칙 / Claude 등)와
 * 무관하게 여기 하나로 모은다. 태그 합법성(airborne·벤치 HP)은 결정을
 * 신뢰하지 않고 여기서 다시 검사한다 — 잘못된/오래된 결정이 들어와도
 * 상태가 깨지지 않고 조용히 그 부분만 무시된다.
 */
function applySetupDecision(
  state: GameState,
  decision: { tag: boolean; play: { id: string; idx: number } | null },
): GameState {
  let s = state;

  if (decision.tag) {
    const me = s.AI;
    const canTag = me.airborneStack < 2 && me.characterHp[getBenchChar(me)] > 0;
    if (canTag) {
      s = applyTagSwitch(s, "AI");
      if (s.phase === "GAME_OVER") return s;
      s = { ...s, aiTaggedThisTurn: true };
    }
  }

  if (decision.play) {
    s = queueCard(s, "AI", decision.play.id, decision.play.idx);
  }
  // queueCard는 조건 불충족 시 조용히 무시하므로, 실제로 큐에 올랐는지로 성공 여부를 판단한다
  if (s.AI.queue.length === 0) {
    s = draw(s, "AI", 1);
    if (s.phase === "GAME_OVER") return s;
  }

  s = { ...s, AI: { ...s.AI, ready: true } };
  return advanceSetupPhase(s);
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
        // handIndex는 호스트 hand 기준이므로 게스트 hand에서 cardId로 재탐색
        // (HAND/CYCLE이 호스트 로컬에서만 적용되면 인덱스가 달라질 수 있음)
        // 없으면 로컬 state.selected 사용 (일반 dispatch)
        const picked = (() => {
          if (action.cardId !== undefined && action.handIndex !== undefined) {
            const localIdx = s.P1.hand.indexOf(action.cardId);
            return {
              cardId: action.cardId,
              handIndex: localIdx >= 0 ? localIdx : action.handIndex,
            };
          }
          return s.selected;
        })();

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
      return advanceSetupPhase(s);
    }

    case "TURN/TAG": {
      const inSetupTag =
        state.phase === "SETUP_INIT" || state.phase === "SETUP_OTHER";
      if (!inSetupTag) return state;
      if (!isP1TurnToPick(state)) return state;
      if (state.P1.ready) return state;
      if (state.p1TaggedThisTurn) return state;
      if (state.P1.airborneStack >= 2) return state;

      if (state.P1.characterHp[getBenchChar(state.P1)] <= 0) return state;

      const s = applyTagSwitch(state, "P1");
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
      // 턴당 1회 제한 — 게스트는 사람이므로 반복 전송을 리듀서에서 막아야 함 (TURN/TAG와 대칭)
      if (state.aiTaggedThisTurn) return state;
      if (state.AI.airborneStack >= 2) return state;

      if (state.AI.characterHp[getBenchChar(state.AI)] <= 0) return state;

      const s = applyTagSwitch(state, "AI");
      if (s.phase === "GAME_OVER") return s;
      return { ...s, aiTaggedThisTurn: true, log: [`P2 tags`, ...s.log].slice(0, LOG_LIMIT) };
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

      return advanceSetupPhase(s);
    }

    case "AI/SETUP_AUTO": {
      // ✅ AI 자동 선택은 SETUP 단계에서만
      if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;
      if (state.AI.ready) return state;

      let s = state;

      // 튜토리얼: 스크립트된 AI 행동
      if (s.tutorialAiScript) {
        const script = s.tutorialAiScript[s.turn - 1] ?? [];
        if (script.length > 0) {
          const cardId = script[0];
          const handIdx = s.AI.hand.indexOf(cardId);
          if (handIdx >= 0) {
            s = queueCard(s, "AI", cardId, handIdx);
          }
        }
        s = { ...s, AI: { ...s.AI, ready: true } };
        return advanceSetupPhase(s);
      }

      // 로컬 규칙(ai.ts)으로 결정 → 적용은 AI/SETUP_DECIDE와 같은 경로를 탄다
      return applySetupDecision(s, { tag: shouldTag(s, "AI"), play: selectCard(s, "AI") });
    }

    case "AI/SETUP_DECIDE": {
      // 외부(Claude 등)에서 이미 계산해 온 결정을 적용. 리듀서는 순수 동기라
      // 여기서 직접 API를 호출할 수 없으므로, 이 액션은 훅이 비동기로 받아온
      // 결정을 실어 보내는 용도다 — "무엇을 할지"는 이미 정해져서 들어온다.
      if (state.phase !== "SETUP_INIT" && state.phase !== "SETUP_OTHER") return state;
      if (state.AI.ready) return state;
      if (state.tutorialAiScript) return state; // 튜토리얼은 스크립트 전용

      return applySetupDecision(state, { tag: action.tag, play: action.play });
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
      const me = state[pd.player];
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
        [pd.player]: {
          ...me,
          hand: remainingHand,
          trash: [...me.trash, ...discardedIds],
        },
        pendingDiscard: null,
        log: [`${pd.player} discards ${discardedIds.length} card(s) to hand limit`, ...state.log].slice(0, LOG_LIMIT),
      } as GameState;

      // 한쪽이 방금 처리됐어도 다른 쪽이 아직 초과 상태일 수 있다 — 다시 확인
      return resolveHandLimits(s);
    }

    case "TURN/END": {
      return { ...state, phase: "TURN_END" };
    }

    case "SUBMIT_DRAFT": {
      return submitDraft(state, action.player, action.cardIds);
    }

    case "SURRENDER": {
      if (state.phase === "GAME_OVER") return state;
      return {
        ...state,
        phase: "GAME_OVER",
        winner: action.player === "P1" ? "AI" : "P1",
        animScript: [],
        animStartHp: null,
        animStartCombo: null,
        pendingSelection: null,
        pendingCostPayment: null,
        pendingDiscard: null,
        resolveContext: { queue: [], index: 0, unresolved: [] },
      };
    }

    case "TURN/TIMEOUT": {
      const { player } = action;
      const label = player === "P1" ? "P1" : "P2";

      // SETUP 선택 만료 → 자동 패스 (선택 중이던 카드는 무시)
      const timeoutPass = (base: GameState): GameState => {
        let s = draw(base, player, 1);
        if (s.phase === "GAME_OVER") return s;
        s = {
          ...s,
          selected: player === "P1" ? null : s.selected,
          log: [`${label} times out — passes and draws 1`, ...s.log].slice(0, LOG_LIMIT),
          [player]: { ...s[player], ready: true },
        } as GameState;
        return advanceSetupPhase(s);
      };

      switch (state.phase) {
        case "SETUP_INIT":
        case "SETUP_OTHER": {
          if (!isSetupTurnOf(state, player)) return state;
          if (state[player].ready) return state;
          return timeoutPass(state);
        }

        // 드래프트 만료 → 0장 제출 (자동 패스 정책과 동일)
        case "ROUND_DRAFT": {
          if (state.draftSelections[player] !== null) return state;
          const s = submitDraft(state, player, []);
          return { ...s, log: [`${label} times out — drafts nothing`, ...s.log].slice(0, LOG_LIMIT) };
        }

        // 코스트 지불 중 만료 → 취소 후 그 자리에서 자동 패스
        case "WAITING_COST_PAYMENT": {
          if (state.pendingCostPayment?.player !== player) return state;
          return timeoutPass({
            ...state,
            phase: state.pendingCostPayment.originalPhase,
            pendingCostPayment: null,
            selected: null,
          });
        }

        // 카드 선택 효과 만료 → SELECTION/SKIP과 동일
        case "WAITING_SELECTION": {
          if (state.pendingSelection?.selectingPlayer !== player) return state;
          return resumeResolve(state, []);
        }

        // 버리기 만료 → 핸드 앞에서부터 자동 버리기 (DISCARD/CONFIRM 경로 재사용)
        case "WAITING_DISCARD": {
          const pd = state.pendingDiscard;
          if (!pd || pd.player !== player) return state;
          const keys = state[pd.player].hand
            .slice(0, pd.count)
            .map((id, idx) => `${id}::${idx}`);
          return gameReducer(state, { type: "DISCARD/CONFIRM", discardCards: keys });
        }

        default:
          return state;
      }
    }

    case "DEBUG/RESET": {
      return state;
    }

    default: {
      return state;
    }
  }
}