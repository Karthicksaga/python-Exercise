#!/usr/bin/env python3
"""The railway file for the Godot game, from the Three.js game's OSM railway extract (G-320).

    python3 godot-chennai/tools/rail/build_rail.py            # writes world/rail/rail.json and world/rail/RAIL.md
    python3 godot-chennai/tools/rail/build_rail.py --check    # exit 1 if the committed file is stale
    python3 godot-chennai/tools/rail/build_rail.py --threejs  # rebuild the Three.js file (old bounds) to stdout

This is a line-by-line port of `chennai-open-world/packages/rail/src/build.ts` (and the line
specs of `scripts/build-rail.ts`), so the Three.js game's railway is reused, not derived again:
`--threejs` rebuilds `apps/game/public/world/rail.json` from the same extract with the same
options, and the tests (`test_build_rail.py`) check it matches the committed file value for value.

The Godot world is bigger than the Three.js box, so the Godot file differs in three ways,
each additive (the Three.js reader still reads it):

- **Bounds:** the extract's own box (`scripts/fetch-rail.mjs`, minus 200 m) instead of the old
  city box, so lines run to where the data ends rather than stopping mid-city.
- **More lines from the same extract:** every passenger route relation it covers with track and
  stops on the map: Chennai MRTS both ways (on its viaduct, `heights`), the suburban lines from
  Chennai Central/Beach to Arakkonam and to Sullurpeta, and the express services out of Chennai
  Central (Coromandel, Charminar, Shatabdi, Rajdhani, Saptagiri). Nothing is invented: a line
  exists here only if its OSM route relation is in the extract.
- **Level crossings** (`railway=level_crossing` nodes on the tracks drawn), and per line
  `system`, `train` and (MRTS) `heights`.

Real (OSM): track centre lines, stations and names, the ways each service follows, viaduct and
bridge tags, level crossings. Estimated (invented here, as in build.ts): platform length, side,
width and height, headways and offsets, the viaduct's height, the trains' motion. Tamil names
written here for stations OSM has none for are transliterations that **need native review**.

Standard library only. © OpenStreetMap contributors (ODbL 1.0).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

HERE = Path(__file__).resolve().parent
GODOT = HERE.parent.parent  # godot-chennai/
REPO = GODOT.parent
EXTRACT = REPO / "chennai-open-world" / "assets" / "osm" / "rail" / "chennai-rail.osm.json"
THREEJS_RAIL = REPO / "chennai-open-world" / "apps" / "game" / "public" / "world" / "rail.json"
THREEJS_INDEX = GODOT / "assets" / "world" / "index.json"
TARGET = GODOT / "world" / "rail" / "rail.json"
REPORT = GODOT / "world" / "rail" / "RAIL.md"

# packages/map-data: ANNA_NAGAR_ORIGIN and GeoProjection (equirectangular, cos lat at the origin).
ORIGIN = (13.085, 80.2101)
EARTH_RADIUS = 6_371_008.8
DEG = math.pi / 180

# packages/rail/src/network.ts
PLATFORM_EDGE = 1.75
PLATFORM_WIDTH = 4
# scripts/fetch-rail.mjs: the extract's box (south, west, north, east).
FETCH_BOX = (12.975, 80.19, 13.10, 80.295)
# The Godot file's bounds are the extract's box shrunk by this much (metres): lines end inside the data.
BOX_INSET = 200.0
# Rail top on the MRTS viaduct above the ground, metres (estimated; OSM maps `bridge=viaduct`, not heights).
VIADUCT_HEIGHT = 9.0
# Platform length in the game (packages/rail network.ts PLATFORM_LENGTH).
PLATFORM_LENGTH_GODOT = 110.0
# Viaduct ramps (estimated): 1 in 40.
VIADUCT_GRADE = 1.0 / 40.0


Point = tuple[float, float]  # (x, z)


def js_round(v: float) -> float:
    """`Math.round(v * 10) / 10` (JavaScript rounds halves up, Python's round() to even)."""
    return math.floor(v * 10 + 0.5) / 10


def to_local(lat: float, lng: float) -> Point:
    cos_lat = math.cos(ORIGIN[0] * DEG)
    return ((lng - ORIGIN[1]) * DEG * EARTH_RADIUS * cos_lat, -(lat - ORIGIN[0]) * DEG * EARTH_RADIUS)


# --- packages/rail/src/path.ts -------------------------------------------------------------------


def yaw_of(dx: float, dz: float) -> float:
    return math.atan2(-dx, -dz)


class RailPath:
    def __init__(self, points: list[Point]) -> None:
        if len(points) < 2:
            raise ValueError("A rail path needs at least two points.")
        self.points = points
        self.lengths = [0.0]
        for i in range(1, len(points)):
            a, b = points[i - 1], points[i]
            self.lengths.append(self.lengths[i - 1] + math.hypot(b[0] - a[0], b[1] - a[1]))

    @staticmethod
    def from_flat(flat: list[float]) -> "RailPath":
        return RailPath([(flat[i], flat[i + 1]) for i in range(0, len(flat) - 1, 2)])

    @property
    def length(self) -> float:
        return self.lengths[-1]

    def _segment(self, s: float) -> int:
        lo, hi = 0, len(self.lengths) - 2
        while lo < hi:
            mid = (lo + hi + 1) >> 1
            if self.lengths[mid] <= s:
                lo = mid
            else:
                hi = mid - 1
        return lo

    def at(self, s: float) -> tuple[float, float, float, float]:
        """(x, z, yaw, s) at distance s, clamped."""
        c = max(0.0, min(self.length, s))
        i = self._segment(c)
        a, b = self.points[i], self.points[i + 1]
        span = self.lengths[i + 1] - self.lengths[i]
        t = (c - self.lengths[i]) / span if span > 0 else 0.0
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, yaw_of(b[0] - a[0], b[1] - a[1]), c)

    def beside(self, s: float, lateral: float) -> Point:
        x, z, yaw, _ = self.at(s)
        return (x - math.cos(yaw) * lateral, z + math.sin(yaw) * lateral)

    def project(self, p: Point) -> tuple[float, float, float]:
        """(s, lateral, distance) of the nearest point."""
        best = (0.0, 0.0, math.inf)
        for i in range(len(self.points) - 1):
            a, b = self.points[i], self.points[i + 1]
            dx, dz = b[0] - a[0], b[1] - a[1]
            span2 = dx * dx + dz * dz
            t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / span2)) if span2 > 0 else 0.0
            fx, fz = a[0] + dx * t, a[1] + dz * t
            distance = math.hypot(p[0] - fx, p[1] - fz)
            if distance < best[2]:
                span = math.sqrt(span2) or 1.0
                lateral = ((p[0] - fx) * dz + (p[1] - fz) * -dx) / span
                best = (self.lengths[i] + math.sqrt(span2) * t, lateral, distance)
        return best


# --- packages/rail/src/build.ts ------------------------------------------------------------------


@dataclass(frozen=True)
class Bounds:
    min_x: float
    max_x: float
    min_z: float
    max_z: float


@dataclass(frozen=True)
class LineSpec:
    id: str
    relation: int
    name: str
    from_name: str
    to_name: str
    headway_minutes: float
    offset_minutes: float
    # Godot additions: which system and train type run it (estimated rakes, G-322).
    system: str = "suburban"
    train: str = "emu"


def inside(p: Point, b: Bounds, margin: float) -> bool:
    return b.min_x - margin <= p[0] <= b.max_x + margin and b.min_z - margin <= p[1] <= b.max_z + margin


def chain_ways(ways: list[list[Point]]) -> list[Point]:
    def same(a: Point, b: Point) -> bool:
        return math.hypot(a[0] - b[0], a[1] - b[1]) < 1

    def gap(a: Point, b: Point) -> float:
        return math.hypot(a[0] - b[0], a[1] - b[1])

    line: list[Point] = []
    for way in ways:
        if len(way) < 2:
            continue
        if not line:
            line = list(way)
            continue
        head, tail = line[0], line[-1]
        first, last = way[0], way[-1]
        if line and not same(tail, first) and not same(tail, last) and (same(head, first) or same(head, last)):
            line.reverse()
        end = line[-1]
        forward = gap(end, first) <= gap(end, last)
        nxt = list(way) if forward else list(reversed(way))
        line.extend(nxt[1:] if same(end, nxt[0]) else nxt)
    return line


def clip_line(points: list[Point], bounds: Bounds, margin: float) -> tuple[list[Point], bool, bool]:
    box = Bounds(bounds.min_x - margin, bounds.max_x + margin, bounds.min_z - margin, bounds.max_z + margin)
    runs: list[dict[str, Any]] = []
    run: Optional[dict[str, Any]] = None
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        dx, dz = b[0] - a[0], b[1] - a[1]
        t0, t1 = 0.0, 1.0
        edges = [(-dx, a[0] - box.min_x), (dx, box.max_x - a[0]), (-dz, a[1] - box.min_z), (dz, box.max_z - a[1])]
        visible = True
        for p, q in edges:
            if p == 0:
                if q < 0:
                    visible = False
                continue
            r = q / p
            if p < 0:
                t0 = max(t0, r)
            else:
                t1 = min(t1, r)
        if not visible or t0 > t1 or (t1 - t0) * math.hypot(dx, dz) < 1e-6:
            run = None
            continue
        frm = (a[0] + dx * t0, a[1] + dz * t0)
        to = (a[0] + dx * t1, a[1] + dz * t1)
        length = math.hypot(to[0] - frm[0], to[1] - frm[1])
        if run is None or t0 > 0:
            run = {"points": [frm], "startBeyond": t0 > 0 or i > 0, "endBeyond": False, "length": 0.0}
            runs.append(run)
        run["points"].append(to)
        run["length"] += length
        run["endBeyond"] = t1 < 1 or i + 2 < len(points)
        if t1 < 1:
            run = None
    best: Optional[dict[str, Any]] = None
    for r in runs:
        if best is None or r["length"] > best["length"]:
            best = r
    if best is None:
        return [], False, False
    return best["points"], best["startBeyond"], best["endBeyond"]


def distance_to_polyline(p: Point, line: list[Point]) -> float:
    best = math.inf
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        dx, dz = b[0] - a[0], b[1] - a[1]
        span2 = dx * dx + dz * dz
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / span2)) if span2 > 0 else 0.0
        best = min(best, math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t))
    return best


def platform_side(path: RailPath, s: float, tracks: list[list[Point]]) -> int:
    offset = PLATFORM_EDGE + PLATFORM_WIDTH / 2

    def room(side: int) -> float:
        least = math.inf
        for ds in (-40, -20, 0, 20, 40):
            p = path.beside(s + ds, side * offset)
            for track in tracks:
                least = min(least, distance_to_polyline(p, track))
        return least

    return 1 if room(1) >= room(-1) else -1


def islands(lines: list[dict[str, Any]], tracks: Optional[list[list[Point]]] = None) -> None:
    tracks = tracks or []
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            a, b = lines[i], lines[j]
            path_a = RailPath.from_flat(a["points"])
            path_b = RailPath.from_flat(b["points"])
            stops_a = list(a["stops"])
            stops_b = list(b["stops"])
            for ia, stop_a in enumerate(list(stops_a)):
                ib = next((k for k, s in enumerate(stops_b) if s["id"] == stop_a["id"]), -1)
                if ib < 0:
                    continue
                stop_b = stops_b[ib]
                bx, bz, _, _ = path_b.at(stop_b["s"])
                track_b = path_a.project((bx, bz))[1]
                ax, az, _, _ = path_a.at(stop_a["s"])
                track_a = path_b.project((ax, az))[1]
                gap = abs(track_b) - 2 * PLATFORM_EDGE
                if gap < 3 or gap > 14:
                    continue
                clear = all(
                    all(distance_to_polyline(path_a.beside(stop_a["s"] + ds, track_b / 2), t) > gap / 2 - 0.5 for t in tracks)
                    for ds in (-40, 0, 40)
                )
                if not clear:
                    continue
                stops_a[ia] = {**stop_a, "side": 1 if track_b > 0 else -1, "width": js_round(gap)}
                stops_b[ib] = {**stop_b, "side": 1 if track_a > 0 else -1, "width": js_round(gap), "twin": True}
            lines[i] = {**a, "stops": stops_a}
            lines[j] = {**b, "stops": stops_b}


@dataclass
class BuildOptions:
    bounds: Bounds
    lines: list[LineSpec]
    names: dict[str, tuple[str, str]] = field(default_factory=dict)
    hindi: dict[str, str] = field(default_factory=dict)
    margin: float = 150.0
    skip_track: Callable[[dict[str, str]], bool] = lambda tags: False
    # Godot additions (all off for the Three.js build).
    tamil: dict[str, str] = field(default_factory=dict)
    heights: bool = False
    crossings: bool = False


def build_rail(extract: dict[str, Any], options: BuildOptions) -> dict[str, Any]:
    margin = options.margin
    nodes: dict[int, dict[str, Any]] = {}
    local: dict[int, Point] = {}
    ways: dict[int, dict[str, Any]] = {}
    relations: dict[int, dict[str, Any]] = {}
    for element in extract.get("elements", []):
        kind = element.get("type")
        if kind == "node":
            nodes[element["id"]] = element
            local[element["id"]] = to_local(element["lat"], element["lon"])
        elif kind == "way":
            ways[element["id"]] = element
        elif kind == "relation":
            relations[element["id"]] = element

    def way_points(way: dict[str, Any]) -> list[Point]:
        return [local[n] for n in way["nodes"] if n in local]

    tracks: list[dict[str, Any]] = []
    track_lines: list[list[Point]] = []
    for way in ways.values():
        tags = way.get("tags", {})
        if tags.get("railway") != "rail":
            continue
        if options.skip_track(tags):
            continue
        points, _, _ = clip_line(way_points(way), options.bounds, 40)
        if len(points) < 2:
            continue
        track_lines.append(points)
        tracks.append({"id": way["id"], "kind": "service" if tags.get("service") else "main", "points": [js_round(v) for p in points for v in p]})

    def named(tags: dict[str, str]) -> tuple[str, str]:
        english = tags.get("name", "")
        short = options.names.get(english)
        if short:
            return short[0], short[1]
        tamil = tags.get("name:ta", "") or options.tamil.get(english, "")
        return english, tamil

    station_nodes = [
        n
        for n in nodes.values()
        if n.get("tags", {}).get("railway") in ("station", "halt")
        and n["tags"].get("station") != "subway"
        and n["tags"].get("network") not in ("Chennai Metro", "MRTS")
        and n["tags"].get("name")
    ]

    # Godot addition: the MRTS's own stations (network=MRTS) for the MRTS lines only.
    mrts_nodes = [
        n for n in nodes.values()
        if n.get("tags", {}).get("railway") in ("station", "halt") and n["tags"].get("network") == "MRTS" and n["tags"].get("name")
    ]
    lines: list[dict[str, Any]] = []
    stations: dict[str, dict[str, Any]] = {}
    for spec in options.lines:
        relation = relations.get(spec.relation)
        if not relation or not relation.get("members"):
            raise RuntimeError(f"Route relation {spec.relation} ({spec.name}) is missing or has no members; re-run scripts/fetch-rail.mjs.")
        member_ways = [
            ways[m["ref"]]
            for m in relation["members"]
            if m["type"] == "way" and m["role"] in ("", "forward", "backward") and m["ref"] in ways and ways[m["ref"]].get("tags", {}).get("railway") == "rail"
        ]
        full = chain_ways([way_points(w) for w in member_ways])
        stop_refs = [local[m["ref"]] for m in relation["members"] if m["type"] == "node" and m["role"].startswith("stop") and m["ref"] in local]
        if len(stop_refs) >= 2 and len(full) >= 2:
            path = RailPath(full)
            if path.project(stop_refs[0])[0] > path.project(stop_refs[-1])[0]:
                full = list(reversed(full))
        points, start_beyond, end_beyond = clip_line(full, options.bounds, margin)
        if len(points) < 2:
            continue
        path = RailPath(points)
        stops: list[dict[str, Any]] = []

        def add_stop(node: dict[str, Any], at: Point) -> None:
            p = local[node["id"]]
            name, name_ta = named(node.get("tags", {}))
            if any(s["id"] == str(node["id"]) for s in stops):
                return
            s = max(60.0, min(path.length - 60, path.project(at)[0]))
            stops.append({"id": str(node["id"]), "name": name, "nameTa": name_ta, "s": js_round(s), "side": platform_side(path, s, track_lines), "width": PLATFORM_WIDTH})
            if str(node["id"]) not in stations:
                name_hi = node.get("tags", {}).get("name:hi") or options.hindi.get(name, "")
                entry: dict[str, Any] = {"id": str(node["id"]), "name": name, "nameTa": name_ta}
                if name_hi:
                    entry["nameHi"] = name_hi
                entry["x"] = js_round(p[0])
                entry["z"] = js_round(p[1])
                stations[str(node["id"])] = entry

        candidates = station_nodes + (mrts_nodes if spec.system == "mrts" else [])
        stop_positions = [p for p in stop_refs if inside(p, options.bounds, 0) and path.project(p)[2] < 15]
        if stop_positions:
            for at in stop_positions:
                best = None
                best_distance = 400.0
                for node in candidates:
                    p = local[node["id"]]
                    d = math.hypot(p[0] - at[0], p[1] - at[1])
                    if d < best_distance:
                        best_distance = d
                        best = node
                if best is not None:
                    add_stop(best, at)
        else:
            for node in candidates:
                p = local[node["id"]]
                if not inside(p, options.bounds, 0) or path.project(p)[2] > 90:
                    continue
                add_stop(node, p)
        stops.sort(key=lambda s: s["s"])
        tags = relation.get("tags", {})
        line: dict[str, Any] = {
            "id": spec.id,
            "name": spec.name,
            "points": [js_round(v) for p in points for v in p],
            "stops": stops,
            "from": {"name": tags.get("from", spec.from_name), "beyond": start_beyond},
            "to": {"name": tags.get("to", spec.to_name), "beyond": end_beyond},
            "headwayMinutes": spec.headway_minutes,
            "offsetMinutes": spec.offset_minutes,
        }
        if options.heights:
            line["system"] = spec.system
            line["train"] = spec.train
            if spec.system == "mrts":
                dense, heights = viaduct_heights(points, [st["s"] for st in stops], member_ways, local)
                line["points"] = [js_round(v) for p in dense for v in p]
                line["heights"] = heights
        lines.append(line)

    islands(lines, track_lines)
    date = (extract.get("osm3s", {}).get("timestamp_osm_base") or "unknown date")[:10]
    out: dict[str, Any] = {"attribution": f"© OpenStreetMap contributors (railway data {date})", "tracks": tracks, "lines": lines, "stations": list(stations.values())}
    if options.crossings:
        out["crossings"] = level_crossings(nodes, local, track_lines, lines, options.bounds)
    return out


# --- Godot additions -----------------------------------------------------------------------------


def _elevated(tags: dict[str, str]) -> bool:
    return tags.get("bridge") in ("viaduct", "yes") or _layer(tags) >= 1


def _layer(tags: dict[str, str]) -> int:
    try:
        return int(tags.get("layer", "0"))
    except ValueError:
        return 0


def viaduct_heights(points: list[Point], stops: list[float], member_ways: list[dict[str, Any]], local: dict[int, Point]) -> tuple[list[Point], list[float]]:
    """Rail-top height above the ground along an elevated line (estimated, G-323).

    A point lies on the viaduct when the nearest member way is tagged as a bridge or above
    ground (`bridge=viaduct|yes`, `layer>=1`); runs on it stand at VIADUCT_HEIGHT. Platforms are
    level: points are added at each platform's ends (on the line, so distances along it do not
    change) and the platform stands at the highest height over its length. Elsewhere the line
    ramps down to the ground at VIADUCT_GRADE. Returns the points (with the added ones) and a
    height per point."""
    half = PLATFORM_LENGTH_GODOT / 2 + 5
    path = RailPath(points)
    # Points with the platform ends added.
    marks = sorted({max(0.0, min(path.length, st + d)) for st in stops for d in (-half, half)})
    dense: list[Point] = []
    along: list[float] = []
    m = 0
    for i, p in enumerate(points):
        while m < len(marks) and marks[m] < path.lengths[i] - 0.05:
            x, z, _, _ = path.at(marks[m])
            if not along or marks[m] - along[-1] > 0.05:
                dense.append((x, z))
                along.append(marks[m])
            m += 1
        if not along or path.lengths[i] - along[-1] > 0.05:
            dense.append(p)
            along.append(path.lengths[i])
    flagged: list[tuple[list[Point], bool]] = [([local[n] for n in w["nodes"] if n in local], _elevated(w.get("tags", {}))) for w in member_ways]
    up: list[bool] = []
    for p in dense:
        best, flag = math.inf, False
        for line, elevated in flagged:
            if len(line) < 2:
                continue
            d = distance_to_polyline(p, line)
            if d < best:
                best, flag = d, elevated
        up.append(flag)
    n = len(dense)
    heights = [VIADUCT_HEIGHT if u else 0.0 for u in up]
    fixed = list(up)
    for st in stops:
        span = [i for i in range(n) if st - half - 0.1 <= along[i] <= st + half + 0.1]
        level = VIADUCT_HEIGHT if any(up[i] for i in span) else max((heights[i] for i in span), default=0.0)
        for i in span:
            heights[i] = level
            fixed[i] = True
    for i in range(1, n):
        if not fixed[i]:
            heights[i] = max(heights[i], heights[i - 1] - (along[i] - along[i - 1]) * VIADUCT_GRADE)
    for i in range(n - 2, -1, -1):
        if not fixed[i]:
            heights[i] = max(heights[i], heights[i + 1] - (along[i + 1] - along[i]) * VIADUCT_GRADE)
    return dense, [js_round(h) for h in heights]


def level_crossings(nodes: dict[int, Any], local: dict[int, Point], track_lines: list[list[Point]], lines: list[dict[str, Any]], bounds: Bounds) -> list[dict[str, Any]]:
    """Mapped `railway=level_crossing` nodes on a drawn track, with each line's distance along it."""
    out: list[dict[str, Any]] = []
    paths = [(line["id"], RailPath.from_flat(line["points"]), line.get("heights")) for line in lines]
    for node in nodes.values():
        if node.get("tags", {}).get("railway") != "level_crossing":
            continue
        p = local[node["id"]]
        if not inside(p, bounds, 0):
            continue
        near = min((distance_to_polyline(p, t) for t in track_lines), default=math.inf)
        if near > 3.0:
            continue
        # The track's direction there (from the nearest drawn track).
        best_track = min(track_lines, key=lambda t: distance_to_polyline(p, t))
        tp = RailPath(best_track)
        s, _, _ = tp.project(p)
        _, _, yaw, _ = tp.at(s)
        crossing_lines = []
        for line_id, path, heights in paths:
            ls, _, d = path.project(p)
            if d < 25.0 and not heights:
                crossing_lines.append({"line": line_id, "s": js_round(ls)})
        out.append({"id": str(node["id"]), "x": js_round(p[0]), "z": js_round(p[1]), "yaw": round(yaw, 4), "lines": crossing_lines})
    out.sort(key=lambda c: c["id"])
    return out


# --- the two builds ------------------------------------------------------------------------------

# scripts/build-rail.ts, unchanged.
THREEJS_LINES = [
    LineSpec("beach-tambaram", 1289050, "Chennai Beach – Tambaram", "Chennai Beach", "Tambaram", 8, 0),
    LineSpec("tambaram-beach", 20986091, "Tambaram – Chennai Beach", "Tambaram", "Chennai Beach", 8, 3),
]
NAMES: dict[str, tuple[str, str]] = {
    "Puratchi Thalaivar Dr. M. G. Ramachandran Central": ("Chennai Central", "சென்னை சென்ட்ரல்"),
    "Chennai Chetpet": ("Chetpet", "சேத்துப்பட்டு"),
    "Chennai Park": ("Park", "பூங்கா"),
    "Chennai Park Town": ("Park Town", "பூங்கா நகர்"),
    "Saint Thomas Mount": ("St. Thomas Mount", "பரங்கிமலை"),
}
# Godot addition: Park Town's OSM `name` is in Tamil only.
GODOT_NAMES: dict[str, tuple[str, str]] = {**NAMES, "சென்னை பூங்கா நகர்": ("Park Town", "சென்னை பூங்கா நகர்")}
HINDI: dict[str, str] = {
    "Park": "पार्क",
    "Chennai Egmore": "चेन्नई एग्मोर",
    "Chetpet": "चेटपेट",
    "Nungambakkam": "नुंगमबाक्कम",
    "Kodambakkam": "कोडमबाक्कम",
    "Mambalam": "मांबलम",
    "Saidapet": "सैदापेट",
    "Guindy": "गिंडी",
    "St. Thomas Mount": "सेंट थॉमस माउंट",
    "Chennai Central": "चेन्नई सेंट्रल",
    "Park Town": "पार्क टाउन",
}


def threejs_skip(tags: dict[str, str]) -> bool:
    import re

    return bool(re.search("MRTS", tags.get("name", ""), re.I)) or tags.get("tunnel") == "yes" or tags.get("bridge") == "viaduct" or _layer_num(tags) >= 2 or tags.get("railway") != "rail"


def _layer_num(tags: dict[str, str]) -> float:
    try:
        return float(tags.get("layer", "0"))
    except ValueError:
        return math.nan


# The Godot file: the Three.js lines first (same ids, same order), then every other passenger
# route relation in the extract that has track on the map. Headways are estimates (the express
# services run once a day in reality; here every two game hours each). The offsets given are
# only preferences: `timetable()` moves each new line's offset forward minute by minute until none
# of its trains comes near another line's train on shared track (G-322).
GODOT_LINES = THREEJS_LINES + [
    LineSpec("mrts-beach-mount", 7849319, "Chennai MRTS: Chennai Beach – St. Thomas Mount", "Chennai Beach", "Saint Thomas Mount", 15, 2, "mrts", "emu"),
    LineSpec("mrts-mount-beach", 8037620, "Chennai MRTS: St. Thomas Mount – Chennai Beach", "Saint Thomas Mount", "Chennai Beach", 15, 9, "mrts", "emu"),
    LineSpec("central-arakkonam", 1289122, "Chennai Central – Arakkonam", "Chennai Central", "Arakkonam", 20, 5, "suburban", "emu_ac"),
    LineSpec("central-sullurpeta", 21812015, "Chennai Central – Sullurpeta", "Chennai Central", "Sullurpeta", 20, 12, "suburban", "emu"),
    LineSpec("coromandel-out", 11298772, "Coromandel Express: Chennai – Howrah", "Chennai Central", "Howrah", 120, 10, "express", "express"),
    LineSpec("coromandel-in", 11299100, "Coromandel Express: Howrah – Chennai", "Howrah", "Chennai Central", 120, 40, "express", "express"),
    LineSpec("charminar-out", 11219499, "Charminar Express: Chennai – Hyderabad", "Chennai Central", "Hyderabad", 120, 25, "express", "express"),
    LineSpec("charminar-in", 11219500, "Charminar Express: Hyderabad – Chennai", "Hyderabad", "Chennai Central", 120, 55, "express", "express"),
    LineSpec("shatabdi-out", 11300238, "Shatabdi Express: Chennai – Mysuru", "Chennai Central", "Mysuru", 120, 33, "express", "express"),
    LineSpec("shatabdi-in", 11300237, "Shatabdi Express: Mysuru – Chennai", "Mysuru", "Chennai Central", 120, 63, "express", "express"),
    LineSpec("rajdhani-out", 13012799, "Rajdhani Express: Chennai – Hazrat Nizamuddin", "Chennai Central", "Hazrat Nizamuddin", 120, 78, "express", "express"),
    LineSpec("saptagiri-out", 17666362, "Saptagiri Express: Chennai – Tirupati", "Chennai Central", "Tirupati", 120, 93, "express", "express"),
]
# How each train type runs (estimated, like motion.ts's EMU_MOTION; G-322). `terminusDwell`: seconds
# a train stands at a terminus on the map before leaving it, or after arriving before it is
# taken out of service.
MOTION: dict[str, dict[str, float]] = {
    "emu": {"accel": 0.8, "brake": 0.9, "topSpeed": 22, "dwell": 30, "terminusDwell": 120},
    "emu_ac": {"accel": 0.8, "brake": 0.9, "topSpeed": 22, "dwell": 30, "terminusDwell": 120},
    "express": {"accel": 0.4, "brake": 0.6, "topSpeed": 25, "dwell": 30, "terminusDwell": 150},
}
# A terminus on the map: a line end that is not beyond the map with a stop this close to it, metres.
TERMINUS_REACH = 150.0
# Trains on shared track closer than this (centre to centre) are a conflict, metres.
CONFLICT_GAP = 130.0
# The timetable repeats every two hours (the longest headway); conflicts are looked for over it.
CYCLE = 120 * 60


# --- packages/rail/src/motion.ts (with the Godot terminus rule) -----------------------------------


class RunProfile:
    """motion.ts RunProfile. Godot addition: `start_standing` / `end_standing` for a terminus on the
    map: the run begins (ends) standing at the first (last) stop for `terminusDwell` seconds."""

    def __init__(self, length: float, stops: list[float], spec: dict[str, float], start_standing: bool = False, end_standing: bool = False) -> None:
        self.length = length
        self.stops = stops
        self.spec = spec
        self.phases: list[dict[str, float]] = []
        self.arrivals: list[float] = []
        t = 0.0
        s = stops[0] if start_standing and stops else 0.0
        v = 0.0 if (stops and stops[0] < 1) or start_standing else spec["topSpeed"]
        state = {"t": t, "s": s, "v": v}

        def push(duration: float, a: float, stop: Optional[int] = None) -> None:
            if duration <= 0:
                return
            if stop is None:
                self.phases.append({"t0": state["t"], "duration": duration, "s0": state["s"], "v0": state["v"], "a": a})
            else:
                self.phases.append({"t0": state["t"], "duration": duration, "s0": state["s"], "v0": 0.0, "a": 0.0, "stop": stop})
            state["s"] += state["v"] * duration + 0.5 * a * duration * duration
            state["v"] += a * duration
            state["t"] += duration

        last = len(stops) - 1
        for index, target in enumerate(stops):
            distance = target - state["s"]
            if distance > 0.01:
                self._run_to(distance, state["v"], True, push)
            state["s"] = target
            state["v"] = 0.0
            self.arrivals.append(state["t"])
            terminus = (index == 0 and start_standing) or (index == last and end_standing)
            push(spec["terminusDwell"] if terminus else spec["dwell"], 0.0, index)
        if not end_standing and length - state["s"] > 0.01:
            self._run_to(length - state["s"], state["v"], False, push)
        self.duration = state["t"]

    def _run_to(self, distance: float, v0: float, stop: bool, push: Callable[..., None]) -> None:
        a, b, top = self.spec["accel"], self.spec["brake"], self.spec["topSpeed"]
        if not stop:
            to_top = max(0.0, (top * top - v0 * v0) / (2 * a))
            if to_top >= distance:
                v1 = math.sqrt(v0 * v0 + 2 * a * distance)
                push((v1 - v0) / a, a)
            else:
                push((top - v0) / a, a)
                push((distance - to_top) / top, 0.0)
            return
        peak = math.sqrt((distance + (v0 * v0) / (2 * a)) / (1 / (2 * a) + 1 / (2 * b)))
        if peak < v0:
            hard = (v0 * v0) / (2 * distance)
            push(v0 / hard, -hard)
            return
        peak = min(peak, top)
        up = (peak * peak - v0 * v0) / (2 * a)
        down = (peak * peak) / (2 * b)
        push((peak - v0) / a, a)
        push((distance - up - down) / peak, 0.0)
        push(peak / b, -b)

    def s_at(self, t: float) -> float:
        c = max(0.0, min(self.duration, t))
        phase = self.phases[-1]
        for p in self.phases:
            if c < p["t0"] + p["duration"]:
                phase = p
                break
        tau = min(phase["duration"], c - phase["t0"])
        return min(self.length, phase["s0"] + phase["v0"] * tau + 0.5 * phase["a"] * tau * tau)


def profile_of(line: dict[str, Any]) -> RunProfile:
    path = RailPath.from_flat(line["points"])
    stops = [s["s"] for s in line["stops"]]
    start = not line["from"]["beyond"] and bool(stops) and stops[0] <= TERMINUS_REACH
    end = not line["to"]["beyond"] and bool(stops) and path.length - stops[-1] <= TERMINUS_REACH
    return RunProfile(path.length, stops, line.get("motion", MOTION["emu"]), start, end)


def _positions(line: dict[str, Any], path: RailPath, profile: RunProfile, offset: float, clock: float) -> list[Point]:
    """Centres of the line's trains at `clock` (as RailLine.trains), over one cycle."""
    out: list[Point] = []
    headway = line["headwayMinutes"] * 60
    first = math.ceil((clock - offset - profile.duration) / headway)
    last = math.floor((clock - offset) / headway)
    for k in range(first, last + 1):
        t = clock - (offset + k * headway)
        if 0 <= t <= profile.duration:
            x, z, _, _ = path.at(profile.s_at(t))
            out.append((x, z))
    return out


def conflicts(lines: list[dict[str, Any]], step: float = 4.0) -> list[tuple[str, str, float]]:
    """Pairs of trains of different lines on shared track, closer than CONFLICT_GAP, over a cycle."""
    data = [(l, RailPath.from_flat(l["points"]), profile_of(l)) for l in lines]
    out: list[tuple[str, str, float]] = []
    clock = 0.0
    while clock < CYCLE:
        at = [(l, p, _positions(l, p, pr, l["offsetMinutes"] * 60, clock + 6 * 3600)) for l, p, pr in data]
        for i, (la, pa, xa) in enumerate(at):
            for lb, pb, xb in at[i + 1:]:
                for a in xa:
                    for b in xb:
                        if math.hypot(a[0] - b[0], a[1] - b[1]) < CONFLICT_GAP and (pb.project(a)[2] < 2.0 or pa.project(b)[2] < 2.0):
                            out.append((la["id"], lb["id"], clock))
        clock += step
    return out


def timetable(lines: list[dict[str, Any]], fixed: int) -> None:
    """Moves each line's offset after the first `fixed` forward a minute at a time until it has no
    conflict with the lines before it (deterministic, G-322)."""
    for i in range(fixed, len(lines)):
        line = lines[i]
        start = line["offsetMinutes"]
        for extra in range(int(line["headwayMinutes"])):
            line["offsetMinutes"] = (start + extra) % line["headwayMinutes"]
            if not conflicts(lines[: i + 1], 8.0):
                break
        else:
            raise RuntimeError(f"No conflict-free offset for {line['id']}; raise its headway.")


# Tamil for stations OSM has no `name:ta` for: transliterations written for the game,
# **needs native review** (G-324).
TAMIL_ESTIMATED: dict[str, str] = {
    "Thiruvallikeni": "திருவல்லிக்கேணி",
    "Mundakakanni Amman Koil": "முண்டகக்கண்ணி அம்மன் கோயில்",
    "Thirumayilai": "திருமயிலை",
    "Greenways Road": "கிரீன்வேஸ் சாலை",
    "Kasturiba Nagar": "கஸ்தூரிபா நகர்",
    "Puzhudivakkam": "புழுதிவாக்கம்",
    "Adambakkam": "ஆதம்பாக்கம்",
    "St. Thomas Mount MRTS": "பரங்கிமலை",
}


def godot_skip(tags: dict[str, str]) -> bool:
    """As the Three.js build: the MRTS (drawn from its line on the viaduct instead), tunnels,
    viaducts and high layers are not drawn as ground tracks."""
    return threejs_skip(tags)


def box_bounds() -> Bounds:
    s, w, n, e = FETCH_BOX
    x0, z0 = to_local(n, w)
    x1, z1 = to_local(s, e)
    return Bounds(x0 + BOX_INSET, x1 - BOX_INSET, z0 + BOX_INSET, z1 - BOX_INSET)


def load_extract() -> dict[str, Any]:
    return json.loads(EXTRACT.read_text(encoding="utf-8"))


def threejs_bounds() -> Bounds:
    b = json.loads(THREEJS_INDEX.read_text(encoding="utf-8"))["bounds"]
    return Bounds(b["minX"], b["maxX"], b["minZ"], b["maxZ"])


def build_threejs(extract: dict[str, Any]) -> dict[str, Any]:
    return build_rail(extract, BuildOptions(threejs_bounds(), THREEJS_LINES, NAMES, HINDI, 150, threejs_skip))


def build_godot(extract: dict[str, Any]) -> dict[str, Any]:
    out = build_rail(extract, BuildOptions(threejs_bounds(), GODOT_LINES, GODOT_NAMES, HINDI, 150, godot_skip, TAMIL_ESTIMATED, heights=True, crossings=True))
    # Lines that end up with no stop on the map are dropped (nothing to board or show), and said so.
    out["lines"] = [line for line in out["lines"] if line["stops"]]
    specs = {spec.id: spec for spec in GODOT_LINES}
    for line in out["lines"]:
        line["motion"] = MOTION[specs[line["id"]].train]
    timetable(out["lines"], len(THREEJS_LINES))
    out["format"] = "rail-godot-1"
    out["note"] = ("Built by godot-chennai/tools/rail/build_rail.py from the Three.js game's OSM railway extract "
                   "(a port of packages/rail/src/build.ts). Platforms, headways, viaduct heights and train motion are "
                   "estimated; Tamil names not in OSM need native review.")
    return out


def dumps(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def report(data: dict[str, Any]) -> str:
    rows = ["# Railway coverage", "",
            "Built by `tools/rail/build_rail.py` (G-320) from `chennai-open-world/assets/osm/rail/chennai-rail.osm.json`. "
            f"{data['attribution']}, ODbL 1.0. Headways, platforms and viaduct heights are **estimates**; Tamil "
            "names marked * are transliterations that **need native review**.", "",
            f"Tracks drawn: {len(data['tracks'])} ({sum(1 for t in data['tracks'] if t['kind'] == 'main')} running lines). "
            f"Stations: {len(data['stations'])}. Level crossings: {len(data.get('crossings', []))}.", "",
            "| Line | System | Train | Every (min, est.) | From | To | Stops on the map |", "|---|---|---|---|---|---|---|"]
    for line in data["lines"]:
        f = line["from"]["name"] + (" (beyond the map)" if line["from"]["beyond"] else "")
        t = line["to"]["name"] + (" (beyond the map)" if line["to"]["beyond"] else "")
        stops = ", ".join(s["name"] + ("*" if s["name"] in TAMIL_ESTIMATED else "") for s in line["stops"])
        rows.append(f"| {line['name']} | {line.get('system', '')} | {line.get('train', '')} | {line['headwayMinutes']:g} | {f} | {t} | {stops} |")
    rows += ["", "Not included (not in the extract as passenger routes with track): Chennai Metro (stations only; its "
             "lines are underground or elevated and their ways were not fetched), the Tambaram–Chengalpattu line "
             "(outside the extract), Chennai Fort and Chennai Beach stations (not in the extract) and every MRTS stop south of Indira Nagar (south of the Three.js map box the lines are clipped to, G-320).", ""]
    return "\n".join(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="exit 1 if world/rail/rail.json is stale")
    parser.add_argument("--threejs", action="store_true", help="print the Three.js build (old bounds) to stdout")
    args = parser.parse_args()
    extract = load_extract()
    if args.threejs:
        print(dumps(build_threejs(extract)))
        return 0
    data = build_godot(extract)
    text = dumps(data)
    if args.check:
        if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != text:
            print(f"{TARGET} is stale: run tools/rail/build_rail.py", file=sys.stderr)
            return 1
        return 0
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(text, encoding="utf-8")
    REPORT.write_text(report(data), encoding="utf-8")
    print(f"{len(data['tracks'])} tracks, {len(data['lines'])} lines, {len(data['stations'])} stations, {len(data['crossings'])} crossings, {len(text) // 1024} KB -> {TARGET}")
    for line in data["lines"]:
        print(f"  {line['name']}: {len(line['stops'])} stops, {RailPath.from_flat(line['points']).length / 1000:.1f} km")
    return 0


if __name__ == "__main__":
    sys.exit(main())
