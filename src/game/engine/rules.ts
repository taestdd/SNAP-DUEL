/**
 * rules.ts — 하위 모듈 re-export
 *
 * 실제 구현:
 *   effects.ts — 카드 효과 적용 (applyTagSwitch, applyCardEffectsWithPause, canUseCard)
 *   turn.ts    — 턴/라운드 라이프사이클 (beginTurn, endTurnCleanup, queueCard, submitDraft)
 *   resolve.ts — 리졸브 루프 (enterResolving, resumeResolve)
 *   constants.ts — 공용 상수 (LOG_LIMIT, HAND_LIMIT)
 */

export { applyTagSwitch, applyCardEffectsWithPause, canUseCard } from "./effects";
export { beginTurn, endTurnCleanup, queueCard, submitDraft } from "./turn";
export { enterResolving, resumeResolve } from "./resolve";
export { LOG_LIMIT } from "./constants";
export { draw, checkGameOver, getBenchChar, opponentOf } from "./stateHelpers";
