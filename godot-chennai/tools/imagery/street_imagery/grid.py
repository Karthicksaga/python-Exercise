"""The game's chunk grid, read from the world data (`world/world.json`), never hard-coded.

Chunk (col, row) is the 250 m square starting at world (min_x + col*250, min_z + row*250);
world metres are +X east, +Z south (TD-2), produced by the same equirectangular projection the
game uses (`chennai_geo.projection`). A test cross-checks this against `chennai_geo.regions`.
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

from .bbox import BBox

GODOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(GODOT / "tools" / "geo"))
from chennai_geo.projection import PROJECTION  # noqa: E402  (pure maths, no heavy imports)

WORLD_JSON = GODOT / "world" / "world.json"


@dataclass(frozen=True)
class ChunkGrid:
    min_x: float
    min_z: float
    cols: int
    rows: int
    size: float = 250.0

    @classmethod
    def from_world(cls, path: Path = WORLD_JSON) -> "ChunkGrid":
        w = json.loads(path.read_text(encoding="utf-8"))
        g = w["grid"]
        return cls(float(g["minX"]), float(g["minZ"]), int(g["cols"]), int(g["rows"]), float(w["chunkSize"]))

    def chunk_of_local(self, x: float, z: float) -> tuple[int, int]:
        return (math.floor((x - self.min_x) / self.size), math.floor((z - self.min_z) / self.size))

    def chunk_of(self, lat: float, lng: float) -> tuple[int, int]:
        x, z = PROJECTION.to_local(lat, lng)
        return self.chunk_of_local(x, z)

    def chunk_box(self, col: int, row: int) -> BBox:
        """The chunk square as a lat/lng box (the square is slightly rotated in lat/lng only by
        projection curvature, negligible at 250 m; the corners' extremes are used)."""
        x0 = self.min_x + col * self.size
        z0 = self.min_z + row * self.size
        corners = [PROJECTION.to_latlng(x, z) for x in (x0, x0 + self.size) for z in (z0, z0 + self.size)]
        return BBox(min(c.lat for c in corners), min(c.lng for c in corners), max(c.lat for c in corners), max(c.lng for c in corners))

    def chunks_inside(self, box: BBox) -> list[tuple[int, int]]:
        """Chunks whose whole square lies inside `box`."""
        xs: list[float] = []
        zs: list[float] = []
        for lat in (box.south, box.north):
            for lng in (box.west, box.east):
                x, z = PROJECTION.to_local(lat, lng)
                xs.append(x)
                zs.append(z)
        c0, r0 = self.chunk_of_local(min(xs), min(zs))
        c1, r1 = self.chunk_of_local(max(xs), max(zs))
        out = []
        for c in range(c0, c1 + 1):
            for r in range(r0, r1 + 1):
                if box.contains_box(self.chunk_box(c, r)):
                    out.append((c, r))
        return out
