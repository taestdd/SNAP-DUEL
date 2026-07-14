# SNAP-DUEL 카드/덱 기획 지침

Claude Chat에서 카드나 덱을 기획할 때 이 문서를 컨텍스트로 제공하세요.

---

## 1. 게임 구조

- **형식**: 1v1 턴제 카드 게임. 매 턴 양쪽이 동시에 카드 1장을 선택하고 동시에 해결
- **라운드**: 3라운드. 라운드 종료 후 총 HP 합산으로 최종 승자 결정
- **캐릭터**: 플레이어마다 2인 팀 (A, B 캐릭터). 턴에 1회 교체(태그) 가능
  - 캐릭터 A: HP 12, 입장 시 상대에게 1데미지
  - 캐릭터 B: HP 12, 퇴장 시 자신 2힐
- **이니셔티브**: 매 라운드 시작 시 랜덤 배정. 속도 동률 시 이니셔티브 보유자 우선

---

## 2. 턴 흐름

```
ROUND_DRAFT → TURN_START → SETUP_INIT → SETUP_OTHER → RESOLVE → ANIMATING → TURN_END
```

1. **ROUND_DRAFT**: 라운드 시작 시 덱에서 최대 3장을 핸드로 드래프트
2. **SETUP_INIT**: 이니셔티브 플레이어가 먼저 카드 선택 (또는 패스)
3. **SETUP_OTHER**: 나머지 플레이어 선택
4. **RESOLVE**: 스피드 낮은 카드부터 순서대로 처리

---

## 3. 리소스 시스템

| 영역 | 설명 |
|------|------|
| **hand** | 사용 가능한 카드. 최대 10장 |
| **deck** | 카드 코스트 지불 소스. 0장이면 exhausted |
| **trash** | 코스트로 소모된 카드 / 카운터된 카드 |
| **cooldown** | 정상 사용된 카드. 라운드 말에 trash로 이동 |

- **코스트**: 카드 사용 시 deck 상단에서 cost만큼 trash로 소모
- **exhausted**: deck이 0장. 양쪽 모두 exhausted면 라운드 즉시 종료
- **라운드 간 리사이클**: trash → deck 재구성 (cooldown은 다음 라운드 trash로)

---

## 4. 스피드 & 카운터

- **스피드**: 숫자가 낮을수록 빠름 (0 = 최속)
- **카운터**: 먼저 처리된 카드가 상대에게 직접 타격을 줄 경우, 상대 큐의 damage 카드를 카운터
  - 카운터된 카드는 trash로 이동 (코스트만 날아감)
- **이니셔티브**: 스피드 동률 시 이니셔티브 보유자의 카드가 먼저 처리

---

## 5. 공격 시스템

### 공격력 종류

| 속성 | 조건 | 설명 |
|------|------|------|
| **ground** (지상) | 상대 airborneStack = 0 | 일반 상태의 상대에게 적용 |
| **anti-air** (대공) | 상대 airborneStack ≥ 1 | 공중 상태의 상대에게 적용 |

### airborne (체공)
- `airborneStack ≥ 1` = 체공 상태 → ground 공격 무효
- `airborneStack = 0` = 지상 상태 → anti-air 공격 무효
- 매 턴 시작 시 airborneStack -1 감소

### gain
- 공격이 적중했을 때 다음 턴 스피드 보너스로 전환

---

## 6. 카드 스펙

```json
{
  "id": "card_id",
  "name": "카드명",
  "cardType": "attack" | "skill",
  "cost": 0,          // 덱에서 소모할 카드 수
  "speed": 0,         // 낮을수록 빠름
  "groundAttack": 0,  // 지상 공격력 (attack 타입만)
  "antiAirAttack": 0, // 대공 공격력 (attack 타입만)
  "gain": 0,          // 적중 시 다음 턴 스피드 보너스 (attack 타입만)
  "effects": [],
  "text": "카드 설명",
  "useCondition": "ground" | "airborne",  // 선택: 사용 조건
  "tags": [],         // 선택: 카드 태그
  "superFlash": false // 선택: 슈퍼 플래시 연출
}
```

- **attack 타입**: groundAttack/antiAirAttack/gain을 가짐. 적중 시 이니셔티브·카운터 발동
- **skill 타입**: 공격 스탯 없음. 효과만 처리. 카운터 대상 안 됨

---

## 7. 효과 (effects) 목록

| type | 필드 | 설명 |
|------|------|------|
| `damage` | value, damageType(ground/anti-air), target | 직접 데미지 |
| `block` | value | 블록 스택 추가 (데미지 감소) |
| `draw` | value | 덱 상단에서 핸드로 드로우 |
| `draw_tagged` | value, tag | 특정 태그 카드를 덱에서 드로우 |
| `heal` | value, target | HP 회복 |
| `buff_attack` | value, target | 다음 공격력 버프 |
| `burn` | value (dmgPerTurn), turns, target | 매 턴 데미지 |
| `airborne` | value (스택 수) | 체공 상태 부여 |
| `move_cards` | count, fromZone, toZone, toPosition, userSelects | 카드 영역 간 이동 |
| `shuffle` | zone | 대상 영역 셔플 |
| `generate` | cardId, toZone, toPosition, count | 지정 카드 생성 |
| `tag` | - | 캐릭터 교체 |

---

## 8. StatModifier (조건부 스탯 보정)

카드 자체 스탯이 조건에 따라 변하는 시스템.

```json
{
  "statModifiers": [
    {
      "condition": {
        "check": "deck_count" | "hp" | "hand_count" | "cooldown_count" | "bench_hp" | "airborne_stack" | "turn" | "round",
        "target": "self" | "enemy",
        "op": "<" | ">" | "=",
        "value": 숫자
      },
      "stat": "cost" | "speed" | "ground_attack" | "anti_air_attack" | "gain",
      "delta": 변화량  // 음수 = 감소, 양수 = 증가
    }
  ]
}
```

**예시 카드:**
- `배수진`: 덱 2장 이하 시 Cost -2
- `사투`: 자신 HP 5 이하 시 ground_attack +3
- `압박 잽`: 상대 핸드 5장 초과 시 Speed -1

---

## 9. 현재 카드 목록 (13종)

| 이름 | Cost | Speed | 효과 요약 |
|------|------|-------|-----------|
| 잽 | 3 | 2 | 1 지상 데미지 |
| 스트레이트 | 3 | 3 | 2 지상 데미지 |
| 어퍼컷 | 3 | 3 | 3 대공 데미지 |
| 휘둘러치기 | 3 | 4 | 2 지상 데미지 + 체공 2 부여 |
| 선풍각 | 3 | 4 | 2 지상 + 4 대공 데미지 + 체공 2 부여 |
| 장풍 | 5 | 4 | 5 지상 데미지 |
| 승룡권 | 5 | 4 | 3 지상 + 3 대공 데미지 + 상대 체공 2 부여 |
| 준비 태세 | 0 | 1 | 덱에서 2장 선택 → 핸드 |
| 전략 수립 | 0 | 1 | 트래시에서 1장 → 핸드 |
| 도시락 먹기 | 1 | 0 | 트래시 3장 → 덱, 덱 셔플 |
| 사투 | 3 | 4 | 2 지상 데미지. HP 5 이하 시 +3 (StatModifier) |
| 압박 잽 | 2 | 3 | 1 지상 데미지. 상대 핸드 5초과 시 Speed -1 (StatModifier) |
| 배수진 | 4 | 3 | 4 지상 데미지. 덱 2이하 시 Cost -2 (StatModifier) |

---

## 10. 현재 덱 (1종)

**PROTOTYPE** — 33장
- 잽×3, 스트레이트×3, 어퍼컷×3, 휘둘러치기×3, 선풍각×3
- 장풍×3, 승룡권×3
- 준비 태세×3, 전략 수립×3, 도시락 먹기×3
- 사투×1, 압박 잽×1, 배수진×1

---

## 11. 밸런싱 기준

### 코스트 vs 효과 감각
- Cost 0: 리소스 회복 / 핸드 조작. 데미지 없어야 자연스러움
- Cost 1-2: 약한 효과 or 조건부 강력
- Cost 3: 기본 공격 (2-3 데미지)
- Cost 4-5: 강한 공격 (4-5 데미지) or 복합 효과

### 스피드 감각
- Speed 0-1: 매우 빠름. 스킬/서포트 카드에 어울림
- Speed 2-3: 중속. 범용 공격
- Speed 4+: 느림. 고화력이어야 의미 있음

### 카운터 상호작용
- 빠른 카드(저 Speed)가 먼저 처리되어 상대의 느린 공격 카드를 카운터 가능
- 카운터당하면 코스트만 낭비 → 느린 고화력 카드는 리스크 있음

### airborne 상호작용
- 체공 부여 카드 + 대공 카드의 콤보 가능
- 체공 중에는 지상 공격 무효 → 안전하게 상대 공격 회피 가능

### StatModifier 설계 팁
- 조건은 `hp`, `deck_count`, `hand_count` 위주로 활용
- `delta` 절댓값이 너무 크면 조건 충족 순간 밸런스 붕괴 → 최대 ±3 권장
- cost 감소는 리소스 경제를 크게 흔들 수 있으니 조건을 빡빡하게

### CardType 주의
- `skill` 카드는 카운터되지 않음 → 안정적으로 효과 발동 보장
- `attack` 카드만 카운터 대상이며 이니셔티브 이전도 attack만 해당

---

## 12. 데이터 파일 위치

- 카드 데이터: `src/data/cards.json`
- 덱 데이터: `src/data/decks.json`
- 타입 정의: `src/game/engine/types.ts`
- 카드 태그: `types.ts > CardTag`
- 효과 타입: `types.ts > EffectType`
