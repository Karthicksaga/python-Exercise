"""Ring 0 of the committed regional world reproduces today's world (the Three.js game's committed
files) within a stated tolerance.

Tolerance: 1 % for buildings, bus stops, signals, districts and POIs; 2 % for roads and trees. The
two builds differ by one week of OSM edits (15 Nov vs 23 Nov 2026), multipolygon buildings (new in
v2, counted separately), repaired geometry, and roads/trees at the box edge (the regional world
doesn't cut roads at today's box). Same landmarks, and the same height-source mix within 1 %.
"""
import json

import pytest
from conftest import TODAY, WORLD

from chennai_geo import codec_v1
from chennai_geo.geometry import Bounds, centroid, inside_bounds
from chennai_geo.regions import ring0_bounds
from chennai_geo.writer import read_world_v2

pytestmark = pytest.mark.skipif(not (WORLD / "world.json").exists() or not (TODAY / "index.json").exists(), reason="world files missing")


@pytest.fixture(scope="module")
def both():
    index = json.loads((TODAY / "index.json").read_text())
    b = Bounds(index["bounds"]["minX"], index["bounds"]["maxX"], index["bounds"]["minZ"], index["bounds"]["maxZ"])
    chunks = [codec_v1.decode_chunk(f.read_bytes(), b, 250) for f in (TODAY / "c").glob("*.bin")]
    today = {
        "buildings": [x for c in chunks for x in c["buildings"]],
        "trees": sum(len(c["trees"]) for c in chunks),
        "roads": {int(r.id) // 10 for r in codec_v1.decode_roads((TODAY / "roads.bin").read_bytes(), index["roadNames"])},
        "index": index,
    }
    return today, read_world_v2(WORLD)


def _near(a: int, b: int, tol: float) -> bool:
    return abs(a - b) <= tol * b


def test_buildings(both) -> None:
    today, w = both
    r0 = ring0_bounds()
    blds = [x for t in w["tiles"] for c in t["chunks"] if c.ring == 0 for x in c.buildings if inside_bounds(centroid(x.outline), r0, 2)]
    ways = [x for x in blds if not x.id & 0x80000000]
    assert _near(len(ways), len(today["buildings"]), 0.01), (len(ways), len(today["buildings"]))
    for hf in ("estimated", "levels"):
        n = sum(1 for x in ways if x.height_from == hf)
        m = sum(1 for x in today["buildings"] if x.height_from == hf)
        assert _near(n, m, 0.01), (hf, n, m)
    same = {x.id for x in ways} & {x.id for x in today["buildings"]}
    assert len(same) >= 0.98 * len(today["buildings"])


def test_roads_and_trees(both) -> None:
    today, w = both
    r0 = ring0_bounds()
    ids = set()
    trees = 0
    for t in w["tiles"]:
        for p in t["roads"]:
            if p.road.highway in ("steps", "cycleway", "busway", "road", "track", "motorway", "motorway_link", "raceway"):
                continue
            pts = p.road.points
            if any(inside_bounds(((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2), r0) for i in range(len(pts) - 1)):
                ids.add(p.road.source.id)
        trees += sum(1 for c in t["chunks"] for tr in c.trees if inside_bounds((tr.x, tr.z), r0, 4))
    assert _near(len(ids), len(today["roads"]), 0.02), (len(ids), len(today["roads"]))
    assert _near(trees, today["trees"], 0.02), (trees, today["trees"])


def test_points_and_landmarks(both) -> None:
    today, w = both
    r0 = ring0_bounds()
    ix = today["index"]
    for key in ("busStops", "signals", "districts"):
        n = sum(1 for t in w["tiles"] for p in t["json"][key] if inside_bounds((p["x"], p["z"]), r0, 4))
        assert _near(n, len(ix[key]), 0.01), (key, n, len(ix[key]))
    pois = sum(1 for t in w["tiles"] for p in t["json"]["pois"] if inside_bounds((p[1], p[2]), r0, 4))
    assert _near(pois, len(ix["pois"]), 0.01)
    assert sorted(lm["id"] for lm in w["index"]["landmarks"]) == sorted(lm["id"] for lm in ix["landmarks"])
    by_id = {lm["id"]: lm for lm in ix["landmarks"]}
    for lm in w["index"]["landmarks"]:
        assert abs(lm["x"] - by_id[lm["id"]]["x"]) < 1 and abs(lm["z"] - by_id[lm["id"]]["z"]) < 1


def test_every_ring0_chunk_of_today_exists(both) -> None:
    today, w = both
    off = w["index"]["legacy"]
    have = {(c, r) for t in w["tiles"] for c, r, _o, n, _ring in t["json"]["chunks"]}
    missing = [(c, r) for c, r, n in today["index"]["chunks"] if (c + off["colOffset"], r + off["rowOffset"]) not in have]
    assert len(missing) <= 0.005 * len(today["index"]["chunks"]), missing[:10]
