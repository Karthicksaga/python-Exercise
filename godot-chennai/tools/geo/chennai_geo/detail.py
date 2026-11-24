"""Format 2.2 (`detail.bin`, decisions G-190..): the rest of what OpenStreetMap carries about
buildings and the street, per region tile, in the same data-driven way as `infra.bin`.

- **Building detail** (`BLDG`): mapped wall and roof colours, wall and roof material, the sign
  category of what is inside (shop, amenity, office, tourism, religion), and whether the
  building is only the outline of its `building:part`s (then the parts are drawn, not it).
- **Building parts** (`PART`): `building:part` polygons with their own height, `min_height`,
  roof shape and colours, so a building can step up and have a tower or an overhang.
- **Street objects** (`OBJ`): bus platforms, benches, waste baskets, drinking water, post boxes,
  toilets, street lamps, power poles and towers, bollards and gates (nodes).
- **Lines** (`LINE`): walls, fences, hedges, retaining walls, kerbs, jersey barriers, tree rows
  and railway platforms. Cut at tile edges like road pieces.
- **Zones** (`ZONE`): pitches (with the sport), playgrounds, swimming pools, running tracks,
  allotments, station platforms.
- **Signs** (`SIGN`): every mapped shop, amenity, office and tourism node and every such area
  that is not a building, as a *category* (`assets/city/sign_categories.json`); the OSM name is
  never kept, except `name:ta` / `name:en` of public places (a temple, a station, a hospital),
  which a sign may show (TD-18).

Nothing here is invented except what a field says it is not mapped: colours and roof shapes the
renderer picks when a field is 0 are **estimated** by a stable hash (the coverage report counts
both). Heights of parts follow the same rule as buildings (`height`, then `building:levels`).
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from shapely import STRtree
from shapely.geometry import Point as ShPoint
from shapely.geometry import Polygon

from .binio import Reader, Writer
from .enums import ROOF_SHAPES
from .geometry import Bounds, Point, area_centroid, centroid, clip_line, signed_area
from .model import DS_OSM_RELATION, DS_OSM_WAY, Building, OsmFeatures, OsmLine, OsmPoint, OsmPolygon, Ref, Tags
from .util import js_round, round1, tag_number

DETAIL_MAGIC = 0x44574F43  # "COWD"
FORMAT = 2
MINOR = 2
Q = 20
CATEGORIES_FILE = Path(__file__).resolve().parents[3] / "assets" / "city" / "sign_categories.json"

# Enumerations (append only; docs/world-format.md 3.8 lists them).
OBJ_KINDS = ["bus_platform", "bench", "waste_basket", "drinking_water", "post_box", "toilets", "street_lamp", "power_pole", "power_tower", "bollard", "gate"]
LINE_KINDS = ["wall", "fence", "hedge", "retaining_wall", "kerb", "jersey_barrier", "tree_row", "platform", "guard_rail", "bus_platform"]
ZONE_KINDS = ["pitch", "playground", "swimming_pool", "track", "allotments", "platform", "bus_platform"]
SPORTS = ["", "football", "cricket", "basketball", "tennis", "volleyball", "badminton", "kabaddi", "athletics", "hockey", "other"]
MATERIALS = ["", "brick", "concrete", "stone", "plaster", "glass", "metal", "wood", "other"]
ROOF_MATERIALS = ["", "tiles", "metal", "concrete", "glass", "thatch", "other"]

# BLDG / PART flags.
F_PARTS_HOST = 1  # the building is the outline of its parts: draw the parts, not it
F_WALL_COLOUR = 2
F_ROOF_COLOUR = 4
F_HEIGHT_MAPPED = 8  # PART: `height` or `building:levels` was mapped (else the host's, estimated)
F_PART_OF_RELATION = 16
# OBJ flags
OF_NO_ROAD = 1  # reserved
# LINE flags
LF_HEIGHT_MAPPED = 1
LF_CLOSED = 2
# SIGN flags
SF_NODE = 1
SF_AREA = 2
SF_PUBLIC_NAME = 4  # carries name:ta / name:en

KEY_ORDER = ["shop", "religion", "amenity", "healthcare", "office", "tourism", "railway", "public_transport", "building"]
WORSHIP_BUILDINGS = {"temple", "hindu_temple", "church", "cathedral", "chapel", "mosque", "shrine"}

OBJ_AMENITY = {"bench": "bench", "waste_basket": "waste_basket", "drinking_water": "drinking_water", "post_box": "post_box", "toilets": "toilets"}
OBJ_BARRIER = {"bollard": "bollard", "gate": "gate", "lift_gate": "gate"}
LINE_BARRIER = {"wall": "wall", "fence": "fence", "hedge": "hedge", "retaining_wall": "retaining_wall", "kerb": "kerb", "jersey_barrier": "jersey_barrier", "guard_rail": "guard_rail", "city_wall": "wall"}
ZONE_LEISURE = {"pitch": "pitch", "playground": "playground", "swimming_pool": "swimming_pool", "track": "track"}
# Default drawn height (m) of a barrier with no `height` tag (estimated).
LINE_HEIGHT = {"wall": 1.9, "fence": 1.5, "hedge": 1.2, "retaining_wall": 1.6, "kerb": 0.15, "jersey_barrier": 0.8, "tree_row": 0.0, "platform": 0.9, "guard_rail": 0.8}

COLOUR_NAMES = {
    "white": 0xF4F1EA, "black": 0x2B2B2B, "grey": 0x9A9A9A, "gray": 0x9A9A9A, "silver": 0xC0C0C0, "red": 0xB8453A, "maroon": 0x7A2F2F,
    "brown": 0x8B5E3C, "tan": 0xC9A77C, "beige": 0xE4D5B7, "cream": 0xF2E8C9, "ivory": 0xF0EAD6, "yellow": 0xE8C547, "orange": 0xD9822B,
    "pink": 0xE8A0B0, "purple": 0x7B4F9D, "blue": 0x4A78B5, "lightblue": 0x9CC3E4, "darkblue": 0x2D4A7A, "cyan": 0x4AB5C4, "green": 0x4F9A55,
    "lightgreen": 0xA5D6A0, "darkgreen": 0x2F6B3A, "olive": 0x8A8A3C, "gold": 0xC9A227, "terracotta": 0xB0553A, "stone": 0xB8AD9A,
    "lightgray": 0xCFCFCF, "lightgrey": 0xCFCFCF, "darkgray": 0x5A5A5A, "darkgrey": 0x5A5A5A, "salmon": 0xE49A86, "lime": 0xA6D14B,
}
_HEX = re.compile(r"^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")

_MATERIAL = {
    "brick": "brick", "bricks": "brick", "concrete": "concrete", "cement_block": "concrete", "reinforced_concrete": "concrete", "stone": "stone",
    "sandstone": "stone", "granite": "stone", "limestone": "stone", "marble": "stone", "plaster": "plaster", "render": "plaster",
    "stucco": "plaster", "glass": "glass", "metal": "metal", "steel": "metal", "aluminium": "metal", "aluminum": "metal", "wood": "wood",
    "timber_framing": "wood", "mud": "other", "adobe": "other", "tin": "metal", "corrugated_iron": "metal",
}
_ROOF_MATERIAL = {
    "roof_tiles": "tiles", "tiles": "tiles", "tile": "tiles", "clay": "tiles", "slate": "tiles", "metal": "metal", "metal_sheet": "metal",
    "tin": "metal", "corrugated_iron": "metal", "steel": "metal", "concrete": "concrete", "reinforced_concrete": "concrete", "glass": "glass",
    "thatch": "thatch", "grass": "thatch", "tar_paper": "concrete", "asbestos": "metal", "copper": "metal", "stone": "concrete",
}


# Categories -----------------------------------------------------------------------------------

@dataclass(frozen=True)
class Category:
    id: int
    key: str
    english: str
    tamil: str
    public: bool


@dataclass
class Categories:
    items: list[Category]
    rules: dict[str, list[tuple[str, int]]]  # tag key -> [(value or "*", category id)]

    def by_id(self, i: int) -> Category:
        return self.items[i - 1]

    def words(self) -> set[str]:
        out: set[str] = set()
        for c in self.items:
            out.add(c.english.lower())
            out.add(c.tamil)
        return out


_CATS: Categories | None = None


def load_categories(path: Path = CATEGORIES_FILE) -> Categories:
    global _CATS  # noqa: PLW0603
    if _CATS is not None and path == CATEGORIES_FILE:
        return _CATS
    doc = json.loads(path.read_text())
    items: list[Category] = []
    rules: dict[str, list[tuple[str, int]]] = {}
    for c in doc["categories"]:
        items.append(Category(c["id"], c["key"], c["english"], c["tamil"], bool(c["public"])))
        if c["id"] != len(items):
            raise ValueError("Sign category ids must be 1..N in order.")
        for rule in c["tags"]:
            k, v = rule.split("=", 1)
            rules.setdefault(k, []).append((v, c["id"]))
    cats = Categories(items, rules)
    if path == CATEGORIES_FILE:
        _CATS = cats
    return cats


def category_of(tags: Tags, cats: Categories | None = None) -> int:
    """Sign category id of an object's tags (0 = none). Never reads `name`."""
    cats = cats or load_categories()
    worship = tags.get("amenity") == "place_of_worship" or tags.get("building") in WORSHIP_BUILDINGS
    for key in KEY_ORDER:
        value = tags.get(key)
        if value is None or (key == "religion" and not worship):
            continue
        star = 0
        for v, cid in cats.rules.get(key, []):
            if v == value:
                return cid
            if v == "*" and not star:
                star = cid
        if star:
            return star
    return 0


def parse_colour(value: str | None) -> int | None:
    """0xRRGGBB from `#rrggbb`, `#rgb` or a basic colour name; None when unreadable."""
    if not value:
        return None
    v = value.strip().lower().replace(" ", "").replace("_", "")
    m = _HEX.match(v)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return int(h, 16)
    return COLOUR_NAMES.get(v)


def material_of(value: str | None) -> int:
    v = (value or "").strip().lower()
    return MATERIALS.index(_MATERIAL[v]) if v in _MATERIAL else 0


def roof_material_of(value: str | None) -> int:
    v = (value or "").strip().lower()
    return ROOF_MATERIALS.index(_ROOF_MATERIAL[v]) if v in _ROOF_MATERIAL else (ROOF_MATERIALS.index("other") if v else 0)


def sport_of(value: str | None) -> int:
    v = (value or "").split(";")[0].strip().lower()
    if not v:
        return 0
    table = {"soccer": "football", "football": "football", "cricket": "cricket", "cricket_nets": "cricket", "basketball": "basketball", "tennis": "tennis",
             "volleyball": "volleyball", "badminton": "badminton", "kabaddi": "kabaddi", "athletics": "athletics", "running": "athletics",
             "field_hockey": "hockey", "hockey": "hockey"}
    return SPORTS.index(table.get(v, "other"))


# Selection (used by osm_parse) -------------------------------------------------------------

def object_kind(tags: Tags) -> str | None:
    if tags.get("public_transport") == "platform" or tags.get("highway") == "platform":
        return "bus_platform"
    if tags.get("amenity") in OBJ_AMENITY:
        return OBJ_AMENITY[tags["amenity"]]
    if tags.get("man_made") == "street_lamp" or tags.get("highway") == "street_lamp":
        return "street_lamp"
    p = tags.get("power")
    if p == "pole":
        return "power_pole"
    if p == "tower":
        return "power_tower"
    if tags.get("barrier") in OBJ_BARRIER:
        return OBJ_BARRIER[tags["barrier"]]
    return None


def detail_node_selected(tags: Tags) -> bool:
    return object_kind(tags) is not None or category_of(tags) != 0


def line_kind(tags: Tags) -> str | None:
    if tags.get("barrier") in LINE_BARRIER:
        return LINE_BARRIER[tags["barrier"]]
    if tags.get("natural") == "tree_row":
        return "tree_row"
    if tags.get("railway") == "platform" or tags.get("public_transport") == "platform":
        return _platform_kind(tags)
    return None


def _platform_kind(tags: Tags) -> str:
    """A railway platform (raised, with an edge line) or a bus platform (kerb height)."""
    rail = tags.get("railway") == "platform" or tags.get("train") == "yes" or tags.get("subway") == "yes" or tags.get("light_rail") == "yes"
    return "platform" if rail else "bus_platform"


def zone_kind(tags: Tags) -> str | None:
    if tags.get("leisure") in ZONE_LEISURE:
        return ZONE_LEISURE[tags["leisure"]]
    if tags.get("landuse") == "allotments":
        return "allotments"
    if tags.get("railway") == "platform" or tags.get("public_transport") == "platform":
        return _platform_kind(tags)
    return None


# Records ----------------------------------------------------------------------------------------

@dataclass
class BuildingDetail:
    id: int
    flags: int = 0
    material: int = 0
    roof_material: int = 0
    category: int = 0
    wall: int = 0
    roof: int = 0


@dataclass
class Part:
    id: int  # game id (derived, 0x20000000 | way id)
    source: Ref
    flags: int
    height: float
    min_height: float
    floors: int
    roof_shape: str
    roof_levels: int
    material: int
    roof_material: int
    wall: int
    roof: int
    outline: list[Point]
    holes: list[list[Point]] = field(default_factory=list)


@dataclass
class ObjectSpot:
    kind: str
    x: float
    z: float
    mapped: bool = True


@dataclass
class LineFeature:
    kind: str
    height: float  # 0 = not mapped
    points: list[Point]
    closed: bool = False


@dataclass
class Zone:
    kind: str
    sport: str
    outline: list[Point]
    source: Ref


@dataclass
class SignSpot:
    category: int
    flags: int
    x: float
    z: float
    name_ta: str = ""
    name_en: str = ""


@dataclass
class Detail:
    """Everything of format 2.2, by world position (the writer cuts it into tiles)."""

    buildings: list[BuildingDetail] = field(default_factory=list)
    building_points: dict[int, Point] = field(default_factory=dict)
    parts: list[Part] = field(default_factory=list)
    objects: list[ObjectSpot] = field(default_factory=list)
    lines: list[LineFeature] = field(default_factory=list)
    zones: list[Zone] = field(default_factory=list)
    signs: list[SignSpot] = field(default_factory=list)
    stats: Counter[str] = field(default_factory=Counter)


def part_game_id(poly: OsmPolygon) -> int:
    return 0x20000000 | ((poly.id * 8 + min(poly.part, 7)) & 0x1FFFFFFF)


def building_detail(b: Building, cats: Categories) -> BuildingDetail | None:
    t = b.tags
    d = BuildingDetail(b.id)
    wall = parse_colour(t.get("building:colour") or t.get("colour"))
    roof = parse_colour(t.get("roof:colour") or t.get("building:roof:colour"))
    if wall is not None:
        d.flags |= F_WALL_COLOUR
        d.wall = wall
    if roof is not None:
        d.flags |= F_ROOF_COLOUR
        d.roof = roof
    d.material = material_of(t.get("building:material") or t.get("material"))
    d.roof_material = roof_material_of(t.get("roof:material") or t.get("building:roof:material"))
    d.category = category_of(t, cats)
    if not (d.flags or d.material or d.roof_material or d.category):
        return None
    return d


def part_from_poly(poly: OsmPolygon, host_height: float | None) -> Part | None:
    t = poly.tags
    outline = list(poly.outline)
    area = signed_area(outline)
    if abs(area) < 4:
        return None
    if area < 0:
        outline.reverse()
    holes = [(list(reversed(h)) if signed_area(h) > 0 else list(h)) for h in poly.holes]
    flags = 0
    h = tag_number(t.get("height"))
    lv = tag_number(t.get("building:levels"))
    if 1.0 <= h <= 250:
        height, floors, flags = h, max(1, round((h - 0.9) / 3.1)), F_HEIGHT_MAPPED
    elif 1 <= lv <= 60:
        floors = int(math.floor(lv + 0.5))
        height, flags = floors * 3.1 + 0.9, F_HEIGHT_MAPPED
    else:
        height = host_height if host_height else 2 * 3.1 + 0.9
        floors = max(1, round((height - 0.9) / 3.1))
    mh = tag_number(t.get("min_height"))
    ml = tag_number(t.get("building:min_level"))
    if 0 < mh < 200:
        min_h = mh
    elif 0 < ml < 60:
        min_h = ml * 3.1
    else:
        min_h = 0.0
    if min_h >= height - 0.5:
        min_h = max(0.0, height - 3.1)
    wall = parse_colour(t.get("building:colour") or t.get("colour"))
    roof = parse_colour(t.get("roof:colour") or t.get("building:roof:colour"))
    if wall is not None:
        flags |= F_WALL_COLOUR
    if roof is not None:
        flags |= F_ROOF_COLOUR
    if poly.source == "relation":
        flags |= F_PART_OF_RELATION
    shape = t.get("roof:shape", "").strip().lower().replace("_", "-")
    shape = shape if shape in ROOF_SHAPES else ("other" if shape else "unknown")
    rl = tag_number(t.get("roof:levels"))
    return Part(part_game_id(poly), poly.ref, flags, round1(height), round1(min_h), floors, shape, int(rl) if 0 <= rl <= 20 else 0,
                material_of(t.get("building:material") or t.get("material")), roof_material_of(t.get("roof:material")),
                wall or 0, roof or 0, outline, holes)


def _tile_xz(grid: Any, tile_chunks: int, p: Point) -> tuple[int, int]:
    return (grid.col(p[0]) // tile_chunks, grid.row(p[1]) // tile_chunks)


def build_detail(f: OsmFeatures, buildings: list[Building], playable: Any, under_landmark: Any = None, stats: Counter[str] | None = None) -> Detail:
    """Collect format 2.2 from the parsed OSM features and the buildings the world kept.
    `playable` has `inside(point, margin)`; `under_landmark(point)` is true inside a landmark's
    footprint (its model replaces the OSM building and its parts)."""
    cats = load_categories()
    d = Detail()
    d.stats = stats if stats is not None else Counter()
    st = d.stats
    words = cats.words()

    def generic_name(tags: Tags) -> None:
        """Counts places whose mapped name is itself a category word ("Temple", "Tea Shop"): the
        sign says the same word, but it comes from the table, never from the name."""
        if any((tags.get(k) or "").strip().lower() in words for k in ("name", "name:en", "name:ta")):
            st["sign:name-is-a-category-word"] += 1

    # Building parts: each part's host is the building containing its centroid.
    polys = [Polygon(b.outline, b.holes) for b in buildings]
    tree = STRtree(polys) if polys else None
    host_area: dict[int, float] = {}
    for src in f.parts:
        c = area_centroid(src.outline) if len(src.outline) >= 3 else None
        if c is None or not playable.inside(c, 2) or (under_landmark is not None and under_landmark(c)):
            continue
        host: Building | None = None
        if tree is not None:
            for i in tree.query(ShPoint(c)):
                if polys[int(i)].contains(ShPoint(c)):
                    host = buildings[int(i)]
                    break
        part = part_from_poly(src, host.height if host else None)
        if part is None:
            continue
        d.parts.append(part)
        st["part"] += 1
        if part.flags & F_HEIGHT_MAPPED:
            st["part:height-mapped"] += 1
        if part.min_height > 0:
            st["part:min-height"] += 1
        if host is not None:
            host_area[host.id] = host_area.get(host.id, 0.0) + abs(signed_area(part.outline))
    hosts = {b.id: b for b in buildings}
    covered: set[int] = {i for i, a in host_area.items() if a >= 0.6 * abs(signed_area(hosts[i].outline))}
    for b in buildings:
        bd = building_detail(b, cats)
        if b.id in covered:
            bd = bd or BuildingDetail(b.id)
            bd.flags |= F_PARTS_HOST
            st["building:parts-host"] += 1
        if bd is not None:
            d.buildings.append(bd)
            d.building_points[b.id] = centroid(b.outline)
            if bd.flags & F_WALL_COLOUR:
                st["building:colour-mapped"] += 1
            if bd.flags & F_ROOF_COLOUR:
                st["building:roof-colour-mapped"] += 1
            if bd.material:
                st["building:material-mapped"] += 1
            if bd.roof_material:
                st["building:roof-material-mapped"] += 1
            if bd.category:
                st[f"building:category:{cats.by_id(bd.category).key}"] += 1
                st["building:category"] += 1
        if b.roof_shape != "unknown":
            st["building:roof-shape-mapped"] += 1
        if b.min_height > 0:
            st["building:min-height-mapped"] += 1
        if b.levels_mapped or b.height_from == "height":
            st["building:height-mapped"] += 1
        st["building"] += 1
    # Street objects and signs from nodes.
    for pt in f.detail_points:
        p = (pt.x, pt.z)
        if not playable.inside(p, 4):
            continue
        kind = object_kind(pt.tags)
        if kind:
            d.objects.append(ObjectSpot(kind, pt.x, pt.z))
            st[f"object:{kind}"] += 1
        cid = category_of(pt.tags, cats)
        if cid:
            d.signs.append(_sign(cats, cid, SF_NODE, p, pt.tags))
            st[f"sign:{cats.by_id(cid).key}"] += 1
            generic_name(pt.tags)
    # Lines: cut at tile edges so each tile holds what crosses it.
    for line in f.detail_lines:
        kind = line_kind(line.tags)
        if not kind or not any(playable.inside(p, 2) for p in line.points):
            continue
        h = tag_number(line.tags.get("height"))
        mapped = 0.2 <= h <= 30
        closed = line.points[0] == line.points[-1] and len(line.points) > 3
        pts = line.points[:-1] if closed else line.points
        if kind in ("platform", "bus_platform") and closed:
            continue  # a closed platform is a zone
        if len(pts) < 2:
            continue
        st[f"line:{kind}"] += 1
        st[f"line:{kind}:length-m"] += int(sum(math.dist(a, b) for a, b in zip(pts, pts[1:])))
        if mapped:
            st[f"line:{kind}:height-mapped"] += 1
        d.lines.append(LineFeature(kind, round1(h) if mapped else 0.0, list(line.points), closed))
    # Zones: pitches, pools, playgrounds, tracks, allotments, platforms; and areas that are
    # places (a school, a hospital, a temple mapped as an area without a building) for signs.
    for poly in f.detail_polys:
        kind = zone_kind(poly.tags)
        c = area_centroid(poly.outline) if len(poly.outline) >= 3 else None
        if c is None or not playable.inside(c, 2):
            continue
        outline = list(poly.outline)
        if signed_area(outline) < 0:
            outline.reverse()
        if abs(signed_area(outline)) < 4:
            continue
        if kind:
            sport = sport_of(poly.tags.get("sport")) if kind in ("pitch", "track") else 0
            d.zones.append(Zone(kind, SPORTS[sport], outline, poly.ref))
            st[f"zone:{kind}"] += 1
            if kind == "pitch":
                st["zone:pitch:sport-mapped" if sport else "zone:pitch:sport-estimated"] += 1
        cid = category_of(poly.tags, cats)
        if cid and "building" not in poly.tags:
            d.signs.append(_sign(cats, cid, SF_AREA, c, poly.tags))
            st[f"sign:{cats.by_id(cid).key}"] += 1
    # Public buildings carry their name plate too (a temple, a station, a hospital).
    for b in buildings:
        cid = category_of(b.tags, cats)
        if cid and cats.by_id(cid).public and (b.tags.get("name:ta") or b.tags.get("name:en") or b.tags.get("name")):
            c = centroid(b.outline)
            s = _sign(cats, cid, SF_AREA, c, b.tags)
            if s.flags & SF_PUBLIC_NAME:
                d.signs.append(s)
                st["sign:public-name"] += 1
    return d


_TAMIL = re.compile(r"[஀-௿]")


def _sign(cats: Categories, cid: int, flags: int, p: Point, tags: Tags) -> SignSpot:
    """The name is kept only for public places, and only name:ta / name:en (TD-18)."""
    s = SignSpot(cid, flags, p[0], p[1])
    if cats.by_id(cid).public:
        nm = tags.get("name", "")
        ta = tags.get("name:ta") or (nm if _TAMIL.search(nm) else "")
        en = tags.get("name:en") or (nm if nm and not _TAMIL.search(nm) else "")
        s.name_ta = ta[:80]
        s.name_en = en[:80]
        if s.name_ta or s.name_en:
            s.flags |= SF_PUBLIC_NAME
    return s


# Codec ------------------------------------------------------------------------------------------

def _tag(s: str) -> int:
    b = s.encode()
    return b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24


BLDG, PART, OBJ, LINE, ZONE, SIGN = (_tag(s) for s in ("BLDG", "PART", "OBJ_", "LINE", "ZONE", "SIGN"))


def _rgb(w: Writer, v: int) -> None:
    w.u8(v >> 16 & 255)
    w.u8(v >> 8 & 255)
    w.u8(v & 255)


def _read_rgb(r: Reader) -> int:
    return r.u8() << 16 | r.u8() << 8 | r.u8()


def _section(w: Writer, tag: int, body: bytes) -> None:
    w.u32(tag)
    w.u32(len(body))
    w.raw(body)


def _put_ring(w: Writer, pts: list[Point]) -> None:
    from .codec_v2 import _line  # noqa: PLC0415 - the point encoding of roads.bin

    _line(w, pts)


def _get_ring(r: Reader) -> list[Point]:
    from .codec_v2 import _read_line  # noqa: PLC0415

    return _read_line(r)


def _str(w: Writer, s: str) -> None:
    b = s.encode()[:255]
    w.u8(len(b))
    w.raw(b)


def encode_detail(tile: tuple[int, int], buildings: list[BuildingDetail], parts: list[Part], objects: list[ObjectSpot], lines: list[LineFeature],
                  zones: list[Zone], signs: list[SignSpot]) -> bytes:
    w = Writer()
    w.u32(DETAIL_MAGIC)
    w.u16(FORMAT)
    w.u16(MINOR)
    w.i16(tile[0])
    w.i16(tile[1])
    w.u16(6)
    b = Writer()
    b.u32(len(buildings))
    for d in buildings:
        b.u32(d.id)
        b.u8(d.flags)
        b.u8(d.material)
        b.u8(d.roof_material)
        b.u8(d.category)
        _rgb(b, d.wall)
        _rgb(b, d.roof)
    _section(w, BLDG, b.done())
    p = Writer()
    p.u32(len(parts))
    for pt in parts:
        p.u32(pt.id)
        p.u8(pt.source.dataset)
        p.u64(pt.source.id)
        p.u8(pt.flags)
        p.u16(int(js_round(pt.height * 10)))
        p.u16(int(js_round(pt.min_height * 10)))
        p.u8(min(pt.floors, 255))
        p.u8(ROOF_SHAPES.index(pt.roof_shape))
        p.u8(pt.roof_levels)
        p.u8(pt.material)
        p.u8(pt.roof_material)
        _rgb(p, pt.wall)
        _rgb(p, pt.roof)
        p.u8(1 + len(pt.holes))
        _put_ring(p, pt.outline)
        for h in pt.holes:
            _put_ring(p, h)
    _section(w, PART, p.done())
    o = Writer()
    o.u32(len(objects))
    for ob in objects:
        o.u8(OBJ_KINDS.index(ob.kind))
        o.u8(1 if ob.mapped else 0)
        o.i32(int(js_round(ob.x * Q)))
        o.i32(int(js_round(ob.z * Q)))
    _section(w, OBJ, o.done())
    ln = Writer()
    ln.u32(len(lines))
    for li in lines:
        ln.u8(LINE_KINDS.index(li.kind))
        ln.u8((LF_HEIGHT_MAPPED if li.height > 0 else 0) | (LF_CLOSED if li.closed else 0))
        ln.u16(int(js_round(li.height * 100)))
        _put_ring(ln, li.points)
    _section(w, LINE, ln.done())
    z = Writer()
    z.u32(len(zones))
    for zo in zones:
        z.u8(ZONE_KINDS.index(zo.kind))
        z.u8(SPORTS.index(zo.sport))
        z.u8(zo.source.dataset)
        z.u64(zo.source.id)
        _put_ring(z, zo.outline)
    _section(w, ZONE, z.done())
    s = Writer()
    s.u32(len(signs))
    for sg in signs:
        s.u8(sg.category)
        s.u8(sg.flags)
        s.i32(int(js_round(sg.x * Q)))
        s.i32(int(js_round(sg.z * Q)))
        if sg.flags & SF_PUBLIC_NAME:
            _str(s, sg.name_ta)
            _str(s, sg.name_en)
    _section(w, SIGN, s.done())
    return w.done()


@dataclass
class DetailTile:
    tile: tuple[int, int]
    minor: int
    buildings: list[BuildingDetail] = field(default_factory=list)
    parts: list[Part] = field(default_factory=list)
    objects: list[ObjectSpot] = field(default_factory=list)
    lines: list[LineFeature] = field(default_factory=list)
    zones: list[Zone] = field(default_factory=list)
    signs: list[SignSpot] = field(default_factory=list)


def decode_detail(data: bytes) -> DetailTile:
    r = Reader(data)
    if r.u32() != DETAIL_MAGIC:
        raise ValueError("Not a detail file.")
    fmt = r.u16()
    if fmt != FORMAT:
        raise ValueError(f"Detail file format {fmt}, expected {FORMAT}")
    minor = r.u16()
    out = DetailTile((r.i16(), r.i16()), minor)
    for _ in range(r.u16()):
        tag = r.u32()
        body = Reader(r.raw(r.u32()))
        if tag == BLDG:
            for _ in range(body.u32()):
                bid = body.u32()
                flags, mat, rmat, cat = body.u8(), body.u8(), body.u8(), body.u8()
                out.buildings.append(BuildingDetail(bid, flags, mat, rmat, cat, _read_rgb(body), _read_rgb(body)))
        elif tag == PART:
            for _ in range(body.u32()):
                pid = body.u32()
                src = Ref(body.u8(), body.u64())
                flags = body.u8()
                height = body.u16() / 10
                min_h = body.u16() / 10
                floors = body.u8()
                shape = ROOF_SHAPES[body.u8()]
                rl, mat, rmat = body.u8(), body.u8(), body.u8()
                wall, roof = _read_rgb(body), _read_rgb(body)
                rings = [_get_ring(body) for _ in range(body.u8())]
                out.parts.append(Part(pid, src, flags, height, min_h, floors, shape, rl, mat, rmat, wall, roof, rings[0], rings[1:]))
        elif tag == OBJ:
            for _ in range(body.u32()):
                kind = OBJ_KINDS[body.u8()]
                mapped = bool(body.u8() & 1)
                out.objects.append(ObjectSpot(kind, body.i32() / Q, body.i32() / Q, mapped))
        elif tag == LINE:
            for _ in range(body.u32()):
                kind = LINE_KINDS[body.u8()]
                flags = body.u8()
                h = body.u16() / 100
                out.lines.append(LineFeature(kind, h, _get_ring(body), bool(flags & LF_CLOSED)))
        elif tag == ZONE:
            for _ in range(body.u32()):
                kind = ZONE_KINDS[body.u8()]
                sport = SPORTS[body.u8()]
                src = Ref(body.u8(), body.u64())
                out.zones.append(Zone(kind, sport, _get_ring(body), src))
        elif tag == SIGN:
            for _ in range(body.u32()):
                cat, flags = body.u8(), body.u8()
                x, z = body.i32() / Q, body.i32() / Q
                ta = en = ""
                if flags & SF_PUBLIC_NAME:
                    ta = body.raw(body.u8()).decode()
                    en = body.raw(body.u8()).decode()
                out.signs.append(SignSpot(cat, flags, x, z, ta, en))
        if body.left:
            raise ValueError("Trailing bytes in a detail section.")
    if r.left:
        raise ValueError("Trailing bytes after the detail sections.")
    return out


# Tiles ----------------------------------------------------------------------------------------

def lines_by_tile(lines: list[LineFeature], tile_rects: Any) -> dict[tuple[int, int], list[LineFeature]]:
    """Each line cut at the edges of the tiles it crosses. `tile_rects(bounds) -> [(tile, Bounds)]`."""
    out: dict[tuple[int, int], list[LineFeature]] = {}
    for li in lines:
        xs = [p[0] for p in li.points]
        zs = [p[1] for p in li.points]
        for tile, b in tile_rects(Bounds(min(xs), max(xs), min(zs), max(zs))):
            for piece in clip_line(li.points, b):
                if len(piece) >= 2:
                    out.setdefault(tile, []).append(LineFeature(li.kind, li.height, piece, li.closed and piece == li.points))
    return out


def coverage_markdown(stats: Counter[str], tiles: dict[tuple[int, int], Counter[str]], header: str) -> str:
    """The coverage report (docs/osm-detail.md embeds the totals)."""
    cats = load_categories()
    total = stats
    b = max(1, total["building"])

    def pct(n: int, d: int) -> str:
        return (f"{n:,} ({100 * n / d:.1f} %)" if n * 100 >= d else f"{n:,} ({100 * n / d:.2f} %)") if d else "0"

    lines = [f"# OSM detail coverage (format 2.2)\n\n{header}\n"]
    lines.append("## Buildings (what OSM maps vs what the renderer estimates)\n")
    lines.append("| Field | Mapped | Estimated by the renderer |\n|---|---|---|")
    n = total["building"]
    rows = [
        ("height or building:levels", total["building:height-mapped"], "estimated storeys (2; apartments 3-5, commercial 2-4) x 3.1 m"),
        ("building:colour", total["building:colour-mapped"], "hash into 12 plaster colours"),
        ("building:material", total["building:material-mapped"], "plaster (the facade picture)"),
        ("roof:shape", total["building:roof-shape-mapped"], "flat terrace with parapet and water tank; a third of low houses get a tiled hip roof (hash)"),
        ("roof:colour", total["building:roof-colour-mapped"], "terracotta for tiles, grey for terraces (hash)"),
        ("roof:material", total["building:roof-material-mapped"], "from the roof shape"),
        ("min_height", total["building:min-height-mapped"], "from the ground"),
        ("shop / amenity / office / tourism / religion category", total["building:category"], "hash among everyday shop categories on the street walls"),
    ]
    for name, mapped, est in rows:
        lines.append(f"| {name} | {pct(mapped, n)} | {est} |")
    lines.append(f"\nBuildings drawn: {n:,}. `building:part` polygons: {total['part']:,} ({total['part:height-mapped']:,} with a height or levels, "
                 f"{total['part:min-height']:,} with min_height); buildings replaced by their parts: {total['building:parts-host']:,}.\n")
    lines.append("## Street objects (nodes)\n\n| Kind | Count |\n|---|---|")
    for k in OBJ_KINDS:
        lines.append(f"| {k} | {total['object:' + k]:,} |")
    lines.append("\nMapped bus stops (`highway=bus_stop`) are in `tile.json` `busStops` as before (shelters, G-56); `bus_platform` here adds the `public_transport=platform` nodes.\n")
    lines.append("## Lines (barriers, tree rows, platforms)\n\n| Kind | Ways | Length (km) | With mapped height |\n|---|---|---|---|")
    for k in LINE_KINDS:
        lines.append(f"| {k} | {total['line:' + k]:,} | {total['line:' + k + ':length-m'] / 1000:.1f} | {total['line:' + k + ':height-mapped']:,} |")
    lines.append("\nA drawn height of 0 in the file means not mapped: walls 1.9 m, fences 1.5 m, hedges 1.2 m, retaining walls 1.6 m, kerbs 0.15 m, jersey barriers 0.8 m (estimated).\n")
    lines.append("## Zones\n\n| Kind | Count |\n|---|---|")
    for k in ZONE_KINDS:
        lines.append(f"| {k} | {total['zone:' + k]:,} |")
    lines.append(f"\nPitches with the sport mapped: {total['zone:pitch:sport-mapped']:,}; without (drawn as a plain marked field, estimated): {total['zone:pitch:sport-estimated']:,}.\n")
    lines.append("## Sign categories (shops, amenities, offices, tourism; buildings and nodes)\n\n| Category | Tamil | English | Nodes and areas | Buildings |\n|---|---|---|---|---|")
    for c in cats.items:
        lines.append(f"| {c.key} | {c.tamil} | {c.english} | {total['sign:' + c.key]:,} | {total['building:category:' + c.key]:,} |")
    lines.append(f"\nPublic places with a `name:ta` or `name:en` kept for a name plate: {total['sign:public-name']:,}. No other OSM name is stored (TD-18). "
                 f"{total['sign:name-is-a-category-word']:,} mapped places are themselves named with a category word (\"Temple\", \"Tea Shop\"): their sign says the same word because the table says it, not because of the name.\n")
    lines.append("## Per tile\n\n| Tile | Buildings | Parts | Objects | Line km | Zones | Signs |\n|---|---|---|---|---|---|---|")
    for (tc, tr), s in sorted(tiles.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        objs = sum(s[k] for k in s if k.startswith("object:"))
        km = sum(s[k] for k in s if k.startswith("line:") and k.endswith(":length-m")) / 1000
        zs = sum(s[k] for k in s if k.startswith("zone:") and k.count(":") == 1)
        sg = sum(s[k] for k in s if k.startswith("sign:") and k != "sign:public-name")
        lines.append(f"| {tc}_{tr} | {s['building']:,} | {s['part']:,} | {objs:,} | {km:.1f} | {zs:,} | {sg:,} |")
    _ = b
    return "\n".join(lines) + "\n"
