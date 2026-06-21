import type { GameState, PlayerId } from "../engine/types";
import { TUT_CHARS, benchOf } from "./tutorialChars";
import { TUT_FILLER_ID } from "./tutorialCards";

export type TutorialInitialState = {
  p1Hp: number;
  aiHp: number;
  p1Hand: string[];
  p1Deck: string[];
  aiHand: string[];
  aiDeck: string[];
  initiative: PlayerId;
  p1ActiveCharId?: string;
  p1BenchChar?: { id: string; hp: number };
  aiActiveCharId?: string;
  aiBenchChar?: { id: string; hp: number };
  startingRound?: number;
  startingPhase?: GameState["phase"];
};

export type TutorialStage = {
  id: string;
  title: string;
  description: string;
  hint: string;
  goalText: string;
  maxTurns?: number;
  successCondition: (state: GameState) => boolean;
  failCondition: (state: GameState, turn: number) => boolean;
  initialState: TutorialInitialState;
  /** 턴별 AI 행동 스크립트. 생략 시 실제 대전 AI 룰(selectCard/shouldTag)을 사용한다. */
  aiScript?: string[][];
};

const F = TUT_FILLER_ID;
const fill = (n: number): string[] => Array(n).fill(F);

export const TUTORIAL_STAGES: TutorialStage[] = [
  {
    id: "stage1",
    title: "Stage 1 — 공격 카드, 코스트, 덱",
    description:
      "카드를 사용하면 덱에서 코스트만큼 카드가 소모됩니다.\n" +
      "덱이 소진되면 더 이상 카드를 낼 수 없습니다.\n" +
      "AI는 3턴째에 즉사기를 발동합니다. 그 전에 쓰러뜨리세요.",
    hint: "덱 6장 = 카드를 딱 2장 낼 수 있습니다.\n한 장당 데미지를 최대화하세요.",
    goalText: "3턴 안에 AI를 처치하세요",
    maxTurns: 3,
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s, turn) =>
      (s.phase === "GAME_OVER" && s.winner !== "P1") ||
      (turn > 3 && s.phase !== "GAME_OVER"),
    initialState: {
      p1Hp: 8,
      aiHp: 4,
      p1Hand: ["tut_jab", "tut_jab", "tut_straight", "tut_straight"],
      p1Deck: fill(6),
      aiHand: ["tut_bomb", F, F],
      aiDeck: fill(6),
      initiative: "P1",
    },
    aiScript: [[], [], ["tut_bomb"]],
  },
  {
    id: "stage2",
    title: "Stage 2 — 스피드 · 캔슬",
    description:
      "스피드가 낮을수록 먼저 발동합니다.\n" +
      "먼저 발동한 공격이 직접 타격하면 상대 카드를 캔슬합니다.\n" +
      "AI는 매 턴 스트레이트(속도 3)를 사용합니다.",
    hint: "속도 2인 잽이 속도 3인 스트레이트보다 빠릅니다.\n먼저 맞히면 상대 공격을 카운터하고, 다음 공격에 스피드 보너스까지 얻습니다.",
    goalText: "AI를 처치하세요 (내 HP를 지키세요!)",
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s) => s.phase === "GAME_OVER" && s.winner !== "P1",
    initialState: {
      p1Hp: 2,
      aiHp: 3,
      p1Hand: ["tut_jab", "tut_rising", "tut_straight"],
      p1Deck: fill(15),
      aiHand: ["tut_straight", "tut_straight", "tut_straight", "tut_straight", "tut_straight", F, F],
      aiDeck: fill(15),
      initiative: "AI",
    },
    aiScript: [
      ["tut_straight"], ["tut_straight"], ["tut_straight"],
      ["tut_straight"], ["tut_straight"],
    ],
  },
  {
    id: "stage3",
    title: "Stage 3 — 패스와 타이밍",
    description:
      "느린 카드(속도 4)는 빠른 카드(속도 2)에게 캔슬당합니다.\n" +
      "AI는 처음 2턴만 잽을 사용하고 이후 패스합니다.\n" +
      "AI의 잽이 소진된 뒤 승룡권을 사용하세요.",
    hint: "AI의 공격이 끝날 때까지 기다리세요.\n3턴째부터 승룡권을 안전하게 사용할 수 있습니다.",
    goalText: "5턴 안에 AI를 처치하세요",
    maxTurns: 5,
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s, turn) =>
      (s.phase === "GAME_OVER" && s.winner !== "P1") ||
      (turn > 5 && s.phase !== "GAME_OVER"),
    initialState: {
      p1Hp: 8,
      aiHp: 5,
      p1Hand: ["tut_rising", "tut_rising"],
      p1Deck: Array(10).fill("tut_rising"),
      aiHand: ["tut_jab", "tut_jab", F, F, F],
      aiDeck: fill(6),
      initiative: "P1",
    },
    aiScript: [["tut_jab"], ["tut_jab"], [], [], []],
  },
  {
    id: "stage4",
    title: "Stage 4 — 에어본",
    description:
      "AI가 주도권을 갖고 매 턴 잽을 씁니다.\n" +
      "대공기는 상대를 공중으로 띄우고, 공중의 적에게 강한 데미지를 줍니다.\n" +
      "도약으로 먼저 피한 뒤, 대공기를 두 번 연속으로 사용하세요.",
    hint: "1턴: 도약으로 잽을 피하세요.\n2턴: 대공기로 상대를 띄우세요.\n3턴: 공중의 AI에게 대공기로 마무리하세요.",
    goalText: "3턴 안에 AI를 처치하세요",
    maxTurns: 3,
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s, turn) =>
      (s.phase === "GAME_OVER" && s.winner !== "P1") ||
      (turn > 3 && s.phase !== "GAME_OVER"),
    initialState: {
      p1Hp: 1,
      aiHp: 3,
      p1Hand: ["tut_jump", "tut_uppercut", "tut_uppercut"],
      p1Deck: fill(4),
      aiHand: ["tut_jab", F, F],
      aiDeck: fill(9),
      initiative: "AI",
    },
    aiScript: [["tut_jab"], [], []],
  },
  {
    id: "stage5",
    title: "Stage 5 — 태그",
    description:
      "TAG 버튼으로 벤치 캐릭터와 교체할 수 있습니다.\n" +
      "캐릭터마다 사용할 수 있는 카드가 다릅니다.\n" +
      "전사를 TAG로 피신시키고, 다음 턴 돌아와 반격하세요.",
    hint: "1턴: TAG로 전사를 피신시키고 패스하세요.\n2턴: TAG로 전사를 불러내 파워 스트라이크로 마무리하세요.",
    goalText: "2턴 안에 AI를 처치하세요",
    maxTurns: 2,
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s, turn) =>
      (s.phase === "GAME_OVER" && s.winner !== "P1") ||
      (turn > 2 && s.phase !== "GAME_OVER"),
    initialState: {
      p1Hp: TUT_CHARS.warrior.maxHp,
      aiHp: 6,
      p1ActiveCharId: TUT_CHARS.warrior.id,
      p1BenchChar: benchOf(TUT_CHARS.fighter),
      p1Hand: ["tut_power_strike"],
      p1Deck: Array(10).fill("tut_power_strike"),
      aiHand: ["tut_jab", F, F],
      aiDeck: fill(6),
      initiative: "AI",
    },
    aiScript: [["tut_jab"], []],
  },
  {
    id: "stage6",
    title: "Stage 6 — 2대2 태그 대전",
    description:
      "2명의 팀원과 함께 3라운드 대전을 펼칩니다.\n" +
      "매 라운드 시작 시 덱에서 카드를 드래프트하세요.\n" +
      "태그로 팀원을 교체해 HP를 나눠 받으면 유리합니다.",
    hint: "드래프트에서 덱의 카드 3장을 골라 핸드로 가져오세요.\n태그를 활용해 두 팀원의 HP를 고르게 유지하면 3라운드 후 유리합니다.",
    goalText: "3라운드 후 AI보다 총 HP를 많이 남기세요",
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s) => s.phase === "GAME_OVER" && s.winner !== "P1",
    initialState: {
      p1Hp: TUT_CHARS.teamA.maxHp,
      aiHp: TUT_CHARS.teamA.maxHp,
      p1ActiveCharId: TUT_CHARS.teamA.id,
      p1BenchChar: benchOf(TUT_CHARS.teamB),
      aiActiveCharId: TUT_CHARS.teamA.id,
      aiBenchChar: benchOf(TUT_CHARS.teamB),
      p1Hand: [],
      p1Deck: [
        ...Array(4).fill("tut_jab"),
        ...Array(3).fill("tut_straight"),
        ...Array(2).fill("tut_rising"),
        ...Array(2).fill("tut_jump"),
        ...Array(2).fill("tut_uppercut"),
      ],
      aiHand: [],
      aiDeck: [
        ...Array(6).fill("tut_straight"),
        ...Array(3).fill("tut_jab"),
      ],
      initiative: "P1",
      startingRound: 1,
      startingPhase: "ROUND_DRAFT",
    },
    // aiScript 생략 → 실제 대전 AI 룰(selectCard/shouldTag/selectDraftCards) 사용
  },
];
