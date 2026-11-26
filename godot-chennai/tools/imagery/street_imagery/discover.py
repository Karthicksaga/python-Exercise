"""Run a provider search over a box (tiled), store the records and log each tile's outcome."""
from __future__ import annotations

from dataclasses import dataclass, field

from .bbox import BBox
from .errors import AuthError, ImageryError, NetworkError
from .grid import ChunkGrid
from .kartaview import KartaViewClient
from .mapillary import MapillaryClient
from .store import Store

TILE_DEG = 0.01  # Mapillary documents a limit on the box area; 0.01 deg tiles stay well inside it


@dataclass
class DiscoverResult:
    provider: str
    tiles_ok: int = 0
    tiles_failed: int = 0
    images_found: int = 0
    images_new: int = 0
    errors: list[str] = field(default_factory=list)


def discover(provider: str, client: MapillaryClient | KartaViewClient, box: BBox, store: Store, grid: ChunkGrid, tile_deg: float = TILE_DEG) -> DiscoverResult:
    """Search every tile of `box`. An auth or network failure stops the run (the next tile
    would fail the same way) and is logged as a failed search: nothing is recorded as "no imagery"."""
    res = DiscoverResult(provider)
    for tile in box.tiles(tile_deg):
        try:
            recs = client.search(tile)
        except (AuthError, NetworkError) as e:
            store.log_search(provider, tile, "failed", 0, f"{type(e).__name__}: {e}")
            res.tiles_failed += 1
            res.errors.append(f"{type(e).__name__}: {e}")
            break
        except ImageryError as e:
            store.log_search(provider, tile, "failed", 0, f"{type(e).__name__}: {e}")
            res.tiles_failed += 1
            res.errors.append(f"{type(e).__name__}: {e}")
            continue
        new = store.add_images(recs, grid)
        store.log_search(provider, tile, "ok", len(recs))
        res.tiles_ok += 1
        res.images_found += len(recs)
        res.images_new += new
    return res
