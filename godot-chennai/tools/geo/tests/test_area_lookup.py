from __future__ import annotations

from chennai_geo.area_lookup import Query, haversine, line_length_m, ring_area_m2, score, search, tags_match

from conftest import FIXTURES

PBF = FIXTURES / "areas_small.osm"


def test_finds_a_closed_way_with_footprint_and_tags() -> None:
    r = search(PBF, [Query("t", r"sample temple", [{"amenity": "place_of_worship"}])])["t"]
    assert len(r) == 1
    m = r[0]
    assert (m.osm_type, m.osm_id) == ("way", 100)
    assert m.tags["wikidata"] == "Q42" and m.tags["name:ta"] == "மாதிரி"
    assert 12_000 < m.area_m2 < 12_500  # 0.001 deg lat x 0.001 deg lon at 13 N, about 111 m x 108 m
    assert len(m.footprint) == 4
    assert abs(m.lat - 13.0005) < 1e-4


def test_bridge_is_a_line_with_length() -> None:
    m = search(PBF, [Query("b", r"flyover", [{"bridge": "yes"}])])["b"][0]
    assert m.osm_type == "way" and m.area_m2 == 0 and not m.footprint
    assert 1_000 < m.length_m < 1_100  # 0.01 deg of longitude at 13 N


def test_node_and_relation_found() -> None:
    res = search(PBF, [Query("n", r"market gate"), Query("r", r"sample park")])
    assert res["n"][0].osm_type == "node"
    park = res["r"][0]
    assert park.osm_type == "relation" and park.osm_id == 200
    outer = ring_area_m2([(13.1, 80.1), (13.101, 80.1), (13.101, 80.101), (13.1, 80.101)])
    assert abs(park.area_m2 - outer) < 5  # the outer ring; the hole is not subtracted


def test_not_found_is_an_empty_list_and_tag_filter_applies() -> None:
    res = search(PBF, [Query("x", r"no such place"), Query("y", r"sample temple", [{"leisure": "park"}])])
    assert res["x"] == [] and res["y"] == []


def test_near_prefers_closer() -> None:
    q = Query("p", r"sample park", near=(13.1005, 80.1005, 500))
    park = search(PBF, [Query("p", r"sample park")])["p"][0]
    base = score(park, Query("p", r"sample park"))
    assert score(park, q) > base + 1.5
    far = score(park, Query("p", r"sample park", near=(13.0, 80.2, 500)))
    assert far == base


def test_helpers() -> None:
    assert tags_match({"a": "1"}, [{"a": "*"}]) and not tags_match({"a": "1"}, [{"a": "2"}]) and tags_match({}, [])
    assert abs(haversine(13.0, 80.0, 14.0, 80.0) - 111_195) < 100
    assert abs(line_length_m([(13.0, 80.0), (14.0, 80.0)]) - 111_195) < 100
