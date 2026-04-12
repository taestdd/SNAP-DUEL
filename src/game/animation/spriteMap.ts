import type { FighterPose } from "@/game/engine/types";

/**
 * 스프라이트 시트 레이아웃
 * - 파일: public/sprites/sheet.png
 * - 프레임 크기: 360 × 360 px
 * - 배치: 6열 × 5행 = 30 프레임 (0-indexed)
 *
 * 프레임 번호 → 시트 좌표
 *   col = frameNum % 6
 *   row = Math.floor(frameNum / 6)
 *
 * 행 배치 (참고용):
 *   Row 0 (0–5)  : idle
 *   Row 1 (6–11) : slash
 *   Row 2 (12–17): strike
 *   Row 3 (18–23): magic
 *   Row 4 (24–29): block / hit / misc
 */
export const SPRITE_SHEET_COLS = 6;
export const SPRITE_SHEET_ROWS = 5;
export const SPRITE_FRAME_SIZE = 360; // 원본 프레임 크기(px)
export const SPRITE_DISPLAY_SIZE = 180; // 렌더링 크기(px) — 50% 스케일

/**
 * FighterPose 별 프레임 시퀀스
 * 값은 시트 상의 0-based 프레임 번호
 */
export const SPRITE_MAP: Record<FighterPose, number[]> = {
  // ── idle: Row 0, 앞뒤 반복 루프 ──────────────────────────
  idle:    [0, 1, 2, 3, 2, 1],

  // ── slash: Row 1 ─────────────────────────────────────────
  slash:   [6, 7, 8, 9, 10],

  // ── strike: Row 2 ────────────────────────────────────────
  strike:  [12, 13, 14, 15, 16],

  // ── magic: Row 3 ─────────────────────────────────────────
  magic:   [18, 19, 20, 21, 22],

  // ── block: Row 4 앞부분 ───────────────────────────────────
  block:   [24, 25, 26],

  // ── hit: 피격 단일 프레임 ─────────────────────────────────
  hit:     [27],

  // ── launch: Row 1 후반 (슬래시 피니시 → 발사) ───────────
  launch:  [9, 10, 11],

  // ── aerial: Row 2 후반 (공중 콤보) ───────────────────────
  aerial:  [15, 16, 17],

  // ── tag: Row 3 후반 역재생 (캐릭터 교체) ─────────────────
  tag:     [23, 22],

  // ── victory / defeat ─────────────────────────────────────
  victory: [3, 4, 5],
  defeat:  [27, 28, 29],
};

/** 각 포즈의 프레임 간격(ms). idle은 루프, 나머지는 원샷 */
export const SPRITE_FRAME_MS: Partial<Record<FighterPose, number>> = {
  idle:    120,
  slash:   80,
  strike:  80,
  magic:   100,
  block:   100,
  hit:     80,
  launch:  80,
  aerial:  80,
  tag:     100,
  victory: 140,
  defeat:  140,
};

export const DEFAULT_FRAME_MS = 100;

/** idle 포즈는 무한 루프 */
export const LOOPING_POSES = new Set<FighterPose>(["idle"]);
