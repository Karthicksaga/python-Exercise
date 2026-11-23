"""Chunk assignment, the regional grid and its alignment with today's chunks, tiles, road pieces."""
import math

from chennai_geo.codec_v1 import chunk_centre
from chennai_geo.codec_v2 import road_pieces_by_tile
from chennai_geo.model import Road
from chennai_geo.regions import CHUNK_SIZE, TILE_CHUNKS, ring0_bounds, tile_of, world_grid


def test_ring0_bounds_are_todays() -> None:
    b = ring0_bounds()
    assert (b.min_x, b.max_x, b.min_z, b.max_z) == (-1615, 8633, -1091, 11655)


def test_world_grid_lines_up_with_todays_chunks() -> None:
    g = world_grid()
    dc, dr = g.legacy_offset
    b = ring0_bounds()
    for c, r in [(0, 0), (5, 7), (40, 50)]:
        assert g.centre(c + dc, r + dr) == chunk_centre(b, CHUNK_SIZE, c, r)
    from chennai_geo.projection import PROJECTION

    west, south = PROJECTION.to_local(12.68, 79.95)
    east, north = PROJECTION.to_local(13.60, 80.40)
    assert g.min_x <= west and g.min_x + g.cols * CHUNK_SIZE >= east  # covers 79.95..80.40 E
    assert g.min_z <= north and g.min_z + g.rows * CHUNK_SIZE >= south  # covers 12.68..13.60 N


def test_chunk_of_point_and_tile() -> None:
    g = world_grid()
    x, z = g.min_x + 250 * 41 + 0.01, g.min_z + 250 * 80 - 0.01
    assert (g.col(x), g.row(z)) == (41, 79)
    assert tile_of(41, 79) == (1, 1) and tile_of(39, 80) == (0, 2)
    assert TILE_CHUNKS * CHUNK_SIZE == 10_000


def test_road_pieces_split_at_tiles_and_share_end_points() -> None:
    g = world_grid()
    x0 = g.min_x + 10_000 - 300
    z0 = g.min_z + 5000
    road = Road(10, "primary", 15, False, [(x0, z0), (x0 + 200, z0), (x0 + 400, z0), (x0 + 600, z0)])
    pieces = road_pieces_by_tile([road], lambda x, z: tile_of(g.col(x), g.row(z)))
    assert sorted(pieces) == [(0, 0), (1, 0)]
    a, b = pieces[(0, 0)][0], pieces[(1, 0)][0]
    assert a.road.points[-1] == b.road.points[0]
    assert (a.piece, b.piece) == (0, 1) and a.offset == 0 and math.isclose(b.offset, 200) and a.total == b.total == 600
