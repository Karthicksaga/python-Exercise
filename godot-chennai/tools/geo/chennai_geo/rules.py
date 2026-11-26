"""OSM tags -> game features: a port of `toRoads`, `toBuilding`, `areaKind` (buildWorldMap.ts)
for the values today's game has, plus the v2 fields (world-format.md)."""
from __future__ import annotations

import math

from .enums import ROOF_SHAPES
from .geometry import Point, signed_area
from .model import Area, Building, OsmLine, OsmPolygon, Ref, Road, Tags
from .util import hash01, round1, tag_number

# (kind, estimated width). The first block is v1's ROAD_CLASS verbatim.
V1_ROAD_CLASS: dict[str, tuple[str, float]] = {
    "trunk": ("primary", 16), "primary": ("primary", 15), "trunk_link": ("primary", 7),
    "primary_link": ("primary", 7), "secondary": ("secondary", 14), "secondary_link": ("secondary", 7),
    "tertiary": ("tertiary", 10), "tertiary_link": ("tertiary", 6.5), "residential": ("residential", 7),
    "unclassified": ("residential", 7), "living_street": ("residential", 6), "service": ("service", 4),
    "footway": ("footway", 2), "path": ("footway", 2), "pedestrian": ("footway", 3),
}
# New in v2 (outside today's box, or not drawn by today's game). Estimated widths.
V2_ROAD_CLASS: dict[str, tuple[str, float]] = {
    **V1_ROAD_CLASS,
    "motorway": ("motorway", 18), "motorway_link": ("motorway", 7), "track": ("track", 3.5),
    "raceway": ("raceway", 12), "steps": ("footway", 2), "cycleway": ("footway", 2),
    "busway": ("service", 7), "road": ("residential", 6),
}
LANE_WIDTH = 3.3
SHOULDER = 0.8
WALL_COLORS = [0xF2E3C6, 0xE8C9A0, 0xCFE3D4, 0xF4D6CF, 0xD9E2F0, 0xF7EDB5, 0xE3D5EE, 0xFBF3E4, 0xC9DCCB, 0xEAD9C4, 0xDFE7D2, 0xF1DDB8]
FLOOR_HEIGHT = 3.1
PARAPET = 0.9
DEFAULT_FLOORS = 2
MIN_BUILDING_AREA = 12.0

_TRUE = {"yes", "1", "true"}


def _layer(tags: Tags) -> int:
    v = tag_number(tags.get("layer"))
    return int(max(-5, min(5, v))) if not math.isnan(v) else 0


def _maxspeed(tags: Tags) -> int:
    v = tag_number(tags.get("maxspeed"))
    if math.isnan(v) or v <= 0:
        return 0
    if "mph" in tags.get("maxspeed", ""):
        v *= 1.609
    return int(min(255, round(v)))


def road_from_way(way: OsmLine, piece: list[Point], index: int, v2: bool = True) -> Road | None:
    tags = way.tags
    klass = (V2_ROAD_CLASS if v2 else V1_ROAD_CLASS).get(tags.get("highway", ""))
    if not klass:
        return None
    kind, est = klass
    footway = kind == "footway"
    mapped_lanes = tag_number(tags.get("lanes"))
    mapped_width = tag_number(tags.get("width"))
    lanes = round_js_int(mapped_lanes) if (not footway and 1 <= mapped_lanes <= 10) else None
    width: float = est
    width_from = "class"
    if 2 <= mapped_width <= 40:
        width = mapped_width
        width_from = "width"
    elif lanes is not None:
        width = max(4, lanes * LANE_WIDTH + SHOULDER)
        width_from = "lanes"
    width = round1(width)
    ow = tags.get("oneway")
    oneway = ow in ("yes", "1", "true", "-1") or tags.get("junction") == "roundabout"
    return Road(
        id=way.id * 10 + index,
        kind=kind,
        width=width,
        oneway=oneway,
        points=piece,
        name=tags.get("name") or None,
        lanes=lanes,
        highway=tags.get("highway", ""),
        width_from=width_from,
        bridge=tags.get("bridge", "no") not in ("no", ""),
        tunnel=tags.get("tunnel", "no") not in ("no", "") or tags.get("covered") == "yes",
        layer=_layer(tags),
        surface=tags.get("surface", ""),
        maxspeed=_maxspeed(tags),
        ref=tags.get("ref") or None,
        sidewalk=tags.get("sidewalk", tags.get("sidewalk:both", "")),
        lit=tags.get("lit") in _TRUE,
        roundabout=tags.get("junction") == "roundabout",
        source=Ref(0, way.id),
    )


def round_js_int(v: float) -> int:
    return int(math.floor(v + 0.5))


def oriented_points(way: OsmLine) -> list[Point]:
    """`oneway=-1` runs against the way's direction: stored the way traffic goes."""
    return list(reversed(way.points)) if way.tags.get("oneway") == "-1" else way.points


def building_kind(tags: Tags, area: float) -> str:
    v = tags.get("building")
    if v in ("apartments", "residential"):
        return "apartments"
    if v in ("commercial", "retail", "office") or tags.get("shop") or tags.get("amenity"):
        return "commercial"
    return "apartments" if area > 420 else "house"


def tagged_kind(tags: Tags) -> str | None:
    v = tags.get("building")
    if v in ("apartments", "residential"):
        return "apartments"
    if v in ("commercial", "retail", "office"):
        return "commercial"
    return None


_USE = {
    "house": "house", "detached": "house", "semidetached_house": "house", "terrace": "house", "bungalow": "house",
    "residential": "residential", "apartments": "residential", "dormitory": "residential",
    "commercial": "commercial", "retail": "retail", "supermarket": "retail", "kiosk": "retail", "office": "office",
    "industrial": "industrial", "factory": "industrial", "manufacture": "industrial", "warehouse": "warehouse",
    "temple": "religious", "church": "religious", "mosque": "religious", "religious": "religious", "chapel": "religious",
    "shrine": "religious", "cathedral": "religious", "school": "school", "college": "school", "university": "school",
    "kindergarten": "school", "hospital": "hospital", "public": "public", "government": "public", "civic": "public",
    "train_station": "transport", "transportation": "transport", "terminal": "transport", "hangar": "hangar",
    "shed": "shed", "garage": "garage", "garages": "garage", "carport": "garage", "hut": "hut", "cabin": "hut",
    "construction": "construction", "roof": "roof", "yes": "unknown",
}


def building_use(tags: Tags) -> str:
    if tags.get("aeroway") == "terminal":
        return "transport"
    if tags.get("aeroway") == "hangar":
        return "hangar"
    return _USE.get(tags.get("building", ""), "other")


def roof_shape(tags: Tags) -> str:
    v = tags.get("roof:shape", "").strip().lower().replace("_", "-")
    if not v:
        return "unknown"
    return v if v in ROOF_SHAPES else "other"


def to_building(poly: OsmPolygon, building_id: int | None = None) -> Building | None:
    """Port of `toBuilding` (exact for the v1 fields) plus v2 fields. `building_id` overrides the
    game id (multipolygon parts, see world-format.md "Building ids")."""
    raw = poly.outline
    area = signed_area(raw)
    if abs(area) < MIN_BUILDING_AREA:
        return None
    outline = list(reversed(raw)) if area < 0 else list(raw)
    size = abs(area)
    tags = poly.tags
    bid = poly.id if building_id is None else building_id
    kind = building_kind(tags, size)
    mh = tag_number(tags.get("height"))
    ml = tag_number(tags.get("building:levels"))
    levels_mapped = False
    if 2.5 <= mh <= 250:
        height = mh
        floors = max(1, round_js_int((height - PARAPET) / FLOOR_HEIGHT))
        height_from = "height"
    else:
        if 1 <= ml <= 60:
            floors = round_js_int(ml)
            height_from = "levels"
            levels_mapped = True
        else:
            tk = tagged_kind(tags)
            r = hash01(bid)
            floors = 3 + math.floor(r * 3) if tk == "apartments" else 2 + math.floor(r * 3) if tk == "commercial" else DEFAULT_FLOORS
            height_from = "estimated"
        height = floors * FLOOR_HEIGHT + PARAPET
    holes = [(list(reversed(h)) if signed_area(h) > 0 else list(h)) for h in poly.holes]
    min_h = tag_number(tags.get("min_height", tags.get("building:min_height")))
    rl = tag_number(tags.get("roof:levels"))
    return Building(
        id=bid,
        outline=outline,
        floors=floors,
        height=round1(height),
        height_from=height_from,
        kind=kind,
        color=WALL_COLORS[math.floor(hash01(bid, 7) * len(WALL_COLORS))],
        name=tags.get("name") or None,
        holes=holes,
        use=building_use(tags),
        roof_shape=roof_shape(tags),
        roof_levels=int(rl) if 0 <= rl <= 20 else 0,
        min_height=round1(min_h) if 0 < min_h < 200 else 0.0,
        levels_mapped=levels_mapped,
        source=poly.ref,
        tags=tags,
    )


def v1_area_kind(tags: Tags) -> str | None:
    if tags.get("leisure") in ("park", "garden", "playground") or tags.get("landuse") in ("grass", "recreation_ground"):
        return "park"
    if tags.get("natural") == "water":
        return "water"
    if tags.get("natural") in ("beach", "sand"):
        return "beach"
    return None


_LANDUSE = {
    "reservoir": "reservoir", "basin": "reservoir", "farmland": "farmland", "farmyard": "farmland", "paddy": "farmland",
    "plant_nursery": "farmland", "greenhouse_horticulture": "farmland", "aquaculture": "reservoir",
    "orchard": "orchard", "plantation": "orchard", "meadow": "meadow", "village_green": "meadow", "forest": "forest",
    "residential": "residential", "commercial": "commercial", "retail": "commercial", "industrial": "industrial",
    "port": "industrial", "depot": "industrial", "military": "military", "cemetery": "cemetery",
    "brownfield": "bare", "construction": "bare", "quarry": "bare", "landfill": "bare", "greenfield": "bare",
    "salt_pond": "saltpan", "railway": "railway",
}
_NATURAL = {
    "wetland": "wetland", "wood": "forest", "scrub": "scrub", "heath": "scrub", "grassland": "meadow",
    "bare_rock": "bare", "mud": "wetland", "shingle": "beach",
}


def v2_area_kind(tags: Tags) -> str | None:
    """v1 rule first (so the v1 kinds stay identical), then the rural/airport kinds."""
    k = v1_area_kind(tags)
    if k:
        return k
    if tags.get("aeroway") == "aerodrome":
        return "aerodrome"
    if tags.get("aeroway") == "apron":
        return "apron"
    if tags.get("aeroway") in ("helipad", "heliport"):
        return "helipad"
    if tags.get("waterway") in ("riverbank", "dock"):
        return "reservoir"
    nat = tags.get("natural")
    if nat == "wetland" and tags.get("wetland") == "mangrove":
        return "mangrove"
    if nat in _NATURAL:
        return _NATURAL[nat]
    lu = tags.get("landuse")
    if lu in _LANDUSE:
        return _LANDUSE[lu]
    if tags.get("leisure") in ("pitch", "stadium", "golf_course", "sports_centre", "track"):
        return "sport"
    if tags.get("amenity") == "grave_yard":
        return "cemetery"
    return None


def to_area(poly: OsmPolygon, kind: str) -> Area:
    return Area(id=poly.id, kind=kind, outline=poly.outline, name=poly.tags.get("name") or None, holes=poly.holes, source=poly.ref)
