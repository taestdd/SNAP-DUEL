# SNAP-DUEL — Claude 작업 가이드

## 프로젝트 개요

2D 격투 카드게임. P1(플레이어)과 AI가 카드를 동시에 선택하고 스피드 순서로 해결.
Firebase를 통한 온라인 대전도 지원.

**기술 스택:** Next.js 16 / React 19 / TypeScript / Firebase / CSS Modules

---

## 아키텍처: Resolve-then-Animate

핵심 패턴: **상태 머신 계산 먼저, UI 연출 나중.**

1. `RESOLVE` → `enterResolving()`: 모든 카드 효과를 한 번에 계산해 최종 `GameState` 도출
2. 계산 결과를 `animScript: AnimScriptEntry[]`에 저장 → `ANIMATING` 페이즈 진입
3. `makeQueueFromScript()`: animScript → `CombatAnimationEvent[]` 이벤트 큐 생성
4. `useArenaAnimation`: 이벤트 큐를 타임라인대로 소비하며 UI 업데이트

UI에서 HP 바 변경, 캔슬 연출은 `damage_resolve` 이벤트 타이밍에 맞춰 지연 표시.
(`displayedHp`, `displayedCancelledPlayer` 상태 사용)

---

## 파일 구조

```
src/
├── app/                        # Next.js App Router 라우트
│   ├── game/page.tsx           # 싱글플레이 게임 화면
│   ├── online/                 # 온라인 대전 (host/join/game)
│   └── admin/                  # 카드/덱 편집 어드민
│
├── components/
│   ├── game/                   # 게임 UI 컴포넌트
│   │   ├── GameScreen.tsx      # 최상위 게임 뷰 (상태 → UI 연결)
│   │   ├── ArenaStage.tsx      # 전투 스테이지 레이아웃
│   │   ├── FighterSprite.tsx   # 캐릭터 스프라이트 + 포즈 애니메이션
│   │   ├── FightingHPBar.tsx   # 캐릭터별 HP 바 (overrideCharacterHp 지원)
│   │   ├── Hand.tsx            # 플레이어 핸드
│   │   ├── QueuePreview.tsx    # 이번 턴 예약 카드 표시
│   │   ├── ToastMessage.tsx    # 라운드/전투 시작 알림 (상단, 1.6s)
│   │   └── ...
│   └── admin/                  # 카드/덱 편집기
│
├── game/
│   ├── engine/                 # 순수 게임 로직 (UI 무관)
│   │   ├── types.ts            # 모든 타입 정의 (GameState, Card, Action 등)
│   │   ├── state.ts            # 초기 상태 생성
│   │   ├── reducer.ts          # gameReducer — Action → GameState
│   │   ├── rules.ts            # re-export 파사드 (직접 구현 없음)
│   │   ├── constants.ts        # LOG_LIMIT=200, HAND_LIMIT=10
│   │   ├── stateHelpers.ts     # 저수준 상태 조작 (dealDamage, draw, ...)
│   │   ├── effects.ts          # 카드 효과 적용 (applyCardEffectsWithPause, canUseCard)
│   │   ├── turn.ts             # 턴/라운드 라이프사이클 (beginTurn, endTurnCleanup)
│   │   ├── resolve.ts          # 리졸브 루프 (enterResolving, resumeResolve)
│   │   ├── ai.ts               # AI 카드 선택 로직
│   │   ├── cards.ts            # cards.json 로더 + getCard()
│   │   ├── characters.ts       # 캐릭터 정의 (CHARACTERS 맵)
│   │   ├── cardSchema.ts       # Zod 카드 스키마
│   │   ├── deckSchema.ts       # Zod 덱 스키마
│   │   └── rng.ts              # shuffle
│   │
│   ├── animation/
│   │   ├── makeQueue.ts        # animScript → CombatAnimationEvent[] 변환
│   │   ├── useArenaAnimation.ts # 이벤트 큐 소비 + displayedHp/displayedCancelledPlayer
│   │   ├── useAnimQueue.ts     # 이벤트 큐 타이머 구동
│   │   └── spriteMap.ts        # ActionTag/FighterPose → 스프라이트 프레임 맵
│   │
│   └── tests/
│       └── engine.test.ts
│
├── data/
│   ├── cards.json              # 카드 데이터
│   └── decks.json              # 덱 데이터
│
└── lib/
    ├── firebase.ts
    └── roomService.ts          # 온라인 대전 Firebase 룸 관리
```

---

## 엔진 모듈 의존 순서

순환 참조 없음. 단방향:

```
types ← constants ← stateHelpers ← effects ← turn ← resolve
                                              ↑
                                           cards, characters
```

- `stateHelpers`: 순수 조작. rules/engine 모듈 import 없음
- `effects`: stateHelpers + cards + characters만 import
- `turn`: effects import (canUseCard 사용), stateHelpers import
- `resolve`: effects + turn import, stateHelpers import
- `rules.ts`: 위 4개를 re-export하는 파사드 (직접 로직 없음)
- `reducer.ts`: rules.ts를 통해 모든 기능 사용

---

## TurnPhase 상태 머신

```
ROUND_DRAFT → TURN_START → SETUP_INIT → SETUP_OTHER → RESOLVE
                                                          ↓
                              TURN_END ← ANIMATING ← RESOLVING
                                ↓              ↑
                           (핸드초과)   WAITING_SELECTION
                        WAITING_DISCARD
                                ↓
                              TURN_END
```

- `SETUP_INIT`: initiative 플레이어가 먼저 선택
- `SETUP_OTHER`: 나머지 플레이어 선택
- `RESOLVE` → `RESOLVING`: 1틱 딜레이 후 `enterResolving()` 호출
- `ANIMATING`: animScript 재생. `ANIM/DONE` 액션으로 종료
- `WAITING_SELECTION`: move_cards + userSelects 효과 처리 중 대기
- `WAITING_DISCARD`: 턴 종료 시 핸드 10장 초과 버리기

---

## 주요 타입

**GameState 핵심 필드**
- `phase`: 현재 TurnPhase
- `P1 / AI`: Combatant (hp, characterHp, hand, deck, trash, cooldown, queue, airborneStack, status)
- `animScript`: ANIMATING 재생용 AnimScriptEntry[]
- `animStartHp`: resolve 직전 HP 스냅샷 (HP 바 지연 표시 초기값)
- `resolveQueue/Index/Unresolved`: resolve 루프 상태

**Combatant 카드 영역**
- `hand`: 현재 사용 가능한 카드
- `deck`: 코스트 지불 소스
- `trash`: 코스트 지불된 카드 / 캔슬된 카드
- `cooldown`: 정상 사용된 카드 (라운드 말에 trash로)
- `queue`: 이번 턴 예약된 카드 (1장)

**AnimScriptEntry**
- `actor`: 행동 플레이어
- `cardId`: 사용한 카드
- `actorAirborne / targetAirborne`: 해결 시점 체공 스택
- `hpAfter`: 이 카드 효과 적용 후 HP (damage_resolve 이벤트에 전달)
- `cancelledPlayer`: 이 카드로 캔슬된 상대 (있을 때만)

---

## 애니메이션 이벤트 파이프라인

`CombatAnimationEvent` 타입:
- `super_flash`: 슈퍼 플래시 연출 (공격 전)
- `action_start`: 공격자 포즈 전환
- `visual_hit`: 피격자 hit 포즈 (airborne 상태로 ground 공격 무효 시 생략)
- `damage_resolve`: HP 바 업데이트 타이밍 (hpAfter, cancelledPlayer 포함)
- `action_end`: 포즈 유지

**HP 바 지연 표시 흐름:**
1. ANIMATING 진입 시 `displayedHp = animStartHp` (resolve 전 HP)
2. `damage_resolve` 이벤트마다 `displayedHp = event.hpAfter`로 갱신
3. ANIMATING 종료 시 `displayedHp = null` → 실제 GameState HP 표시

---

## 게임 규칙 핵심

- **스피드**: 낮을수록 빠름 (0이 최속). 동률 시 initiative 플레이어 우선
- **캔슬**: 먼저 처리된 카드가 직접 타격 시 상대 큐의 damage 카드를 캔슬
- **airborne**: airborneStack ≥ 1이면 ground 공격 무효, 0이면 anti-air 무효
- **코스트**: 카드 사용 시 deck 상단에서 cost장 소비 → trash
- **exhausted**: deck이 0장이면 exhausted. 양쪽 모두 exhausted면 라운드 종료
- **라운드**: 3라운드 후 총 HP 합계로 승부

---

## 작업 규칙

- 테스트 실행 전 반드시 먼저 알릴 것
- 테스트 결과 확인 후 다음 행동은 지시 대기
- 브랜치: `claude/<feature-name>` 형식
- 커밋 후 `git push -u origin <branch>` 필수
- PR은 명시적으로 요청받을 때만 생성
- 기본 브랜치: `dev` (main 아님)
