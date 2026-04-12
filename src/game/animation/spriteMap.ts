import type { FighterPose } from "@/game/engine/types";

/**
 * 스프라이트 시트 레이아웃
 * sheet.png: 6열 × 5행, 각 프레임 360×360px
 * 렌더 크기: 180×180 (0.5 배율)
 * background-size: 1080px 900px
 *
 * 렌더 좌표 (0.5 배율 적용):
 *   col offset = col * -180
 *   row offset = row * -180
 *
 * Row 0 (y=0):   idle(col 0-3), punch(col 4-5)
 * Row 1 (y=-180): kick(col 0-5)
 * Row 2 (y=-360): slash(col 0-3), tag_attack(col 4-5)
 * Row 3 (y=-540): special_attack(col 0-3), airborne(col 4-5)
 * Row 4 (y=-720): hit_light(col 0-1), hit_heavy(col 2-3), guard(col 4-5)
 */

export type SpriteFrame = { x: number; y: number };

export type SpriteSequence = {
  frames: SpriteFrame[];
  fps: number;
  loop: boolean;
};

function row(r: number, cols: number[]): SpriteFrame[] {
  return cols.map((c) => ({ x: c * -180, y: r * -180 }));
}

export const SPRITE_MAP: Record<FighterPose, SpriteSequence> = {
  idle: {
    frames: row(0, [0, 1, 2, 3]),
    fps: 8,
    loop: true,
  },
  punch: {
    frames: row(0, [4, 5]),
    fps: 8,
    loop: false,
  },
  kick: {
    frames: row(1, [0, 1, 2, 3, 4, 5]),
    fps: 8,
    loop: false,
  },
  slash: {
    frames: row(2, [0, 1, 2, 3]),
    fps: 8,
    loop: false,
  },
  tag_attack: {
    frames: row(2, [4, 5]),
    fps: 8,
    loop: false,
  },
  special_attack: {
    frames: row(3, [0, 1, 2, 3]),
    fps: 8,
    loop: false,
  },
  airborne: {
    frames: row(3, [4, 5]),
    fps: 8,
    loop: false,
  },
  hit_light: {
    frames: row(4, [0, 1]),
    fps: 8,
    loop: false,
  },
  hit_heavy: {
    frames: row(4, [2, 3]),
    fps: 8,
    loop: false,
  },
  guard: {
    frames: row(4, [4, 5]),
    fps: 8,
    loop: false,
  },
};
