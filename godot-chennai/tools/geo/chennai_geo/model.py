"""Plain data for the world builder. Coordinates are local metres (x east, z south)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .geometry import Point

Tags = dict[str, str]

# Datasets a provenance entry can point at. The index is stored in the chunk files (u8), so this
# list only grows at the end (world-format.md, "Datasets").
DATASETS: list[str] = ["osm:way", "osm:relation", "osm:node", "overture:buildings", "google:openbuildings", "derived"]
DS_OSM_WAY, DS_OSM_RELATION, DS_OSM_NODE, DS_OVERTURE, DS_OPENBUILDINGS, DS_DERIVED = range(6)


@dataclass(frozen=True)
class Ref:
    """Provenance: dataset index (into DATASETS) and the id in that dataset."""

    dataset: int
    id: int

    def label(self) -> str:
        return f"{DATASETS[self.dataset]}/{self.id}"


@dataclass
class OsmLine:
    id: int
    tags: Tags
    points: list[Point]


@dataclass
class OsmPolygon:
    id: int
    tags: Tags
    outline: list[Point]
    holes: list[list[Point]] = field(default_factory=list)
    source: Literal["way", "relation"] = "way"
    part: int = 0

    @property
    def ref(self) -> Ref:
        return Ref(DS_OSM_WAY if self.source == "way" else DS_OSM_RELATION, self.id)


@dataclass
class OsmPoint:
    id: int
    tags: Tags
    x: float
    z: float


@dataclass
class OsmFeatures:
    timestamp: str
    highways: list[OsmLine] = field(default_factory=list)
    buildings: list[OsmPolygon] = field(default_factory=list)
    areas: list[OsmPolygon] = field(default_factory=list)
    points: list[OsmPoint] = field(default_factory=list)
    coastlines: list[OsmLine] = field(default_factory=list)
    aeroway_lines: list[OsmLine] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=dict)


@dataclass
class Road:
    id: int
    kind: str
    width: float
    oneway: bool
    points: list[Point]
    name: str | None = None
    lanes: int | None = None
    # v2 fields
    highway: str = ""
    width_from: str = "class"  # class | width | lanes
    bridge: bool = False
    tunnel: bool = False
    layer: int = 0
    surface: str = ""
    maxspeed: int = 0
    ref: str | None = None
    sidewalk: str = ""
    lit: bool = False
    roundabout: bool = False
    source: Ref | None = None


@dataclass
class Building:
    id: int
    outline: list[Point]
    floors: int
    height: float
    height_from: str
    kind: str
    color: int
    name: str | None = None
    # v2 fields
    holes: list[list[Point]] = field(default_factory=list)
    use: str = "unknown"
    roof_shape: str = "unknown"
    roof_levels: int = 0
    min_height: float = 0.0
    archetype: int = 0
    levels_mapped: bool = False
    source: Ref = field(default_factory=lambda: Ref(DS_OSM_WAY, 0))
    merged: list[Ref] = field(default_factory=list)
    repaired: bool = False


@dataclass
class Area:
    id: int
    kind: str
    outline: list[Point]
    name: str | None = None
    holes: list[list[Point]] = field(default_factory=list)
    source: Ref | None = None


@dataclass
class Tree:
    x: float
    z: float
    scale: float
    source: str  # osm | generated


@dataclass
class Aeroway:
    """Airport geometry for flight (MIGRATION_PROMPT §11): runways, taxiways, aprons, helipads."""

    id: int
    kind: str
    source: Ref
    points: list[Point]  # line for runway/taxiway, outline for polygons, one point for nodes
    closed: bool
    ref: str | None = None
    name: str | None = None
    width: float | None = None
    surface: str | None = None
    tags: Tags = field(default_factory=dict)
