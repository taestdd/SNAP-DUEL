# SNAP-DUEL 작업 백로그

향후 진행할 리팩터/기능 후보. 우선순위·범위·위험을 기록해 둔다.

---

## 페이즈 전환 이벤트 단일화 (flow 이벤트화)

**배경**
현재 phase 전환을 여러 UI 소비자가 각자 추론한다:
- `GameScreen` — `prevPhaseRef`로 전환 감지 → 토스트/안내(BattleAnnounce) 트리거
- `useArenaAnimation` — phase 기반 포즈·히트스톱·애니메이션
- `hooks/useFlowDriver` — phase 기반 자동전환(TURN/BEGIN, RESOLVE/STEP)

lorcana-simulator는 엔진 `flow` 모듈이 turn/phase/step과 **전환 자체를 1급 데이터**로 노출하고,
UI(projection)는 그것을 **읽기만** 한다. 우리는 "UI가 phase를 눈치채서" 동작이 흩어져 있다.

**목표**
엔진(또는 전용 훅)이 "방금 일어난 전환"을 이벤트로 노출 → UI는 전환→연출 매핑 테이블로 소비.
- 예: `state.lastTransition = { from, to }` 또는 flow 이벤트 큐
- 토스트·BattleAnnounce·애니메이션이 같은 전환 소스를 공유

**영향 범위 (큼 — 신중히)**
- `GameScreen`(안내 트리거)
- `useArenaAnimation`(포즈/히트스톱 — 가장 복잡, 회귀 위험 높음)
- `useFlowDriver`(자동전환)
- 온라인 host/guest 동기화 타이밍

**위험**: 잘 동작하는 애니메이션 파이프라인을 건드려야 해 회귀 위험이 큼.
#2(useFlowDriver)처럼 단계별로 쪼개고 정합성 테스트로 보호하며 진행할 것.

**참고**: 이 작업을 하면 "연출 매핑 테이블 분리"(소규모 정리)는 여기에 흡수되므로 따로 하지 않는다.
