"""Derive `data/areas/palettes.json` from `data/areas/areas.json` (G-200).

The palette file is the small, flat shape the building-detail code reads: per area id, the wall
and roof colours, roof shape weights (the world format's roof vocabulary, enums.ROOF_SHAPES) and
storey weights (bins "1", "2", "3", "4-5", "6-9", "10+", the same bins as the coverage table).
Everything in it is an estimate (see the status fields in areas.json); the file says so.

    python -m chennai_geo.area_palettes --areas data/areas/areas.json --out data/areas/palettes.json
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from .enums import ROOF_SHAPES

STOREY_BINS = ["1", "2", "3", "4-5", "6-9", "10+"]


def _round_weights(w: dict[str, float], keys: list[str]) -> dict[str, float]:
    out = {k: round(w.get(k, 0.0), 4) for k in keys}
    # absorb the rounding error into the largest entry so the weights sum to exactly 1
    big = max(out, key=lambda k: out[k])
    out[big] = round(out[big] + (1.0 - sum(out.values())), 4)
    return out


def derive_area(a: dict[str, Any]) -> dict[str, Any]:
    roof: Counter[str] = Counter()
    for r in a["roofs"]["mix"]:
        roof[r["shape"]] += r["weight"]
    shapes = [s for s in ROOF_SHAPES if s != "unknown"]
    for s in roof:
        if s not in shapes:
            raise ValueError(f"{a['id']}: roof shape {s!r} is not in the world format's vocabulary")
    return {
        "type": a["character"]["type"],
        "walls": [c["hex"] for c in a["wall_palette"]["colours"]],
        "roofs": list(a["roofs"]["colours"]["hex"]),
        "roof_types": {k: v for k, v in _round_weights(dict(roof), shapes).items() if v > 0},
        "storeys": _round_weights(a["storeys"]["weights"], STOREY_BINS),
        "boundary": a["boundary"],
    }


def derive(doc: dict[str, Any]) -> dict[str, Any]:
    areas = {a["id"]: derive_area(a) for a in doc["areas"]}
    n = len(areas)
    roof: Counter[str] = Counter()
    sto: Counter[str] = Counter()
    walls: Counter[str] = Counter()
    for p in areas.values():
        for k, v in p["roof_types"].items():
            roof[k] += v / n
        for k, v in p["storeys"].items():
            sto[k] += v / n
        walls.update(p["walls"])
    shapes = [s for s in ROOF_SHAPES if s != "unknown"]
    default = {
        "type": "default",
        "walls": [h for h, _ in sorted(walls.items(), key=lambda kv: (-kv[1], kv[0]))[:8]],
        "roofs": ["#8A4B32", "#BDB8AD", "#8C8B85", "#B7B2A6"],
        "roof_types": {k: v for k, v in _round_weights(dict(roof), shapes).items() if v > 0},
        "storeys": _round_weights(dict(sto), STOREY_BINS),
        "boundary": None,
    }
    return {
        "format": 1,
        "decision": "G-200",
        "note": "Estimated, not measured. Derived from areas.json by tools/geo/chennai_geo/area_palettes.py; regenerate, never edit by hand. "
                "Colours are hex strings (#RRGGBB). roof_types keys are the world format's roof shapes (enums.ROOF_SHAPES), weights sum to 1. "
                "storeys keys are floor-count bins, weights sum to 1. An area's boundary (circle or corridor, world metres, +X east, +Z south) "
                "lets a reader pick the area of a building: smallest distance / radius (or / half_width_m) among the areas that contain it; "
                "use `default` outside every area.",
        "licence": "Original estimates; boundary geometry derived from OSM place data (ODbL 1.0, © OpenStreetMap contributors).",
        "roof_shapes": shapes,
        "storey_bins": STOREY_BINS,
        "default": default,
        "areas": areas,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--areas", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    doc = json.loads(Path(a.areas).read_text(encoding="utf-8"))
    Path(a.out).write_text(json.dumps(derive(doc), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
