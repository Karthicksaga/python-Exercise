"""OSM parsing (multipolygons, aeroways, tags kept) and the world build on a hand-made extract."""
from pathlib import Path

from chennai_geo.enums import HEIGHT_FROM
from chennai_geo.geometry import Bounds, signed_area
from chennai_geo.model import DS_OSM_RELATION, DS_OSM_WAY
from chennai_geo.regions import Playable, world_grid
from chennai_geo.world import build_world, building_game_id
from chennai_geo.writer import read_world_v2, write_world_v2

BOX = Playable(Bounds(-2000, 2000, -1000, 2500))


def test_multipolygon_outer_and_inner(small_features) -> None:
    rel = [b for b in small_features.buildings if b.source == "relation"]
    assert len(rel) == 1
    b = rel[0]
    assert b.id == 3000 and len(b.holes) == 1 and len(b.outline) == 4 and len(b.holes[0]) == 4
    assert abs(abs(signed_area(b.outline)) - 1600) < 5 and abs(abs(signed_area(b.holes[0])) - 100) < 3
    lake = [a for a in small_features.areas if a.source == "relation"]
    assert len(lake) == 1 and lake[0].tags["natural"] == "water" and len(lake[0].holes) == 1
    # Outer/inner member ways are not buildings or areas by themselves.
    assert {p.id for p in small_features.buildings} == {100, 3000}


def test_aeroways_and_tags_are_kept(small_features) -> None:
    assert [w.id for w in small_features.aeroway_lines] == [600]
    assert any(p.tags.get("aeroway") == "helipad" for p in small_features.points)
    road = next(h for h in small_features.highways if h.id == 500)
    assert road.tags["bridge"] == "yes" and road.tags["layer"] == "1"


def test_building_ids() -> None:
    from chennai_geo.model import OsmPolygon

    assert building_game_id(OsmPolygon(651861526, {}, [])) == 651861526
    rid = building_game_id(OsmPolygon(3000, {}, [], source="relation", part=1))
    assert rid & 0x80000000 and (rid & 0x7FFFFFFF) >> 3 == 3000 and rid & 7 == 1


def test_build_write_read(small_features, tmp_path: Path) -> None:
    w = build_world(small_features, world_grid(), [BOX], 0)
    blds = {b.id: b for c in w.chunks.values() for b in c.buildings}
    assert len(blds) == 2
    way = blds[100]
    assert (way.height_from, way.floors, way.kind, way.roof_shape, way.use) == ("levels", 4, "apartments", "hipped", "residential")
    school = next(b for b in blds.values() if b.id & 0x80000000)
    assert school.height == 12 and school.height_from == "height" and school.use == "school" and len(school.holes) == 1
    assert signed_area(school.outline) > 0 and signed_area(school.holes[0]) < 0
    roads = {r.id: r for r in w.roads}
    salai = roads[5000]
    assert salai.bridge and salai.layer == 1 and salai.lanes == 4 and salai.width == 14.0 and salai.surface == "asphalt" and salai.ref == "SH 99"
    assert roads[5010].oneway and roads[5010].width == 6.5 and roads[5010].width_from == "width"
    assert roads[5010].points[0][1] < roads[5010].points[-1][1]  # oneway=-1 reversed: runs north to south
    assert {a.kind for a in w.aeroways} == {"runway", "helipad"}
    assert len(w.bus_stops) == 1 and len(w.districts) == 1 and w.pois[0]["kind"] == "hospital"
    sizes = write_world_v2(w, tmp_path / "world", {"test": True})
    assert sizes["tiles"] >= 1
    back = read_world_v2(tmp_path / "world")
    assert back["index"]["format"] == 2 and back["index"]["origin"] == {"lat": 13.085, "lng": 80.2101}
    got = {b.id: b for t in back["tiles"] for c in t["chunks"] for b in c.buildings}
    assert set(got) == set(blds)
    assert got[school.id].source.dataset == DS_OSM_RELATION and got[school.id].source.id == 3000
    assert got[100].source.dataset == DS_OSM_WAY and HEIGHT_FROM.index(got[100].height_from) == 1
    pieces = [p for t in back["tiles"] for p in t["roads"]]
    assert {p.road.id for p in pieces} == set(roads)
    aero = [a for t in back["tiles"] for a in t["json"]["aeroways"]]
    assert any(a["kind"] == "runway" and a["ref"] == "07/25" and a["width"] == 45 for a in aero)
    lake = [a for t in back["tiles"] for c in t["chunks"] for a in c.areas if a.kind == "water"]
    assert lake and any(a.holes for a in lake)


def test_build_is_deterministic(small_features, tmp_path: Path) -> None:
    for name in ("a", "b"):
        write_world_v2(build_world(small_features, world_grid(), [BOX], 0), tmp_path / name)
    files = sorted(p.relative_to(tmp_path / "a") for p in (tmp_path / "a").rglob("*") if p.is_file())
    assert files and all((tmp_path / "a" / f).read_bytes() == (tmp_path / "b" / f).read_bytes() for f in files)


def test_format1_export_and_v1_conversion(small_features, tmp_path: Path) -> None:
    import json

    from chennai_geo import codec_v1
    from chennai_geo.regions import Playable, ring0_bounds
    from chennai_geo.convert import v1_to_world, counts
    from chennai_geo.writer import write_world_v1

    w = build_world(small_features, world_grid(), [Playable(ring0_bounds())], 0, repair=False, v2=False)
    write_world_v1(w, tmp_path / "v1")
    index = json.loads((tmp_path / "v1" / "index.json").read_text())
    assert index["format"] == 1 and index["bounds"] == {"minX": -1615, "maxX": 8633, "minZ": -1091, "maxZ": 11655}
    roads = codec_v1.decode_roads((tmp_path / "v1" / "roads.bin").read_bytes(), index["roadNames"])
    assert {r.id for r in roads} == {5000, 5010}  # v1 classes only; the runway is not a road
    back = v1_to_world(tmp_path / "v1")
    assert counts(back)["buildings"] == 1  # the multipolygon school is v2-only
    write_world_v2(back, tmp_path / "v2")
    assert (tmp_path / "v2" / "world.json").exists()
