import type { FighterPose } from "@/game/engine/types";

/** 스프라이트 시트 사양 */
export const SHEET = {
  /** 시트 내 프레임 한 칸의 원본 크기 (px) */
  frameW: 360,
  frameH: 360,
  /** 시트 열/행 수 */
  cols: 6,
  rows: 6,
  /** 화면에 표시할 크기 (px) */
  displayW: 180,
  displayH: 180,
} as const;

/**
 * 프레임 인덱스 → CSS background-position 계산
 * 프레임 0 = (col=0, row=0), 프레임 5 = (col=5, row=0), 프레임 6 = (col=0, row=1) ...
 */
export function frameToBackgroundPosition(frameIndex: number): string {
  const col = frameIndex % SHEET.cols;
  const row = Math.floor(frameIndex / SHEET.cols);
  const x = col * SHEET.displayW;
  const y = row * SHEET.displayH;
  return `-${x}px -${y}px`;
}

/**
 * CSS background-size: 시트 전체를 표시 크기에 맞게 축소
 */
export const BACKGROUND_SIZE =
  `${SHEET.cols * SHEET.displayW}px ${SHEET.rows * SHEET.displayH}px`;

export type PoseEntry = {
  /** 재생할 프레임 인덱스 배열 */
  frames: number[];
  /** 초당 프레임 수 */
  fps: number;
  /**
   * true = 마지막 프레임에서 멈춤 (공격 등 one-shot)
   * false = 루프 (idle 등)
   */
  hold: boolean;
};

/**
 * 스프라이트 시트 레이아웃 (6열 × 5행, 360×360)
 *
 * Row 0 (idx 0–5):   Idle
 * Row 1 (idx 6–11):  Attack
 * Row 2 (idx 12–17): Hit / Launch
 * Row 3 (idx 18–23): Airborne / Block
 * Row 4 (idx 24–29): KO
 */
export const SPRITE_MAP: Record<FighterPose, PoseEntry> = {
  idle: {
    frames: [0, 1],
    fps: 8,
    hold: false,
  },
  attack_slash: {
    frames: [6, 7, 8, 9, 10, 11],
    fps: 14,
    hold: true,
  },
  attack_strike: {
    frames: [6, 7, 8, 9, 10, 11],
    fps: 12,
    hold: true,
  },
  attack_magic: {
    frames: [6, 7, 8, 9, 10, 11],
    fps: 10,
    hold: true,
  },
  block: {
    frames: [27],
    fps: 8,
    hold: true,
  },
  hit: {
    frames: [30, 31],
    fps: 12,
    hold: true,
  },
  airborne: {
    frames: [18, 19, 20, 21],
    fps: 10,
    hold: false,
  },
  ko: {
    frames: [24, 25, 26, 27, 28, 29],
    fps: 10,
    hold: true,
  },

  attack_weak_punch: {
    frames: [2,3],
    fps: 12,
    hold: true,
  },

  attack_strong_punch: {
    frames: [4,5],
    fps: 14,
    hold: true,
  },

  attack_weak_kick: {
    frames: [6, 7, 8],
    fps: 12,
    hold: true,
  },

  attack_strong_kick: {
    frames: [9, 10, 11],
    fps: 14,
    hold: true,
  },

  attack_dragon_kick: {
    frames: [12, 13, 14],
    fps: 16,
    hold: true,
  },

  attack_rising_punch: {
    frames: [15, 16, 17, 18, 19, 20, 21],
    fps: 12,
    hold: true,
  },

  attack_hadouken: {
    frames: [22,23,24,25,26],
    fps: 10,
    hold: true,
  },

  use_item: {
    frames: [28,29],
    fps: 12,
    hold: true,
  },

};
