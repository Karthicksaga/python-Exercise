#!/usr/bin/env python3
"""Compile data/chennai_building_mapping.json into a compact sorted binary lookup table
(`assets/buildings/pack_100/lookup.bin`) for fast zero-allocation GDScript worker-thread reads.

Format (`little-endian`):
  Header (16 bytes):
    - magic (4B): b"CP10"
    - version (u16): 1
    - asset_count (u16): N (100)
    - protected_count (u32): P
    - mapped_count (u32): M
  Asset Table (`asset_count * 64` bytes):
    - id (40B null-padded UTF-8)
    - width_m (f32)
    - depth_m (f32)
    - height_m (f32)
    - floors (u32)
    - reserved (8B)
  Protected IDs (`P * 8` bytes, sorted ascending u64 OSM IDs)
  Mapped Entries (`M * 10` bytes, sorted ascending by source_id u64):
    - source_id (u64)
    - asset_idx (u16)
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path("godot-chennai")
CATALOG = ROOT / "assets/buildings/pack_100/catalog.json"
MAPPING = ROOT / "data/chennai_building_mapping.json"
PROTECTED = ROOT / "data/protected_buildings.json"
OUT_BIN = ROOT / "assets/buildings/pack_100/lookup.bin"


def _parse_osm_num(s: str) -> int | None:
    if "/" not in s:
        return None
    tail = s.split("/", 1)[1].strip()
    return int(tail) if tail.isdigit() else None


def main() -> None:
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    models = cat["models"]
    id_to_idx = {m["id"]: i for i, m in enumerate(models)}

    prot_doc = json.loads(PROTECTED.read_text(encoding="utf-8"))
    prot_set: set[int] = set()
    for item in prot_doc["protected_buildings"]:
        for ref in item.get("osm_ids", []) + item.get("excluded_osm_ids", []):
            num = _parse_osm_num(str(ref))
            if num is not None:
                prot_set.add(num)

    map_doc = json.loads(MAPPING.read_text(encoding="utf-8"))
    cols = map_doc["schema"]["columns"]
    i_osm = cols.index("osm_id")
    i_asset = cols.index("selected_asset_id")
    i_prot = cols.index("protected_status")
    i_status = cols.index("integration_status")

    mapped_dict: dict[int, int] = {}
    for row in map_doc["mappings"]:
        src_id = int(row[i_osm])
        if row[i_prot] == "protected" or src_id in prot_set:
            prot_set.add(src_id)
            continue
        if row[i_status] == "proposed_glb_swap" and row[i_asset] in id_to_idx:
            mapped_dict[src_id] = id_to_idx[row[i_asset]]

    # Ensure no protected ID can ever appear in mapped_dict
    for pid in prot_set:
        mapped_dict.pop(pid, None)

    prot_sorted = sorted(prot_set)
    mapped_sorted = sorted(mapped_dict.items(), key=lambda kv: kv[0])

    buf = bytearray()
    buf.extend(struct.pack("<4sHHII", b"CP10", 1, len(models), len(prot_sorted), len(mapped_sorted)))

    for m in models:
        raw_id = m["id"].encode("utf-8")[:40].ljust(40, b"\x00")
        d = m["dimensions_m"]
        buf.extend(
            struct.pack(
                "<40sfffI8s",
                raw_id,
                float(d["width"]),
                float(d["depth"]),
                float(d["height"]),
                int(m["floors"]),
                b"\x00" * 8,
            )
        )

    for pid in prot_sorted:
        buf.extend(struct.pack("<Q", pid))

    for src_id, aidx in mapped_sorted:
        buf.extend(struct.pack("<QH", src_id, aidx))

    OUT_BIN.write_bytes(bytes(buf))
    print(
        f"Wrote {OUT_BIN}: {OUT_BIN.stat().st_size:,} bytes "
        f"(assets={len(models)}, protected={len(prot_sorted)}, mapped={len(mapped_sorted)})"
    )


if __name__ == "__main__":
    main()
