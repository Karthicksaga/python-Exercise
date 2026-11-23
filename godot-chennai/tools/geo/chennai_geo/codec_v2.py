"""World format 2: chunk, roads and area-overview files of the regional world.

Byte layouts are in godot-chennai/docs/world-format.md; this module is the reference
implementation and `tests/test_codec_v2.py` pins it. Little-endian; coordinates quantised to
5 cm (Q = 20 steps per metre): chunk contents as i16 offsets from the chunk centre, roads and
overview areas as an i32 start in world metres and i16 steps.
"""
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field

from .binio import Reader, Writer
from .enums import AREA_KINDS, BUILDING_KINDS, BUILDING_USES, HEIGHT_FROM, HIGHWAY_CLASSES, ROAD_KINDS, ROOF_SHAPES, SIDEWALKS, SURFACES, index_or
from .geometry import Point
from .model import Area, Building, Ref, Road, Tree
from .rules import WALL_COLORS
from .util import js_round, round2

FORMAT = 2
Q = 20
CHUNK_MAGIC = 0x43574F43  # "COWC"
ROADS_MAGIC = 0x52574F43  # "COWR"
AREAS_MAGIC = 0x41574F43  # "COWA"
PACK_MAGIC = 0x50574F43  # "COWP"
MAX_STEP = 32767 / Q - 1

# Building flags
BF_LEVELS_MAPPED = 1
BF_REPAIRED = 2
BF_MULTIPART = 4
# Road flags
RF_ONEWAY, RF_LANES, RF_BRIDGE, RF_TUNNEL, RF_ROUNDABOUT, RF_LIT = 1, 2, 4, 8, 16, 32
WIDTH_FROM = ["class", "width", "lanes"]


@dataclass
class ChunkV2:
    col: int
    row: int
    ring: int = 0
    buildings: list[Building] = field(default_factory=list)
    trees: list[Tree] = field(default_factory=list)
    areas: list[Area] = field(default_factory=list)
    sections: list[tuple[int, bytes]] = field(default_factory=list)


@dataclass
class RoadPiece:
    road: Road
    piece: int
    offset: float
    total: float


def _ref(w: Writer, ref: Ref) -> None:
    w.u8(ref.dataset)
    w.u64(ref.id)


def _read_ref(r: Reader) -> Ref:
    return Ref(r.u8(), r.u64())


def encode_chunk(c: ChunkV2, centre: Point) -> bytes:
    cx, cz = centre
    w = Writer()

    def ring(pts: list[Point]) -> None:
        w.u16(len(pts))
        for x, z in pts:
            w.i16(int(js_round((x - cx) * Q)))
            w.i16(int(js_round((z - cz) * Q)))

    w.u32(CHUNK_MAGIC)
    w.u16(FORMAT)
    w.i16(c.col)
    w.i16(c.row)
    w.u8(c.ring)
    w.u8(0)
    w.u16(len(c.buildings))
    w.u16(len(c.trees))
    w.u16(len(c.areas))
    w.u16(len(c.sections))
    for b in c.buildings:
        w.u32(b.id)
        _ref(w, b.source)
        w.u8(len(b.merged))
        for m in b.merged:
            _ref(w, m)
        w.u16(int(js_round(b.height * 10)))
        w.u16(int(js_round(b.min_height * 10)))
        w.u8(b.floors)
        w.u8(BUILDING_KINDS.index(b.kind))
        w.u8(HEIGHT_FROM.index(b.height_from))
        w.u8(index_or(BUILDING_USES, b.use))
        w.u8(b.archetype)
        w.u8(index_or(ROOF_SHAPES, b.roof_shape))
        w.u8(b.roof_levels)
        w.u8(WALL_COLORS.index(b.color) if b.color in WALL_COLORS else 0)
        w.u8((BF_LEVELS_MAPPED if b.levels_mapped else 0) | (BF_REPAIRED if b.repaired else 0) | (BF_MULTIPART if b.id & 0x80000000 else 0))
        w.u8(1 + len(b.holes))
        ring(b.outline)
        for h in b.holes:
            ring(h)
    for t in c.trees:
        w.i16(int(js_round((t.x - cx) * Q)))
        w.i16(int(js_round((t.z - cz) * Q)))
        w.u8(int(js_round(t.scale * 100)))
        w.u8(1 if t.source == "osm" else 0)
    for a in c.areas:
        w.u32(a.id)
        _ref(w, a.source or Ref(0, a.id))
        w.u8(AREA_KINDS.index(a.kind))
        w.u8(1 + len(a.holes))
        ring(a.outline)
        for h in a.holes:
            ring(h)
    for tag, payload in c.sections:
        w.u32(tag)
        w.u32(len(payload))
        w.raw(payload)
    return w.done()


def decode_chunk(data: bytes, centre_of: Callable[[int, int], Point]) -> ChunkV2:
    r = Reader(data)
    if r.u32() != CHUNK_MAGIC:
        raise ValueError("Not a chunk file.")
    fmt = r.u16()
    if fmt != FORMAT:
        raise ValueError(f"Chunk file format {fmt}, expected {FORMAT}")
    col, row = r.i16(), r.i16()
    ring_id = r.u8()
    r.u8()
    cx, cz = centre_of(col, row)
    nb, nt, na, ns = r.u16(), r.u16(), r.u16(), r.u16()

    def ring() -> list[Point]:
        n = r.u16()
        out = []
        for _ in range(n):
            x = r.i16()
            z = r.i16()
            out.append((round2(cx + x / Q), round2(cz + z / Q)))
        return out

    c = ChunkV2(col, row, ring_id)
    for _ in range(nb):
        bid = r.u32()
        src = _read_ref(r)
        merged = [_read_ref(r) for _ in range(r.u8())]
        height = r.u16() / 10
        min_h = r.u16() / 10
        floors = r.u8()
        kind = BUILDING_KINDS[r.u8()]
        hf = HEIGHT_FROM[r.u8()]
        use = BUILDING_USES[r.u8()]
        arch = r.u8()
        roof = ROOF_SHAPES[r.u8()]
        roof_levels = r.u8()
        color = WALL_COLORS[r.u8()]
        flags = r.u8()
        rings = [ring() for _ in range(r.u8())]
        c.buildings.append(Building(bid, rings[0], floors, height, hf, kind, color, None, rings[1:], use, roof, roof_levels, min_h, arch,
                                    bool(flags & BF_LEVELS_MAPPED), src, merged, bool(flags & BF_REPAIRED)))
    for _ in range(nt):
        x, z = r.i16(), r.i16()
        scale = r.u8() / 100
        c.trees.append(Tree(round2(cx + x / Q), round2(cz + z / Q), scale, "osm" if r.u8() == 1 else "generated"))
    for _ in range(na):
        aid = r.u32()
        src = _read_ref(r)
        kind = AREA_KINDS[r.u8()]
        rings = [ring() for _ in range(r.u8())]
        c.areas.append(Area(aid, kind, rings[0], None, rings[1:], src))
    for _ in range(ns):
        tag = r.u32()
        c.sections.append((tag, r.raw(r.u32())))
    if r.left:
        raise ValueError(f"{r.left} trailing bytes in chunk {col},{row}")
    return c


def split_steps(points: list[Point]) -> list[Point]:
    out: list[Point] = []
    for i, p in enumerate(points):
        if i > 0:
            q = points[i - 1]
            steps = math.ceil(max(abs(p[0] - q[0]), abs(p[1] - q[1])) / MAX_STEP)
            for s in range(1, steps):
                out.append((q[0] + (p[0] - q[0]) * s / steps, q[1] + (p[1] - q[1]) * s / steps))
        out.append(p)
    return out


def _line(w: Writer, pts: list[Point], count32: bool = False) -> None:
    pts = split_steps(pts)
    (w.u32 if count32 else w.u16)(len(pts))
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


def _read_line(r: Reader, count32: bool = False) -> list[Point]:
    n = r.u32() if count32 else r.u16()
    x, z = r.i32(), r.i32()
    pts: list[Point] = [(x / Q, z / Q)]
    for _ in range(1, n):
        x += r.i16()
        z += r.i16()
        pts.append((x / Q, z / Q))
    return pts


class StringTable:
    def __init__(self) -> None:
        self.items: list[str] = []
        self._index: dict[str, int] = {}

    def ref(self, s: str | None) -> int:
        """1-based index, 0 for none."""
        if not s:
            return 0
        if s not in self._index:
            self._index[s] = len(self.items)
            self.items.append(s)
        return self._index[s] + 1


def encode_roads(tile: tuple[int, int], pieces: list[RoadPiece], names: StringTable) -> bytes:
    w = Writer()
    w.u32(ROADS_MAGIC)
    w.u16(FORMAT)
    w.i16(tile[0])
    w.i16(tile[1])
    w.u32(len(pieces))
    for p in pieces:
        rd = p.road
        w.f64(float(rd.id))
        w.u16(p.piece)
        w.u8(ROAD_KINDS.index(rd.kind))
        w.u8(index_or(HIGHWAY_CLASSES, rd.highway))
        w.u8((RF_ONEWAY if rd.oneway else 0) | (RF_LANES if rd.lanes is not None else 0) | (RF_BRIDGE if rd.bridge else 0)
             | (RF_TUNNEL if rd.tunnel else 0) | (RF_ROUNDABOUT if rd.roundabout else 0) | (RF_LIT if rd.lit else 0))
        w.i8(rd.layer)
        w.u16(int(js_round(rd.width * 100)))
        w.u8(rd.lanes or 0)
        w.u8(WIDTH_FROM.index(rd.width_from))
        w.u8(index_or(SURFACES, rd.surface, len(SURFACES) - 1) if rd.surface else 0)
        w.u8(index_or(SIDEWALKS, rd.sidewalk, 0))
        w.u8(rd.maxspeed)
        w.u16(names.ref(rd.name))
        w.u16(names.ref(rd.ref))
        _ref(w, rd.source or Ref(0, rd.id // 10))
        w.f32(p.offset)
        w.f32(p.total)
        _line(w, rd.points)
    return w.done()


def decode_roads(data: bytes, names: list[str]) -> list[RoadPiece]:
    r = Reader(data)
    if r.u32() != ROADS_MAGIC:
        raise ValueError("Not a roads file.")
    fmt = r.u16()
    if fmt != FORMAT:
        raise ValueError(f"Roads file format {fmt}, expected {FORMAT}")
    r.i16()
    r.i16()
    out: list[RoadPiece] = []
    for _ in range(r.u32()):
        rid = int(r.f64())
        piece = r.u16()
        kind = ROAD_KINDS[r.u8()]
        klass = HIGHWAY_CLASSES[r.u8()]
        flags = r.u8()
        layer = r.i8()
        width = r.u16() / 100
        lanes = r.u8()
        wf = WIDTH_FROM[r.u8()]
        surface = SURFACES[r.u8()]
        sidewalk = SIDEWALKS[r.u8()]
        maxspeed = r.u8()
        name = r.u16()
        ref = r.u16()
        src = _read_ref(r)
        offset = r.f32()
        total = r.f32()
        pts = _read_line(r)
        road = Road(rid, kind, width, bool(flags & RF_ONEWAY), pts, names[name - 1] if name else None, lanes if flags & RF_LANES else None,
                    klass, wf, bool(flags & RF_BRIDGE), bool(flags & RF_TUNNEL), layer, surface, maxspeed, names[ref - 1] if ref else None,
                    sidewalk, bool(flags & RF_LIT), bool(flags & RF_ROUNDABOUT), src)
        out.append(RoadPiece(road, piece, offset, total))
    return out


def encode_areas(tile: tuple[int, int], areas: list[Area]) -> bytes:
    w = Writer()
    w.u32(AREAS_MAGIC)
    w.u16(FORMAT)
    w.i16(tile[0])
    w.i16(tile[1])
    w.u32(len(areas))
    for a in areas:
        w.u32(a.id)
        _ref(w, a.source or Ref(0, a.id))
        w.u8(AREA_KINDS.index(a.kind))
        w.u8(1 + len(a.holes))
        for ring in [a.outline, *a.holes]:
            _line(w, ring, count32=True)
    return w.done()


def decode_areas(data: bytes) -> list[Area]:
    r = Reader(data)
    if r.u32() != AREAS_MAGIC or r.u16() != FORMAT:
        raise ValueError("Not a format-2 areas file.")
    r.i16()
    r.i16()
    out: list[Area] = []
    for _ in range(r.u32()):
        aid = r.u32()
        src = _read_ref(r)
        kind = AREA_KINDS[r.u8()]
        rings = [_read_line(r, True) for _ in range(r.u8())]
        out.append(Area(aid, kind, rings[0], None, rings[1:], src))
    return out


def road_pieces_by_tile(roads: list[Road], tile_of_point: Callable[[float, float], tuple[int, int]]) -> dict[tuple[int, int], list[RoadPiece]]:
    """Each segment belongs to the tile holding its midpoint; runs become pieces that share their
    end points exactly (the `roadSpansByChunk` rule one level up)."""
    out: dict[tuple[int, int], list[RoadPiece]] = {}
    for road in roads:
        pts = road.points
        total = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
        run_key: tuple[int, int] | None = None
        start = 0
        run_offset = 0.0
        travelled = 0.0
        piece = 0

        def push(key: tuple[int, int], a: int, b: int, off: float) -> None:
            nonlocal piece
            sub = Road(**{**road.__dict__, "points": pts[a : b + 1]})
            out.setdefault(key, []).append(RoadPiece(sub, piece, off, total))
            piece += 1

        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            key = tile_of_point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if key != run_key:
                if run_key is not None:
                    push(run_key, start, i, run_offset)
                run_key = key
                start = i
                run_offset = travelled
            travelled += math.hypot(b[0] - a[0], b[1] - a[1])
        if run_key is not None:
            push(run_key, start, len(pts) - 1, run_offset)
    return out


def encode_pack(tile: tuple[int, int], blobs: list[tuple[int, int, int, bytes]]) -> tuple[bytes, list[list[int]]]:
    """One file per tile with every chunk of it: header, a table of (col, row, offset, length),
    then the chunk files back to back. Returns the bytes and the tile.json rows
    [col, row, offset, length, ring]."""
    head = 4 + 2 + 2 + 2 + 4 + len(blobs) * 12
    w = Writer()
    w.u32(PACK_MAGIC)
    w.u16(FORMAT)
    w.i16(tile[0])
    w.i16(tile[1])
    w.u32(len(blobs))
    rows: list[list[int]] = []
    off = head
    for col, row, ring, data in blobs:
        w.i16(col)
        w.i16(row)
        w.u32(off)
        w.u32(len(data))
        rows.append([col, row, off, len(data), ring])
        off += len(data)
    for *_, data in blobs:
        w.raw(data)
    return w.done(), rows


def check_pack(pack: bytes, rows: list[list[int]]) -> None:
    r = Reader(pack)
    if r.u32() != PACK_MAGIC or r.u16() != FORMAT:
        raise ValueError("Not a format-2 chunk pack.")
    r.i16()
    r.i16()
    n = r.u32()
    table = {(r.i16(), r.i16()): (r.u32(), r.u32()) for _ in range(n)}
    for col, row, off, length, _ring in rows:
        if length and table.get((col, row)) != (off, length):
            raise ValueError(f"Pack table and tile.json disagree for chunk {col},{row}")
