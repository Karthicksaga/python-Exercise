"""Transit data (decisions G-210..G-213): bus stops, bus stations, bus routes snapped to the game's
road graph, railway stations and which lines call at them. OpenStreetMap is the only source.

What it reads:
- The OSM extract (`data/raw/world.osm.pbf`): `highway=bus_stop` and `public_transport=platform`
  with `bus=yes` (stops), `amenity=bus_station` (bus stations and terminals), `railway=station`
  and `railway=halt` (stations; `station=subway` is the Metro, the MRTS by its network or name),
  route relations `type=route`, `route=bus` (ref, name, from, to; ordered stop and way members;
  the operator is read but never written: no operator branding, TD-18) and `route=train|subway|
  light_rail` (which stations each line calls at).
- The built world (`world/`): every tile's `roads.bin` (the pieces the game drives on) and
  `infra.bin` decks (format 2.1), so a route is a run of the game's own road points.

What it writes (format 2 addition, transit version 1; no 2.x file changes):
- `world/transit/transit.json`: stops, bus stations, railway stations, lines, routes with their
  stops, snap status and estimated headways.
- `world/transit/routes.bin` ("COWT"): each usable route's path as road points (exactly the
  points of `roads.bin`, so they are the nodes of the game's `RoadGraph`) and where each stop lies
  on it.
- `world/TRANSIT.md`: the coverage report.

Snapping (G-211). A route's path is a chain of legs, one per pair of consecutive stops; each leg is
the cheapest path over the drivable graph (`AiArea.vehicle_road`: no footways or service roads;
one-way streets respected) from the stop's road edge to the next one's, where edges on the route's
mapped way members cost 1 per metre and others `OFF_ROUTE_COST`: the mapped ways first, any road
as the fallback (A*, so it stays fast). Each stop sits on the nearest drivable edge within
`STOP_REACH`, preferring the route's ways and the left of the direction of travel (India keeps
left; stops are on the left kerb).

Status per route: `clean` (every leg found, on mapped ways for at least `CLEAN_SHARE` of its length,
no leg more than `DETOUR` times the straight line), `fallback` (every leg found but some leave the
mapped ways or detour), `broken` (some legs could not be found: the longest run of good legs with
at least 3 stops is kept and drivable), `unusable` (fewer than 2 stops, or no run of 3 stops).
Routes mapped with ways but (almost) no stop members get their stops **inferred**: mapped stops
within `INFER_REACH` of the ways on the left side, in order along them (flagged `inferred`).
"""
from __future__ import annotations

import heapq
import json
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import codec_v2
from .binio import Reader, Writer
from .geometry import Point
from .infra import decode_infra
from .projection import PROJECTION, GeoProjection
from .util import hash01, js_round

TRANSIT_MAGIC = 0x54574F43  # "COWT"
FORMAT = 2
VERSION = 1
Q = 20
STOP_REACH = 35.0
INFER_REACH = 22.0
OFF_ROUTE_COST = 2.5
CLEAN_SHARE = 0.8
DETOUR = 3.0
DETOUR_EXTRA = 900.0
CLEAN_DETOUR = 1.8
CANDIDATES = 3
REORDER_REACH = 60.0
MIN_RUN = 3
MERGE_PLATFORM = 15.0
DEDUPE_ALONG = 45.0
CELL = 50.0
NOT_DRIVEN = {"footway", "service"}
# Stations: suburban trains, the MRTS and the Metro; long-distance express routes are not lines.
STATION_SEARCH = 350.0
PLATFORM_REACH = 300.0
ENTRANCE_REACH = 250.0
# Estimated service (no published timetable is used): minutes between buses or trains, hours.
BUS_HEADWAY = 15
MINIBUS_HEADWAY = 25
LONG_ROUTE_HEADWAY = 20
BUS_HOURS = (5.0, 23.0)
LINE_HEADWAY = {"suburban": 15, "mrts": 15, "metro": 8}
LINE_HOURS = {"suburban": (4.0, 23.5), "mrts": (5.0, 22.5), "metro": (5.0, 23.0)}
BEACH_TAMBARAM_HEADWAY = 8  # as rail.json's `headwayMinutes` (the Three.js line)
# The first set: routes that use these roads (names or refs in roads.bin), Kathipara or the
# Adyar and Cooum bridges.
MAJOR_ROADS: dict[str, re.Pattern[str]] = {
    "Anna Salai (Mount Road)": re.compile(r"anna salai|mount road", re.I),
    "GST Road": re.compile(r"grand southern trunk|\bgst\b|g\.s\.t", re.I),
    "OMR (Rajiv Gandhi Salai)": re.compile(r"old mahabalipuram|rajiv gandhi salai|\bomr\b", re.I),
    "ECR": re.compile(r"east coast road|\becr\b", re.I),
    "Poonamallee High Road": re.compile(r"poonamallee high|periyar e\.? ?v\.? ?r\.? (high )?road|\bevr\b", re.I),
}
KATHIPARA = (-700.0, 8620.0)
KATHIPARA_REACH = 350.0
BRIDGE_RIVERS = re.compile(r"adyar|adayar|cooum|koovam", re.I)
FIRST_SET = 40

Tags = dict[str, str]


@dataclass
class Stop:
    key: str  # "n<id>" or "w<id>"
    x: float
    z: float
    name: str = ""
    name_ta: str = ""
    ref: str = ""
    kind: str = "pole"  # pole (highway=bus_stop), platform, position (stop_position), station


@dataclass
class Station:
    key: str
    x: float
    z: float
    name: str
    name_ta: str
    system: str  # suburban, mrts, metro (railway stations) or bus (bus stations)
    lines: list[str] = field(default_factory=list)
    platforms: list[tuple[str, float, float, float]] = field(default_factory=list)  # (ref, x, z, length)
    entrances: list[tuple[float, float, str]] = field(default_factory=list)


@dataclass
class RouteRel:
    id: int
    ref: str
    name: str
    from_: str
    to: str
    to_ta: str
    interval: str
    stop_members: list[tuple[str, str]] = field(default_factory=list)  # (key, role)
    way_members: list[int] = field(default_factory=list)


@dataclass
class RailRel:
    id: int
    route: str
    ref: str
    name: str
    network: str
    members: list[str] = field(default_factory=list)  # stop/platform member keys, in order


@dataclass
class TransitOsm:
    stops: dict[str, Stop] = field(default_factory=dict)
    member_points: dict[str, Stop] = field(default_factory=dict)  # every route member node/way
    bus_stations: list[Station] = field(default_factory=list)
    stations: list[Station] = field(default_factory=list)
    routes: list[RouteRel] = field(default_factory=list)
    rail: list[RailRel] = field(default_factory=list)
    way_nodes: dict[int, list[Point]] = field(default_factory=dict)  # route member ways
    platforms: list[tuple[str, float, float, float]] = field(default_factory=list)  # railway platforms
    entrances: list[tuple[float, float, str]] = field(default_factory=list)  # station entrances
    stats: Counter[str] = field(default_factory=Counter)


def _name(t: Tags) -> str:
    return t.get("name:en") or t.get("name") or ""


def _is_tamil(s: str) -> bool:
    return any("஀" <= ch <= "௿" for ch in s)


def _name_ta(t: Tags) -> str:
    ta = t.get("name:ta", "")
    if not ta and _is_tamil(t.get("name", "")):
        ta = t["name"]
    return ta


def _english(t: Tags) -> str:
    """English name; "" when OSM has only Tamil (the sign then shows the Tamil alone)."""
    n = _name(t)
    return "" if _is_tamil(n) else n


def is_stop(t: Tags) -> bool:
    if t.get("highway") == "bus_stop":
        return True
    return t.get("public_transport") == "platform" and (t.get("bus") == "yes" or t.get("highway") == "bus_stop") and t.get("railway") != "platform" and t.get("train") != "yes"


def is_rail_platform(t: Tags) -> bool:
    return t.get("railway") == "platform" or (t.get("public_transport") == "platform" and (t.get("train") == "yes" or t.get("subway") == "yes" or t.get("light_rail") == "yes"))


def station_system(t: Tags) -> str | None:
    """suburban / mrts / metro for a railway station, None otherwise."""
    if t.get("railway") not in ("station", "halt") and not (t.get("public_transport") == "station" and (t.get("train") == "yes" or t.get("subway") == "yes" or t.get("light_rail") == "yes")):
        return None
    if t.get("station") == "subway" or t.get("subway") == "yes" or "metro" in t.get("network", "").lower():
        return "metro"
    if t.get("station") == "light_rail" or "mrts" in (t.get("network", "") + " " + t.get("operator", "")).lower():
        return "mrts"
    return "suburban"


def parse_transit(path: Path, projection: GeoProjection = PROJECTION) -> TransitOsm:
    import osmium  # noqa: PLC0415 (build time only)

    out = TransitOsm()

    def local(lat: float, lon: float) -> Point:
        x, z = projection.to_local(round(lat, 7), round(lon, 7))
        return (round(x, 2), round(z, 2))

    class Relations(osmium.SimpleHandler):  # type: ignore[misc]
        def relation(self, r: Any) -> None:
            t = {k.k: k.v for k in r.tags}
            if t.get("type") != "route":
                return
            if t.get("route") == "bus":
                rr = RouteRel(r.id, (t.get("ref") or "").replace(" ", ""), t.get("name", ""), t.get("from", ""), t.get("to", ""), t.get("to:ta", ""), t.get("interval", ""))
                for m in r.members:
                    if m.type in ("n", "w") and (m.role.startswith("stop") or m.role.startswith("platform")):
                        rr.stop_members.append((f"{m.type}{m.ref}", m.role))
                    if m.type == "w" and m.role in ("", "forward", "backward"):
                        rr.way_members.append(m.ref)
                out.routes.append(rr)
            elif t.get("route") in ("train", "subway", "light_rail"):
                rl = RailRel(r.id, t["route"], t.get("ref", ""), t.get("name", ""), t.get("network", ""))
                for m in r.members:
                    if m.type in ("n", "w") and (m.role.startswith("stop") or m.role.startswith("platform")):
                        rl.members.append(f"{m.type}{m.ref}")
                out.rail.append(rl)

    Relations().apply_file(str(path))
    wanted_nodes = {k for r in out.routes for k, _ in r.stop_members if k[0] == "n"} | {k for r in out.rail for k in r.members if k[0] == "n"}
    wanted_ways = {k for r in out.routes for k, _ in r.stop_members if k[0] == "w"} | {k for r in out.rail for k in r.members if k[0] == "w"}
    route_ways = {w for r in out.routes for w in r.way_members}

    class Points(osmium.SimpleHandler):  # type: ignore[misc]
        def node(self, n: Any) -> None:
            if not n.location.valid():
                return
            key = f"n{n.id}"
            t = {k.k: k.v for k in n.tags}
            if not t and key not in wanted_nodes:
                return
            x, z = local(n.location.lat, n.location.lon)
            self._point(key, t, x, z)

        def way(self, w: Any) -> None:
            key = f"w{w.id}"
            pts = [local(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
            if w.id in route_ways and len(pts) >= 2:
                out.way_nodes[w.id] = pts
            t = {k.k: k.v for k in w.tags}
            if pts and is_rail_platform(t):
                length = sum(math.dist(pts[i - 1], pts[i]) for i in range(1, len(pts)))
                ring = pts[:-1] if len(pts) > 2 and pts[0] == pts[-1] else pts
                out.platforms.append((t.get("ref", "") or t.get("name", ""), round(sum(p[0] for p in ring) / len(ring), 2), round(sum(p[1] for p in ring) / len(ring), 2), round(length, 1)))
            if not pts or not (key in wanted_ways or is_stop(t) or t.get("amenity") == "bus_station" or station_system(t)):
                return
            ring = pts[:-1] if len(pts) > 2 and pts[0] == pts[-1] else pts
            x = sum(p[0] for p in ring) / len(ring)
            z = sum(p[1] for p in ring) / len(ring)
            self._point(key, t, round(x, 2), round(z, 2))

        def _point(self, key: str, t: Tags, x: float, z: float) -> None:
            if key[0] == "n" and t.get("railway") in ("subway_entrance", "train_station_entrance"):
                out.entrances.append((x, z, t.get("ref", "") or _english(t)))
            if key[0] == "n" and is_rail_platform(t):
                out.platforms.append((t.get("ref", "") or t.get("name", ""), x, z, 0.0))
            if is_stop(t):
                kind = "pole" if t.get("highway") == "bus_stop" else "platform"
                out.stops[key] = Stop(key, x, z, _english(t), _name_ta(t), t.get("ref", ""), kind)
                out.stats["osm:" + kind] += 1
            if t.get("amenity") == "bus_station":
                out.bus_stations.append(Station(key, x, z, _english(t), _name_ta(t), "bus"))
            system = station_system(t)
            if system and (_name(t) or _name_ta(t)):
                out.stations.append(Station(key, x, z, _english(t), _name_ta(t), system))
            if key in wanted_nodes or key in wanted_ways:
                kind = "position" if t.get("public_transport") == "stop_position" else ("station" if system else "platform")
                out.member_points[key] = out.stops.get(key) or Stop(key, x, z, _english(t), _name_ta(t), t.get("ref", ""), kind)

    Points().apply_file(str(path), locations=True)
    out.stats["osm:bus_station"] = len(out.bus_stations)
    out.stats["osm:railway_station"] = len(out.stations)
    out.stats["osm:bus_route"] = len(out.routes)
    return out


# --- The road graph (the game's drive graph, from the built world) ---------------------------


@dataclass
class Edge:
    a: int
    b: int
    length: float
    way: int
    raised: bool
    road: str  # name or ref, for the first-set test
    bridge: bool


class DriveGraph:
    """Nodes are road points (exact 5 cm integers, as `RoadGraph` keys them to 10 cm)."""

    def __init__(self) -> None:
        self.index: dict[tuple[int, int], int] = {}
        self.pos: list[Point] = []
        self.out: list[list[int]] = []
        self.edges: list[Edge] = []
        self.grid: dict[tuple[int, int], list[int]] = {}

    def node(self, p: Point) -> int:
        key = (int(js_round(p[0] * Q)), int(js_round(p[1] * Q)))
        i = self.index.get(key)
        if i is None:
            i = len(self.pos)
            self.index[key] = i
            self.pos.append((key[0] / Q, key[1] / Q))
            self.out.append([])
        return i

    def add(self, a: int, b: int, way: int, raised: bool, road: str, bridge: bool) -> None:
        pa, pb = self.pos[a], self.pos[b]
        length = math.dist(pa, pb)
        if length < 0.5:
            return
        e = len(self.edges)
        self.edges.append(Edge(a, b, length, way, raised, road, bridge))
        self.out[a].append(e)
        x0, x1 = sorted((pa[0], pb[0]))
        z0, z1 = sorted((pa[1], pb[1]))
        for cx in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
            for cz in range(math.floor(z0 / CELL), math.floor(z1 / CELL) + 1):
                self.grid.setdefault((cx, cz), []).append(e)

    def near(self, p: Point, reach: float) -> list[tuple[float, float, int]]:
        """(distance, along, edge) for edges within reach of p, nearest first."""
        seen: set[int] = set()
        found: list[tuple[float, float, int]] = []
        r = math.ceil(reach / CELL)
        cx, cz = math.floor(p[0] / CELL), math.floor(p[1] / CELL)
        for i in range(cx - r, cx + r + 1):
            for k in range(cz - r, cz + r + 1):
                for e in self.grid.get((i, k), []):
                    if e in seen:
                        continue
                    seen.add(e)
                    d, s = project(p, self.pos[self.edges[e].a], self.pos[self.edges[e].b])
                    if d <= reach:
                        found.append((d, s, e))
        found.sort()
        return found


def project(p: Point, a: Point, b: Point) -> tuple[float, float]:
    """(distance from p to segment ab, distance along ab of the nearest point)."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dz * dz
    t = 0.0 if length2 < 1e-9 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2))
    q = (a[0] + dx * t, a[1] + dz * t)
    return math.dist(p, q), t * math.sqrt(length2)


def left_of(p: Point, a: Point, b: Point) -> float:
    """Metres p lies to the left of the direction a -> b (India keeps left: stops are there).
    In this frame (+X east, +Z south) the left of direction d is (d.z, -d.x), as `RoadGraph`."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dz) or 1.0
    return ((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / n


def load_graph(world: Path) -> DriveGraph:
    g = DriveGraph()
    index = json.loads((world / "world.json").read_text())
    for tc, tr, *_ in index["tiles"]:
        d = world / "tiles" / f"{tc}_{tr}"
        tj = json.loads((d / "tile.json").read_text())
        pieces = codec_v2.decode_roads((d / "roads.bin").read_bytes(), tj["roadNames"])
        raised: set[int] = set()
        if (d / "infra.bin").exists():
            for piece, hs in decode_infra((d / "infra.bin").read_bytes()).decks:
                if hs and max(hs) > 0.5:
                    raised.add(piece)
        for i, pc in enumerate(pieces):
            rd = pc.road
            if rd.kind in NOT_DRIVEN or len(rd.points) < 2:
                continue
            way = rd.source.id if rd.source else rd.id // 10
            label = " ".join(s for s in (rd.name, rd.ref) if s)
            nodes = [g.node(p) for p in rd.points]
            for k in range(len(nodes) - 1):
                if nodes[k] == nodes[k + 1]:
                    continue
                g.add(nodes[k], nodes[k + 1], way, i in raised, label, rd.bridge)
                if not rd.oneway:
                    g.add(nodes[k + 1], nodes[k], way, i in raised, label, rd.bridge)
    return g


# --- Snapping ---------------------------------------------------------------------------------


@dataclass
class Placed:
    """A stop on a directed edge: `along` metres from the edge's first node."""

    stop: int
    edge: int
    along: float


@dataclass
class Snapped:
    rel: RouteRel
    stops: list[int]  # indices into the stop table, as served
    inferred: bool
    status: str
    path: list[int] = field(default_factory=list)  # graph nodes
    placed: list[tuple[int, int, float]] = field(default_factory=list)  # (stop, path segment, along)
    legs: int = 0
    legs_ok: int = 0
    member_share: float = 0.0
    length: float = 0.0
    raised: float = 0.0
    majors: list[str] = field(default_factory=list)
    reason: str = ""


def place_stop(g: DriveGraph, p: Point, members: set[int], heading: Point | None = None) -> list[tuple[float, Placed]]:
    """Candidate edges for a stop, best first (score = metres plus penalties): on the route's
    ways, with the stop on the left, going the way the route goes (`heading`, from the stop
    before to the one after)."""
    out: list[tuple[float, Placed]] = []
    for d, s, e in g.near(p, STOP_REACH):
        ed = g.edges[e]
        side = left_of(p, g.pos[ed.a], g.pos[ed.b])
        score = d + (0.0 if not members or ed.way in members else 25.0) + (0.0 if side > -2.0 else 12.0)
        if heading is not None:
            pa, pb = g.pos[ed.a], g.pos[ed.b]
            dot = ((pb[0] - pa[0]) * heading[0] + (pb[1] - pa[1]) * heading[1]) / (ed.length or 1.0)
            score += 20.0 * (1.0 - dot) / 2.0
        out.append((score, Placed(-1, e, s)))
    out.sort(key=lambda c: c[0])
    # Keep one candidate per directed road (the nearest point of each).
    kept: list[tuple[float, Placed]] = []
    for c in out:
        if all(g.edges[k[1].edge].way != g.edges[c[1].edge].way or _same_way(g, k[1].edge, c[1].edge) is False for k in kept):
            kept.append(c)
        if len(kept) == CANDIDATES:
            break
    return kept


def _same_way(g: DriveGraph, e1: int, e2: int) -> bool:
    """True when two edges of one way run the same way (keep only the nearest of those)."""
    a, b = g.edges[e1], g.edges[e2]
    da = (g.pos[a.b][0] - g.pos[a.a][0], g.pos[a.b][1] - g.pos[a.a][1])
    db = (g.pos[b.b][0] - g.pos[b.a][0], g.pos[b.b][1] - g.pos[b.a][1])
    return da[0] * db[0] + da[1] * db[1] > 0.0


def leg_costs(g: DriveGraph, start: Placed, ends: list[Placed], members: set[int], limit: float) -> dict[int, tuple[float, float, list[int]]]:
    """From `start` (on its edge, going on) to every end reachable within `limit` (weighted
    metres): end index -> (weighted cost, metres driven, nodes from the start edge's end node to
    the end edge's first node; empty when the end is further along the start edge). A* towards the
    nearest end, carried on until every end is settled or the limit is passed."""
    out: dict[int, tuple[float, float, list[int]]] = {}
    se = g.edges[start.edge]
    targets: dict[int, list[int]] = {}
    for j, end in enumerate(ends):
        if end.edge == start.edge and end.along >= start.along:
            out[j] = (end.along - start.along, end.along - start.along, [])
        else:
            targets.setdefault(g.edges[end.edge].a, []).append(j)
    if not targets:
        return out
    goals = [g.pos[n] for n in targets]
    origin = se.b
    w0 = se.length - start.along
    cost: dict[int, float] = {origin: w0}
    metres: dict[int, float] = {origin: w0}
    back: dict[int, int] = {}

    def h(n: int) -> float:
        return min(math.dist(g.pos[n], q) for q in goals)

    openq: list[tuple[float, float, int]] = [(w0 + h(origin), w0, origin)]
    left = sum(len(v) for v in targets.values())
    while openq and left > 0:
        _, c, n = heapq.heappop(openq)
        if c > cost.get(n, math.inf) or c > limit:
            continue
        if n in targets:
            path = [n]
            while path[-1] != origin:
                path.append(back[path[-1]])
            path.reverse()
            for j in targets.pop(n):
                out[j] = (c + ends[j].along, metres[n] + ends[j].along, path)
                left -= 1
            if targets:
                goals = [g.pos[m] for m in targets]
        for e in g.out[n]:
            ed = g.edges[e]
            nc = c + ed.length * (1.0 if not members or ed.way in members else OFF_ROUTE_COST)
            if nc < cost.get(ed.b, math.inf):
                cost[ed.b] = nc
                metres[ed.b] = metres[n] + ed.length
                back[ed.b] = n
                heapq.heappush(openq, (nc + (h(ed.b) if targets else 0.0), nc, ed.b))
    return out


def route_line(rel: RouteRel, way_nodes: dict[int, list[Point]]) -> list[Point]:
    """The member ways chained end to end in relation order (each turned to meet the last; the
    first turned to meet the second)."""
    ways = [way_nodes[w] for w in rel.way_members if way_nodes.get(w)]
    if not ways:
        return []
    first = ways[0]
    if len(ways) > 1:
        nxt = ways[1]
        if min(math.dist(first[0], nxt[0]), math.dist(first[0], nxt[-1])) < min(math.dist(first[-1], nxt[0]), math.dist(first[-1], nxt[-1])):
            first = first[::-1]
    line: list[Point] = list(first)
    for pts in ways[1:]:
        if math.dist(pts[-1], line[-1]) < math.dist(pts[0], line[-1]):
            pts = pts[::-1]
        line.extend(pts[1:] if pts[0] == line[-1] else pts)
    return line


def infer_stops(line: list[Point], stops: list[Stop], grid: dict[tuple[int, int], list[int]]) -> list[int]:
    """Mapped stops near the route's ways, on the left, in order along them."""
    run = [0.0]
    for i in range(1, len(line)):
        run.append(run[-1] + math.dist(line[i - 1], line[i]))
    found: dict[int, float] = {}
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        x0, x1 = sorted((a[0], b[0]))
        z0, z1 = sorted((a[1], b[1]))
        for cx in range(math.floor((x0 - INFER_REACH) / CELL), math.floor((x1 + INFER_REACH) / CELL) + 1):
            for cz in range(math.floor((z0 - INFER_REACH) / CELL), math.floor((z1 + INFER_REACH) / CELL) + 1):
                for si in grid.get((cx, cz), []):
                    s = stops[si]
                    d, along = project((s.x, s.z), a, b)
                    if d <= INFER_REACH and left_of((s.x, s.z), a, b) > -3.0:
                        at = run[i] + along
                        if si not in found or at < found[si]:
                            found[si] = at
    ordered = sorted(found, key=lambda si: found[si])
    out: list[int] = []
    last = -math.inf
    for si in ordered:
        if found[si] - last >= DEDUPE_ALONG:
            out.append(si)
            last = found[si]
    return out


def order_along(line: list[Point], stops: list[int], table: list[Stop]) -> list[int] | None:
    """The stops sorted by where they lie along the route's way line, when every one is within
    REORDER_REACH of it; None otherwise."""
    run = [0.0]
    for i in range(1, len(line)):
        run.append(run[-1] + math.dist(line[i - 1], line[i]))
    at: list[tuple[float, int]] = []
    for k, si in enumerate(stops):
        p = (table[si].x, table[si].z)
        best = (math.inf, 0.0)
        for i in range(len(line) - 1):
            d, along = project(p, line[i], line[i + 1])
            if d < best[0]:
                best = (d, run[i] + along)
        if best[0] > REORDER_REACH:
            return None
        at.append((best[1], k))
    return [stops[k] for _, k in sorted(at)]


def straight_sum(stops: list[int], table: list[Stop]) -> float:
    return sum(math.hypot(table[a].x - table[b].x, table[a].z - table[b].z) for a, b in zip(stops, stops[1:]))


def snap_route(g: DriveGraph, rel: RouteRel, stops: list[int], table: list[Stop], inferred: bool) -> Snapped:
    """Stops to a drivable path: each stop gets up to CANDIDATES edges; the cheapest chain of
    candidates over the legs is chosen (Viterbi). A leg longer than `max(DETOUR x straight,
    straight + DETOUR_EXTRA)` counts as not found (a bus looping round blocks for one stop)."""
    members = set(rel.way_members)
    sn = Snapped(rel, stops, inferred, "unusable")
    sn.legs = max(0, len(stops) - 1)
    if len(stops) < 2:
        sn.reason = "fewer than 2 stops"
        return sn
    pts = [(table[s].x, table[s].z) for s in stops]
    cands: list[list[tuple[float, Placed]]] = []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        d = math.dist(a, b)
        cands.append(place_stop(g, p, members, ((b[0] - a[0]) / d, (b[1] - a[1]) / d) if d > 1.0 else None))
    # Viterbi over the runs of legs that can be driven.
    runs: list[list[tuple[int, list[int], Placed, Placed, float]]] = []
    best: list[float] = [c[0] for c in cands[0]]
    trace: list[list[tuple[int, list[int], float]]] = []  # per leg, per end candidate: (start cand, nodes, metres)
    run_start = 0

    def close(upto: int) -> None:
        # The run of legs run_start..upto-1 ends at stop `upto`: walk back the best chain.
        if upto <= run_start or not trace:
            return
        j = min(range(len(best)), key=lambda k: best[k])
        legs: list[tuple[int, list[int], Placed, Placed, float]] = []
        for li in range(upto - 1, run_start - 1, -1):
            si, nodes, metres = trace[li - run_start][j]
            legs.append((li, nodes, cands[li][si][1], cands[li + 1][j][1], metres))
            j = si
        legs.reverse()
        runs.append(legs)

    for i in range(len(stops) - 1):
        straight = math.dist(pts[i], pts[i + 1])
        cap = max(DETOUR * straight, straight + DETOUR_EXTRA)
        nxt = [math.inf] * len(cands[i + 1])
        step: list[tuple[int, list[int], float]] = [(-1, [], 0.0)] * len(cands[i + 1])
        ends = [c[1] for c in cands[i + 1]]
        for si, (_, start) in enumerate(cands[i]):
            if best[si] == math.inf:
                continue
            for j, (w, metres, nodes) in leg_costs(g, start, ends, members, cap * OFF_ROUTE_COST).items():
                if metres > cap:
                    continue
                total = best[si] + w + cands[i + 1][j][0]
                if total < nxt[j]:
                    nxt[j] = total
                    step[j] = (si, nodes, metres)
        if all(v == math.inf for v in nxt):
            close(i)
            run_start = i + 1
            trace = []
            best = [c[0] for c in cands[i + 1]]
            continue
        trace.append(step)
        best = nxt
    close(len(stops) - 1)
    sn.legs_ok = sum(len(r) for r in runs)
    if not runs:
        sn.reason = "no leg between stops could be found on the drivable roads"
        return sn
    chosen = max(runs, key=len)
    if len(chosen) + 1 < MIN_RUN:
        sn.reason = f"longest drivable run has {len(chosen) + 1} stops"
        return sn
    first = chosen[0][0]
    sn.stops = stops[first : first + len(chosen) + 1]
    # Path: the first stop's edge, then each leg's nodes and its end edge.
    start = chosen[0][2]
    path = [g.edges[start.edge].a, g.edges[start.edge].b]
    placed = [(sn.stops[0], 0, start.along)]
    detoured = False
    for k, (i, nodes, _st, end, metres) in enumerate(chosen):
        for n in nodes[1:]:
            path.append(n)
        if nodes:
            # nodes run from the last edge's end node to this end edge's first node.
            path.append(g.edges[end.edge].b)
        placed.append((sn.stops[k + 1], len(path) - 2, end.along))
        straight = math.dist(pts[i], pts[i + 1])
        if straight > 50.0 and metres > straight * CLEAN_DETOUR:
            detoured = True
    raised = 0.0
    on_members = 0.0
    total = 0.0
    majors: set[str] = set()
    for k in range(len(path) - 1):
        e = _edge(g, path[k], path[k + 1])
        if e is None:
            continue
        ed = g.edges[e]
        total += ed.length
        if not members or ed.way in members:
            on_members += ed.length
        if ed.raised:
            raised += ed.length
        for label, pattern in MAJOR_ROADS.items():
            if ed.road and pattern.search(ed.road):
                majors.add(label)
        if math.dist(g.pos[ed.a], KATHIPARA) < KATHIPARA_REACH:
            majors.add("Kathipara")
        if ed.bridge and ed.road and BRIDGE_RIVERS.search(ed.road):
            majors.add("Adyar or Cooum bridge")
    sn.path = path
    sn.placed = placed
    sn.length = total
    sn.raised = raised
    sn.member_share = on_members / total if total > 0 else 0.0
    sn.majors = sorted(majors)
    if len(chosen) < sn.legs:
        sn.status = "broken"
        sn.reason = f"{sn.legs - len(chosen)} of {sn.legs} legs dropped; kept {len(sn.stops)} stops in a row"
    elif detoured or (members and sn.member_share < CLEAN_SHARE):
        sn.status = "fallback"
        sn.reason = f"{round(sn.member_share * 100)} % on mapped ways" + ("; a leg detours" if detoured else "")
    else:
        sn.status = "clean"
    return sn


def _edge(g: DriveGraph, a: int, b: int) -> int | None:
    for e in g.out[a]:
        if g.edges[e].b == b:
            return e
    return None


def _path_length(g: DriveGraph, path: list[int], s0: int, a0: float, s1: int, a1: float) -> float:
    total = 0.0
    for k in range(s0, s1):
        total += math.dist(g.pos[path[k]], g.pos[path[k + 1]])
    return total - a0 + a1


def mark_bridges_by_water(g: DriveGraph, world: Path) -> None:
    """Bridge edges near a waterway named Adyar or Cooum count as those bridges (road names on
    bridges rarely say the river)."""
    index = json.loads((world / "world.json").read_text())
    rivers: list[Point] = []
    for tc, tr, *_ in index["tiles"]:
        f = world / "tiles" / f"{tc}_{tr}" / "infra.bin"
        if f.exists():
            for w in decode_infra(f.read_bytes()).waterways:
                if w.name and BRIDGE_RIVERS.search(w.name):
                    rivers.extend(w.points)
    cells: set[tuple[int, int]] = {(math.floor(p[0] / CELL), math.floor(p[1] / CELL)) for p in rivers}
    for ed in g.edges:
        if not ed.bridge:
            continue
        m = ((g.pos[ed.a][0] + g.pos[ed.b][0]) / 2, (g.pos[ed.a][1] + g.pos[ed.b][1]) / 2)
        c = (math.floor(m[0] / CELL), math.floor(m[1] / CELL))
        if any((c[0] + i, c[1] + k) in cells for i in (-1, 0, 1) for k in (-1, 0, 1)):
            ed.road = (ed.road + " Adyar or Cooum bridge").strip()


# --- Building the network ---------------------------------------------------------------------


def stop_table(osm: TransitOsm) -> tuple[list[Stop], dict[str, int]]:
    """Every stop once: poles, then platforms that are not beside a pole (within
    MERGE_PLATFORM: the same stop mapped twice), then route members that are neither."""
    table: list[Stop] = []
    index: dict[str, int] = {}
    grid: dict[tuple[int, int], list[int]] = {}

    def add(s: Stop) -> None:
        index[s.key] = len(table)
        grid.setdefault((math.floor(s.x / CELL), math.floor(s.z / CELL)), []).append(len(table))
        table.append(s)

    def near(s: Stop) -> int | None:
        best, bd = None, MERGE_PLATFORM
        for i in range(-1, 2):
            for k in range(-1, 2):
                for j in grid.get((math.floor(s.x / CELL) + i, math.floor(s.z / CELL) + k), []):
                    d = math.hypot(table[j].x - s.x, table[j].z - s.z)
                    if d < bd:
                        best, bd = j, d
        return best

    for s in sorted(osm.stops.values(), key=lambda s: (s.kind != "pole", s.key)):
        j = near(s) if s.kind != "pole" else None
        if j is None:
            add(s)
        else:
            index[s.key] = j
            t = table[j]
            t.name = t.name or s.name
            t.name_ta = t.name_ta or s.name_ta
            t.ref = t.ref or s.ref
    for key, s in sorted(osm.member_points.items()):
        if key in index or s.kind == "station":
            continue
        j = near(s)
        if j is None:
            add(Stop(s.key, s.x, s.z, s.name, s.name_ta, s.ref, s.kind))
        else:
            index[key] = j
    return table, index


def route_stops(rel: RouteRel, index: dict[str, int], table: list[Stop]) -> list[int]:
    out: list[int] = []
    for key, _role in rel.stop_members:
        i = index.get(key)
        if i is None:
            continue
        if out and (out[-1] == i or math.hypot(table[out[-1]].x - table[i].x, table[out[-1]].z - table[i].z) < MERGE_PLATFORM * 2):
            continue  # the stop position and platform of one stop
        out.append(i)
    return out


def headway(rel: RouteRel, length: float) -> int:
    m = re.fullmatch(r"(\d{1,2}):(\d{2})(:\d{2})?", rel.interval.strip()) if rel.interval else None
    if m:
        return max(3, int(m.group(1)) * 60 + int(m.group(2)))
    if rel.interval.strip().isdigit():
        return max(3, int(rel.interval.strip()))
    if rel.ref.upper().startswith("S") or rel.ref.upper().startswith("M"):
        return MINIBUS_HEADWAY  # small buses (S-, M- routes) run less often: an estimate
    return LONG_ROUTE_HEADWAY if length > 25000 else BUS_HEADWAY


def clean_name(rel: RouteRel) -> str:
    """The route's name without the word "Route" or any operator."""
    n = re.sub(r"^\s*route\s+", "", rel.name, flags=re.I)
    return n.strip()


def rail_lines(osm: TransitOsm) -> list[dict[str, Any]]:
    """One line per rail route relation (each direction): the stations it calls at, in order."""
    stations = osm.stations
    points = osm.member_points
    lines: list[dict[str, Any]] = []
    for rr in osm.rail:
        name = rr.name or rr.ref
        low = name.lower()
        if rr.route == "subway":
            system = "metro"
        elif "mrts" in low or rr.route == "light_rail":
            system = "mrts"
        elif "suburban" in low:
            system = "suburban"
        else:
            continue  # long-distance trains are not city lines
        if "(u/c)" in low:
            continue  # under construction
        order: list[int] = []
        for key in rr.members:
            p = points.get(key)
            if p is None:
                continue
            best, bd = None, STATION_SEARCH
            for i, s in enumerate(stations):
                d = math.hypot(s.x - p.x, s.z - p.z)
                if d < bd and s.system == system:
                    best, bd = i, d
            if best is None:
                for i, s in enumerate(stations):
                    d = math.hypot(s.x - p.x, s.z - p.z)
                    if d < bd:
                        best, bd = i, d
            if best is not None and (not order or order[-1] != best) and best not in order:
                order.append(best)
        if len(order) < 2:
            continue
        lid = f"{system}-{rr.id}"
        hw = LINE_HEADWAY[system]
        if system == "suburban" and re.search(r"beach.*tambaram|tambaram.*beach", low):
            hw = BEACH_TAMBARAM_HEADWAY
        lines.append({"id": lid, "osm": rr.id, "system": system, "ref": rr.ref, "name": name, "stations": order,
                      "headwayMinutes": hw, "hours": list(LINE_HOURS[system]), "offsetMinutes": int(hash01(rr.id % 2147483647, 7) * hw)})
        for i in order:
            if lid not in stations[i].lines:
                stations[i].lines.append(lid)
    return lines


def attach_places(osm: TransitOsm) -> None:
    """Railway platforms and entrances go to the nearest station within reach (OSM maps them as
    separate objects; the station is the place the player walks into)."""
    for ref, x, z, length in osm.platforms:
        st = min(osm.stations, key=lambda s: math.hypot(s.x - x, s.z - z), default=None)
        if st is not None and math.hypot(st.x - x, st.z - z) <= PLATFORM_REACH:
            st.platforms.append((ref, x, z, length))
    for x, z, label in osm.entrances:
        st = min(osm.stations, key=lambda s: math.hypot(s.x - x, s.z - z), default=None)
        if st is not None and math.hypot(st.x - x, st.z - z) <= ENTRANCE_REACH:
            st.entrances.append((x, z, label))
    for st in osm.stations:
        st.platforms.sort()
        st.entrances.sort()


def dedupe_stations(stations: list[Station]) -> list[Station]:
    """A station mapped as a node and as an area (or twice) is kept once: same system and name
    (or no English name) within 300 m."""
    out: list[Station] = []
    for s in sorted(stations, key=lambda s: (s.key[0] != "n", s.key)):
        dup = next((o for o in out if o.system == s.system and math.hypot(o.x - s.x, o.z - s.z) < 300.0 and (o.name == s.name or not o.name or not s.name)), None)
        if dup is None:
            out.append(s)
        else:
            dup.name = dup.name or s.name
            dup.name_ta = dup.name_ta or s.name_ta
    return out


@dataclass
class Network:
    stops: list[Stop]
    bus_stations: list[Station]
    stations: list[Station]
    lines: list[dict[str, Any]]
    routes: list[Snapped]
    first_set: list[int]
    stats: Counter[str]


def build_network(osm: TransitOsm, g: DriveGraph, bounds: tuple[float, float, float, float] | None = None) -> Network:
    stats: Counter[str] = Counter(osm.stats)
    table, index = stop_table(osm)
    if bounds is not None:
        x0, x1, z0, z1 = bounds
        inside = [i for i, s in enumerate(table) if x0 <= s.x <= x1 and z0 <= s.z <= z1]
        stats["stops:outside-world"] = len(table) - len(inside)
    grid: dict[tuple[int, int], list[int]] = {}
    for i, s in enumerate(table):
        grid.setdefault((math.floor(s.x / CELL), math.floor(s.z / CELL)), []).append(i)
    osm.stations = dedupe_stations(osm.stations)
    attach_places(osm)
    lines = rail_lines(osm)
    routes: list[Snapped] = []
    for rel in sorted(osm.routes, key=lambda r: r.id):
        stops = route_stops(rel, index, table)
        inferred = False
        line = route_line(rel, osm.way_nodes) if rel.way_members else []
        if len(stops) >= 3 and len(line) >= 2:
            # Stop members out of order (both directions in one relation, or added later at the
            # end) make the bus zigzag: put them in order along the mapped ways.
            again = order_along(line, stops, table)
            if again is not None and again != stops and straight_sum(again, table) < straight_sum(stops, table) * 0.8:
                stops = again
                stats["routes:stops-reordered"] += 1
        if len(stops) < 3 and rel.way_members:
            if len(line) >= 2:
                guess = infer_stops(line, table, grid)
                if len(guess) > len(stops):
                    stops, inferred = guess, True
        sn = snap_route(g, rel, stops, table, inferred)
        stats["routes:" + sn.status] += 1
        if inferred:
            stats["routes:inferred-stops"] += 1
        routes.append(sn)
    usable = [i for i, r in enumerate(routes) if r.status != "unusable"]
    first = sorted((i for i in usable if routes[i].majors), key=lambda i: (-len(routes[i].stops), routes[i].rel.id))[:FIRST_SET]
    stats["routes:first-set"] = len(first)
    served = {s for r in routes if r.status != "unusable" for s in r.stops}
    stats["stops"] = len(table)
    stats["stops:served"] = len(served)
    stats["stops:named"] = sum(1 for s in table if s.name or s.name_ta)
    stats["stops:tamil"] = sum(1 for s in table if s.name_ta)
    return Network(table, osm.bus_stations, osm.stations, lines, routes, first, stats)


def destination(sn: Snapped, table: list[Stop], names_ta: dict[str, str]) -> tuple[str, str]:
    """(English, Tamil) for the bus's sign: the relation's `to` (else the last stop's name), and
    its Tamil from `to:ta`, the last stop or a place of that name ("" when OSM has none)."""
    last = table[sn.stops[-1]] if sn.stops else None
    en = sn.rel.to or (last.name if last else "")
    ta = sn.rel.to_ta or names_ta.get(en.strip().lower(), "")
    if not ta and last is not None and last.name_ta and (not en or last.name.lower() == en.lower()):
        ta = last.name_ta
    return en, ta


# --- Writing ----------------------------------------------------------------------------------


def encode_routes(net: Network, g: DriveGraph) -> tuple[bytes, list[int]]:
    """routes.bin; returns the bytes and each written route's index in `net.routes`."""
    w = Writer()
    w.u32(TRANSIT_MAGIC)
    w.u16(FORMAT)
    w.u16(VERSION)
    kept = [i for i, r in enumerate(net.routes) if r.status != "unusable"]
    w.u32(len(kept))
    for i in kept:
        r = net.routes[i]
        w.u32(i)
        w.u32(len(r.path))
        x, z = int(js_round(g.pos[r.path[0]][0] * Q)), int(js_round(g.pos[r.path[0]][1] * Q))
        w.i32(x)
        w.i32(z)
        for n in r.path[1:]:
            nx, nz = int(js_round(g.pos[n][0] * Q)), int(js_round(g.pos[n][1] * Q))
            w.i16(nx - x)
            w.i16(nz - z)
            x, z = nx, nz
        w.u16(len(r.placed))
        for stop, seg, along in r.placed:
            w.u32(stop)
            w.u32(seg)
            w.f32(along)
    return w.done(), kept


@dataclass
class RouteBlob:
    index: int
    path: list[Point]
    placed: list[tuple[int, int, float]]


def decode_routes(data: bytes) -> list[RouteBlob]:
    r = Reader(data)
    if r.u32() != TRANSIT_MAGIC:
        raise ValueError("Not a transit routes file.")
    if r.u16() != FORMAT:
        raise ValueError("Transit routes format is not 2.")
    r.u16()
    out: list[RouteBlob] = []
    for _ in range(r.u32()):
        idx = r.u32()
        n = r.u32()
        x, z = r.i32(), r.i32()
        pts: list[Point] = [(x / Q, z / Q)]
        for _ in range(n - 1):
            x += r.i16()
            z += r.i16()
            pts.append((x / Q, z / Q))
        placed = [(r.u32(), r.u32(), r.f32()) for _ in range(r.u16())]
        out.append(RouteBlob(idx, pts, placed))
    if r.left:
        raise ValueError("Trailing bytes in the transit routes file.")
    return out


KINDS = ["pole", "platform", "position", "station"]


def network_json(net: Network, data_date: str) -> dict[str, Any]:
    names_ta: dict[str, str] = {}
    for s in [*net.stations, *net.bus_stations]:
        if s.name and s.name_ta:
            names_ta.setdefault(s.name.strip().lower(), s.name_ta)
    for st in net.stops:
        if st.name and st.name_ta:
            names_ta.setdefault(st.name.strip().lower(), st.name_ta)
    routes = []
    for i, r in enumerate(net.routes):
        en, ta = destination(r, net.stops, names_ta)
        routes.append({
            "osm": r.rel.id, "ref": r.rel.ref, "name": clean_name(r.rel), "from": r.rel.from_, "to": en, "toTa": ta,
            "status": r.status, "reason": r.reason, "inferred": r.inferred, "stops": r.stops if r.status != "unusable" else [],
            "legs": [r.legs_ok, r.legs], "memberShare": round(r.member_share, 3), "length": round(r.length), "raised": round(r.raised),
            "majors": r.majors, "first": i in net.first_set,
            "headwayMinutes": headway(r.rel, r.length), "hours": list(BUS_HOURS), "offsetMinutes": int(hash01(r.rel.id % 2147483647, 3) * headway(r.rel, r.length)),
        })
    return {
        "format": FORMAT, "transit": VERSION, "attribution": "© OpenStreetMap contributors", "licence": "ODbL 1.0", "dataDate": data_date,
        "note": "Stops, stations and routes from OSM; headways, hours and fares are estimates (no published timetable used). Operators are not shown. Tamil text is OSM's, not reviewed.",
        "stopKinds": KINDS,
        "stops": [[s.key, round(s.x, 2), round(s.z, 2), s.name, s.name_ta, s.ref, KINDS.index(s.kind)] for s in net.stops],
        "busStations": [[s.key, round(s.x, 2), round(s.z, 2), s.name, s.name_ta] for s in net.bus_stations],
        "stations": [{"key": s.key, "x": round(s.x, 2), "z": round(s.z, 2), "name": s.name, "nameTa": s.name_ta, "system": s.system, "lines": s.lines,
                      "platforms": [[r, round(x, 2), round(z, 2), ln] for r, x, z, ln in s.platforms], "entrances": [[round(x, 2), round(z, 2), lb] for x, z, lb in s.entrances]} for s in net.stations],
        "lines": net.lines,
        "routes": routes,
        "routesFile": "routes.bin",
    }


def write_network(net: Network, g: DriveGraph, world: Path, data_date: str) -> dict[str, int]:
    out = world / "transit"
    out.mkdir(parents=True, exist_ok=True)
    blob, kept = encode_routes(net, g)
    (out / "routes.bin").write_bytes(blob)
    doc = network_json(net, data_date)
    text = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    (out / "transit.json").write_text(text + "\n", encoding="utf-8")
    (world / "TRANSIT.md").write_text(report(net, world), encoding="utf-8")
    return {"routes_bin": len(blob), "transit_json": len(text.encode()), "routes_written": len(kept)}


def report(net: Network, world: Path) -> str:
    s = net.stats
    lines = ["# Transit coverage (OSM)\n",
             "Built by `tools/geo` `cli transit` from the OSM extract and the built roads (decisions G-210..G-213, `docs/transit.md`). "
             "© OpenStreetMap contributors, ODbL 1.0. Headways and hours are **estimates**; Tamil text is as mapped in OSM and **needs native review**.\n",
             "## Totals\n", "| What | Count |", "|---|---|"]
    rows = [("Bus stops (one per stop, poles and platforms merged within 15 m)", s["stops"]),
            ("of which mapped `highway=bus_stop`", s["osm:pole"]), ("`public_transport=platform` + `bus=yes` (before merging)", s["osm:platform"]),
            ("Stops with a name / with a Tamil name", f"{s['stops:named']} / {s['stops:tamil']}"),
            ("Stops served by a usable route", s["stops:served"]),
            ("Bus stations and terminals (`amenity=bus_station`)", len(net.bus_stations)),
            ("Railway stations (after merging node and area)", len(net.stations)),
            ("Rail lines (each direction a line)", len(net.lines)),
            ("Bus route relations", s["osm:bus_route"])]
    for status in ("clean", "fallback", "broken", "unusable"):
        rows.append((f"Routes {status}", s["routes:" + status]))
    rows.append(("Routes with inferred stops", s["routes:inferred-stops"]))
    rows.append(("Routes whose stop members were put in order along their ways", s["routes:stops-reordered"]))
    rows.append(("First set (on a major road, by stop count)", s["routes:first-set"]))
    lines += [f"| {a} | {b} |" for a, b in rows]
    # Stops per area: by district (nearest district point of the tile indexes).
    districts: list[tuple[str, float, float]] = []
    index = json.loads((world / "world.json").read_text())
    for tc, tr, *_ in index["tiles"]:
        tj = json.loads((world / "tiles" / f"{tc}_{tr}" / "tile.json").read_text())
        for d in tj.get("districts", []):
            if d.get("kind") in ("suburb", "neighbourhood", "quarter"):
                districts.append((d["name"], d["x"], d["z"]))
    per: Counter[str] = Counter()
    for st in net.stops:
        if districts:
            nm = min(districts, key=lambda d: (d[1] - st.x) ** 2 + (d[2] - st.z) ** 2)[0]
            per[nm] += 1
    lines += ["\n## Stops per area (nearest mapped suburb or neighbourhood; top 25)\n", "| Area | Stops |", "|---|---|"]
    lines += [f"| {a} | {n} |" for a, n in per.most_common(25)]
    lines += ["\n## Stations per system\n", "| System | Stations | With Tamil name | On a line |", "|---|---|---|---|"]
    for system in ("suburban", "mrts", "metro"):
        ss = [x for x in net.stations if x.system == system]
        lines.append(f"| {system} | {len(ss)} | {sum(1 for x in ss if x.name_ta)} | {sum(1 for x in ss if x.lines)} |")
    lines.append(f"\nRailway platforms attached to a station: {sum(len(x.platforms) for x in net.stations)} (of {len(net.stations)} stations, {sum(1 for x in net.stations if x.platforms)} have one); entrances: {sum(len(x.entrances) for x in net.stations)}.")
    lines += ["\n## Rail lines\n", "| Line | System | Stations | Headway (min, estimate) |", "|---|---|---|---|"]
    for ln in net.lines:
        lines.append(f"| {ln['name']} | {ln['system']} | {len(ln['stations'])} | {ln['headwayMinutes']} |")
    lines += ["\n## Routes\n", "| Ref | Name | Status | Stops | Legs found | On mapped ways | Length km | On decks m | Major roads | First set |", "|---|---|---|---|---|---|---|---|---|---|"]
    for i, r in sorted(enumerate(net.routes), key=lambda t: (["clean", "fallback", "broken", "unusable"].index(t[1].status), -len(t[1].stops))):
        lines.append(f"| {r.rel.ref} | {clean_name(r.rel)} | {r.status}{' (inferred stops)' if r.inferred else ''} | {len(r.stops)} | {r.legs_ok}/{r.legs} | {round(r.member_share * 100)} % | "
                     f"{r.length / 1000:.1f} | {round(r.raised)} | {', '.join(r.majors)} | {'yes' if i in net.first_set else ''} |")
    lines += ["\n## Why routes are unusable or broken\n"]
    reasons = Counter(r.reason.split(";")[0] if r.status == "unusable" else "legs not found" for r in net.routes if r.status in ("unusable", "broken"))
    lines += [f"- {k}: {n}" for k, n in reasons.most_common()]
    return "\n".join(lines) + "\n"
