"""Latitude/longitude boxes."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BBox:
    south: float
    west: float
    north: float
    east: float

    def __post_init__(self) -> None:
        if not (-90 <= self.south < self.north <= 90 and -180 <= self.west < self.east <= 180):
            raise ValueError(f"Bad bbox S={self.south} W={self.west} N={self.north} E={self.east}")

    def contains(self, lat: float, lng: float) -> bool:
        return self.south <= lat <= self.north and self.west <= lng <= self.east

    def contains_box(self, o: "BBox") -> bool:
        return self.south <= o.south and o.north <= self.north and self.west <= o.west and o.east <= self.east

    def quarters(self) -> list["BBox"]:
        ml = (self.south + self.north) / 2
        mg = (self.west + self.east) / 2
        return [BBox(self.south, self.west, ml, mg), BBox(self.south, mg, ml, self.east),
                BBox(ml, self.west, self.north, mg), BBox(ml, mg, self.north, self.east)]

    def tiles(self, step_deg: float) -> list["BBox"]:
        """Cover the box with tiles of at most `step_deg` on a side (the last row/column is smaller)."""
        out: list[BBox] = []
        s = self.south
        while s < self.north - 1e-12:
            n = min(s + step_deg, self.north)
            w = self.west
            while w < self.east - 1e-12:
                e = min(w + step_deg, self.east)
                out.append(BBox(s, w, n, e))
                w = e
            s = n
        return out

    @property
    def span_deg(self) -> float:
        return max(self.north - self.south, self.east - self.west)


# Anna Nagar first (the game's projection origin is 13.085 N, 80.2101 E): about 3.3 km x 3.7 km.
ANNA_NAGAR = BBox(13.070, 80.195, 13.100, 80.228)


def parse_bbox(text: str) -> BBox:
    """'south,west,north,east' in degrees."""
    parts = [float(p) for p in text.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must be 'south,west,north,east'")
    return BBox(*parts)
