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

## 데이터 레이어: Firestore 기반

카드/덱/캐릭터 데이터는 **Firestore에 저장**되며, 로컬 JSON 파일은 더 이상 사용하지 않는다.

### Firebase 설정
- **클라이언트 SDK** (`src/lib/firebase.ts`): 온라인 대전 실시간 동기화에 사용
- **Admin SDK** (`src/lib/firebase-admin.ts`): 서버사이드 API 라우트에서 사용
  - `getAdminDb()` lazy 초기화 — 빌드 시점 실행 방지
  - Vercel 환경변수 `FIREBASE_SERVICE_ACCOUNT` 필요 (서비스 계정 JSON 전체)

### 데이터 로딩 흐름 (클라이언트)
`src/hooks/useGameData.ts`의 `useGameData()` 훅을 사용:
```
/api/cards → initCards()
/api/decks → initDecks()        ← 병렬 fetch
/api/characters → initCharacters()
```
반환값: `"loading" | "ready" | "error"`

게임 화면(`/game`, `/online/game`)은 `useGameData()`가 "ready"가 될 때까지 로딩 화면 표시.

### Firestore 컬렉션
- `cards/{cardId}` — 카드 데이터
- `decks/{deckId}` — 덱 데이터
- `characters/{characterId}` — 캐릭터 데이터

---

## 파일 구조

```
src/
├── app/                            # Next.js App Router 라우트
│   ├── game/page.tsx               # 싱글플레이 게임 화면
│   ├── online/                     # 온라인 대전 (host/join/game)
│   ├── admin/                      # 어드민 (Cards / Decks / Characters 탭)
│   │   ├── page.tsx                # 탭 인터페이스 목록
│   │   ├── cards/new/page.tsx
│   │   ├── cards/[id]/edit/page.tsx
│   │   ├── decks/new/page.tsx
│   │   ├── decks/[id]/edit/page.tsx
│   │   ├── characters/new/page.tsx
│   │   └── characters/[id]/edit/page.tsx
│   │
│   └── api/
│       ├── cards/route.ts          # GET — 공개 (unstable_cache)
│       ├── decks/route.ts          # GET — 공개 (unstable_cache)
│       ├── characters/route.ts     # GET — 공개 (unstable_cache)
│       └── admin/
│           ├── cards/route.ts          # GET, POST
│           ├── cards/[id]/route.ts     # GET, PUT, DELETE + revalidateTag
│           ├── decks/route.ts          # GET, POST
│           ├── decks/[id]/route.ts     # GET, PUT, DELETE + revalidateTag
│           ├── characters/route.ts     # GET, POST
│           └── characters/[id]/route.ts # GET, PUT, DELETE + revalidateTag
│
├── components/
│   ├── game/                       # 게임 UI 컴포넌트
│   │   ├── GameScreen.tsx          # 최상위 게임 뷰 (상태 → UI 연결)
│   │   ├── ArenaStage.tsx          # 전투 스테이지 레이아웃
│   │   ├── FighterSprite.tsx       # 캐릭터 스프라이트 (spriteId 기반)
│   │   ├── FightingHPBar.tsx       # 캐릭터별 HP 바
│   │   ├── Hand.tsx                # 플레이어 핸드
│   │   ├── QueuePreview.tsx        # 이번 턴 예약 카드 표시
│   │   ├── ToastMessage.tsx        # 라운드/전투 시작 알림 (상단, 1.6s)
│   │   ├── SetupScreen.tsx         # 게임 시작 전 덱/캐릭터 선택
│   │   ├── OnlineGameApp.tsx       # HostGameApp / GuestGameApp
│   │   └── ...
│   └── admin/                      # 어드민 편집기
│       ├── CardEditor.tsx
│       ├── DeckEditor.tsx
│       └── CharacterEditor.tsx
│
├── game/
│   ├── engine/                     # 순수 게임 로직 (UI 무관)
│   │   ├── types.ts                # 모든 타입 정의
│   │   ├── state.ts                # 초기 상태 생성 + initDecks/getDeckRegistry
│   │   ├── reducer.ts              # gameReducer — Action → GameState
│   │   ├── rules.ts                # re-export 파사드
│   │   ├── constants.ts            # LOG_LIMIT=200, HAND_LIMIT=10
│   │   ├── stateHelpers.ts         # 저수준 상태 조작 (dealDamage, draw, getEffectiveSpeed, ...)
│   │   ├── effects.ts              # 카드 효과 적용 + 판정/스탯 단일 진실원
│   │   │                           #   (getCardPlayability, deriveCardStats)
│   │   ├── turn.ts                 # 턴/라운드 라이프사이클
│   │   ├── resolve.ts              # 리졸브 루프
│   │   ├── ai.ts                   # AI 카드 선택 로직
│   │   ├── cards.ts                # initCards / getCard / getAllCards
│   │   ├── characters.ts           # initCharacters / getCharacter / CHARACTERS
│   │   ├── cardSchema.ts           # Zod 카드 스키마
│   │   ├── deckSchema.ts           # Zod 덱 스키마
│   │   ├── characterSchema.ts      # Zod 캐릭터 스키마
│   │   └── rng.ts                  # shuffle
│   │
│   ├── animation/
│   │   ├── makeQueue.ts
│   │   ├── useArenaAnimation.ts
│   │   ├── useAnimQueue.ts
│   │   └── spriteMap.ts
│   │
│   └── tests/
│       ├── fixtures.ts             # makeState / 합성 카드·캐릭터 (테스트 공용)
│       ├── stateHelpers.test.ts
│       ├── effects.test.ts
│       ├── turn.test.ts
│       ├── resolve.test.ts
│       ├── reducer.test.ts
│       ├── makeQueue.test.ts
│       ├── playability.test.ts     # getCardPlayability / 판정===집행 정합성
│       ├── cardStats.test.ts       # deriveCardStats / 표시===전투 데미지 정합성
│       └── smoke.test.ts
│
├── hooks/
│   ├── useGameData.ts              # 카드/덱/캐릭터 병렬 로딩 훅
│   ├── useFlowDriver.ts            # 페이즈 자동전환 (TURN_START/RESOLVE/TURN_END)
│   ├── useGameTransitions.ts       # 상태 전환 감지 단일 진실원 (detectTransitions + 핸들러 훅)
│   └── useTagAnimating.ts          # 태그 연출 재생 중 여부 (useGameTransitions 소비자)
│
└── lib/
    ├── firebase.ts                 # 클라이언트 SDK (온라인 대전)
    ├── firebase-admin.ts           # Admin SDK (API 라우트)
    └── roomService.ts              # 온라인 대전 Firebase 룸 관리
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
- `effects`: stateHelpers + cards + characters만 import. 카드 효과 적용 + 카드 판정/스탯 단일 진실원
- `turn`: effects import (canUseCard / getEffectiveCost 사용), stateHelpers import
- `resolve`: effects + turn import, stateHelpers import
- `rules.ts`: 위 4개를 re-export하는 파사드 (직접 로직 없음)
- `reducer.ts`: rules.ts를 통해 모든 기능 사용

---

## 카드 판정·스탯 단일 진실원 (effects.ts)

카드의 "사용 가능 여부"와 "실효 스탯"은 **흩어뜨리지 말고 effects.ts의 단일 함수**에서만 계산한다.
UI(Hand)·AI(ai.ts)·집행(turn.ts)이 모두 같은 결과를 보도록 보장한다.

**판정 — `getCardPlayability(state, player, cardId): CardPlayability`**
- 어피니티 / altCost / useCondition / 코스트를 한 번에 검사, 플래그별로 노출
- 파생 함수: `canUseCard`(코스트 제외 규칙 자격), `canPlayCard`(코스트 포함), `getPlayableCards`(핸드 전체 필터)
- `getEffectiveCost(state, player, card)`: statModifiers 보정 반영 실효 코스트

**스탯 — `deriveCardStats(state, player, cardId): CardStats`**
- base + statModifiers + status 버프(speedBonus / attackBuff)를 합산
- 공격력은 전투 해결(`applyCardEffectsWithPause`)과 **동일한 식**(base + mods + attackBuff)을 사용 → 핸드 표시 == 실제 데미지
- CardView는 자체 계산 없이 이 결과(`stats` prop)만 표시

**규칙:** 카드 표시/판정 로직을 컴포넌트나 ai.ts에 새로 인라인하지 말 것.
새 조건/스탯이 생기면 위 두 함수에만 추가하고, `playability.test.ts`/`cardStats.test.ts`의
정합성 테스트(판정===집행, 표시===전투 데미지)로 어긋남을 막는다.

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

**전환 감지 규칙:** "방금 무엇이 바뀌었나"(페이즈/라운드/캐릭터 교체/착지)에 반응하는 UI는
컴포넌트에 `prevXRef`를 새로 만들지 말고 `hooks/useGameTransitions`의 핸들러로 소비한다.
새 전환 종류가 필요하면 `detectTransitions`에 추가하고 `transitions.test.ts`로 검증한다.
("현재 페이즈에 있는 동안" 반응하는 effect — ANIMATING 재생, GAME_OVER KO 포즈 등 — 는 해당 없음.)

---

## 주요 타입

**GameState 핵심 필드**
- `phase`: 현재 TurnPhase
- `P1 / AI`: Combatant (hp, characterHp, hand, deck, trash, cooldown, queue, airborneStack, status)
- `animScript`: ANIMATING 재생용 AnimScriptEntry[]
- `animStartHp`: resolve 직전 HP 스냅샷 (HP 바 지연 표시 초기값)
- `resolveContext`: resolve 루프 상태 (아래 참고)

**resolveContext 구조** (구 resolveQueue/Index/Unresolved)
```ts
resolveContext: {
  queue: { player: PlayerId; cardId: string }[];
  index: number;
  unresolved: PlayerId[];
}
```

**Combatant 카드 영역**
- `hand`: 현재 사용 가능한 카드
- `deck`: 코스트 지불 소스
- `trash`: 코스트 지불된 카드 / 캔슬된 카드
- `cooldown`: 정상 사용된 카드 (라운드 말에 trash로)
- `queue`: 이번 턴 예약된 카드 (1장)

**CharacterDef**
- `id: string` — lowercase + 숫자 + 언더스코어 (동적, "A"/"B" 하드코딩 아님)
- `name: string`
- `maxHp: number`
- `spriteId: string` — 스프라이트 에셋 ID (캐릭터 ID와 분리)
- `entryEffect: CardEffect | null` — 등장 시 효과
- `exitEffect: CardEffect | null` — 퇴장 시 효과
- `affinities: string[]` — 사용 가능한 카드 태그 조건

**AnimScriptEntry**
- `actor`: 행동 플레이어
- `cardId`: 사용한 카드
- `actorAirborne / targetAirborne`: 해결 시점 체공 스택
- `hpAfter`: 이 카드 효과 적용 후 HP
- `cancelledPlayer`: 이 카드로 캔슬된 상대 (있을 때만)

---

## 애니메이션 이벤트 파이프라인

`CombatAnimationEvent` 타입:
- `super_flash`: 슈퍼 플래시 연출 (공격 전)
- `fighter_move`: 파이터 위치 이동 (대시-인/넉백/복귀) — 거리 연출 전용
- `action_start`: 공격자 포즈 전환
- `visual_hit`: 피격자 hit 포즈
- `damage_resolve`: HP 바 업데이트 타이밍 (hpAfter, cancelledPlayer 포함)
- `action_end`: 포즈 유지

**거리(근접/비근접) 연출** — 게임 로직과 무관한 연출 전용 상태:
- 카드 필드 `meleeAttack`(미지정=true: 비근접이면 돌진 후 공격) / `knockback`(기본 false: 타격 후 양측 홈 복귀)
- makeQueue가 animScript를 따라 파이터 오프셋을 시뮬레이션해 `fighter_move`를 생성,
  `useArenaAnimation`이 턴 사이 오프셋을 보존 (리셋은 라운드 전환만, 태그는 유지)
- 온라인은 양측이 flip된 스크립트로 결정론적 시뮬레이션 → 동기화 불필요 (미러 정합성 테스트로 방어)
- 튜닝 상수: `SPREAD_PX`(비근접 벌어짐) / `CLOSE_OVERLAP_PX`(근접 겹침) / `DASH_MS` (makeQueue)

**HP 바 지연 표시 흐름:**
1. ANIMATING 진입 시 `displayedHp = animStartHp` (resolve 전 HP)
2. `damage_resolve` 이벤트마다 `displayedHp = event.hpAfter`로 갱신
3. ANIMATING 종료 시 `displayedHp = null` → 실제 GameState HP 표시

---

## 게임 규칙 핵심

- **스피드**: 낮을수록 빠름 (0이 최속). 동률 시 initiative 플레이어 우선
- **주도권(initiative)**: 라운드 시작 시 랜덤 결정. 이후 직접 타격 성공 시 공격자가 주도권을 획득(`applyInitiativeOnHit`). 주도권은 턴마다 타격 결과에 따라 이동한다. 라운드 종료 시 재추첨.
- **캔슬**: 먼저 처리된 카드가 직접 타격 시 상대 큐의 damage 카드를 캔슬
- **airborne**: airborneStack ≥ 1이면 ground 공격 무효, 0이면 anti-air 무효
- **코스트**: 카드 사용 시 deck 상단에서 cost장 소비 → trash
- **exhausted**: deck이 0장이면 exhausted. 양쪽 모두 exhausted면 라운드 종료
- **라운드**: 3라운드 후 총 HP 합계로 승부
- **어피니티**: 캐릭터의 `affinities` 태그에 해당하는 카드만 사용 가능

---

## 어드민 패널

`/admin` — 카드 / 덱 / 캐릭터 탭으로 구성.

- **CardEditor**: 카드 생성/편집. 효과(effects), 히트타이밍, 태그, 스탯보정 등
- **DeckEditor**: 덱 생성/편집. 덱에 포함할 카드 목록 + 캐릭터 구성
- **CharacterEditor**: 캐릭터 생성/편집. ID, name, maxHp, spriteId, affinities, entryEffect/exitEffect

어드민 CRUD는 `/api/admin/*` 라우트를 통해 Firestore에 직접 저장.
저장 후 `revalidateTag()`를 호출해 `/api/cards`, `/api/decks`, `/api/characters` 캐시를 무효화.

---

## 작업 규칙

- 테스트 실행 전 반드시 먼저 알릴 것
- 테스트 결과 확인 후 다음 행동은 지시 대기
- 브랜치: `claude/<feature-name>` 형식
- 커밋 후 `git push -u origin <branch>` 필수
- PR은 명시적으로 요청받을 때만 생성
- 기본 브랜치: `dev` (main 아님)
