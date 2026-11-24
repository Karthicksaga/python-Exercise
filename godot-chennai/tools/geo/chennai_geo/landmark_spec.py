"""Landmark specs: fill the OSM part of `assets/landmarks/<id>/spec.json` from the extract (G-181).

A spec's `osm.parts` names OSM objects ("way/1548155931"). `fill_from_osm` reads them from the
PBF the world builder reads and writes, for each part, its footprint in world metres (TD-2: +X
east, +Z south; wound so its shoelace area in (x, z) is positive, last point not repeated) and the tags that
matter; then the landmark's frame: `origin` (area centroid of the main part) and `yaw_deg`, the
direction of the main part's longer side (minimum rotated rectangle, 0..180, measured from +X
towards -Z, i.e. anticlockwise seen from above) with its `size`.

Everything else in a spec (height research, facts, references, kit parameters) is written by
hand and only checked here (`check`). OpenStreetMap is the only geometry source.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from .geometry import Point, area_centroid, signed_area
from .projection import PROJECTION

HERE = Path(__file__).resolve().parents[1]
GODOT = HERE.parents[1]
SPECS = GODOT / "assets" / "landmarks"
KEEP_TAGS = ("name", "name:en", "name:ta", "alt_name", "old_name", "building", "building:part", "building:levels",
             "height", "min_height", "roof:shape", "building:material", "building:colour", "amenity", "religion",
             "railway", "man_made", "natural", "water", "historic", "tourism", "wikidata", "wikipedia",
             "wikimedia_commons", "start_date", "layer")


def _ref(osm: str) -> tuple[str, int]:
    kind, _, num = osm.partition("/")
    if kind not in ("way", "node") or not num.isdigit():
        raise ValueError(f"unsupported OSM reference {osm!r} (way/N or node/N)")
    return kind, int(num)


def read_objects(pbf: Path, refs: list[str]) -> dict[str, dict[str, Any]]:
    """{"way/1": {"tags": {...}, "points": [(x, z), ...]}} for the wanted ways and nodes."""
    import osmium

    wanted = {_ref(r) for r in refs}
    out: dict[str, dict[str, Any]] = {}

    class Handler(osmium.SimpleHandler):  # type: ignore[misc]
        def node(self, n: Any) -> None:
            if ("node", n.id) in wanted:
                out[f"node/{n.id}"] = {"tags": {t.k: t.v for t in n.tags},
                                       "points": [PROJECTION.to_local(n.location.lat, n.location.lon)]}

        def way(self, w: Any) -> None:
            if ("way", w.id) in wanted:
                out[f"way/{w.id}"] = {"tags": {t.k: t.v for t in w.tags},
                                      "points": [PROJECTION.to_local(nd.lat, nd.lon) for nd in w.nodes]}

    Handler().apply_file(str(pbf), locations=True)
    return out


def footprint(points: list[Point]) -> list[Point]:
    """Closed way -> ring without the repeated point, positive shoelace area in (x, z)."""
    ring = list(points[:-1] if len(points) > 1 and points[0] == points[-1] else points)
    if len(ring) >= 3 and signed_area(ring) < 0:
        ring.reverse()
    return ring


def rect_corners(ring: list[Point]) -> list[Point]:
    """Corners of the minimum-area rectangle round a ring (positive shoelace area)."""
    from shapely.geometry import Polygon

    corners = [(round(x, 2), round(z, 2)) for x, z in list(Polygon(ring).minimum_rotated_rectangle.exterior.coords)[:4]]
    return footprint(corners)


def min_rect(ring: list[Point]) -> tuple[float, float, float]:
    """(yaw_deg of the longer side in 0..180, long, short) of the minimum-area rectangle."""
    rect = rect_corners(ring)
    e0 = (rect[1][0] - rect[0][0], rect[1][1] - rect[0][1])
    e1 = (rect[2][0] - rect[1][0], rect[2][1] - rect[1][1])
    l0, l1 = math.hypot(*e0), math.hypot(*e1)
    long_edge = e0 if l0 >= l1 else e1
    # Angle from +X towards -Z (north), so a yaw about +Y in Godot.
    yaw = math.degrees(math.atan2(-long_edge[1], long_edge[0])) % 180.0
    return round(yaw, 2), round(max(l0, l1), 2), round(min(l0, l1), 2)


def fill(spec: dict[str, Any], objects: dict[str, dict[str, Any]]) -> dict[str, Any]:
    osm = spec["osm"]
    for name, part in osm["parts"].items():
        obj = objects.get(part["osm"])
        if obj is None:
            raise KeyError(f"{spec['id']}: {part['osm']} ({name}) is not in the extract")
        pts = [(round(x, 2), round(z, 2)) for x, z in obj["points"]]
        part["tags"] = {k: obj["tags"][k] for k in KEEP_TAGS if k in obj["tags"]}
        if part["osm"].startswith("way/"):
            ring = footprint(pts)
            part["footprint"] = [[x, z] for x, z in ring]
            c = area_centroid(ring)
            part["centroid"] = [round(c[0], 2), round(c[1], 2)]
            part["area"] = round(abs(signed_area(ring)), 1)
            yaw, long_, short = min_rect(ring)
            part["rect"] = {"yaw_deg": yaw, "long": long_, "short": short, "corners": [[x, z] for x, z in rect_corners(ring)]}
        else:
            part["centroid"] = [pts[0][0], pts[0][1]]
    main = osm["parts"][osm["main"]]
    spec["origin"] = main["centroid"]
    spec["yaw_deg"] = main["rect"]["yaw_deg"] if "rect" in main else 0.0
    h = main["tags"].get("height")
    if h is not None:
        spec["height"]["osm_tag"] = float(h)
    return spec


def fill_from_osm(path: Path, pbf: Path, data_date: str = "") -> str:
    spec = json.loads(path.read_text())
    refs = [p["osm"] for p in spec["osm"]["parts"].values()]
    fill(spec, read_objects(pbf, refs))
    if data_date:
        spec["osm"]["data_date"] = data_date
    path.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n")
    return f"{spec['id']}: {len(refs)} OSM parts, origin {spec['origin']}, yaw {spec['yaw_deg']}"


def exclude_outlines(specs: Path = SPECS) -> list[list[Point]]:
    """Every spec's exclude outlines (world metres): the OSM footprint, or its minimum rectangle
    for a `model_rect` part. OSM buildings with their centroid inside are left out."""
    out: list[list[Point]] = []
    for path in sorted(specs.glob("*/spec.json")):
        spec = json.loads(path.read_text())
        for name in spec["osm"].get("exclude", []):
            part = spec["osm"]["parts"][name]
            ring = part["rect"]["corners"] if part.get("role") == "model_rect" else part.get("footprint")
            if ring:
                out.append([(float(x), float(z)) for x, z in ring])
    return out
