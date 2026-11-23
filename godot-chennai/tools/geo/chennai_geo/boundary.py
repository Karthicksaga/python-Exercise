"""The world boundary: the Chengalpattu-Pulicat box, cut on land by the Tamil Nadu border, and
the sea east of the coast (the state polygon in OSM stops at the coastline).

The boundary is derived once from the PBF (`cli.py boundary`) and committed as GeoJSON
(`godot-chennai/data/boundary/world-boundary.geojson`), so builds and tests don't need the PBF.
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import LineString, MultiPolygon, Polygon, box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

# lng/lat box of the whole world (MIGRATION_PROMPT §9). North is capped well past the border;
# the Tamil Nadu polygon decides the real northern edge.
WORLD_BOX = (79.95, 12.68, 80.40, 13.60)  # west, south, east, north


def world_boundary(state: BaseGeometry, world_box: tuple[float, float, float, float] = WORLD_BOX) -> Polygon:
    """Box ∩ state, plus the sea that lies east of the state's coast and south of where the
    state border meets the coast (north of it the water belongs to Andhra Pradesh)."""
    w, s, e, n = world_box
    b = box(w, s, e, n)
    land = state.intersection(b)
    if land.is_empty:
        raise ValueError("The state polygon does not cover the world box.")
    border_lat = land.bounds[3] - 0.0006
    rest = b.difference(state).intersection(box(w, s, e, border_lat))
    parts = list(rest.geoms) if isinstance(rest, MultiPolygon) else [rest]
    east_edge = LineString([(e, s), (e, n)])
    sea = [p for p in parts if isinstance(p, Polygon) and p.intersects(east_edge)]
    out = unary_union([land, *sea]).buffer(0)
    if isinstance(out, MultiPolygon):  # stray islands of the state polygon: keep the main body
        out = max(out.geoms, key=lambda g: g.area)
    return Polygon(out.exterior)


def save_boundary(poly: Polygon, path: Path, source: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    simple = poly.simplify(0.00002, preserve_topology=True)  # about 2 m
    fc = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {"name": "Chengalpattu-Pulicat world", "source": source}, "geometry": mapping(simple)}],
    }
    path.write_text(json.dumps(fc, separators=(",", ":")) + "\n")


def load_boundary(path: Path) -> Polygon:
    fc = json.loads(path.read_text())
    g = shape(fc["features"][0]["geometry"])
    assert isinstance(g, Polygon)
    return g
