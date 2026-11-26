#!/usr/bin/env python3
"""The railway part of the regional OSM extract, as a small committed file (G-460).

    /opt/tools/geo-venv/bin/python godot-chennai/tools/rail/extract_rail.py   # needs pyosmium and data/raw/world.osm.pbf
    python3 godot-chennai/tools/rail/extract_rail.py --stats                   # what the committed file holds

Reads the world's clipped OSM extract (`data/raw/world.osm.pbf`, not committed; made by
`tools/geo`, see `data/MANIFEST.json`) and writes `data/rail/regional-rail.osm.json.gz`: an
Overpass-style JSON (`elements` of nodes, ways and relations, as `chennai-open-world`'s
`chennai-rail.osm.json`) with only what `build_rail.py` reads:

- route relations `route=train|subway|light_rail` (not under construction: names with "u/c"
  and `state=construction` are left out), with their members;
- every way tagged `railway=rail|subway|light_rail` (not disused, abandoned, construction or
  proposed) and every way a kept relation lists;
- the nodes of those ways; station and halt nodes (`railway=station|halt`,
  `public_transport=station` with train/subway/light_rail); `railway=level_crossing` nodes;
  the stop and platform nodes the relations list.
- Stations mapped only as areas (closed ways with `railway=station`) become a node at the
  ring's mean point with the negative way id (OSM node ids are positive, so they never clash).

Tags are cut down to the keys the builder reads (`KEEP_*`), coordinates to 7 decimals. Standard
library only, apart from pyosmium for reading the PBF. © OpenStreetMap contributors (ODbL 1.0).
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
GODOT = HERE.parent.parent
PBF = GODOT / "data" / "raw" / "world.osm.pbf"
MANIFEST = GODOT / "data" / "MANIFEST.json"
TARGET = GODOT / "data" / "rail" / "regional-rail.osm.json.gz"

ROUTES = ("train", "subway", "light_rail")
TRACKS = ("rail", "subway", "light_rail")
KEEP_WAY = ("railway", "service", "usage", "bridge", "tunnel", "layer", "name", "level")
KEEP_NODE = ("railway", "name", "name:ta", "name:hi", "station", "network", "public_transport", "subway", "train", "light_rail")
KEEP_RELATION = ("route", "name", "ref", "from", "to", "network", "state", "colour")


def under_construction(tags: dict[str, str]) -> bool:
    name = tags.get("name", "")
    return tags.get("state") in ("construction", "proposed") or "(u/c)" in name or "under construction" in name.lower()


def keep(tags: dict[str, str], keys: tuple[str, ...]) -> dict[str, str]:
    return {k: tags[k] for k in keys if k in tags}


def is_station(tags: dict[str, str]) -> bool:
    if tags.get("railway") in ("station", "halt"):
        return True
    return tags.get("public_transport") == "station" and any(tags.get(k) == "yes" for k in ("train", "subway", "light_rail"))


def assemble(nodes: dict[int, tuple[float, float, dict[str, str]]], ways: dict[int, tuple[list[int], dict[str, str]]],
             relations: dict[int, tuple[list[tuple[str, int, str]], dict[str, str]]], timestamp: str) -> dict[str, Any]:
    """The Overpass-style document from what the reader collected (pure; tested)."""
    kept_relations = {rid: r for rid, r in relations.items() if r[1].get("route") in ROUTES and not under_construction(r[1])}
    way_ids: set[int] = set()
    for wid, (_, tags) in ways.items():
        if tags.get("railway") in TRACKS:
            way_ids.add(wid)
    member_nodes: set[int] = set()
    for members, _ in kept_relations.values():
        for kind, ref, _role in members:
            if kind == "w" and ref in ways:
                way_ids.add(ref)
            elif kind == "n":
                member_nodes.add(ref)
    node_ids: set[int] = set(member_nodes)
    for wid in way_ids:
        node_ids.update(ways[wid][0])
    for nid, (_, _, tags) in nodes.items():
        if is_station(tags) or tags.get("railway") == "level_crossing":
            node_ids.add(nid)
    elements: list[dict[str, Any]] = []
    for nid in sorted(node_ids):
        if nid not in nodes:
            continue
        lat, lon, tags = nodes[nid]
        e: dict[str, Any] = {"type": "node", "id": nid, "lat": round(lat, 7), "lon": round(lon, 7)}
        t = keep(tags, KEEP_NODE)
        if t:
            e["tags"] = t
        elements.append(e)
    # Stations mapped as areas only: a node at the ring's mean point (negative way id).
    station_nodes = [(nodes[n][0], nodes[n][1]) for n in nodes if is_station(nodes[n][2])]
    for wid, (refs, tags) in sorted(ways.items()):
        if not is_station(tags) or len(refs) < 4 or refs[0] != refs[-1]:
            continue
        ring = [nodes[n] for n in refs[:-1] if n in nodes]
        if not ring:
            continue
        lat = sum(p[0] for p in ring) / len(ring)
        lon = sum(p[1] for p in ring) / len(ring)
        # A node of the same station already mapped inside (about 150 m): keep that one.
        if any(abs(a - lat) < 0.0014 and abs(b - lon) < 0.0014 for a, b in station_nodes):
            continue
        elements.append({"type": "node", "id": -wid, "lat": round(lat, 7), "lon": round(lon, 7), "tags": keep(tags, KEEP_NODE)})
    for wid in sorted(way_ids):
        refs, tags = ways[wid]
        e = {"type": "way", "id": wid, "nodes": [n for n in refs if n in nodes]}
        t = keep(tags, KEEP_WAY)
        if t:
            e["tags"] = t
        elements.append(e)
    for rid in sorted(kept_relations):
        members, tags = kept_relations[rid]
        elements.append({"type": "relation", "id": rid, "tags": keep(tags, KEEP_RELATION),
                         "members": [{"type": {"n": "node", "w": "way", "r": "relation"}[k], "ref": ref, "role": role} for k, ref, role in members]})
    return {"version": 0.6, "generator": "godot-chennai/tools/rail/extract_rail.py",
            "osm3s": {"timestamp_osm_base": timestamp, "copyright": "© OpenStreetMap contributors (ODbL 1.0)"},
            "elements": elements}


def read_pbf(path: Path) -> tuple[dict[int, tuple[float, float, dict[str, str]]], dict[int, tuple[list[int], dict[str, str]]], dict[int, tuple[list[tuple[str, int, str]], dict[str, str]]]]:
    import osmium  # only here: the committed file is read without it

    relations: dict[int, tuple[list[tuple[str, int, str]], dict[str, str]]] = {}
    ways: dict[int, tuple[list[int], dict[str, str]]] = {}

    class Pass1(osmium.SimpleHandler):
        def relation(self, r: Any) -> None:
            if r.tags.get("route") in ROUTES:
                relations[r.id] = ([(m.type, m.ref, m.role) for m in r.members], dict(r.tags))

    Pass1().apply_file(str(path))
    wanted_ways = {ref for members, _ in relations.values() for k, ref, _ in members if k == "w"}

    class Pass2(osmium.SimpleHandler):
        def way(self, w: Any) -> None:
            tags = dict(w.tags)
            if w.id in wanted_ways or tags.get("railway") in TRACKS or is_station(tags):
                ways[w.id] = ([n.ref for n in w.nodes], tags)

    Pass2().apply_file(str(path))
    wanted_nodes = {n for refs, _ in ways.values() for n in refs} | {ref for members, _ in relations.values() for k, ref, _ in members if k == "n"}
    nodes: dict[int, tuple[float, float, dict[str, str]]] = {}

    class Pass3(osmium.SimpleHandler):
        def node(self, n: Any) -> None:
            tags = dict(n.tags)
            if n.id in wanted_nodes or is_station(tags) or tags.get("railway") == "level_crossing":
                if n.location.valid():
                    nodes[n.id] = (n.location.lat, n.location.lon, tags)

    Pass3().apply_file(str(path))
    return nodes, ways, relations


def timestamp() -> str:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return str(data["datasets"][0].get("osmDataTimestamp", "unknown"))


def load(path: Path = TARGET) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def write(doc: dict[str, Any], path: Path = TARGET) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    # mtime 0: the same data gives the same bytes.
    with open(path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, filename="") as f:
        f.write(text.encode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--stats", action="store_true", help="print what the committed file holds")
    parser.add_argument("--pbf", type=Path, default=PBF)
    args = parser.parse_args()
    if args.stats:
        doc = load()
    else:
        if not args.pbf.exists():
            print(f"{args.pbf} is missing: build it with tools/geo (data/MANIFEST.json)", file=sys.stderr)
            return 1
        doc = assemble(*read_pbf(args.pbf), timestamp())
        write(doc)
    kinds: dict[str, int] = {}
    for e in doc["elements"]:
        kinds[e["type"]] = kinds.get(e["type"], 0) + 1
    print(f"{TARGET}: {kinds}, {TARGET.stat().st_size // 1024} KB, OSM data {doc['osm3s']['timestamp_osm_base']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
