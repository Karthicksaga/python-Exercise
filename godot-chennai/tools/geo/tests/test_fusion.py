"""Fusion rules on hand-made footprints (no Overture download)."""
from chennai_geo.fusion import ExternalBuilding, fuse
from chennai_geo.model import DS_OVERTURE, Building, Ref
from chennai_geo.projection import PROJECTION


def _square_local(x: float, z: float, s: float) -> list[tuple[float, float]]:
    return [(x, z), (x + s, z), (x + s, z - s), (x, z - s)]


def _square_ll(x: float, z: float, s: float) -> list[tuple[float, float]]:
    out = []
    for px, pz in _square_local(x, z, s):
        ll = PROJECTION.to_latlng(px, pz)
        out.append((ll.lng, ll.lat))
    return out


def _osm(bid: int, x: float, z: float, s: float, hf: str = "estimated", h: float = 7.1) -> Building:
    return Building(bid, _square_local(x, z, s), 2, h, hf, "house", 0xF2E3C6, source=Ref(0, bid))


def test_iou_match_fills_estimated_height_and_labels_it() -> None:
    res = fuse([_osm(1, 0, 0, 20)], [ExternalBuilding("a", _square_ll(1, 0, 20), height=15.0)])
    [b] = res.buildings
    assert b.height == 15.0 and b.height_from == "overture" and b.floors == 5
    assert b.merged == [Ref(DS_OVERTURE, 0)] and res.report.matched == 1 and res.report.new_buildings == 0


def test_osm_height_wins_over_external() -> None:
    res = fuse([_osm(1, 0, 0, 20, "height", 30.0)], [ExternalBuilding("a", _square_ll(0, 0, 20), height=15.0)])
    assert res.buildings[0].height == 30.0 and res.buildings[0].height_from == "height"


def test_small_footprints_inside_one_osm_building_are_absorbed() -> None:
    ext = [ExternalBuilding(f"s{i}", _square_ll(2 + 9 * i, -2, 7)) for i in range(4)]
    res = fuse([_osm(1, 0, 0, 40)], ext)
    assert len(res.buildings) == 1 and len(res.buildings[0].merged) == 4
    assert res.report.absorbed == 3


def test_unmatched_footprint_becomes_a_new_labelled_building() -> None:
    res = fuse([_osm(1, 0, 0, 20)], [ExternalBuilding("far", _square_ll(500, 500, 12), num_floors=3)])
    new = [b for b in res.buildings if b.id != 1]
    assert len(new) == 1 and new[0].source.dataset == DS_OVERTURE and res.external_ids[new[0].source.id] == "far"
    assert new[0].height_from == "overture" and new[0].floors == 3
    x, z = new[0].outline[0]
    assert abs(x - 500) < 0.02 and abs(z - 500) < 0.02  # back through GeoProjection, not UTM


class _Raster:
    name = "fixture"
    licence = "test"

    def sample(self, outline):
        return [9.0, 10.0, 30.0]


def test_raster_median_when_no_external_height() -> None:
    res = fuse([_osm(1, 0, 0, 20)], [ExternalBuilding("a", _square_ll(0, 0, 20)), ExternalBuilding("b", _square_ll(300, 0, 15))], _Raster())
    assert all(b.height == 10.0 and b.height_from == "openbuildings" for b in res.buildings)


def test_slivers_are_dropped() -> None:
    res = fuse([], [ExternalBuilding("tiny", _square_ll(0, 0, 2))])
    assert res.buildings == [] and res.report.dropped_slivers == 1
