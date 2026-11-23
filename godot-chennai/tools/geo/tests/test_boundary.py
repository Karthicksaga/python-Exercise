"""The world boundary: synthetic case, and the committed boundary's shape."""
from shapely.geometry import Point, Polygon, box

from conftest import GODOT

from chennai_geo.boundary import load_boundary, world_boundary


def test_synthetic_state_gets_its_sea_but_not_the_neighbour() -> None:
    # State: land west of x=10 up to y=8 (the coast is x=10); neighbour above y=8.
    state = Polygon([(0, 0), (10, 0), (10, 8), (0, 8)])
    b = world_boundary(state, (0, 0, 14, 12))
    assert b.contains(Point(5, 5)) and b.contains(Point(12, 4))  # land and its sea
    assert not b.contains(Point(5, 10)) and not b.contains(Point(12, 10))  # neighbour's land and sea


def test_committed_boundary() -> None:
    b = load_boundary(GODOT / "data" / "boundary" / "world-boundary.geojson")
    w, s, e, n = b.bounds
    assert (w, s, e) == (79.95, 12.68, 80.4) and 13.45 < n < 13.6
    for lng, lat in [(80.2101, 13.085), (80.1709, 12.9941), (79.9766, 12.6921), (80.3167, 13.4167), (80.33, 13.05)]:
        assert b.contains(Point(lng, lat)), (lng, lat)  # Anna Nagar, airport, Chengalpattu, Pulicat, sea off Marina
    assert not b.contains(Point(80.20, 13.52))  # Andhra Pradesh, north of the border
    assert b.within(box(79.95, 12.68, 80.40, 13.60).buffer(1e-9))
