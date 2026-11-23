"""Famous places: a port of `findLandmarks` (game-world/src/landmarks.ts).

One change for the regional world: a spec may carry `near` (lat, lng, metres). In today's small
box the first feature whose name matches is the right one; across 4,500 km² another temple or
beach can share the name, so candidates are limited to that circle (G-27).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

from .geometry import Point, area_centroid, point_in_polygon
from .model import OsmFeatures, OsmPolygon, Tags
from .projection import PROJECTION
from .util import round2


@dataclass(frozen=True)
class LandmarkSpec:
    id: str
    kind: str
    name: str
    tags: list[dict[str, str]]
    names: re.Pattern[str]
    estimated: list[str]
    within: re.Pattern[str] | None = None
    derive: str | None = None
    outline_is_footprint: bool = True
    name_tags: list[str] = field(default_factory=list)
    height: float | None = None
    levels: int | None = None
    radius: float | None = None
    opened: int | None = None
    near: tuple[float, float, float] | None = None


LANDMARK_SPECS: list[LandmarkSpec] = [
    LandmarkSpec("anna-nagar-tower", "tower", "Anna Nagar Tower", [{"man_made": "tower"}], re.compile(r"anna nagar tower|visves?varaya tower", re.I),
                 ["height", "levels", "radius", "opened"], within=re.compile(r"anna nagar tower park", re.I), derive="ring-path",
                 height=41, levels=12, radius=9.5, opened=1968, near=(13.0870, 80.2140, 2000)),
    LandmarkSpec("kapaleeshwarar-temple", "temple", "Kapaleeshwarar Temple", [{"amenity": "place_of_worship"}, {"building": "temple"}],
                 re.compile(r"kapaleeswarar|kapaleeshwarar|kapali", re.I), ["height", "levels", "radius", "position"],
                 height=37, levels=7, radius=13, outline_is_footprint=False, near=(13.0339, 80.2696, 1500)),
    LandmarkSpec("marina-beach", "beach", "Marina Beach", [{"natural": "beach"}], re.compile(r"marina", re.I), [], near=(13.05, 80.283, 4000)),
    LandmarkSpec("t-nagar", "district", "T. Nagar", [{"place": "suburb"}, {"place": "neighbourhood"}, {"place": "quarter"}],
                 re.compile(r"^(t\.? ?nagar|th?i?yagaraya ?nagar)$", re.I), [], name_tags=["short_name", "alt_name", "official_name"],
                 near=(13.0418, 80.2341, 2500)),
]

_YEAR = re.compile(r"\b(1[5-9]\d\d|20\d\d)\b")


def start_year(tags: Tags) -> int | None:
    m = _YEAR.search(tags.get("start_date", ""))
    return int(m.group(1)) if m else None


def _match(tags: Tags, wanted: dict[str, str]) -> bool:
    return all(tags.get(k) == v for k, v in wanted.items())


def _near_ok(spec: LandmarkSpec, p: Point) -> bool:
    if spec.near is None:
        return True
    cx, cz = PROJECTION.to_local(spec.near[0], spec.near[1])
    return math.hypot(p[0] - cx, p[1] - cz) <= spec.near[2]


def _osm_feature(spec: LandmarkSpec, f: OsmFeatures) -> dict[str, Any] | None:
    enclosing = [a for a in f.areas if spec.within and spec.within.search(a.tags.get("name", ""))] if spec.within else []

    def accept(tags: Tags, at: Point) -> bool:
        if not any(_match(tags, w) for w in spec.tags) or not _near_ok(spec, at):
            return False
        for t in ["name", "name:en", *spec.name_tags]:
            if spec.names.search(tags.get(t, "")):
                return True
        return any(point_in_polygon(at[0], at[1], a.outline) for a in enclosing)

    polys: list[OsmPolygon] = [*f.buildings, *f.areas]
    for poly in polys:
        if poly.source != "way":
            continue
        at = area_centroid(poly.outline)
        if not accept(poly.tags, at):
            continue
        r = sum(math.hypot(p[0] - at[0], p[1] - at[1]) for p in poly.outline) / len(poly.outline)
        return {"x": at[0], "z": at[1], "radius": r, "opened": start_year(poly.tags), "source": f"OSM way {poly.id}"}
    for pt in f.points:
        if not accept(pt.tags, (pt.x, pt.z)):
            continue
        return {"x": pt.x, "z": pt.z, "radius": None, "opened": start_year(pt.tags), "source": f"OSM node {pt.id}"}
    return None


def ring_path(f: OsmFeatures, area: list[Point]) -> dict[str, float] | None:
    best: dict[str, float] | None = None
    for way in f.highways:
        if way.tags.get("highway") not in ("footway", "path", "pedestrian"):
            continue
        if way.points[0] != way.points[-1]:
            continue
        loop = way.points[:-1]
        if len(loop) < 8:
            continue
        c = area_centroid(loop)
        if not point_in_polygon(c[0], c[1], area):
            continue
        d = [math.hypot(p[0] - c[0], p[1] - c[1]) for p in loop]
        radius = sum(d) / len(d)
        if radius < 8 or radius > 80:
            continue
        roundness = (max(d) - min(d)) / radius
        if roundness > 0.3:
            continue
        if best is None or roundness < best["roundness"]:
            best = {"id": way.id, "x": c[0], "z": c[1], "radius": radius, "roundness": roundness}
    return best


def find_landmarks(f: OsmFeatures, inside: Any, specs: list[LandmarkSpec] = LANDMARK_SPECS) -> list[dict[str, Any]]:
    """`inside(point) -> bool` is the playable test (a rectangle for ring 0)."""
    found: list[dict[str, Any]] = []
    for spec in specs:
        at = _osm_feature(spec, f)
        radius = spec.radius
        estimated = list(spec.estimated)
        if at and at["radius"] is not None and radius is not None and spec.outline_is_footprint:
            radius = at["radius"]
            estimated = [e for e in estimated if e != "radius"]
        opened = at["opened"] if at and at["opened"] is not None else spec.opened
        if at and at["opened"] is not None:
            estimated = [e for e in estimated if e != "opened"]
        if not at and spec.derive == "ring-path" and spec.within:
            area = next((a for a in f.areas if spec.within.search(a.tags.get("name", ""))), None)
            ring = ring_path(f, area.outline) if area else None
            if ring and area:
                at = {"x": ring["x"], "z": ring["z"], "source": f"centre of the circular path OSM way {int(ring['id'])} in {area.tags.get('name')}"}
                estimated.append("position")
                if radius is not None:
                    radius = min(radius, max(3, ring["radius"] - 4))
        if not at or not inside((at["x"], at["z"])):
            continue
        item: dict[str, Any] = {"id": spec.id, "kind": spec.kind, "name": spec.name, "x": round2(at["x"]), "z": round2(at["z"])}
        if spec.height is not None:
            item["height"] = spec.height
        if spec.levels is not None:
            item["levels"] = spec.levels
        if radius is not None:
            item["radius"] = round2(radius)
        if opened is not None:
            item["opened"] = opened
        item["source"] = at["source"]
        item["estimated"] = estimated
        found.append(item)
    return found


def inside_landmark(p: Point, landmarks: list[dict[str, Any]], clearance: float = 0) -> bool:
    return any("radius" in lm and (p[0] - lm["x"]) ** 2 + (p[1] - lm["z"]) ** 2 < (lm["radius"] + clearance) ** 2 for lm in landmarks)
