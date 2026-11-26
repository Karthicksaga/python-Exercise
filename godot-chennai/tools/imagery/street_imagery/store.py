"""Local SQLite store: the images found (deduplicated by provider + id) and a log of searches.

The search log is what lets the coverage report tell "searched, nothing there" from "never
searched": no coverage claim is made for a box without a successful logged search.
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable, Iterator
from datetime import datetime, timezone
from pathlib import Path

from .bbox import BBox
from .grid import ChunkGrid
from .models import ImageRecord

SCHEMA = """
CREATE TABLE IF NOT EXISTS images (
  provider TEXT NOT NULL, id TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
  captured_at TEXT, sequence_id TEXT, creator TEXT, license TEXT NOT NULL, license_source TEXT NOT NULL,
  attribution TEXT NOT NULL, compass_angle REAL, is_pano INTEGER,
  chunk_col INTEGER, chunk_row INTEGER, first_seen TEXT NOT NULL,
  PRIMARY KEY (provider, id));
CREATE INDEX IF NOT EXISTS images_chunk ON images (chunk_col, chunk_row);
CREATE TABLE IF NOT EXISTS searches (
  n INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, south REAL, west REAL, north REAL, east REAL,
  status TEXT NOT NULL, images_found INTEGER NOT NULL DEFAULT 0, error TEXT, at TEXT NOT NULL);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Store:
    def __init__(self, path: Path | str) -> None:
        self.db = sqlite3.connect(str(path))
        self.db.executescript(SCHEMA)

    def close(self) -> None:
        self.db.close()

    def add_images(self, records: Iterable[ImageRecord], grid: ChunkGrid, when: str | None = None) -> int:
        """Insert records not stored yet; returns how many were new."""
        when = when or now_iso()
        new = 0
        for r in records:
            col, row = grid.chunk_of(r.lat, r.lng)
            cur = self.db.execute(
                "INSERT OR IGNORE INTO images VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (r.provider, r.id, r.lat, r.lng, r.captured_at, r.sequence_id, r.creator, r.license, r.license_source,
                 r.attribution, r.compass_angle, None if r.is_pano is None else int(r.is_pano), col, row, when))
            new += cur.rowcount
        self.db.commit()
        return new

    def log_search(self, provider: str, box: BBox, status: str, images_found: int = 0, error: str | None = None, when: str | None = None) -> None:
        """status: "ok" (the provider answered for the whole box) or "failed" (error says why)."""
        self.db.execute("INSERT INTO searches (provider, south, west, north, east, status, images_found, error, at) VALUES (?,?,?,?,?,?,?,?,?)",
                        (provider, box.south, box.west, box.north, box.east, status, images_found, error, when or now_iso()))
        self.db.commit()

    def images(self) -> Iterator[ImageRecord]:
        cur = self.db.execute("SELECT provider,id,lat,lng,captured_at,sequence_id,creator,license,license_source,attribution,compass_angle,is_pano FROM images ORDER BY provider,id")
        for p, i, la, ln, ca, sq, cr, li, ls, at, co, pano in cur:
            yield ImageRecord(p, i, la, ln, ca, sq, cr, li, ls, at, co, None if pano is None else bool(pano))

    def searches(self, status: str | None = None) -> list[tuple[str, BBox, str, int, str | None, str]]:
        q = "SELECT provider,south,west,north,east,status,images_found,error,at FROM searches"
        args: tuple[str, ...] = ()
        if status:
            q += " WHERE status=?"
            args = (status,)
        return [(p, BBox(s, w, n, e), st, c, er, at) for p, s, w, n, e, st, c, er, at in self.db.execute(q + " ORDER BY n", args)]

    def export_jsonl(self, path: Path) -> int:
        n = 0
        with path.open("w", encoding="utf-8") as f:
            for r in self.images():
                f.write(json.dumps(r.as_dict(), sort_keys=True) + "\n")
                n += 1
        return n
