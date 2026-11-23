"""Today's world files (format 1): a port of `game-world/src/codec.ts`.

Used to read the Three.js game's committed world for comparison, and to write format-1 files
from a v2 build (the converter path, `convert.py`)."""
from __future__ import annotations

import math
from typing import Any

from .binio import Reader, Writer
from .enums import V1_AREA_KINDS, V1_BUILDING_KINDS, V1_HEIGHT_FROM, V1_ROAD_KINDS
from .geometry import Bounds, Point
from .model import Area, Building, Road, Tree
from .rules import WALL_COLORS
from .util import js_round, round2

WORLD_FORMAT = 1
Q = 20
CHUNK_MAGIC = 0x43574F43  # "COWC"
ROADS_MAGIC = 0x52574F43  # "COWR"
MAX_STEP = 32767 / Q - 1


def chunk_file(col: int, row: int) -> str:
    return f"c/{col}_{row}.bin"


def chunk_centre(bounds: Bounds, chunk_size: float, col: int, row: int) -> Point:
    return (bounds.min_x + (col + 0.5) * chunk_size, bounds.min_z + (row + 0.5) * chunk_size)


def encode_chunk(col: int, row: int, buildings: list[Building], trees: list[Tree], areas: list[Area], bounds: Bounds, chunk_size: float) -> bytes:
    cx, cz = chunk_centre(bounds, chunk_size, col, row)
    w = Writer()

    def point(p: Point) -> None:
        w.i16(int(js_round((p[0] - cx) * Q)))
        w.i16(int(js_round((p[1] - cz) * Q)))

    w.u32(CHUNK_MAGIC)
    w.u16(WORLD_FORMAT)
    w.i16(col)
    w.i16(row)
    w.u16(len(buildings))
    w.u16(len(trees))
    w.u16(len(areas))
    for b in buildings:
        w.u32(b.id)
        w.u16(int(js_round(b.height * 10)))
        w.u8(b.floors)
        w.u8(V1_BUILDING_KINDS.index(b.kind) | (V1_HEIGHT_FROM.index(b.height_from) << 2))
        w.u8(max(0, WALL_COLORS.index(b.color) if b.color in WALL_COLORS else 0))
        w.u16(len(b.outline))
        for p in b.outline:
            point(p)
    for t in trees:
        point((t.x, t.z))
        w.u8(int(js_round(t.scale * 100)))
        w.u8(1 if t.source == "osm" else 0)
    for a in areas:
        w.u32(a.id)
        w.u8(V1_AREA_KINDS.index(a.kind))
        w.u16(len(a.outline))
        for p in a.outline:
            point(p)
    return w.done()


def decode_chunk(data: bytes, bounds: Bounds, chunk_size: float) -> dict[str, Any]:
    r = Reader(data)
    if r.u32() != CHUNK_MAGIC:
        raise ValueError("Not a chunk file.")
    fmt = r.u16()
    if fmt != WORLD_FORMAT:
        raise ValueError(f"Chunk file format {fmt}, expected {WORLD_FORMAT}")
    col, row = r.i16(), r.i16()
    cx, cz = chunk_centre(bounds, chunk_size, col, row)

    def point() -> Point:
        x = r.i16()
        z = r.i16()
        return (round2(cx + x / Q), round2(cz + z / Q))

    nb, nt, na = r.u16(), r.u16(), r.u16()
    buildings: list[Building] = []
    for _ in range(nb):
        bid = r.u32()
        height = r.u16() / 10
        floors = r.u8()
        packed = r.u8()
        ci = r.u8()
        color = WALL_COLORS[ci] if ci < len(WALL_COLORS) else WALL_COLORS[0]
        n = r.u16()
        outline = [point() for _ in range(n)]
        hf = (packed >> 2) & 3
        buildings.append(Building(bid, outline, floors, height, V1_HEIGHT_FROM[hf] if hf < 3 else "estimated", V1_BUILDING_KINDS[packed & 3] if (packed & 3) < 3 else "house", color))
    trees: list[Tree] = []
    for _ in range(nt):
        p = point()
        scale = r.u8() / 100
        trees.append(Tree(p[0], p[1], scale, "osm" if r.u8() == 1 else "generated"))
    areas: list[Area] = []
    for _ in range(na):
        aid = r.u32()
        k = r.u8()
        n = r.u16()
        areas.append(Area(aid, V1_AREA_KINDS[k] if k < 3 else "park", [point() for _ in range(n)]))
    return {"col": col, "row": row, "buildings": buildings, "trees": trees, "areas": areas}


def _split_steps(points: list[Point]) -> list[Point]:
    out: list[Point] = []
    for i, p in enumerate(points):
        if i > 0:
            q = points[i - 1]
            steps = math.ceil(max(abs(p[0] - q[0]), abs(p[1] - q[1])) / MAX_STEP)
            for s in range(1, steps):
                out.append((q[0] + (p[0] - q[0]) * s / steps, q[1] + (p[1] - q[1]) * s / steps))
        out.append(p)
    return out


def encode_roads(roads: list[Road]) -> tuple[bytes, list[str]]:
    names: list[str] = []
    index: dict[str, int] = {}
    w = Writer()
    w.u32(ROADS_MAGIC)
    w.u16(WORLD_FORMAT)
    w.u32(len(roads))
    for road in roads:
        pts = _split_steps(road.points)
        name = 0
        if road.name:
            if road.name not in index:
                index[road.name] = len(names)
                names.append(road.name)
            name = index[road.name] + 1
        w.u8(V1_ROAD_KINDS.index(road.kind))
        w.u8((1 if road.oneway else 0) | (2 if road.lanes is not None else 0))
        w.u16(int(js_round(road.width * 100)))
        w.u8(road.lanes or 0)
        w.u16(name)
        w.f64(float(road.id))
        w.u16(len(pts))
        x = int(js_round(pts[0][0] * Q))
        z = int(js_round(pts[0][1] * Q))
        w.i32(x)
        w.i32(z)
        for p in pts[1:]:
            nx = int(js_round(p[0] * Q))
            nz = int(js_round(p[1] * Q))
            w.i16(nx - x)
            w.i16(nz - z)
            x, z = nx, nz
    return w.done(), names


def decode_roads(data: bytes, names: list[str]) -> list[Road]:
    r = Reader(data)
    if r.u32() != ROADS_MAGIC:
        raise ValueError("Not a roads file.")
    fmt = r.u16()
    if fmt != WORLD_FORMAT:
        raise ValueError(f"Roads file format {fmt}, expected {WORLD_FORMAT}")
    roads: list[Road] = []
    for _ in range(r.u32()):
        kind = V1_ROAD_KINDS[r.u8()]
        flags = r.u8()
        width = r.u16() / 100
        lanes = r.u8()
        name = r.u16()
        rid = r.f64()
        n = r.u16()
        x, z = r.i32(), r.i32()
        pts: list[Point] = [(x / Q, z / Q)]
        for _ in range(1, n):
            x += r.i16()
            z += r.i16()
            pts.append((x / Q, z / Q))
        roads.append(Road(int(rid), kind, width, (flags & 1) == 1, pts, names[name - 1] if name > 0 else None, lanes if flags & 2 else None))
    return roads
