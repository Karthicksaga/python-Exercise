"""The sea: a port of `game-world/src/coast.ts` (joinCoastline, seaOutline, buildSea)."""
from __future__ import annotations

import math
from typing import Any

from .geometry import Bounds, Point, bounds_of, point_in_polygon
from .model import Area, OsmLine
from .util import round2

SEA_REACH = 3000.0


def join_coastline(lines: list[OsmLine]) -> tuple[list[Point], list[int]] | None:
    by_start: dict[Point, int] = {}
    ends: set[Point] = set()
    for i, line in enumerate(lines):
        by_start[line.points[0]] = i
        ends.add(line.points[-1])
    best: tuple[list[Point], list[int], float] | None = None
    used: set[int] = set()
    order = sorted(range(len(lines)), key=lambda i: int(lines[i].points[0] in ends))
    for first in order:
        if first in used:
            continue
        pts: list[Point] = []
        ids: list[int] = []
        at: int | None = first
        while at is not None and at not in used:
            used.add(at)
            line = lines[at]
            pts.extend(line.points[1:] if pts else line.points)
            ids.append(line.id)
            at = by_start.get(line.points[-1])
        length = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
        if best is None or length > best[2]:
            best = (pts, ids, length)
    return (best[0], best[1]) if best and len(best[0]) >= 2 else None


def _exit_point(p: Point, dx: float, dz: float, r: Bounds) -> Point:
    t = math.inf
    if dx > 1e-9:
        t = min(t, (r.max_x - p[0]) / dx)
    if dx < -1e-9:
        t = min(t, (r.min_x - p[0]) / dx)
    if dz > 1e-9:
        t = min(t, (r.max_z - p[1]) / dz)
    if dz < -1e-9:
        t = min(t, (r.min_z - p[1]) / dz)
    return (round2(p[0] + dx * t), round2(p[1] + dz * t))


def _heading(p: Point, pts: list[Point], min_d: float = 40) -> tuple[float, float]:
    q = pts[-1]
    for c in pts:
        if math.hypot(c[0] - p[0], c[1] - p[1]) >= min_d:
            q = c
            break
    length = math.hypot(q[0] - p[0], q[1] - p[1]) or 1
    return ((q[0] - p[0]) / length, (q[1] - p[1]) / length)


def _perimeter(p: Point, r: Bounds) -> float:
    w = r.max_x - r.min_x
    d = r.max_z - r.min_z
    eps = 0.01
    if abs(p[1] - r.min_z) < eps:
        return (p[0] - r.min_x) / w
    if abs(p[0] - r.max_x) < eps:
        return 1 + (p[1] - r.min_z) / d
    if abs(p[1] - r.max_z) < eps:
        return 2 + (r.max_x - p[0]) / w
    return 3 + (r.max_z - p[1]) / d


def sea_outline(coast: list[Point], r: Bounds) -> list[Point] | None:
    t0 = _perimeter(coast[0], r)
    t1 = _perimeter(coast[-1], r)
    corners = [(r.max_x, r.min_z), (r.max_x, r.max_z), (r.min_x, r.max_z), (r.min_x, r.min_z)]

    def walk(forward: bool) -> list[Point]:
        positions = [(c, (k + 1) % 4) for k, c in enumerate(corners)]
        span = (t0 - t1 + 4) % 4 if forward else (t1 - t0 + 4) % 4
        passed = sorted(
            ((c, (t - t1 + 4) % 4 if forward else (t1 - t + 4) % 4) for c, t in positions),
            key=lambda cs: cs[1],
        )
        return [*coast, *[c for c, s in passed if 0 < s < span]]

    probe: Point | None = None
    longest = 0.0
    for i in range(len(coast) - 1):
        a, b = coast[i], coast[i + 1]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        if length > longest:
            longest = length
            probe = ((a[0] + b[0]) / 2 + (-(b[1] - a[1]) / length) * 2, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / length) * 2)
    if probe is None:
        return None
    for forward in (True, False):
        out = walk(forward)
        if point_in_polygon(probe[0], probe[1], out):
            return out
    return None


def build_sea(coastlines: list[OsmLine], areas: list[Area], bounds: Bounds) -> dict[str, Any] | None:
    wide = Bounds(bounds.min_x - SEA_REACH, bounds.max_x + SEA_REACH, bounds.min_z - SEA_REACH, bounds.max_z + SEA_REACH)
    chain = join_coastline(coastlines)
    if chain:
        pts, ids = chain
        back = _heading(pts[0], pts)
        on = _heading(pts[-1], list(reversed(pts)))
        coast = [_exit_point(pts[0], -back[0], -back[1], wide), *pts, _exit_point(pts[-1], -on[0], -on[1], wide)]
        source = f"OSM natural=coastline ways {', '.join(str(i) for i in ids)}, carried straight on past the map edge"
    else:
        beaches = [a for a in areas if a.kind == "beach"]
        if not beaches:
            return None
        east = max(bounds_of(b.outline).max_x for b in beaches)
        coast = [(east, wide.max_z), (east, wide.min_z)]
        source = "estimated: no coastline in the extract, so the east edge of the mapped beaches"
    outline = sea_outline(coast, wide)
    if not outline:
        return None
    return {"coast": [{"x": x, "z": z} for x, z in coast], "outline": [{"x": x, "z": z} for x, z in outline], "source": source}
