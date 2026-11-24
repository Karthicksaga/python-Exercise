"""Multi-source building fusion for the whole world (G-220…G-224): OpenStreetMap stays primary,
footprints from Overture Maps, Google Open Buildings v3 and Microsoft Global ML Building
Footprints are added only where OSM has no building, and heights are filled in a fixed order.

Everything here works in the game's local metres (`GeoProjection`, TD-2), vectorised with
Shapely 2 (STRtree bulk queries); `fusion.py` keeps the small per-building reference (`fuse`)
whose match rule (IoU >= 0.5 or >= 0.8 contained) is reused here.

Rules (world-format.md §3.9, technical-decisions G-221…G-223):
1. OSM wins everywhere. An external footprint whose area lies >= `ADD_MAX_OVERLAP` (15 %) on OSM
   buildings is never added. If it is the same building (IoU >= 0.5 or containment >= 0.8) it
   is "matched" and may lend a height to an OSM building whose height is estimated; otherwise
   it is a conflicting outline and dropped.
2. Sanity: area >= 12 m² (the OSM rule), Google confidence >= 0.75 (also for Google footprints
   that reach us through Overture), centre not in water, not on a carriageway, not under a
   modelled landmark, inside the built world, not holding a mapped OSM street object (a pole,
   tower, toilets, post box… from detail.bin: OSM says something else stands there).
3. Between external sources: footprints overlapping each other by >= `DUP_MIN_OVERLAP` (30 %) of the
   smaller one are the same building; the one kept has a height first, then the higher
   confidence, then the source order Overture, Google, Microsoft, then the lower source index.
4. Heights: OSM `height` > OSM `building:levels` > Overture height / num_floors > Microsoft height
   (> 0) > estimate by kind. A source whose heights disagree with OSM's (mean absolute error
   above `REFUSE_MAE` or |bias| above `REFUSE_BIAS` on at least `REFUSE_MIN_PAIRS` buildings
   that have both) is refused. Every non-OSM value stays labelled (`heightFrom` overture,
   microsoft, estimated), never "height".
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

import numpy as np
import shapely
from numpy.typing import NDArray

from .rules import DEFAULT_FLOORS, FLOOR_HEIGHT, MIN_BUILDING_AREA, PARAPET, WALL_COLORS
from .util import hash01, round1

# Provenance of a fused building (the `source` bits of a fusion.bin record). Append only.
FUSION_SOURCES = ["osm", "overture", "google", "microsoft"]
SRC_OSM, SRC_OVERTURE, SRC_GOOGLE, SRC_MICROSOFT = range(4)
# Where Overture took a footprint from (its `sources[0].dataset`). Append only.
OVERTURE_ORIGINS = ["", "google", "microsoft", "other"]
ORIGIN_NONE, ORIGIN_GOOGLE, ORIGIN_MICROSOFT, ORIGIN_OTHER = range(4)
SOURCE_RANK = {SRC_OVERTURE: 0, SRC_GOOGLE: 1, SRC_MICROSOFT: 2}

IOU_SAME = 0.5
CONTAIN_SAME = 0.8
# Measured on the 24 Nov 2026 extracts (G-222, docs/fusion.md "Thresholds", world/FUSION.md):
# among the 792,130 external footprints that touch an OSM building, the share of the footprint
# lying on OSM falls from 30,657 (0-2.5 %) to its minimum of about 12,300 per 2.5 % step between
# 10 % and 20 % (neighbours drawn a metre over the line), then rises steadily towards the same
# building drawn twice (108,000 per 10 % step at 60-80 %). The cut sits at the minimum: 15 %.
ADD_MAX_OVERLAP = 0.15
# Two external footprints (overlap / smaller area): pairs of neighbours fall from 350,506
# (0-2.5 %) to a flat floor of about 22,000 per 2.5 % step from 30 % on; the same building in
# two sources piles up above 90 % (570,483). The cut sits where the neighbours' tail meets the
# floor: 30 %.
DUP_MIN_OVERLAP = 0.3
GOOGLE_MIN_CONFIDENCE = 0.75
MIN_AREA = MIN_BUILDING_AREA
REFUSE_MAE = 3.0
REFUSE_BIAS = 2.0
REFUSE_MIN_PAIRS = 20
MIN_HEIGHT, MAX_HEIGHT = 2.5, 250.0

F64 = NDArray[np.float64]
I64 = NDArray[np.int64]
B = NDArray[np.bool_]


@dataclass
class Footprints:
    """External footprints, struct of arrays. `geoms` are Shapely polygons in local metres."""

    geoms: NDArray[np.object_]
    source: I64
    index: I64  # row of the footprint in its source extract (provenance, docs/fusion.md)
    origin: I64 = field(default_factory=lambda: np.zeros(0, np.int64))
    confidence: F64 = field(default_factory=lambda: np.zeros(0))  # -1 = none
    height: F64 = field(default_factory=lambda: np.zeros(0))  # metres, NaN = none (floors already converted)

    def __post_init__(self) -> None:
        n = len(self.geoms)
        if len(self.origin) != n:
            self.origin = np.zeros(n, np.int64)
        if len(self.confidence) != n:
            self.confidence = np.full(n, -1.0)
        if len(self.height) != n:
            self.height = np.full(n, np.nan)

    def __len__(self) -> int:
        return len(self.geoms)

    @staticmethod
    def concat(parts: list[Footprints]) -> Footprints:
        if not parts:
            return Footprints(np.array([], dtype=object), np.zeros(0, np.int64), np.zeros(0, np.int64))
        return Footprints(np.concatenate([p.geoms for p in parts]), np.concatenate([p.source for p in parts]), np.concatenate([p.index for p in parts]),
                          np.concatenate([p.origin for p in parts]), np.concatenate([p.confidence for p in parts]), np.concatenate([p.height for p in parts]))


def external_height(height: float | None, floors: float | None) -> float:
    """A source's height, else its floor count x the OSM floor rule, else NaN; out-of-range = NaN."""
    if height is not None and math.isfinite(height) and MIN_HEIGHT <= height <= MAX_HEIGHT:
        return float(height)
    if floors is not None and math.isfinite(floors) and 1 <= floors <= 60:
        return float(floors) * FLOOR_HEIGHT + PARAPET
    return math.nan


@dataclass
class OsmSide:
    geoms: NDArray[np.object_]
    height_from: list[str]
    height: F64


@dataclass
class Masks:
    """Where no new building may stand (local metres). Tested by the footprint's centre."""

    water: list[shapely.Geometry] = field(default_factory=list)
    roads: list[shapely.Geometry] = field(default_factory=list)
    landmarks: list[shapely.Geometry] = field(default_factory=list)
    world: shapely.Geometry | None = None
    # Mapped OSM street objects (toilets, poles, towers, post boxes…, from detail.bin): OSM says
    # something else stands there, so a footprint holding one is not added (G-222).
    objects: list[shapely.Geometry] = field(default_factory=list)


@dataclass
class Validation:
    pairs: int = 0
    mae: float = 0.0
    bias: float = 0.0
    refused: bool = False


@dataclass
class FusionOutcome:
    kept: I64  # indices into the external footprints, the new buildings
    osm_heights: dict[int, tuple[float, str, int]]  # OSM index -> (height, heightFrom, source)
    validation: dict[int, Validation]
    reasons: dict[int, Counter[str]]  # source -> why footprints were not added (and "added")
    overlap_ratio: F64  # per external footprint: share of its area on OSM buildings
    dup_ratio: F64  # per conflicting external pair: overlap / smaller area (for the threshold report)


def _valid(geoms: NDArray[np.object_]) -> NDArray[np.object_]:
    bad = ~shapely.is_valid(geoms)
    if bad.any():
        fixed = shapely.make_valid(geoms[bad])
        # keep the largest polygon of whatever make_valid returns
        out = []
        for g in fixed:
            if g.geom_type == "Polygon":
                out.append(g)
            else:
                polys = [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"]
                out.append(max(polys, key=lambda p: p.area) if polys else shapely.Polygon())
        geoms = geoms.copy()
        geoms[bad] = np.array(out, dtype=object)
    return geoms


BATCH = 200_000


def _pairs(tree: shapely.STRtree, tree_geoms: NDArray[np.object_], geoms: NDArray[np.object_]) -> tuple[I64, I64, F64]:
    """(i into geoms, j into tree_geoms, intersection area) for every intersecting pair, in
    batches so a few million footprints fit in memory."""
    ii: list[I64] = []
    jj: list[I64] = []
    aa: list[F64] = []
    for s0 in range(0, len(geoms), BATCH):
        a_, b_ = tree.query(geoms[s0:s0 + BATCH], predicate="intersects")
        ii.append(a_.astype(np.int64) + s0)
        jj.append(b_.astype(np.int64))
        aa.append(shapely.area(shapely.intersection(geoms[s0 + a_], tree_geoms[b_])))
    if not ii:
        return np.zeros(0, np.int64), np.zeros(0, np.int64), np.zeros(0)
    return np.concatenate(ii), np.concatenate(jj), np.concatenate(aa)


def _inside_any(points: NDArray[np.object_], masks: list[shapely.Geometry]) -> B:
    hit = np.zeros(len(points), bool)
    if not masks or not len(points):
        return hit
    tree = shapely.STRtree(np.array(masks, dtype=object))
    for s0 in range(0, len(points), BATCH):
        idx = tree.query(points[s0:s0 + BATCH], predicate="within")
        hit[idx[0] + s0] = True
    return hit


def fuse_footprints(osm: OsmSide, ext: Footprints, masks: Masks, ovt_osm: Footprints | None = None) -> FusionOutcome:
    """Decide which external footprints become new buildings and which OSM buildings get a height.

    `ovt_osm`: Overture's own copies of OSM buildings (dataset OpenStreetMap). They are never
    added (our OSM extract is primary) but their heights validate and, where our OSM building is
    estimated and theirs carries a height (a newer edit), fill it, labelled `overture`."""
    n = len(ext)
    reasons: dict[int, Counter[str]] = {s: Counter() for s in SOURCE_RANK}
    geoms = _valid(ext.geoms)
    area = shapely.area(geoms)
    osm_g = _valid(osm.geoms)
    osm_area = shapely.area(osm_g)
    tree = shapely.STRtree(osm_g)

    # 1. Overlap with OSM.
    ratio = np.zeros(n)
    match = np.full(n, -1, np.int64)
    if n and len(osm_g):
        ei, oi, inter = _pairs(tree, osm_g, geoms)
        np.add.at(ratio, ei, inter)
        ratio = np.divide(ratio, area, out=np.zeros(n), where=area > 0)
        union = area[ei] + osm_area[oi] - inter
        iou = np.divide(inter, union, out=np.zeros(len(inter)), where=union > 0)
        small = np.minimum(area[ei], osm_area[oi])
        contain = np.divide(inter, small, out=np.zeros(len(inter)), where=small > 0)
        score = np.where(iou >= IOU_SAME, iou, np.where(contain >= CONTAIN_SAME, contain, 0.0))
        order = np.argsort(score, kind="stable")
        for k in order:  # ascending: the best score per footprint is written last
            if score[k] > 0:
                match[ei[k]] = oi[k]
    ratio = np.minimum(ratio, 1.0)

    # 2. Heights for OSM buildings whose height is estimated, and validation per source.
    validation: dict[int, Validation] = {}
    osm_heights: dict[int, tuple[float, str, int]] = {}
    pools: list[tuple[int, Footprints, I64]] = []
    if ovt_osm is not None and len(ovt_osm):
        og = _valid(ovt_osm.geoms)
        om = np.full(len(og), -1, np.int64)
        if len(osm_g):
            a_, b_, inter = _pairs(tree, osm_g, og)
            oa = shapely.area(og)
            union = oa[a_] + osm_area[b_] - inter
            iou = np.divide(inter, union, out=np.zeros(len(inter)), where=union > 0)
            small = np.minimum(oa[a_], osm_area[b_])
            contain = np.divide(inter, small, out=np.zeros(len(inter)), where=small > 0)
            score = np.where(iou >= IOU_SAME, iou, np.where(contain >= CONTAIN_SAME, contain, 0.0))
            for k in np.argsort(score, kind="stable"):
                if score[k] > 0:
                    om[a_[k]] = b_[k]
        pools.append((SRC_OVERTURE, ovt_osm, om))
    pools.append((-1, ext, match))
    # Validation: OSM buildings with a mapped height (height or levels) against each source.
    diffs: dict[int, list[float]] = {}
    for _, fp, m in pools:
        for i in np.nonzero((m >= 0) & np.isfinite(fp.height))[0]:
            o = int(m[i])
            if osm.height_from[o] in ("height", "levels"):
                diffs.setdefault(int(fp.source[i]), []).append(float(fp.height[i]) - float(osm.height[o]))
    for s, d in diffs.items():
        arr = np.array(d)
        v = Validation(len(arr), float(np.mean(np.abs(arr))), float(np.mean(arr)))
        v.refused = v.pairs >= REFUSE_MIN_PAIRS and (v.mae > REFUSE_MAE or abs(v.bias) > REFUSE_BIAS)
        validation[s] = v
    refused = {s for s, v in validation.items() if v.refused}
    for src_pref in (SRC_OVERTURE, SRC_MICROSOFT):
        if src_pref in refused:
            continue
        for _, fp, m in pools:
            for i in np.nonzero((m >= 0) & np.isfinite(fp.height) & (fp.source == src_pref))[0]:
                o = int(m[i])
                if osm.height_from[o] != "estimated" or o in osm_heights:
                    continue
                osm_heights[o] = (round1(float(fp.height[i])), "overture" if src_pref == SRC_OVERTURE else "microsoft", src_pref)

    # 3. Sanity filters, then the OSM rule.
    alive = np.ones(n, bool)

    def drop(mask: B, why: str) -> None:
        nonlocal alive
        hit = alive & mask
        for s, c in zip(*np.unique(ext.source[hit], return_counts=True)):
            reasons[int(s)][why] += int(c)
        alive &= ~mask

    drop(area < MIN_AREA, "smaller than 12 m²")
    drop(((ext.source == SRC_GOOGLE) | (ext.origin == ORIGIN_GOOGLE)) & (ext.confidence < GOOGLE_MIN_CONFIDENCE), "Google confidence below 0.75")
    drop(match >= 0, "same building as an OSM one")
    drop(ratio >= ADD_MAX_OVERLAP, "overlaps an OSM building")
    centres = shapely.point_on_surface(geoms)
    if masks.world is not None:
        drop(~shapely.within(centres, masks.world), "outside the built world")
    drop(_inside_any(centres, masks.landmarks), "under a modelled landmark")
    drop(_inside_any(centres, masks.water), "in water")
    drop(_inside_any(centres, masks.roads), "on a carriageway")
    if masks.objects and alive.any():
        holds = np.zeros(n, bool)
        live_idx = np.nonzero(alive)[0]
        t_obj = shapely.STRtree(geoms[live_idx])
        pt_i, fp_i = t_obj.query(np.array(masks.objects, dtype=object), predicate="within")
        holds[live_idx[fp_i]] = True
        drop(holds, "holds a mapped OSM street object")

    # 4. Same building in several external sources: keep one.
    live = np.nonzero(alive)[0]
    dup_ratio = np.zeros(0)
    if len(live):
        lg = geoms[live]
        la = area[live]
        t2 = shapely.STRtree(lg)
        ii: list[I64] = []
        jj: list[I64] = []
        for s0 in range(0, len(lg), BATCH):
            x_, y_ = t2.query(lg[s0:s0 + BATCH], predicate="intersects")
            x_ = x_.astype(np.int64) + s0
            y_ = y_.astype(np.int64)
            keep_pair = x_ < y_
            ii.append(x_[keep_pair])
            jj.append(y_[keep_pair])
        a_, b_ = np.concatenate(ii), np.concatenate(jj)
        inter = np.concatenate([shapely.area(shapely.intersection(lg[a_[k:k + BATCH]], lg[b_[k:k + BATCH]])) for k in range(0, len(a_), BATCH)]) if len(a_) else np.zeros(0)
        small = np.minimum(la[a_], la[b_])
        dup_ratio = np.divide(inter, small, out=np.zeros(len(inter)), where=small > 0)
        same = dup_ratio >= DUP_MIN_OVERLAP
        a_, b_ = a_[same], b_[same]
        has_h = np.isfinite(ext.height[live])
        rank = np.array([SOURCE_RANK.get(int(s), 9) for s in ext.source[live]])
        # priority: height first, higher confidence, source order, lower index
        order = np.lexsort((ext.index[live], rank, -ext.confidence[live], ~has_h))
        pos = np.empty(len(live), np.int64)
        pos[order] = np.arange(len(live))
        nbr_from = np.concatenate([a_, b_])
        nbr_to = np.concatenate([b_, a_])
        srt = np.argsort(nbr_from, kind="stable")
        nbr_from, nbr_to = nbr_from[srt], nbr_to[srt]
        starts = np.searchsorted(nbr_from, np.arange(len(live) + 1))
        gone = np.zeros(len(live), bool)
        for k in order:
            if gone[k]:
                continue
            for j in nbr_to[starts[k]:starts[k + 1]]:
                if not gone[j] and pos[j] > pos[k]:
                    gone[j] = True
        for s, c in zip(*np.unique(ext.source[live[gone]], return_counts=True)):
            reasons[int(s)]["same building in another source"] += int(c)
        alive[live[gone]] = False
    kept = np.nonzero(alive)[0]
    for s, c in zip(*np.unique(ext.source[kept], return_counts=True)):
        reasons[int(s)]["added"] += int(c)
    return FusionOutcome(kept, osm_heights, validation, reasons, ratio, dup_ratio)


def estimate_floors(game_id: int, area: float) -> tuple[int, str]:
    """Floors and kind of a footprint with no height (G-223): the OSM kind rule by size
    (apartments over 420 m²), then floors by a stable hash: under 50 m² one floor (huts, sheds),
    a house 1 or 2, apartments 3 to 5. Labelled estimated."""
    kind = "apartments" if area > 420 else "house"
    r = hash01(game_id)
    if area < 50:
        return 1, kind
    if kind == "apartments":
        return 3 + math.floor(r * 3), kind
    return 1 + math.floor(r * DEFAULT_FLOORS), kind


def wall_color(game_id: int) -> int:
    return WALL_COLORS[math.floor(hash01(game_id, 7) * len(WALL_COLORS))]


@dataclass(frozen=True)
class Rect:
    cx: float
    cz: float
    length: float  # along `angle`
    width: float
    angle: float  # radians in [0, pi): direction of the long side, atan2(dz, dx)


RECT_TOLERANCE = 0.1  # metres: a 4-point footprint this close to its oriented box is stored as a box


def as_rect(outline: list[tuple[float, float]]) -> Rect | None:
    """The oriented rectangle of a 4-point footprint when it is one (within 10 cm)."""
    if len(outline) != 4:
        return None
    poly = shapely.Polygon(outline)
    env = shapely.oriented_envelope(poly)
    if env.geom_type != "Polygon" or shapely.hausdorff_distance(poly, env) > RECT_TOLERANCE:
        return None
    pts = list(env.exterior.coords)[:4]
    e1 = (pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
    e2 = (pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])
    l1, l2 = math.hypot(*e1), math.hypot(*e2)
    long_e = e1 if l1 >= l2 else e2
    ang = math.atan2(long_e[1], long_e[0]) % math.pi
    c = env.centroid
    return Rect(c.x, c.y, max(l1, l2), min(l1, l2), ang)


def rect_outline(r: Rect) -> list[tuple[float, float]]:
    """Corners anticlockwise seen from above in the game frame (positive shoelace, +X right, +Z down)."""
    ux, uz = math.cos(r.angle) * r.length / 2, math.sin(r.angle) * r.length / 2
    vx, vz = -math.sin(r.angle) * r.width / 2, math.cos(r.angle) * r.width / 2
    pts = [(r.cx - ux - vx, r.cz - uz - vz), (r.cx + ux - vx, r.cz + uz - vz), (r.cx + ux + vx, r.cz + uz + vz), (r.cx - ux + vx, r.cz - uz + vz)]
    return pts
