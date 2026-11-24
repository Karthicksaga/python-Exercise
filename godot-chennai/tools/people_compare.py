#!/usr/bin/env python3
"""
Side-by-side review sheets: each board figure (from the owner's concept board) next to the
character built from it (a Godot Compatibility render, idle, front and three-quarter).

    python3 tools/people_compare.py <out dir> [--set phase1|phase2] [--only id,id]

Needs Pillow, Godot and xvfb (renders through tools/run_people_tests.sh --lineup). Output is for
review only; keep it out of the repository.
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "blender"))
from cast_people import BOARDS, CAST  # noqa: E402


def board_crop(spec):
    if "crop" in spec:
        return spec["crop"]
    # Phase 1 board (1672 x 941): two rows of ten figures, numbered 1-10 and 11-20.
    n = int(spec["figure"]) - 1
    row, col = divmod(n, 10)
    x0 = 2 + col * 167
    y0, y1 = (92, 452) if row == 0 else (462, 842)
    return (x0, y0, x0 + 167, y1)


def render(spec, out, yaw):
    subprocess.run([os.path.join(HERE, "run_people_tests.sh"), "--lineup", "--", "--ids", spec["id"], "--anim", "idle", "--time", "0.2",
                    "--out", out, "--size", "420x700", "--yaw", str(yaw)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    args = sys.argv[1:]
    out_dir = os.path.abspath(args[0])
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    which = args[args.index("--set") + 1] if "--set" in args else None
    os.makedirs(out_dir, exist_ok=True)
    tiles = []
    for spec in CAST:
        if (which and spec["board"] != which) or (only and spec["id"] not in only):
            continue
        if not os.path.exists(os.path.join(ROOT, "assets", "people", spec["file"])):
            continue
        board = Image.open(os.path.join(ROOT, BOARDS[spec["board"]])).convert("RGB")
        fig = board.crop(board_crop(spec))
        fig = fig.resize((int(fig.width * 700 / fig.height), 700))
        shots = []
        for yaw in (0, 35):
            path = os.path.join(out_dir, f"{spec['id']}_{yaw}.png")
            render(spec, path, yaw)
            shots.append(Image.open(path).convert("RGB"))
        tile = Image.new("RGB", (fig.width + sum(s.width for s in shots) + 20, 730), (24, 24, 28))
        tile.paste(fig, (0, 0))
        x = fig.width + 10
        for s in shots:
            tile.paste(s, (x, 0))
            x += s.width + 5
        ImageDraw.Draw(tile).text((6, 708), f"{spec['board']} fig {spec['figure']} {spec['label']}  ->  {spec['id']}", fill=(240, 220, 120))
        tile.save(os.path.join(out_dir, f"compare_{spec['id']}.png"))
        tiles.append(tile)
    # Contact sheets of five comparisons each.
    for k in range(0, len(tiles), 5):
        group = tiles[k:k + 5]
        sheet = Image.new("RGB", (max(t.width for t in group), sum(t.height for t in group)), (24, 24, 28))
        y = 0
        for t in group:
            sheet.paste(t, (0, y))
            y += t.height
        sheet.save(os.path.join(out_dir, f"sheet_{k // 5 + 1:02d}.png"))
    print(f"{len(tiles)} comparisons in {out_dir}")


if __name__ == "__main__":
    main()
