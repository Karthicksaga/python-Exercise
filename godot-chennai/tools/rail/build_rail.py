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
import gzip
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
# G-460: the railway part of the regional OSM extract (`extract_rail.py`), and the world's bounds.
REGIONAL = GODOT / "data" / "rail" / "regional-rail.osm.json.gz"
WORLD = GODOT / "world" / "world.json"
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
    # Godot addition (G-461): run the relation's track and stops the other way (a service OSM maps
    # in one direction only; the return service is estimated, on the same track).
    reverse: bool = False


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


def chain_runs(ways: list[list[Point]], join: float = 30.0) -> list[list[Point]]:
    """Godot addition (G-460): ways joined by their ends into runs, whatever their order in the
    relation. Consecutive ways chain as `chain_ways` does; a way that does not touch the run so far
    starts a new run, and runs whose ends lie within `join` metres are then joined (turned round
    as needed) until none are."""
    def gap(a: Point, b: Point) -> float:
        return math.hypot(a[0] - b[0], a[1] - b[1])

    runs: list[list[Point]] = []
    for way in ways:
        if len(way) < 2:
            continue
        if runs:
            line = runs[-1]
            ends = min(gap(e, w) for e in (line[0], line[-1]) for w in (way[0], way[-1]))
            if ends <= join:
                runs[-1] = chain_ways([line, way])
                continue
        runs.append(list(way))
    merged = True
    while merged and len(runs) > 1:
        merged = False
        for i in range(len(runs)):
            for j in range(i + 1, len(runs)):
                a, c = runs[i], runs[j]
                best = min((gap(a[-1], c[0]), 0), (gap(a[-1], c[-1]), 1), (gap(a[0], c[-1]), 2), (gap(a[0], c[0]), 3))
                if best[0] > join:
                    continue
                if best[1] == 0:
                    out = a + c[1:]
                elif best[1] == 1:
                    out = a + list(reversed(c))[1:]
                elif best[1] == 2:
                    out = c + a[1:]
                else:
                    out = list(reversed(c)) + a[1:]
                runs[i] = out
                del runs[j]
                merged = True
                break
            if merged:
                break
    return runs


# Stations left out of the regional build: mapped but not served by these lines (a planned station).
SKIP_STATIONS = {"Chennai Central High Speed Railway station"}


def _stop_like(node: Optional[dict[str, Any]]) -> bool:
    if not node:
        return False
    t = node.get("tags", {})
    return t.get("railway") in ("station", "halt", "stop") or t.get("public_transport") in ("stop_position", "station")


def _on_track(node: Optional[dict[str, Any]]) -> bool:
    t = (node or {}).get("tags", {})
    return t.get("public_transport") == "stop_position" or t.get("railway") == "stop"


def _first_block(present: list[bool]) -> list[int]:
    """Indices of the first run of consecutive True values (the stops of the relation's first
    stretch in the world; a branch listed after a gap is left out)."""
    out: list[int] = []
    for i, ok in enumerate(present):
        if ok:
            out.append(i)
        elif out:
            break
    return out


# A route's track between two of its stops is at most this many times their straight distance.
ROUTE_DETOUR = 2.5
# Track changes in a relation's graph (`route_path`): how close two ways' points must be, the cost
# of a change in metres, and how long the eased crossover is either side.
SWITCH_GAP = 7.0
SWITCH_COST = 400.0
SWITCH_EASE = 40.0


def route_path(member_ways: list[dict[str, Any]], local: dict[int, Point], stops: list[Point], starts_here: bool) -> list[Point]:
    """Godot addition (G-460): a relation's line through the regional extract, whatever the order
    of its ways and with some missing beyond the world's edge. The ways form a graph on their
    shared nodes; of the relation's stops in the world (`stops`, in the relation's order) the two
    farthest apart along the track are its ends in the world, the earlier one first; the line is
    the shortest path between them, extended at each end to the vertex farthest (in a straight line)
    from the other end, never back over the line (a relation that also lists the other track would
    otherwise turn round). With one stop in the world, the line runs from it outwards when
    `starts_here` (its first stops are in the world), else inwards to it. [] if there is no graph."""
    import heapq

    adj: dict[int, list[tuple[int, float]]] = {}
    owner: dict[int, set[int]] = {}
    for w in member_ways:
        ids = [n for n in w["nodes"] if n in local]
        for n in ids:
            owner.setdefault(n, set()).add(w["id"])
        for a, c in zip(ids, ids[1:]):
            if a == c:
                continue
            d = math.hypot(local[a][0] - local[c][0], local[a][1] - local[c][1])
            adj.setdefault(a, []).append((c, d))
            adj.setdefault(c, []).append((a, d))
    if not adj:
        return []
    verts = list(adj)
    # Crossovers: a relation often lists both tracks of a double line with its stops on either, so
    # a vertex may switch to another way's vertex within SWITCH_GAP; the switch costs SWITCH_COST
    # metres, so a path takes one only where it must.
    grid: dict[tuple[int, int], list[int]] = {}
    for v in verts:
        grid.setdefault((int(local[v][0] // 10), int(local[v][1] // 10)), []).append(v)
    switches: set[tuple[int, int]] = set()
    for v in verts:
        gx, gz = int(local[v][0] // 10), int(local[v][1] // 10)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for u in grid.get((gx + dx, gz + dz), []):
                    if u <= v or owner[u] & owner[v]:
                        continue
                    d = math.hypot(local[u][0] - local[v][0], local[u][1] - local[v][1])
                    if d < SWITCH_GAP:
                        adj[v].append((u, d + SWITCH_COST))
                        adj[u].append((v, d + SWITCH_COST))
                        switches.add((u, v))
                        switches.add((v, u))

    def nearest(p: Point) -> int:
        return min(verts, key=lambda v: (local[v][0] - p[0]) ** 2 + (local[v][1] - p[1]) ** 2)

    def dijkstra(src: int, blocked: set[int]) -> tuple[dict[int, float], dict[int, int]]:
        dist = {src: 0.0}
        prev: dict[int, int] = {}
        heap = [(0.0, src)]
        while heap:
            d, v = heapq.heappop(heap)
            if d > dist.get(v, math.inf):
                continue
            for u, w in adj[v]:
                if u in blocked:
                    continue
                nd = d + w
                if nd < dist.get(u, math.inf):
                    dist[u] = nd
                    prev[u] = v
                    heapq.heappush(heap, (nd, u))
        return dist, prev

    def walk(prev: dict[int, int], src: int, dst: int) -> list[int]:
        out = [dst]
        while out[-1] != src:
            out.append(prev[out[-1]])
        return list(reversed(out))

    def far(p: Point) -> Callable[[int], float]:
        return lambda v: (local[v][0] - p[0]) ** 2 + (local[v][1] - p[1]) ** 2

    if not stops:
        return []
    at = [nearest(p) for p in stops]
    a, c, best = at[0], at[0], -1.0
    for i in range(len(at)):
        dist_i, _ = dijkstra(at[i], set())
        for j in range(i + 1, len(at)):
            d = dist_i.get(at[j], -1.0)
            straight = math.hypot(local[at[i]][0] - local[at[j]][0], local[at[i]][1] - local[at[j]][1])
            # Two stops of one station on the two tracks are close but far apart round a loop of
            # both tracks: a pair counts only where the track is not much longer than the line.
            if d > best and d <= ROUTE_DETOUR * straight + 200:
                a, c, best = at[i], at[j], d
    if a == c:
        dist, prev = dijkstra(a, set())
        end = max(dist, key=far(local[a]))
        ids = walk(prev, a, end)
        if not starts_here:
            ids = list(reversed(ids))
    else:
        dist, prev = dijkstra(a, set())
        if c not in dist:
            return []
        core = walk(prev, a, c)
        blocked = set(core)
        d_after, p_after = dijkstra(c, blocked - {c})
        after = max(d_after, key=far(local[a]))
        tail = walk(p_after, c, after)[1:] if far(local[a])(after) > far(local[a])(c) else []
        d_before, p_before = dijkstra(a, blocked - {a})
        before = max(d_before, key=far(local[c]))
        head = list(reversed(walk(p_before, a, before)))[:-1] if far(local[c])(before) > far(local[c])(a) else []
        ids = head + core + tail
    return _smooth_switches([local[v] for v in ids], [(ids[i], ids[i + 1]) in switches for i in range(len(ids) - 1)])


def _smooth_switches(points: list[Point], switch: list[bool]) -> list[Point]:
    """Where the path changes track (a switch edge), the points within SWITCH_EASE metres on either
    side are dropped, so the line runs diagonally from one track to the other as a crossover does."""
    if not any(switch):
        return points
    along = [0.0]
    for i in range(1, len(points)):
        along.append(along[-1] + math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
    drop = [False] * len(points)
    for i, sw in enumerate(switch):
        if not sw:
            continue
        for k in range(len(points)):
            if 0 < k < len(points) - 1 and along[i] - SWITCH_EASE < along[k] < along[i + 1] + SWITCH_EASE:
                drop[k] = True
        # Keep a point at the ends of the eased stretch so the diagonal starts on the tracks.
    out = [p for k, p in enumerate(points) if not drop[k]]
    return out if len(out) >= 2 else points


def best_run(runs: list[list[Point]], stops: list[Point]) -> list[Point]:
    """The run that passes most stops (within 15 m), then the longest."""
    if not runs:
        return []

    def score(run: list[Point]) -> tuple[int, float]:
        near = sum(1 for p in stops if distance_to_polyline(p, run) < 15) if len(run) >= 2 else 0
        return (near, RailPath(run).length if len(run) >= 2 else 0.0)

    return max(runs, key=score)


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
    # Godot addition (G-460): the regional extract. Relations there can list their ways out of order
    # or with ways missing beyond the world's edge, so ways are joined by their ends into runs and
    # the run with the most stops is kept (`chain_runs`, `best_run`).
    regional: bool = False


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
    # Godot addition (G-462): Chennai Metro's stations for the Metro lines only.
    metro_nodes = [
        n for n in nodes.values()
        if n.get("tags", {}).get("railway") in ("station", "halt") and n["tags"].get("name")
        and (n["tags"].get("station") == "subway" or "metro" in n["tags"].get("network", "").lower())
    ]
    lines: list[dict[str, Any]] = []
    stations: dict[str, dict[str, Any]] = {}
    forward_stops: dict[int, list[str]] = {}
    for spec in options.lines:
        relation = relations.get(spec.relation)
        if not relation or not relation.get("members"):
            raise RuntimeError(f"Route relation {spec.relation} ({spec.name}) is missing or has no members; re-run scripts/fetch-rail.mjs.")
        kinds = ("subway", "light_rail", "rail") if spec.system == "metro" else ("rail",)
        member_ways = [
            ways[m["ref"]]
            for m in relation["members"]
            if m["type"] == "way" and m["role"] in ("", "forward", "backward") and m["ref"] in ways and ways[m["ref"]].get("tags", {}).get("railway") in kinds
        ]
        if options.regional:
            # Stop members as listed, with the stations some relations list without a role.
            stop_members = [m for m in relation["members"] if m["type"] == "node" and (m["role"].startswith("stop") or (m["role"] == "" and _stop_like(nodes.get(m["ref"]))))]
            stop_refs = [local[m["ref"]] for m in stop_members if m["ref"] in local]
            # Each stop member's reach: a stop position is on the track, a station node beside it.
            reach = {local[m["ref"]]: (15.0 if _on_track(nodes.get(m["ref"])) else 120.0) for m in stop_members if m["ref"] in local}
            block = _first_block([m["ref"] in local and inside(local[m["ref"]], options.bounds, 0) for m in stop_members])
            starts_here = bool(block) and block[0] < len(stop_members) / 2
            full = route_path(member_ways, local, [local[stop_members[i]["ref"]] for i in block], starts_here)
            if not full:
                full = best_run(chain_runs([way_points(w) for w in member_ways]), stop_refs)
            if spec.reverse:
                full = list(reversed(full))
        else:
            stop_refs = [local[m["ref"]] for m in relation["members"] if m["type"] == "node" and m["role"].startswith("stop") and m["ref"] in local]
            full = chain_ways([way_points(w) for w in member_ways])
            if len(stop_refs) >= 2 and len(full) >= 2:
                path = RailPath(full)
                if path.project(stop_refs[0])[0] > path.project(stop_refs[-1])[0]:
                    full = list(reversed(full))
        if options.regional and len(full) >= 2:
            # Head-on with an earlier line of the same kind of track (ground, MRTS viaduct, Metro);
            # before clipping, so the moved line is clipped to the world like any other.
            group = spec.system if spec.system in GRADES else "ground"
            same = [l["points"] for l in lines if (l.get("system") if l.get("system") in GRADES else "ground") == group]
            full, second = keep_left(full, same, track_lines if group == "ground" else [])
            for k, run in enumerate(second if group == "ground" else []):
                run, _, _ = clip_line(run, options.bounds, 40)
                if len(run) < 2:
                    continue
                track_lines.append(run)
                tracks.append({"id": -(len(lines) + 1) * 1000 - k, "kind": "main", "estimated": True, "points": [js_round(v) for p in run for v in p]})
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
            # Regional: one stop per station name within a platform's reach (two mapped nodes of one station).
            if options.regional and any(st["name"] == name and abs(st["s"] - s) < 500 for st in stops):
                return
            stops.append({"id": str(node["id"]), "name": name, "nameTa": name_ta, "s": js_round(s), "side": platform_side(path, s, track_lines), "width": PLATFORM_WIDTH})
            if str(node["id"]) not in stations:
                name_hi = node.get("tags", {}).get("name:hi") or options.hindi.get(name, "")
                entry: dict[str, Any] = {"id": str(node["id"]), "name": name, "nameTa": name_ta}
                if name_hi:
                    entry["nameHi"] = name_hi
                entry["x"] = js_round(p[0])
                entry["z"] = js_round(p[1])
                stations[str(node["id"])] = entry

        if spec.system == "metro":
            candidates = metro_nodes
        else:
            candidates = station_nodes + (mrts_nodes if spec.system == "mrts" else [])
        if options.regional:
            candidates = [n for n in candidates if n["tags"].get("name") not in SKIP_STATIONS]
        if options.regional:
            stop_positions = [p for p in stop_refs if inside(p, options.bounds, 0) and path.project(p)[2] < reach[p]]
        else:
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
                # Regional: an express with no stop members calls only at its ends (Chennai Central),
                # not at every station it passes.
                if options.regional and spec.system == "express" and named(node.get("tags", {}))[0] not in (spec.from_name, spec.to_name):
                    continue
                add_stop(node, p)
        if options.regional and spec.system == "suburban":
            # Chennai's suburban EMUs call at every station on their track: a mapped station or halt
            # beside the line (within 40 m) that the relation does not list becomes a stop too,
            # unless a stop is already within 400 m of it.
            for node in station_nodes:
                p = local[node["id"]]
                if not inside(p, options.bounds, 0) or node["tags"].get("name") in SKIP_STATIONS:
                    continue
                s_at, _, d = path.project(p)
                if d > 40 or any(abs(st["s"] - s_at) < 400 for st in stops):
                    continue
                add_stop(node, p)
        if options.regional:
            # A return service (G-461) calls at the stations its forward line calls at, in the other
            # order: its track is the other one, so its own nearest-station test could differ.
            if spec.reverse and spec.relation in forward_stops:
                stops.clear()
                for sid in reversed(forward_stops[spec.relation]):
                    add_stop(nodes[int(sid)], local[int(sid)])
            elif not spec.reverse:
                forward_stops[spec.relation] = [st["id"] for st in sorted(stops, key=lambda x: x["s"])]
        stops.sort(key=lambda s: s["s"])
        if options.regional:
            # A line end in the world must be a station, or trains would appear there at speed: the
            # station nearest that end (within 400 m) becomes a terminus stop.
            for at_start, beyond in ((True, start_beyond), (False, end_beyond)):
                end_s = 0.0 if at_start else path.length
                if beyond or (stops and abs((stops[0] if at_start else stops[-1])["s"] - end_s) <= TERMINUS_REACH):
                    continue
                end_p = path.at(end_s)[:2]
                near = [n for n in candidates if math.hypot(local[n["id"]][0] - end_p[0], local[n["id"]][1] - end_p[1]) < 400 and path.project(local[n["id"]])[2] < 120]
                if near:
                    add_stop(min(near, key=lambda n: path.project(local[n["id"]])[0] if at_start else -path.project(local[n["id"]])[0]), end_p)
            stops.sort(key=lambda s: s["s"])
            # Track the relation runs on past its terminus (sidings, the yard) is cut off 60 m past
            # the platform's middle, as build.ts puts a stop at most 60 m from a line's end.
            if stops:
                cut0 = 0.0 if start_beyond else max(0.0, stops[0]["s"] - 60.0)
                cut1 = path.length if end_beyond else min(path.length, stops[-1]["s"] + 60.0)
                if cut0 > 0.0 or cut1 < path.length:
                    inner = [p for p, l in zip(path.points, path.lengths) if cut0 < l < cut1]
                    points = [path.at(cut0)[:2]] + inner + [path.at(cut1)[:2]]
                    path = RailPath(points)
                    for st in stops:
                        st["s"] = js_round(st["s"] - cut0)
        tags = relation.get("tags", {})
        from_name = spec.from_name if spec.reverse else tags.get("from", spec.from_name)
        to_name = spec.to_name if spec.reverse else tags.get("to", spec.to_name)
        if options.regional and stops:
            # An end in the world is named after its terminus (OSM's from/to name the whole service).
            if not start_beyond and stops[0]["s"] <= TERMINUS_REACH:
                from_name = stops[0]["name"]
            if not end_beyond and path.length - stops[-1]["s"] <= TERMINUS_REACH:
                to_name = stops[-1]["name"]
        line: dict[str, Any] = {
            "id": spec.id,
            "name": spec.name,
            "points": [js_round(v) for p in points for v in p],
            "stops": stops,
            "from": {"name": from_name, "beyond": start_beyond},
            "to": {"name": to_name, "beyond": end_beyond},
            "headwayMinutes": spec.headway_minutes,
            "offsetMinutes": spec.offset_minutes,
        }
        if options.heights:
            line["system"] = spec.system
            line["train"] = spec.train
            if spec.system in GRADES:
                up, down, grade = GRADES[spec.system]
                dense, heights = viaduct_heights(points, [st["s"] for st in stops], member_ways, local, up, down, grade)
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

# Keep left (G-461): a train meeting another line's train head-on on the same centre line moves to
# the track on its left this far away (Indian double lines run on the left), metres.
LEFT_TRACK = (3.4, 7.5)
# A double line mapped as one way: the second track's centre this far to the left (estimated:
# Indian broad gauge track centres are about 4.6-5.3 m apart).
SECOND_TRACK = 4.8


def simplify_line(points: list[Point], tolerance: float) -> list[Point]:
    """Douglas-Peucker: drops points within `tolerance` metres of the line through their neighbours
    (the 20 m steps `keep_left` works in are not needed on straight track)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        best, at = -1.0, -1
        for k in range(i + 1, j):
            _, d = _foot(points[k], points[i], points[j])
            if d > best:
                best, at = d, k
        if best > tolerance:
            keep[at] = True
            stack += [(i, at), (at, j)]
    return [p for p, k in zip(points, keep) if k]


def _segment_grid(lines: list[list[Point]], cell: float) -> dict[tuple[int, int], list[tuple[Point, Point]]]:
    grid: dict[tuple[int, int], list[tuple[Point, Point]]] = {}
    for t in lines:
        for a, c in zip(t, t[1:]):
            for gx in range(int(min(a[0], c[0]) // cell) - 1, int(max(a[0], c[0]) // cell) + 2):
                for gz in range(int(min(a[1], c[1]) // cell) - 1, int(max(a[1], c[1]) // cell) + 2):
                    grid.setdefault((gx, gz), []).append((a, c))
    return grid


def _foot(p: Point, a: Point, c: Point) -> tuple[Point, float]:
    sx, sz = c[0] - a[0], c[1] - a[1]
    l2 = sx * sx + sz * sz
    t = max(0.0, min(1.0, ((p[0] - a[0]) * sx + (p[1] - a[1]) * sz) / l2)) if l2 > 0 else 0.0
    f = (a[0] + sx * t, a[1] + sz * t)
    return f, math.hypot(f[0] - p[0], f[1] - p[1])


def keep_left(points: list[Point], earlier: list[list[float]], tracks: list[list[Point]]) -> tuple[list[Point], list[list[Point]]]:
    """Where this line runs on the same centre line as an earlier line in the other direction (OSM
    relations often list one track for both directions, the return services of G-461 run their
    relation backwards, and some double lines are mapped as one way), its points move onto the drawn
    track on its left (`LEFT_TRACK`; Indian double lines run on the left). Where no track is drawn
    there, the line runs SECOND_TRACK metres to its left on an estimated second track, which is
    returned to be drawn. Each change of track is eased over SWITCH_EASE metres.
    Returns the points and the estimated tracks."""
    cell = 50.0
    track_grid = _segment_grid(tracks, cell)
    other_grid = _segment_grid([RailPath.from_flat(flat).points for flat in earlier], cell)
    path = RailPath(points)
    dense: list[Point] = []
    s = 0.0
    while s < path.length:
        dense.append(path.at(s)[:2])
        s += 20.0
    dense.append(points[-1])
    out: list[Point] = []
    state: list[int] = []  # 0 as mapped, 1 on the mapped left track, 2 on the estimated second track
    for i, p in enumerate(dense):
        q = dense[i + 1] if i + 1 < len(dense) else p
        r = dense[i - 1] if i > 0 else p
        dx, dz = q[0] - r[0], q[1] - r[1]
        n = math.hypot(dx, dz) or 1.0
        dx, dz = dx / n, dz / n
        key = (int(p[0] // cell), int(p[1] // cell))
        head_on = False
        for a, c in other_grid.get(key, []):
            _, d = _foot(p, a, c)
            if d < 2.0:
                sx, sz = c[0] - a[0], c[1] - a[1]
                if (sx * dx + sz * dz) / (math.hypot(sx, sz) or 1.0) < -0.5:
                    head_on = True
                    break
        if not head_on:
            out.append(p)
            state.append(0)
            continue
        best: Optional[Point] = None
        best_d = math.inf
        for a, c in track_grid.get(key, []):
            f, d = _foot(p, a, c)
            sx, sz = c[0] - a[0], c[1] - a[1]
            side = (f[0] - p[0]) * dz - (f[1] - p[1]) * dx  # > 0: left of the travel direction
            parallel = abs(sx * dx + sz * dz) / (math.hypot(sx, sz) or 1.0) > 0.9
            if LEFT_TRACK[0] <= d <= LEFT_TRACK[1] and side > 0 and parallel and d < best_d:
                best_d, best = d, f
        if best is not None:
            out.append(best)
            state.append(1)
        else:
            out.append((p[0] + dz * SECOND_TRACK, p[1] - dx * SECOND_TRACK))
            state.append(2)
    if not any(state):
        return points, []
    smooth = simplify_line(_smooth_switches(out, [state[i] != state[i + 1] for i in range(len(out) - 1)]), 0.3)
    # The estimated second track: each run of points on it (eased ends included), as drawn track.
    estimated: list[list[Point]] = []
    run: list[Point] = []
    for i, p in enumerate(out):
        if state[i] == 2:
            run.append(p)
        elif run:
            if len(run) >= 3:
                estimated.append(run)
            run = []
    if len(run) >= 3:
        estimated.append(run)
    return smooth, [simplify_line(r, 0.3) for r in estimated]
def _elevated(tags: dict[str, str]) -> bool:
    return tags.get("bridge") in ("viaduct", "yes") or _layer(tags) >= 1


def _layer(tags: dict[str, str]) -> int:
    try:
        return int(tags.get("layer", "0"))
    except ValueError:
        return 0


def _tunnel(tags: dict[str, str]) -> bool:
    return tags.get("tunnel") in ("yes", "building_passage", "culvert") or _layer(tags) <= -1


# Godot addition (G-462): rail top above (below) the ground on elevated (underground) lines, the
# ramps' grade, per system (all estimated: OSM maps `bridge`, `tunnel` and `layer`, not heights).
METRO_VIADUCT_HEIGHT = 12.0
METRO_TUNNEL_DEPTH = -16.0
METRO_GRADE = 1.0 / 30.0
GRADES: dict[str, tuple[float, float, float]] = {
    "mrts": (VIADUCT_HEIGHT, 0.0, VIADUCT_GRADE),
    "metro": (METRO_VIADUCT_HEIGHT, METRO_TUNNEL_DEPTH, METRO_GRADE),
}


def viaduct_heights(points: list[Point], stops: list[float], member_ways: list[dict[str, Any]], local: dict[int, Point],
                    up_height: float = VIADUCT_HEIGHT, down_depth: float = 0.0, grade: float = VIADUCT_GRADE) -> tuple[list[Point], list[float]]:
    """Rail-top height above the ground along an elevated line (estimated, G-323, G-462).

    A point lies on the viaduct when the nearest member way is tagged as a bridge or above
    ground (`bridge=viaduct|yes`, `layer>=1`); runs on it stand at `up_height`. With a
    `down_depth` (the Metro), a point whose nearest way is a tunnel (`tunnel=yes`, `layer<=-1`)
    lies that far below the ground. Platforms are level: points are added at each platform's
    ends (on the line, so distances along it do not change) and the platform stands at the
    viaduct's height if any of it is up, else in the tunnel if any of it is down, else on the
    ground. Elsewhere the line ramps to the ground at `grade`. Returns the points (with the added
    ones) and a height per point."""
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
    flagged: list[tuple[list[Point], int]] = []
    for w in member_ways:
        tags = w.get("tags", {})
        level = 1 if _elevated(tags) else (-1 if down_depth < 0 and _tunnel(tags) else 0)
        flagged.append(([local[n] for n in w["nodes"] if n in local], level))
    where: list[int] = []
    for p in dense:
        best, flag = math.inf, 0
        for line, level in flagged:
            if len(line) < 2:
                continue
            d = distance_to_polyline(p, line)
            if d < best:
                best, flag = d, level
        where.append(flag)
    n = len(dense)
    # The viaduct (tunnel) height falls (rises) away from every tagged point at the grade: the
    # upper (lower) envelope of those ramps, so ramps run onto the untagged ground beside them.
    up = [up_height if w > 0 else 0.0 for w in where]
    down = [down_depth if w < 0 else 0.0 for w in where]
    for i in range(1, n):
        run = along[i] - along[i - 1]
        up[i] = max(up[i], up[i - 1] - run * grade)
        down[i] = min(down[i], down[i - 1] + run * grade)
    for i in range(n - 2, -1, -1):
        run = along[i + 1] - along[i]
        up[i] = max(up[i], up[i + 1] - run * grade)
        down[i] = min(down[i], down[i + 1] + run * grade)
    heights = [up[i] + down[i] for i in range(n)]
    # Platforms are level: on the viaduct if any of the platform is, else in the tunnel if any of
    # it is, else on the ground; they stay fixed while the rest is brought within the grade.
    fixed = [False] * n
    for st in stops:
        span = [i for i in range(n) if st - half - 0.1 <= along[i] <= st + half + 0.1]
        if any(where[i] > 0 for i in span):
            level = up_height
        elif any(where[i] < 0 for i in span):
            level = down_depth
        else:
            level = 0.0
        for i in span:
            heights[i] = level
            fixed[i] = True
    # Where a viaduct meets a tunnel with little ground between, or a platform sits by a ramp, walk
    # the line both ways until no step is steeper than the grade (platforms do not move).
    for _ in range(64):
        steep = False
        for order in (range(1, n), range(n - 2, -1, -1)):
            for i in order:
                j = i - 1 if order.step > 0 else i + 1
                if fixed[i]:
                    continue
                run = abs(along[i] - along[j])
                lo, hi = heights[j] - run * grade, heights[j] + run * grade
                if heights[i] < lo - 1e-6 or heights[i] > hi + 1e-6:
                    heights[i] = min(hi, max(lo, heights[i]))
                    steep = True
        if not steep:
            break
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
GODOT_NAMES: dict[str, tuple[str, str]] = {**NAMES, "சென்னை பூங்கா நகர்": ("Park Town", "சென்னை பூங்கா நகர்"), "சென்னை கோட்டை": ("Chennai Fort", "சென்னை கோட்டை"),
                                           "Chengalpatttu Junction": ("Chengalpattu Junction", "செங்கல்பட்டு சந்திப்பு")}
# G-462: Chennai Metro stations whose OSM `name` is in Tamil only: their English names (the
# stations' public names), the Tamil kept as mapped. Also the Metro's own short names.
METRO_NAMES: dict[str, tuple[str, str]] = {
    "ஆயிரம் விளக்கு": ("Thousand Lights", "ஆயிரம் விளக்கு"),
    "எல் ஐ சி": ("LIC", "எல் ஐ சி"),
    "அரசினர் தோட்டம்": ("Government Estate", "அரசினர் தோட்டம்"),
    "தேனாம்பேட்டை": ("Teynampet", "தேனாம்பேட்டை"),
    "நந்தனம்": ("Nandanam", "நந்தனம்"),
    "சைதாப்பேட்டை": ("Saidapet Metro", "சைதாப்பேட்டை"),
    "சின்னமலை": ("Little Mount", "சின்னமலை"),
    "கிண்டி": ("Guindy Metro", "கிண்டி"),
    "ஏ ஜி டி.எம்.எஸ்": ("AG-DMS", "ஏ ஜி டி.எம்.எஸ்"),
    "சுங்கச்சாவடி": ("Toll Gate", "சுங்கச்சாவடி"),
    "புது வண்ணாரப்பேட்டை": ("New Washermanpet", "புது வண்ணாரப்பேட்டை"),
    "CMBT": ("CMBT", "சென்னை புறநகர் பேருந்து நிலையம்"),
}
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
    LineSpec("central-arakkonam", 1289122, "Chennai Central – Arakkonam", "Chennai Central", "Arakkonam", 15, 5, "suburban", "emu_ac"),
    LineSpec("central-sullurpeta", 21812015, "Chennai Beach – Sullurpeta", "Chennai Central", "Sullurpeta", 15, 12, "suburban", "emu"),
    LineSpec("coromandel-out", 11298772, "Coromandel Express: Chennai – Howrah", "Chennai Central", "Howrah", 120, 10, "express", "express"),
    LineSpec("coromandel-in", 11299100, "Coromandel Express: Howrah – Chennai", "Howrah", "Chennai Central", 120, 40, "express", "express"),
    LineSpec("charminar-out", 11219499, "Charminar Express: Chennai – Hyderabad", "Chennai Central", "Hyderabad", 120, 25, "express", "express"),
    LineSpec("charminar-in", 11219500, "Charminar Express: Hyderabad – Chennai", "Hyderabad", "Chennai Central", 120, 55, "express", "express"),
    LineSpec("shatabdi-out", 11300238, "Shatabdi Express: Chennai – Mysuru", "Chennai Central", "Mysuru", 120, 33, "express", "express"),
    LineSpec("shatabdi-in", 11300237, "Shatabdi Express: Mysuru – Chennai", "Mysuru", "Chennai Central", 120, 63, "express", "express"),
    LineSpec("rajdhani-out", 13012799, "Rajdhani Express: Chennai – Hazrat Nizamuddin", "Chennai Central", "Hazrat Nizamuddin", 120, 78, "express", "express"),
    LineSpec("saptagiri-out", 17666362, "Saptagiri Express: Chennai – Tirupati", "Chennai Central", "Tirupati", 120, 93, "express", "express"),
    # G-461: past the old map edge, from the regional extract. OSM maps these three services one
    # way only; the return service runs the same track and stops the other way (estimated).
    # Headways are the transit data's estimates for these lines (world/TRANSIT.md: 15 min).
    LineSpec("tambaram-chengalpattu", 1289048, "Tambaram – Chengalpattu", "Tambaram", "Chengalpattu", 15, 4, "suburban", "emu"),
    LineSpec("chengalpattu-tambaram", 1289048, "Chengalpattu – Tambaram", "Chengalpattu", "Tambaram", 15, 11, "suburban", "emu", reverse=True),
    LineSpec("arakkonam-central", 1289122, "Arakkonam – Chennai Central", "Arakkonam", "Chennai Central", 15, 9, "suburban", "emu_ac", reverse=True),
    LineSpec("sullurpeta-central", 21812015, "Sullurpeta – Chennai Beach", "Sullurpeta", "Chennai Beach", 15, 2, "suburban", "emu", reverse=True),
    # G-462: Chennai Metro, Blue and Green lines both ways (OSM `route=subway`).
    LineSpec("metro-blue-north", 7845610, "Metro Blue Line: Airport – Wimco Nagar", "Chennai International Airport", "Wimco Nagar Depot", 8, 0, "metro", "metro"),
    LineSpec("metro-blue-south", 8037595, "Metro Blue Line: Wimco Nagar – Airport", "Wimco Nagar Depot", "Chennai International Airport", 8, 4, "metro", "metro"),
    LineSpec("metro-green-north", 7845612, "Metro Green Line: St. Thomas Mount – Central", "St. Thomas Mount", "Chennai Central", 8, 2, "metro", "metro"),
    LineSpec("metro-green-south", 8037605, "Metro Green Line: Central – St. Thomas Mount", "Chennai Central", "St. Thomas Mount", 8, 6, "metro", "metro"),
]
# Which Metro line a line id belongs to, and its colour on the maps (the lines' public names; the
# colours are the plain colours of those names, no operator mark). G-463.
METRO_LINES = {"metro-blue-north": "blue", "metro-blue-south": "blue", "metro-green-north": "green", "metro-green-south": "green"}
# How each train type runs (estimated, like motion.ts's EMU_MOTION; G-322). `terminusDwell`: seconds
# a train stands at a terminus on the map before leaving it, or after arriving before it is
# taken out of service.
MOTION: dict[str, dict[str, float]] = {
    "emu": {"accel": 0.8, "brake": 0.9, "topSpeed": 22, "dwell": 30, "terminusDwell": 120},
    "emu_ac": {"accel": 0.8, "brake": 0.9, "topSpeed": 22, "dwell": 30, "terminusDwell": 120},
    "express": {"accel": 0.4, "brake": 0.6, "topSpeed": 25, "dwell": 30, "terminusDwell": 150},
    # G-462: a Metro set (estimated): brisker, 80 km/h, 20 s at a station.
    "metro": {"accel": 1.0, "brake": 1.0, "topSpeed": 22, "dwell": 20, "terminusDwell": 120},
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


def _height(line: dict[str, Any], path: RailPath, s: float) -> float:
    h = line.get("heights")
    if not h:
        return 0.0
    i = path._segment(max(0.0, min(path.length, s)))
    return h[i]


def _positions(line: dict[str, Any], path: RailPath, profile: RunProfile, offset: float, clock: float) -> list[tuple[float, float, float, float]]:
    """Centres of the line's trains at `clock` (as RailLine.trains), over one cycle: x, z, yaw and
    the rail-top height."""
    out: list[tuple[float, float, float, float]] = []
    headway = line["headwayMinutes"] * 60
    first = math.ceil((clock - offset - profile.duration) / headway)
    last = math.floor((clock - offset) / headway)
    for k in range(first, last + 1):
        t = clock - (offset + k * headway)
        if 0 <= t <= profile.duration:
            s = profile.s_at(t)
            x, z, yaw, _ = path.at(s)
            out.append((x, z, yaw, _height(line, path, s)))
    return out


def _shared(a: tuple[float, float, float, float], line_b: dict[str, Any], pb: RailPath) -> bool:
    """Is a train at `a` on line b's track: within 2 m of it, running along it (not across it at a
    crossing or a flyover) and at its height (G-461)."""
    s, _, d = pb.project((a[0], a[1]))
    if d >= 2.0:
        return False
    _, _, yaw, _ = pb.at(s)
    if abs(math.cos(yaw - a[2])) < 0.9:
        return False
    return abs(_height(line_b, pb, s) - a[3]) < 3.0


def conflicts(lines: list[dict[str, Any]], step: float = 4.0) -> list[tuple[str, str, float]]:
    """Pairs of trains of different lines on shared track (`_shared`), closer than CONFLICT_GAP,
    over a cycle."""
    data = [(l, RailPath.from_flat(l["points"]), profile_of(l)) for l in lines]
    out: list[tuple[str, str, float]] = []
    clock = 0.0
    while clock < CYCLE:
        at = [(l, p, _positions(l, p, pr, l["offsetMinutes"] * 60, clock + 6 * 3600)) for l, p, pr in data]
        for i, (la, pa, xa) in enumerate(at):
            for lb, pb, xb in at[i + 1:]:
                for a in xa:
                    for b in xb:
                        if math.hypot(a[0] - b[0], a[1] - b[1]) < CONFLICT_GAP and (_shared(a, lb, pb) or _shared(b, la, pa)):
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
            if not conflicts(lines[: i + 1], 4.0):
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
    "Shenoy Nagar": "செனாய் நகர்",
    "Urappakkam": "ஊரப்பாக்கம்",
    "Potheri": "பொத்தேரி",
    "Elavur": "எளாவூர்",
    "Arambakkam": "ஆரம்பாக்கம்",
    "Veppampattu": "வேப்பம்பட்டு",
    "Sevvapet Road": "செவ்வாப்பேட்டை சாலை",
    "Perambur Carriage Works": "பெரம்பூர் கேரேஜ் வொர்க்ஸ்",
    "Perambur Loco Works": "பெரம்பூர் லோகோ வொர்க்ஸ்",
    "V.O.C. Nagar": "வ.உ.சி. நகர்",
    "Wimco Nagar": "விம்கோ நகர்",
    "Anuppambattu": "அனுப்பம்பட்டு",
    "Gummidipundi": "கும்மிடிப்பூண்டி",
    "Nemilicherry": "நெமிலிச்சேரி",
    "Kattangulathur": "காட்டாங்குளத்தூர்",
    "Tiruninravur": "திருநின்றவூர்",
    "Perungalattur": "பெருங்களத்தூர்",
    "Kilambakkam": "கிளாம்பாக்கம்",
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


def world_bounds() -> Bounds:
    """The Godot world's box (`world/world.json` bounds) shrunk by BOX_INSET (G-461)."""
    b = json.loads(WORLD.read_text(encoding="utf-8"))["bounds"]
    return Bounds(b["minX"] + BOX_INSET, b["maxX"] - BOX_INSET, b["minZ"] + BOX_INSET, b["maxZ"] - BOX_INSET)


def load_regional() -> dict[str, Any]:
    with gzip.open(REGIONAL, "rt", encoding="utf-8") as f:
        return json.load(f)


def threejs_bounds() -> Bounds:
    b = json.loads(THREEJS_INDEX.read_text(encoding="utf-8"))["bounds"]
    return Bounds(b["minX"], b["maxX"], b["minZ"], b["maxZ"])


def build_threejs(extract: dict[str, Any]) -> dict[str, Any]:
    return build_rail(extract, BuildOptions(threejs_bounds(), THREEJS_LINES, NAMES, HINDI, 150, threejs_skip))


def build_godot(extract: dict[str, Any]) -> dict[str, Any]:
    """The Godot file from the regional extract (`load_regional()`), over the whole world (G-460)."""
    names = {**GODOT_NAMES, **METRO_NAMES}
    out = build_rail(extract, BuildOptions(world_bounds(), GODOT_LINES, names, HINDI, 150, godot_skip, TAMIL_ESTIMATED, heights=True, crossings=True, regional=True))
    # Lines that end up with no stop on the map are dropped (nothing to board or show), and said so.
    out["lines"] = [line for line in out["lines"] if line["stops"]]
    specs = {spec.id: spec for spec in GODOT_LINES}
    for line in out["lines"]:
        line["motion"] = MOTION[specs[line["id"]].train]
        if line["id"] in METRO_LINES:
            line["metroLine"] = METRO_LINES[line["id"]]
    timetable(out["lines"], len(THREEJS_LINES))
    out["format"] = "rail-godot-2"
    out["note"] = ("Built by godot-chennai/tools/rail/build_rail.py (a port of packages/rail/src/build.ts) from the railway part "
                   "of the regional OSM extract (data/rail/regional-rail.osm.json.gz). Platforms, headways, viaduct and tunnel "
                   "heights, return services and train motion are estimated; Tamil names not in OSM need native review.")
    return out


def dumps(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def report(data: dict[str, Any]) -> str:
    estimated = sum(1 for t in data["tracks"] if t.get("estimated"))
    rows = ["# Railway coverage", "",
            "Built by `tools/rail/build_rail.py` (G-320, G-460) from the railway part of the regional OSM extract "
            "(`data/rail/regional-rail.osm.json.gz`, made by `tools/rail/extract_rail.py` from `data/raw/world.osm.pbf`). "
            f"{data['attribution']}, ODbL 1.0. Headways, platforms, viaduct and tunnel heights, the return services and "
            "the second tracks of lines OSM maps as one way are **estimates**; Tamil names marked * are transliterations "
            "that **need native review**; Metro station names marked + are English names given for stations OSM names in "
            "Tamil only.", "",
            f"Tracks drawn: {len(data['tracks'])} ({sum(1 for t in data['tracks'] if t['kind'] == 'main')} running lines, "
            f"{estimated} estimated second-track runs). Stations: {len(data['stations'])}. Level crossings: "
            f"{len(data.get('crossings', []))} ({sum(1 for c in data.get('crossings', []) if c['lines'])} on a timetabled line).", "",
            "| Line | System | Train | Every (min, est.) | From | To | Stops in the world |", "|---|---|---|---|---|---|---|"]
    metro_english = {v[0] for v in METRO_NAMES.values()}
    for line in data["lines"]:
        f = line["from"]["name"] + (" (beyond the map)" if line["from"]["beyond"] else "")
        t = line["to"]["name"] + (" (beyond the map)" if line["to"]["beyond"] else "")
        stops = ", ".join(s["name"] + ("*" if s["name"] in TAMIL_ESTIMATED else "") + ("+" if s["name"] in metro_english else "") for s in line["stops"])
        rows.append(f"| {line['name']} | {line.get('system', '')} | {line.get('train', '')} | {line['headwayMinutes']:g} | {f} | {t} | {stops} |")
    rows += ["", "Not included: the Metro's Yellow Line, Inter-Corridor Line and lines under construction (the owner asked for Blue "
             "and Green), the Chengalpattu - Arakkonam line (it leaves the world west of Chengalpattu), and the stretch "
             "Tambaram - Vandalur of the Chengalpattu line (its relation maps track from Vandalur; Tambaram is the Beach "
             "line's terminus). Metro tunnels are in the timetable but not drawn; their stations have no platform on the map.", ""]
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
    data = build_godot(load_regional())
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
