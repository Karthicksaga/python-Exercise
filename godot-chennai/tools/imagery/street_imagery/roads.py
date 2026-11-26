"""OSM roads of the game's world data (the `roads.bin` of each tile), for the coverage report.

Read through `chennai_geo.codec_v2` so the streets are exactly the game's streets (© OpenStreetMap
contributors, ODbL). Only the part of each road inside the box is sampled.
"""
from __future__ import annotations

import json
import math
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from .bbox import BBox
from .grid import GODOT, PROJECTION

WORLD_DIR = GODOT / "world"
SAMPLE_M = 10.0
# Roads people drive or walk along and see buildings from; tracks and raceways are left out.
STREET_CLASSES = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary",
                  "tertiary_link", "residential", "unclassified", "living_street", "service", "pedestrian", "road"}


@dataclass(frozen=True)
class Street:
    name: str  # OSM name, or "(unnamed <highway>)"
    highway: str
    samples: tuple[tuple[float, float], ...]  # world metres (x east, z south), one per SAMPLE_M of road inside the box
    named: bool


def densify(points: list[tuple[float, float]], step: float = SAMPLE_M) -> Iterator[tuple[float, float]]:
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        d = math.hypot(x1 - x0, z1 - z0)
        n = max(1, math.ceil(d / step))
        for i in range(n):
            t = i / n
            yield (x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
    if points:
        yield points[-1]


def load_streets(box: BBox, world_dir: Path = WORLD_DIR) -> list[Street]:
    """Streets (one entry per OSM way id) with their samples inside `box`."""
    from chennai_geo import codec_v2  # needs the geo venv only for this function (pure python, but a package import)

    index = json.loads((world_dir / "world.json").read_text(encoding="utf-8"))
    x0, z0 = PROJECTION.to_local(box.north, box.west)
    x1, z1 = PROJECTION.to_local(box.south, box.east)
    seen: dict[int, tuple[str, str, list[tuple[float, float]]]] = {}
    for tc, tr, *_ in index["tiles"]:
        d = world_dir / "tiles" / f"{tc}_{tr}"
        tj = json.loads((d / "tile.json").read_text(encoding="utf-8"))
        b = tj["bounds"]
        if b["maxX"] < x0 or b["minX"] > x1 or b["maxZ"] < z0 or b["minZ"] > z1:
            continue
        for piece in codec_v2.decode_roads((d / "roads.bin").read_bytes(), tj["roadNames"]):
            r = piece.road
            if r.highway not in STREET_CLASSES or r.tunnel:
                continue
            pts = [p for p in densify([(float(x), float(z)) for x, z in r.points]) if x0 <= p[0] <= x1 and z0 <= p[1] <= z1]
            if not pts:
                continue
            name = r.name or f"(unnamed {r.highway})"
            entry = seen.setdefault(int(r.id), (name, r.highway, []))
            entry[2].extend(pts)
    return [Street(n, h, tuple(s), not n.startswith("(unnamed")) for n, h, s in seen.values()]
