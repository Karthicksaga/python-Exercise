from __future__ import annotations

from types import SimpleNamespace

from chennai_geo.area_coverage import assign, empty_world_row, floor_bin, normalised_distance, pbf_coverage, tally_world_building
from chennai_geo.projection import PROJECTION

from conftest import FIXTURES

CIRCLE = {"type": "circle", "centre_xz": [0.0, 0.0], "radius_m": 100.0}
CORRIDOR = {"type": "corridor", "spine_xz": [[0.0, 0.0], [1000.0, 0.0]], "half_width_m": 200.0}


def test_normalised_distance_circle_and_corridor() -> None:
    assert normalised_distance(CIRCLE, (50.0, 0.0)) == 0.5
    assert normalised_distance(CORRIDOR, (500.0, 100.0)) == 0.5
    assert normalised_distance(CORRIDOR, (1100.0, 0.0)) == 0.5  # beyond the end: distance to the end point
    assert normalised_distance(CORRIDOR, (500.0, 400.0)) == 2.0


def test_assign_prefers_smallest_normalised_distance_and_counts_once() -> None:
    areas = [{"id": "big", "boundary": {"type": "circle", "centre_xz": [0.0, 0.0], "radius_m": 1000.0}},
             {"id": "small", "boundary": {"type": "circle", "centre_xz": [10.0, 0.0], "radius_m": 100.0}}]
    assert assign(areas, (10.0, 0.0)) == "small"
    assert assign(areas, (900.0, 0.0)) == "big"
    assert assign(areas, (5000.0, 0.0)) is None


def test_floor_bins() -> None:
    assert [floor_bin(n) for n in (1, 2, 3, 4, 5, 6, 9, 10, 40)] == ["1", "2", "3", "4-5", "4-5", "6-9", "6-9", "10+", "10+"]


def test_tally_world_building() -> None:
    row = empty_world_row()
    b = SimpleNamespace(levels_mapped=True, height_from="height", roof_shape="flat", use="house", floors=3)
    c = SimpleNamespace(levels_mapped=False, height_from="estimated", roof_shape="unknown", use="unknown", floors=0)
    tally_world_building(row, b)
    tally_world_building(row, c)
    assert (row["buildings"], row["levels_mapped"], row["height_tagged"], row["roof_shape_tagged"], row["use_known"]) == (2, 1, 1, 1, 1)
    assert row["floors_hist"]["3"] == 1 and row["floors_hist"]["1"] == 1


def test_pbf_coverage_counts_tags_per_area() -> None:
    x1, z1 = PROJECTION.to_local(13.0001, 80.2001)
    x2, z2 = PROJECTION.to_local(13.0101, 80.2101)
    areas = [{"id": "a", "boundary": {"type": "circle", "centre_xz": [x1, z1], "radius_m": 200.0}},
             {"id": "b", "boundary": {"type": "circle", "centre_xz": [x2, z2], "radius_m": 200.0}}]
    rows = pbf_coverage(FIXTURES / "areas_buildings.osm", areas)
    a, b = rows["a"], rows["b"]
    assert a["buildings"] == 1 and a["building:levels"] == 1 and a["building:colour"] == 1 and a["building:material"] == 1 and a["roof:shape"] == 1
    assert a["colour_values"]["#f5e6c8"] == 1 and a["building_values"]["house"] == 1
    assert b["buildings"] == 1 and b["height"] == 1 and b["building:levels"] == 0
    assert rows["_outside"]["buildings"] == 1
