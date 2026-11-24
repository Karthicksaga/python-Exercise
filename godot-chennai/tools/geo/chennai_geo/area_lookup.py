"""Find named places (landmarks, districts, bridges...) in an OSM PBF by name search (G-200).

One pass over the PBF (the world extract `data/raw/world.osm.pbf`, or the Tamil Nadu extract);
every node, way and multipolygon whose name tags match a query regex and whose tags satisfy the
query's tag filter becomes a `Match` with centre, bounding box, footprint (ways and relations),
area, and the few tags the atlas needs. No Overpass: the same PBF the geo tools use.

    python -m chennai_geo.area_lookup --pbf data/raw/world.osm.pbf --queries q.json --out found.json

A query is {"id", "name" (regex, case-insensitive), "tags" (optional list of {key: value}, any of
which must match; value "*" = key present), "near" (optional [lat, lng, metres]), "limit"}.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import osmium

from .projection import PROJECTION

NAME_KEYS = ("name", "name:en", "alt_name", "old_name", "official_name", "short_name", "int_name")
KEEP_TAGS = (
    "name", "name:en", "name:ta", "alt_name", "old_name", "wikidata", "wikipedia", "building", "building:levels", "height",
    "building:colour", "building:material", "roof:shape", "roof:colour", "start_date", "heritage", "historic", "amenity",
    "religion", "denomination", "tourism", "railway", "public_transport", "bridge", "man_made", "leisure", "natural",
    "highway", "shop", "landuse", "place", "operator", "architect", "building:architecture", "website",
)
EARTH = 6_371_008.8


@dataclass
class Query:
    id: str
    name: str
    tags: list[dict[str, str]] = field(default_factory=list)
    near: tuple[float, float, float] | None = None
    limit: int = 5
    _rx: re.Pattern[str] | None = field(default=None, repr=False)

    def rx(self) -> re.Pattern[str]:
        if self._rx is None:
            self._rx = re.compile(self.name, re.I)
        return self._rx

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "Query":
        near = d.get("near")
        return Query(d["id"], d["name"], d.get("tags", []), tuple(near) if near else None, int(d.get("limit", 5)))


@dataclass
class Match:
    osm_type: str  # node | way | relation
    osm_id: int
    lat: float
    lon: float
    x: float
    z: float
    bbox: tuple[float, float, float, float]  # south, west, north, east
    area_m2: float
    length_m: float
    footprint: list[tuple[float, float]]  # (lat, lon), closed ring without repeat, simplified
    tags: dict[str, str]
    score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "osm": f"{self.osm_type}/{self.osm_id}", "osm_type": self.osm_type, "osm_id": self.osm_id,
            "lat": round(self.lat, 6), "lon": round(self.lon, 6), "x": round(self.x, 1), "z": round(self.z, 1),
            "bbox": [round(v, 6) for v in self.bbox], "area_m2": round(self.area_m2, 1), "length_m": round(self.length_m, 1),
            "footprint": [[round(a, 6), round(b, 6)] for a, b in self.footprint], "tags": self.tags, "score": round(self.score, 2),
        }


def tags_match(tags: dict[str, str], wanted: list[dict[str, str]]) -> bool:
    if not wanted:
        return True
    for w in wanted:
        if all((k in tags) if v == "*" else tags.get(k) == v for k, v in w.items()):
            return True
    return False


def name_matches(tags: dict[str, str], rx: re.Pattern[str]) -> bool:
    return any(rx.search(tags.get(k, "")) for k in NAME_KEYS)


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH * math.asin(math.sqrt(a))


def ring_area_m2(ring: list[tuple[float, float]]) -> float:
    """Shoelace area of a (lat, lon) ring in square metres (local equirectangular)."""
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = math.radians(1) * EARTH * math.cos(math.radians(lat0))
    ky = math.radians(1) * EARTH
    pts = [(p[1] * kx, p[0] * ky) for p in ring]
    s = 0.0
    for i, (ax, ay) in enumerate(pts):
        bx, by = pts[(i + 1) % len(pts)]
        s += ax * by - bx * ay
    return abs(s) / 2


def line_length_m(pts: list[tuple[float, float]]) -> float:
    return sum(haversine(a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:]))


def simplify(ring: list[tuple[float, float]], limit: int = 40) -> list[tuple[float, float]]:
    if len(ring) <= limit:
        return ring
    step = len(ring) / limit
    return [ring[int(i * step)] for i in range(limit)]


def _centroid(pts: list[tuple[float, float]]) -> tuple[float, float]:
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def _make(osm_type: str, osm_id: int, pts: list[tuple[float, float]], closed: bool, tags: dict[str, str]) -> Match:
    closed_ring = pts[:-1] if closed and len(pts) > 1 and pts[0] == pts[-1] else pts
    lat, lon = _centroid(closed_ring)
    south, north = min(p[0] for p in pts), max(p[0] for p in pts)
    west, east = min(p[1] for p in pts), max(p[1] for p in pts)
    ring = pts[:-1] if closed and len(pts) > 1 and pts[0] == pts[-1] else pts
    area = ring_area_m2(ring) if closed else 0.0
    x, z = PROJECTION.to_local(lat, lon)
    kept = {k: tags[k] for k in KEEP_TAGS if k in tags}
    return Match(osm_type, osm_id, lat, lon, x, z, (south, west, north, east), area, 0.0 if closed else line_length_m(pts),
                 simplify(ring) if closed else [], kept)


def score(m: Match, q: Query) -> float:
    """Higher is better: exact name, wikidata, Tamil name, size, closeness to `near`."""
    rx = q.rx()
    s = 0.0
    nm = m.tags.get("name:en") or m.tags.get("name", "")
    if rx.fullmatch(nm.strip()):
        s += 3
    elif name_matches(m.tags, rx):
        s += 1
    if "wikidata" in m.tags:
        s += 2
    if "name:ta" in m.tags:
        s += 0.5
    if "heritage" in m.tags or "start_date" in m.tags:
        s += 0.5
    s += min(math.log10(m.area_m2 + 1), 5) * 0.3
    if m.osm_type == "node":
        s -= 0.3
    if q.near:
        d = haversine(m.lat, m.lon, q.near[0], q.near[1])
        s += 2 * max(0.0, 1 - d / max(q.near[2], 1))
    return s


def search(pbf: str | Path, queries: list[Query], *, with_areas: bool = True) -> dict[str, list[Match]]:
    """Scan the PBF once and return the best matches per query id (never raises for no match)."""
    found: dict[str, dict[tuple[str, int], Match]] = {q.id: {} for q in queries}
    fp = osmium.FileProcessor(str(pbf)).with_locations()
    if with_areas:
        fp = fp.with_areas()

    def wanted(tags: dict[str, str]) -> list[Query]:
        return [q for q in queries if name_matches(tags, q.rx()) and tags_match(tags, q.tags)]

    for o in fp:
        if not o.tags:
            continue
        if isinstance(o, osmium.osm.Node):
            if not any(k in o.tags for k in NAME_KEYS) or not o.location.valid():
                continue
            tags = {t.k: t.v for t in o.tags}
            for q in wanted(tags):
                found[q.id][("node", o.id)] = _make("node", o.id, [(o.location.lat, o.location.lon)], False, tags)
        elif isinstance(o, osmium.osm.Way):
            if not any(k in o.tags for k in NAME_KEYS):
                continue
            tags = {t.k: t.v for t in o.tags}
            qs = wanted(tags)
            if not qs:
                continue
            try:
                pts = [(n.lat, n.lon) for n in o.nodes if n.location.valid()]
            except osmium.InvalidLocationError:
                continue
            if len(pts) < 2:
                continue
            closed = pts[0] == pts[-1] and len(pts) >= 4
            for q in qs:
                found[q.id][("way", o.id)] = _make("way", o.id, pts, closed, tags)
        elif with_areas and isinstance(o, osmium.osm.Area) and not o.from_way():
            if not any(k in o.tags for k in NAME_KEYS):
                continue
            tags = {t.k: t.v for t in o.tags}
            qs = wanted(tags)
            if not qs:
                continue
            best: list[tuple[float, float]] = []
            best_area = -1.0
            for ring in o.outer_rings():
                pts = [(n.lat, n.lon) for n in ring]
                a = ring_area_m2(pts[:-1])
                if a > best_area:
                    best, best_area = pts, a
            if best:
                for q in qs:
                    found[q.id][("relation", o.orig_id())] = _make("relation", o.orig_id(), best, True, tags)
    out: dict[str, list[Match]] = {}
    for q in queries:
        ms = list(found[q.id].values())
        for m in ms:
            m.score = score(m, q)
        ms.sort(key=lambda m: -m.score)
        out[q.id] = ms[: q.limit]
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--queries", required=True, help="JSON list of queries")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-areas", action="store_true", help="skip multipolygon relations (faster)")
    a = ap.parse_args(argv)
    qs = [Query.from_dict(d) for d in json.loads(Path(a.queries).read_text(encoding="utf-8"))]
    res = search(a.pbf, qs, with_areas=not a.no_areas)
    Path(a.out).write_text(json.dumps({k: [m.to_dict() for m in v] for k, v in res.items()}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{sum(1 for v in res.values() if v)}/{len(qs)} queries found something")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
