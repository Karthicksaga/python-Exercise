"""Converter path between today's world files (format 1) and the regional world (format 2).

- `v1_to_world`: today's committed `chennai-open-world/apps/game/public/world/` -> an in-memory
  ring-0 `World`, which `write_world_v2` writes as format 2 (v2-only fields get their defaults:
  provenance = OSM way, heightFrom/kind as stored, roof unknown, no holes).
- `write_world_v1` (writer.py) goes the other way, from any ring-0 build.
- `compare_counts`: the numbers the ring-0 regression test checks.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

from . import codec_v1
from .geometry import Bounds
from .model import Area, Ref
from .regions import Playable, ring0_bounds, world_grid
from .world import Chunk, World


def _bounds(b: dict[str, float]) -> Bounds:
    return Bounds(b["minX"], b["maxX"], b["minZ"], b["maxZ"])


def v1_to_world(root: Path) -> World:
    index = json.loads((root / "index.json").read_text())
    b = _bounds(index["bounds"])
    if b != ring0_bounds():
        raise ValueError(f"Format-1 bounds {b} are not today's ring 0 {ring0_bounds()}")
    grid = world_grid()
    dc, dr = grid.legacy_offset
    roads = codec_v1.decode_roads((root / index["roads"]).read_bytes(), index["roadNames"])
    for r in roads:
        r.source = Ref(0, r.id // 10)
        r.highway = {"primary": "primary", "secondary": "secondary", "tertiary": "tertiary", "residential": "residential", "service": "service", "footway": "footway"}[r.kind]
        r.width_from = "lanes" if r.lanes is not None else "class"
    chunks: dict[tuple[int, int], Chunk] = {}
    road_keys: set[tuple[int, int]] = set()
    for col, row, size in index["chunks"]:
        if size == 0:
            road_keys.add((col + dc, row + dr))
            continue
        c = codec_v1.decode_chunk((root / codec_v1.chunk_file(col, row)).read_bytes(), b, index["chunkSize"])
        for bld in c["buildings"]:
            bld.source = Ref(0, bld.id)
            bld.levels_mapped = bld.height_from == "levels"
        for a in c["areas"]:
            a.source = Ref(0, a.id)
        chunks[(col + dc, row + dr)] = Chunk(col + dc, row + dr, 0, c["buildings"], c["trees"], c["areas"])
    road_keys |= set(chunks)
    areas = [Area(a["id"], a["kind"], [(p["x"], p["z"]) for p in a["outline"]], a.get("name"), [], Ref(0, a["id"])) for a in index["areas"]]
    pois = [{"kind": p[0], "x": p[1], "z": p[2], **({"name": p[3]} if len(p) > 3 else {})} for p in index["pois"]]
    return World(grid, 0, Playable(b), index["dataDate"], roads, areas, chunks, pois, index["busStops"], index["signals"], index["districts"], [],
                 index["landmarks"], [], index.get("sea"), Counter(), road_keys, {k: 0 for k in road_keys - set(chunks)})


def counts(w: World) -> dict[str, Any]:
    blds = [b for c in w.chunks.values() for b in c.buildings]
    return {
        "buildings": len(blds),
        "buildings_from_ways": sum(1 for b in blds if not b.id & 0x80000000),
        "roads": len(w.roads),
        "roads_v1_classes": len([r for r in w.roads if r.kind in ("primary", "secondary", "tertiary", "residential", "service", "footway") and r.highway not in ("steps", "cycleway", "busway", "road", "track")]),
        "trees": sum(len(c.trees) for c in w.chunks.values()),
        "areas_v1_kinds": len([a for a in w.areas if a.kind in ("park", "water", "beach")]),
        "chunks": len(w.chunks),
        "bus_stops": len(w.bus_stops),
        "signals": len(w.signals),
        "districts": len(w.districts),
        "pois": len(w.pois),
        "landmarks": sorted(lm["id"] for lm in w.landmarks),
        "height_from": dict(Counter(b.height_from for b in blds)),
    }
