"""`fusion.bin` (format 2.3, G-221): the buildings other datasets add where OSM has none, and the
heights they give OSM buildings whose height was estimated. One file per region tile next to
`chunks.bin`; every 2.0, 2.1 and 2.2 file stays byte for byte the same. Layout in
docs/world-format.md §3.9; `tests/test_fusion_world.py` pins it.

```
u32 magic "COWF", u16 format 2, u16 minor 3, i16 tc, i16 tr, u16 nSections
section × n: u32 tag, u32 length, payload      (unknown tags are skipped)
"HGHT" u32 count; count × {u32 building id (chunks.bin), u16 height × 10, u8 floors, u8 heightFrom, u8 source}
"BLDG" u32 chunks; per chunk {i16 col, i16 row, u8 ring, u32 firstId, u16 n; n × record}
  record: u8 head      bits 0-1 source (FUSION_SOURCES), 2-3 Overture origin, 4 polygon (else box),
                       5 apartments (else house), 6 height stored (else floors × 3.1 + 0.9),
                       7 heightFrom stored (else "estimated")
          [u8 heightFrom (HEIGHT_FROM) when bit 7], u8 floors, [u16 height × 10 when bit 6],
          u8 colour (WALL_COLORS index), u8 confidence × 200 (255 = none),
          varint source index: zigzag LEB128 of (index - previous index of the same source in
                       this chunk, 0 for the first), so the row in the source extract costs 1-3 bytes
          box:     i16 cx, i16 cz (5 cm steps from the chunk centre), u8 length × 10, u8 width × 10,
                   u8 angle × 256 / pi (long side direction, atan2(dz, dx) in [0, pi))
          polygon: u8 n, n × {i16 dx, i16 dz} from the chunk centre, anticlockwise seen from above
```
Building ids: `firstId + i`; firstIds start at 0xC0000000 and run through the world in tile order (OSM ways stay below
2^31; multipolygon parts are 0x80000000 | relation << 3 | part, which reaches 0xC0000000 only once
relation ids pass 134 million, about 19 million today).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from .binio import Reader, Writer
from .enums import HEIGHT_FROM
from .fusion_multi import Rect, as_rect, rect_outline
from .geometry import Point
from .rules import FLOOR_HEIGHT, PARAPET, WALL_COLORS
from .util import js_round, round1

MAGIC = 0x46574F43  # "COWF"
FORMAT = 2
MINOR = 3
Q = 20
FIRST_ID = 0xC0000000
TAG_HGHT = int.from_bytes(b"HGHT", "little")
TAG_BLDG = int.from_bytes(b"BLDG", "little")
H_POLYGON, H_APARTMENTS, H_HEIGHT, H_FROM = 16, 32, 64, 128
MAX_BOX_SIDE = 25.5


@dataclass
class FusedBuilding:
    source: int
    origin: int
    index: int
    confidence: float  # -1 none
    height: float
    height_from: str
    floors: int
    kind: str
    color: int
    outline: list[Point]
    rect: Rect | None = None


@dataclass
class FusedChunk:
    col: int
    row: int
    ring: int
    first_id: int
    buildings: list[FusedBuilding] = field(default_factory=list)


@dataclass
class HeightFix:
    building_id: int
    height: float
    floors: int
    height_from: str
    source: int


@dataclass
class FusionTile:
    tile: tuple[int, int]
    heights: list[HeightFix] = field(default_factory=list)
    chunks: list[FusedChunk] = field(default_factory=list)


def _estimated_height(floors: int) -> float:
    return round1(floors * FLOOR_HEIGHT + PARAPET)


def box_of(b: FusedBuilding) -> Rect | None:
    r = b.rect if b.rect is not None else as_rect(b.outline)
    if r is None or r.length > MAX_BOX_SIDE or r.width < 0.1:
        return None
    return r


def _varint(w: Writer, v: int) -> None:
    z = (v << 1) if v >= 0 else ((-v << 1) - 1)
    while True:
        b = z & 0x7F
        z >>= 7
        if z:
            w.u8(b | 0x80)
        else:
            w.u8(b)
            return


def _read_varint(r: Reader) -> int:
    z = shift = 0
    while True:
        b = r.u8()
        z |= (b & 0x7F) << shift
        shift += 7
        if not b & 0x80:
            break
    return (z >> 1) if not z & 1 else -((z + 1) >> 1)


def encode(t: FusionTile, centre_of: object) -> bytes:
    """`centre_of(col, row) -> (x, z)`: the chunk centre (Grid.centre)."""
    cf = centre_of  # typed loosely so the Grid method and test lambdas both fit
    sections: list[tuple[int, bytes]] = []
    h = Writer()
    h.u32(len(t.heights))
    for fix in t.heights:
        h.u32(fix.building_id)
        h.u16(int(js_round(fix.height * 10)))
        h.u8(fix.floors)
        h.u8(HEIGHT_FROM.index(fix.height_from))
        h.u8(fix.source)
    sections.append((TAG_HGHT, h.done()))
    w = Writer()
    w.u32(len(t.chunks))
    for c in t.chunks:
        cx, cz = cf(c.col, c.row)  # type: ignore[operator]
        w.i16(c.col)
        w.i16(c.row)
        w.u8(c.ring)
        w.u32(c.first_id)
        w.u16(len(c.buildings))
        last: dict[int, int] = {}
        for b in c.buildings:
            r = box_of(b)
            stored_h = b.height_from != "estimated" or abs(b.height - _estimated_height(b.floors)) > 0.05
            head = (b.source | (b.origin << 2) | (0 if r is not None else H_POLYGON) | (H_APARTMENTS if b.kind == "apartments" else 0)
                    | (H_HEIGHT if stored_h else 0) | (H_FROM if b.height_from != "estimated" else 0))
            w.u8(head)
            if head & H_FROM:
                w.u8(HEIGHT_FROM.index(b.height_from))
            w.u8(b.floors)
            if stored_h:
                w.u16(int(js_round(b.height * 10)))
            w.u8(WALL_COLORS.index(b.color) if b.color in WALL_COLORS else 0)
            w.u8(255 if b.confidence < 0 else min(200, int(js_round(b.confidence * 200))))
            _varint(w, b.index - last.get(b.source, 0))
            last[b.source] = b.index
            if r is not None:
                w.i16(int(js_round((r.cx - cx) * Q)))
                w.i16(int(js_round((r.cz - cz) * Q)))
                w.u8(min(255, int(js_round(r.length * 10))))
                w.u8(min(255, max(1, int(js_round(r.width * 10)))))
                w.u8(int(js_round(r.angle * 256 / math.pi)) % 256)
            else:
                pts = b.outline
                if len(pts) > 255:
                    raise ValueError("A fused footprint has more than 255 points.")
                w.u8(len(pts))
                for x, z in pts:
                    w.i16(int(js_round((x - cx) * Q)))
                    w.i16(int(js_round((z - cz) * Q)))
    sections.append((TAG_BLDG, w.done()))
    out = Writer()
    out.u32(MAGIC)
    out.u16(FORMAT)
    out.u16(MINOR)
    out.i16(t.tile[0])
    out.i16(t.tile[1])
    out.u16(len(sections))
    for tag, payload in sections:
        out.u32(tag)
        out.u32(len(payload))
        out.raw(payload)
    return out.done()


def decode(data: bytes, centre_of: object) -> FusionTile:
    cf = centre_of
    r = Reader(data)
    if r.u32() != MAGIC or r.u16() != FORMAT:
        raise ValueError("Not a fusion file.")
    if r.u16() < MINOR:
        raise ValueError("Fusion file minor version too old.")
    t = FusionTile((r.i16(), r.i16()))
    for _ in range(r.u16()):
        tag, length = r.u32(), r.u32()
        payload = r.raw(length)
        s = Reader(payload)
        if tag == TAG_HGHT:
            for _ in range(s.u32()):
                t.heights.append(HeightFix(s.u32(), s.u16() / 10, s.u8(), HEIGHT_FROM[s.u8()], s.u8()))
        elif tag == TAG_BLDG:
            for _ in range(s.u32()):
                col, row, ring, first, n = s.i16(), s.i16(), s.u8(), s.u32(), s.u16()
                cx, cz = cf(col, row)  # type: ignore[operator]
                ch = FusedChunk(col, row, ring, first)
                last: dict[int, int] = {}
                for _ in range(n):
                    head = s.u8()
                    hf = HEIGHT_FROM[s.u8()] if head & H_FROM else "estimated"
                    floors = s.u8()
                    height = s.u16() / 10 if head & H_HEIGHT else _estimated_height(floors)
                    color = WALL_COLORS[s.u8()]
                    conf_b = s.u8()
                    idx = last.get(head & 3, 0) + _read_varint(s)
                    last[head & 3] = idx
                    rect = None
                    if head & H_POLYGON:
                        pts = [(cx + s.i16() / Q, cz + s.i16() / Q) for _ in range(s.u8())]
                    else:
                        rect = Rect(cx + s.i16() / Q, cz + s.i16() / Q, s.u8() / 10, s.u8() / 10, s.u8() * math.pi / 256)
                        pts = rect_outline(rect)
                    ch.buildings.append(FusedBuilding(head & 3, (head >> 2) & 3, idx, -1.0 if conf_b == 255 else conf_b / 200, height, hf, floors,
                                                      "apartments" if head & H_APARTMENTS else "house", color, [(round(x, 2), round(z, 2)) for x, z in pts], rect))
                t.chunks.append(ch)
        if s.left:
            raise ValueError(f"{s.left} trailing bytes in fusion section")
    if r.left:
        raise ValueError(f"{r.left} trailing bytes in fusion file")
    return t
