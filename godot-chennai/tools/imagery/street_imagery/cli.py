"""Command line: discover, report, export, check.

    python -m street_imagery discover --provider mapillary [--bbox S,W,N,E] --db imagery.sqlite
    python -m street_imagery report --db imagery.sqlite --out report.md [--json report.json]
    python -m street_imagery export --db imagery.sqlite --out images.jsonl
    python -m street_imagery check            # validate assets/street_ref/
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import kartaview, mapillary
from .bbox import ANNA_NAGAR, parse_bbox
from .coverage import build_report
from .discover import discover
from .errors import ImageryError, MissingTokenError
from .grid import ChunkGrid
from .http import HttpClient
from .roads import load_streets
from .store import Store, now_iso
from .validate import ROOT, check_tree


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="street_imagery")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover", help="search a provider for images in a box and store the records")
    d.add_argument("--provider", choices=["mapillary", "kartaview"], required=True)
    d.add_argument("--bbox", default=None, help="south,west,north,east in degrees (default: Anna Nagar)")
    d.add_argument("--db", required=True, type=Path)
    r = sub.add_parser("report", help="coverage report from the database")
    r.add_argument("--db", required=True, type=Path)
    r.add_argument("--bbox", default=None)
    r.add_argument("--out", type=Path)
    r.add_argument("--json", type=Path)
    r.add_argument("--no-streets", action="store_true")
    e = sub.add_parser("export", help="write the database as JSON lines")
    e.add_argument("--db", required=True, type=Path)
    e.add_argument("--out", required=True, type=Path)
    c = sub.add_parser("check", help="validate assets/street_ref/")
    c.add_argument("--root", type=Path, default=ROOT)
    a = ap.parse_args(argv)

    if a.cmd == "check":
        problems = check_tree(a.root)
        for p in problems:
            print("PROBLEM:", p)
        print(f"{len(problems)} problems" if problems else "street_ref OK")
        return 1 if problems else 0

    store = Store(a.db)
    try:
        if a.cmd == "export":
            print(f"wrote {store.export_jsonl(a.out)} records to {a.out}")
            return 0
        box = parse_bbox(a.bbox) if a.bbox else ANNA_NAGAR
        grid = ChunkGrid.from_world()
        if a.cmd == "report":
            streets = None if a.no_streets else load_streets(box)
            rep = build_report(store, grid, box, streets, when=now_iso())
            text = rep.markdown()
            if a.out:
                a.out.write_text(text, encoding="utf-8")
            else:
                print(text)
            if a.json:
                a.json.write_text(json.dumps(rep.data, indent=1), encoding="utf-8")
            return 0
        http = HttpClient()
        try:
            if a.provider == "mapillary":
                client: mapillary.MapillaryClient | kartaview.KartaViewClient = mapillary.MapillaryClient(mapillary.token_from_env(), http)
            else:
                client = kartaview.KartaViewClient(http, kartaview.token_from_env())
        except MissingTokenError as ex:
            print(f"STOP: {ex}", file=sys.stderr)
            return 2
        try:
            res = discover(a.provider, client, box, store, grid)
        except ImageryError as ex:
            print(f"STOP: {ex}", file=sys.stderr)
            return 3
        print(f"{res.provider}: {res.tiles_ok} tiles ok, {res.tiles_failed} failed, {res.images_found} images found, {res.images_new} new")
        for m in res.errors[:5]:
            print("  error:", m, file=sys.stderr)
        return 0 if res.tiles_failed == 0 else 3
    finally:
        store.close()
