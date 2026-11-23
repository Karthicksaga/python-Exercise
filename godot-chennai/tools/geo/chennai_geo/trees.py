"""Avenue and park trees: a port of `generateTrees` and `Blockers` (buildWorldMap.ts)."""
from __future__ import annotations

import math
from collections.abc import Callable

from .geometry import Point, SpatialGrid, bounds_of, closest_on_segment, point_in_polygon, signed_area, Bounds
from .model import Area, Building, Road, Tree
from .util import hash01

MAIN_ROADS = {"primary", "secondary", "tertiary"}


class Blockers:
    def __init__(self, roads: list[Road], buildings: list[Building]) -> None:
        self.segments: SpatialGrid[tuple[Road, int]] = SpatialGrid(50)
        self.footprints: SpatialGrid[Building] = SpatialGrid(50)
        for road in roads:
            pad = road.width / 2 + 1
            for i in range(len(road.points) - 1):
                b = bounds_of([road.points[i], road.points[i + 1]])
                self.segments.add((road, i), Bounds(b.min_x - pad, b.max_x + pad, b.min_z - pad, b.max_z + pad))
        for bld in buildings:
            self.footprints.add(bld, bounds_of(bld.outline))

    def blocked(self, p: Point, clearance: float) -> bool:
        def on_road(s: tuple[Road, int]) -> bool:
            road, i = s
            return closest_on_segment(p, road.points[i], road.points[i + 1])[2] < (road.width / 2 + clearance) ** 2

        if self.segments.near(p[0], p[1], 0, on_road):
            return True
        return self.footprints.near(p[0], p[1], 0, lambda b: point_in_polygon(p[0], p[1], b.outline))


def generate_trees(roads: list[Road], areas: list[Area], blockers: Blockers, inside4: Callable[[Point], bool], planted: SpatialGrid[Tree]) -> list[Tree]:
    trees: list[Tree] = []

    def add(p: Point, seed: int) -> None:
        if not inside4(p) or blockers.blocked(p, 0.8):
            return
        if planted.near(p[0], p[1], 6, lambda t: (t.x - p[0]) ** 2 + (t.z - p[1]) ** 2 < 36):
            return
        t = Tree(math.floor(p[0] * 10 + 0.5) / 10, math.floor(p[1] * 10 + 0.5) / 10, 0.8 + hash01(seed, 3) * 0.5, "generated")
        trees.append(t)
        planted.add_point(t, t.x, t.z)

    for road in roads:
        if road.kind not in MAIN_ROADS:
            continue
        carried = 0.0
        for i in range(len(road.points) - 1):
            a, b = road.points[i], road.points[i + 1]
            length = math.hypot(b[0] - a[0], b[1] - a[1])
            if length < 0.01:
                continue
            ux = (b[0] - a[0]) / length
            uz = (b[1] - a[1]) / length
            offset = road.width / 2 + 2.2
            d = 18 - carried
            while d < length:
                for side in (-1, 1):
                    add((a[0] + ux * d - uz * offset * side, a[1] + uz * d + ux * offset * side), road.id + math.floor(d + 0.5) * 31 + side)
                d += 18
            carried = (carried + length) % 18

    for area in areas:
        if area.kind != "park":
            continue
        box = bounds_of(area.outline)
        w = box.max_x - box.min_x
        dd = box.max_z - box.min_z
        tries = min(260, math.floor(abs(signed_area(area.outline)) / 110 + 0.5) * 2)
        for i in range(tries):
            p = (box.min_x + hash01(area.id, i * 2 + 1) * w, box.min_z + hash01(area.id, i * 2 + 2) * dd)
            if point_in_polygon(p[0], p[1], area.outline):
                add(p, area.id + i)
    return trees
