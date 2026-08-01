#!/usr/bin/env python3
"""낱장 프레임 PNG를 게임용 스프라이트 시트로 합친다.

src/game/animation/spriteMap.ts의 DEFAULT_SHEET(5열×7행, 셀 280×280)와
반드시 같은 레이아웃으로 출력해야 한다. 배치는 행 우선:
1.png → (0,0), 2.png → (0,1), ... 6.png → (1,0), ... 35.png → (6,4)

사용법:
    pip3 install pillow  # 최초 1회
    python3 scripts/build-spritesheets.py <프레임폴더> <출력.png> [--cell 280]

예시 (캐릭터 4종):
    python3 scripts/build-spritesheets.py frames/char_a public/sprites/char_a.png
    python3 scripts/build-spritesheets.py frames/char_b public/sprites/char_b.png
    python3 scripts/build-spritesheets.py frames/char_c public/sprites/char_c.png
    python3 scripts/build-spritesheets.py frames/char_d public/sprites/char_d.png
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow가 필요합니다: pip3 install pillow")

COLS = 5
ROWS = 7
FRAME_COUNT = 35


def build(frames_dir: Path, out_path: Path, cell: int) -> None:
    missing = [n for n in range(1, FRAME_COUNT + 1) if not (frames_dir / f"{n}.png").exists()]
    if missing:
        sys.exit(f"프레임 누락: {frames_dir}/{{{', '.join(map(str, missing))}}}.png")

    sheet = Image.new("RGBA", (COLS * cell, ROWS * cell), (0, 0, 0, 0))
    for n in range(1, FRAME_COUNT + 1):
        frame = Image.open(frames_dir / f"{n}.png").convert("RGBA")
        if frame.size != (cell, cell):
            frame = frame.resize((cell, cell), Image.LANCZOS)
        idx = n - 1
        sheet.paste(frame, ((idx % COLS) * cell, (idx // COLS) * cell))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)
    print(f"{out_path} ← {frames_dir} ({COLS * cell}x{ROWS * cell}, 셀 {cell}px)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("frames_dir", type=Path, help="1.png~35.png가 들어있는 폴더")
    parser.add_argument("out", type=Path, help="출력 시트 PNG 경로")
    parser.add_argument("--cell", type=int, default=280, help="셀 한 변 px (spriteMap.ts frameW와 일치해야 함, 기본 280)")
    args = parser.parse_args()
    build(args.frames_dir, args.out, args.cell)
