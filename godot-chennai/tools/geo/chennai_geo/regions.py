"""The regional grid: 250 m chunks, 10 km region tiles (40 x 40 chunks), and the rings the
world is built in (MIGRATION_PROMPT §9). See world-format.md "Grid" and "Rings"."""
from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import shapely
from shapely.geometry import Polygon, box
from shapely.prepared import prep

from .geometry import Bounds, Point
from .projection import PROJECTION

CHUNK_SIZE = 250
TILE_CHUNKS = 40
TILE_SIZE = CHUNK_SIZE * TILE_CHUNKS

# Today's clip box (scripts/clip-city.py) and how build-world.ts turns it into bounds.
RING0_BOX = (12.98, 80.195, 13.095, 80.29)  # S, W, N, E


def ring0_bounds() -> Bounds:
    s, w, n, e = RING0_BOX
    swx, swz = PROJECTION.to_local(s, w)
    nex, nez = PROJECTION.to_local(n, e)
    return Bounds(math.ceil(swx) + 20, math.floor(nex) - 20, math.ceil(nez) + 20, math.floor(swz) - 20)


@dataclass(frozen=True)
class RingSpec:
    id: int
    name: str
    box: tuple[float, float, float, float]  # S, W, N, E (degrees); ring 0 uses ring0_bounds()


RINGS: list[RingSpec] = [
    RingSpec(0, "today's box: Anna Nagar to T. Nagar, Anna Salai and Marina", RING0_BOX),
    RingSpec(1, "the whole city: Ambattur and Avadi to Sholinganallur, the airport, Tambaram, Tiruvottiyur, Ennore", (12.82, 80.10, 13.24, 80.40)),
    RingSpec(2, "suburbs and corridors: GST Road to Guduvanchery, Sriperumbudur road, Poonamallee, Red Hills, Ponneri road, OMR and ECR", (12.75, 80.00, 13.40, 80.40)),
    RingSpec(3, "rural edges: Chengalpattu, Sriperumbudur, Gummidipoondi, Ponneri and Pulicat to the state border", (12.68, 79.95, 13.60, 80.40)),
]


def latlng_box_local(b: tuple[float, float, float, float]) -> Bounds:
    s, w, n, e = b
    swx, swz = PROJECTION.to_local(s, w)
    nex, nez = PROJECTION.to_local(n, e)
    return Bounds(swx, nex, nez, swz)


class Playable:
    """Where content is kept. Ring 0 is today's exact rectangle (so its tests mean what the
    TS builder's `insideBounds` meant); the others are their box intersected with the world
    boundary polygon."""

    def __init__(self, rect: Bounds, poly: Polygon | None = None) -> None:
        self.rect = rect
        self.poly = poly
        self._shrunk: dict[float, object] = {}
        if poly is not None:
            self.poly_prepared = prep(poly)

    def _shape(self, margin: float) -> Polygon:
        assert self.poly is not None
        if margin not in self._shrunk:
            g = self.poly.buffer(-margin) if margin else self.poly
            shapely.prepare(g)
            self._shrunk[margin] = g
        return self._shrunk[margin]  # type: ignore[return-value]

    def inside(self, p: Point, margin: float = 0) -> bool:
        r = self.rect
        if not (r.min_x + margin <= p[0] <= r.max_x - margin and r.min_z + margin <= p[1] <= r.max_z - margin):
            return False
        if self.poly is None:
            return True
        return bool(shapely.contains_xy(self._shape(margin), p[0], p[1]))

    def inside_many(self, xs: Sequence[float], zs: Sequence[float], margin: float = 0) -> list[bool]:
        import numpy as np

        x = np.asarray(xs)
        z = np.asarray(zs)
        r = self.rect
        ok = (x >= r.min_x + margin) & (x <= r.max_x - margin) & (z >= r.min_z + margin) & (z <= r.max_z - margin)
        if self.poly is not None and ok.any():
            ok &= shapely.contains_xy(self._shape(margin), x, z)
        return ok.tolist()

    def shape(self) -> Polygon:
        r = self.rect
        return self.poly if self.poly is not None else box(r.min_x, r.min_z, r.max_x, r.max_z)


def boundary_local(boundary_lnglat: Polygon) -> Polygon:
    return Polygon([PROJECTION.to_local(lat, lng) for lng, lat in boundary_lnglat.exterior.coords])


def playable_for(ring: int, boundary_lnglat: Polygon | None) -> Playable:
    if ring == 0:
        return Playable(ring0_bounds())
    if boundary_lnglat is None:
        raise ValueError("Rings above 0 need the world boundary.")
    rb = latlng_box_local(RINGS[ring].box)
    poly = boundary_local(boundary_lnglat).intersection(box(rb.min_x, rb.min_z, rb.max_x, rb.max_z))
    if not isinstance(poly, Polygon):
        poly = max(poly.geoms, key=lambda g: g.area)  # type: ignore[attr-defined]
    b = poly.bounds
    return Playable(Bounds(b[0], b[2], b[1], b[3]), poly)


@dataclass(frozen=True)
class Grid:
    """Chunk (0, 0) starts at (min_x, min_z). Aligned so today's chunk lines are chunk lines."""

    min_x: float
    min_z: float
    cols: int
    rows: int

    def col(self, x: float) -> int:
        return math.floor((x - self.min_x) / CHUNK_SIZE)

    def row(self, z: float) -> int:
        return math.floor((z - self.min_z) / CHUNK_SIZE)

    def chunk_bounds(self, col: int, row: int) -> Bounds:
        x = self.min_x + col * CHUNK_SIZE
        z = self.min_z + row * CHUNK_SIZE
        return Bounds(x, x + CHUNK_SIZE, z, z + CHUNK_SIZE)

    def centre(self, col: int, row: int) -> Point:
        return (self.min_x + (col + 0.5) * CHUNK_SIZE, self.min_z + (row + 0.5) * CHUNK_SIZE)

    @property
    def legacy_offset(self) -> tuple[int, int]:
        """(dc, dr): today's chunk (c, r) is this grid's (c + dc, r + dr)."""
        r0 = ring0_bounds()
        return (round((r0.min_x - self.min_x) / CHUNK_SIZE), round((r0.min_z - self.min_z) / CHUNK_SIZE))


def world_grid() -> Grid:
    r0 = ring0_bounds()
    wb = latlng_box_local(RINGS[3].box)
    dc = math.ceil((r0.min_x - wb.min_x) / CHUNK_SIZE)
    dr = math.ceil((r0.min_z - wb.min_z) / CHUNK_SIZE)
    min_x = r0.min_x - dc * CHUNK_SIZE
    min_z = r0.min_z - dr * CHUNK_SIZE
    return Grid(min_x, min_z, math.ceil((wb.max_x - min_x) / CHUNK_SIZE), math.ceil((wb.max_z - min_z) / CHUNK_SIZE))


def tile_of(col: int, row: int) -> tuple[int, int]:
    return (col // TILE_CHUNKS, row // TILE_CHUNKS)


def chunk_ring(grid: Grid, col: int, row: int, playables: list[Playable]) -> int:
    """Smallest ring whose playable area overlaps this chunk square (at more than its edge)."""
    b = grid.chunk_bounds(col, row)
    sq = box(b.min_x, b.min_z, b.max_x, b.max_z)
    for i, p in enumerate(playables):
        r = p.rect
        if b.max_x <= r.min_x or b.min_x >= r.max_x or b.max_z <= r.min_z or b.min_z >= r.max_z:
            continue
        if p.poly is None or p.poly.intersects(sq):
            return i
    return len(playables) - 1
