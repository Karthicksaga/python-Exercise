"""Landmark tools (G-180, G-181): candidate ranking and the OSM part of the specs."""
from __future__ import annotations

import json
from pathlib import Path

from conftest import FIXTURES, GODOT

from chennai_geo.geometry import signed_area
from chennai_geo.landmark_candidates import coverage, is_candidate, kind_of, rank, read_candidates, write_candidates
from chennai_geo.landmark_refs import RefPhoto, photo_from_info, upload_host, usable_as_texture
from chennai_geo.landmark_spec import fill, read_objects

OSM = FIXTURES / "landmarks.osm"


def everywhere(_p):
    return True


def test_kinds_and_what_is_not_a_landmark():
    assert kind_of({"man_made": "lighthouse"}) == "lighthouse"
    assert kind_of({"amenity": "place_of_worship", "religion": "hindu"}) == "temple"
    assert kind_of({"building": "train_station"}) == "station"
    assert is_candidate({"wikidata": "Q1", "name": "x"})
    assert not is_candidate({"place": "suburb", "wikidata": "Q4"})
    assert not is_candidate({"tourism": "hotel", "wikidata": "Q3"})
    assert not is_candidate({"amenity": "place_of_worship", "brand": "Chain"})


def test_rank_merges_points_into_their_polygon_and_orders_by_score():
    rows = rank(read_candidates(OSM, everywhere))
    names = [r["name"] for r in rows]
    assert "Grand Hotel" not in names and "Testpet" not in names and "Test Church" not in names
    central = next(r for r in rows if r["name"] == "Test Central")
    assert central["osm"] == "way/1004" and len(central["also"]) == 1 and central["also"][0].startswith("node/")
    assert central["wikidata"] == "Q2" and central["name_ta"] == "சோதனை சென்ட்ரல்"
    assert central["footprint"] and abs(central["area"] - 4800) < 60
    light = next(r for r in rows if r["kind"] == "lighthouse")
    assert light["height"] == 45.72
    assert rows[0]["score"] >= rows[-1]["score"]
    assert [r["rank"] for r in rows] == list(range(1, len(rows) + 1))
    # The unnamed historic building ranks below every named, linked landmark.
    assert rows[-1]["osm"] == "way/1006"


def test_coverage_report(tmp_path: Path):
    rows = rank(read_candidates(OSM, everywhere))
    cov = write_candidates(rows, tmp_path, "fixture")
    assert cov == coverage(rows)
    assert cov["candidates"] == len(rows) == 4
    assert cov["with_wikidata"] == 3
    assert cov["by_kind"]["temple"] == {"all": 1, "wikidata": 1}
    assert (tmp_path / "COVERAGE.md").read_text().count("| way/") == 4
    data = json.loads((tmp_path / "candidates.json").read_text())
    assert data["coverage"]["candidates"] == 4


def test_inside_filter():
    near = rank(read_candidates(OSM, lambda p: abs(p[0] - 6455) < 400 and abs(p[1] - 5704) < 400))
    assert sorted(r["name"] for r in near) == ["", "Test Light", "Test Temple"]
    assert all(r["name"] != "Test Central" for r in near)  # 600 m east: outside
    assert rank(read_candidates(OSM, lambda p: False)) == []


def test_fill_spec_from_osm():
    spec = {"id": "test", "osm": {"main": "compound", "parts": {"compound": {"osm": "way/1001"}, "gopuram": {"osm": "way/1002"}, "station": {"osm": "node/9"}}}, "height": {"value": 37}}
    objs = read_objects(OSM, ["way/1001", "way/1002", "node/9"])
    fill(spec, objs)
    c = spec["osm"]["parts"]["compound"]
    assert len(c["footprint"]) == 4 and signed_area([tuple(p) for p in c["footprint"]]) > 0
    assert abs(c["area"] - 8100) < 80
    assert abs(c["rect"]["long"] - 90) < 1 and abs(c["rect"]["short"] - 90) < 1
    assert len(c["rect"]["corners"]) == 4
    assert c["tags"]["name:ta"] == "சோதனை கோயில்"
    assert spec["origin"] == c["centroid"]
    g = spec["osm"]["parts"]["gopuram"]
    assert abs(g["rect"]["long"] - 18) < 0.5 and abs(g["rect"]["short"] - 11) < 0.5
    assert abs(g["rect"]["yaw_deg"]) < 1 or abs(g["rect"]["yaw_deg"] - 180) < 1  # long side east-west
    assert "footprint" not in spec["osm"]["parts"]["station"]


def test_fill_reads_the_osm_height_tag():
    spec = {"id": "t", "osm": {"main": "light", "parts": {"light": {"osm": "way/1005"}}}, "height": {"value": 45.0}}
    fill(spec, read_objects(OSM, ["way/1005"]))
    assert spec["height"]["osm_tag"] == 45.72


def test_committed_specs_carry_their_osm_parts():
    for path in sorted((GODOT / "assets" / "landmarks").glob("*/spec.json")):
        spec = json.loads(path.read_text())
        assert spec["origin"] == spec["osm"]["parts"][spec["osm"]["main"]]["centroid"], path
        for name, part in spec["osm"]["parts"].items():
            if part["osm"].startswith("way/"):
                assert len(part["footprint"]) >= 3, (path, name)


def test_commons_helpers():
    assert upload_host("https://thumb.wikimedia.org/a/b/960px-x.jpg") == "https://upload.wikimedia.org/a/b/960px-x.jpg"
    assert upload_host("https://upload.wikimedia.org/x.jpg") == "https://upload.wikimedia.org/x.jpg"
    assert usable_as_texture("CC0") and usable_as_texture("Public domain")
    assert not usable_as_texture("CC BY-SA 4.0") and not usable_as_texture("CC BY 2.0")
    p = photo_from_info("File:A.jpg", {"url": "https://upload.wikimedia.org/a.jpg", "thumburl": "https://thumb.wikimedia.org/t.jpg", "descriptionurl": "https://commons.wikimedia.org/wiki/File:A.jpg",
                                      "width": 10, "height": 5, "extmetadata": {"Artist": {"value": "<a href='x'>Some &amp; One</a>"}, "LicenseShortName": {"value": "CC BY 4.0"}}})
    assert isinstance(p, RefPhoto) and p.author == "Some & One" and p.licence == "CC BY 4.0" and p.thumb_url.startswith("https://upload.wikimedia.org/")


def test_commons_client_waits_on_429_and_caches(tmp_path: Path):
    import urllib.error
    from email.message import Message

    from chennai_geo.landmark_refs import CommonsClient

    calls = []
    slept = []

    class Resp:
        def __init__(self, body):
            self.body = body

        def read(self):
            return self.body

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def opener(req):
        calls.append(req.full_url)
        if len(calls) == 1:
            h = Message()
            h["Retry-After"] = "7"
            raise urllib.error.HTTPError(req.full_url, 429, "slow down", h, None)
        assert "ChennaiOpenWorld" in req.get_header("User-agent")
        return Resp(b'{"ok": 1}')

    c = CommonsClient(tmp_path, min_interval=3.0, sleep=slept.append, opener=opener)
    assert c.fetch("https://commons.wikimedia.org/w/api.php?x=1") == b'{"ok": 1}'
    assert 7.0 in slept  # honoured Retry-After
    assert c.fetch("https://commons.wikimedia.org/w/api.php?x=1") == b'{"ok": 1}'
    assert len(calls) == 2  # the second read came from the cache


def test_world_builder_leaves_out_buildings_under_a_landmark_model(small_features):
    from test_parse_and_build import BOX

    from chennai_geo.landmark_spec import exclude_outlines
    from chennai_geo.regions import world_grid
    from chennai_geo.world import build_world

    plain = build_world(small_features, world_grid(), [BOX], 0)
    way = next(b for c in plain.chunks.values() for b in c.buildings if b.id == 100)
    xs = [p[0] for p in way.outline]
    zs = [p[1] for p in way.outline]
    ring = [(min(xs) - 1, min(zs) - 1), (max(xs) + 1, min(zs) - 1), (max(xs) + 1, max(zs) + 1), (min(xs) - 1, max(zs) + 1)]
    w = build_world(small_features, world_grid(), [BOX], 0, landmark_footprints=[ring])
    ids = {b.id for c in w.chunks.values() for b in c.buildings}
    assert 100 not in ids and len(ids) == 1
    assert w.stats["building:under-landmark-model"] == 1
    outlines = exclude_outlines()
    assert len(outlines) >= 5 and all(len(r) >= 4 for r in outlines)
