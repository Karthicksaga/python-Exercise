"""Rank landmark candidates inside the world from the OSM extract (G-180).

Reads the same Tamil Nadu PBF (or the clipped `world.osm.pbf`) the world builder reads; no
Overpass. A candidate is an OSM object that carries `wikidata` and/or `wikipedia`, or one of
the landmark kinds below. Objects describing the same place (a station node and its area, both
with the same `wikidata`) are merged; the polygon wins as the footprint.

Output (`write_candidates`): `candidates.json` (ranked; OSM id, name, name:ta, kind, footprint in
world metres, height/levels when tagged, wikidata QID, wikipedia title, score and why) and a
coverage report (`COVERAGE.md`: how many, how many with wikidata, by kind).

The score is a heuristic for choosing what to model next, not a measure of importance:
a Wikidata/Wikipedia link, the kind, the footprint size, a Tamil name and tagged heights.
"""
from __future__ import annotations

import json
import math
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .geometry import Point, area_centroid, point_in_polygon, signed_area
from .projection import PROJECTION
from .util import tag_number

BUILDING_KINDS = {"train_station", "temple", "church", "mosque", "stadium", "civic", "government", "university", "hospital", "cathedral", "chapel"}
# kind -> weight
KIND_WEIGHT: dict[str, float] = {
    "lighthouse": 22, "historic": 16, "museum": 16, "attraction": 14, "station": 14, "stadium": 14,
    "temple": 12, "church": 12, "mosque": 12, "place_of_worship": 8, "civic": 10, "government": 8,
    "university": 9, "tower": 6, "hospital": 4, "other": 0,
}


def kind_of(tags: dict[str, str]) -> str | None:
    """The landmark kind of an object, or None when it is not one of the listed kinds."""
    b = tags.get("building", "")
    mm = tags.get("man_made", "")
    if mm == "lighthouse":
        return "lighthouse"
    if tags.get("railway") == "station" or b == "train_station":
        return "station"
    if b in ("temple", "church", "mosque", "cathedral", "chapel"):
        return {"cathedral": "church", "chapel": "church"}.get(b, b)
    if tags.get("amenity") == "place_of_worship":
        rel = tags.get("religion", "")
        return {"hindu": "temple", "christian": "church", "muslim": "mosque"}.get(rel, "place_of_worship")
    if b == "stadium":
        return "stadium"
    if tags.get("tourism") == "museum":
        return "museum"
    if "historic" in tags:
        return "historic"
    if tags.get("tourism") == "attraction":
        return "attraction"
    if b in ("civic", "government"):
        return b
    if b == "university":
        return "university"
    if b == "hospital":
        return "hospital"
    if mm == "tower":
        return "tower"
    return None


# Linked objects that are not buildings to model: areas and places, and businesses (TD-18: no
# business names or brands on landmarks).
NOT_MODELS = ("place", "boundary", "highway", "waterway", "natural", "route", "brand", "shop")
NOT_MODEL_LANDUSE = {"residential", "industrial", "commercial", "retail", "military", "farmland", "railway"}
NOT_MODEL_TOURISM = {"hotel", "guest_house", "hostel", "motel"}


def is_candidate(tags: dict[str, str]) -> bool:
    if kind_of(tags) is not None:
        return "brand" not in tags
    if any(k in tags for k in NOT_MODELS) or tags.get("landuse") in NOT_MODEL_LANDUSE or tags.get("tourism") in NOT_MODEL_TOURISM:
        return False
    return "wikidata" in tags or "wikipedia" in tags


@dataclass
class Candidate:
    osm: str  # "node/1", "way/2", "relation/3"
    tags: dict[str, str]
    x: float
    z: float
    footprint: list[Point] | None = None
    also: list[str] = field(default_factory=list)

    @property
    def area(self) -> float:
        return abs(signed_area(self.footprint)) if self.footprint else 0.0

    def score(self) -> tuple[float, list[str]]:
        t = self.tags
        why: list[str] = []
        s = 0.0
        if "wikidata" in t:
            s += 40
            why.append("wikidata")
        if "wikipedia" in t:
            s += 30
            why.append("wikipedia")
        if "wikimedia_commons" in t:
            s += 6
            why.append("commons")
        k = kind_of(t) or "other"
        s += KIND_WEIGHT.get(k, 0)
        why.append(f"kind:{k}")
        if self.area > 100:
            s += min(20.0, 4 * math.log2(self.area / 100))
            why.append(f"area:{round(self.area)}")
        if "name:ta" in t:
            s += 5
            why.append("name:ta")
        if "height" in t or "building:levels" in t:
            s += 4
            why.append("height/levels")
        if "name" not in t and "name:en" not in t:
            s -= 30
            why.append("unnamed")
        return round(s, 1), why

    def as_dict(self) -> dict[str, Any]:
        t = self.tags
        s, why = self.score()
        h = tag_number(t.get("height"))
        lv = tag_number(t.get("building:levels"))
        wp = t.get("wikipedia", "")
        return {
            "osm": self.osm,
            "also": sorted(self.also),
            "name": t.get("name:en") or t.get("name", ""),
            "name_ta": t.get("name:ta", ""),
            "kind": kind_of(t) or "other",
            "x": round(self.x, 1),
            "z": round(self.z, 1),
            "area": round(self.area),
            "footprint": [[round(p[0], 1), round(p[1], 1)] for p in self.footprint] if self.footprint else None,
            "height": h if math.isfinite(h) and h > 0 else None,
            "levels": int(lv) if math.isfinite(lv) and lv > 0 else None,
            "wikidata": t.get("wikidata"),
            "wikipedia": wp or None,
            "score": s,
            "why": why,
        }


def _absorb(into: Candidate, other: Candidate) -> None:
    into.also.append(other.osm)
    into.also.extend(other.also)
    for k, v in other.tags.items():
        into.tags.setdefault(k, v)


def merge_points_into_polygons(cands: list[Candidate]) -> list[Candidate]:
    """A point (a station or temple node) inside a polygon of the same kind is the same place:
    the smallest such polygon takes the point's tags it lacks (its wikidata, Tamil name)."""
    polys = [c for c in cands if c.footprint]
    boxes = [(min(p[0] for p in c.footprint or []), max(p[0] for p in c.footprint or []),
              min(p[1] for p in c.footprint or []), max(p[1] for p in c.footprint or [])) for c in polys]
    out: list[Candidate] = []
    for c in cands:
        if c.footprint:
            out.append(c)
            continue
        k = kind_of(c.tags)
        hosts = [p for p, b in zip(polys, boxes) if b[0] <= c.x <= b[1] and b[2] <= c.z <= b[3]
                 and kind_of(p.tags) == k and k is not None and point_in_polygon(c.x, c.z, p.footprint or [])
                 and not (p.tags.get("wikidata") and c.tags.get("wikidata") and p.tags["wikidata"] != c.tags["wikidata"])]
        if hosts:
            _absorb(min(hosts, key=lambda p: p.area), c)
        else:
            out.append(c)
    return out


def merge(cands: list[Candidate]) -> list[Candidate]:
    """One candidate per wikidata item (the largest polygon wins, the others listed in `also`),
    after points have joined the polygons that contain them."""
    by_q: dict[str, list[Candidate]] = {}
    out: list[Candidate] = []
    for c in merge_points_into_polygons(cands):
        q = c.tags.get("wikidata")
        if q:
            by_q.setdefault(q, []).append(c)
        else:
            out.append(c)
    for group in by_q.values():
        group.sort(key=lambda c: (-c.area, c.osm))
        best = group[0]
        for other in group[1:]:
            _absorb(best, other)
        out.append(best)
    return out


def read_candidates(path: Path, inside: Callable[[Point], bool]) -> list[Candidate]:
    import osmium  # the geo venv has pyosmium; imported here so the rest stays importable

    found: list[Candidate] = []

    class Handler(osmium.SimpleHandler):  # type: ignore[misc]
        def node(self, n: Any) -> None:
            tags = {t.k: t.v for t in n.tags}
            if not tags or not is_candidate(tags) or not n.location.valid():
                return
            x, z = PROJECTION.to_local(n.location.lat, n.location.lon)
            if inside((x, z)):
                found.append(Candidate(f"node/{n.id}", tags, x, z))

        def area(self, a: Any) -> None:
            tags = {t.k: t.v for t in a.tags}
            if not tags or not is_candidate(tags):
                return
            rings = []
            try:
                for outer in a.outer_rings():
                    rings.append([PROJECTION.to_local(p.lat, p.lon) for p in outer])
            except Exception:  # broken geometry: skip the object
                return
            if not rings:
                return
            ring = max(rings, key=lambda r: abs(signed_area(r)))
            if ring[0] == ring[-1]:
                ring = ring[:-1]
            if len(ring) < 3:
                return
            c = area_centroid(ring)
            if not inside(c):
                return
            kind = "way" if a.from_way() else "relation"
            found.append(Candidate(f"{kind}/{a.orig_id()}", tags, c[0], c[1], ring))

    Handler().apply_file(str(path), locations=True)
    return found


def rank(cands: list[Candidate]) -> list[dict[str, Any]]:
    rows = [c.as_dict() for c in merge(cands)]
    rows.sort(key=lambda r: (-r["score"], r["osm"]))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


def coverage(rows: list[dict[str, Any]]) -> dict[str, Any]:
    kinds = Counter(r["kind"] for r in rows)
    kinds_q = Counter(r["kind"] for r in rows if r["wikidata"])
    return {
        "candidates": len(rows),
        "with_wikidata": sum(1 for r in rows if r["wikidata"]),
        "with_wikipedia": sum(1 for r in rows if r["wikipedia"]),
        "with_both": sum(1 for r in rows if r["wikidata"] and r["wikipedia"]),
        "with_footprint": sum(1 for r in rows if r["footprint"]),
        "with_name_ta": sum(1 for r in rows if r["name_ta"]),
        "with_height_or_levels": sum(1 for r in rows if r["height"] or r["levels"]),
        "by_kind": {k: {"all": n, "wikidata": kinds_q.get(k, 0)} for k, n in sorted(kinds.items(), key=lambda kv: (-kv[1], kv[0]))},
    }


def coverage_markdown(cov: dict[str, Any], rows: list[dict[str, Any]], source: str, top: int = 40) -> str:
    lines = [
        "# Landmark candidates: coverage",
        "",
        f"Source: {source} (© OpenStreetMap contributors, ODbL). Built by `python -m chennai_geo.cli landmarks-rank`.",
        "Generated file; the score is a heuristic for choosing what to model next (G-180).",
        "",
        "| Measure | Count |", "|---|---|",
    ]
    for k in ("candidates", "with_wikidata", "with_wikipedia", "with_both", "with_footprint", "with_name_ta", "with_height_or_levels"):
        lines.append(f"| {k.replace('_', ' ')} | {cov[k]} |")
    lines += ["", "| Kind | All | With wikidata |", "|---|---|---|"]
    for k, v in cov["by_kind"].items():
        lines.append(f"| {k} | {v['all']} | {v['wikidata']} |")
    lines += ["", f"## Top {top}", "", "| Rank | OSM | Name | Tamil | Kind | Area m² | Wikidata | Score |", "|---|---|---|---|---|---|---|---|"]
    for r in rows[:top]:
        lines.append(f"| {r['rank']} | {r['osm']} | {r['name']} | {r['name_ta']} | {r['kind']} | {r['area']} | {r['wikidata'] or ''} | {r['score']} |")
    return "\n".join(lines) + "\n"


def write_candidates(rows: list[dict[str, Any]], out_dir: Path, source: str, keep_footprints: int = 400) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    cov = coverage(rows)
    slim = [dict(r, footprint=r["footprint"] if r["rank"] <= keep_footprints else None) for r in rows]
    (out_dir / "candidates.json").write_text(json.dumps({"source": source, "coverage": cov, "candidates": slim}, ensure_ascii=False, indent=0) + "\n")
    (out_dir / "COVERAGE.md").write_text(coverage_markdown(cov, rows, source))
    return cov
