import type { FighterPose } from "@/game/engine/types";

export type SheetSpec = {
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  displayW: number;
  displayH: number;
};

export type PoseEntry = {
  frames: number[];
  fps: number;
  /** true = 마지막 프레임 고정 (공격 등), false = 루프 (idle 등) */
  hold: boolean;
};

export type CharacterSpriteConfig = {
  imagePath: string;
  sheet: SheetSpec;
  poses: Record<FighterPose, PoseEntry>;
};

export function frameToBackgroundPosition(frameIndex: number, sheet: SheetSpec): string {
  const col = frameIndex % sheet.cols;
  const row = Math.floor(frameIndex / sheet.cols);
  const x = sheet.cols === 1 ? 0 : (col / (sheet.cols - 1)) * 100;
  const y = sheet.rows === 1 ? 0 : (row / (sheet.rows - 1)) * 100;
  return `${x}% ${y}%`;
}

export function backgroundSize(sheet: SheetSpec): string {
  return `${sheet.cols * 100}% ${sheet.rows * 100}%`;
}

const DEFAULT_SHEET: SheetSpec = {
  frameW: 80,
  frameH: 80,
  cols: 4,
  rows: 10,
  displayW: 180,
  displayH: 180,
};

const DEFAULT_POSES: Record<FighterPose, PoseEntry> = {
  idle:               { frames: [0, 1],                        fps: 6,  hold: false },
  attack_weak_punch:  { frames: [2, 3],                        fps: 10, hold: true  },
  attack_strong_punch:{ frames: [4, 5],                        fps: 10, hold: true  },
  attack_aerial_punch:{ frames: [2, 3],                        fps: 10, hold: true  },
  attack_weak_kick:   { frames: [6, 7, 8],                     fps: 8,  hold: true  },
  attack_strong_kick: { frames: [9, 10, 11],                   fps: 8,  hold: true  },
  attack_aerial_kick: { frames: [6, 7, 8],                     fps: 8,  hold: true  },
  attack_hadouken:    { frames: [12, 13, 14],                  fps: 8,  hold: true  },
  attack_dragon_kick: { frames: [15, 16, 17, 18, 15, 16, 17], fps: 6,  hold: true  },
  attack_rising_punch:{ frames: [19, 20, 21, 22],              fps: 6,  hold: true  },
  use_item:           { frames: [23, 24],                      fps: 8,  hold: true  },
  ko:                 { frames: [24, 25, 26, 27, 28, 29],      fps: 5,  hold: true  },
  hit_weak:           { frames: [25, 26],                      fps: 10, hold: true  },
  hit_strong:         { frames: [27, 28],                      fps: 10, hold: true  },
  hit_aerial:         { frames: [29, 30],                      fps: 10, hold: true  },
  block:              { frames: [31, 32],                      fps: 6,  hold: true  },
  throw:              { frames: [33, 34, 35],                  fps: 6,  hold: true  },
  tag_exit:           { frames: [36, 37],                      fps: 8,  hold: true  },
  jump:               { frames: [36, 37],                      fps: 8,  hold: true  },
  tag_entry:          { frames: [38, 39],                      fps: 8,  hold: true  },
  land:               { frames: [38, 39],                      fps: 8,  hold: true  }, // 착지 = tag_entry와 동일 스프라이트
};

/** spriteId → 스프라이트 설정. 새 스프라이트 추가 시 여기에만 등록. */
export const CHARACTER_SPRITES: Record<string, CharacterSpriteConfig> = {
  a: {
    imagePath: "/sprites/char_a.png",
    sheet: DEFAULT_SHEET,
    poses: DEFAULT_POSES,
  },
  b: {
    imagePath: "/sprites/char_b.png",
    sheet: DEFAULT_SHEET,
    poses: DEFAULT_POSES,
  },
  c: {
    imagePath: "/sprites/char_c.png",
    sheet: DEFAULT_SHEET,
    poses: DEFAULT_POSES,
  },
  d: {
    imagePath: "/sprites/char_d.png",
    sheet: DEFAULT_SHEET,
    poses: DEFAULT_POSES,
  },
};
