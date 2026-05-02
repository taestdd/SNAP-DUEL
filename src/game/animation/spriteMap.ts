import type { CharacterId, FighterPose } from "@/game/engine/types";

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
  frameW: 360,
  frameH: 360,
  cols: 6,
  rows: 7,
  displayW: 180,
  displayH: 180,
};

const DEFAULT_POSES: Record<FighterPose, PoseEntry> = {
  idle:               { frames: [0, 1],                       fps: 6,  hold: false },
  block:              { frames: [27],                         fps: 6,  hold: true  },
  hit_weak:           { frames: [30, 31],                     fps: 10, hold: true  },
  hit_strong:         { frames: [32, 33],                     fps: 10, hold: true  },
  hit_aerial:         { frames: [34, 35],                     fps: 10, hold: true  },
  ko:                 { frames: [24, 25, 26, 27, 28, 29],     fps: 5,  hold: true  },
  attack_weak_punch:  { frames: [2, 3],                       fps: 10, hold: true  },
  attack_strong_punch:{ frames: [4, 5],                       fps: 10, hold: true  },
  attack_aerial_punch:{ frames: [36, 37],                     fps: 10, hold: true  },
  attack_weak_kick:   { frames: [6, 7, 8],                    fps: 8,  hold: true  },
  attack_strong_kick: { frames: [9, 10, 11],                  fps: 8,  hold: true  },
  attack_dragon_kick: { frames: [15, 16, 17, 18, 19, 20, 21], fps: 6,  hold: true  },
  attack_aerial_kick: { frames: [38, 39, 40],                 fps: 8,  hold: true  },
  attack_rising_punch:{ frames: [22, 23, 24, 25, 26],         fps: 6,  hold: true  },
  attack_hadouken:    { frames: [12, 13, 14],                 fps: 8,  hold: true  },
  use_item:           { frames: [28, 29],                     fps: 8,  hold: true  },
  tag_exit:           { frames: [22, 23],                     fps: 8,  hold: false },
  tag_entry:          { frames: [24, 25, 26],                 fps: 8,  hold: true  },
};

export const CHARACTER_SPRITES: Record<CharacterId, CharacterSpriteConfig> = {
  A: {
    imagePath: "/sprites/char_a.png",
    sheet: DEFAULT_SHEET,
    poses: DEFAULT_POSES,
  },
  B: {
    imagePath: "/sprites/char_b.png",
    sheet: DEFAULT_SHEET,
    poses: DEFAULT_POSES,
  },
};
