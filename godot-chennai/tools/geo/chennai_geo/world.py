"""OSM features -> the regional world (in memory). A port of `buildWorldMap` generalised from
one rectangle to a ring of the regional world, with the v2 fields.

Ring 0 built alone reproduces today's world (`tests/test_ring0_regression.py`)."""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

import shapely
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.validation import make_valid

from .coast import build_sea
from .enums import AEROWAY_KINDS
from .infra import Infra, build_spots, solve_heights, waterway_from_line
from .geometry import Bounds, Point, SpatialGrid, bounds_of, centroid, clip_line, clip_polygon, signed_area
from .landmarks import find_landmarks, inside_landmark
from .model import DS_OSM_NODE, DS_OSM_WAY, Aeroway, Area, Building, OsmFeatures, OsmLine, OsmPolygon, Ref, Road, Tree
from .regions import CHUNK_SIZE, Grid, Playable, chunk_ring, latlng_box_local, RINGS, ring0_bounds
from .rules import oriented_points, road_from_way, to_area, to_building, v1_area_kind, v2_area_kind
from .trees import Blockers, generate_trees
from .util import hash01, round2

DISTRICT_PLACES = {"suburb", "neighbourhood", "quarter", "locality"}
SETTLEMENT_PLACES = {"city", "town", "village", "hamlet", "isolated_dwelling"}
NAMED_POIS = {"hospital", "clinic"}


@dataclass
class Chunk:
    col: int
    row: int
    ring: int = 0
    buildings: list[Building] = field(default_factory=list)
    trees: list[Tree] = field(default_factory=list)
    areas: list[Area] = field(default_factory=list)


@dataclass
class World:
    grid: Grid
    max_ring: int
    playable: Playable
    data_date: str
    roads: list[Road]
    areas: list[Area]
    chunks: dict[tuple[int, int], Chunk]
    pois: list[dict[str, Any]]
    bus_stops: list[dict[str, Any]]
    signals: list[dict[str, Any]]
    districts: list[dict[str, Any]]
    settlements: list[dict[str, Any]]
    landmarks: list[dict[str, Any]]
    aeroways: list[Aeroway]
    sea: dict[str, Any] | None
    stats: Counter[str]
    road_chunk_keys: set[tuple[int, int]] = field(default_factory=set)
    road_chunk_rings: dict[tuple[int, int], int] = field(default_factory=dict)
    # Format 2.1 (`infra.bin`, G-150): road heights, waterways, street spots. None for v1 builds.
    infra: Infra | None = None


def building_game_id(poly: OsmPolygon) -> int:
    """Ways keep their id (as today). Multipolygon parts: bit 31 set, relation id << 3 | part."""
    if poly.source == "way":
        if poly.id >= 2**31:
            raise OverflowError(f"OSM way id {poly.id} no longer fits the 31-bit building id; see world-format.md")
        return poly.id
    return 0x80000000 | (((poly.id << 3) | min(poly.part, 7)) & 0x7FFFFFFF)


def _ring_pts(coords: Any) -> list[Point]:
    pts = [(round2(x), round2(z)) for x, z in list(coords)[:-1]]
    out: list[Point] = []
    for p in pts:
        if not out or out[-1] != p:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def repair_polygon(poly: OsmPolygon, stats: Counter[str], what: str) -> OsmPolygon | None:
    """Invalid footprints (self-crossing, holes outside) are repaired with `make_valid` and
    the largest piece kept; what can't be repaired is dropped. Counted per reason."""
    try:
        g = Polygon(poly.outline, poly.holes)
    except ValueError:
        stats[f"{what}:dropped-degenerate"] += 1
        return None
    if g.is_valid:
        return poly
    fixed = make_valid(g)
    parts = [p for p in getattr(fixed, "geoms", [fixed]) if isinstance(p, Polygon)]
    parts += [q for p in getattr(fixed, "geoms", []) if isinstance(p, MultiPolygon) for q in p.geoms]
    if not parts:
        stats[f"{what}:dropped-invalid"] += 1
        return None
    best = max(parts, key=lambda p: p.area)
    outline = _ring_pts(best.exterior.coords)
    if len(outline) < 3:
        stats[f"{what}:dropped-invalid"] += 1
        return None
    stats[f"{what}:repaired"] += 1
    holes = [h for h in (_ring_pts(i.coords) for i in best.interiors) if len(h) >= 3]
    return OsmPolygon(poly.id, poly.tags, outline, holes, poly.source, poly.part)


def _clip_road(points: list[Point], playable: Playable) -> list[list[Point]]:
    pieces = clip_line(points, playable.rect)
    if playable.poly is None:
        return pieces
    out: list[list[Point]] = []
    for piece in pieces:
        xs = [p[0] for p in piece]
        zs = [p[1] for p in piece]
        if all(playable.inside_many(xs, zs)):
            out.append(piece)
            continue
        line = LineString(piece)
        inter = line.intersection(playable.poly)
        parts = [g for g in getattr(inter, "geoms", [inter]) if isinstance(g, LineString) and not g.is_empty]
        parts.sort(key=lambda g: line.project(shapely.Point(g.coords[0])))
        for g in parts:
            pts = [(round2(x), round2(z)) for x, z in g.coords]
            if len(pts) > 1:
                out.append(pts)
    return out


def _clip_area_to_chunk(area: Area, b: Bounds) -> list[Area]:
    if not area.holes:
        piece = clip_polygon(area.outline, b)
        return [Area(area.id, area.kind, piece, None, [], area.source)] if piece else []
    inter = Polygon(area.outline, area.holes).intersection(box(b.min_x, b.min_z, b.max_x, b.max_z))
    polys = [g for g in getattr(inter, "geoms", [inter]) if isinstance(g, Polygon) and not g.is_empty]
    out: list[Area] = []
    for g in polys:
        outline = _ring_pts(g.exterior.coords)
        if len(outline) < 3 or abs(signed_area(outline)) <= 0.5:
            continue
        holes = [h for h in (_ring_pts(i.coords) for i in g.interiors) if len(h) >= 3]
        out.append(Area(area.id, area.kind, outline, None, holes, area.source))
    return out


def _aeroways(f: OsmFeatures, playable: Playable) -> list[Aeroway]:
    out: list[Aeroway] = []

    def kind(t: dict[str, str]) -> str:
        v = t.get("aeroway", "")
        if t.get("man_made") == "tower" and t.get("tower:type") in ("aircraft_control", "control"):
            return "control_tower"
        return v if v in AEROWAY_KINDS else "other"

    def width(t: dict[str, str]) -> float | None:
        from .util import tag_number

        w = tag_number(t.get("width"))
        return w if 1 <= w <= 150 else None

    for line in f.aeroway_lines:
        if any(playable.inside(p) for p in line.points):
            out.append(Aeroway(line.id, kind(line.tags), Ref(DS_OSM_WAY, line.id), line.points, False, line.tags.get("ref"), line.tags.get("name"), width(line.tags), line.tags.get("surface"), line.tags))
    for poly in [*f.areas, *f.buildings]:
        t = poly.tags
        if "aeroway" not in t and not (t.get("man_made") == "tower" and t.get("tower:type") in ("aircraft_control", "control")):
            continue
        if not playable.inside(centroid(poly.outline)):
            continue
        out.append(Aeroway(poly.id, kind(t), poly.ref, poly.outline, True, t.get("ref"), t.get("name"), None, t.get("surface"), t))
    for pt in f.points:
        if "aeroway" in pt.tags and playable.inside((pt.x, pt.z)):
            out.append(Aeroway(pt.id, kind(pt.tags), Ref(DS_OSM_NODE, pt.id), [(pt.x, pt.z)], False, pt.tags.get("ref"), pt.tags.get("name"), None, None, pt.tags))
    return out


def build_world(f: OsmFeatures, grid: Grid, playables: list[Playable], max_ring: int, *, repair: bool = True, v2: bool = True) -> World:
    """Build rings 0..max_ring. `playables[r]` is ring r's area; content is kept inside
    `playables[max_ring]`. With `v2=False` (and repair off) the v1 rules are applied exactly."""
    playable = playables[max_ring]
    stats: Counter[str] = Counter()
    # Roads
    roads: list[Road] = []
    for way in f.highways:
        for i, piece in enumerate(_clip_road(oriented_points(way), playable)):
            road = road_from_way(way, piece, i, v2)
            if road:
                roads.append(road)
    # Areas (centroid inside, as today)
    areas: list[Area] = []
    for poly in f.areas:
        k = v2_area_kind(poly.tags) if v2 else v1_area_kind(poly.tags)
        if not k or (not v2 and poly.source != "way"):
            continue
        if not playable.inside(centroid(poly.outline)):
            continue
        if repair and poly.holes:
            fixed = repair_polygon(poly, stats, "area")
            if fixed is None:
                continue
            poly = fixed
        areas.append(to_area(poly, k))
    landmarks = find_landmarks(f, lambda p: playable.inside(p))
    # Buildings
    buildings: list[Building] = []
    for poly in f.buildings:
        if not v2 and poly.source != "way":
            continue
        middle = centroid(poly.outline)
        if not playable.inside(middle, 2):
            stats["building:outside"] += 1
            continue
        if inside_landmark(middle, landmarks):
            stats["building:under-landmark"] += 1
            continue
        if repair:
            fixed = repair_polygon(poly, stats, "building")
            if fixed is None:
                continue
            poly = fixed
        b = to_building(poly, building_game_id(poly))
        if b:
            buildings.append(b)
        else:
            stats["building:dropped-sliver"] += 1
    blockers = Blockers(roads, buildings)
    trees: list[Tree] = []
    planted: SpatialGrid[Tree] = SpatialGrid(12)
    pois: list[dict[str, Any]] = []
    bus_stops: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []
    districts: list[dict[str, Any]] = []
    settlements: list[dict[str, Any]] = []
    for pt in f.points:
        p = (pt.x, pt.z)
        if not playable.inside(p, 4):
            continue
        t = pt.tags
        kind = _point_kind(t)
        if kind == "bus_stop":
            bus_stops.append({"x": pt.x, "z": pt.z, **({"name": t["name"]} if t.get("name") else {})})
        if kind == "traffic_signals":
            signals.append({"x": pt.x, "z": pt.z})
        if kind == "place" and t.get("place") in DISTRICT_PLACES:
            name = t.get("name:en") or t.get("name")
            if name:
                districts.append({"name": name, "kind": t["place"], "x": pt.x, "z": pt.z})
        if v2 and kind == "place" and t.get("place") in SETTLEMENT_PLACES:
            name = t.get("name:en") or t.get("name")
            if name:
                settlements.append({"name": name, "kind": t["place"], "x": pt.x, "z": pt.z, **({"population": t["population"]} if t.get("population") else {})})
        if t.get("natural") == "tree" and not blockers.blocked(p, 0.5):
            tree = Tree(pt.x, pt.z, 0.9 + hash01(pt.id) * 0.4, "osm")
            trees.append(tree)
            planted.add_point(tree, tree.x, tree.z)
        poi = t.get("amenity") or t.get("shop")
        if poi:
            pois.append({"kind": poi, "x": pt.x, "z": pt.z, **({"name": t["name"]} if t.get("name") else {})})
    trees.extend(generate_trees(roads, areas, blockers, lambda p: playable.inside(p, 4), planted))
    kept = [t for t in trees if not inside_landmark((t.x, t.z), landmarks, 1.5)]

    chunks: dict[tuple[int, int], Chunk] = {}

    def chunk_at(col: int, row: int) -> Chunk:
        c = chunks.get((col, row))
        if c is None:
            c = Chunk(col, row)
            chunks[(col, row)] = c
        return c

    for bld in buildings:
        bc = centroid(bld.outline)
        chunk_at(grid.col(bc[0]), grid.row(bc[1])).buildings.append(bld)
    for tree_ in kept:
        chunk_at(grid.col(tree_.x), grid.row(tree_.z)).trees.append(tree_)
    # Areas are cut to every square they cover (as today); in the regional rings only to squares
    # that touch the playable area, so a big lake doesn't spill chunks past the state border.
    touches: dict[tuple[int, int], bool] = {}

    def square_ok(col: int, row: int) -> bool:
        if playable.poly is None:
            return True
        if (col, row) not in touches:
            b = grid.chunk_bounds(col, row)
            touches[(col, row)] = bool(playable.poly_prepared.intersects(box(b.min_x, b.min_z, b.max_x, b.max_z)))
        return touches[(col, row)]

    for area in areas:
        bb = bounds_of(area.outline)
        for col in range(grid.col(bb.min_x), grid.col(bb.max_x) + 1):
            for row in range(grid.row(bb.min_z), grid.row(bb.max_z) + 1):
                if not square_ok(col, row):
                    continue
                for cut in _clip_area_to_chunk(area, grid.chunk_bounds(col, row)):
                    chunk_at(col, row).areas.append(cut)
    for ch in chunks.values():
        ch.ring = chunk_ring(grid, ch.col, ch.row, playables[: max_ring + 1])
    road_keys: set[tuple[int, int]] = set()
    for road in roads:
        pts = road.points
        for i in range(len(pts) - 1):
            road_keys.add((grid.col((pts[i][0] + pts[i + 1][0]) / 2), grid.row((pts[i][1] + pts[i + 1][1]) / 2)))
    road_rings = {k: chunk_ring(grid, k[0], k[1], playables[: max_ring + 1]) for k in road_keys - set(chunks)}
    # Sea: coastlines cut to the ring's lat/lng box, as clip-city.py cut them.
    clip_box = ring0_box_local() if max_ring == 0 else latlng_box_local(RINGS[max_ring].box)
    coast_pieces: list[OsmLine] = []
    for line in f.coastlines:
        for i, piece in enumerate(clip_line(line.points, clip_box)):
            coast_pieces.append(OsmLine(line.id if i == 0 else line.id * 100 + i, line.tags, piece))
    sea = build_sea(coast_pieces, areas, playable.rect)
    stats["roads"] = len(roads)
    stats["buildings"] = len(buildings)
    infra = build_infra(f, roads, signals, playable, stats) if v2 else None
    return World(grid, max_ring, playable, f.timestamp, roads, areas, chunks, pois, bus_stops, signals, districts, settlements,
                 landmarks, _aeroways(f, playable) if v2 else [], sea, stats, road_keys, road_rings, infra)


def build_infra(f: OsmFeatures, roads: list[Road], signals: list[dict[str, Any]], playable: Playable, stats: Counter[str]) -> Infra:
    """Road heights, waterways and street spots (format 2.1, `infra.py`)."""
    profiles = solve_heights(roads, f.railways, stats)
    waterways = []
    for line in f.waterways:
        for i, piece in enumerate(_clip_road(line.points, playable)):
            ww = waterway_from_line(line, piece, i)
            if ww is not None:
                waterways.append(ww)
    stats["waterways"] = len(waterways)
    spots = build_spots(roads, profiles, f.spots, signals, stats)
    return Infra(profiles, waterways, spots, Counter())


def ring0_box_local() -> Bounds:
    from .regions import RING0_BOX

    return latlng_box_local(RING0_BOX)


def _point_kind(tags: dict[str, str]) -> str | None:
    """`pointKind` from map-data/src/osm.ts."""
    if tags.get("natural") == "tree":
        return "tree"
    if tags.get("highway") == "bus_stop" or (tags.get("public_transport") == "platform" and tags.get("bus") == "yes"):
        return "bus_stop"
    if tags.get("highway") == "traffic_signals":
        return "traffic_signals"
    if tags.get("amenity") == "place_of_worship":
        return "place_of_worship"
    if tags.get("man_made") or tags.get("historic") or tags.get("tourism"):
        return "landmark"
    if tags.get("place"):
        return "place"
    if tags.get("amenity") or tags.get("shop"):
        return "poi"
    return None


def named_poi(p: dict[str, Any]) -> list[Any]:
    return [p["kind"], p["x"], p["z"], p["name"]] if p.get("name") and p["kind"] in NAMED_POIS else [p["kind"], p["x"], p["z"]]

