"""Coverage report: which chunks and streets have openly licensed street-level imagery.

Honesty rules (enforced here and tested):
- a chunk or street is called "without imagery" only when a successful search covered it;
  otherwise it is "not searched", and with no successful search at all the report says so and
  every count is zero rather than invented;
- nothing is sampled, extrapolated or estimated: counts come from the stored records.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from .bbox import BBox
from .grid import PROJECTION, ChunkGrid
from .models import ImageRecord
from .roads import Street
from .store import Store

NEAR_M = 30.0  # an image "covers" a road sample when it was taken within this distance
STREET_COVERED_FRACTION = 0.5  # below this share of its samples covered, a street goes on the manual reference list


class _Hash:
    def __init__(self, points: list[tuple[float, float]], cell: float) -> None:
        self.cell = cell
        self.cells: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
        for x, z in points:
            self.cells[(math.floor(x / cell), math.floor(z / cell))].append((x, z))

    def near(self, x: float, z: float, r: float) -> bool:
        cx, cz = math.floor(x / self.cell), math.floor(z / self.cell)
        r2 = r * r
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for px, pz in self.cells.get((cx + i, cz + j), ()):
                    if (px - x) ** 2 + (pz - z) ** 2 <= r2:
                        return True
        return False


@dataclass
class Report:
    data: dict[str, Any]

    def markdown(self) -> str:
        return to_markdown(self.data)


def build_report(store: Store, grid: ChunkGrid, aoi: BBox, streets: list[Street] | None = None, when: str | None = None) -> Report:
    ok = store.searches("ok")
    failed = store.searches("failed")
    providers_ok = sorted({p for p, *_ in ok})
    searched_boxes = [b for _, b, *_ in ok]
    images: list[ImageRecord] = [r for r in store.images() if aoi.contains(r.lat, r.lng)]
    chunks = grid.chunks_inside(aoi)
    by_chunk: dict[tuple[int, int], list[ImageRecord]] = defaultdict(list)
    for r in images:
        by_chunk[grid.chunk_of(r.lat, r.lng)].append(r)
    searched: list[tuple[int, int]] = [c for c in chunks if any(b.contains_box(grid.chunk_box(*c)) for b in searched_boxes)]
    with_img = [c for c in searched if c in by_chunk]
    without = [c for c in searched if c not in by_chunk]
    not_searched = [c for c in chunks if c not in set(searched)]
    sequences = {(r.provider, r.sequence_id) for r in images if r.sequence_id}
    hist = Counter(r.captured_at[:4] for r in images if r.captured_at)
    data: dict[str, Any] = {
        "format": 1,
        "generated_at": when,
        "aoi": {"south": aoi.south, "west": aoi.west, "north": aoi.north, "east": aoi.east},
        "coverage_known": bool(ok),
        "searches": {"ok": len(ok), "failed": len(failed), "providers_ok": providers_ok,
                     "failure_reasons": sorted({er for _, _, _, _, er, _ in failed if er})},
        "chunks": {"total": len(chunks), "searched": len(searched), "with_imagery": len(with_img),
                   "without_imagery": len(without), "not_searched": len(not_searched)},
        "images": {"total": len(images), "by_provider": dict(Counter(r.provider for r in images)),
                   "with_capture_date": sum(1 for r in images if r.captured_at)},
        "sequences": len(sequences),
        "capture_year_histogram": dict(sorted(hist.items())),
        "chunk_counts": {f"{c},{r}": len(v) for (c, r), v in sorted(by_chunk.items()) if (c, r) in set(chunks)},
        "streets": None,
        "manual_reference_list": [],
    }
    if streets is not None:
        data["streets"], data["manual_reference_list"] = _street_stats(streets, images, ok_known=bool(ok), searched_boxes=searched_boxes)
    return Report(data)


def _street_stats(streets: list[Street], images: list[ImageRecord], ok_known: bool, searched_boxes: list[BBox]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pts = [PROJECTION.to_local(r.lat, r.lng) for r in images]
    h = _Hash(pts, NEAR_M)
    by_name: dict[str, dict[str, Any]] = {}
    for s in streets:
        e = by_name.setdefault(s.name, {"name": s.name, "named": s.named, "highway": s.highway, "samples": 0, "covered": 0})
        e["samples"] += len(s.samples)
        e["covered"] += sum(1 for x, z in s.samples if h.near(x, z, NEAR_M))
    rows = []
    for e in by_name.values():
        e["length_m_approx"] = int(e["samples"] * 10)
        e["covered_fraction"] = round(e["covered"] / e["samples"], 3) if e["samples"] else 0.0
        rows.append(e)
    rows.sort(key=lambda e: (-e["samples"], e["name"]))
    named = [e for e in rows if e["named"]]
    manual: list[dict[str, Any]] = []
    for e in named:
        if not ok_known:
            reason = "not searched"
        elif e["covered_fraction"] < STREET_COVERED_FRACTION:
            reason = "searched, under half of its length has imagery within 30 m"
        else:
            continue
        manual.append({"name": e["name"], "highway": e["highway"], "length_m_approx": e["length_m_approx"], "covered_fraction": e["covered_fraction"], "reason": reason})
    summary = {"named_streets": len(named), "named_streets_covered": sum(1 for e in named if e["covered_fraction"] >= STREET_COVERED_FRACTION),
               "unnamed_length_m_approx": sum(e["length_m_approx"] for e in rows if not e["named"]), "near_m": NEAR_M, "rows": rows}
    return summary, manual


def to_markdown(d: dict[str, Any]) -> str:
    L: list[str] = ["# Street imagery coverage report", ""]
    a = d["aoi"]
    L.append(f"Area: S {a['south']}, W {a['west']}, N {a['north']}, E {a['east']}. Generated {d['generated_at'] or '(time not recorded)'}.")
    L.append("")
    if not d["coverage_known"]:
        L += ["**No search has succeeded, so no coverage is known.** Every count below is zero because nothing was learned, not because the area has no imagery.", ""]
        if d["searches"]["failed"]:
            L.append(f"Failed searches: {d['searches']['failed']}. Reasons: " + "; ".join(d["searches"]["failure_reasons"]) + "\n")
    c = d["chunks"]
    L += ["## Chunks (250 m)", "", "| Total in area | Searched | With imagery | Searched, none found | Not searched |", "|---|---|---|---|---|",
          f"| {c['total']} | {c['searched']} | {c['with_imagery']} | {c['without_imagery']} | {c['not_searched']} |", ""]
    im = d["images"]
    L += ["## Photographs", "", f"{im['total']} photographs in {d['sequences']} sequences; by provider: {im['by_provider'] or 'none'}; with a capture date: {im['with_capture_date']}.", ""]
    L += ["## Capture years", ""]
    L += [f"- {y}: {n}" for y, n in d["capture_year_histogram"].items()] or ["(none)"]
    L.append("")
    s = d["streets"]
    if s is not None:
        L += ["## Streets (OSM roads of the game world)", "", f"{s['named_streets']} named streets in the area, {s['named_streets_covered']} with at least half their length within {s['near_m']:.0f} m of a photograph; about {s['unnamed_length_m_approx']} m of unnamed road.", ""]
        L += ["## Manual reference list", "", "Streets to photograph or inspect by hand (reference photographs are never stored in the repo):", ""]
        L += ["| Street | Class | Length (m) | Covered | Why |", "|---|---|---|---|---|"]
        L += [f"| {m['name']} | {m['highway']} | {m['length_m_approx']} | {('n/a' if not d['coverage_known'] else format(m['covered_fraction'], '.0%'))} | {m['reason']} |" for m in d["manual_reference_list"]]
        L.append("")
    return "\n".join(L) + "\n"
