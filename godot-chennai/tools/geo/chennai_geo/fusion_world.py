"""Fuse the committed world with the three extra building datasets (`cli fuse`, G-220…G-226).

Reads the world folder (OSM buildings from `chunks.bin`, water from `areas.bin`, carriageways
from `roads.bin`, landmarks and the boundary from `world.json`) and the cached extracts written by
`fusion_fetch` (outside the repository), then writes one `fusion.bin` per tile, adds the
`fusion` key, `minor` 3 and the `microsoft:mlbuildings` dataset to `world.json`, the coverage
report `FUSION.md` and the credits in `ATTRIBUTION.md`. No 2.0/2.1/2.2 file is touched.
Re-running it on the same inputs gives the same bytes.
"""
from __future__ import annotations

import gzip
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import shapely

from . import codec_v2, fusion_codec
from .fusion_codec import FusedBuilding, FusedChunk, FusionTile, HeightFix
from .fusion_fetch import MICROSOFT_FILE, OPENBUILDINGS_FILE, OVERTURE_FILE
from .fusion_multi import (ADD_MAX_OVERLAP, DUP_MIN_OVERLAP, FUSION_SOURCES, GOOGLE_MIN_CONFIDENCE, ORIGIN_GOOGLE, ORIGIN_MICROSOFT, ORIGIN_NONE,
                           ORIGIN_OTHER, SRC_GOOGLE, SRC_MICROSOFT, SRC_OVERTURE, Footprints, FusionOutcome, Masks, OsmSide, as_rect, estimate_floors,
                           external_height, fuse_footprints, wall_color)
from .geometry import signed_area
from .projection import DEG, EARTH_RADIUS, GeoProjection, LatLng
from .regions import RINGS, TILE_CHUNKS, Grid, chunk_ring, playable_for
from .rules import FLOOR_HEIGHT, PARAPET
from .util import round1

FUSION_FILE = "fusion.bin"
DATASET_MICROSOFT = "microsoft:mlbuildings"
WATER_KINDS = {"water", "reservoir"}
CARRIAGEWAY_KINDS = {"primary", "secondary", "tertiary", "residential", "service", "motorway", "raceway"}

CREDITS = {
    "osm": "© OpenStreetMap contributors (ODbL)",
    "overture": "Overture Maps Foundation (ODbL for buildings)",
    "google": "Contains data from Google Open Buildings (ODbL)",
    "microsoft": "Microsoft Global ML Building Footprints (CDLA Permissive 2.0)",
}
LICENCES = {"osm": "ODbL 1.0", "overture": "ODbL 1.0", "google": "ODbL 1.0 (chosen; also offered under CC BY 4.0)", "microsoft": "CDLA Permissive 2.0"}


@dataclass
class WorldInputs:
    world_json: dict[str, Any]
    grid: Grid
    projection: GeoProjection
    tiles: list[tuple[int, int]]
    cell_ring: dict[tuple[int, int], int]
    osm: OsmSide
    osm_ids: list[int]
    osm_cells: list[tuple[int, int]]
    masks: Masks
    osm_ring_counts: Counter[int] = field(default_factory=Counter)


def _lnglat_to_local(proj: GeoProjection):  # type: ignore[no-untyped-def]
    lat0, lng0, cos0 = proj.origin.lat, proj.origin.lng, proj.cos_lat

    def f(c: np.ndarray) -> np.ndarray:
        out = np.empty_like(c)
        out[:, 0] = (c[:, 0] - lng0) * DEG * EARTH_RADIUS * cos0
        out[:, 1] = -(c[:, 1] - lat0) * DEG * EARTH_RADIUS
        return out

    return f


def load_world(world: Path, landmark_outlines: list[list[tuple[float, float]]] | None = None) -> WorldInputs:
    wj = json.loads((world / "world.json").read_text())
    g = wj["grid"]
    grid = Grid(float(g["minX"]), float(g["minZ"]), int(g["cols"]), int(g["rows"]))
    proj = GeoProjection(LatLng(float(wj["origin"]["lat"]), float(wj["origin"]["lng"])))
    geoms: list[shapely.Polygon] = []
    hf: list[str] = []
    hs: list[float] = []
    ids: list[int] = []
    cells: list[tuple[int, int]] = []
    water: list[shapely.Geometry] = []
    roads: list[shapely.Geometry] = []
    aprons: list[shapely.Geometry] = []
    cell_ring: dict[tuple[int, int], int] = {}
    ring_counts: Counter[int] = Counter()
    tiles = [(int(t[0]), int(t[1])) for t in wj["tiles"]]
    for tc, tr in tiles:
        d = world / "tiles" / f"{tc}_{tr}"
        tj = json.loads((d / "tile.json").read_text())
        pack = (d / tj.get("chunkPack", "chunks.bin")).read_bytes()
        for col, row, off, length, ring in tj["chunks"]:
            cell_ring[(col, row)] = ring
            if not length:
                continue
            ch = codec_v2.decode_chunk(pack[off:off + length], grid.centre)
            for b in ch.buildings:
                geoms.append(shapely.Polygon(b.outline, b.holes or None))
                hf.append(b.height_from)
                hs.append(b.height)
                ids.append(b.id)
                cells.append((col, row))
                ring_counts[ring] += 1
        for a in codec_v2.decode_areas((d / tj.get("areas", "areas.bin")).read_bytes()):
            if a.kind in WATER_KINDS or a.kind == "apron":
                p = shapely.Polygon(a.outline, a.holes or None)
                if not p.is_valid:
                    p = shapely.make_valid(p)
                (water if a.kind in WATER_KINDS else aprons).append(p)
        for rp in codec_v2.decode_roads((d / tj.get("roads", "roads.bin")).read_bytes(), [str(x) for x in tj.get("roadNames", [])]):
            rd = rp.road
            if rd.kind in CARRIAGEWAY_KINDS and not rd.tunnel and len(rd.points) >= 2:
                roads.append(shapely.buffer(shapely.LineString(rd.points), rd.width / 2, cap_style="flat"))
    lms: list[shapely.Geometry] = []
    for lm in wj.get("landmarks", []):
        if "radius" in lm:
            lms.append(shapely.Point(float(lm["x"]), float(lm["z"])).buffer(float(lm["radius"])))
    for ring_pts in landmark_outlines or []:
        lms.append(shapely.Polygon(ring_pts))
    boundary = shapely.Polygon([(float(x), float(z)) for x, z in wj["boundary"]])
    if not boundary.is_valid:
        boundary = shapely.make_valid(boundary)
    masks = Masks(water=water + aprons, roads=roads, landmarks=lms, world=boundary)
    osm = OsmSide(np.array(geoms, dtype=object), hf, np.array(hs))
    return WorldInputs(wj, grid, proj, tiles, cell_ring, osm, ids, cells, masks, ring_counts)


def _largest(g: shapely.Geometry) -> shapely.Geometry:
    if g.geom_type == "Polygon":
        return shapely.Polygon(g.exterior)
    polys = [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"]
    return shapely.Polygon(max(polys, key=lambda p: p.area).exterior) if polys else shapely.Polygon()


def load_overture(path: Path, proj: GeoProjection) -> tuple[Footprints, Footprints, set[str]]:
    """(non-OSM footprints, Overture's copies of OSM buildings, the plus codes of the Google
    footprints Overture carries). Source index = row in the extract (ordered by GERS id)."""
    import pyarrow.parquet as pq  # noqa: PLC0415

    t = pq.read_table(path, columns=["wkb", "height", "num_floors", "sources"])
    wkb = t.column("wkb").to_pylist()
    heights = t.column("height").to_pylist()
    floors = t.column("num_floors").to_pylist()
    srcs = t.column("sources").to_pylist()
    geoms = shapely.transform(np.array([_largest(g) for g in shapely.from_wkb(np.array(wkb, dtype=object))], dtype=object), _lnglat_to_local(proj))
    n = len(wkb)
    origin = np.zeros(n, np.int64)
    conf = np.full(n, -1.0)
    is_osm = np.zeros(n, bool)
    codes: set[str] = set()
    for i, s in enumerate(srcs):
        first = json.loads(s)[0] if s else {}
        ds = first.get("dataset", "")
        if ds == "Google Open Buildings" and first.get("record_id"):
            codes.add(str(first["record_id"]))
        if ds == "OpenStreetMap":
            is_osm[i] = True
        origin[i] = ORIGIN_GOOGLE if ds == "Google Open Buildings" else ORIGIN_MICROSOFT if ds == "Microsoft ML Buildings" else ORIGIN_OTHER if ds else ORIGIN_NONE
        c = first.get("confidence")
        if c is not None:
            conf[i] = float(c)
    h = np.array([external_height(heights[i], floors[i]) for i in range(n)])
    idx = np.arange(n, dtype=np.int64)
    src = np.full(n, SRC_OVERTURE, np.int64)
    ext = Footprints(geoms[~is_osm], src[~is_osm], idx[~is_osm], origin[~is_osm], conf[~is_osm], h[~is_osm])
    osm = Footprints(geoms[is_osm], src[is_osm], idx[is_osm], origin[is_osm], conf[is_osm], h[is_osm])
    return ext, osm, codes


def load_openbuildings(path: Path, proj: GeoProjection, skip_codes: set[str] | None = None) -> tuple[Footprints, Counter[str]]:
    """Google footprints with confidence >= 0.75 that Overture does not already carry (same plus
    code = the same Google record). Source index = row in the extract."""
    import csv  # noqa: PLC0415

    pre: Counter[str] = Counter()
    keep = []
    with gzip.open(path, "rt", newline="") as f:
        for i, row in enumerate(csv.reader(f)):  # latitude, longitude, area, confidence, WKT, plus code
            if float(row[3]) < GOOGLE_MIN_CONFIDENCE:
                pre["Google confidence below 0.75"] += 1
            elif skip_codes and row[5] in skip_codes:
                pre["same Google record already in Overture"] += 1
            else:
                keep.append((i, row[3], row[4]))
    conf = np.array([float(r[1]) for r in keep])
    idx = np.array([int(r[0]) for r in keep], dtype=np.int64)
    geoms = shapely.transform(np.array([_largest(g) for g in shapely.from_wkt(np.array([r[2] for r in keep], dtype=object))], dtype=object), _lnglat_to_local(proj))
    n = len(keep)
    return Footprints(geoms, np.full(n, SRC_GOOGLE, np.int64), idx, np.zeros(n, np.int64), conf, np.full(n, np.nan)), pre


def load_microsoft(path: Path, proj: GeoProjection) -> Footprints:
    geoms = []
    hs = []
    conf = []
    with gzip.open(path, "rt") as f:
        for line in f:
            feat = json.loads(line)
            p = feat.get("properties") or {}
            geoms.append(shapely.Polygon(feat["geometry"]["coordinates"][0]))
            h = p.get("height", -1)
            hs.append(float(h) if h is not None and h > 0 else math.nan)
            c = p.get("confidence", -1)
            conf.append(float(c) if c is not None and c >= 0 else -1.0)
    n = len(geoms)
    garr = shapely.transform(np.array(geoms, dtype=object), _lnglat_to_local(proj))
    return Footprints(garr, np.full(n, SRC_MICROSOFT, np.int64), np.arange(n, dtype=np.int64), np.zeros(n, np.int64), np.array(conf),
                      np.array([external_height(h, None) for h in hs]))


@dataclass
class FusedWorld:
    tiles: dict[tuple[int, int], FusionTile]
    outcome: FusionOutcome
    new_by_ring_source: Counter[tuple[int, int]]
    new_by_tile_source: Counter[tuple[tuple[int, int], int]]
    heights_by_ring: Counter[tuple[int, str]]
    skipped_outside_grid: int
    boxes: int
    polygons: int


def assemble(inp: WorldInputs, ext: Footprints, out: FusionOutcome, boundary_lnglat: shapely.Polygon | None) -> FusedWorld:
    """Turn the kept footprints into fused chunk records (ids, chunk, ring, kind, height, colour)."""
    grid = inp.grid
    if inp.osm_ids and max(inp.osm_ids) >= fusion_codec.FIRST_ID:
        raise ValueError(f"An OSM building id reaches the fused id range ({max(inp.osm_ids):#x}); move FIRST_ID (world-format.md §4).")
    playables = None
    rows: list[tuple[tuple[int, int], tuple[int, int], int, int, int]] = []
    skipped = 0
    outlines: dict[int, list[tuple[float, float]]] = {}
    for k in out.kept:
        g = ext.geoms[int(k)]
        if not g.is_valid:
            g = shapely.make_valid(g)
            g = _largest(g)
        # ML outlines carry many collinear points: simplify by 10 cm (more for the rare huge
        # outline, so every footprint fits the u8 point count of fusion.bin).
        tol = 0.1
        sg = shapely.simplify(g, tol, preserve_topology=True)
        while len(sg.exterior.coords) > 200:
            tol *= 2
            sg = shapely.simplify(g, tol, preserve_topology=True)
        pts = [(round(x, 2), round(z, 2)) for x, z in list(sg.exterior.coords)[:-1]]
        # drop repeated points after rounding
        clean: list[tuple[float, float]] = []
        for p in pts:
            if not clean or clean[-1] != p:
                clean.append(p)
        if len(clean) > 1 and clean[0] == clean[-1]:
            clean.pop()
        if len(clean) < 3:
            skipped += 1
            continue
        if signed_area(clean) < 0:
            clean.reverse()
        cx = sum(p[0] for p in clean) / len(clean)
        cz = sum(p[1] for p in clean) / len(clean)
        col, row = grid.col(cx), grid.row(cz)
        if not (0 <= col < grid.cols and 0 <= row < grid.rows):
            skipped += 1
            continue
        tile = (col // TILE_CHUNKS, row // TILE_CHUNKS)
        outlines[int(k)] = clean
        rows.append((tile, (col, row), int(ext.source[k]), int(ext.index[k]), int(k)))
    rows.sort(key=lambda r: (r[0][1], r[0][0], r[1][1], r[1][0], r[2], r[3]))
    tiles: dict[tuple[int, int], FusionTile] = {t: FusionTile(t) for t in inp.tiles}
    by_ring: Counter[tuple[int, int]] = Counter()
    by_tile: Counter[tuple[tuple[int, int], int]] = Counter()
    next_id = fusion_codec.FIRST_ID
    current: FusedChunk | None = None
    boxes = polys = 0
    for tile, cell, src, _idx, k in rows:
        if tile not in tiles:
            tiles[tile] = FusionTile(tile)
        if current is None or (current.col, current.row) != cell:
            ring = inp.cell_ring.get(cell)
            if ring is None:
                if playables is None:
                    playables = [playable_for(r, boundary_lnglat) for r in range(len(RINGS))]
                ring = chunk_ring(grid, cell[0], cell[1], playables)
            current = FusedChunk(cell[0], cell[1], ring, next_id)
            tiles[tile].chunks.append(current)
        bid = next_id
        next_id += 1
        outline = outlines[k]
        area = abs(signed_area(outline))
        h = float(ext.height[k])
        if math.isfinite(h):
            hf = "overture" if src == SRC_OVERTURE else "microsoft"
            floors = max(1, math.floor((h - PARAPET) / FLOOR_HEIGHT + 0.5))
            kind = "apartments" if area > 420 else "house"
        else:
            floors, kind = estimate_floors(bid, area)
            h = floors * FLOOR_HEIGHT + PARAPET
            hf = "estimated"
        rect = as_rect(outline)
        fb = FusedBuilding(src, int(ext.origin[k]), int(ext.index[k]), float(ext.confidence[k]), round1(h), hf, floors, kind, wall_color(bid), outline, rect)
        if fusion_codec.box_of(fb) is not None:
            boxes += 1
        else:
            polys += 1
        current.buildings.append(fb)
        by_ring[(current.ring, src)] += 1
        by_tile[(tile, src)] += 1
    heights_by_ring: Counter[tuple[int, str]] = Counter()
    for o, (h, hfrom, src) in sorted(out.osm_heights.items()):
        cell = inp.osm_cells[o]
        tile = (cell[0] // TILE_CHUNKS, cell[1] // TILE_CHUNKS)
        floors = max(1, math.floor((h - PARAPET) / FLOOR_HEIGHT + 0.5))
        tiles[tile].heights.append(HeightFix(inp.osm_ids[o], h, floors, hfrom, src))
        heights_by_ring[(inp.cell_ring.get(cell, 0), hfrom)] += 1
    for t in tiles.values():
        t.heights.sort(key=lambda f: f.building_id)
    return FusedWorld(tiles, out, by_ring, by_tile, heights_by_ring, skipped, boxes, polys)


def write(fw: FusedWorld, inp: WorldInputs, world: Path, manifest: list[dict[str, Any]]) -> dict[str, Any]:
    total = 0
    for key, t in sorted(fw.tiles.items()):
        d = world / "tiles" / f"{key[0]}_{key[1]}"
        if not d.exists():
            continue
        blob = fusion_codec.encode(t, inp.grid.centre)
        (d / FUSION_FILE).write_bytes(blob)
        total += len(blob)
    wj = inp.world_json
    datasets = list(wj.get("datasets", []))
    if DATASET_MICROSOFT not in datasets:
        datasets.append(DATASET_MICROSOFT)
    wj["datasets"] = datasets
    wj["minor"] = max(int(wj.get("minor", 0)), fusion_codec.MINOR)
    present = sorted({FUSION_SOURCES[s] for (_r, s) in fw.new_by_ring_source} | {"osm"}, key=FUSION_SOURCES.index)
    wj["fusion"] = {
        "file": FUSION_FILE,
        "sources": FUSION_SOURCES,
        "present": present,
        "credits": [CREDITS[s] for s in FUSION_SOURCES if s in present],
        "extracts": [{k: m.get(k) for k in ("id", "release", "downloaded", "licence", "sha256", "rows") if k in m} for m in manifest],
        # Squares that hold only added buildings (no OSM chunk record and no road): [col, row, ring].
        "cells": sorted(([c.col, c.row, c.ring] for t in fw.tiles.values() for c in t.chunks if (c.col, c.row) not in inp.cell_ring),
                        key=lambda v: (v[1], v[0])),
        "note": "format 2.3: buildings added from Overture, Google Open Buildings and Microsoft ML footprints where OSM has none, and heights they give OSM buildings; world-format.md 3.9",
    }
    (world / "world.json").write_text(json.dumps(wj, separators=(",", ":"), ensure_ascii=False))
    return {"fusion_bytes": total}


def attribution_section(manifest: list[dict[str, Any]], present: list[str]) -> str:
    by_id = {m.get("id"): m for m in manifest}
    ids = {"overture": "overture-buildings", "google": "google-openbuildings-v3", "microsoft": "microsoft-ml-buildings"}
    lines = ["", "## Building footprints from other datasets (format 2.3, `fusion.bin`)", "",
             "OpenStreetMap stays the primary source: a footprint from another dataset is added only where OSM",
             "has no building (docs/fusion.md). Each added building records its source.", ""]
    for s in present:
        if s == "osm":
            continue
        m = by_id.get(ids[s], {})
        rel = f", release {m['release']}" if m.get("release") else ""
        lines.append(f"- {CREDITS[s]}{rel}; extract downloaded {str(m.get('downloaded', ''))[:10]}, sha256 `{m.get('sha256', '')}`; licence {LICENCES[s]}.")
    lines += ["- Heights of added buildings are estimated unless a source gives one (none of the three does in",
              "  this box on the download date); `heightFrom` says which.",
              "- Share-alike: the combined world files are a Derived Database under the ODbL 1.0 (docs/fusion.md",
              "  \"Licences\"); CDLA Permissive 2.0 data may be combined into it.", ""]
    return "\n".join(lines)


MARK = "## Building footprints from other datasets"


def write_attribution(world: Path, manifest: list[dict[str, Any]], present: list[str]) -> None:
    p = world / "ATTRIBUTION.md"
    text = p.read_text()
    if MARK in text:
        text = text[: text.index(MARK)].rstrip("\n") + "\n"
    end = "(Generated by `tools/geo` with the world.)"
    body = attribution_section(manifest, present)
    if end in text:
        text = text.replace(end, body.strip("\n") + "\n\n" + end)
    else:
        text += body
    p.write_text(text)


def _pct(n: int, d: int) -> str:
    return f"{n:,} ({100 * n / d:.1f} %)" if d else "0"


def coverage_markdown(fw: FusedWorld, inp: WorldInputs, sizes: dict[str, Any], manifest: list[dict[str, Any]], thresholds: dict[str, Any]) -> str:
    rings = sorted({r for r in inp.osm_ring_counts} | {r for r, _ in fw.new_by_ring_source})
    src_names = ["overture", "google", "microsoft"]
    out = ["# Building fusion coverage report", "",
           f"Generated by `tools/geo` (`cli fuse`). OSM {inp.world_json.get('dataDate')} plus "
           + ", ".join(f"{m.get('id')} ({str(m.get('downloaded', ''))[:10]}{', release ' + m['release'] if m.get('release') else ''})" for m in manifest) + ".",
           "OSM stays primary; every added building is labelled with its source; heights not from OSM are estimated unless a source gives one.", "",
           "## By ring", "",
           "| Ring | OSM buildings | Added: Overture | Added: Google | Added: Microsoft | Total after | Growth | Heights from OSM (height/levels) before | Heights from a dataset (after) | Estimated after |",
           "|---|---|---|---|---|---|---|---|---|---|"]
    osm_mapped_by_ring: Counter[int] = Counter()
    for o, hf in enumerate(inp.osm.height_from):
        if hf in ("height", "levels"):
            osm_mapped_by_ring[inp.cell_ring.get(inp.osm_cells[o], 0)] += 1
    tot = Counter[str]()
    for r in rings:
        osm_n = inp.osm_ring_counts[r]
        added = [fw.new_by_ring_source[(r, FUSION_SOURCES.index(s))] for s in src_names]
        after = osm_n + sum(added)
        ds_h = sum(v for (rr, _h), v in fw.heights_by_ring.items() if rr == r)
        new_h = 0  # added buildings with a dataset height
        for t in fw.tiles.values():
            for c in t.chunks:
                if c.ring == r:
                    new_h += sum(1 for b in c.buildings if b.height_from != "estimated")
        est = after - osm_mapped_by_ring[r] - ds_h - new_h
        out.append(f"| {r} | {osm_n:,} | {added[0]:,} | {added[1]:,} | {added[2]:,} | {after:,} | ×{after / osm_n if osm_n else 0:.2f} | "
                   f"{osm_mapped_by_ring[r]:,} | {ds_h + new_h:,} | {_pct(est, after)} |")
        tot["osm"] += osm_n
        tot["after"] += after
        tot["est"] += est
        tot["mapped"] += osm_mapped_by_ring[r]
        tot["ds"] += ds_h + new_h
        for s, a in zip(src_names, added):
            tot[s] += a
    out.append(f"| all | {tot['osm']:,} | {tot['overture']:,} | {tot['google']:,} | {tot['microsoft']:,} | {tot['after']:,} | ×{tot['after'] / max(1, tot['osm']):.2f} | "
               f"{tot['mapped']:,} | {tot['ds']:,} | {_pct(tot['est'], tot['after'])} |")
    out += ["", "## Why footprints were not added", "", "| Source | " + " | ".join(src_names) + " |", "|---|---|---|---|"]
    reasons = sorted({k for c in fw.outcome.reasons.values() for k in c})
    for k in reasons:
        out.append(f"| {k} | " + " | ".join(f"{fw.outcome.reasons.get(FUSION_SOURCES.index(s), Counter())[k]:,}" for s in src_names) + " |")
    out += ["", "## Height agreement (where OSM and a dataset both have a height)", ""]
    if not fw.outcome.validation:
        out.append("No dataset gives a height for any building that OSM also has a height for.")
    for sv, v in sorted(fw.outcome.validation.items()):
        out.append(f"- {FUSION_SOURCES[sv]}: {v.pairs:,} buildings, mean absolute error {v.mae:.2f} m, bias {v.bias:+.2f} m"
                   f" ({'refused' if v.refused else 'accepted'}; refused above 3 m MAE or 2 m bias on 20 or more buildings).")
    out += ["", "## Thresholds (measured on this run)", ""]
    for k, v in thresholds.items():
        out.append(f"- {k}: {v}")
    out += ["", f"Encoding: {fw.boxes:,} added buildings stored as boxes (7 bytes of geometry), {fw.polygons:,} as polygons; "
            f"{fw.skipped_outside_grid:,} skipped (degenerate or outside the grid). fusion.bin total {sizes.get('fusion_bytes', 0) / 1e6:.2f} MB.", "",
            "## By tile (added buildings)", "", "| Tile | OSM | Overture | Google | Microsoft |", "|---|---|---|---|---|"]
    osm_by_tile: Counter[tuple[int, int]] = Counter((c[0] // TILE_CHUNKS, c[1] // TILE_CHUNKS) for c in inp.osm_cells)
    for tk in sorted(inp.tiles, key=lambda k: (k[1], k[0])):
        vals = [fw.new_by_tile_source[(tk, FUSION_SOURCES.index(s))] for s in src_names]
        out.append(f"| {tk[0]}_{tk[1]} | {osm_by_tile[tk]:,} | " + " | ".join(f"{v:,}" for v in vals) + " |")
    return "\n".join(out) + "\n"


def histogram(values: np.ndarray, edges: list[float]) -> str:
    v = values[values > 0]
    h, _ = np.histogram(v, bins=edges)
    return ", ".join(f"{edges[i]:.3g}-{min(1.0, edges[i + 1]):.3g}: {int(c):,}" for i, c in enumerate(h))


def _log(msg: str) -> None:
    import sys  # noqa: PLC0415
    import time  # noqa: PLC0415

    print(f"[fuse {time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def run(world: Path, cache: Path, manifest: list[dict[str, Any]], boundary_lnglat: shapely.Polygon | None,
        landmark_outlines: list[list[tuple[float, float]]] | None = None) -> dict[str, Any]:
    inp = load_world(world, landmark_outlines)
    _log(f"world: {len(inp.osm.geoms):,} OSM buildings, {len(inp.masks.roads):,} road pieces, {len(inp.masks.water):,} water/apron areas")
    parts: list[Footprints] = []
    ovt_osm = None
    codes: set[str] = set()
    pre: Counter[str] = Counter()
    if (cache / OVERTURE_FILE).exists():
        ovt, ovt_osm, codes = load_overture(cache / OVERTURE_FILE, inp.projection)
        parts.append(ovt)
    if (cache / OPENBUILDINGS_FILE).exists():
        gob, pre = load_openbuildings(cache / OPENBUILDINGS_FILE, inp.projection, codes)
        parts.append(gob)
    if (cache / MICROSOFT_FILE).exists():
        parts.append(load_microsoft(cache / MICROSOFT_FILE, inp.projection))
    ext = Footprints.concat(parts)
    del parts
    _log(f"external footprints: {len(ext):,}; Overture OSM copies {len(ovt_osm) if ovt_osm is not None else 0:,}; Google skipped {dict(pre)}")
    outcome = fuse_footprints(inp.osm, ext, inp.masks, ovt_osm)
    outcome.reasons[SRC_GOOGLE].update(pre)
    _log(f"fused: kept {len(outcome.kept):,}")
    fw = assemble(inp, ext, outcome, boundary_lnglat)
    sizes = write(fw, inp, world, manifest)
    edges = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001]
    thresholds = {
        "share of an external footprint on OSM buildings (footprints that touch one)": histogram(outcome.overlap_ratio, edges),
        "the same, 0 to 0.4 in steps of 0.025": histogram(outcome.overlap_ratio, [i * 0.025 for i in range(17)]),
        "overlap / smaller area between two external footprints (pairs that touch)": histogram(outcome.dup_ratio, edges),
        "the same, 0 to 0.4 in steps of 0.025 ": histogram(outcome.dup_ratio, [i * 0.025 for i in range(17)]),
        "add only below (share on OSM)": ADD_MAX_OVERLAP,
        "same building across sources at or above": DUP_MIN_OVERLAP,
        "Google confidence at least": GOOGLE_MIN_CONFIDENCE,
    }
    present = list(inp.world_json["fusion"]["present"])
    write_attribution(world, manifest, present)
    (world / "FUSION.md").write_text(coverage_markdown(fw, inp, sizes, manifest, thresholds))
    by_source: dict[str, int] = defaultdict(int)
    for (_r, s), v in fw.new_by_ring_source.items():
        by_source[FUSION_SOURCES[s]] += v
    return {**sizes, "added": dict(by_source), "osm_heights": len(outcome.osm_heights), "boxes": fw.boxes, "polygons": fw.polygons,
            "validation": {FUSION_SOURCES[s]: v.__dict__ for s, v in outcome.validation.items()}, "reasons": {FUSION_SOURCES[s]: dict(c) for s, c in outcome.reasons.items()}}
