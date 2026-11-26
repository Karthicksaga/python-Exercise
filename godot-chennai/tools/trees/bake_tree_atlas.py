#!/usr/bin/env python3
"""Paints the tree atlas: ONE 1024x512 RGBA texture holding every leaf card, frond, flower and
the bark of the tree kit (decision G-380). Original work, drawn by this script with Pillow
(no photographs, no third-party textures), so the licence is CC0.

    python3 tools/trees/bake_tree_atlas.py        # writes assets/trees/tree_atlas.png
                                                  # and assets/trees/atlas_layout.json

Each tile is painted at 2x and averaged down for soft edges, on a transparent ground whose RGB
is the tile's own mean colour (so mip maps and VRAM compression do not pull a dark or white halo
into the leaf edge). The layout JSON is the single source of the tile rectangles: the game reads
it (`TreeAtlas`), the script never has to be mirrored by hand. Colours are neutral greens meant to
be multiplied by a per-species and per-instance tint.
"""
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(ROOT, "assets", "trees")
W, H = 1024, 512
SS = 2  # supersampling

# name: (x, y, w, h)
LAYOUT = {
    "leaf_broad": (0, 0, 256, 256),
    "leaf_neem": (256, 0, 256, 256),
    "leaf_feather": (512, 0, 256, 256),
    "flower_red": (768, 0, 256, 256),
    "frond": (0, 256, 512, 128),
    "fan": (512, 256, 256, 128),
    "fan_dry": (768, 256, 256, 128),
    "needle": (0, 384, 256, 128),
    "grass": (256, 384, 256, 128),
    "bougainvillea": (512, 384, 128, 128),
    "oleander": (640, 384, 128, 128),
    "croton": (768, 384, 128, 128),
    "twigs": (896, 384, 64, 128),
    "bark": (960, 384, 64, 128),
}
PAD = 3  # px kept clear at every tile edge (the game also insets its UVs)


def rgb(h):
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


class Tile:
    def __init__(self, name, seed):
        self.name = name
        self.x, self.y, self.w, self.h = LAYOUT[name]
        self.rng = random.Random(seed)
        self.img = Image.new("RGBA", (self.w * SS, self.h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def s(self, v):
        return v * SS

    def poly(self, pts, col):
        self.d.polygon([(self.s(x), self.s(y)) for x, y in pts], fill=col + (255,))

    def line(self, a, b, col, width):
        self.d.line([(self.s(a[0]), self.s(a[1])), (self.s(b[0]), self.s(b[1]))], fill=col + (255,), width=max(1, int(self.s(width))))

    def ellipse(self, cx, cy, rx, ry, col):
        self.d.ellipse([self.s(cx - rx), self.s(cy - ry), self.s(cx + rx), self.s(cy + ry)], fill=col + (255,))

    def leaf(self, cx, cy, length, width, angle, col, vein=None):
        """A pointed leaf from its base (cx, cy) outwards along `angle` (radians, 0 = +x)."""
        ca, sa = math.cos(angle), math.sin(angle)
        pts = []
        n = 8
        for i in range(n + 1):
            t = i / n
            wd = width * math.sin(math.pi * t ** 0.8) * 0.5
            pts.append((cx + ca * length * t - sa * wd, cy + sa * length * t + ca * wd))
        for i in range(n, -1, -1):
            t = i / n
            wd = width * math.sin(math.pi * t ** 0.8) * 0.5
            pts.append((cx + ca * length * t + sa * wd, cy + sa * length * t - ca * wd))
        self.poly(pts, col)
        if vein is not None:
            self.line((cx, cy), (cx + ca * length * 0.92, cy + sa * length * 0.92), vein, max(0.5, width * 0.06))

    def finish(self, atlas):
        im = self.img.resize((self.w, self.h), Image.LANCZOS)
        # Keep a clear border so neighbouring tiles never bleed.
        px = im.load()
        for y in range(self.h):
            for x in range(self.w):
                if x < PAD or y < PAD or x >= self.w - PAD or y >= self.h - PAD:
                    px[x, y] = (0, 0, 0, 0)
        # Mean colour of the opaque pixels fills the transparent ones (no halo).
        r = g = b = n = 0
        for y in range(0, self.h, 2):
            for x in range(0, self.w, 2):
                p = px[x, y]
                if p[3] > 128:
                    r += p[0]
                    g += p[1]
                    b += p[2]
                    n += 1
        mean = (r // max(n, 1), g // max(n, 1), b // max(n, 1)) if n else (90, 120, 60)
        for y in range(self.h):
            for x in range(self.w):
                p = px[x, y]
                if p[3] < 255:
                    a = p[3]
                    if a == 0:
                        px[x, y] = mean + (0,)
                    else:
                        # un-premultiply is not needed: LANCZOS on straight alpha already; just clamp
                        px[x, y] = p
        atlas.paste(im, (self.x, self.y))


# Palette: neutral mid greens (the tint of the species and the instance does the rest).
DARK = rgb(0x2f5a2a)
MID = rgb(0x4f8a3a)
LIGHT = rgb(0x86b552)
TIP = rgb(0xa9cf6a)
VEIN = rgb(0xc4dc8a)


def blob_leaves(t, count, lmin, lmax, wratio, radius_x, radius_y, cy_off=0.0, tall=False):
    """Leaves scattered in an elliptical mass: dark inside and low, light on top and outside."""
    cx, cy = t.w / 2, t.h / 2 + cy_off
    leaves = []
    for _ in range(count):
        a = t.rng.uniform(0, math.tau)
        r = math.sqrt(t.rng.random())
        px = cx + math.cos(a) * radius_x * r
        py = cy + math.sin(a) * radius_y * r
        ang = math.atan2(py - cy, px - cx) + t.rng.uniform(-0.9, 0.9)
        L = t.rng.uniform(lmin, lmax)
        leaves.append((r, py, px, ang, L))
    leaves.sort(key=lambda v: -v[1] * 0 + v[0])  # centre first, rim last (rim on top)
    for r, py, px, ang, L in leaves:
        light = max(0.0, min(1.0, 0.25 + r * 0.55 + (1 - py / t.h) * 0.35 + t.rng.uniform(-0.12, 0.12)))
        col = mix(DARK, LIGHT, light) if light < 0.75 else mix(LIGHT, TIP, (light - 0.75) * 4)
        t.leaf(px, py, L, L * wratio, ang, col, vein=mix(col, VEIN, 0.45))


def paint_leaf_broad(atlas):
    t = Tile("leaf_broad", 11)
    t.ellipse(128, 128, 52, 46, DARK)
    blob_leaves(t, 230, 24, 42, 0.46, 82, 74)
    t.finish(atlas)


def paint_leaf_neem(atlas):
    t = Tile("leaf_neem", 12)
    cx, cy = 128, 150
    stems = 11
    for i in range(stems):
        ang = -math.pi / 2 + (i - (stems - 1) / 2) * 0.34 + t.rng.uniform(-0.06, 0.06)
        length = t.rng.uniform(84, 118)
        ex, ey = cx + math.cos(ang) * length, cy + math.sin(ang) * length
        t.line((cx, cy + 14), (ex, ey), DARK, 1.6)
        pairs = 6
        for k in range(1, pairs + 1):
            f = k / (pairs + 0.6)
            bx, by = cx + (ex - cx) * f, cy + (ey - cy) * f + 14 * (1 - f)
            ll = 26 * (1 - 0.35 * f) + 4
            for side in (-1, 1):
                a2 = ang + side * (0.95 - 0.25 * f)
                col = mix(MID, LIGHT, t.rng.uniform(0.0, 0.7))
                t.leaf(bx, by, ll, ll * 0.34, a2, col, vein=mix(col, VEIN, 0.3))
        t.leaf(ex, ey, 22, 9, ang, mix(MID, TIP, 0.5))
    t.finish(atlas)


def paint_leaf_feather(atlas):
    t = Tile("leaf_feather", 13)
    cx, cy = 128, 170
    stems = 9
    for i in range(stems):
        ang = -math.pi / 2 + (i - (stems - 1) / 2) * 0.4 + t.rng.uniform(-0.05, 0.05)
        length = t.rng.uniform(90, 126)
        ex, ey = cx + math.cos(ang) * length, cy + math.sin(ang) * length
        # drooping curve
        t.line((cx, cy + 10), ((cx + ex) / 2, (cy + ey) / 2 - 6), DARK, 1.4)
        t.line(((cx + ex) / 2, (cy + ey) / 2 - 6), (ex, ey), DARK, 1.2)
        pairs = 11
        for k in range(1, pairs + 1):
            f = k / (pairs + 0.5)
            bx, by = cx + (ex - cx) * f, cy + (ey - cy) * f
            ll = 15 * (1 - 0.4 * f) + 3
            for side in (-1, 1):
                a2 = ang + side * (1.25 - 0.25 * f)
                col = mix(MID, LIGHT, t.rng.uniform(0.2, 0.9))
                t.leaf(bx, by, ll, ll * 0.42, a2, col)
    t.finish(atlas)


def paint_flower_red(atlas):
    t = Tile("flower_red", 14)
    t.ellipse(128, 128, 50, 42, rgb(0x305f2a))
    blob_leaves(t, 120, 18, 32, 0.34, 84, 70)
    petals = [rgb(0xd8321f), rgb(0xe85a1c), rgb(0xc4231a), rgb(0xf06d20)]
    for _ in range(52):
        a = t.rng.uniform(0, math.tau)
        r = math.sqrt(t.rng.random()) * 0.9
        px = 128 + math.cos(a) * 92 * r
        py = 126 + math.sin(a) * 76 * r
        base = t.rng.choice(petals)
        for k in range(5):
            ang = k * math.tau / 5 + t.rng.uniform(0, 1)
            t.ellipse(px + math.cos(ang) * 6.0, py + math.sin(ang) * 6.0, 6.0, 4.6, base)
        t.ellipse(px, py, 2.6, 2.6, rgb(0xf5d27a))
    t.finish(atlas)


def paint_frond(atlas):
    """A coconut frond, root at the left, tip at the right, leaflets hanging both sides."""
    t = Tile("frond", 15)
    w, h = t.w, t.h
    cy = h * 0.42

    def rachis(x):
        return cy + 18 * (x / w) ** 2 - 6 * math.sin(math.pi * x / w)
    pts = [(x, rachis(x)) for x in range(8, w - 6, 6)]
    for i in range(len(pts) - 1):
        t.line(pts[i], pts[i + 1], rgb(0x6e8a3c), 2.4 * (1 - i / len(pts)) + 0.8)
    n = 44
    for i in range(n):
        f = i / (n - 1)
        x = 30 + f * (w - 50)
        y = rachis(x)
        ll = (54 + 16 * math.sin(math.pi * f ** 0.7)) * (1 - 0.62 * f ** 2.0)
        for side in (-1, 1):
            ang = math.pi / 2 * side + (0.5 if side < 0 else -0.5) * 0.0
            ang = side * (1.1 - 0.35 * f) + math.pi / 2 * 0  # relative to +x: down or up
            # leaflets sweep towards the tip and droop
            a = (math.pi / 2 - 0.45 + t.rng.uniform(-0.08, 0.08)) if side > 0 else (-math.pi / 2 + 0.55 + t.rng.uniform(-0.08, 0.08))
            if side < 0:
                ll *= 0.78
            col = mix(MID, LIGHT, t.rng.uniform(0.1, 0.85))
            t.leaf(x, y, ll, 9.5, a, col, vein=None)
    t.finish(atlas)


def paint_fan(atlas, name, base, tip, dry):
    """A palmyra leaf: a fan of stiff blades from a point at the bottom centre."""
    t = Tile(name, 16 if not dry else 17)
    w, h = t.w, t.h
    cx, cy = w / 2, h - 6
    blades = 19 if not dry else 15
    for i in range(blades):
        f = i / (blades - 1)
        ang = math.pi + 0.1 + f * (math.pi - 0.2)
        if dry:
            ang = math.pi * 0.5 + (f - 0.5) * 1.9 + math.pi  # hanging look is done by the mesh
            ang = math.pi + 0.18 + f * (math.pi - 0.36)
        L = (h - 12) * (0.92 + 0.08 * math.sin(f * math.pi)) * (0.9 + 0.1 * t.rng.random())
        col = mix(base, tip, t.rng.uniform(0.0, 1.0))
        t.leaf(cx, cy, L, 22 if not dry else 16, ang, col, vein=mix(col, tip, 0.5))
    t.finish(atlas)


def paint_needle(atlas):
    """Casuarina: fine jointed drooping needles hanging from the top edge."""
    t = Tile("needle", 18)
    w, h = t.w, t.h
    col0, col1 = rgb(0x4f7a52), rgb(0x86a56a)
    for i in range(120):
        x = t.rng.uniform(8, w - 8)
        y = t.rng.uniform(4, 40)
        length = t.rng.uniform(50, h - 12 - y)
        sway = t.rng.uniform(-14, 14)
        steps = 9
        prev = (x, y)
        col = mix(col0, col1, t.rng.random())
        for k in range(1, steps + 1):
            f = k / steps
            p = (x + sway * f * f, y + length * f)
            t.line(prev, p, col, 1.1)
            if k % 2 == 0:
                t.line(p, (p[0] + 4, p[1] + 3), col, 0.8)
                t.line(p, (p[0] - 4, p[1] + 3), col, 0.8)
            prev = p
    t.finish(atlas)


def paint_grass(atlas):
    t = Tile("grass", 19)
    w, h = t.w, t.h
    for i in range(46):
        x = w * 0.5 + t.rng.uniform(-w * 0.34, w * 0.34)
        height = t.rng.uniform(h * 0.45, h - 10)
        bend = (x - w / 2) * t.rng.uniform(0.2, 0.6) + t.rng.uniform(-16, 16)
        wd = t.rng.uniform(3.0, 6.0)
        col = mix(MID, TIP, t.rng.uniform(0.0, 1.0))
        base = h - 5
        pts = [(x - wd, base), (x + wd, base), (x + bend * 0.5 + wd * 0.35, base - height * 0.5), (x + bend, base - height)]
        t.poly(pts[:2] + [(x + bend * 0.5 + wd * 0.35, base - height * 0.5), (x + bend, base - height), (x + bend * 0.5 - wd * 0.35, base - height * 0.5)], col)
    t.finish(atlas)


def paint_bougainvillea(atlas):
    t = Tile("bougainvillea", 20)
    t.ellipse(64, 64, 52, 46, rgb(0x2f5a2a))
    blob_leaves(t, 34, 10, 18, 0.5, 46, 40)
    cols = [rgb(0xd0207a), rgb(0xe03c92), rgb(0xb8186a), rgb(0xea5aa6)]
    for _ in range(70):
        a = t.rng.uniform(0, math.tau)
        r = math.sqrt(t.rng.random()) * 0.95
        px = 64 + math.cos(a) * 52 * r
        py = 62 + math.sin(a) * 44 * r
        c = t.rng.choice(cols)
        t.ellipse(px, py, 5.2, 4.4, c)
        t.ellipse(px + 3, py - 2, 4.2, 3.8, mix(c, (255, 255, 255), 0.15))
    t.finish(atlas)


def paint_oleander(atlas):
    t = Tile("oleander", 21)
    for i in range(24):
        a = -math.pi / 2 + t.rng.uniform(-1.25, 1.25)
        L = t.rng.uniform(34, 56)
        col = mix(DARK, MID, t.rng.uniform(0.2, 1.0))
        t.leaf(64 + t.rng.uniform(-6, 6), 108, L, L * 0.16, a, col, vein=mix(col, VEIN, 0.4))
    for _ in range(16):
        px = 64 + t.rng.uniform(-34, 34)
        py = 60 + t.rng.uniform(-30, 20)
        c = rgb(0xf08fb0) if t.rng.random() < 0.7 else rgb(0xfbe3ea)
        for k in range(5):
            ang = k * math.tau / 5
            t.ellipse(px + math.cos(ang) * 3.4, py + math.sin(ang) * 3.4, 3.4, 3.0, c)
        t.ellipse(px, py, 1.8, 1.8, rgb(0xf6d46a))
    t.finish(atlas)


def paint_croton(atlas):
    t = Tile("croton", 22)
    cols = [rgb(0xc6a52a), rgb(0xc2551f), rgb(0x8a2f1c), rgb(0x5a9a2e), rgb(0xe0b83a), rgb(0x3d7d2a)]
    for i in range(26):
        a = -math.pi / 2 + t.rng.uniform(-1.4, 1.4)
        L = t.rng.uniform(26, 48)
        col = t.rng.choice(cols)
        t.leaf(64 + t.rng.uniform(-8, 8), 112, L, L * 0.36, a, col, vein=mix(col, (255, 232, 140), 0.5))
    t.finish(atlas)


def paint_twigs(atlas):
    t = Tile("twigs", 23)
    w, h = t.w, t.h
    col = rgb(0x6d5a45)

    def branch(x, y, ang, length, depth):
        ex, ey = x + math.cos(ang) * length, y + math.sin(ang) * length
        t.line((x, y), (ex, ey), col, max(0.9, 2.6 - depth * 0.7))
        if depth < 4:
            for k in (0.45, 0.8):
                bx, by = x + (ex - x) * k, y + (ey - y) * k
                branch(bx, by, ang + t.rng.uniform(0.35, 0.9) * t.rng.choice((-1, 1)), length * 0.52, depth + 1)
        if depth >= 3:
            t.ellipse(ex, ey, 1.6, 1.4, mix(col, (150, 130, 80), 0.5))
    for i in range(3):
        branch(w / 2 + (i - 1) * 8, h - 4, -math.pi / 2 + (i - 1) * 0.35, 58, 0)
    t.finish(atlas)


def paint_bark(atlas):
    t = Tile("bark", 24)
    w, h = t.w, t.h
    base = rgb(0x95826e)
    t.d.rectangle([0, 0, t.s(w), t.s(h)], fill=base + (255,))
    for i in range(34):
        x = t.rng.uniform(0, w)
        col = mix(rgb(0x5a4c3e), rgb(0xb5a48e), t.rng.random())
        y = t.rng.uniform(-20, h)
        t.line((x, y), (x + t.rng.uniform(-2, 2), y + t.rng.uniform(40, 130)), col, t.rng.uniform(1.2, 3.4))
    for i in range(10):
        y = t.rng.uniform(0, h)
        t.line((0, y), (w, y + t.rng.uniform(-3, 3)), mix(base, rgb(0x3a3025), 0.5), 1.2)
    t.finish(atlas)


def main():
    seed_check = "--check" in sys.argv
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    paint_leaf_broad(atlas)
    paint_leaf_neem(atlas)
    paint_leaf_feather(atlas)
    paint_flower_red(atlas)
    paint_frond(atlas)
    paint_fan(atlas, "fan", rgb(0x3f6f2c), rgb(0x8fb24a), False)
    paint_fan(atlas, "fan_dry", rgb(0x8a6a3a), rgb(0xc2a15e), True)
    paint_needle(atlas)
    paint_grass(atlas)
    paint_bougainvillea(atlas)
    paint_oleander(atlas)
    paint_croton(atlas)
    paint_twigs(atlas)
    paint_bark(atlas)
    os.makedirs(OUT_DIR, exist_ok=True)
    if seed_check:
        print("tiles:", len(LAYOUT))
        return
    atlas.save(os.path.join(OUT_DIR, "tree_atlas.png"), optimize=True)
    with open(os.path.join(OUT_DIR, "atlas_layout.json"), "w") as f:
        json.dump({"format": 1, "size": [W, H], "pad": PAD, "tiles": {k: list(v) for k, v in LAYOUT.items()}}, f, indent=1)
        f.write("\n")
    print("wrote", os.path.join(OUT_DIR, "tree_atlas.png"), os.path.getsize(os.path.join(OUT_DIR, "tree_atlas.png")), "bytes")


if __name__ == "__main__":
    main()
