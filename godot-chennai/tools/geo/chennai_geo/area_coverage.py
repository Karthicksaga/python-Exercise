"""How much the map says about each area's buildings (G-200 atlas coverage table).

Two sources, both numbers, nothing invented:

* the built world (`world/`, format 2): buildings, levels mapped, height tagged, roof shape
  tagged, use known, and a histogram of the floors the game derived (mostly estimated);
* the OSM extract (`data/raw/world.osm.pbf`): tag counts the world format does not keep
  (`building:colour`, `building:material`, `roof:colour`, `roof:material`) next to levels,
  height and roof shape, so the two can be compared.

A building belongs to the area whose boundary contains its centroid with the smallest
normalised distance (distance / radius, or / half width for a corridor), so it is counted once.

    python -m chennai_geo.area_coverage --areas data/areas/areas.json --world world \
        --pbf data/raw/world.osm.pbf --out data/areas/coverage.json
"""
from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

import osmium

from .geometry import Point, area_centroid
from .projection import PROJECTION

Boundary = dict[str, Any]
FLOOR_BINS = [("1", 1, 1), ("2", 2, 2), ("3", 3, 3), ("4-5", 4, 5), ("6-9", 6, 9), ("10+", 10, 10_000)]
PBF_KEYS = ("building:levels", "height", "roof:shape", "building:colour", "building:material", "roof:colour", "roof:material", "name", "start_date")


def _seg_dist(p: Point, a: Point, b: Point) -> float:
    dx, dz = b[0] - a[0], b[1] - a[1]
    n = dx * dx + dz * dz
    t = 0.0 if n == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / n))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))


def normalised_distance(boundary: Boundary, p: Point) -> float:
    """< = 1 means inside. Circle: d / radius. Corridor: distance to the spine / half width."""
    if boundary["type"] == "circle":
        c = boundary["centre_xz"]
        return math.hypot(p[0] - c[0], p[1] - c[1]) / boundary["radius_m"]
    spine = boundary["spine_xz"]
    d = min(_seg_dist(p, spine[i], spine[i + 1]) for i in range(len(spine) - 1))
    return d / boundary["half_width_m"]


def assign(areas: list[dict[str, Any]], p: Point) -> str | None:
    best: tuple[float, str] | None = None
    for a in areas:
        n = normalised_distance(a["boundary"], p)
        if n <= 1 and (best is None or n < best[0]):
            best = (n, a["id"])
    return best[1] if best else None


def floor_bin(floors: int) -> str:
    for label, lo, hi in FLOOR_BINS:
        if lo <= floors <= hi:
            return label
    return "1"


def empty_world_row() -> dict[str, Any]:
    return {"buildings": 0, "levels_mapped": 0, "height_tagged": 0, "roof_shape_tagged": 0, "use_known": 0, "floors_hist": {b[0]: 0 for b in FLOOR_BINS}}


def tally_world_building(row: dict[str, Any], b: Any) -> None:
    row["buildings"] += 1
    row["levels_mapped"] += 1 if b.levels_mapped else 0
    row["height_tagged"] += 1 if b.height_from == "height" else 0
    row["roof_shape_tagged"] += 1 if b.roof_shape != "unknown" else 0
    row["use_known"] += 1 if b.use != "unknown" else 0
    row["floors_hist"][floor_bin(max(1, b.floors))] += 1


def world_coverage(world_root: Path, areas: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    from .writer import read_world_v2

    rows = {a["id"]: empty_world_row() for a in areas}
    rows["_outside"] = empty_world_row()
    w = read_world_v2(world_root)
    for t in w["tiles"]:
        for c in t["chunks"]:
            for b in c.buildings:
                aid = assign(areas, area_centroid(b.outline)) or "_outside"
                tally_world_building(rows[aid], b)
    return rows


def empty_pbf_row() -> dict[str, Any]:
    return {"buildings": 0, **{k: 0 for k in PBF_KEYS}, "building_values": Counter(), "colour_values": Counter(), "material_values": Counter(), "roof_material_values": Counter()}


def tally_pbf_tags(row: dict[str, Any], tags: dict[str, str]) -> None:
    row["buildings"] += 1
    for k in PBF_KEYS:
        if k in tags:
            row[k] += 1
    row["building_values"][tags.get("building", "yes")] += 1
    if "building:colour" in tags:
        row["colour_values"][tags["building:colour"].lower()] += 1
    if "building:material" in tags:
        row["material_values"][tags["building:material"].lower()] += 1
    if "roof:material" in tags:
        row["roof_material_values"][tags["roof:material"].lower()] += 1


def pbf_coverage(pbf: Path, areas: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    rows = {a["id"]: empty_pbf_row() for a in areas}
    rows["_outside"] = empty_pbf_row()
    for o in osmium.FileProcessor(str(pbf)).with_locations().with_areas():
        if not isinstance(o, osmium.osm.Area) or "building" not in o.tags:
            continue
        tags = {t.k: t.v for t in o.tags}
        if tags["building"] == "no":
            continue
        try:
            ring = max(o.outer_rings(), key=lambda r: len(r))
            pts = [PROJECTION.to_local(n.lat, n.lon) for n in ring]
        except (osmium.InvalidLocationError, ValueError):
            continue
        if len(pts) < 4:
            continue
        aid = assign(areas, area_centroid(pts[:-1])) or "_outside"
        tally_pbf_tags(rows[aid], tags)
    return rows


def _plain(row: dict[str, Any], top: int = 6) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in row.items():
        out[k] = dict(v.most_common(top)) if isinstance(v, Counter) else v
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--areas", required=True)
    ap.add_argument("--world", required=True, help="the world/ folder (format 2)")
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    areas = json.loads(Path(a.areas).read_text(encoding="utf-8"))["areas"]
    world = world_coverage(Path(a.world), areas)
    pbf = {k: _plain(v) for k, v in pbf_coverage(Path(a.pbf), areas).items()}
    meta = json.loads((Path(a.world) / "world.json").read_text())
    out = {
        "format": 1, "world_data_date": meta["dataDate"], "licence": "ODbL 1.0, © OpenStreetMap contributors",
        "note": "world = buildings kept in the built world (slivers dropped, multipolygons split); pbf = every building tagged way/relation in the extract. Colour and material tags exist only in the extract.",
        "areas": {k: {"world": world[k], "pbf": pbf[k]} for k in world},
    }
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tot = sum(r["buildings"] for r in world.values())
    print(f"{tot} world buildings counted over {len(areas)} areas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
