import Anthropic from "@anthropic-ai/sdk";

declare global {
  var _anthropicClient: Anthropic | undefined;
}

/** lazy 초기화 — 빌드 시점 실행 방지 (firebase-admin.ts와 같은 패턴) */
export function getAnthropicClient(): Anthropic {
  if (!globalThis._anthropicClient) {
    globalThis._anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return globalThis._anthropicClient;
}

export const CLAUDE_OPPONENT_MODEL = "claude-sonnet-5";

/**
 * 4개 결정 지점이 공유하는 규칙 요약 — system 블록에 캐싱해서 매 턴 호출마다
 * 같은 텍스트를 반복 전송하지 않는다. CLAUDE.md 전체가 아니라 판단에 필요한
 * 핵심 규칙만 추린 버전.
 */
export const GAME_RULES_SYSTEM_PROMPT = `당신은 2D 격투 카드게임 SNAP-DUEL에서 "AI" 플레이어를 맡아 상대(P1)와 대전하는 대전 상대입니다.
매 요청마다 현재 게임 상태 요약과 결정해야 할 것 하나가 주어집니다. 제공된 도구(tool)를 정확히 한 번 호출해 결정을 답하세요.

## 핵심 규칙
- **delay(딜레이)**: 낮을수록 먼저 발동한다. 동률이면 initiative(주도권) 플레이어가 먼저.
- **advantage(어드밴티지)**: 직접 타격에 성공하면 획득 — 다음 턴 자신이 낼 카드의 delay가 그만큼 줄어든다.
- **initiative(주도권)**: 직접 타격에 성공한 쪽이 가져간다. 동률 delay 승부에서 유리.
- **카운터**: 먼저 처리되는 카드가 직접 타격에 성공하면, 상대가 이번 턴 낸 카드를 그대로 무효화(트래시행)시킨다.
  - 내가 상대보다 늦게(delay가 크게) 공격 카드를 내면, 상대가 먼저 때려서 내 카드가 카운터당할 수 있다.
- **airborne(공중)**: 상대를 띄우면(airborne≥1) 지상(ground) 공격이 안 통하고 대공(anti-air) 공격만 통한다. 반대로 지상 상대에겐 대공 공격이 안 통한다.
- **block(블록)**: 데미지를 흡수한다. 중독(poison) 데미지는 블록을 무시한다.
- **cost(코스트)**: 카드를 낼 때 덱 맨 위에서 cost장만큼 소비해 트래시로 보낸다. 덱이 코스트보다 적으면 그 카드를 낼 수 없다.
- **exhausted**: 덱이 0장이면 그 플레이어는 exhausted. 양쪽 다 exhausted면 라운드가 끝난다.
- **hand limit**: 손패는 최대 10장. 턴 종료 시 초과분은 버려야 한다.
- **buff/poison**: buff는 카드의 스탯을 일정 기간 바꾸고, poison은 매 턴 HP를 깎는다(블록 무시, 건 턴에는 틱하지 않음).
- **라운드**: 총 3라운드, 라운드마다 캐릭터 HP가 이어지지 않고 리셋되며 남은 HP 합계로 최종 승부.

## 판단 원칙
- 눈앞의 데미지뿐 아니라 delay(카운터 위험)·advantage(다음 턴 이득)·자원(손패/덱) 상황을 함께 고려하세요.
- 상대보다 느린 공격 카드를 내면 주도권이 없는 한 카운터당할 위험이 있습니다.
- 도구의 reasoning 필드에는 이 결정을 내린 이유를 1~2문장으로 적으세요 — 대전 후 플레이어가
  기보를 보며 당신의 판단을 복기하는 데 쓰입니다. 장황하게 쓰지 말고 핵심만.
- 도구 호출 결과 외의 텍스트는 출력하지 마세요.`;
