"""Phase 2: fuse OSM buildings with a second footprint source (Overture buildings) and a height
raster (Google Open Buildings 2.5D), blueprint §11. Designed and tested on small hand-made
fixtures; no download happens here (the hosts are not allowed yet, see docs/world-format.md
"Fusion").

Rules:
- Matching runs in UTM 44N (EPSG:32644) so areas are in m²; output geometry goes back through the
  game's `GeoProjection`, never UTM (one transform at run time, TD-2).
- Candidate pairs from an STRtree. Same building when IoU >= 0.5, or when the smaller footprint
  lies >= 0.8 inside the larger. Several small external footprints inside one OSM footprint are
  all absorbed into it.
- An external footprint with no OSM match becomes a new building, provenance = its dataset.
- Height: OSM height > OSM levels > external height / floors > raster median > estimate.
  Every non-OSM value is labelled (`heightFrom` "overture" / "openbuildings"), never "height".
- Provenance is never dropped: absorbed ids go to `Building.merged`.
"""
from __future__ import annotations

import math
import statistics
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Protocol

import shapely
from pyproj import Transformer
from shapely.geometry import Polygon

from .model import DS_OVERTURE, Building, Ref
from .projection import PROJECTION, GeoProjection
from .rules import FLOOR_HEIGHT, PARAPET, WALL_COLORS, building_kind, MIN_BUILDING_AREA
from .util import hash01, round1

IOU_SAME = 0.5
CONTAIN_SAME = 0.8
_TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32644", always_xy=True)


@dataclass(frozen=True)
class ExternalBuilding:
    """A footprint from another dataset, in WGS84 (lng, lat)."""

    source_id: str  # e.g. Overture GERS id
    outline: Sequence[tuple[float, float]]
    height: float | None = None
    num_floors: int | None = None
    confidence: float | None = None
    origin: str = ""  # which upstream source Overture took it from (OpenStreetMap, Microsoft, Google, Esri)
    dataset: int = DS_OVERTURE


class FootprintSource(Protocol):
    """Overture buildings (DuckDB over GeoParquet with a bbox filter), or a fixture."""

    name: str
    licence: str

    def buildings(self, south: float, west: float, north: float, east: float) -> Iterable[ExternalBuilding]: ...


class HeightRaster(Protocol):
    """Open Buildings 2.5D (4 m cells, metres): values of the cells whose centres lie inside."""

    name: str
    licence: str

    def sample(self, outline_lnglat: Sequence[tuple[float, float]]) -> list[float]: ...


@dataclass
class FusionReport:
    osm_buildings: int = 0
    external_buildings: int = 0
    matched: int = 0
    absorbed: int = 0
    new_buildings: int = 0
    dropped_slivers: int = 0
    height_from: dict[str, int] = field(default_factory=dict)


@dataclass
class FusionResult:
    buildings: list[Building]
    external_ids: list[str]
    report: FusionReport


def _local_to_utm(outline: Sequence[tuple[float, float]], projection: GeoProjection) -> Polygon:
    pts = []
    for x, z in outline:
        ll = projection.to_latlng(x, z)
        pts.append(_TO_UTM.transform(ll.lng, ll.lat))
    return Polygon(pts)


def _lnglat_to_utm(outline: Sequence[tuple[float, float]]) -> Polygon:
    return Polygon([_TO_UTM.transform(lng, lat) for lng, lat in outline])


def _local_outline(outline: Sequence[tuple[float, float]], projection: GeoProjection) -> list[tuple[float, float]]:
    pts = [projection.to_local(lat, lng) for lng, lat in outline]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return [(round(x, 2), round(z, 2)) for x, z in pts]


def _ext_height(e: ExternalBuilding) -> float | None:
    if e.height is not None and 2.5 <= e.height <= 250:
        return e.height
    if e.num_floors is not None and 1 <= e.num_floors <= 60:
        return e.num_floors * FLOOR_HEIGHT + PARAPET
    return None


def fuse(osm: list[Building], external: Iterable[ExternalBuilding], raster: HeightRaster | None = None,
         projection: GeoProjection = PROJECTION, next_id: int = 0x40000000) -> FusionResult:
    """Return OSM buildings (with heights filled and absorbed ids recorded) plus new buildings."""
    ext = list(external)
    rep = FusionReport(osm_buildings=len(osm), external_buildings=len(ext))
    osm_utm = [_local_to_utm(b.outline, projection) for b in osm]
    tree = shapely.STRtree(osm_utm)
    ext_ids: list[str] = []
    out = [Building(**b.__dict__) for b in osm]  # copies; inputs stay untouched
    absorbed_by: dict[int, list[tuple[ExternalBuilding, int]]] = {}
    new: list[Building] = []
    for e in ext:
        g = _lnglat_to_utm(e.outline)
        if not g.is_valid:
            g = shapely.make_valid(g)
        if g.area < MIN_BUILDING_AREA:
            rep.dropped_slivers += 1
            continue
        idx = len(ext_ids)
        ext_ids.append(e.source_id)
        best, best_score = -1, 0.0
        for i in tree.query(g):
            o = osm_utm[int(i)]
            inter = o.intersection(g).area
            if inter <= 0:
                continue
            iou = inter / o.union(g).area
            contain = inter / min(o.area, g.area)
            score = iou if iou >= IOU_SAME else (contain if contain >= CONTAIN_SAME else 0.0)
            if score > best_score:
                best, best_score = int(i), score
        if best >= 0:
            absorbed_by.setdefault(best, []).append((e, idx))
            continue
        outline = _local_outline(e.outline, projection)
        bid = next_id + len(new)
        height = _ext_height(e)
        hf = "overture"
        if height is None and raster is not None:
            cells = raster.sample(e.outline)
            if cells:
                height, hf = statistics.median(cells), "openbuildings"
        if height is None:
            floors = 2
            height, hf = floors * FLOOR_HEIGHT + PARAPET, "estimated"
        size = abs(Polygon(outline).area)
        new.append(Building(id=bid, outline=outline, floors=max(1, math.floor((height - PARAPET) / FLOOR_HEIGHT + 0.5)), height=round1(height),
                            height_from=hf, kind=building_kind({}, size), color=WALL_COLORS[math.floor(hash01(bid, 7) * len(WALL_COLORS))],
                            source=Ref(e.dataset, idx)))
    for i, pairs in absorbed_by.items():
        b = out[i]
        b.merged = [*b.merged, *(Ref(e.dataset, idx) for e, idx in pairs)]
        if len(pairs) == 1:
            rep.matched += 1
        else:
            rep.matched += 1
            rep.absorbed += len(pairs) - 1
        if b.height_from == "estimated":
            hs = [h for h in (_ext_height(e) for e, _ in pairs) if h is not None]
            if hs:
                b.height = round1(max(hs))
                b.height_from = "overture"
            elif raster is not None:
                ll = [(projection.to_latlng(x, z).lng, projection.to_latlng(x, z).lat) for x, z in b.outline]
                cells = raster.sample(ll)
                if cells:
                    b.height = round1(statistics.median(cells))
                    b.height_from = "openbuildings"
            if b.height_from != "estimated":
                b.floors = max(1, math.floor((b.height - PARAPET) / FLOOR_HEIGHT + 0.5))
    rep.new_buildings = len(new)
    allb = out + new
    for b in allb:
        rep.height_from[b.height_from] = rep.height_from.get(b.height_from, 0) + 1
    return FusionResult(allb, ext_ids, rep)
