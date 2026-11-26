#!/usr/bin/env python3
"""Counts flashing pixels in a frame sequence from tests/tools/flicker_shots.gd (decision G-500).

A pixel *flashes* at frame t when its brightness jumps by more than THRESHOLD from t-1 to t and
jumps back by more than THRESHOLD from t to t+1 (opposite signs), while t-1 and t+1 stay close
(within half the jump). Smooth motion moves edges and textures monotonically from frame to frame;
z-fighting, shadow acne and popping make pixels flash. Only pixels inside the building mask
(mask_on.png differs from mask_off.png) are counted.

    python3 tools/flicker_metric.py DIR [DIR ...]

One line per directory and sequence: mask pixels, flashes per frame (per 10,000 mask pixels), and
for the static sequence the pixels that changed at all.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

THRESHOLD = 24.0


def luma(path: Path) -> np.ndarray:
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def measure(folder: Path) -> list[str]:
    on = np.asarray(Image.open(folder / "mask_on.png").convert("RGB"), dtype=np.int16)
    off = np.asarray(Image.open(folder / "mask_off.png").convert("RGB"), dtype=np.int16)
    mask = np.abs(on - off).sum(axis=2) > 12
    # Leave out the outline of the mask: silhouettes against the sky move with any camera motion.
    m = mask.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        m &= np.roll(mask, (dy, dx), axis=(0, 1))
    n_mask = int(m.sum())
    lines = []
    for seq in ("static", "walk", "turn"):
        frames = sorted(folder.glob(f"{seq}_*.png"))
        if len(frames) < 3:
            continue
        ims = [luma(p) for p in frames]
        flashes = 0
        changed = 0
        heat = np.zeros_like(ims[0])
        for t in range(1, len(ims) - 1):
            d1 = ims[t] - ims[t - 1]
            d2 = ims[t + 1] - ims[t]
            back = np.abs(ims[t + 1] - ims[t - 1])
            f = (np.abs(d1) > THRESHOLD) & (np.abs(d2) > THRESHOLD) & (np.sign(d1) != np.sign(d2)) & (back < np.abs(d1) / 2) & m
            flashes += int(f.sum())
            heat += f
            changed += int(((np.abs(d1) > THRESHOLD) & m).sum())
        per = len(ims) - 2
        # Which layer the flashing pixels belong to: a layer's pixels are those that change when
        # that layer alone is hidden (layer_<name>.png against mask_on.png).
        parts = []
        for lp in sorted(folder.glob("layer_*.png")):
            lm = np.abs(on - np.asarray(Image.open(lp).convert("RGB"), dtype=np.int16)).sum(axis=2) > 12
            parts.append(f"{lp.stem[6:]}={int((heat * lm).sum()) / per:.0f}")
        rate = 1e4 * flashes / max(1, n_mask) / per
        crate = 1e4 * changed / max(1, n_mask) / per
        lines.append(f"flicker {folder.name} {seq}: mask={n_mask} px, flashes/frame={flashes / per:.1f} ({rate:.2f} per 10k mask px), changed/frame={changed / per:.1f} ({crate:.2f} per 10k)" + (f"; flashes by layer: {' '.join(parts)}" if parts else ""))
        if heat.max() > 0:
            h = (np.clip(heat / max(1.0, heat.max()), 0, 1) * 255).astype(np.uint8)
            base = np.asarray(Image.open(frames[len(frames) // 2]).convert("RGB")).copy()
            base[h > 0] = [255, 0, 255]
            Image.fromarray(base).save(folder.parent / f"{folder.name}_{seq}_flashes.png")
    return lines


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    for d in sys.argv[1:]:
        for line in measure(Path(d)):
            print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
