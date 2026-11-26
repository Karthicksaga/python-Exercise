"""The dataset manifest (`godot-chennai/data/MANIFEST.json`): what was downloaded, when, its
checksum and OSM data timestamp, so a build can be reproduced and attributed."""
from __future__ import annotations

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TN_PBF_URL = "https://download.openstreetmap.fr/extracts/asia/india/tamil_nadu-latest.osm.pbf"
TN_STATE_URL = "https://download.openstreetmap.fr/extracts/asia/india/tamil_nadu.state.txt"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def parse_state(text: str) -> dict[str, str]:
    out = {}
    for line in text.splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().replace("\\:", ":")
    return out


def fetch(raw: Path, url: str = TN_PBF_URL, state_url: str = TN_STATE_URL) -> dict[str, Any]:
    raw.mkdir(parents=True, exist_ok=True)
    target = raw / url.rsplit("/", 1)[1]
    with urllib.request.urlopen(url) as r, target.open("wb") as f:  # noqa: S310 - fixed https URL
        last_modified = r.headers.get("Last-Modified", "")
        while block := r.read(1 << 20):
            f.write(block)
    with urllib.request.urlopen(state_url) as r:  # noqa: S310
        state = parse_state(r.read().decode())
    return entry(target, url, state.get("timestamp", "unknown"), last_modified, state.get("sequenceNumber"))


def entry(path: Path, url: str, osm_timestamp: str, last_modified: str = "", sequence: str | None = None) -> dict[str, Any]:
    return {
        "id": "osm-tamil-nadu",
        "url": url,
        "file": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "osmDataTimestamp": osm_timestamp,
        **({"replicationSequence": int(sequence)} if sequence else {}),
        "lastModified": last_modified,
        "downloaded": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "licence": "ODbL 1.0, © OpenStreetMap contributors",
    }


def write_manifest(path: Path, entries: list[dict[str, Any]], extra: dict[str, Any]) -> None:
    path.write_text(json.dumps({"format": 1, "datasets": entries, **extra}, indent=2, ensure_ascii=False) + "\n")
