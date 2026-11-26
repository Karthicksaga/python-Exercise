"""Format 2.1 `infra.bin` (G-150..G-153): deck and ramp heights, waterways, street spots, codec."""
from __future__ import annotations

import json
import math
from collections import Counter

import pytest

from chennai_geo import codec_v2, infra
from chennai_geo.infra import CLEAR, DEFAULT_GRADE, PLATEAU, Spot, Waterway, build_spots, decode_infra, encode_infra, piece_samples, solve_heights
from chennai_geo.model import OsmLine, OsmPoint, Ref, Road
from chennai_geo.projection import PROJECTION

from conftest import WORLD


def road(rid: int, pts: list[tuple[float, float]], kind: str = "primary", bridge: bool = False, layer: int = 0, tunnel: bool = False, highway: str = "primary", width: float = 10.0) -> Road:
    return Road(rid, kind, width, False, pts, highway=highway, bridge=bridge, layer=layer, tunnel=tunnel)


def line(x0: float, x1: float, z: float, step: float = 50.0) -> list[tuple[float, float]]:
    n = int(round((x1 - x0) / step))
    return [(x0 + (x1 - x0) * i / n, z) for i in range(n + 1)]


def flyover() -> list[Road]:
    """An east-west flyover (bridge from x -150 to 150) over a north-south road at x = 0, with
    at-grade approaches 400 m long each side, and a side street off the west approach."""
    return [
        road(10, line(-550, -150, 0)),
        road(20, line(-150, 150, 0), bridge=True, layer=1),
        road(30, line(150, 550, 0)),
        road(40, [(0.0, -300.0), (0.0, 300.0)]),
        road(50, [(-450.0, 0.0), (-450.0, 200.0)], kind="residential", highway="residential", width=7.0),
    ]


def test_flyover_clears_the_road_under_it_and_ramps_down() -> None:
    stats: Counter[str] = Counter()
    prof = solve_heights(flyover(), [], stats)
    deck = prof[20]
    assert deck.at(150.0) == pytest.approx(CLEAR)  # over the crossing
    assert deck.at(150.0 - PLATEAU) == pytest.approx(CLEAR)  # level for PLATEAU either side
    end = CLEAR - DEFAULT_GRADE * (150.0 - PLATEAU)
    assert deck.at(0.0) == pytest.approx(end)  # then down at the arterial grade on the deck
    assert 40 not in prof  # the road underneath stays on the ground
    west = prof[10]
    # Approach: carries on down from the bridge end (x = -150, d = 400 on road 10) to the ground.
    assert west.at(400.0) == pytest.approx(end, abs=0.01)
    assert west.at(380.0) == pytest.approx(end - DEFAULT_GRADE * 20.0, abs=0.01)
    foot = 400.0 - end / DEFAULT_GRADE
    assert west.at(foot - 1.0) == pytest.approx(0.0, abs=1e-6)
    assert west.at(foot + 10.0) > 0.0
    assert stats["deck:clearance-under-4.5m"] == 0


def test_grades_stay_within_limits_and_heights_are_continuous() -> None:
    roads = flyover()
    prof = solve_heights(roads, [])
    for r in roads:
        p = prof.get(r.id)
        if p is None:
            continue
        total = p.dist[-1]
        prev = p.at(0.0)
        d = 1.0
        while d <= total:
            h = p.at(d)
            assert abs(h - prev) <= p.grade * 1.0 + 1e-6, (r.id, d, h, prev)
            prev = h
            d += 1.0
    # Shared node between the approach and the deck: the same height from both roads.
    assert prof[10].at(400.0) == pytest.approx(prof[20].at(0.0), abs=1e-6)
    # The side street meets the approach at x = -450 (100 m along road 10) at the same height.
    side = prof.get(50)
    joint = prof[10].at(100.0)
    assert (side.at(0.0) if side else 0.0) == pytest.approx(joint, abs=1e-6)


def test_stacked_deck_over_a_deck() -> None:
    roads = flyover() + [road(60, [(0.0, -150.0), (0.0, 150.0)], bridge=True, layer=2), road(61, [(0.0, -600.0), (0.0, -150.0)]), road(62, [(0.0, 150.0), (0.0, 600.0)])]
    roads[3] = road(40, [(-30.0, -300.0), (-30.0, 300.0)])  # the ground road moves aside
    prof = solve_heights(roads, [])
    assert prof[60].at(150.0) == pytest.approx(2 * CLEAR)
    assert prof[20].at(150.0) == pytest.approx(CLEAR)


def test_water_bridge_is_low_and_tunnels_stay_down() -> None:
    roads = [
        road(1, line(-300, -40, 0)),
        road(2, [(-40.0, 0.0), (40.0, 0.0)], bridge=True, layer=1),
        road(3, line(40, 300, 0)),
        road(4, [(300.0, 0.0), (300.0, -100.0)], tunnel=True, layer=-1),
    ]
    prof = solve_heights(roads, [])
    h = prof[2].at(40.0)
    assert infra.WATER_MIN <= h <= infra.WATER_MAX
    assert h == pytest.approx(1.0 + 0.02 * 80.0)
    assert 4 not in prof


def test_rail_overbridge_clears_the_railway() -> None:
    roads = [road(1, line(-300, -80, 0)), road(2, [(-80.0, 0.0), (80.0, 0.0)], bridge=True, layer=1), road(3, line(80, 300, 0))]
    rail = OsmLine(9, {"railway": "rail"}, [(0.0, -500.0), (0.0, 500.0)])
    prof = solve_heights(roads, [rail])
    assert prof[2].at(80.0) == pytest.approx(CLEAR)


def test_footbridge_clears_with_stairs() -> None:
    roads = [
        road(1, [(-10.0, -100.0), (-10.0, 100.0)]),
        road(2, [(-25.0, 0.0), (5.0, 0.0)], kind="footway", highway="footway", bridge=True, layer=1, width=2.0),
        road(3, [(5.0, 0.0), (40.0, 0.0)], kind="footway", highway="steps", width=2.0),
    ]
    prof = solve_heights(roads, [])
    assert prof[2].at(10.0) == pytest.approx(infra.FOOT_CLEAR)
    stairs = prof[3]
    assert stairs.at(0.0) == pytest.approx(infra.FOOT_CLEAR)
    assert stairs.at(infra.FOOT_CLEAR / infra.GRADE["footway"] + 0.5) == pytest.approx(0.0, abs=1e-6)


def test_piece_samples_cover_the_piece() -> None:
    prof = solve_heights(flyover(), [])
    pts = [(-150.0, 0.0), (0.0, 0.0), (150.0, 0.0)]
    hs = piece_samples(prof[20], 0.0, pts)
    assert len(hs) == 61
    end = CLEAR - DEFAULT_GRADE * (150.0 - PLATEAU)
    assert hs[30] == pytest.approx(CLEAR) and hs[0] == pytest.approx(end) and hs[-1] == pytest.approx(end)


def test_spots_snap_to_roads_and_rules() -> None:
    roads = [road(1, line(-200, 200, 0, 10)), road(2, [(0.0, 0.0), (0.0, 120.0)], kind="residential", highway="residential", width=7.0), road(3, [(0.0, 0.0), (0.0, -120.0)])]
    spots = [OsmPoint(5, {"highway": "crossing", "crossing": "zebra"}, 100.0, 0.0), OsmPoint(6, {"traffic_calming": "hump"}, -50.0, 0.0), OsmPoint(7, {"highway": "crossing"}, 77.0, 3.0)]
    stats: Counter[str] = Counter()
    out = build_spots(roads, {}, spots, [{"x": 2.0, "z": 1.0}], stats)
    kinds = Counter(s.kind for s in out if s.mapped)
    assert kinds == {"zebra": 1, "hump": 1}
    assert stats["spot:not-on-road"] == 1
    zebra = next(s for s in out if s.mapped and s.kind == "zebra")
    assert zebra.road_id == 1 and zebra.yaw == pytest.approx(math.pi / 2)
    rule = [s for s in out if not s.mapped and s.kind == "zebra"]
    assert len(rule) == 4  # one on each arm of the signalled junction
    assert all(abs(math.hypot(s.x, s.z) - (10.0 / 2 + infra.ZEBRA_SETBACK)) < 0.01 for s in rule)


def test_infra_codec_round_trip() -> None:
    ww = Waterway(123450, "river", 30.0, [(0.0, 0.0), (100.0, 5.0), (2000.0, 10.0)], "Adyar", False, True, Ref(0, 12345))
    sp = Spot("bump", 10.25, -3.5, 1.25, 7.0, 99990, True)
    blob = encode_infra((2, 5), [(3, [0.0, 1.25, 6.5])], [ww], [sp])
    t = decode_infra(blob)
    assert t.tile == (2, 5) and t.minor == infra.MINOR and t.step == infra.STEP
    assert t.decks == [(3, [0.0, 1.25, 6.5])]
    w2 = t.waterways[0]
    assert (w2.id, w2.kind, w2.width, w2.name, w2.intermittent, w2.source) == (123450, "river", 30.0, "Adyar", True, Ref(0, 12345))
    assert w2.points[0] == (0.0, 0.0) and w2.points[-1] == (2000.0, 10.0)
    assert len(w2.points) > 3  # long steps split like roads.bin
    s2 = t.spots[0]
    assert (s2.kind, s2.x, s2.z, s2.width, s2.road_id, s2.mapped) == ("bump", 10.25, -3.5, 7.0, 99990, True)
    assert s2.yaw == pytest.approx(1.25, abs=1e-4)
    assert infra.SPOT_KINDS[:4] == ["zebra", "signal_crossing", "unmarked", "bump"]
    assert infra.WATERWAY_KINDS == ["river", "canal", "stream", "drain", "ditch"]


# The committed world ---------------------------------------------------------------------------

def _tile_data(lat: float, lng: float) -> tuple[list[codec_v2.RoadPiece], infra.InfraTile, tuple[float, float]]:
    wj = json.loads((WORLD / "world.json").read_text())
    x, z = PROJECTION.to_local(lat, lng)
    tc = int((x - wj["grid"]["minX"]) // wj["tileSize"])
    tr = int((z - wj["grid"]["minZ"]) // wj["tileSize"])
    d = WORLD / "tiles" / f"{tc}_{tr}"
    tj = json.loads((d / "tile.json").read_text())
    return codec_v2.decode_roads((d / "roads.bin").read_bytes(), tj["roadNames"]), decode_infra((d / "infra.bin").read_bytes()), (x, z)


def test_committed_world_declares_infra() -> None:
    wj = json.loads((WORLD / "world.json").read_text())
    assert wj["format"] == 2 and wj["minor"] >= 1 and wj["infra"]["file"] == "infra.bin"
    for t in wj["tiles"]:
        blob = (WORLD / "tiles" / f"{t[0]}_{t[1]}" / "infra.bin").read_bytes()
        assert decode_infra(blob).tile == (t[0], t[1])


def test_kathipara_is_a_stacked_interchange() -> None:
    pieces, tile, (x, z) = _tile_data(13.0067, 80.2007)
    near = {}
    for i, hs in tile.decks:
        r = pieces[i].road
        if min(math.dist(p, (x, z)) for p in r.points) < 450:
            near[r.id] = (r, hs)
            length = sum(math.dist(a, b) for a, b in zip(r.points, r.points[1:]))
            assert len(hs) == max(2, math.ceil(length / infra.STEP - 1e-9) + 1)
    names = {r.name for r, _ in near.values()}
    assert "Kathipara Interchange Flyover" in names and "Kathipara Interchange Ramp" in names
    top = max(max(hs) for _, hs in near.values())
    assert top == pytest.approx(2 * CLEAR, abs=0.05)  # the layer-2 deck over the layer-1 one
    bridges = [hs for r, hs in near.values() if r.bridge]
    assert len(bridges) >= 12
    assert all(min(hs) >= infra.WATER_MIN - 0.01 for hs in bridges)  # no bridge sits on the ground


def test_gemini_anna_flyover_is_raised() -> None:
    pieces, tile, (x, z) = _tile_data(13.0545, 80.2496)
    raised = [(pieces[i].road, hs) for i, hs in tile.decks if pieces[i].road.name == "Anna Flyover"]
    assert raised and max(max(hs) for _, hs in raised) == pytest.approx(CLEAR, abs=0.05)


def test_rivers_are_kept_as_waterways() -> None:
    wj = json.loads((WORLD / "world.json").read_text())
    names: Counter[str] = Counter()
    kinds: Counter[str] = Counter()
    for t in wj["tiles"]:
        for w in decode_infra((WORLD / "tiles" / f"{t[0]}_{t[1]}" / "infra.bin").read_bytes()).waterways:
            kinds[w.kind] += 1
            if w.name:
                names[w.name] += 1
    assert kinds["river"] > 0 and kinds["canal"] > 0
    joined = " ".join(names)
    for river in ("Adyar", "Cooum", "Buckingham"):
        assert river in joined, river
