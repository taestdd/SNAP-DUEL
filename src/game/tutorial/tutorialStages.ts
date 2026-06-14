import type { GameState, PlayerId } from "../engine/types";

export type TutorialInitialState = {
  p1Hp: number;
  aiHp: number;
  p1Hand: string[];
  p1Deck: string[];
  aiHand: string[];
  aiDeck: string[];
  initiative: PlayerId;
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
  aiScript: string[][];
};

const F = "tut_filler";
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
    hint: "속도 2인 잽이 속도 3인 스트레이트보다 빠릅니다.\n먼저 맞히면 상대 공격이 취소됩니다.",
    goalText: "AI를 처치하세요 (내 HP를 지키세요!)",
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s) => s.phase === "GAME_OVER" && s.winner !== "P1",
    initialState: {
      p1Hp: 3,
      aiHp: 3,
      p1Hand: ["tut_jab", "tut_jab", "tut_jab", "tut_straight", "tut_straight"],
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
      aiHp: 6,
      p1Hand: ["tut_rising", "tut_rising"],
      p1Deck: fill(10),
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
      "도약하면 공중 상태가 되어 지상 공격을 회피합니다.\n" +
      "어퍼컷은 공중의 적을 공격하며, 지상에 있을 때만 사용 가능합니다.\n" +
      "AI는 1턴에 잽, 2턴에 도약합니다.",
    hint: "도약으로 AI 공격을 피하고\n어퍼컷으로 공중의 AI를 노리세요.",
    goalText: "2턴 안에 AI를 처치하세요",
    maxTurns: 2,
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s, turn) =>
      (s.phase === "GAME_OVER" && s.winner !== "P1") ||
      (turn > 2 && s.phase !== "GAME_OVER"),
    initialState: {
      p1Hp: 3,
      aiHp: 2,
      p1Hand: ["tut_jump", "tut_jab", "tut_jab", "tut_uppercut", "tut_uppercut"],
      p1Deck: fill(4),
      aiHand: ["tut_jab", "tut_jump", F, F, F],
      aiDeck: fill(3),
      initiative: "P1",
    },
    aiScript: [["tut_jab"], ["tut_jump"], [], []],
  },
  {
    id: "stage5",
    title: "Stage 5 — 라운드 구조",
    description:
      "게임은 3라운드로 진행됩니다.\n" +
      "덱이 소진되면 라운드가 종료되고, HP가 높은 쪽이 유리합니다.\n" +
      "3라운드 후 총 HP 합계가 높은 쪽이 최종 승리합니다.",
    hint: "덱이 다 소진되면 이번 라운드가 끝납니다.\n남은 HP가 높은 쪽이 유리합니다.",
    goalText: "라운드가 끝날 때 AI보다 HP를 많이 남기세요",
    successCondition: (s) => s.phase === "GAME_OVER" && s.winner === "P1",
    failCondition: (s) => s.phase === "GAME_OVER" && s.winner !== "P1",
    initialState: {
      p1Hp: 8,
      aiHp: 8,
      p1Hand: ["tut_jab", "tut_jab", "tut_jab"],
      p1Deck: fill(9),
      aiHand: ["tut_jab", "tut_jab", "tut_jab", F, F],
      aiDeck: fill(9),
      initiative: "P1",
    },
    aiScript: [["tut_jab"], ["tut_jab"], ["tut_jab"]],
  },
];
