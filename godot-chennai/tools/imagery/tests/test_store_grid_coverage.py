"""Store, chunk grid and coverage report. Image records built here are TEST DATA (made-up ids),
used to test counting; they are not coverage of any real street."""
from __future__ import annotations

from pathlib import Path

import pytest

from street_imagery.bbox import ANNA_NAGAR, BBox
from street_imagery.coverage import build_report
from street_imagery.discover import discover
from street_imagery.errors import AuthError, NetworkError
from street_imagery.grid import PROJECTION, ChunkGrid
from street_imagery.models import ImageRecord
from street_imagery.roads import Street, densify
from street_imagery.store import Store


def rec(i: str, lat: float, lng: float, ca: str | None = "2021-05-01T00:00:00Z", seq: str | None = "s1", provider: str = "mapillary") -> ImageRecord:
    return ImageRecord(provider, i, lat, lng, ca, seq, None, "CC-BY-SA-4.0", "provider_terms", "test attribution")


@pytest.fixture(scope="module")
def grid() -> ChunkGrid:
    return ChunkGrid.from_world()


def test_grid_matches_the_geo_tools_and_the_game_data(grid: ChunkGrid) -> None:
    from chennai_geo.regions import CHUNK_SIZE, world_grid

    g = world_grid()
    assert (grid.min_x, grid.min_z, grid.cols, grid.rows, grid.size) == (g.min_x, g.min_z, g.cols, g.rows, CHUNK_SIZE)
    x, z = PROJECTION.to_local(13.085, 80.2101)  # the projection origin is (0, 0)
    assert (x, z) == (0.0, 0.0) and grid.chunk_of(13.085, 80.2101) == (g.col(0), g.row(0))


def test_chunk_box_contains_its_own_points(grid: ChunkGrid) -> None:
    c, r = grid.chunk_of(13.085, 80.2101)
    b = grid.chunk_box(c, r)
    assert b.contains(13.085, 80.2101) and 0.002 < b.north - b.south < 0.0025


def test_anna_nagar_chunks_are_whole_squares_inside_the_box(grid: ChunkGrid) -> None:
    chunks = grid.chunks_inside(ANNA_NAGAR)
    assert 150 < len(chunks) < 300
    assert all(ANNA_NAGAR.contains_box(grid.chunk_box(c, r)) for c, r in chunks)


def test_store_dedupes_by_provider_and_id(tmp_path: Path, grid: ChunkGrid) -> None:
    s = Store(tmp_path / "t.sqlite")
    assert s.add_images([rec("1", 13.085, 80.21), rec("1", 13.085, 80.21), rec("1", 13.085, 80.21, provider="kartaview")], grid) == 2
    assert s.add_images([rec("1", 13.085, 80.21)], grid) == 0
    assert [(r.provider, r.id) for r in s.images()] == [("kartaview", "1"), ("mapillary", "1")]
    assert s.export_jsonl(tmp_path / "o.jsonl") == 2 and len((tmp_path / "o.jsonl").read_text().splitlines()) == 2


class FakeClient:
    def __init__(self, behaviour: list[object]) -> None:
        self.behaviour = behaviour

    def search(self, box: BBox) -> list[ImageRecord]:
        b = self.behaviour.pop(0)
        if isinstance(b, Exception):
            raise b
        return b  # type: ignore[return-value]


def test_discover_logs_failures_and_stops_on_network_or_auth(tmp_path: Path, grid: ChunkGrid) -> None:
    s = Store(tmp_path / "t.sqlite")
    box = BBox(13.08, 80.20, 13.09, 80.22)  # two 0.01 tiles
    res = discover("mapillary", FakeClient([NetworkError("blocked")]), box, s, grid)  # type: ignore[arg-type]
    assert (res.tiles_ok, res.tiles_failed) == (0, 1) and "blocked" in res.errors[0]
    assert [x[2] for x in s.searches()] == ["failed"] and s.searches("ok") == []
    res = discover("mapillary", FakeClient([AuthError("bad token")]), box, s, grid)  # type: ignore[arg-type]
    assert res.tiles_failed == 1 and len(s.searches()) == 2


def test_discover_ok_tiles_are_logged_and_images_stored(tmp_path: Path, grid: ChunkGrid) -> None:
    s = Store(tmp_path / "t.sqlite")
    box = BBox(13.08, 80.20, 13.09, 80.22)
    res = discover("mapillary", FakeClient([[rec("1", 13.085, 80.205)], []]), box, s, grid)  # type: ignore[arg-type]
    assert (res.tiles_ok, res.images_found, res.images_new) == (2, 1, 1) and len(s.searches("ok")) == 2


def test_report_with_no_successful_search_claims_nothing(tmp_path: Path, grid: ChunkGrid) -> None:
    s = Store(tmp_path / "t.sqlite")
    s.log_search("mapillary", ANNA_NAGAR, "failed", 0, "NetworkError: proxy 403")
    streets = [Street("Test Road", "residential", ((0.0, 0.0), (10.0, 0.0)), True)]
    d = build_report(s, grid, ANNA_NAGAR, streets).data
    assert d["coverage_known"] is False and d["chunks"]["searched"] == 0 and d["chunks"]["with_imagery"] == 0
    assert d["chunks"]["without_imagery"] == 0 and d["chunks"]["not_searched"] == d["chunks"]["total"] > 0
    assert d["manual_reference_list"][0]["reason"] == "not searched"
    md = build_report(s, grid, ANNA_NAGAR, streets).markdown()
    assert "No search has succeeded" in md and "proxy 403" in md


def test_report_counts_searched_chunks_images_sequences_years_and_streets(tmp_path: Path, grid: ChunkGrid) -> None:
    s = Store(tmp_path / "t.sqlite")
    searched = BBox(13.080, 80.205, 13.090, 80.215)
    s.log_search("mapillary", searched, "ok", 3)
    inside = grid.chunks_inside(searched)
    assert inside
    # three test images: two in one chunk (one sequence), one in another; one outside the searched box
    c0 = grid.chunk_box(*inside[0])
    c1 = grid.chunk_box(*inside[1])
    mid0 = ((c0.south + c0.north) / 2, (c0.west + c0.east) / 2)
    mid1 = ((c1.south + c1.north) / 2, (c1.west + c1.east) / 2)
    s.add_images([rec("a", *mid0, "2019-01-01T00:00:00Z"), rec("b", mid0[0], mid0[1] + 1e-5, "2019-06-01T00:00:00Z"), rec("c", *mid1, "2022-01-01T00:00:00Z", seq="s2"),
                  rec("d", 13.0705, 80.196, None, None)], grid)
    x, z = PROJECTION.to_local(*mid0)
    covered = Street("Covered Street", "residential", tuple((x + dx, z) for dx in range(-20, 30, 10)), True)
    bare = Street("Bare Street", "tertiary", tuple((x + 5000.0 + dx, z) for dx in range(0, 100, 10)), True)
    anon = Street("(unnamed service)", "service", ((x, z),), False)
    d = build_report(s, grid, ANNA_NAGAR, [covered, bare, anon]).data
    assert d["coverage_known"] and d["chunks"]["searched"] == len(inside)
    assert d["chunks"]["with_imagery"] == 2 and d["chunks"]["without_imagery"] == len(inside) - 2
    assert d["chunks"]["not_searched"] == d["chunks"]["total"] - len(inside)
    assert d["images"]["total"] == 4 and d["sequences"] == 2 and d["capture_year_histogram"] == {"2019": 2, "2022": 1}
    rows = {r["name"]: r for r in d["streets"]["rows"]}
    assert rows["Covered Street"]["covered_fraction"] == 1.0 and rows["Bare Street"]["covered_fraction"] == 0.0
    assert [m["name"] for m in d["manual_reference_list"]] == ["Bare Street"]  # unnamed roads never go on the list
    assert d["streets"]["named_streets"] == 2 and d["streets"]["named_streets_covered"] == 1


def test_densify_samples_every_ten_metres() -> None:
    pts = list(densify([(0.0, 0.0), (35.0, 0.0)]))
    assert len(pts) == 5 and pts[0] == (0.0, 0.0) and pts[-1] == (35.0, 0.0)


def test_real_world_roads_load_for_anna_nagar() -> None:
    from street_imagery.roads import load_streets

    streets = load_streets(ANNA_NAGAR)
    named = {s.name for s in streets if s.named}
    assert len(named) > 50 and sum(len(s.samples) for s in streets) > 1000
