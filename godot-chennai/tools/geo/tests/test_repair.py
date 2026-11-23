"""Invalid geometry is repaired or dropped, and counted."""
from collections import Counter

from chennai_geo.model import OsmPolygon
from chennai_geo.world import repair_polygon


def test_bow_tie_is_repaired_to_its_largest_part() -> None:
    stats: Counter[str] = Counter()
    bow = OsmPolygon(1, {"building": "yes"}, [(0, 0), (20, 20), (20, 0), (0, 30)])
    fixed = repair_polygon(bow, stats, "building")
    assert fixed is not None and stats["building:repaired"] == 1
    from shapely.geometry import Polygon

    assert Polygon(fixed.outline).is_valid


def test_valid_polygon_is_untouched_and_degenerate_dropped() -> None:
    stats: Counter[str] = Counter()
    sq = OsmPolygon(1, {}, [(0, 0), (10, 0), (10, 10), (0, 10)])
    assert repair_polygon(sq, stats, "building") is sq
    assert repair_polygon(OsmPolygon(2, {}, [(0, 0), (1, 1)]), stats, "building") is None
    assert stats["building:dropped-degenerate"] == 1
