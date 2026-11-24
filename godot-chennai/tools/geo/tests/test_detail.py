"""Format 2.2 `detail.bin` (G-190..): sign categories, building detail and parts, street objects,
barriers, zones, signs (never a business name), codec, and the committed world."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

from chennai_geo import detail
from chennai_geo.detail import (
    LINE_KINDS, OBJ_KINDS, ZONE_KINDS, F_PARTS_HOST, F_ROOF_COLOUR, F_WALL_COLOUR, BuildingDetail, LineFeature, ObjectSpot, Part, SignSpot, Zone,
    category_of, decode_detail, encode_detail, load_categories, parse_colour,
)
from chennai_geo.geometry import Bounds
from chennai_geo.model import Ref
from chennai_geo.osm_parse import parse_osm
from chennai_geo.regions import Playable, world_grid
from chennai_geo.rules import to_building
from chennai_geo.world import building_game_id, repair_polygon

from conftest import FIXTURES, WORLD

BOX = Playable(Bounds(-2000, 2000, -1000, 2500))


@pytest.fixture(scope="module")
def feats():
    return parse_osm(FIXTURES / "detail.osm", timestamp="2026-11-23T00:00:00Z")


@pytest.fixture(scope="module")
def built(feats):
    buildings = []
    for poly in feats.buildings:
        b = to_building(poly, building_game_id(poly))
        assert b is not None
        buildings.append(b)
    return buildings, detail.build_detail(feats, buildings, BOX)


# Categories --------------------------------------------------------------------------------------

def test_category_table_is_plain_words_in_both_languages() -> None:
    cats = load_categories()
    assert [c.id for c in cats.items] == list(range(1, len(cats.items) + 1))
    assert len(cats.items) <= 48  # the sign atlas has 2 columns x 24 rows
    seen = set()
    for c in cats.items:
        assert c.tamil and any("஀" <= ch <= "௿" for ch in c.tamil), c.key  # Tamil letters
        assert c.english == c.english.upper() and c.english.isascii(), c.key
        assert (c.english, c.tamil) not in seen
        seen.add((c.english, c.tamil))
    keys = {c.key for c in cats.items}
    # The words the spec names are there.
    for k in ("pharmacy", "bakery", "tea", "textiles", "grocery", "flowers", "bank", "hospital", "school", "temple", "bus_stand"):
        assert k in keys
    by = {c.key: c for c in cats.items}
    assert (by["pharmacy"].tamil, by["bakery"].tamil, by["tea"].tamil) == ("மருந்தகம்", "பேக்கரி", "தேநீர் கடை")
    assert (by["temple"].tamil, by["bus_stand"].tamil, by["bank"].tamil) == ("கோயில்", "பேருந்து நிலையம்", "வங்கி")


def test_no_rule_is_listed_twice() -> None:
    doc = json.loads(detail.CATEGORIES_FILE.read_text())
    rules = [r for c in doc["categories"] for r in c["tags"]]
    assert len(rules) == len(set(rules))


def test_category_of_tags() -> None:
    assert load_categories().by_id(category_of({"shop": "bakery"})).key == "bakery"
    assert load_categories().by_id(category_of({"amenity": "place_of_worship", "religion": "christian"})).key == "church"
    assert load_categories().by_id(category_of({"amenity": "place_of_worship", "religion": "hindu"})).key == "temple"
    assert load_categories().by_id(category_of({"building": "mosque"})).key == "mosque"
    assert load_categories().by_id(category_of({"shop": "weird_thing"})).key == "shop"  # shop=* fallback
    assert category_of({"name": "Bakery", "building": "yes"}) == 0  # the name is never read
    assert category_of({"amenity": "bench"}) == 0


def test_colours() -> None:
    assert parse_colour("#cc8844") == 0xCC8844
    assert parse_colour("#c84") == 0xCC8844
    assert parse_colour("Red") == detail.COLOUR_NAMES["red"]
    assert parse_colour("light_blue") == detail.COLOUR_NAMES["lightblue"]
    assert parse_colour("not a colour") is None and parse_colour(None) is None


# Collecting --------------------------------------------------------------------------------------

def test_parse_collects_into_detail_lists_only(feats) -> None:
    assert {p.id for p in feats.parts} == {201, 202}
    assert {li.id for li in feats.detail_lines} == {400, 401, 402, 701}
    assert {p.id for p in feats.detail_polys} == {500, 600, 700}
    assert {p.id for p in feats.detail_points} >= {31, 32, 33, 34, 35, 36, 37}
    # A part is not a building; the host outline is.
    assert {b.id for b in feats.buildings} == {100, 200, 300}


def test_building_detail_from_tags(built) -> None:
    buildings, d = built
    by = {b.id: b for b in d.buildings}
    shop = by[100]
    assert shop.flags & F_WALL_COLOUR and shop.wall == 0xCC8844
    assert shop.flags & F_ROOF_COLOUR and shop.roof == detail.COLOUR_NAMES["red"]
    assert detail.MATERIALS[shop.material] == "brick" and detail.ROOF_MATERIALS[shop.roof_material] == "tiles"
    assert load_categories().by_id(shop.category).key == "bakery"
    assert load_categories().by_id(by[300].category).key == "temple"
    assert d.stats["building:roof-shape-mapped"] == 1  # roof:shape=gabled on building 100


def test_host_of_parts_is_flagged_and_parts_have_their_heights(built) -> None:
    _, d = built
    host = next(b for b in d.buildings if b.id == 200)
    assert host.flags & F_PARTS_HOST
    parts = {p.source.id: p for p in d.parts}
    assert parts[201].height == 24 and parts[201].roof_shape == "dome" and parts[201].flags & detail.F_HEIGHT_MAPPED
    assert parts[202].floors == 3 and parts[202].min_height == 4.0
    assert parts[202].height == pytest.approx(3 * 3.1 + 0.9, abs=0.05)
    assert all(p.id & 0x20000000 for p in d.parts)


def test_a_part_under_a_landmark_is_left_out(feats) -> None:
    buildings = [to_building(p, building_game_id(p)) for p in feats.buildings]
    d = detail.build_detail(feats, [b for b in buildings if b], BOX, lambda p: True)
    assert d.parts == []


def test_objects_lines_zones(built) -> None:
    _, d = built
    kinds = Counter(o.kind for o in d.objects)
    for k in ("bench", "bus_platform", "street_lamp", "power_pole", "bollard", "waste_basket"):
        assert kinds[k] == 1, k
    lines = {li.kind: li for li in d.lines}
    assert lines["wall"].height == 2.4 and lines["hedge"].height == 0.0 and "tree_row" in lines
    assert any(li.kind == "platform" for li in d.lines)  # the open platform way
    zones = {z.kind: z for z in d.zones}
    assert zones["pitch"].sport == "cricket" and "swimming_pool" in zones and "platform" in zones


def test_signs_are_categories_and_keep_no_business_name(built) -> None:
    _, d = built
    cats = load_categories()
    names = {"Moon Sweets and Bakery", "Test Chemist Brand", "Sri Test Amman Temple"}
    pharmacy = [s for s in d.signs if cats.by_id(s.category).key == "pharmacy"]
    assert len(pharmacy) == 1 and pharmacy[0].name_ta == "" and pharmacy[0].name_en == ""
    for s in d.signs:
        assert s.name_ta not in names and s.name_en not in names
        if not cats.by_id(s.category).public:
            assert not (s.flags & detail.SF_PUBLIC_NAME)
    # A public place keeps name:ta / name:en (and only those, never `name`).
    temple = [s for s in d.signs if cats.by_id(s.category).key == "temple"]
    assert len(temple) == 1 and temple[0].name_ta == "ஸ்ரீ டெஸ்ட் அம்மன் கோயில்" and temple[0].name_en == "Test Amman Temple"


# Codec -------------------------------------------------------------------------------------------

def test_codec_round_trip(built) -> None:
    _, d = built
    from chennai_geo.geometry import centroid

    data = encode_detail((2, 5), d.buildings, d.parts, d.objects, d.lines, d.zones, d.signs)
    t = decode_detail(data)
    assert t.tile == (2, 5) and t.minor == detail.MINOR
    assert [b.__dict__ for b in t.buildings] == [b.__dict__ for b in d.buildings]
    assert len(t.parts) == len(d.parts)
    for a, b in zip(t.parts, d.parts):
        assert (a.id, a.height, a.min_height, a.floors, a.roof_shape, a.wall) == (b.id, b.height, b.min_height, b.floors, b.roof_shape, b.wall)
        assert [round(v, 1) for p in a.outline for v in p] == [round(v, 1) for p in b.outline for v in p]
    assert [o.kind for o in t.objects] == [o.kind for o in d.objects]
    assert all(abs(a.x - b.x) <= 0.03 and abs(a.z - b.z) <= 0.03 for a, b in zip(t.objects, d.objects))  # 5 cm steps
    assert [(li.kind, li.height, len(li.points), li.closed) for li in t.lines] == [(li.kind, li.height, len(li.points), li.closed) for li in d.lines]
    assert [(z.kind, z.sport, z.source) for z in t.zones] == [(z.kind, z.sport, z.source) for z in d.zones]
    assert [(s.category, s.flags, s.name_ta, s.name_en) for s in t.signs] == [(s.category, s.flags, s.name_ta, s.name_en) for s in d.signs]
    cz, dz = centroid(t.zones[0].outline), centroid(d.zones[0].outline)
    assert abs(cz[0] - dz[0]) < 0.05 and abs(cz[1] - dz[1]) < 0.05


def test_unknown_sections_are_skipped_and_trailing_bytes_fail() -> None:
    data = encode_detail((0, 0), [], [], [], [], [], [])
    assert decode_detail(data).signs == []
    with pytest.raises(ValueError):
        decode_detail(data + b"\0")
    with pytest.raises(ValueError):
        decode_detail(b"\0\0\0\0" + data[4:])


def test_enum_tables_are_pinned() -> None:
    assert OBJ_KINDS == ["bus_platform", "bench", "waste_basket", "drinking_water", "post_box", "toilets", "street_lamp", "power_pole", "power_tower", "bollard", "gate"]
    assert LINE_KINDS == ["wall", "fence", "hedge", "retaining_wall", "kerb", "jersey_barrier", "tree_row", "platform", "guard_rail"]
    assert ZONE_KINDS == ["pitch", "playground", "swimming_pool", "track", "allotments", "platform"]
    assert detail.MATERIALS[:3] == ["", "brick", "concrete"]


def test_lines_are_cut_at_tile_edges() -> None:
    li = LineFeature("wall", 0.0, [(-100.0, 5.0), (100.0, 5.0)])

    def rects(b: Bounds):
        return [((0, 0), Bounds(-1000, 0, -1000, 1000)), ((1, 0), Bounds(0, 1000, -1000, 1000))]

    out = detail.lines_by_tile([li], rects)
    assert set(out) == {(0, 0), (1, 0)}
    assert out[(0, 0)][0].points[-1][0] == pytest.approx(0.0) and out[(1, 0)][0].points[0][0] == pytest.approx(0.0)


# The committed world -----------------------------------------------------------------------------

@pytest.mark.skipif(not (WORLD / "world.json").exists(), reason="no committed world")
def test_committed_world_has_detail_for_every_tile() -> None:
    wj = json.loads((WORLD / "world.json").read_text())
    assert wj["minor"] >= 2 and wj["detail"]["file"] == "detail.bin"
    cats = load_categories()
    totals: Counter[str] = Counter()
    for tc, tr, *_ in wj["tiles"]:
        t = decode_detail((WORLD / f"tiles/{tc}_{tr}" / "detail.bin").read_bytes())
        assert t.tile == (tc, tr)
        totals["buildings"] += len(t.buildings)
        totals["parts"] += len(t.parts)
        totals["objects"] += len(t.objects)
        totals["signs"] += len(t.signs)
        for s in t.signs:
            assert 1 <= s.category <= len(cats.items)
            if not cats.by_id(s.category).public:
                assert s.name_ta == "" and s.name_en == ""  # a shop's name is never stored
    assert totals["buildings"] > 2000 and totals["parts"] > 50 and totals["objects"] > 20000 and totals["signs"] > 10000


@pytest.mark.skipif(not (WORLD / "DETAIL.md").exists(), reason="no committed world")
def test_coverage_report_is_committed_with_the_world() -> None:
    text = (WORLD / "DETAIL.md").read_text()
    assert "building:colour" in text and "Sign categories" in text and "## Per tile" in text


def test_sign_category_words_never_come_from_data() -> None:
    """The atlas is baked from the table, so a sign can only say a category word."""
    doc = json.loads(detail.CATEGORIES_FILE.read_text())
    assert doc["format"] == 1 and all(set(c) >= {"id", "key", "english", "tamil", "board", "ink", "trim", "public", "tags"} for c in doc["categories"])
