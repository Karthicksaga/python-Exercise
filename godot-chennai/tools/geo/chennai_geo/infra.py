"""Format 2.1 (`infra.bin`, decisions G-150..G-153): road heights for bridges, flyovers and their
ramps, waterway centre lines, and street spots (pedestrian crossings, speed breakers).

OSM maps no heights for bridges, so the deck heights here are **estimated** by rule:

- A bridge (`bridge=*`, not a tunnel) belongs to a *chain*: the bridge roads joined end to end
  that share its effective layer (`max(layer, 1)`).
- A chain that crosses a lower road or a railway is raised to clear it: `CLEAR` (6.5 m: 5.5 m
  clearance plus the deck) above the ground, plus `CLEAR` per layer above a lower bridge; the
  deck is level for `PLATEAU` metres either side of every crossing. A footbridge clears 6 m.
- A chain that crosses nothing mapped (a river, a canal, a culvert) is level at
  `1 + 0.02 x length`, between 1.2 and 5 m.
- Everything else gets the lowest heights that keep every road's grade within its limit
  (`GRADE`): the ramps of the connecting roads, found by a max-propagation over the road graph
  (`h(n) = max over raised points m of h(m) - grade x distance(m, n)`), so heights are continuous
  at every shared node and across tile edges. Tunnels and covered roads stay at ground level and
  stop the propagation.

Heights are sampled every `STEP` metres along each road piece of `roads.bin` (the piece's own
points are not enough: a ramp's foot usually falls inside a long segment).
"""
from __future__ import annotations

import heapq
import math
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field

from shapely import STRtree
from shapely.geometry import LineString

from .binio import Reader, Writer
from .geometry import Point
from .model import DS_OSM_WAY, OsmLine, OsmPoint, Ref, Road
from .util import hash01, js_round, tag_number

INFRA_MAGIC = 0x49574F43  # "COWI"
FORMAT = 2
MINOR = 1
Q = 20
STEP = 5.0
CLEAR = 6.5
FOOT_CLEAR = 6.0
PLATEAU = 100.0
WATER_MIN, WATER_MAX = 1.2, 5.0
# Steepest grade per road kind (rise over run): arterial ramps 1:20, streets 1:14, footbridge
# stairs about 1:3.
GRADE = {"footway": 0.30, "residential": 0.07, "service": 0.07, "track": 0.07}
DEFAULT_GRADE = 0.05
DRIVABLE = {"primary", "secondary", "tertiary", "residential", "service", "motorway", "track", "raceway"}
MAIN = {"primary", "secondary", "tertiary", "motorway"}

WATERWAY_KINDS = ["river", "canal", "stream", "drain", "ditch"]
WATERWAY_WIDTH = {"river": 30.0, "canal": 18.0, "stream": 6.0, "drain": 3.0, "ditch": 1.5}
WF_TUNNEL, WF_INTERMITTENT = 1, 2
SPOT_KINDS = ["zebra", "signal_crossing", "unmarked", "bump", "hump", "table", "cushion", "rumble_strip"]
SF_MAPPED = 1
BUMP_KINDS = {"bump", "hump", "table", "cushion", "rumble_strip"}
ZEBRA_SETBACK = 2.5
RULE_BUMP_FROM_END = 14.0
RULE_BUMP_SHARE = 0.4


@dataclass
class Waterway:
    id: int
    kind: str
    width: float
    points: list[Point]
    name: str | None = None
    tunnel: bool = False
    intermittent: bool = False
    source: Ref = field(default_factory=lambda: Ref(DS_OSM_WAY, 0))


@dataclass
class Spot:
    kind: str
    x: float
    z: float
    yaw: float
    width: float
    road_id: int
    mapped: bool


@dataclass
class Infra:
    """Per-road height functions (road id -> `RoadProfile`), waterways and spots."""

    profiles: dict[int, "RoadProfile"]
    waterways: list[Waterway]
    spots: list[Spot]
    stats: Counter[str]


class RoadProfile:
    """Height along one road: per segment the heights at its ends, the grade of the road, interior
    sources (crossing points with their deck height) and whether the segment is a level deck."""

    def __init__(self, road: Road, ends: list[float], grade: float, plateau: list[bool], interior: dict[int, list[tuple[float, float]]]) -> None:
        self.road = road
        self.ends = ends
        self.grade = grade
        self.plateau = plateau
        self.interior = interior
        pts = road.points
        self.dist = [0.0]
        for i in range(1, len(pts)):
            self.dist.append(self.dist[-1] + math.dist(pts[i - 1], pts[i]))

    def at_segment(self, i: int, s: float) -> float:
        length = self.dist[i + 1] - self.dist[i]
        ha, hb = self.ends[i], self.ends[i + 1]
        h = max(ha - self.grade * s, hb - self.grade * (length - s), 0.0)
        if self.plateau[i]:
            h = max(h, min(ha, hb))
        elif self.road.bridge:
            h = max(h, min(ha, hb, WATER_MIN))
        for si, hi in self.interior.get(i, []):
            d = abs(s - si)
            h = max(h, hi if d <= PLATEAU else hi - self.grade * (d - PLATEAU))
        return h

    def at(self, d: float) -> float:
        """Height at distance d along the road (0 = first point)."""
        if len(self.dist) < 2:
            return 0.0
        i = 0
        while i < len(self.dist) - 2 and self.dist[i + 1] < d:
            i += 1
        return self.at_segment(i, min(max(d - self.dist[i], 0.0), self.dist[i + 1] - self.dist[i]))

    def raised(self) -> bool:
        return any(h > 0.01 for h in self.ends) or bool(self.interior)


def grade_of(road: Road) -> float:
    return GRADE.get(road.kind, DEFAULT_GRADE)


def _key(p: Point) -> tuple[int, int]:
    return (int(js_round(p[0] * Q)), int(js_round(p[1] * Q)))


def solve_heights(roads: list[Road], railways: list[OsmLine], stats: Counter[str] | None = None) -> dict[int, RoadProfile]:
    """Deck and ramp heights for every road that is raised anywhere (module docstring)."""
    stats = stats if stats is not None else Counter()
    nodes: dict[tuple[int, int], int] = {}
    road_nodes: list[list[int]] = []
    for r in roads:
        ids = []
        for p in r.points:
            k = _key(p)
            if k not in nodes:
                nodes[k] = len(nodes)
            ids.append(nodes[k])
        road_nodes.append(ids)
    n_nodes = len(nodes)
    # node -> [(road index, point index)]
    at_node: list[list[tuple[int, int]]] = [[] for _ in range(n_nodes)]
    for ri, ids in enumerate(road_nodes):
        for pi, n in enumerate(ids):
            at_node[n].append((ri, pi))

    def eff_layer(r: Road) -> int:
        return max(r.layer, 1)

    is_bridge = [r.bridge and not r.tunnel for r in roads]
    # Chains: bridge roads joined at shared nodes with the same effective layer.
    chain_of = [-1] * len(roads)
    chains: list[list[int]] = []
    for ri in range(len(roads)):
        if not is_bridge[ri] or chain_of[ri] >= 0:
            continue
        cid = len(chains)
        members = [ri]
        chain_of[ri] = cid
        stack = [ri]
        while stack:
            cur = stack.pop()
            ids = road_nodes[cur]
            for n in (ids[0], ids[-1], *ids[1:-1]):
                for rj, _ in at_node[n]:
                    if chain_of[rj] < 0 and is_bridge[rj] and eff_layer(roads[rj]) == eff_layer(roads[cur]):
                        chain_of[rj] = cid
                        members.append(rj)
                        stack.append(rj)
        chains.append(members)
    stats["deck:chains"] = len(chains)
    # What each bridge segment crosses: lower roads (not sharing a node with it) and railways.
    lines: list[LineString] = []
    owners: list[tuple[str, int]] = []
    for ri, r in enumerate(roads):
        if len(r.points) >= 2:
            lines.append(LineString(r.points))
            owners.append(("road", ri))
    for li, rail in enumerate(railways):
        if len(rail.points) >= 2:
            lines.append(LineString(rail.points))
            owners.append(("rail", li))
    tree = STRtree(lines)
    # chain -> list of (road index, segment, s along segment, lower height key)
    crossings: dict[int, list[tuple[int, int, float, str, int]]] = {}
    for cid, members in enumerate(chains):
        for ri in members:
            r = roads[ri]
            own = set(road_nodes[ri])
            pts = r.points
            for i in range(len(pts) - 1):
                seg = LineString([pts[i], pts[i + 1]])
                for j in tree.query(seg):
                    kind, oi = owners[int(j)]
                    if kind == "road":
                        if oi == ri or chain_of[oi] == cid:
                            continue
                        other = roads[oi]
                        if other.tunnel and other.layer >= r.layer:
                            continue
                        lower_layer = eff_layer(other) if is_bridge[oi] else min(other.layer, 0)
                        if lower_layer >= eff_layer(r):
                            continue
                        if own.intersection(road_nodes[oi]):
                            # Joined roads (a ramp leaving the deck) are not crossed.
                            continue
                    else:
                        rail = railways[oi]
                        rail_layer = tag_number(rail.tags.get("layer"))
                        if math.isnan(rail_layer):
                            rail_layer = 1.0 if rail.tags.get("bridge", "no") not in ("no", "") else 0.0
                        if rail_layer >= eff_layer(r) or rail.tags.get("tunnel", "no") not in ("no", ""):
                            continue
                    inter = seg.intersection(lines[int(j)])
                    if inter.is_empty:
                        continue
                    pt = inter if inter.geom_type == "Point" else inter.representative_point()
                    s = math.dist(pts[i], (pt.x, pt.y))
                    crossings.setdefault(cid, []).append((ri, i, s, kind, oi))
    # Chain deck heights, lowest layers first so a deck over a deck knows the lower one's height.
    chain_h = [0.0] * len(chains)
    order = sorted(range(len(chains)), key=lambda c: eff_layer(roads[chains[c][0]]))
    for cid in order:
        members = chains[cid]
        r0 = roads[members[0]]
        cross = crossings.get(cid, [])
        if cross:
            base = 0.0
            for _, _, _, kind, oi in cross:
                if kind == "road" and is_bridge[oi] and chain_of[oi] >= 0:
                    base = max(base, chain_h[chain_of[oi]] + CLEAR * (eff_layer(r0) - eff_layer(roads[oi])) - CLEAR)
            clear = FOOT_CLEAR if r0.kind == "footway" else CLEAR
            chain_h[cid] = base + clear
            stats["deck:chains-crossing"] += 1
        else:
            length = sum(sum(math.dist(a, b) for a, b in zip(roads[m].points, roads[m].points[1:])) for m in members)
            chain_h[cid] = min(WATER_MAX, max(WATER_MIN, 1.0 + 0.02 * length))
    # Lower bounds: nodes of a crossing chain within PLATEAU of a crossing (inside the chain),
    # every node of a chain that crosses nothing.
    low = [0.0] * n_nodes
    plateau_node = [False] * n_nodes
    interior: dict[int, dict[int, list[tuple[float, float]]]] = {}
    for cid, members in enumerate(chains):
        h = chain_h[cid]
        cross = crossings.get(cid, [])
        if not cross:
            for ri in members:
                for n in road_nodes[ri]:
                    low[n] = max(low[n], h)
                    plateau_node[n] = True
            continue
        dist: dict[int, float] = {}
        heap: list[tuple[float, int]] = []
        for ri, i, s, _, _ in cross:
            interior.setdefault(ri, {}).setdefault(i, []).append((s, h))
            seg_len = math.dist(roads[ri].points[i], roads[ri].points[i + 1])
            for n, d in ((road_nodes[ri][i], s), (road_nodes[ri][i + 1], seg_len - s)):
                if d < dist.get(n, math.inf):
                    dist[n] = d
                    heapq.heappush(heap, (d, n))
        member_set = set(members)
        while heap:
            d, n = heapq.heappop(heap)
            if d > dist.get(n, math.inf):
                continue
            for rj, pj in at_node[n]:
                if rj not in member_set:
                    continue
                for pk in (pj - 1, pj + 1):
                    if 0 <= pk < len(road_nodes[rj]):
                        m = road_nodes[rj][pk]
                        nd = d + math.dist(roads[rj].points[pj], roads[rj].points[pk])
                        if nd < dist.get(m, math.inf):
                            dist[m] = nd
                            heapq.heappush(heap, (nd, m))
        for n, d in dist.items():
            if d <= PLATEAU:
                low[n] = max(low[n], h)
                plateau_node[n] = True
            else:
                # Within the chain but past the level part: the deck slopes down at the arterial
                # grade, never below the lowest deck (a bridge is never at ground level).
                low[n] = max(low[n], WATER_MIN, h - DEFAULT_GRADE * (d - PLATEAU))
    # Max-propagation over every road except tunnels.
    blocked = [r.tunnel for r in roads]
    height = low[:]
    heap2 = [(-h, n) for n, h in enumerate(height) if h > 0.0]
    heapq.heapify(heap2)
    while heap2:
        neg, n = heapq.heappop(heap2)
        h = -neg
        if h < height[n] - 1e-9:
            continue
        for rj, pj in at_node[n]:
            if blocked[rj]:
                continue
            g = grade_of(roads[rj])
            for pk in (pj - 1, pj + 1):
                if 0 <= pk < len(road_nodes[rj]):
                    m = road_nodes[rj][pk]
                    cand = h - g * math.dist(roads[rj].points[pj], roads[rj].points[pk])
                    if cand > height[m] + 1e-6:
                        height[m] = cand
                        heapq.heappush(heap2, (-cand, m))
    for ri, r in enumerate(roads):
        if blocked[ri]:
            for n in road_nodes[ri]:
                if height[n] > 0.0:
                    stats["deck:tunnel-node-raised"] += 1
    profiles: dict[int, RoadProfile] = {}
    for ri, r in enumerate(roads):
        ids = road_nodes[ri]
        if blocked[ri]:
            continue
        ends = [height[n] for n in ids]
        inner = interior.get(ri, {})
        if max(ends) <= 0.01 and not inner:
            continue
        plat = [is_bridge[ri] and plateau_node[ids[i]] and plateau_node[ids[i + 1]] for i in range(len(ids) - 1)]
        profiles[r.id] = RoadProfile(r, ends, grade_of(r), plat, inner)
    stats["deck:raised-roads"] = len(profiles)
    stats["deck:raised-bridges"] = sum(1 for p in profiles.values() if p.road.bridge)
    # Clearance check: every crossing's lower road under its deck (report only).
    for cid, cross in crossings.items():
        for ri, i, s, kind, oi in cross:
            if kind != "road":
                continue
            top = profiles[roads[ri].id].at_segment(i, s) if roads[ri].id in profiles else 0.0
            below = roads[oi]
            prof = profiles.get(below.id)
            under = 0.0
            if prof is not None:
                pt = LineString([roads[ri].points[i], roads[ri].points[i + 1]]).interpolate(s)
                under = prof.at(LineString(below.points).project(pt))
            if top - under < 4.5:
                stats["deck:clearance-under-4.5m"] += 1
            stats["deck:crossings-checked"] += 1
    return profiles


def piece_samples(profile: RoadProfile, offset: float, points: list[Point]) -> list[float]:
    """Heights every STEP metres along a piece (points as written to roads.bin) from `offset`."""
    length = sum(math.dist(a, b) for a, b in zip(points, points[1:]))
    n = max(2, math.ceil(length / STEP - 1e-9) + 1)
    return [profile.at(offset + min(k * STEP, length)) for k in range(n)]


# Waterways ------------------------------------------------------------------------------------

def waterway_from_line(line: OsmLine, piece: list[Point], index: int) -> Waterway | None:
    t = line.tags
    kind = t.get("waterway", "")
    if kind not in WATERWAY_KINDS:
        return None
    w = tag_number(t.get("width"))
    width = w if 0.5 <= w <= 400 else WATERWAY_WIDTH[kind]
    tunnel = t.get("tunnel", "no") not in ("no", "") or t.get("covered") == "yes"
    return Waterway(line.id * 10 + index, kind, round(width, 2), piece, t.get("name:en") or t.get("name"), tunnel,
                    t.get("intermittent") == "yes" or t.get("seasonal") == "yes", Ref(DS_OSM_WAY, line.id))


def waterway_pieces_by_tile(ways: list[Waterway], tile_of_point: Callable[[float, float], tuple[int, int]]) -> dict[tuple[int, int], list[Waterway]]:
    """Segments go to the tile holding their midpoint; runs become pieces sharing end points."""
    out: dict[tuple[int, int], list[Waterway]] = {}
    for w in ways:
        pts = w.points
        key: tuple[int, int] | None = None
        start = 0
        for i in range(len(pts) - 1):
            k = tile_of_point((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
            if k != key:
                if key is not None:
                    out.setdefault(key, []).append(Waterway(**{**w.__dict__, "points": pts[start : i + 1]}))
                key = k
                start = i
        if key is not None:
            out.setdefault(key, []).append(Waterway(**{**w.__dict__, "points": pts[start:]}))
    return out


# Spots ----------------------------------------------------------------------------------------

def spot_kind(tags: dict[str, str]) -> str | None:
    tc = tags.get("traffic_calming")
    if tc:
        if tc in ("hump", "table", "cushion", "rumble_strip"):
            return tc
        if tc in ("bump", "yes", "speed_bump", "speed_hump"):
            return "bump" if tc != "speed_hump" else "hump"
        return None
    if tags.get("highway") != "crossing":
        return None
    c = tags.get("crossing", "")
    marks = tags.get("crossing:markings", "")
    if c == "traffic_signals":
        return "signal_crossing"
    if c in ("zebra", "marked", "uncontrolled") or tags.get("crossing_ref") == "zebra" or marks in ("yes", "zebra", "lines", "ladder", "dashes"):
        return "zebra"
    return "unmarked"


def point_at(r: Road, d: float) -> tuple[float, float, float]:
    """(x, z, yaw) at distance d along a road; yaw = atan2(dx, dz) of the segment."""
    pts = r.points
    run = 0.0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        seg = math.dist(a, b)
        if run + seg >= d or i == len(pts) - 2:
            t = 0.0 if seg < 1e-9 else min(max((d - run) / seg, 0.0), 1.0)
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, math.atan2(b[0] - a[0], b[1] - a[1]))
        run += seg
    return (pts[0][0], pts[0][1], 0.0)


def build_spots(roads: list[Road], profiles: dict[int, RoadProfile], spots: list[OsmPoint], signals: list[dict], stats: Counter[str]) -> list[Spot]:
    """Mapped spots snapped to their road, plus rule spots (invented): a zebra on every arm of a
    junction with traffic signals, a speed breaker near the main-road end of some side streets."""
    at: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for ri, r in enumerate(roads):
        for pi, p in enumerate(r.points):
            at.setdefault(_key(p), []).append((ri, pi))

    def drivable(ri: int) -> bool:
        return roads[ri].kind in DRIVABLE

    def yaw_at(r: Road, pi: int) -> float:
        a = r.points[max(pi - 1, 0)]
        b = r.points[min(pi + 1, len(r.points) - 1)]
        return math.atan2(b[0] - a[0], b[1] - a[1])

    def height(r: Road, d: float) -> float:
        p = profiles.get(r.id)
        return p.at(d) if p is not None else 0.0

    def along(r: Road, pi: int) -> float:
        return sum(math.dist(a, b) for a, b in zip(r.points[:pi], r.points[1 : pi + 1]))

    out: list[Spot] = []
    for pt in spots:
        kind = spot_kind(pt.tags)
        if kind is None:
            continue
        cands = [c for c in at.get(_key((pt.x, pt.z)), []) if drivable(c[0])]
        if not cands:
            stats["spot:not-on-road"] += 1
            continue
        ri, pi = max(cands, key=lambda c: roads[c[0]].width)
        r = roads[ri]
        if height(r, along(r, pi)) > 0.3:
            stats["spot:on-deck-skipped"] += 1
            continue
        out.append(Spot(kind, pt.x, pt.z, yaw_at(r, pi), r.width, r.id, True))
        stats[f"spot:mapped:{kind}"] += 1
    mapped = list(out)

    def near(kind_set: set[str], x: float, z: float, road_id: int | None, radius: float) -> bool:
        r2 = radius * radius
        return any(s.kind in kind_set and (road_id is None or s.road_id == road_id) and (s.x - x) ** 2 + (s.z - z) ** 2 < r2 for s in out)

    # Junction degree of drivable roads per node.
    degree: Counter[tuple[int, int]] = Counter()
    for ri, r in enumerate(roads):
        if not drivable(ri):
            continue
        for pi, p in enumerate(r.points):
            degree[_key(p)] += 1 if pi in (0, len(r.points) - 1) else 2
    zebra_kinds = {"zebra", "signal_crossing"}
    cells: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for k, n in degree.items():
        if n >= 3:
            cells.setdefault((k[0] // (25 * Q), k[1] // (25 * Q)), []).append(k)
    for sig in signals:
        sx, sz = sig["x"], sig["z"]
        best: tuple[int, int] | None = None
        best_d = 25.0 ** 2
        cx, cz = int(math.floor(sx / 25)), int(math.floor(sz / 25))
        for gx in (cx - 1, cx, cx + 1):
            for gz in (cz - 1, cz, cz + 1):
                for k in cells.get((gx, gz), []):
                    d2 = (k[0] / Q - sx) ** 2 + (k[1] / Q - sz) ** 2
                    if d2 < best_d:
                        best_d = d2
                        best = k
        if best is None:
            continue
        arms = [(ri, pi) for ri, pi in at.get(best, []) if drivable(ri)]
        maxw = max(roads[ri].width for ri, _ in arms)
        for ri, pi in arms:
            r = roads[ri]
            base = along(r, pi)
            total = along(r, len(r.points) - 1)
            for sign in (-1.0, 1.0):
                d = base + sign * (maxw / 2 + ZEBRA_SETBACK)
                if d < 0 or d > total:
                    continue
                x, z, yaw = point_at(r, d)
                if height(r, d) > 0.3 or near(zebra_kinds, x, z, r.id, 12.0) or near(zebra_kinds, x, z, None, 5.0):
                    continue
                out.append(Spot("zebra", round(x, 2), round(z, 2), yaw, r.width, r.id, False))
                stats["spot:rule:zebra"] += 1
    # Speed breakers near the main-road end of some side streets.
    main_nodes = {_key(p) for r in roads if r.kind in MAIN for p in r.points}
    for ri, r in enumerate(roads):
        if r.highway not in ("residential", "unclassified", "living_street") or len(r.points) < 2:
            continue
        total = along(r, len(r.points) - 1)
        if total < 60.0 or hash01(r.id) >= RULE_BUMP_SHARE:
            continue
        for end, d in ((0, RULE_BUMP_FROM_END), (len(r.points) - 1, total - RULE_BUMP_FROM_END)):
            if _key(r.points[end]) not in main_nodes:
                continue
            x, z, yaw = point_at(r, d)
            if height(r, d) > 0.05 or near(BUMP_KINDS, x, z, r.id, 30.0):
                continue
            out.append(Spot("bump", round(x, 2), round(z, 2), yaw, r.width, r.id, False))
            stats["spot:rule:bump"] += 1
    stats["spot:mapped"] = len(mapped)
    return out


# Codec ----------------------------------------------------------------------------------------

def _tag(s: str) -> int:
    b = s.encode()
    return b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24


DECK, WATR, SPOT = _tag("DECK"), _tag("WATR"), _tag("SPOT")


def encode_infra(tile: tuple[int, int], decks: list[tuple[int, list[float]]], waterways: list[Waterway], spots: list[Spot]) -> bytes:
    w = Writer()
    w.u32(INFRA_MAGIC)
    w.u16(FORMAT)
    w.u16(MINOR)
    w.i16(tile[0])
    w.i16(tile[1])
    w.u16(3)
    d = Writer()
    d.f32(STEP)
    d.u32(len(decks))
    for piece, hs in decks:
        d.u32(piece)
        d.u16(len(hs))
        for h in hs:
            d.u16(int(js_round(max(0.0, h) * 100)))
    _section(w, DECK, d.done())
    v = Writer()
    v.u32(len(waterways))
    for ww in waterways:
        v.f64(float(ww.id))
        v.u8(ww.source.dataset)
        v.u64(ww.source.id)
        v.u8(WATERWAY_KINDS.index(ww.kind))
        v.u8((WF_TUNNEL if ww.tunnel else 0) | (WF_INTERMITTENT if ww.intermittent else 0))
        v.u16(int(js_round(ww.width * 100)))
        name = (ww.name or "").encode()[:255]
        v.u8(len(name))
        v.raw(name)
        from .codec_v2 import _line  # noqa: PLC0415 - same point encoding as roads.bin

        _line(v, ww.points)
    _section(w, WATR, v.done())
    s = Writer()
    s.u32(len(spots))
    for sp in spots:
        s.u8(SPOT_KINDS.index(sp.kind))
        s.u8(SF_MAPPED if sp.mapped else 0)
        s.i32(int(js_round(sp.x * Q)))
        s.i32(int(js_round(sp.z * Q)))
        s.i16(int(js_round(math.remainder(sp.yaw, math.tau) * 10000)))
        s.u16(int(js_round(min(sp.width, 655) * 100)))
        s.f64(float(sp.road_id))
    _section(w, SPOT, s.done())
    return w.done()


def _section(w: Writer, tag: int, body: bytes) -> None:
    w.u32(tag)
    w.u32(len(body))
    w.raw(body)


@dataclass
class InfraTile:
    tile: tuple[int, int]
    minor: int
    step: float
    decks: list[tuple[int, list[float]]]
    waterways: list[Waterway]
    spots: list[Spot]


def decode_infra(data: bytes) -> InfraTile:
    r = Reader(data)
    if r.u32() != INFRA_MAGIC:
        raise ValueError("Not an infra file.")
    fmt = r.u16()
    if fmt != FORMAT:
        raise ValueError(f"Infra file format {fmt}, expected {FORMAT}")
    minor = r.u16()
    tile = (r.i16(), r.i16())
    out = InfraTile(tile, minor, STEP, [], [], [])
    from .codec_v2 import _read_line  # noqa: PLC0415

    for _ in range(r.u16()):
        tag = r.u32()
        body = Reader(r.raw(r.u32()))
        if tag == DECK:
            out.step = body.f32()
            for _ in range(body.u32()):
                piece = body.u32()
                out.decks.append((piece, [body.u16() / 100 for _ in range(body.u16())]))
        elif tag == WATR:
            for _ in range(body.u32()):
                wid = int(body.f64())
                src = Ref(body.u8(), body.u64())
                kind = WATERWAY_KINDS[body.u8()]
                flags = body.u8()
                width = body.u16() / 100
                name = body.raw(body.u8()).decode() or None
                out.waterways.append(Waterway(wid, kind, width, _read_line(body), name, bool(flags & WF_TUNNEL), bool(flags & WF_INTERMITTENT), src))
        elif tag == SPOT:
            for _ in range(body.u32()):
                kind = SPOT_KINDS[body.u8()]
                flags = body.u8()
                x, z = body.i32() / Q, body.i32() / Q
                yaw = body.i16() / 10000
                width = body.u16() / 100
                out.spots.append(Spot(kind, x, z, yaw, width, int(body.f64()), bool(flags & SF_MAPPED)))
        if body.left:
            raise ValueError("Trailing bytes in an infra section.")
    if r.left:
        raise ValueError("Trailing bytes after the infra sections.")
    return out
