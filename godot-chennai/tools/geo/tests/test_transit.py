"""Transit data (G-210..G-213): stops, stations, routes snapped to the drive graph, codec."""
from __future__ import annotations

import json
import math

import pytest

from chennai_geo import codec_v2, transit
from chennai_geo.transit import DriveGraph, RouteRel, Stop, TransitOsm

from conftest import WORLD


def street(g: DriveGraph, pts: list[tuple[float, float]], way: int, oneway: bool = False, road: str = "") -> None:
    nodes = [g.node(p) for p in pts]
    for a, b in zip(nodes, nodes[1:]):
        g.add(a, b, way, False, road, False)
        if not oneway:
            g.add(b, a, way, False, road, False)


def grid_city() -> DriveGraph:
    """An east-west main road (way 1, z = 0, x 0..2000) and a parallel back street (way 2,
    z = -200), joined by cross streets every 500 m (ways 10..14)."""
    g = DriveGraph()
    street(g, [(x * 50.0, 0.0) for x in range(41)], 1, road="Anna Salai")
    street(g, [(x * 50.0, -200.0) for x in range(41)], 2)
    for i, x in enumerate(range(0, 2001, 500)):
        street(g, [(float(x), 0.0), (float(x), -100.0), (float(x), -200.0)], 10 + i)
    return g


def stops_on_main() -> list[Stop]:
    # On the left kerb of eastbound traffic (left of +X in this frame is -Z), 6 m off the centre.
    return [Stop(f"n{i}", 100.0 + i * 400.0, -6.0, f"Stop {i}", f"நிறுத்தம் {i}") for i in range(5)]


def test_clean_route_follows_its_mapped_way_and_stops_lie_on_it() -> None:
    g = grid_city()
    table = stops_on_main()
    rel = RouteRel(1, "21G", "Route 21G: A → B", "A", "B", "", "", way_members=[1])
    sn = transit.snap_route(g, rel, list(range(5)), table, False)
    assert sn.status == "clean"
    assert sn.legs_ok == 4
    assert sn.member_share == pytest.approx(1.0)
    assert sn.length == pytest.approx(1700.0, abs=60.0)
    assert "Anna Salai (Mount Road)" in sn.majors
    # Every stop is placed on an eastbound segment of the path, in order.
    run = 0.0
    last = -1.0
    for stop, seg, along in sn.placed:
        a, b = g.pos[sn.path[seg]], g.pos[sn.path[seg + 1]]
        assert b[0] > a[0]
        at = sum(math.dist(g.pos[sn.path[k]], g.pos[sn.path[k + 1]]) for k in range(seg)) + along
        assert at > last
        last = at
        x = a[0] + (b[0] - a[0]) * along / math.dist(a, b)
        assert x == pytest.approx(table[stop].x, abs=0.5)
        run = at
    assert run == pytest.approx(1600.0, abs=1.0)  # measured from the first stop's edge (x 100)


def test_one_way_streets_are_respected_and_the_fallback_is_reported() -> None:
    # The mapped way (1) is one-way westbound; the route goes east, so it must use way 2.
    g2 = DriveGraph()
    street(g2, [(x * 50.0, 0.0) for x in range(20, -1, -1)], 1, oneway=True)
    street(g2, [(x * 50.0, -200.0) for x in range(21)], 2)
    for i, x in enumerate((0, 1000)):
        street(g2, [(float(x), 0.0), (float(x), -200.0)], 10 + i)
    table = [Stop("a", 100.0, -206.0), Stop("b", 500.0, -206.0), Stop("c", 900.0, -206.0)]
    rel = RouteRel(2, "5C", "", "", "", "", "", way_members=[1])
    sn = transit.snap_route(g2, rel, [0, 1, 2], table, False)
    assert sn.status == "fallback"
    assert sn.member_share < 0.1
    # It never drives west along way 1.
    for k in range(len(sn.path) - 1):
        a, b = g2.pos[sn.path[k]], g2.pos[sn.path[k + 1]]
        assert not (a[1] == 0.0 and b[1] == 0.0 and b[0] > a[0])


def test_a_stop_off_the_road_network_breaks_the_route_and_the_longest_run_is_kept() -> None:
    g = grid_city()
    table = stops_on_main()
    table.insert(1, Stop("far", 9000.0, 9000.0))  # nowhere near a road
    rel = RouteRel(3, "M1", "", "", "", "", "", way_members=[1])
    sn = transit.snap_route(g, rel, list(range(6)), table, False)
    assert sn.status == "broken"
    assert sn.stops == [2, 3, 4, 5]


def test_a_leg_that_would_loop_far_round_is_not_found() -> None:
    g = DriveGraph()
    # Two stops 100 m apart on a one-way street with the way back 6 km round.
    street(g, [(0.0, 0.0), (100.0, 0.0), (200.0, 0.0)], 1, oneway=True)
    street(g, [(200.0, 0.0), (200.0, 3000.0), (0.0, 3000.0), (0.0, 0.0)], 2, oneway=True)
    table = [Stop("a", 150.0, -5.0), Stop("b", 50.0, -5.0), Stop("c", 120.0, -5.0)]
    rel = RouteRel(4, "X", "", "", "", "", "", way_members=[1])
    sn = transit.snap_route(g, rel, [0, 1, 2], table, False)
    assert sn.status == "unusable"
    assert sn.legs_ok == 1


def test_stops_out_of_order_are_put_in_order_along_the_ways() -> None:
    line = [(x * 50.0, 0.0) for x in range(41)]
    table = stops_on_main()
    shuffled = [0, 3, 1, 4, 2]
    again = transit.order_along(line, shuffled, table)
    assert again == [0, 1, 2, 3, 4]
    assert transit.straight_sum(again, table) < transit.straight_sum(shuffled, table)
    assert transit.order_along(line, [0, 1], [Stop("x", 0.0, 500.0), Stop("y", 10.0, 0.0)]) is None


def test_stops_are_inferred_on_the_left_side_in_order() -> None:
    line = [(x * 50.0, 0.0) for x in range(41)]
    table = stops_on_main() + [Stop("right", 300.0, 8.0), Stop("dup", 105.0, -7.0), Stop("far", 700.0, -60.0)]
    grid: dict[tuple[int, int], list[int]] = {}
    for i, s in enumerate(table):
        grid.setdefault((math.floor(s.x / transit.CELL), math.floor(s.z / transit.CELL)), []).append(i)
    assert transit.infer_stops(line, table, grid) == [0, 1, 2, 3, 4]


def test_route_line_chains_ways_whatever_way_round_they_are_mapped() -> None:
    rel = RouteRel(5, "", "", "", "", "", "", way_members=[1, 2, 3])
    ways = {1: [(100.0, 0.0), (0.0, 0.0)], 2: [(100.0, 0.0), (200.0, 0.0)], 3: [(300.0, 0.0), (200.0, 0.0)]}
    assert transit.route_line(rel, ways) == [(0.0, 0.0), (100.0, 0.0), (200.0, 0.0), (300.0, 0.0)]


def test_platforms_beside_a_pole_are_one_stop_and_route_members_join_it() -> None:
    osm = TransitOsm()
    osm.stops = {"n1": Stop("n1", 0.0, 0.0, "Saidapet", "", "", "pole"), "n2": Stop("n2", 6.0, 3.0, "", "சைதாப்பேட்டை", "", "platform"),
                 "n3": Stop("n3", 300.0, 0.0, "Guindy", "", "", "pole")}
    osm.member_points = {"n9": Stop("n9", 2.0, -4.0, "", "", "", "position")}
    table, index = transit.stop_table(osm)
    assert len(table) == 2
    assert index["n2"] == index["n1"] == index["n9"]
    assert table[index["n1"]].name_ta == "சைதாப்பேட்டை"
    rel = RouteRel(6, "", "", "", "", "", "", stop_members=[("n9", "stop"), ("n2", "platform"), ("n3", "stop")])
    assert transit.route_stops(rel, index, table) == [index["n1"], index["n3"]]


def test_station_systems_and_stop_tags() -> None:
    assert transit.station_system({"railway": "station", "station": "subway"}) == "metro"
    assert transit.station_system({"railway": "station", "network": "MRTS"}) == "mrts"
    assert transit.station_system({"railway": "station", "network": "IR"}) == "suburban"
    assert transit.station_system({"railway": "halt"}) == "suburban"
    assert transit.station_system({"amenity": "bus_station"}) is None
    assert transit.is_stop({"highway": "bus_stop"})
    assert transit.is_stop({"public_transport": "platform", "bus": "yes"})
    assert not transit.is_stop({"public_transport": "platform", "train": "yes"})
    assert not transit.is_stop({"railway": "platform", "public_transport": "platform", "bus": "yes"})


def test_headways_names_and_no_operator() -> None:
    rel = RouteRel(7, "M70", "Route M70: Koyambedu → Thiruvanmiyur", "", "", "", "")
    assert transit.clean_name(rel) == "M70: Koyambedu → Thiruvanmiyur"
    assert transit.headway(rel, 10000.0) == transit.MINIBUS_HEADWAY
    assert transit.headway(RouteRel(8, "21G", "", "", "", "", ""), 10000.0) == transit.BUS_HEADWAY
    assert transit.headway(RouteRel(8, "21G", "", "", "", "", "00:12"), 10000.0) == 12
    assert transit.headway(RouteRel(8, "570", "", "", "", "", ""), 40000.0) == transit.LONG_ROUTE_HEADWAY


def test_routes_codec_round_trip() -> None:
    g = grid_city()
    table = stops_on_main()
    rel = RouteRel(1, "21G", "Route 21G", "A", "B", "", "", way_members=[1])
    sn = transit.snap_route(g, rel, list(range(5)), table, False)
    net = transit.Network(table, [], [], [], [sn], [0], transit.Counter())
    blob, kept = transit.encode_routes(net, g)
    assert kept == [0]
    back = transit.decode_routes(blob)
    assert len(back) == 1
    assert back[0].path == [g.pos[n] for n in sn.path]
    assert [(s, k) for s, k, _ in back[0].placed] == [(s, k) for s, k, _ in sn.placed]
    for (_, _, a), (_, _, b) in zip(back[0].placed, sn.placed):
        assert a == pytest.approx(b, abs=1e-3)
    doc = transit.network_json(net, "2026-11-23T00:28:57Z")
    assert "operator" not in json.dumps(doc).lower().replace("operators are not shown", "")
    assert doc["routes"][0]["first"] is True
    assert doc["stops"][0][4] == "நிறுத்தம் 0"


# --- The committed world ----------------------------------------------------------------------

TRANSIT = WORLD / "transit"


@pytest.mark.skipif(not (TRANSIT / "transit.json").exists(), reason="no transit build")
def test_committed_network_is_consistent_with_the_roads() -> None:
    doc = json.loads((TRANSIT / "transit.json").read_text())
    assert doc["format"] == 2 and doc["transit"] == 1
    blobs = transit.decode_routes((TRANSIT / "routes.bin").read_bytes())
    usable = [r for r in doc["routes"] if r["status"] != "unusable"]
    assert len(blobs) == len(usable) >= 40
    assert sum(1 for r in doc["routes"] if r["first"]) >= 30
    assert len(doc["stops"]) > 1000 and len(doc["stations"]) > 100
    # Every route point is a point of a road piece the game loads (so a node of its graph).
    index = json.loads((WORLD / "world.json").read_text())
    road_points: set[tuple[int, int]] = set()
    for tc, tr, *_ in index["tiles"]:
        d = WORLD / "tiles" / f"{tc}_{tr}"
        tj = json.loads((d / "tile.json").read_text())
        for pc in codec_v2.decode_roads((d / "roads.bin").read_bytes(), tj["roadNames"]):
            if pc.road.kind not in transit.NOT_DRIVEN:
                for p in pc.road.points:
                    road_points.add((round(p[0] * 20), round(p[1] * 20)))
    for b in blobs:
        assert all((round(p[0] * 20), round(p[1] * 20)) in road_points for p in b.path)
        r = doc["routes"][b.index]
        assert [s for s, _, _ in b.placed] == r["stops"]
        assert all(0 <= seg < len(b.path) - 1 for _, seg, _ in b.placed)
    # The Beach - Tambaram line calls at Egmore and Guindy, with Tamil names.
    st = doc["stations"]
    line = next(ln for ln in doc["lines"] if "Beach - Tambaram" in ln["name"])
    names = {st[i]["name"] for i in line["stations"]}
    assert {"Chennai Egmore", "Guindy"} <= names
    assert all(st[i]["nameTa"] for i in line["stations"] if st[i]["name"] in ("Chennai Egmore", "Guindy"))
