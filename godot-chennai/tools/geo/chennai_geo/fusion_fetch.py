"""Download the three extra building datasets for the world box (G-220): Overture Maps buildings,
Google Open Buildings v3 polygons and Microsoft Global ML Building Footprints. Build time only;
the downloads land in a cache folder outside the repository (never committed) and each one is
recorded in `data/MANIFEST.json` (URL, release, bytes, sha256, date, licence).

The box is read from the world data (`world.json` `bounds`, converted back to lat/lng through the
game projection), never hard-coded, so the fetch follows the world as it grows.

- Overture: DuckDB (httpfs) reads the public GeoParquet release over HTTPS with a filter on the
  `bbox` struct columns; only matching row groups are fetched. Pinned release.
- Google Open Buildings v3: one gzipped CSV per S2 level-6 cell on Cloud Storage; the cells that
  cover the box are computed with s2sphere, each file is streamed once and filtered to the box.
- Microsoft: `dataset-links.csv` lists one gzipped GeoJSON-lines file per level-9 quadkey; the
  quadkeys that cover the box are computed here and only India's rows are read.

Every network function here is excluded from the unit tests (no network in CI); the pure helpers
(`world_box`, `quadkeys_for_box`, `s2_tokens_for_box`, the row parsers) are tested.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import os
import re
import urllib.parse
import urllib.request
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .projection import PROJECTION, GeoProjection, LatLng

OVERTURE_HOST = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"
OVERTURE_RELEASE = "2026-11-18.0"
OPENBUILDINGS_URL = "https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_6_gzip_no_header/{token}_buildings.csv.gz"
MS_LINKS_URL = "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv"
MS_QUADKEY_LEVEL = 9
S2_LEVEL = 6

OVERTURE_FILE = "overture-buildings.parquet"
OPENBUILDINGS_FILE = "openbuildings-v3.csv.gz"
MICROSOFT_FILE = "microsoft-ml.geojsonl.gz"


@dataclass(frozen=True)
class Box:
    south: float
    west: float
    north: float
    east: float

    def contains(self, lat: float, lng: float) -> bool:
        return self.south <= lat <= self.north and self.west <= lng <= self.east


def world_box(world_json: dict[str, Any], projection: GeoProjection | None = None) -> Box:
    """The lat/lng box of the built world (`bounds`, local metres) through the game projection."""
    o = world_json.get("origin") or {}
    proj = projection or (GeoProjection(LatLng(float(o["lat"]), float(o["lng"]))) if o else PROJECTION)
    b = world_json["bounds"]
    nw = proj.to_latlng(float(b["minX"]), float(b["minZ"]))  # -Z is north
    se = proj.to_latlng(float(b["maxX"]), float(b["maxZ"]))
    return Box(south=se.lat, west=nw.lng, north=nw.lat, east=se.lng)


# --- Microsoft: Bing tile quadkeys -------------------------------------------------------------

def _tile_xy(lat: float, lng: float, level: int) -> tuple[int, int]:
    n = 1 << level
    x = int((lng + 180.0) / 360.0 * n)
    s = math.sin(math.radians(lat))
    y = int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def quadkey(x: int, y: int, level: int) -> str:
    out = []
    for i in range(level, 0, -1):
        mask = 1 << (i - 1)
        out.append(str((1 if x & mask else 0) + (2 if y & mask else 0)))
    return "".join(out)


def quadkeys_for_box(box: Box, level: int = MS_QUADKEY_LEVEL) -> list[str]:
    x0, y0 = _tile_xy(box.north, box.west, level)
    x1, y1 = _tile_xy(box.south, box.east, level)
    return sorted(quadkey(x, y, level) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1))


# --- Google Open Buildings: S2 level-6 cells -----------------------------------------------------

def s2_tokens_for_box(box: Box, level: int = S2_LEVEL) -> list[str]:
    import s2sphere  # noqa: PLC0415 - build-time dependency, only needed here

    rect = s2sphere.LatLngRect.from_point_pair(s2sphere.LatLng.from_degrees(box.south, box.west), s2sphere.LatLng.from_degrees(box.north, box.east))
    cov = s2sphere.RegionCoverer()
    cov.min_level = level
    cov.max_level = level
    cov.max_cells = 64
    return sorted(c.to_token() for c in cov.get_covering(rect))


# --- Row parsers (tested) -----------------------------------------------------------------------

_WKT_POLY = re.compile(r"\(\(([^()]*)\)")


def wkt_outer_ring(wkt: str) -> list[tuple[float, float]]:
    """The outer ring of a WKT POLYGON / first polygon of a MULTIPOLYGON as (lng, lat)."""
    m = _WKT_POLY.search(wkt)
    if not m:
        return []
    pts = []
    for pair in m.group(1).split(","):
        a = pair.split()
        pts.append((float(a[0]), float(a[1])))
    return pts


def parse_openbuildings_row(row: list[str]) -> dict[str, Any] | None:
    """v3 columns: latitude, longitude, area_in_meters, confidence, geometry (WKT), full_plus_code."""
    if len(row) < 6:
        return None
    return {"lat": float(row[0]), "lng": float(row[1]), "area": float(row[2]), "confidence": float(row[3]), "outline": wkt_outer_ring(row[4]), "id": row[5]}


def parse_microsoft_line(line: str) -> dict[str, Any] | None:
    """One GeoJSON feature: properties {height, confidence} (-1 = none), Polygon geometry."""
    f = json.loads(line)
    g = f.get("geometry") or {}
    if g.get("type") != "Polygon" or not g.get("coordinates"):
        return None
    p = f.get("properties") or {}
    ring = [(float(c[0]), float(c[1])) for c in g["coordinates"][0]]
    h = p.get("height", -1)
    c = p.get("confidence", -1)
    return {"outline": ring, "height": float(h) if h is not None else -1.0, "confidence": float(c) if c is not None else -1.0}


# --- Network (not unit tested) ------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _open(url: str) -> Any:
    return urllib.request.urlopen(url, timeout=120)  # noqa: S310 - fixed https hosts


def overture_files(release: str = OVERTURE_RELEASE) -> list[tuple[str, int]]:
    """Every parquet file of the buildings theme (S3 ListObjectsV2 over HTTPS, anonymous)."""
    prefix = f"release/{release}/theme=buildings/type=building/"
    out: list[tuple[str, int]] = []
    token = ""
    while True:
        q = f"{OVERTURE_HOST}/?list-type=2&prefix={prefix}" + (f"&continuation-token={urllib.parse.quote(token)}" if token else "")
        with _open(q) as r:
            text = r.read().decode()
        for key, size in re.findall(r"<Key>([^<]+)</Key>.*?<Size>(\d+)</Size>", text):
            if key.endswith(".parquet"):
                out.append((f"{OVERTURE_HOST}/{key}", int(size)))
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", text)
        if not m:
            return out
        token = m.group(1)


def fetch_overture(cache: Path, box: Box, ext_dir: Path, release: str = OVERTURE_RELEASE) -> dict[str, Any]:
    import duckdb  # noqa: PLC0415

    cache.mkdir(parents=True, exist_ok=True)
    target = cache / OVERTURE_FILE
    files = overture_files(release)
    con = duckdb.connect()
    con.execute(f"INSTALL '{ext_dir / 'httpfs.duckdb_extension'}'; LOAD httpfs;")
    con.execute(f"INSTALL '{ext_dir / 'spatial.duckdb_extension'}'; LOAD spatial;")
    proxy = os.environ.get("HTTPS_PROXY", "").replace("http://", "").rstrip("/")
    if proxy:
        con.execute(f"SET http_proxy='{proxy}'")
    ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    if Path(ca).exists():
        con.execute(f"SET ca_cert_file='{ca}'")
    con.execute("SET http_retries=8; SET http_timeout=120000;")
    urls = "[" + ",".join(f"'{u}'" for u, _ in files) + "]"
    con.execute(
        f"""COPY (
          SELECT id, ST_AsWKB(geometry) AS wkb, height, num_floors, min_height, class, subtype, roof_shape,
                 to_json(sources) AS sources, bbox.xmin AS xmin, bbox.ymin AS ymin
          FROM read_parquet({urls})
          WHERE bbox.xmin <= {box.east} AND bbox.xmax >= {box.west} AND bbox.ymin <= {box.north} AND bbox.ymax >= {box.south}
          ORDER BY id
        ) TO '{target}' (FORMAT parquet, COMPRESSION zstd)"""
    )
    rows = con.execute(f"SELECT count(*) FROM read_parquet('{target}')").fetchone()
    return {
        "id": "overture-buildings", "url": f"{OVERTURE_HOST}/release/{release}/theme=buildings/type=building/", "release": release,
        "file": target.name, "bytes": target.stat().st_size, "sha256": _sha(target), "rows": int(rows[0]) if rows else 0,
        "box": box.__dict__, "query": "DuckDB read_parquet over HTTPS, bbox struct filter, ordered by GERS id",
        "sourceFilesScanned": len(files), "downloaded": _now(), "licence": "ODbL 1.0 (Overture buildings theme), © Overture Maps Foundation and its sources",
    }


def fetch_openbuildings(cache: Path, box: Box) -> dict[str, Any]:
    """Streams each S2 cell's CSV once, keeps rows whose centre lies in the box, records the
    checksum of every full upstream file as it streams past."""
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / OPENBUILDINGS_FILE
    cells = []
    kept = 0
    with gzip.open(target, "wt", newline="", compresslevel=6) as out:
        w = csv.writer(out)
        for token in s2_tokens_for_box(box):
            url = OPENBUILDINGS_URL.format(token=token)
            h = hashlib.sha256()
            size = 0
            rows_in = 0
            with _open(url) as r:
                raw = _Tee(r, h)
                text = io.TextIOWrapper(gzip.GzipFile(fileobj=raw), encoding="utf-8", newline="")
                for row in csv.reader(text):
                    rows_in += 1
                    lat, lng = float(row[0]), float(row[1])
                    if box.contains(lat, lng):
                        w.writerow(row)
                        kept += 1
                size = raw.size
            cells.append({"token": token, "url": url, "bytes": size, "sha256": h.hexdigest(), "rows": rows_in})
    return {
        "id": "google-openbuildings-v3", "url": OPENBUILDINGS_URL.replace("{token}", "<s2 token>"), "s2Level": S2_LEVEL, "cells": cells,
        "file": target.name, "bytes": target.stat().st_size, "sha256": _sha(target), "rows": kept, "box": box.__dict__,
        "downloaded": _now(), "licence": "ODbL 1.0 (chosen; also offered under CC BY 4.0), Google Open Buildings v3",
    }


def fetch_microsoft(cache: Path, box: Box, location: str = "India") -> dict[str, Any]:
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / MICROSOFT_FILE
    want = set(quadkeys_for_box(box))
    with _open(MS_LINKS_URL) as r:
        links = list(csv.DictReader(io.TextIOWrapper(r, encoding="utf-8")))
    rows = [x for x in links if x.get("Location") == location and x.get("QuadKey", "").zfill(MS_QUADKEY_LEVEL) in want]
    files = []
    kept = 0
    with gzip.open(target, "wt", compresslevel=6) as out:
        for row in rows:
            h = hashlib.sha256()
            with _open(row["Url"]) as r:
                raw = _Tee(r, h)
                n_in = 0
                for line in io.TextIOWrapper(gzip.GzipFile(fileobj=raw), encoding="utf-8"):
                    n_in += 1
                    f = parse_microsoft_line(line)
                    if f is None:
                        continue
                    lng = sum(p[0] for p in f["outline"]) / len(f["outline"])
                    lat = sum(p[1] for p in f["outline"]) / len(f["outline"])
                    if box.contains(lat, lng):
                        out.write(line if line.endswith("\n") else line + "\n")
                        kept += 1
                files.append({"quadkey": row["QuadKey"], "url": row["Url"], "bytes": raw.size, "sha256": h.hexdigest(), "rows": n_in})
    return {
        "id": "microsoft-ml-buildings", "url": MS_LINKS_URL, "location": location, "quadkeyLevel": MS_QUADKEY_LEVEL, "files": files,
        "file": target.name, "bytes": target.stat().st_size, "sha256": _sha(target), "rows": kept, "box": box.__dict__,
        "downloaded": _now(), "licence": "CDLA Permissive 2.0, Microsoft Global ML Building Footprints",
    }


class _Tee(io.RawIOBase):
    """Reads through a response while hashing and counting the bytes."""

    def __init__(self, src: Any, h: Any) -> None:
        self.src = src
        self.h = h
        self.size = 0

    def readable(self) -> bool:
        return True

    def readinto(self, b: Any) -> int:
        data = self.src.read(len(b))
        n = len(data)
        b[:n] = data
        self.h.update(data)
        self.size += n
        return n


def iter_openbuildings(path: Path) -> Iterator[dict[str, Any]]:
    with gzip.open(path, "rt", newline="") as f:
        for row in csv.reader(f):
            r = parse_openbuildings_row(row)
            if r is not None:
                yield r


def iter_microsoft(path: Path) -> Iterator[dict[str, Any]]:
    with gzip.open(path, "rt") as f:
        for line in f:
            r = parse_microsoft_line(line)
            if r is not None:
                yield r
