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

/**
 * 새 스프라이트 시트: 낱장 1.png~35.png(560×560)를 5열×7행으로 합친 시트.
 * scripts/build-spritesheets.py로 생성 (셀 280×280, 시트 1400×1960).
 * 프레임 인덱스 = 낱장 파일 번호 - 1 (행 우선: idx 0~4 = 1행, 5~9 = 2행, ...)
 */
const DEFAULT_SHEET: SheetSpec = {
  frameW: 280,
  frameH: 280,
  cols: 5,
  rows: 7,
  displayW: 180,
  displayH: 180,
};

const DEFAULT_POSES: Record<FighterPose, PoseEntry> = {
  idle:               { frames: [0],                                  fps: 6,  hold: false },
  dash:               { frames: [30],                                 fps: 6,  hold: true  },
  attack_weak_punch:  { frames: [1, 2, 3],                            fps: 10, hold: true  },
  attack_strong_punch:{ frames: [8, 9, 10],                           fps: 10, hold: true  },
  attack_aerial_punch:{ frames: [1, 2],                               fps: 10, hold: true  },
  attack_weak_kick:   { frames: [1, 4, 5, 7],                         fps: 8,  hold: true  },
  attack_strong_kick: { frames: [1, 4, 5, 7],                         fps: 8,  hold: true  },
  attack_aerial_kick: { frames: [1, 4, 5, 7],                         fps: 8,  hold: true  },
  attack_hadouken:    { frames: [8, 11, 12, 7],                       fps: 8,  hold: true  },
  attack_dragon_kick: { frames: [14, 15, 16, 13, 14, 15, 16, 7],      fps: 6,  hold: true  },
  attack_rising_punch:{ frames: [1, 4, 6, 7],                         fps: 6,  hold: true  },
  use_item:           { frames: [34],                                 fps: 8,  hold: true  },
  ko:                 { frames: [33],                                 fps: 5,  hold: true  },
  hit_weak:           { frames: [20, 21, 19],                         fps: 10, hold: true  },
  hit_strong:         { frames: [20, 21, 19],                         fps: 10, hold: true  },
  hit_aerial:         { frames: [22, 23, 24],                         fps: 10, hold: true  },
  block:              { frames: [31],                                 fps: 6,  hold: true  },
  throw:              { frames: [13, 17, 18, 19],                     fps: 6,  hold: true  },
  tag_exit:           { frames: [25, 26],                             fps: 8,  hold: true  },
  jump:               { frames: [25, 26],                             fps: 8,  hold: true  }, // 점프 = tag_exit와 동일 스프라이트
  tag_entry:          { frames: [27, 28, 29],                         fps: 8,  hold: true  },
  land:               { frames: [28, 29],                             fps: 8,  hold: true  }, // 착지 = tag_entry 후반과 동일 스프라이트
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
