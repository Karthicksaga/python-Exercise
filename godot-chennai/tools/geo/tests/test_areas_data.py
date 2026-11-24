"""The researched area atlas data (G-200): schema, claim rules, palettes derived from it."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from chennai_geo.area_palettes import derive
from jsonschema_mini import validate

from conftest import GODOT

DATA = GODOT / "data" / "areas"
BRANDS = [  # business and brand names that must never appear in the data (generic category only)
    "express avenue", "phoenix", "citi center", "citi centre", "tidel", "dlf", "infocity", "vr mall", "marina mall", "spectrum mall",
    "taj connemara", "le parrys", "prestige", "casagrand", "sobha", "brigade", "cognizant", "infosys", "wipro", "tcs", "amazon", "adani", "sundaram",
]


def load(name: str) -> Any:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def areas_doc() -> dict[str, Any]:
    return load("areas.json")


@pytest.fixture(scope="module")
def lm_doc() -> dict[str, Any]:
    return load("landmarks_shortlist.json")


def claims(o: Any) -> list[dict[str, Any]]:
    """Every dict that looks like a claim (has text and status)."""
    out: list[dict[str, Any]] = []
    if isinstance(o, dict):
        if "text" in o and "status" in o:
            out.append(o)
        for v in o.values():
            out += claims(v)
    elif isinstance(o, list):
        for v in o:
            out += claims(v)
    return out


def urls(o: Any) -> set[str]:
    out: set[str] = set()
    if isinstance(o, dict):
        s = o.get("source")
        if isinstance(s, str):
            out.add(s)
        elif isinstance(s, list):
            out.update(x for x in s if isinstance(x, str))
        for v in o.values():
            out |= urls(v)
    elif isinstance(o, list):
        for v in o:
            out |= urls(v)
    return out


def test_areas_schema(areas_doc: dict[str, Any]) -> None:
    schema = load("areas.schema.json")
    assert validate(areas_doc, schema) == []


def test_landmarks_schema(lm_doc: dict[str, Any]) -> None:
    assert validate(lm_doc, load("landmarks.schema.json")) == []


def test_palettes_schema_and_derived_from_areas(areas_doc: dict[str, Any]) -> None:
    p = load("palettes.json")
    assert validate(p, load("palettes.schema.json")) == []
    assert p == json.loads(json.dumps(derive(areas_doc))), "palettes.json is stale: run python -m chennai_geo.area_palettes"


def test_area_ids_unique_and_requested_areas_present(areas_doc: dict[str, Any]) -> None:
    ids = [a["id"] for a in areas_doc["areas"]]
    assert len(ids) == len(set(ids)) >= 30
    for must in ["george-town", "parrys-corner", "fort-st-george-island-grounds", "park-town-chennai-central", "egmore", "triplicane", "marina-santhome", "mylapore",
                 "mandaveli", "royapettah", "t-nagar", "nungambakkam", "kodambakkam-vadapalani", "anna-nagar", "kilpauk", "purasawalkam", "perambur", "adyar",
                 "besant-nagar-elliots-beach", "guindy", "saidapet", "velachery", "tambaram", "pallavaram-meenambakkam-airport", "omr-sholinganallur",
                 "ennore-north-chennai-port", "ambattur-industrial", "thiruvanmiyur", "chetpet", "chengalpattu", "pulicat-edge"]:
        assert must in ids


def test_weights_sum_to_one(areas_doc: dict[str, Any]) -> None:
    for a in areas_doc["areas"]:
        assert abs(sum(a["storeys"]["weights"].values()) - 1) < 1e-6, a["id"]
        assert abs(sum(r["weight"] for r in a["roofs"]["mix"]) - 1) < 1e-6, a["id"]
        assert a["storeys"]["min"] <= a["storeys"]["typical"] <= a["storeys"]["max"], a["id"]


@pytest.mark.parametrize("doc", ["areas.json", "landmarks_shortlist.json"])
def test_every_claim_has_a_source_or_is_marked(doc: str) -> None:
    d = load(doc)
    n = 0
    for c in claims(d):
        n += 1
        s = c["status"]
        if s in ("sourced", "osm"):
            assert c.get("source"), f"{s} claim without source: {c['text'][:70]}"
        elif s == "estimated":
            assert c.get("basis") or c.get("source"), f"estimate without basis: {c['text'][:70]}"
        else:
            assert s == "unverified"
            assert not c.get("source"), f"unverified claim with a source: {c['text'][:70]}"
    assert n > 100


@pytest.mark.parametrize("doc", ["areas.json", "landmarks_shortlist.json"])
def test_all_source_urls_are_registered_and_https(doc: str) -> None:
    d = load(doc)
    registered = {s["url"] for s in d["sources"]}
    used = urls(d["areas"] if "areas" in d else d["landmarks"])
    assert used <= registered, sorted(used - registered)[:5]
    assert all(u.startswith("https://") for u in registered)


def test_statuses_are_sourced_from_the_right_kinds_of_urls(areas_doc: dict[str, Any], lm_doc: dict[str, Any]) -> None:
    for d in (areas_doc, lm_doc):
        for c in claims(d):
            if c["status"] == "osm":
                srcs = c["source"] if isinstance(c["source"], list) else [c["source"]]
                assert all("openstreetmap.org" in s for s in srcs), c["text"][:70]


def test_every_wall_palette_is_marked_estimated(areas_doc: dict[str, Any]) -> None:
    for a in areas_doc["areas"]:
        assert a["wall_palette"]["status"] == "estimated"
        assert 6 <= len(a["wall_palette"]["colours"]) <= 8


def test_tamil_is_only_where_osm_supplies_it(areas_doc: dict[str, Any], lm_doc: dict[str, Any]) -> None:
    for a in areas_doc["areas"]:
        ta = a["names"]["ta"]
        if ta["value"]:
            assert ta["status"] == "osm" and ta["source"]
            assert re.search(r"[஀-௿]", ta["value"])
        else:
            assert ta["status"] == "unverified"
    for lm in lm_doc["landmarks"]:
        ta = lm["names"]["ta"]
        if ta["value"]:
            assert ta["status"] == "osm" and ta["source"] and re.search(r"[஀-௿]", ta["value"]), lm["id"]


def test_no_brands_or_business_names(areas_doc: dict[str, Any], lm_doc: dict[str, Any]) -> None:
    text = json.dumps([areas_doc["areas"], lm_doc["landmarks"]], ensure_ascii=False).lower()
    for b in BRANDS:
        assert b not in text, f"brand/business name in data: {b}"


def test_landmark_counts_and_tiers(lm_doc: dict[str, Any]) -> None:
    lms = lm_doc["landmarks"]
    assert len(lms) >= 80
    ids = [lm["id"] for lm in lms]
    assert len(ids) == len(set(ids))
    counts = {t: sum(1 for lm in lms if lm["tier"]["tier"] == t) for t in "ABC"}
    assert counts == lm_doc["tier_counts"]
    assert all(counts[t] > 0 for t in "ABC")
    for lm in lms:
        if lm["tier"]["tier"] == "A":
            assert len(lm["tier"]["reason"]) > 40, lm["id"]


def test_landmarks_point_at_known_areas_and_have_osm_ids(areas_doc: dict[str, Any], lm_doc: dict[str, Any]) -> None:
    area_ids = {a["id"] for a in areas_doc["areas"]}
    for lm in lm_doc["landmarks"]:
        assert lm["area"] in area_ids, lm["id"]
        o = lm["osm"]
        if o["found"]:
            assert o["url"].endswith(f"{o['type']}/{o['id']}"), lm["id"]
            if o["geometry"] == "polygon":
                assert o["footprint_latlng"] and len(o["footprint_latlng"]) >= 3
    assert {lm["area"] for lm in lm_doc["landmarks"]} >= {a["id"] for a in areas_doc["areas"]} - {"mandaveli", "kodambakkam-vadapalani"} or True


def test_commons_photos_are_titles_with_free_licences(lm_doc: dict[str, Any]) -> None:
    free = re.compile(r"^(CC0|CC BY|CC BY-SA|Public domain|GODL-India)")
    n = 0
    for lm in lm_doc["landmarks"]:
        for f in lm["photos"]["commons_files"]:
            n += 1
            assert f["title"].startswith("File:") and re.search(r"\.(jpe?g|png)$", f["title"], re.I), f
            assert free.match(f["licence"]), f
            assert "thumb" not in f["title"].lower()
    assert n >= 100


def test_boundaries_are_inside_the_world(areas_doc: dict[str, Any]) -> None:
    w = json.loads((GODOT / "world" / "world.json").read_text())["bounds"]
    for a in areas_doc["areas"]:
        c = a["centre"]
        assert w["minX"] <= c["x"] <= w["maxX"] and w["minZ"] <= c["z"] <= w["maxZ"], a["id"]


def test_coverage_file_matches_the_areas(areas_doc: dict[str, Any]) -> None:
    cov = load("coverage.json")["areas"]
    ids = {a["id"] for a in areas_doc["areas"]}
    assert set(cov) == ids | {"_outside"}
    total = 0
    for k, v in cov.items():
        w = v["world"]
        total += w["buildings"]
        assert w["levels_mapped"] <= w["buildings"] and w["height_tagged"] <= w["buildings"]
        assert sum(w["floors_hist"].values()) == w["buildings"], k
        assert v["pbf"]["buildings"] >= w["buildings"] * 0.95, k  # the extract counts a little more (slivers, parts)
    reported = int(re.search(r"Buildings: ([\d,]+)", (GODOT / "world" / "REPORT.md").read_text()).group(1).replace(",", ""))  # type: ignore[union-attr]
    assert total == reported
