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
  return `-${col * sheet.displayW}px -${row * sheet.displayH}px`;
}

export function backgroundSize(sheet: SheetSpec): string {
  return `${sheet.cols * sheet.displayW}px ${sheet.rows * sheet.displayH}px`;
}

const DEFAULT_SHEET: SheetSpec = {
  frameW: 360,
  frameH: 360,
  cols: 6,
  rows: 6,
  displayW: 180,
  displayH: 180,
};

const DEFAULT_POSES: Record<FighterPose, PoseEntry> = {
  idle:               { frames: [0, 1],                      fps: 8,  hold: false },
  attack_slash:       { frames: [6, 7, 8, 9, 10, 11],        fps: 14, hold: true  },
  attack_strike:      { frames: [6, 7, 8, 9, 10, 11],        fps: 12, hold: true  },
  attack_magic:       { frames: [6, 7, 8, 9, 10, 11],        fps: 10, hold: true  },
  block:              { frames: [27],                         fps: 8,  hold: true  },
  hit:                { frames: [30, 31],                     fps: 12, hold: true  },
  hit_weak:           { frames: [30],                         fps: 8,  hold: true  },
  hit_strong:         { frames: [30, 31],                     fps: 12, hold: true  },
  hit_aerial:         { frames: [31],                         fps: 8,  hold: true  },
  airborne:           { frames: [18, 19, 20, 21],             fps: 10, hold: false },
  ko:                 { frames: [24, 25, 26, 27, 28, 29],     fps: 10, hold: true  },
  attack_weak_punch:  { frames: [2, 3],                       fps: 12, hold: true  },
  attack_strong_punch:{ frames: [4, 5],                       fps: 14, hold: true  },
  attack_weak_kick:   { frames: [6, 7, 8],                    fps: 12, hold: true  },
  attack_strong_kick: { frames: [9, 10, 11],                  fps: 14, hold: true  },
  attack_dragon_kick: { frames: [12, 13, 14],                 fps: 16, hold: true  },
  attack_rising_punch:{ frames: [15, 16, 17, 18, 19, 20, 21], fps: 12, hold: true  },
  attack_hadouken:    { frames: [22, 23, 24, 25, 26],         fps: 10, hold: true  },
  use_item:           { frames: [28, 29],                     fps: 12, hold: true  },
  tag_exit:           { frames: [22, 23],                       fps: 6,  hold: false },
  tag_entry:          { frames: [24, 25, 26],                       fps: 9,  hold: true  },
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
