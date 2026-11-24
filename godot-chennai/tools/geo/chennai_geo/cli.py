"""Command line for the world pipeline. Run from godot-chennai/tools/geo:

    python -m chennai_geo.cli fetch                  # TN PBF -> data/raw, MANIFEST.json
    python -m chennai_geo.cli boundary               # derive data/boundary/world-boundary.geojson
    python -m chennai_geo.cli clip                   # osmium extract to the boundary
    python -m chennai_geo.cli build --max-ring 3     # -> godot-chennai/world/ + REPORT.md
    python -m chennai_geo.cli build-v1 OUT           # ring 0 in today's format 1 (comparison)
    python -m chennai_geo.cli convert-v1 IN OUT      # today's files -> format 2
    python -m chennai_geo.cli compare                # ring-0 counts vs today's committed world
    python -m chennai_geo.cli landmarks-rank         # -> data/landmarks/candidates.json + COVERAGE.md
    python -m chennai_geo.cli landmark-osm ID        # OSM footprints into assets/landmarks/ID/spec.json
    python -m chennai_geo.cli fetch-buildings        # Overture, Google, Microsoft extracts -> cache (G-220)
    python -m chennai_geo.cli fuse                   # -> world/tiles/*/fusion.bin + FUSION.md (after build)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from .boundary import load_boundary, save_boundary, world_boundary
from .convert import counts, v1_to_world
from .manifest import TN_PBF_URL, entry, fetch, write_manifest
from .osm_parse import parse_osm
from .regions import playable_for, world_grid
from .report import write_reports
from .world import build_world
from .writer import write_world_v1, write_world_v2

HERE = Path(__file__).resolve().parents[1]
GODOT = HERE.parents[1]  # godot-chennai/
REPO = GODOT.parent
DATA = GODOT / "data"
RAW = DATA / "raw"
BOUNDARY = DATA / "boundary" / "world-boundary.geojson"
MANIFEST = DATA / "MANIFEST.json"
WORLD = GODOT / "world"
TODAY = REPO / "chennai-open-world" / "apps" / "game" / "public" / "world"
# Building extracts (hundreds of MB) live outside the repository; never committed.
FUSION_CACHE = Path(os.environ.get("CHENNAI_FUSION_CACHE", str(Path.home() / "geo-cache" / "fusion")))


def _manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"datasets": []}


def _pbf() -> Path:
    return RAW / "tamil_nadu-latest.osm.pbf"


def _osm_timestamp() -> str:
    for d in _manifest().get("datasets", []):
        if d.get("id") == "osm-tamil-nadu":
            return str(d["osmDataTimestamp"])
    return "unknown"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="chennai_geo")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--existing", type=Path, help="record an already downloaded PBF instead of downloading")
    f.add_argument("--timestamp", help="OSM data timestamp for --existing (from the .state.txt)")
    sub.add_parser("boundary")
    sub.add_parser("clip")
    b = sub.add_parser("build")
    b.add_argument("--max-ring", type=int, default=3)
    b.add_argument("--out", type=Path, default=WORLD)
    b.add_argument("--osm", type=Path, default=RAW / "world.osm.pbf")
    v = sub.add_parser("build-v1")
    v.add_argument("out", type=Path)
    v.add_argument("--osm", type=Path, default=RAW / "world.osm.pbf")
    c = sub.add_parser("convert-v1")
    c.add_argument("src", type=Path, nargs="?", default=TODAY)
    c.add_argument("out", type=Path)
    cmp_ = sub.add_parser("compare")
    cmp_.add_argument("--osm", type=Path, default=RAW / "world.osm.pbf")
    lr = sub.add_parser("landmarks-rank")
    lr.add_argument("--osm", type=Path, default=RAW / "world.osm.pbf")
    lr.add_argument("--out", type=Path, default=DATA / "landmarks")
    lo = sub.add_parser("landmark-osm")
    lo.add_argument("ids", nargs="*", help="landmark ids (default: every spec)")
    lo.add_argument("--osm", type=Path, default=RAW / "world.osm.pbf")
    fb = sub.add_parser("fetch-buildings")
    fb.add_argument("--cache", type=Path, default=FUSION_CACHE)
    fb.add_argument("--duckdb-ext", type=Path, default=Path.home() / "geo-cache" / "duckdb-ext",
                    help="folder with httpfs/spatial .duckdb_extension files (from https://extensions.duckdb.org)")
    fb.add_argument("--only", choices=["overture", "google", "microsoft"], action="append")
    fu = sub.add_parser("fuse")
    fu.add_argument("--cache", type=Path, default=FUSION_CACHE)
    fu.add_argument("--world", type=Path, default=WORLD)
    a = ap.parse_args(argv)

    if a.cmd == "fetch":
        e = entry(a.existing, TN_PBF_URL, a.timestamp or "unknown") if a.existing else fetch(RAW)
        m = _manifest()
        others = [d for d in m.get("datasets", []) if d.get("id") != e["id"]]
        write_manifest(MANIFEST, [e, *others], {k: v for k, v in m.items() if k not in ("datasets", "format")})
        print(json.dumps(e, indent=2))
    elif a.cmd == "boundary":
        admin = RAW / "admin4.osm.pbf"
        subprocess.run(["osmium", "tags-filter", "--overwrite", "-o", str(admin), str(_pbf()), "r/admin_level=4"], check=True)
        out = subprocess.run(["osmium", "export", str(admin), "-f", "geojsonseq"], check=True, capture_output=True, text=True).stdout
        from shapely.geometry import shape  # noqa: PLC0415

        state = None
        for line in out.splitlines():
            feat = json.loads(line.strip("\x1e"))
            if feat["properties"].get("name:en") == "Tamil Nadu" and feat["geometry"]["type"] in ("Polygon", "MultiPolygon"):
                state = shape(feat["geometry"])
        if state is None:
            print("No Tamil Nadu admin_level=4 polygon in the PBF", file=sys.stderr)
            return 1
        save_boundary(world_boundary(state), BOUNDARY, f"OSM Tamil Nadu admin_level=4 relation, {_osm_timestamp()}; box 79.95-80.40 E, 12.68-13.60 N; plus the sea east of the coast")
        print(f"wrote {BOUNDARY}")
    elif a.cmd == "clip":
        subprocess.run(["osmium", "extract", "-p", str(BOUNDARY), "-s", "smart", "-S", "types=multipolygon,boundary", "--overwrite", "-o", str(RAW / "world.osm.pbf"), str(_pbf())], check=True)
        print(f"wrote {RAW / 'world.osm.pbf'}")
    elif a.cmd in ("build", "build-v1", "compare"):
        t = time.time()
        feats = parse_osm(a.osm, timestamp=_osm_timestamp())
        grid = world_grid()
        bd = load_boundary(BOUNDARY)
        if a.cmd == "build":
            playables = [playable_for(r, bd) for r in range(a.max_ring + 1)]
            from .landmark_spec import exclude_outlines  # noqa: PLC0415

            w = build_world(feats, grid, playables, a.max_ring, landmark_footprints=exclude_outlines())
            src = {"datasets": _manifest().get("datasets", []), "boundary": "data/boundary/world-boundary.geojson", "builtBy": "godot-chennai/tools/geo"}
            sizes = write_world_v2(w, a.out, src)
            header = f"OSM data {w.data_date} (© OpenStreetMap contributors, ODbL 1.0). Rings 0..{a.max_ring}."
            write_reports(w, a.out, sizes, header)
            print(json.dumps(sizes, indent=1), f"{time.time() - t:.0f} s")
        elif a.cmd == "build-v1":
            w = build_world(feats, grid, [playable_for(0, None)], 0, repair=False, v2=False)
            print(write_world_v1(w, a.out))
        else:
            w = build_world(feats, grid, [playable_for(0, None)], 0, repair=False, v2=False)
            print(json.dumps({"rebuilt_v1_rules": counts(w), "today": counts(v1_to_world(TODAY))}, indent=1))
    elif a.cmd == "landmarks-rank":
        from .landmark_candidates import rank, read_candidates, write_candidates  # noqa: PLC0415

        world = playable_for(3, load_boundary(BOUNDARY))
        rows = rank(read_candidates(a.osm, world.inside))
        cov = write_candidates(rows, a.out, f"OSM Tamil Nadu extract {_osm_timestamp()}, clipped to the world boundary")
        print(json.dumps({k: v for k, v in cov.items() if k != "by_kind"}, indent=1))
    elif a.cmd == "landmark-osm":
        from .landmark_spec import SPECS, fill_from_osm  # noqa: PLC0415

        for path in sorted(SPECS.glob("*/spec.json")):
            if not a.ids or path.parent.name in a.ids:
                print(fill_from_osm(path, a.osm))
    elif a.cmd == "fetch-buildings":
        from . import fusion_fetch as ff  # noqa: PLC0415

        box = ff.world_box(json.loads((WORLD / "world.json").read_text()))
        m = _manifest()
        got = {d["id"]: d for d in m.get("buildings", [])}
        for which in a.only or ["overture", "google", "microsoft"]:
            if which == "overture":
                e = ff.fetch_overture(a.cache, box, a.duckdb_ext)
            elif which == "google":
                e = ff.fetch_openbuildings(a.cache, box)
            else:
                e = ff.fetch_microsoft(a.cache, box)
            got[e["id"]] = e
            print(json.dumps({k: v for k, v in e.items() if k not in ("cells", "files")}, indent=1))
        m["buildings"] = [got[k] for k in ("overture-buildings", "google-openbuildings-v3", "microsoft-ml-buildings") if k in got]
        write_manifest(MANIFEST, m.get("datasets", []), {k: v for k, v in m.items() if k not in ("datasets", "format")})
    elif a.cmd == "fuse":
        from . import fusion_world  # noqa: PLC0415
        from .landmark_spec import exclude_outlines  # noqa: PLC0415

        if not any((a.cache / n).exists() for n in ("overture-buildings.parquet", "openbuildings-v3.csv.gz", "microsoft-ml.geojsonl.gz")):
            print(f"No building extracts in {a.cache}: run fetch-buildings, or pass --cache / CHENNAI_FUSION_CACHE", file=sys.stderr)
            return 1
        t = time.time()
        res = fusion_world.run(a.world, a.cache, _manifest().get("buildings", []), load_boundary(BOUNDARY), exclude_outlines())
        print(json.dumps(res, indent=1), f"{time.time() - t:.0f} s")
    elif a.cmd == "convert-v1":
        w = v1_to_world(a.src)
        print(write_world_v2(w, a.out, {"convertedFrom": str(a.src)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
