"""Enumerations stored as bytes in the world files. Append only: an index never changes meaning
(world-format.md lists each table; `test_codec_v2.py` pins them)."""
from __future__ import annotations

# v1 tables (codec.ts): the first entries of the v2 tables are exactly these.
V1_ROAD_KINDS = ["primary", "secondary", "tertiary", "residential", "service", "footway"]
V1_BUILDING_KINDS = ["house", "apartments", "commercial"]
V1_HEIGHT_FROM = ["estimated", "levels", "height"]
V1_AREA_KINDS = ["park", "water", "beach"]

ROAD_KINDS = V1_ROAD_KINDS + ["motorway", "track", "raceway"]
BUILDING_KINDS = V1_BUILDING_KINDS
HEIGHT_FROM = V1_HEIGHT_FROM + ["overture", "openbuildings", "min-height", "microsoft"]
AREA_KINDS = V1_AREA_KINDS + [
    "reservoir", "wetland", "farmland", "orchard", "meadow", "scrub", "forest", "residential",
    "commercial", "industrial", "military", "cemetery", "bare", "saltpan", "aerodrome", "apron",
    "sport", "railway", "helipad", "mangrove",
]
# OSM highway=* values kept on each road (the `class` byte); 0 = other/unknown.
HIGHWAY_CLASSES = [
    "", "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary",
    "secondary_link", "tertiary", "tertiary_link", "residential", "unclassified", "living_street",
    "service", "footway", "path", "pedestrian", "track", "raceway", "steps", "cycleway", "bridleway",
    "busway", "road",
]
SURFACES = [
    "", "asphalt", "concrete", "paved", "paving_stones", "sett", "cobblestone", "compacted",
    "unpaved", "gravel", "fine_gravel", "dirt", "ground", "earth", "sand", "grass", "mud", "wood",
    "metal", "other",
]
ROOF_SHAPES = [
    "unknown", "flat", "gabled", "hipped", "pyramidal", "dome", "skillion", "half-hipped", "gambrel",
    "mansard", "round", "onion", "cone", "saltbox", "other",
]
# OSM building=* value grouped for archetype choice (`use` byte).
BUILDING_USES = [
    "unknown", "house", "residential", "commercial", "retail", "office", "industrial", "warehouse",
    "religious", "school", "hospital", "public", "transport", "hangar", "shed", "garage", "hut",
    "construction", "roof", "other",
]
SIDEWALKS = ["", "no", "left", "right", "both", "separate"]
AEROWAY_KINDS = [
    "runway", "taxiway", "apron", "terminal", "hangar", "helipad", "heliport", "aerodrome",
    "control_tower", "gate", "parking_position", "holding_position", "stopway", "navigationaid",
    "windsock", "other",
]


def index_or(table: list[str], value: str, default: int = 0) -> int:
    try:
        return table.index(value)
    except ValueError:
        return default
