"""Read an OSM PBF (or .osm/.osm.json) into `OsmFeatures`, in local metres.

The selection mirrors `scripts/clip-city.py` + `packages/map-data/src/osm.ts` exactly for what
today's game uses (so ring 0 reproduces today's world), and adds what v2 needs:
multipolygon relations (buildings and areas with holes), `aeroway=*` (the airport), rural
`landuse`/`natural`, `waterway=riverbank|dock` and `amenity=grave_yard` areas.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path

import osmium

from .detail import category_of, detail_node_selected, line_kind, zone_kind
from .model import OsmFeatures, OsmLine, OsmPoint, OsmPolygon, Tags
from .projection import PROJECTION, GeoProjection
from .util import round2

WAY_KEYS = ("building", "highway", "leisure", "landuse", "natural", "waterway")
NODE_KEYS = ("amenity", "shop", "tourism", "historic", "place", "man_made")
AREA_KEYS_V1 = ("leisure", "natural", "landuse", "man_made", "historic", "tourism")
# Format 2.1 additions (`infra.bin`, G-150), collected into their own lists.
WATERWAY_LINES = ("river", "canal", "stream", "drain", "ditch")
RAILWAY_LINES = ("rail", "light_rail", "subway", "narrow_gauge", "monorail", "construction")


def node_label(tags: Tags) -> str | None:
    """clip-city.py's tagged-node rule (+ `aeroway` for v2)."""
    if tags.get("natural") == "tree":
        return "tree"
    if tags.get("highway") in ("bus_stop", "traffic_signals"):
        return tags["highway"]
    for k in NODE_KEYS:
        if k in tags:
            return k
    if "aeroway" in tags:
        return "aeroway"
    return None


def spot_selected(tags: Tags) -> bool:
    """Street spots for `infra.bin`: pedestrian crossings and traffic calming (speed breakers)."""
    return tags.get("highway") == "crossing" or "traffic_calming" in tags


def way_selected(tags: Tags) -> bool:
    return (
        any(k in tags for k in WAY_KEYS)
        or tags.get("amenity") in ("place_of_worship", "grave_yard")
        or tags.get("man_made") == "tower"
        or "aeroway" in tags
    )


def is_area_tags(tags: Tags) -> bool:
    return (
        any(k in tags for k in AREA_KEYS_V1)
        or tags.get("amenity") in ("place_of_worship", "grave_yard")
        or "aeroway" in tags
        or tags.get("waterway") in ("riverbank", "dock")
    )


class _Handler(osmium.SimpleHandler):
    def __init__(self, projection: GeoProjection) -> None:
        super().__init__()
        self.p = projection
        self.f = OsmFeatures(timestamp="unknown")
        self.count: Counter[str] = Counter()

    def _local(self, lat: float, lon: float) -> tuple[float, float]:
        x, z = self.p.to_local(round(lat, 7), round(lon, 7))
        return (round2(x), round2(z))

    def node(self, n: osmium.osm.Node) -> None:
        if not n.tags:
            return
        tags = {t.k: t.v for t in n.tags}
        if spot_selected(tags) and n.location.valid():
            x, z = self._local(n.location.lat, n.location.lon)
            self.f.spots.append(OsmPoint(n.id, tags, x, z))
        if detail_node_selected(tags) and n.location.valid():
            x, z = self._local(n.location.lat, n.location.lon)
            self.f.detail_points.append(OsmPoint(n.id, tags, x, z))
        if node_label(tags) is None or not n.location.valid():
            return
        x, z = self._local(n.location.lat, n.location.lon)
        self.f.points.append(OsmPoint(n.id, tags, x, z))

    def way(self, w: osmium.osm.Way) -> None:
        tags = {t.k: t.v for t in w.tags}
        if tags.get("railway") in RAILWAY_LINES and (tags.get("railway") != "construction" or tags.get("construction") in RAILWAY_LINES):
            rail = [self._local(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
            if len(rail) >= 2:
                self.f.railways.append(OsmLine(w.id, tags, rail))
        detail = bool(line_kind(tags) or zone_kind(tags) or "building:part" in tags or ("building" not in tags and category_of(tags)))
        if not way_selected(tags) and not detail:
            return
        refs = [nd.ref for nd in w.nodes]
        line = []
        for nd in w.nodes:
            if nd.location.valid():
                line.append(self._local(nd.location.lat, nd.location.lon))
        if len(line) < 2:
            self.count["way:dropped-no-locations"] += 1
            return
        if detail:
            self._detail_way(tags, w.id, refs, line)
        if not way_selected(tags):
            return
        if "aeroway" in tags and tags["aeroway"] in ("runway", "taxiway", "stopway", "holding_position", "parking_position") and not (len(refs) > 3 and refs[0] == refs[-1] and tags.get("area") == "yes"):
            self.f.aeroway_lines.append(OsmLine(w.id, tags, line))
            return
        if tags.get("waterway") in WATERWAY_LINES and tags.get("area") != "yes":
            self.f.waterways.append(OsmLine(w.id, tags, line))
        if "highway" in tags:
            self.f.highways.append(OsmLine(w.id, tags, line))
            return
        closed = len(refs) > 3 and refs[0] == refs[-1]
        if tags.get("natural") == "coastline" and not closed:
            self.f.coastlines.append(OsmLine(w.id, tags, line))
            return
        if not closed or len(line) != len(refs):
            return
        outline = line[:-1]
        if len(outline) < 3:
            return
        if "building" in tags:
            self.f.buildings.append(OsmPolygon(w.id, tags, outline))
        elif is_area_tags(tags):
            self.f.areas.append(OsmPolygon(w.id, tags, outline))

    def _detail_way(self, tags: Tags, wid: int, refs: list[int], line: list[tuple[float, float]]) -> None:
        """Format 2.2 (`detail.py`): parts, barriers, tree rows, platforms, pitches, pools; kept
        in their own lists so the 2.0 files do not change."""
        closed = len(refs) > 3 and refs[0] == refs[-1] and len(line) == len(refs)
        if "building:part" in tags and closed and len(line) > 3:
            self.f.parts.append(OsmPolygon(wid, tags, line[:-1]))
        lk = line_kind(tags)
        zk = zone_kind(tags)
        if closed and len(line) > 3 and (zk or ("building" not in tags and category_of(tags))) and "building:part" not in tags:
            self.f.detail_polys.append(OsmPolygon(wid, tags, line[:-1]))
        elif lk and not (closed and lk == "platform"):
            self.f.detail_lines.append(OsmLine(wid, tags, line))

    def area(self, a: osmium.osm.Area) -> None:
        if a.from_way():
            return  # closed ways are handled in `way`, exactly like the v1 pipeline
        tags = {t.k: t.v for t in a.tags}
        if "building:part" in tags and "building" not in tags:
            part = 0
            for outer in a.outer_rings():
                ring = [self._local(n.lat, n.lon) for n in outer][:-1]
                holes = [[self._local(n.lat, n.lon) for n in inner][:-1] for inner in a.inner_rings(outer)]
                if len(ring) >= 3:
                    self.f.parts.append(OsmPolygon(a.orig_id(), tags, ring, [h for h in holes if len(h) >= 3], source="relation", part=part))
                    part += 1
            return
        is_building = "building" in tags
        if not is_building and not is_area_tags(tags):
            return
        rid = a.orig_id()
        part = 0
        for outer in a.outer_rings():
            ring = [self._local(n.lat, n.lon) for n in outer][:-1]
            holes = [[self._local(n.lat, n.lon) for n in inner][:-1] for inner in a.inner_rings(outer)]
            holes = [h for h in holes if len(h) >= 3]
            if len(ring) < 3:
                continue
            poly = OsmPolygon(rid, tags, ring, holes, source="relation", part=part)
            (self.f.buildings if is_building else self.f.areas).append(poly)
            part += 1
        self.count["relation:" + ("building" if is_building else "area")] += 1


def parse_osm(path: Path, projection: GeoProjection = PROJECTION, timestamp: str | None = None) -> OsmFeatures:
    h = _Handler(projection)
    h.apply_file(str(path), locations=True)
    if timestamp is None:
        try:
            timestamp = osmium.io.Reader(str(path), osmium.osm.osm_entity_bits.NOTHING).header().get("osmosis_replication_timestamp", "unknown")
        except Exception:  # noqa: BLE001 - header is optional
            timestamp = "unknown"
    h.f.timestamp = timestamp or "unknown"
    h.f.stats = dict(h.count)
    return h.f
