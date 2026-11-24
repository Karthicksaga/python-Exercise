"""Multi-source fusion (G-220…G-226) on the committed fixture `fixtures/fusion_small.json`:
OSM wins, the overlap thresholds, confidence and size sanity, masks, the choice between sources,
height priority and validation, provenance, the fusion.bin round trip."""
import json
import math
from pathlib import Path

import numpy as np
import shapely

from chennai_geo import fusion_codec
from chennai_geo.fusion_codec import FusedBuilding, FusedChunk, FusionTile, HeightFix
from chennai_geo.fusion_multi import (ADD_MAX_OVERLAP, DUP_MIN_OVERLAP, FUSION_SOURCES, OVERTURE_ORIGINS, SRC_MICROSOFT, SRC_OVERTURE, Footprints, Masks,
                                      OsmSide, as_rect, estimate_floors, external_height, fuse_footprints, rect_outline)
from chennai_geo.regions import Grid

FIX = json.loads((Path(__file__).parent / "fixtures" / "fusion_small.json").read_text())


def _osm() -> OsmSide:
    o = FIX["osm"]
    return OsmSide(np.array([shapely.Polygon(b["outline"]) for b in o], dtype=object), [b["heightFrom"] for b in o], np.array([b["height"] for b in o]))


def _ext(items: list[dict]) -> Footprints:
    return Footprints(
        np.array([shapely.Polygon(e["outline"]) for e in items], dtype=object),
        np.array([FUSION_SOURCES.index(e["source"]) for e in items], np.int64),
        np.arange(len(items), dtype=np.int64),
        np.array([OVERTURE_ORIGINS.index(e.get("origin", "")) for e in items], np.int64),
        np.array([e.get("confidence", -1.0) for e in items]),
        np.array([external_height(e.get("height"), None) for e in items]),
    )


def _masks() -> Masks:
    m = FIX["masks"]
    return Masks(water=[shapely.Polygon(p) for p in m["water"]],
                 roads=[shapely.buffer(shapely.LineString(r["line"]), r["width"] / 2, cap_style="flat") for r in m["roads"]],
                 landmarks=[shapely.Polygon(p) for p in m["landmarks"]], world=shapely.Polygon(m["world"]))


def test_every_fixture_footprint_gets_the_expected_outcome() -> None:
    items = FIX["external"]
    out = fuse_footprints(_osm(), _ext(items), _masks())
    kept = {int(k) for k in out.kept}
    for i, e in enumerate(items):
        assert (i in kept) == (e["expect"] == "added"), e["name"]
    # every reason in the fixture is counted exactly as often as the fixture expects it
    want: dict[tuple[int, str], int] = {}
    for e in items:
        k = (FUSION_SOURCES.index(e["source"]), e["expect"])
        want[k] = want.get(k, 0) + 1
    got = {(s, why): n for s, c in out.reasons.items() for why, n in c.items()}
    assert got == want


def test_thresholds_are_the_documented_ones() -> None:
    assert ADD_MAX_OVERLAP == 0.15 and DUP_MIN_OVERLAP == 0.3
    out = fuse_footprints(_osm(), _ext(FIX["external"]), _masks())
    names = [e["name"] for e in FIX["external"]]
    r = dict(zip(names, out.overlap_ratio))
    assert math.isclose(r["touch-14pc-of-osm-a"], 0.14, abs_tol=1e-6) and math.isclose(r["touch-16pc-of-osm-a"], 0.16, abs_tol=1e-6)
    assert math.isclose(r["partial-30pc-on-osm-a"], 0.30, abs_tol=1e-6) and r["village-house-google"] == 0


def test_osm_height_and_levels_win_and_estimated_osm_takes_an_overture_height() -> None:
    out = fuse_footprints(_osm(), _ext(FIX["external"]), _masks())
    assert out.osm_heights == {3: (15.0, "overture", SRC_OVERTURE)}  # osm-d only: a and c have none, b has its own
    v = out.validation[SRC_OVERTURE]
    assert v.pairs == 1 and v.bias == -5.0 and not v.refused


def test_a_source_that_disagrees_with_osm_is_refused() -> None:
    n = 25
    osm = OsmSide(np.array([shapely.box(i * 50, 0, i * 50 + 20, 20) for i in range(n + 1)], dtype=object), ["height"] * n + ["estimated"], np.array([10.0] * n + [7.1]))
    ext = Footprints(np.array([shapely.box(i * 50, 0, i * 50 + 20, 20) for i in range(n + 1)], dtype=object), np.full(n + 1, SRC_MICROSOFT, np.int64),
                     np.arange(n + 1, dtype=np.int64), height=np.full(n + 1, 15.0))
    out = fuse_footprints(osm, ext, Masks())
    v = out.validation[SRC_MICROSOFT]
    assert v.pairs == n and v.mae == 5.0 and v.refused
    assert out.osm_heights == {}  # the estimated building keeps its estimate
    ok = Footprints(ext.geoms, ext.source, ext.index, height=np.full(n + 1, 11.0))
    out2 = fuse_footprints(osm, ok, Masks())
    assert not out2.validation[SRC_MICROSOFT].refused and out2.osm_heights == {n: (11.0, "microsoft", SRC_MICROSOFT)}


def test_overture_heights_come_before_microsoft_heights() -> None:
    osm = OsmSide(np.array([shapely.box(0, 0, 20, 20)], dtype=object), ["estimated"], np.array([7.1]))
    ext = Footprints(np.array([shapely.box(0, 0, 20, 20), shapely.box(0.2, 0, 20.2, 20)], dtype=object), np.array([SRC_MICROSOFT, SRC_OVERTURE], np.int64),
                     np.arange(2, dtype=np.int64), height=np.array([20.0, 12.0]))
    assert fuse_footprints(osm, ext, Masks()).osm_heights == {0: (12.0, "overture", SRC_OVERTURE)}


def test_external_height_rules() -> None:
    assert external_height(12.0, None) == 12.0
    assert math.isclose(external_height(None, 3), 3 * 3.1 + 0.9)
    assert math.isnan(external_height(1.0, None)) and math.isnan(external_height(None, 0)) and math.isnan(external_height(-1, None))


def test_estimated_floors_by_kind_are_stable() -> None:
    assert estimate_floors(0x40000001, 30.0) == (1, "house")
    f, k = estimate_floors(0x40000002, 120.0)
    assert k == "house" and f in (1, 2) and estimate_floors(0x40000002, 120.0) == (f, k)
    f, k = estimate_floors(0x40000003, 600.0)
    assert k == "apartments" and 3 <= f <= 5


def test_rectangles_are_found_and_round_trip() -> None:
    pts = [(10.0, 5.0), (22.0, 9.0), (20.0, 15.0), (8.0, 11.0)]
    r = as_rect(pts)
    assert r is not None and 0 <= r.angle < math.pi
    back = shapely.Polygon(rect_outline(r))
    assert shapely.hausdorff_distance(back, shapely.Polygon(pts)) < 0.05
    x = [p[0] for p in rect_outline(r)]
    z = [p[1] for p in rect_outline(r)]
    shoelace = sum(x[i] * z[(i + 1) % 4] - x[(i + 1) % 4] * z[i] for i in range(4))
    assert shoelace > 0  # anticlockwise seen from above in the game frame
    assert as_rect([(0, 0), (10, 0), (12, 8), (0, 6)]) is None  # not a rectangle


def _grid() -> Grid:
    return Grid(-1000.0, -1000.0, 80, 80)


def test_fusion_file_round_trip_keeps_provenance_heights_and_shape() -> None:
    g = _grid()
    box_pts = rect_outline(as_rect([(10.0, 5.0), (22.0, 9.0), (20.0, 15.0), (8.0, 11.0)]))  # type: ignore[arg-type]
    poly = [(30.0, 30.0), (40.0, 30.0), (44.0, 36.0), (36.0, 42.0), (30.0, 38.0)]
    t = FusionTile((0, 0), [HeightFix(1234, 15.0, 5, "overture", SRC_OVERTURE)], [
        FusedChunk(4, 4, 1, fusion_codec.FIRST_ID, [
            FusedBuilding(1, 2, 77, -1.0, 7.1, "estimated", 2, "house", 0xF2E3C6, box_pts, as_rect(box_pts)),
            FusedBuilding(2, 0, 2**32 - 1, 0.8125, 12.0, "estimated", 3, "apartments", 0xE8C9A0, poly),
            FusedBuilding(3, 0, 5, -1.0, 9.5, "microsoft", 3, "house", 0xCFE3D4, poly),
        ])])
    data = fusion_codec.encode(t, g.centre)
    assert data[:4] == b"COWF"
    back = fusion_codec.decode(data, g.centre)
    assert back.heights == t.heights
    [c] = back.chunks
    assert (c.col, c.row, c.ring, c.first_id) == (4, 4, 1, 0xC0000000)
    a, b, m = c.buildings
    assert (a.source, a.origin, a.index, a.confidence, a.height, a.floors, a.kind) == (1, 2, 77, -1.0, 7.1, 2, "house")
    assert shapely.hausdorff_distance(shapely.Polygon(a.outline), shapely.Polygon(box_pts)) < 0.15
    assert (b.source, b.index, b.height, b.kind) == (2, 2**32 - 1, 12.0, "apartments") and abs(b.confidence - 0.8125) <= 0.0025  # 1/200 steps
    assert all(abs(p[0] - q[0]) < 0.03 and abs(p[1] - q[1]) < 0.03 for p, q in zip(b.outline, poly))
    assert (m.source, m.height_from, m.height) == (3, "microsoft", 9.5)
    assert len(fusion_codec.encode(FusionTile((0, 0)), g.centre)) == 4 + 2 + 2 + 4 + 2 + 2 * 8 + 4 + 4
