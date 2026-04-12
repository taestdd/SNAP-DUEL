import type { FighterPose } from "@/game/engine/types";

/**
 * 스프라이트 시트: public/sprites/sheet.png
 * 프레임 크기: 360×360px, 6열 5행 (총 30프레임)
 *
 * 행 구성 추정 (실제 이미지 확인 후 조정 필요):
 *   Row 0 (y=0):    idle(0~3) + punch(4~5)
 *   Row 1 (y=360):  kick(0~3) + spare(4~5)
 *   Row 2 (y=720):  slash(0~3) + special_attack(4~5)
 *   Row 3 (y=1080): tag_attack(0~3) + airborne(4~5)
 *   Row 4 (y=1440): hit_light(0~1) + hit_heavy(2~3) + guard(4~5)
 */

export interface SpriteFrame {
  x: number;
  y: number;
}

export interface PoseSequence {
  frames: SpriteFrame[];
  fps: number;
  loop: boolean;
}

function row(rowIndex: number, ...colIndices: number[]): SpriteFrame[] {
  return colIndices.map((col) => ({ x: col * 360, y: rowIndex * 360 }));
}

export const SPRITE_MAP: Record<FighterPose, PoseSequence> = {
  idle: {
    frames: row(0, 0, 1, 2, 3),
    fps: 8,
    loop: true,
  },
  punch: {
    frames: row(0, 4, 5),
    fps: 8,
    loop: false,
  },
  kick: {
    frames: row(1, 0, 1, 2, 3),
    fps: 8,
    loop: false,
  },
  slash: {
    frames: row(2, 0, 1, 2, 3),
    fps: 8,
    loop: false,
  },
  special_attack: {
    frames: row(2, 4, 5),
    fps: 8,
    loop: false,
  },
  tag_attack: {
    frames: row(3, 0, 1, 2, 3),
    fps: 8,
    loop: false,
  },
  airborne: {
    frames: row(3, 4, 5),
    fps: 8,
    loop: false,
  },
  hit_light: {
    frames: row(4, 0, 1),
    fps: 8,
    loop: false,
  },
  hit_heavy: {
    frames: row(4, 2, 3),
    fps: 8,
    loop: false,
  },
  guard: {
    frames: row(4, 4, 5),
    fps: 8,
    loop: false,
  },
};
