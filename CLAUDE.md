# SNAP-DUEL — Claude 작업 가이드

## 프로젝트 개요

2D 격투 카드게임. P1(플레이어)과 AI가 카드를 동시에 선택하고 딜레이 순서로 해결.
Firebase를 통한 온라인 대전도 지원.

**기술 스택:** Next.js 16 / React 19 / TypeScript / Firebase / CSS Modules

---

## 아키텍처: Resolve-then-Animate

핵심 패턴: **상태 머신 계산 먼저, UI 연출 나중.**

1. `RESOLVE` → `enterResolving()`: 모든 카드 효과를 한 번에 계산해 최종 `GameState` 도출
2. 계산 결과를 `animScript: AnimScriptEntry[]`에 저장 → `ANIMATING` 페이즈 진입
3. `makeQueueFromScript()`: animScript → `CombatAnimationEvent[]` 이벤트 큐 생성
4. `useArenaAnimation`: 이벤트 큐를 타임라인대로 소비하며 UI 업데이트

UI에서 HP 바 변경, 카운터 연출은 `damage_resolve` 이벤트 타이밍에 맞춰 지연 표시.
(`displayedHp`, `displayedCounteredPlayer` 상태 사용)

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
│   │   ├── stateHelpers.ts         # 저수준 상태 조작 (dealDamage, draw, getEffectiveDelay, ...)
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
│   ├── useTagAnimating.ts          # 태그 연출 재생 중 여부 (useGameTransitions 소비자)
│   └── useTurnTimer.ts             # 턴 시간제약 (20s) — 만료 시 TURN/TIMEOUT 디스패치
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
- base + statModifiers + `status.buffs` + 구 status 버프(delayAdvantage / attackBuff)를 합산
- 공격력은 표시·전투가 **같은 함수 `deriveAttackPower`를 호출**한다 → 핸드 표시 == 실제 데미지
- CardView는 자체 계산 없이 이 결과(`stats` prop)만 표시

**공격 수단 — `groundAttack: 0` / `antiAirAttack: 0`은 "그 수단이 없다"는 뜻**
- 지상 전용 카드가 `antiAirAttack: 0`으로 체공 상대를 못 때리는 것이 이 규칙이다
- 스탯을 가리지 않는 `status.attackBuff`는 **없던 수단을 새로 열지 않는다** —
  열어 주면 지상 전용 카드가 버프받는 동안 대공 카드로 둔갑한다
- 예외: **양쪽 다 0인 카드**는 "수치를 전부 밖에서 받는 공격 카드"로 보고 양쪽 수단을 가진 것으로 취급
- 수단을 특정하고 싶으면 `buff` 효과나 statModifiers로 해당 스탯을 올린다 —
  그쪽은 어느 스탯인지 스스로 밝히므로 그 수단만 열린다
- 검증: `cardStats.test.ts`의 "attackBuff와 공격 수단(0)의 관계"

**규칙:** 카드 표시/판정 로직을 컴포넌트나 ai.ts에 새로 인라인하지 말 것.
새 조건/스탯이 생기면 위 두 함수에만 추가하고, `playability.test.ts`/`cardStats.test.ts`의
정합성 테스트(판정===집행, 표시===전투 데미지)로 어긋남을 막는다.

---

## 버프/디버프 (status.buffs)

`buff` 효과가 `Combatant.status.buffs`에 `Buff`를 쌓는다. delta 음수 = 디버프.

```ts
Buff = { label?, stat, delta, duration, scope, characterId?, filter? }
```

- **지속(duration)** — `{ type: "turns", remaining }`(턴 시작마다 감소, `tickTurnBuffs`) /
  `{ type: "uses", remaining }`(필터에 맞는 카드를 **실제로 쓸 때만** 감소, `consumeUseBuffs`)
- **스코프(scope)** — `player`(태그해도 유지) / `character`(걸린 시점의 활성 캐릭터에 붙어 **태그 시 소멸**, `clearCharacterBuffs`)
- **대상** — 효과의 `target`(self/enemy) × `buffScope`로 4조합
- **필터(filter)** — `cardType` / `tags`(하나만 맞아도 통과) / `statRange`.
  `statRange`는 **버프 적용 전 base 스탯**으로 판정한다 (실효 스탯으로 보면 적용 순서에 따라 결과가 흔들린다)
- **라운드 경계** — 라운드가 바뀌면 남은 지속과 무관하게 전부 소멸 (`prepareNextRound`)

**계산 지점은 하나다 — `evaluateBuffs(state, player, card)`.**
`getEffectiveCost` / `getEffectiveDelay` / `deriveCardStats` / `applyAttackStats` 넷 다 이 함수를 거친다.
새 스탯을 버프 대상에 추가할 땐 `StatTarget` + `baseStatOf` + `buffText.STAT_LABELS`만 채우면 된다.

표시 문구(로그·HP 바 배지·어드민 미리보기)는 `engine/buffText.ts`가 단일 지점.
검증은 `buffs.test.ts`(지속·스코프·필터·표시===실제 데미지·표기).

---

## 중독 (status.poisons)

`poison` 효과가 `Combatant.status.poisons`에 `Poison`을 쌓는다. 스탯을 바꾸는 대신 **매 턴 HP를 깎는다**.

```ts
Poison = { label?, damage, turns, scope, characterId?, appliedTurn }
```

- **틱 시점 — 리졸브 끝(`finishResolve`)**. 턴 시작에서 깎으면 ANIMATING 바깥이라
  `animStartHp` 스냅샷과 어긋나 HP 바가 예고 없이 떨어진다. 양쪽이 다 패스해도 틱은 돈다
  (카드를 안 내는 것으로 독을 흘려보낼 수 없어야 한다)
- **건 턴에는 틱하지 않는다** — `appliedTurn < state.turn`. 즉발 데미지 + 중독을 겸하는
  카드가 같은 턴에 두 번 때리는 것을 막는다
- **블록을 무시한다** — `dealDamage(..., { ignoreBlock: true })`. 막을 수 없는 것이
  중독의 정체성이고, 블록을 깎으면 "블록 쌓고 버티기"가 그대로 해독제가 된다
- **스코프** — 버프와 같은 `BuffScope`. `character`(기본)는 태그로 벗어나고,
  `player`는 태그해도 따라온다 (`clearCharacterPoisons`)
- **라운드 경계** — 버프와 함께 전부 소멸 (`prepareNextRound`)
- **KO 허용** — 중독 틱으로 캐릭터가 쓰러지면 그대로 게임이 끝난다. 연출은 끝까지
  재생하고 `ANIM/DONE`이 GAME_OVER로 넘긴다

**연출** — `animScript`는 "카드 1장당 1항목" 구조라 카드 없는 틱을 담을 수 없다.
`GameState.poisonTicks: PoisonTick[]`에 따로 싣고, `makeQueueFromScript`가
카드 연출 **뒤에** `poison_tick` 이벤트를 덧붙인다.
`poisonTicks`는 `PlayerId`와 `{P1,AI}` 스냅샷을 둘 다 가지므로 **`flipState`에서 교환한다.**

검증은 `poisons.test.ts`(틱 타이밍·블록 무시·스코프·리졸브 연동·KO·연출 큐·표기).

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
- `trash`: 코스트 지불된 카드 / 카운터된 카드
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
- `counteredPlayer`: 이 카드로 카운터된 상대 (있을 때만)

---

## 애니메이션 이벤트 파이프라인

`CombatAnimationEvent` 타입:
- `super_flash`: 슈퍼 플래시 연출 (공격 전)
- `fighter_move`: 파이터 위치 이동 (대시-인/넉백/복귀) — 거리 연출 전용
- `action_start`: 공격자 포즈 전환
- `visual_hit`: 피격자 hit 포즈
- `damage_resolve`: HP 바 업데이트 타이밍 (hpAfter, counteredPlayer 포함)
- `action_end`: 포즈 유지

**히트 타이밍 기본값** — `hitTimings`를 안 적은 **공격 카드**는 `actionTag`별 기본값
(`DEFAULT_HIT_TIMINGS`)으로 히트를 재생한다. 카드에 적힌 값이 언제나 이기고,
스킬 카드는 `actionTag`가 있어도 기본값을 받지 않는다(타격이 아니므로).
임팩트 프레임·피격 강도는 "그 동작의 성질"이라 카드마다 적을 이유가 없다 —
freeze/zoom이 히트 포즈별 프리셋으로 떨어지는 것과 같은 구조.
다단 히트는 계속 카드가 직접 적는다. 해석 지점은 `resolveHitTimings` 하나.

**거리(근접/비근접) 연출** — 게임 로직과 무관한 연출 전용 상태:
- 카드 필드 `meleeAttack`(미지정=true: 비근접이면 돌진 후 공격, 빗나가면 헛스윙 후 복귀=휘핑) / `knockback`(기본 false: 타격 후 양측 홈 복귀)
- 거리 상태는 **성립한 타격만** 바꾼다 — 휘핑·스킬·카운터은 상태 무변화
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

- **딜레이(delay)**: 낮을수록 먼저 발동 (0이 최속, 구 명칭 speed). 동률 시 initiative 플레이어 우선
- **어드밴티지(advantage)**: 직접 타격 성공 시 획득(구 명칭 gain). 다음 턴 카드의 딜레이를 그만큼 감소(`delayAdvantageNext` → `delayAdvantage`)
- **주도권(initiative)**: 라운드 시작 시 랜덤 결정. 이후 직접 타격 성공 시 공격자가 주도권을 획득(`applyInitiativeOnHit`). 주도권은 턴마다 타격 결과에 따라 이동한다. 라운드 종료 시 재추첨.
- **카운터**: 먼저 처리된 카드가 직접 타격 시 상대 큐의 damage 카드를 카운터
- **airborne**: airborneStack ≥ 1이면 ground 공격 무효, 0이면 anti-air 무효
- **코스트**: 카드 사용 시 deck 상단에서 cost장 소비 → trash
- **exhausted**: deck이 0장이면 exhausted. 양쪽 모두 exhausted면 라운드 종료
- **라운드**: 3라운드 후 총 HP 합계로 승부
- **어피니티**: 캐릭터의 `affinities` 태그에 해당하는 카드만 사용 가능
- **턴 시간제약**: 선택 차례·WAITING_* 결정·드래프트마다 20초(`useTurnTimer`). 만료 시 `TURN/TIMEOUT` 액션으로
  자동 처리(SETUP·코스트 지불=패스+1드로우, 선택 효과=스킵, 버리기=앞에서부터 자동, 드래프트=0장 제출).
  드래프트는 양쪽 동시 선택이므로 창을 공유(액터 없는 windowKey) — 한쪽 제출로 남은 시간이 리셋되지 않는다.
  GameState에 wall-clock을 넣지 않는다 — 타이머는 훅이 마감 시각만 기억하고 정식 액션으로 강제.
  강제 주체: 싱글=P1만, 온라인=호스트가 양쪽(게스트 창은 +1.5s 유예), 게스트=표시 전용.

---

## Claude 상대 (AI 대전)

AI 대전에서 상대 결정 주체를 규칙 기반 `ai.ts` 대신 Claude API로 바꿀 수 있다.
메뉴의 "Claude 상대" 체크박스 → `opponentType: "local" | "claude"`가 `/game` URL(`op=claude`)에 실려
`GameApp`(`app/game/page.tsx`)에서 갈린다.

**AI가 결정해야 하는 4개 지점** — 전부 "밖에서 결정 → 완성된 액션을 디스패치" 모양으로 통일되어 있다
(리듀서는 순수 동기 함수라 그 안에서 네트워크 호출을 할 수 없기 때문):

| 지점 | 로컬 규칙 (기존) | Claude 모드 |
|---|---|---|
| SETUP 카드+태그 | 리듀서가 `selectCard`/`shouldTag` 직접 호출 (`AI/SETUP_AUTO`) | 훅이 결정을 받아와 `AI/SETUP_DECIDE { tag, play }`로 디스패치 |
| WAITING_SELECTION | `page.tsx` 훅이 즉시 첫 N장 선택 | 같은 훅이 API 결과로 `SELECTION/CONFIRM`/`SKIP` |
| ROUND_DRAFT | `GameScreen.tsx` 훅이 랜덤 3장 | 같은 자리, `disableAiDraft`로 로컬 훅을 끄고 Claude 훅이 대신 처리 |
| WAITING_DISCARD(AI) | `page.tsx` 훅이 `selectDiscards`로 즉시 처리 | 같은 자리, API 결과로 처리 |

이 통일 작업 과정에서 AI의 초과 버리기도 리듀서 내부(`discardAIExcess`, 삭제됨)에서
P1과 같은 `WAITING_DISCARD` 경로로 옮겨졌다 — `PendingDiscard.player`로 누구 차례인지 구분하고,
`DISCARD/CONFIRM` 처리 후 `resolveHandLimits`가 남은 쪽의 초과 여부를 다시 확인해 양쪽이
동시에 초과해도 순차 처리한다.

**`useClaudeOpponent`**(`hooks/useClaudeOpponent.ts`)가 위 4곳에서 `POST /api/ai/move`를 호출한다.
로컬 규칙 효과들과 정확히 같은 트리거 조건 위에서 동작하며, 두 경로는 `isClaude`로 상호 배타적이다.

**서버 라우트**(`app/api/ai/move/route.ts`):
- `kind: "setup" | "selection" | "draft" | "discard"` + 그 시점의 `GameState`(AI가 항상 Claude 쪽)를 받는다.
- `getPlayableCards`/`deriveCardStats` 등 **엔진의 단일 진실원**으로 프롬프트를 구성 —
  Claude가 보는 숫자가 곧 사람이 핸드에서 보는 숫자와 같다.
- 응답은 tool use로 강제(`tool_choice`)해 자유 텍스트 파싱을 피한다.
- 항상 로컬 규칙(`ai.ts`)으로 먼저 폴백 결정을 계산해 두고, Claude 응답을
  `game/engine/aiMoveValidation.ts`의 순수 함수(`resolveSetupDecision` 등)로 검증한다 —
  개수 불일치·존재하지 않는 id·타입 불일치 등 조금이라도 이상하면 그 필드만(또는 전체) 폴백으로 떨어진다.
  fetch 자체가 실패해도(네트워크 단절 등) 클라이언트 훅이 같은 폴백을 즉시 쓴다 —
  API가 완전히 죽어도 게임이 멈추지 않는다.
- `ANTHROPIC_API_KEY` 환경변수 필요 (서버 전용, `lib/claude.ts`가 lazy 초기화).
- 규칙 요약은 `GAME_RULES_SYSTEM_PROMPT`(`lib/claude.ts`) 하나로 고정하고 `cache_control`로 캐싱 —
  매 결정마다 같은 텍스트를 반복 전송하지 않는다.
- **카운터 확정 판단은 Claude에게 맡기지 않는다.** 상대가 이미 큐에 올린 카드는 이름만 보여주면
  delay를 몰라 판단 자체가 불가능하고(`fmtCombatant`가 실효 스탯까지 노출), 손패의 각 공격 카드는
  `ai.ts`의 `oppFastestAttackDelay`/`dealsDamage`(로컬 규칙 AI와 동일 기준, export됨)로 미리 계산해
  "⚠️카운터 확정" 여부를 문자열에 박아 넣는다 — LLM이 delay 숫자를 직접 비교해 추론하게 두면
  종종 오판했다(실제 대전 로그에서 확인).

**덱별 전략 지침 — `DeckDef.aiStrategyHint`**
덱마다 Claude에게 줄 자유 텍스트 전략 지침을 어드민 `DeckEditor`에서 작성할 수 있다.

- `GameState`/`Combatant`에는 싣지 않는다 — 게임 시작 후에는 `deckId`를 들고 있지 않고,
  이 값은 애초에 프롬프트 구성 전용 데이터라 엔진 상태로 흘려보낼 이유가 없다.
- 대신 클라이언트에서만 흐른다: `page.tsx`가 `aiConfig.deckId`로 `getDeckRegistry()`를 조회해
  `deckHint`를 얻고, `useClaudeOpponent`가 이를 4개 결정 지점 전부의 POST 바디에 실어
  `/api/ai/move`로 보낸다. 라우트는 `fmtCommonHeader`에서 다른 상태 요약 뒤에
  "이 덱의 전략 지침: ..." 한 줄로 덧붙인다.
- 비어 있으면(설정 안 함) 아무 것도 추가되지 않는다 — 기존 프롬프트와 동일하게 동작.

**검증 로직을 라우트에서 분리한 이유** — 이 프로젝트의 테스트는 순수 엔진 로직만 다루고
`app/api/*` 라우트는 테스트하지 않는다(Firestore/외부 API 의존). `aiMoveValidation.ts`는
네트워크·Firestore 의존 없는 순수 함수라 `aiMoveValidation.test.ts`로 "이상한 응답이 와도
게임이 안 멈추는지"를 직접 검증할 수 있다 (`cardBulkCsv.ts`와 같은 분리 이유).

**기보 다운로드 — 손패 스냅샷 + Claude 판단 근거 포함**
`GameScreen.tsx`의 "로그 저장" 버튼(GAME_OVER 화면)이 `state.turnLog`를 JSON으로 내려받는다.

- `TurnLogEntry.hands`: 그 턴 SETUP이 시작되던 시점(=리졸브로 손패가 바뀌기 전)의 양쪽 손패
  스냅샷 — "그때 실제로 낼 수 있었던 다른 카드들"까지 복기할 수 있다. `beginTurn`이
  `GameState.turnStartHands`에 찍어 두고 `endTurnCleanup`이 turnLog 항목을 만들 때 소비한다.
  둘 사이(SETUP·RESOLVE)에 손패가 바뀌므로 턴 끝에 가서는 되짚을 수 없어 중계 필드가 필요했다.
- Claude 상대 모드에서는 여기에 `claudeDecisions`가 추가로 실린다 — `useClaudeOpponent`가 4개
  결정 지점마다 tool 응답의 `reasoning` 필드(1~2문장, 시스템 프롬프트가 요청)를 카드 이름 요약과
  함께 쌓아 두는 `decisionLog`다. 이 로그는 **GameState가 아니라 훅 안에서만** 쌓인다 — 게임
  결과에 영향을 주지 않는 분석용 부가 데이터라 리듀서/온라인 동기화(flipState)에 태울 이유가
  없고, Claude 상대 자체가 싱글플레이 전용이라 게스트 뷰 미러링 대상도 아니다.
  fetch가 실패해 로컬 규칙으로 폴백된 결정은 `reasoning: null`로 남는다.
- `turnStartHands`/`turnLog.hands`는 P1/AI 절대 키를 가진 값이라 `flipState`에서 교환해야
  게스트 화면에서 자기 자신이 P1으로 나온다 (`turnLog.initiative`도 마찬가지 — 이번에
  `turnLog` 전체가 flipState 대상에서 빠져 있던 기존 누락도 함께 고쳤다).

---

## 어드민 패널

`/admin` — 카드 / 덱 / 캐릭터 탭으로 구성.

- **CardEditor**: 카드 생성/편집. 효과(effects), 히트타이밍, 태그, 스탯보정 등
- **DeckEditor**: 덱 생성/편집. 덱에 포함할 카드 목록 + 캐릭터 구성
- **CharacterEditor**: 캐릭터 생성/편집. ID, name, maxHp, spriteId, affinities, entryEffect/exitEffect

어드민 CRUD는 `/api/admin/*` 라우트를 통해 Firestore에 직접 저장.
저장 후 `revalidateTag()`를 호출해 `/api/cards`, `/api/decks`, `/api/characters` 캐시를 무효화.

---

## 레퍼런스 레포

**[TheCardGoat/lorcana-simulator](https://github.com/TheCardGoat/lorcana-simulator)**
— Lorcana TCG의 TypeScript 구현. **외부 오픈소스이며 이 레포에 코드를 복사해 온 것은 없다.**
설계 패턴만 참고했고, 코드에는 아래 두 곳에 출처 주석이 남아 있다.

| 가져온 패턴 | 원본 | SNAP-DUEL 적용 |
|---|---|---|
| passive clock — 상태에 wall-clock을 넣지 않고, 표시값은 `(snapshot, now)`를 받는 순수 함수가 계산 | `lorcana-engine/src/core/runtime/clock-view.ts` | `hooks/useTurnTimer.ts` — GameState에 시간 미포함(결정론·flipState 미러 보호), 훅은 마감 시각만 기억 |
| 단일 ticker — 모든 시간 표시가 같은 타임스탬프를 읽어 표시 간 drift를 없앰 (100ms) | `lorcana-simulator/src/lib/features/simulator/model/clock-ticker.svelte.ts` | `useTurnTimer.ts`의 `TICK_MS = 100` |
| flow — 턴/페이즈/전환 **자체를 1급 데이터**로 노출하고 UI는 읽기만 함 | `lorcana-engine/src/flow/`, `src/projection/` | `hooks/useGameTransitions.ts` (전환 감지 단일 진실원) |

`clock-view.ts`가 못 박은 원칙이 `useTurnTimer`의 뼈대다:
> Never calls `Date.now()` internally — the caller must supply `now` so drift
> between display and affordance logic is impossible.

시간·페이즈 전환 쪽을 손볼 때 참고할 만하다. 다만 저쪽은 Svelte + 서버 권위 구조라
훅/리듀서 구조는 그대로 옮겨지지 않는다 — **패턴만 가져오고 구현은 우리 구조에 맞춘다.**

---

## 작업 규칙

- 테스트 실행 전 반드시 먼저 알릴 것
- 테스트 결과 확인 후 다음 행동은 지시 대기
- 브랜치: `claude/<feature-name>` 형식
- 커밋 후 `git push -u origin <branch>` 필수
- PR은 명시적으로 요청받을 때만 생성
- 기본 브랜치: `dev` (main 아님)
