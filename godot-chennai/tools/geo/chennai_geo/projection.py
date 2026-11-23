"""Geographic <-> local game coordinates: a line-for-line port of
`chennai-open-world/packages/map-data/src/projection.ts` (TD-2).

+X = east, +Y = up, -Z = north, metres, equirectangular around a fixed origin. Every dataset that
goes into the world passes through this projection, never through UTM or another CRS (UTM is only
used inside fusion for matching, see `fusion.py`).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS = 6_371_008.8
DEG = math.pi / 180


@dataclass(frozen=True)
class LatLng:
    lat: float
    lng: float


ANNA_NAGAR_ORIGIN = LatLng(13.085, 80.2101)


class GeoProjection:
    def __init__(self, origin: LatLng = ANNA_NAGAR_ORIGIN) -> None:
        if not (math.isfinite(origin.lat) and math.isfinite(origin.lng)) or abs(origin.lat) > 85:
            raise ValueError(f"Unsupported projection origin: {origin.lat}, {origin.lng}")
        self.origin = origin
        self.cos_lat = math.cos(origin.lat * DEG)

    def to_local(self, lat: float, lng: float) -> tuple[float, float]:
        """(x, z) in metres: x east, z south."""
        return (
            (lng - self.origin.lng) * DEG * EARTH_RADIUS * self.cos_lat,
            -(lat - self.origin.lat) * DEG * EARTH_RADIUS,
        )

    def to_latlng(self, x: float, z: float) -> LatLng:
        return LatLng(
            self.origin.lat - z / (DEG * EARTH_RADIUS),
            self.origin.lng + x / (DEG * EARTH_RADIUS * self.cos_lat),
        )


PROJECTION = GeoProjection(ANNA_NAGAR_ORIGIN)
