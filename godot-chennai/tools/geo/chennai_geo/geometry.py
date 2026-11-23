"""2D ground-plane geometry (x, z), ported from `game-world/src/geometry.ts` where the result
must match the Three.js build exactly, plus a few helpers for polygons with holes."""
from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Generic, TypeVar

from .util import round2

Point = tuple[float, float]
T = TypeVar("T")


@dataclass(frozen=True)
class Bounds:
    min_x: float
    max_x: float
    min_z: float
    max_z: float

    def to_json(self) -> dict[str, float]:
        return {"minX": self.min_x, "maxX": self.max_x, "minZ": self.min_z, "maxZ": self.max_z}


def signed_area(outline: Sequence[Point]) -> float:
    s = 0.0
    n = len(outline)
    for i in range(n):
        ax, az = outline[i]
        bx, bz = outline[(i + 1) % n]
        s += ax * bz - bx * az
    return s / 2


def centroid(outline: Sequence[Point]) -> Point:
    """Vertex average (what the TS builder uses for chunk assignment)."""
    n = len(outline)
    return (sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n)


def area_centroid(outline: Sequence[Point]) -> Point:
    a = signed_area(outline)
    if abs(a) < 1e-6:
        return centroid(outline)
    x = z = 0.0
    n = len(outline)
    for i in range(n):
        ax, az = outline[i]
        bx, bz = outline[(i + 1) % n]
        cross = ax * bz - bx * az
        x += (ax + bx) * cross
        z += (az + bz) * cross
    return (x / (6 * a), z / (6 * a))


def point_in_polygon(x: float, z: float, outline: Sequence[Point]) -> bool:
    inside = False
    n = len(outline)
    j = n - 1
    for i in range(n):
        ax, az = outline[i]
        bx, bz = outline[j]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax:
            inside = not inside
        j = i
    return inside


def inside_bounds(p: Point, b: Bounds, margin: float = 0) -> bool:
    return b.min_x + margin <= p[0] <= b.max_x - margin and b.min_z + margin <= p[1] <= b.max_z - margin


def closest_on_segment(p: Point, a: Point, b: Point) -> tuple[float, float, float]:
    dx = b[0] - a[0]
    dz = b[1] - a[1]
    l2 = dx * dx + dz * dz
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2))
    x = a[0] + dx * t
    z = a[1] + dz * t
    return x, z, (p[0] - x) ** 2 + (p[1] - z) ** 2


def bounds_of(points: Iterable[Point]) -> Bounds:
    xs: list[float] = []
    zs: list[float] = []
    for x, z in points:
        xs.append(x)
        zs.append(z)
    return Bounds(min(xs), max(xs), min(zs), max(zs))


def _clip_segment(a: Point, b: Point, r: Bounds) -> tuple[Point, Point, bool] | None:
    t0, t1 = 0.0, 1.0
    dx = b[0] - a[0]
    dz = b[1] - a[1]
    for p, q in ((-dx, a[0] - r.min_x), (dx, r.max_x - a[0]), (-dz, a[1] - r.min_z), (dz, r.max_z - a[1])):
        if p == 0:
            if q < 0:
                return None
            continue
        t = q / p
        if p < 0:
            if t > t1:
                return None
            if t > t0:
                t0 = t
        else:
            if t < t0:
                return None
            if t < t1:
                t1 = t

    def at(t: float) -> Point:
        return (round2(a[0] + dx * t), round2(a[1] + dz * t))

    return (at(t0) if t0 > 0 else a, at(t1) if t1 < 1 else b, t1 < 1)


def clip_line(points: Sequence[Point], bounds: Bounds) -> list[list[Point]]:
    """Port of `clipLine` (Liang-Barsky per segment)."""
    pieces: list[list[Point]] = []
    current: list[Point] = []
    for i in range(len(points) - 1):
        c = _clip_segment(points[i], points[i + 1], bounds)
        if c is None:
            if len(current) > 1:
                pieces.append(current)
            current = []
            continue
        a, b, cut_end = c
        if not current:
            current.append(a)
        else:
            last = current[-1]
            if last[0] != a[0] or last[1] != a[1]:
                if len(current) > 1:
                    pieces.append(current)
                current = [a]
        current.append(b)
        if cut_end:
            if len(current) > 1:
                pieces.append(current)
            current = []
    if len(current) > 1:
        pieces.append(current)
    return pieces


def clip_polygon(outline: Sequence[Point], r: Bounds) -> list[Point]:
    """Port of `clipPolygon` (Sutherland-Hodgman to a rectangle)."""

    def at(a: Point, b: Point, t: float) -> Point:
        return (round2(a[0] + (b[0] - a[0]) * t), round2(a[1] + (b[1] - a[1]) * t))

    edges: list[tuple[Callable[[Point], bool], Callable[[Point, Point], Point]]] = [
        (lambda p: p[0] >= r.min_x, lambda a, b: at(a, b, (r.min_x - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= r.max_x, lambda a, b: at(a, b, (r.max_x - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= r.min_z, lambda a, b: at(a, b, (r.min_z - a[1]) / (b[1] - a[1]))),
        (lambda p: p[1] <= r.max_z, lambda a, b: at(a, b, (r.max_z - a[1]) / (b[1] - a[1]))),
    ]
    out: list[Point] = list(outline)
    for inside, cut in edges:
        if not out:
            break
        inp = out
        out = []
        n = len(inp)
        for i in range(n):
            cur = inp[i]
            prev = inp[(i + n - 1) % n]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
    n = len(out)
    clean = [p for i, p in enumerate(out) if n == 1 or p != out[(i + n - 1) % n]]
    return clean if len(clean) >= 3 and abs(signed_area(clean)) > 0.5 else []


class SpatialGrid(Generic[T]):
    """Uniform bucket grid (port of `SpatialGrid`)."""

    def __init__(self, cell: float) -> None:
        self.cell = cell
        self.cells: dict[tuple[int, int], list[T]] = {}

    def add(self, item: T, box: Bounds) -> None:
        c = self.cell
        for cx in range(math.floor(box.min_x / c), math.floor(box.max_x / c) + 1):
            for cz in range(math.floor(box.min_z / c), math.floor(box.max_z / c) + 1):
                self.cells.setdefault((cx, cz), []).append(item)

    def add_point(self, item: T, x: float, z: float) -> None:
        self.cells.setdefault((math.floor(x / self.cell), math.floor(z / self.cell)), []).append(item)

    def near(self, x: float, z: float, radius: float, visit: Callable[[T], bool | None]) -> bool:
        c = self.cell
        for cx in range(math.floor((x - radius) / c), math.floor((x + radius) / c) + 1):
            for cz in range(math.floor((z - radius) / c), math.floor((z + radius) / c) + 1):
                lst = self.cells.get((cx, cz))
                if not lst:
                    continue
                for item in lst:
                    if visit(item) is True:
                        return True
        return False
