"""The Python projection agrees with the Three.js game's `GeoProjection` to 1 cm (TD-2)."""
import json
import math

from conftest import FIXTURES

from chennai_geo.projection import ANNA_NAGAR_ORIGIN, EARTH_RADIUS, GeoProjection


def test_reference_points_from_projection_ts_agree_to_1cm() -> None:
    ref = json.loads((FIXTURES / "projection_reference.json").read_text())
    p = GeoProjection(ANNA_NAGAR_ORIGIN)
    assert ref["origin"] == {"lat": ANNA_NAGAR_ORIGIN.lat, "lng": ANNA_NAGAR_ORIGIN.lng}
    assert len(ref["points"]) >= 10
    for pt in ref["points"]:
        x, z = p.to_local(pt["lat"], pt["lng"])
        assert math.hypot(x - pt["x"], z - pt["z"]) < 0.01, pt["name"]
        back = p.to_latlng(x, z)
        assert abs(back.lat - pt["backLat"]) < 1e-9 and abs(back.lng - pt["backLng"]) < 1e-9


def test_axes_and_constants() -> None:
    p = GeoProjection(ANNA_NAGAR_ORIGIN)
    x, z = p.to_local(ANNA_NAGAR_ORIGIN.lat + 0.01, ANNA_NAGAR_ORIGIN.lng + 0.01)
    assert x > 0 and z < 0  # +X east, -Z north
    assert EARTH_RADIUS == 6_371_008.8


def test_world_corners_round_trip() -> None:
    p = GeoProjection(ANNA_NAGAR_ORIGIN)
    for lat, lng in [(12.68, 79.95), (13.6, 80.4)]:
        x, z = p.to_local(lat, lng)
        back = p.to_latlng(x, z)
        assert abs(back.lat - lat) < 1e-12 and abs(back.lng - lng) < 1e-12
