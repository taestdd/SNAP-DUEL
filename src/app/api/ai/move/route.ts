import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { CardsRecordSchema } from "@/game/engine/cardSchema";
import { CharactersRecordSchema } from "@/game/engine/characterSchema";
import { initCards, getCard } from "@/game/engine/cards";
import { initCharacters, CHARACTERS } from "@/game/engine/characters";
import { getPlayableCards, deriveCardStats } from "@/game/engine/rules";
import { selectCard, shouldTag, selectDraftCards, selectDiscards, oppFastestAttackDelay, dealsDamage } from "@/game/engine/ai";
import { opponentOf } from "@/game/engine/stateHelpers";
import {
  resolveSetupDecision,
  resolveSelectionDecision,
  resolveDraftDecision,
  resolveDiscardDecision,
} from "@/game/engine/aiMoveValidation";
import type { GameState, PlayerId } from "@/game/engine/types";
import { getAnthropicClient, CLAUDE_OPPONENT_MODEL, GAME_RULES_SYSTEM_PROMPT } from "@/lib/claude";

export const runtime = "nodejs";

/* ── 카드/캐릭터 레지스트리 준비 (공개 /api/cards, /api/characters와 같은 캐시) ── */

const getCachedCards = unstable_cache(
  async () => {
    const snapshot = await getAdminDb().collection("cards").get();
    const raw: Record<string, unknown> = {};
    snapshot.forEach((d) => { raw[d.id] = d.data(); });
    return CardsRecordSchema.parse(raw);
  },
  ["cards"],
  { tags: ["cards"] },
);

const getCachedCharacters = unstable_cache(
  async () => {
    const snapshot = await getAdminDb().collection("characters").get();
    const raw: Record<string, unknown> = {};
    snapshot.forEach((d) => { raw[d.id] = d.data(); });
    return CharactersRecordSchema.parse(raw);
  },
  ["characters"],
  { tags: ["characters"] },
);

async function ensureRegistries(): Promise<void> {
  const [cards, characters] = await Promise.all([getCachedCards(), getCachedCharacters()]);
  initCards(cards);
  initCharacters(characters);
}

/* ── 상태 요약 (프롬프트용) ─────────────────────────────────────────────── */

const PLAYER = "AI" as const; // Claude가 조종하는 쪽은 항상 AI 슬롯

function fmtCombatant(state: GameState, player: PlayerId): string {
  const c = state[player];
  const active = CHARACTERS[c.activeCharacter];
  const bench = Object.keys(c.characterHp).find((id) => id !== c.activeCharacter);
  const benchHp = bench ? c.characterHp[bench] : 0;
  const benchDef = bench ? CHARACTERS[bench] : undefined;

  const parts = [
    `${player}: HP ${c.hp} (활성 캐릭터 ${active?.name ?? c.activeCharacter}, 벤치 ${benchDef?.name ?? bench ?? "-"} HP ${benchHp})`,
    `블록 ${c.block}, airborne ${c.airborneStack}, 손패 ${c.hand.length}장, 덱 ${c.deck.length}장${c.status.exhausted ? " (exhausted)" : ""}`,
  ];
  if ((c.status.buffs?.length ?? 0) > 0) {
    parts.push(`버프: ${c.status.buffs!.map((b) => `${b.stat} ${b.delta >= 0 ? "+" : ""}${b.delta}`).join(", ")}`);
  }
  if ((c.status.poisons?.length ?? 0) > 0) {
    parts.push(`중독: ${c.status.poisons!.map((p) => `턴당 ${p.damage} (${p.turns}턴 남음)`).join(", ")}`);
  }
  if (c.queue.length > 0) {
    const queuedId = c.queue[0];
    const queuedCard = getCard(queuedId);
    if (queuedCard) {
      // 이름만 보여주면 딜레이를 몰라 카운터 위험을 판단할 수 없다 — 실효 스탯까지 보여준다
      const qStats = deriveCardStats(state, player, queuedId);
      const atk = qStats.groundAttack > 0 || qStats.antiAirAttack > 0
        ? ` 공격력(지상${qStats.groundAttack}/대공${qStats.antiAirAttack})`
        : "";
      parts.push(`이번 턴 낸 카드: "${queuedCard.name}" [${queuedCard.cardType ?? "skill"}] 딜레이${qStats.delay}${atk}`);
    } else {
      parts.push(`이번 턴 낸 카드: ${queuedId}`);
    }
  }
  return parts.join("\n  ");
}

function fmtHand(state: GameState): string {
  const playable = getPlayableCards(state, PLAYER);
  if (playable.length === 0) return "(낼 수 있는 카드 없음 — 패스만 가능)";

  // 로컬 규칙 AI(ai.ts)와 같은 기준으로 "이 공격 카드를 내면 100% 카운터당하는지"를
  // 미리 계산해 둔다 — Claude가 델레이 숫자를 직접 비교해 추론하게 두면 종종 틀린다.
  const hasInitiative = state.initiative === PLAYER;
  const oppFastest = oppFastestAttackDelay(state, PLAYER);

  return playable
    .map(({ id }) => {
      const card = getCard(id);
      if (!card) return null;
      const stats = deriveCardStats(state, PLAYER, id);
      const atk = stats.groundAttack > 0 || stats.antiAirAttack > 0
        ? ` 공격력(지상${stats.groundAttack}/대공${stats.antiAirAttack})`
        : "";
      const guaranteedCounter = !hasInitiative && dealsDamage(state, PLAYER, card) && stats.delay > oppFastest
        ? " ⚠️카운터 확정 — 상대가 먼저 때려 이 카드는 그대로 무효화(트래시행)됩니다"
        : "";
      return `- ${id} "${card.name}" [${card.cardType ?? "skill"}] 코스트${stats.cost} 딜레이${stats.delay}${atk} 어드밴티지${stats.advantage} — ${card.text}${guaranteedCounter}`;
    })
    .filter(Boolean)
    .join("\n");
}

function fmtCommonHeader(state: GameState, deckHint?: string): string {
  const lines = [
    `라운드 ${state.round} / 턴 ${state.turn} / 주도권: ${state.initiative}`,
    fmtCombatant(state, PLAYER),
    fmtCombatant(state, opponentOf(PLAYER)),
  ];
  // 덱 작성자가 남긴 이 덱 고유의 노림수 — "판단 원칙"(게임 전체 공통)과 별개로 매 요청에 실린다
  if (deckHint) lines.push(`\n이 덱의 전략 지침: ${deckHint}`);
  return lines.join("\n");
}

/* ── Claude 호출 ────────────────────────────────────────────────────────── */

const REQUEST_TIMEOUT_MS = 12_000;

async function callClaudeTool(
  userText: string,
  toolName: string,
  toolDescription: string,
  properties: Record<string, unknown>,
  required: string[],
): Promise<Record<string, unknown> | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`[ai/move] ANTHROPIC_API_KEY 미설정 — ${toolName} 폴백`);
    return null;
  }

  try {
    const client = getAnthropicClient();
    const res = await client.messages.create(
      {
        model: CLAUDE_OPPONENT_MODEL,
        max_tokens: 512,
        system: [{ type: "text", text: GAME_RULES_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
        tools: [{
          name: toolName,
          description: toolDescription,
          input_schema: { type: "object", properties, required },
        }],
        tool_choice: { type: "tool", name: toolName },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    const toolUse = res.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      console.error(`[ai/move] ${toolName}: tool_use 블록 없음 — stop_reason=${res.stop_reason}`);
      return null;
    }
    return toolUse.input as Record<string, unknown>;
  } catch (e) {
    // 타임아웃·네트워크 오류·API 오류 — 전부 폴백으로 떨어지되, 원인은 로그에 남긴다
    console.error(`[ai/move] ${toolName} 호출 실패 — 폴백:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/* ── Claude 판단 근거 (기보 다운로드용) ───────────────────────────────────
 * 게임 결과에는 영향을 주지 않는 부가 데이터라 결정 검증(aiMoveValidation)과는
 * 분리해 둔다 — reasoning이 비어 있거나 이상해도 결정 자체는 멀쩡히 진행된다.
 */
const REASONING_FIELD = {
  reasoning: { type: "string", description: "이 결정을 내린 이유를 1~2문장으로 (기보에 그대로 기록됨)" },
};

function extractReasoning(input: Record<string, unknown> | null): string | null {
  return input && typeof input.reasoning === "string" && input.reasoning.trim()
    ? input.reasoning.trim()
    : null;
}

/* ── kind별 처리 ────────────────────────────────────────────────────────── */

async function handleSetup(state: GameState, deckHint?: string) {
  const fallback = { tag: shouldTag(state, PLAYER), play: selectCard(state, PLAYER) };

  const userText = [
    fmtCommonHeader(state, deckHint),
    "",
    "지금 SETUP 단계입니다. 이번 턴 낼 카드를 하나 고르거나(손패에서) 패스하세요.",
    "필요하면 캐릭터를 교체(태그)할 수도 있습니다 (벤치 캐릭터 HP가 남아있어야 함).",
    "⚠️카운터 확정 표시가 붙은 카드는 델레이를 직접 계산할 필요 없이 이미 확정된 결과입니다 —",
    "특별한 이유(예: 어차피 낼 다른 공격 카드가 없어 손패 회전이 급함)가 없으면 내지 마세요.",
    "",
    "손패:",
    fmtHand(state),
  ].join("\n");

  const input = await callClaudeTool(
    userText, "setup_decision", "SETUP 단계 결정 — 낼 카드와 태그 여부",
    {
      tag: { type: "boolean", description: "캐릭터를 교체할지" },
      cardId: { type: "string", description: "낼 카드의 id. 패스하려면 빈 문자열" },
      ...REASONING_FIELD,
    },
    ["tag", "cardId", "reasoning"],
  );
  return { ...resolveSetupDecision(state, input, fallback), reasoning: extractReasoning(input) };
}

async function handleSelection(state: GameState, deckHint?: string) {
  const ps = state.pendingSelection!;
  const fallback = { selectedCards: ps.candidates.slice(0, ps.count) };

  const candidateLines = ps.candidates
    .map((id) => {
      const c = getCard(id);
      return c ? `- ${id} "${c.name}" — ${c.text}` : `- ${id}`;
    })
    .join("\n");

  const userText = [
    fmtCommonHeader(state, deckHint),
    "",
    `카드 효과로 카드를 선택해야 합니다 (${ps.fromZone} → ${ps.toZone}). 최대 ${ps.count}장, 적게 골라도 됩니다.`,
    "후보:",
    candidateLines,
  ].join("\n");

  const input = await callClaudeTool(
    userText, "selection_decision", "카드 선택 효과 결정",
    {
      cardIds: { type: "array", items: { type: "string" }, description: `선택할 카드 id 목록 (최대 ${ps.count}장, 빈 배열 가능)` },
      ...REASONING_FIELD,
    },
    ["cardIds", "reasoning"],
  );
  return { ...resolveSelectionDecision(ps.candidates, ps.count, input, fallback), reasoning: extractReasoning(input) };
}

async function handleDraft(state: GameState, count: number, deckHint?: string) {
  const fallback = { cardIds: selectDraftCards(state, PLAYER, count) };

  const deckLines = state.AI.deck
    .map((id) => {
      const c = getCard(id);
      return c ? `- ${id} "${c.name}" [${c.cardType ?? "skill"}] 코스트${c.cost} 딜레이${c.delay} — ${c.text}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const userText = [
    fmtCommonHeader(state, deckHint),
    "",
    `라운드 시작 드래프트입니다. 덱에서 정확히 ${count}장을 골라 손패로 가져오세요.`,
    "덱:",
    deckLines,
  ].join("\n");

  const input = await callClaudeTool(
    userText, "draft_decision", "라운드 드래프트 결정",
    {
      cardIds: { type: "array", items: { type: "string" }, description: `덱에서 가져올 카드 id 목록, 정확히 ${count}장` },
      ...REASONING_FIELD,
    },
    ["cardIds", "reasoning"],
  );
  return { ...resolveDraftDecision(state.AI.deck, count, input, fallback), reasoning: extractReasoning(input) };
}

async function handleDiscard(state: GameState, deckHint?: string) {
  const pd = state.pendingDiscard!;
  const fallback = { discardCards: selectDiscards(state, PLAYER, pd.count) };

  const handLines = state.AI.hand
    .map((id, idx) => {
      const c = getCard(id);
      return `- ${id} "${c?.name ?? id}" (idx ${idx})`;
    })
    .join("\n");

  const userText = [
    fmtCommonHeader(state, deckHint),
    "",
    `손패가 한도를 넘어 정확히 ${pd.count}장을 버려야 합니다.`,
    "손패:",
    handLines,
  ].join("\n");

  const input = await callClaudeTool(
    userText, "discard_decision", "손패 초과분 버리기 결정",
    {
      cardIds: {
        type: "array", items: { type: "string" },
        description: `버릴 카드 id 목록, 정확히 ${pd.count}장. 같은 카드가 손패에 여러 장 있으면 그만큼 반복해서 적는다`,
      },
      ...REASONING_FIELD,
    },
    ["cardIds", "reasoning"],
  );
  return { ...resolveDiscardDecision(state.AI.hand, pd.count, input, fallback), reasoning: extractReasoning(input) };
}

/* ── 라우트 ─────────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  let body: { kind?: string; state?: GameState; count?: number; deckHint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const { kind, state, count, deckHint } = body;
  if (!state || typeof state !== "object" || !state.AI || !state.P1) {
    return NextResponse.json({ error: "state가 없거나 형식이 잘못됨" }, { status: 400 });
  }

  try {
    await ensureRegistries();

    switch (kind) {
      case "setup":
        return NextResponse.json(await handleSetup(state, deckHint));
      case "selection":
        if (!state.pendingSelection) return NextResponse.json({ error: "pendingSelection 없음" }, { status: 400 });
        return NextResponse.json(await handleSelection(state, deckHint));
      case "draft":
        if (typeof count !== "number" || count <= 0) return NextResponse.json({ error: "count 필요" }, { status: 400 });
        return NextResponse.json(await handleDraft(state, count, deckHint));
      case "discard":
        if (!state.pendingDiscard) return NextResponse.json({ error: "pendingDiscard 없음" }, { status: 400 });
        return NextResponse.json(await handleDiscard(state, deckHint));
      default:
        return NextResponse.json({ error: `알 수 없는 kind: ${kind}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "서버 오류" }, { status: 500 });
  }
}
