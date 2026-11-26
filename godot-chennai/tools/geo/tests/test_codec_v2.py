"""Format 2: round trips, version checks, pinned enum tables, the chunk pack."""
import pytest

from chennai_geo import codec_v2, enums
from chennai_geo.codec_v2 import ChunkV2, RoadPiece, StringTable
from chennai_geo.model import DS_OSM_RELATION, DS_OSM_WAY, DS_OVERTURE, Area, Building, Ref, Road, Tree

CENTRE = (1000.0, -2000.0)


def _centre(col: int, row: int):
    assert (col, row) == (12, 34)
    return CENTRE


def _chunk() -> ChunkV2:
    outline = [(990.0, -2010.0), (1010.0, -2010.0), (1010.0, -1990.0), (990.0, -1990.0)]
    hole = [(995.0, -2005.0), (995.0, -1995.0), (1005.0, -1995.0), (1005.0, -2005.0)]
    b1 = Building(651861526, outline, 4, 13.3, "levels", "apartments", 0xE8C9A0, holes=[hole], use="school", roof_shape="hipped",
                  roof_levels=1, min_height=3.1, archetype=7, levels_mapped=True, source=Ref(DS_OSM_WAY, 651861526),
                  merged=[Ref(DS_OVERTURE, 3), Ref(DS_OVERTURE, 4)], repaired=True)
    b2 = Building(0x80000000 | (3000 << 3), outline, 3, 12.0, "height", "commercial", 0xF2E3C6, source=Ref(DS_OSM_RELATION, 12255801857))
    a = Area(22902280, "mangrove", outline, None, [hole], Ref(DS_OSM_RELATION, 99))
    return ChunkV2(12, 34, 2, [b1, b2], [Tree(1001.5, -1999.25, 1.12, "osm"), Tree(999.0, -2001.0, 0.8, "generated")], [a],
                   [(0x504F5250, b"\x01\x02\x03")])


def test_chunk_round_trip_keeps_every_v2_field() -> None:
    c = _chunk()
    data = codec_v2.encode_chunk(c, CENTRE)
    d = codec_v2.decode_chunk(data, _centre)
    assert (d.col, d.row, d.ring) == (12, 34, 2)
    for a, b in zip(c.buildings, d.buildings, strict=True):
        for f in ("id", "outline", "holes", "floors", "height", "height_from", "kind", "color", "use", "roof_shape", "roof_levels", "min_height",
                  "archetype", "levels_mapped", "source", "merged", "repaired"):
            assert getattr(a, f) == getattr(b, f), f
    assert d.trees == c.trees
    assert d.areas[0].kind == "mangrove" and d.areas[0].holes == c.areas[0].holes and d.areas[0].source == Ref(DS_OSM_RELATION, 99)
    assert d.sections == [(0x504F5250, b"\x01\x02\x03")]
    assert codec_v2.encode_chunk(d, CENTRE) == data


def test_header_layout_and_version() -> None:
    data = codec_v2.encode_chunk(ChunkV2(12, 34, 1), CENTRE)
    assert data[:4] == b"COWC" and data[4:6] == b"\x02\x00" and len(data) == 20
    with pytest.raises(ValueError, match="format 1"):
        codec_v2.decode_chunk(data[:4] + b"\x01\x00" + data[6:], _centre)
    with pytest.raises(ValueError, match="trailing"):
        codec_v2.decode_chunk(data + b"\x00", _centre)


def test_quantisation_is_5cm_and_range_is_checked() -> None:
    c = ChunkV2(12, 34, 0, trees=[Tree(1000.03, -2000.0, 1.0, "osm")])
    assert codec_v2.decode_chunk(codec_v2.encode_chunk(c, CENTRE), _centre).trees[0].x == 1000.05
    with pytest.raises(OverflowError):
        codec_v2.encode_chunk(ChunkV2(12, 34, 0, trees=[Tree(3000.0, 0, 1, "osm")]), CENTRE)


def test_roads_round_trip_with_tags_and_long_segments() -> None:
    r = Road(5000, "primary", 14.0, True, [(0.0, 0.0), (5000.0, 10.0), (5001.0, 12.5)], "Test Salai", 4, "trunk", "lanes", True, False, 1,
             "asphalt", 60, "NH 48", "both", True, False, Ref(DS_OSM_WAY, 500))
    names = StringTable()
    data = codec_v2.encode_roads((3, 4), [RoadPiece(r, 2, 120.5, 9000.0)], names)
    [p] = codec_v2.decode_roads(data, names.items)
    assert p.piece == 2 and p.offset == 120.5 and p.total == 9000.0
    got = p.road
    assert (got.id, got.kind, got.highway, got.width, got.lanes, got.oneway, got.bridge, got.tunnel, got.layer, got.surface, got.maxspeed,
            got.name, got.ref, got.sidewalk, got.lit, got.width_from, got.source) == (
        5000, "primary", "trunk", 14.0, 4, True, True, False, 1, "asphalt", 60, "Test Salai", "NH 48", "both", True, "lanes", Ref(DS_OSM_WAY, 500))
    assert got.points[0] == (0.0, 0.0) and got.points[-1] == (5001.0, 12.5) and len(got.points) > 3  # split to fit i16 steps


def test_areas_file_round_trip() -> None:
    a = Area(7, "farmland", [(0.0, 0.0), (4000.0, 0.0), (4000.0, 3000.0)], None, [], Ref(DS_OSM_WAY, 7))
    [b] = codec_v2.decode_areas(codec_v2.encode_areas((0, 0), [a]))
    assert b.kind == "farmland" and b.outline[0] == (0.0, 0.0) and b.outline[-1] == (4000.0, 3000.0)


def test_pack_table_matches_tile_rows() -> None:
    blobs = [(12, 34, 0, codec_v2.encode_chunk(_chunk(), CENTRE)), (13, 34, 1, codec_v2.encode_chunk(ChunkV2(13, 34, 1), CENTRE))]
    pack, rows = codec_v2.encode_pack((0, 0), blobs)
    assert pack[:4] == b"COWP"
    codec_v2.check_pack(pack, rows)
    for (col, row, ring, data), (c, r, off, n, rg) in zip(blobs, rows, strict=True):
        assert (col, row, ring) == (c, r, rg) and pack[off : off + n] == data
    with pytest.raises(ValueError):
        codec_v2.check_pack(pack, [[12, 34, rows[0][2] + 1, rows[0][3], 0]])


def test_enum_tables_are_append_only() -> None:
    # Changing an index breaks every committed chunk: these prefixes are frozen.
    assert enums.ROAD_KINDS[:6] == enums.V1_ROAD_KINDS == ["primary", "secondary", "tertiary", "residential", "service", "footway"]
    assert enums.HEIGHT_FROM[:3] == ["estimated", "levels", "height"]
    assert enums.AREA_KINDS[:3] == ["park", "water", "beach"]
    assert enums.ROAD_KINDS[6:9] == ["motorway", "track", "raceway"]
    assert enums.HEIGHT_FROM[3:5] == ["overture", "openbuildings"]
    assert enums.ROOF_SHAPES[:4] == ["unknown", "flat", "gabled", "hipped"]
    assert len(enums.AREA_KINDS) == 23 and len(enums.BUILDING_USES) == 20 and len(enums.HIGHWAY_CLASSES) == 25
