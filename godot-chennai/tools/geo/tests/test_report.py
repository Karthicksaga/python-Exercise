"""The coverage report states what it measures."""
from pathlib import Path

from chennai_geo.regions import world_grid
from chennai_geo.report import write_reports
from chennai_geo.world import build_world
from chennai_geo.writer import write_world_v2
from test_parse_and_build import BOX


def test_report_on_fixture(small_features, tmp_path: Path) -> None:
    w = build_world(small_features, world_grid(), [BOX], 0)
    sizes = write_world_v2(w, tmp_path)
    text = write_reports(w, tmp_path, sizes, "fixture")
    for want in ("Buildings: 2 ", "multipolygon parts 1", "Height source:", "Road tags:", "bridge 1 (50.0 %)", "Airport features: ", "runway 1", "Roof shape tagged: 1 (50.0 %)", "| 0 |"):
        assert want in text, want
    assert list((tmp_path / "reports").glob("*.md"))
