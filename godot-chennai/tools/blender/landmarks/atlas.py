"""
Texture atlas painter for the hero landmark models (G-390).

A hero model has ONE atlas PNG next to its GLB (`<id>_atlas.png`, 512 px square, imported by Godot
as a VRAM-compressed texture with mipmaps). The kit paints it with numpy (no random numbers but
seeded ones, so the bytes repeat), names its regions, and gives faces a `Tile` (region name, tint,
and the part of the region to show). `lkit.export` turns tiles into UVs. Patterns that repeat along a
wall or a deck are painted once per region and the kit lays whole regions end to end (`Acc.strip`),
so the atlas stays small and the geometry stays cheap.

Colours here are sRGB (as the PNG stores them); regions are cells of `CELL` px on the sheet.
"""
import os
import struct
import zlib

import numpy as np

SIZE = 512
CELL = 64


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)] + [1.0])


class Tile:
    """A region of the atlas for a face: `name`, a multiplying `tint` (RGBA 0..1) and the
    fractions of the region the face spans (for strips that cut a pattern at its end)."""
    __slots__ = ("name", "tint", "u", "v")

    def __init__(self, name, tint=(1.0, 1.0, 1.0, 1.0), u=(0.0, 1.0), v=(0.0, 1.0)):
        self.name = name
        self.tint = tint
        self.u = u
        self.v = v


def T(name, tint=None, u=(0.0, 1.0), v=(0.0, 1.0)):
    return Tile(name, tint if tint is not None else (1.0, 1.0, 1.0, 1.0), u, v)


class Sheet:
    def __init__(self, layout, size=SIZE, cell=CELL):
        """layout: {name: (cell_x, cell_y, cells_wide, cells_high)}."""
        self.size = size
        self.cell = cell
        self.layout = layout
        self.px = np.zeros((size, size, 4), dtype=np.float64)
        self.px[:, :, 3] = 1.0
        used = np.zeros((size // cell, size // cell), dtype=bool)
        for name, (cx, cy, w, h) in layout.items():
            assert not used[cy:cy + h, cx:cx + w].any(), f"atlas cells of {name} overlap"
            used[cy:cy + h, cx:cx + w] = True

    def rect(self, name):
        cx, cy, w, h = self.layout[name]
        return cx * self.cell, cy * self.cell, w * self.cell, h * self.cell

    def view(self, name):
        x, y, w, h = self.rect(name)
        return self.px[y:y + h, x:x + w]

    def uv(self, name, fu, fv):
        """Blender UV (origin bottom left) of fractions (fu to the right, fv upwards) of a region,
        pulled in by one texel so filtering does not reach the neighbour."""
        x, y, w, h = self.rect(name)
        inset = 1.0
        px = x + inset + fu * (w - 2 * inset)
        py = y + h - inset - fv * (h - 2 * inset)  # image rows run downwards
        return (px / self.size, 1.0 - py / self.size)

    def save(self, path):
        a = np.clip(np.rint(self.px * 255.0), 0, 255).astype(np.uint8)
        write_png(path, a)
        return os.path.getsize(path)


def write_png(path, a):
    h, w, c = a.shape
    raw = b"".join(b"\x00" + a[y].tobytes() for y in range(h))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


# ---------------------------------------------------------------------------- painting helpers
# Coordinates are fractions of the region: x to the right, y DOWN (image rows), 0..1.

def grid(t):
    h, w = t.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    return (xx + 0.5) / w, (yy + 0.5) / h, w, h


def fill(t, col):
    t[:, :] = col


def rect(t, x0, y0, x1, y1, col, alpha=1.0):
    fx, fy, _, _ = grid(t)
    m = (fx >= x0) & (fx < x1) & (fy >= y0) & (fy < y1)
    t[m] = t[m] * (1 - alpha) + np.asarray(col) * alpha


def arch(t, x0, x1, y_bottom, y_spring, col, alpha=1.0):
    """A round-headed opening: a rectangle from y_spring down to y_bottom, and a half circle
    above it with the opening's width (true circle: the region's pixel aspect is used)."""
    fx, fy, w, h = grid(t)
    r = (x1 - x0) / 2.0 * w  # radius in px
    cx = (x0 + x1) / 2.0 * w
    cy = y_spring * h
    px, py = fx * w, fy * h
    box = (fx >= x0) & (fx < x1) & (fy >= y_spring) & (fy < y_bottom)
    cap = ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) & (py <= cy)
    m = box | cap
    t[m] = t[m] * (1 - alpha) + np.asarray(col) * alpha
    return m


def circle(t, cx, cy, r_px, col, alpha=1.0):
    fx, fy, w, h = grid(t)
    m = ((fx * w - cx * w) ** 2 + (fy * h - cy * h) ** 2) <= r_px * r_px
    t[m] = t[m] * (1 - alpha) + np.asarray(col) * alpha
    return m


def ring(t, cx, cy, r0, r1, col):
    fx, fy, w, h = grid(t)
    d2 = (fx * w - cx * w) ** 2 + (fy * h - cy * h) ** 2
    m = (d2 <= r1 * r1) & (d2 >= r0 * r0)
    t[m] = col


def line(t, x0, y0, x1, y1, width_px, col):
    fx, fy, w, h = grid(t)
    px, py = fx * w, fy * h
    ax, ay, bx, by = x0 * w, y0 * h, x1 * w, y1 * h
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    s = np.clip(((px - ax) * dx + (py - ay) * dy) / max(L2, 1e-9), 0, 1)
    d2 = (px - (ax + s * dx)) ** 2 + (py - (ay + s * dy)) ** 2
    t[d2 <= (width_px / 2) ** 2] = col


def hash_noise(shape, seed):
    """Deterministic value noise in 0..1 (an integer hash, no platform dependence)."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.uint64)
    x = (xx * np.uint64(374761393) + yy * np.uint64(668265263) + np.uint64(seed) * np.uint64(2246822519)) & np.uint64(0xFFFFFFFF)
    x = ((x ^ (x >> np.uint64(13))) * np.uint64(1274126177)) & np.uint64(0xFFFFFFFF)
    x = x ^ (x >> np.uint64(16))
    return (x & np.uint64(0xFFFF)).astype(np.float64) / 65535.0


def grain(t, amount, seed):
    n = hash_noise(t.shape[:2], seed) - 0.5
    t[:, :, :3] = np.clip(t[:, :, :3] * (1.0 + n[:, :, None] * amount), 0, 1)


def bricks(t, base, mortar, courses, bricks_per_row, seed, vary=0.12):
    """Running-bond brick: `courses` rows, `bricks_per_row` bricks across, each tinted a little."""
    fx, fy, w, h = grid(t)
    ch = h / courses
    bw = w / bricks_per_row
    row = np.floor(fy * h / ch).astype(int)
    off = np.where(row % 2 == 0, 0.0, bw / 2)
    col = np.floor((fx * w + off) / bw).astype(int)
    key = (row * 131 + col * 17 + seed) % 97
    tone = (key / 97.0 - 0.5) * 2 * vary
    out = np.empty_like(t)
    out[:, :, :3] = np.clip(np.asarray(base)[None, None, :3] * (1.0 + tone[:, :, None]), 0, 1)
    out[:, :, 3] = 1.0
    ry = (fy * h) % ch
    rx = (fx * w + off) % bw
    mort = (ry < 1.0) | (rx < 1.0)
    out[mort] = mortar
    t[:] = out
    grain(t, 0.10, seed + 5)
