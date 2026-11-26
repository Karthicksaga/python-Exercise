#!/usr/bin/env python3
"""Development-time OpenStreetMap Overpass extractor for Chennai Metro & Tamil road tags.
Writes read-only sidecar files into `res://data/geo/` without touching `res://world/`.
"""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

ORIGIN_LAT = 13.085
ORIGIN_LNG = 80.2101
EARTH_RADIUS = 6371008.8
DEG = math.pi / 180.0
COS_LAT = math.cos(ORIGIN_LAT * DEG)

# Greater Chennai bounding box (south, west, north, east)
BBOX = "12.75,79.95,13.30,80.35"
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT / "data" / "geo"


def to_world_xz(lat: float, lng: float) -> tuple[float, float]:
    x = (lng - ORIGIN_LNG) * DEG * EARTH_RADIUS * COS_LAT
    z = (ORIGIN_LAT - lat) * DEG * EARTH_RADIUS
    return round(x, 2), round(z, 2)


def query_overpass(ql: str) -> dict:
    data = urllib.parse.urlencode({"data": ql}).encode("utf-8")
    last_err: Exception | None = None
    for url in OVERPASS_URLS:
        for _attempt in range(2):
            try:
                req = urllib.request.Request(
                    url,
                    data=data,
                    headers={"User-Agent": "ChennaiOpenWorld-DevExtractor/1.0"},
                )
                with urllib.request.urlopen(req, timeout=90) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as exc:
                last_err = exc
    raise RuntimeError(f"All Overpass mirrors failed: {last_err}")


def fetch_metro() -> dict:
    ql = f"""
    [out:json][timeout:60];
    (
      way["railway"="subway"]({BBOX});
      node["railway"="station"]["station"="subway"]({BBOX});
      node["railway"="station"]["subway"="yes"]({BBOX});
      node["station"="subway"]({BBOX});
    );
    out body;
    >;
    out skel qt;
    """
    raw = query_overpass(ql)
    nodes: dict[int, tuple[float, float]] = {}
    stations_map: dict[str, dict] = {}
    tracks: list[dict] = []

    for el in raw.get("elements", []):
        if el.get("type") == "node":
            nodes[el["id"]] = (el["lat"], el["lon"])
            tags = el.get("tags") or {}
            is_station = (
                tags.get("station") == "subway"
                or tags.get("subway") == "yes"
                or tags.get("railway") == "station"
            )
            nm = (tags.get("name:en") or tags.get("name") or "").strip()
            if is_station and nm:
                x, z = to_world_xz(el["lat"], el["lon"])
                key = nm.lower()
                if key not in stations_map:
                    stations_map[key] = {
                        "osm_id": el["id"],
                        "name": nm,
                        "name_ta": (tags.get("name:ta") or "").strip(),
                        "line": (tags.get("line") or tags.get("colour") or "metro").strip(),
                        "x": x,
                        "z": z,
                    }

    for el in raw.get("elements", []):
        if el.get("type") == "way":
            tags = el.get("tags") or {}
            if tags.get("railway") != "subway":
                continue
            pts = []
            for nid in el.get("nodes", []):
                if nid in nodes:
                    x, z = to_world_xz(*nodes[nid])
                    pts.append([x, z])
            if len(pts) >= 2:
                tracks.append({
                    "osm_id": el["id"],
                    "name": (tags.get("name") or "").strip(),
                    "colour": (tags.get("colour") or "").strip(),
                    "points": pts,
                })

    return {
        "attribution": "© OpenStreetMap contributors (ODbL 1.0)",
        "tracks": tracks,
        "stations": sorted(stations_map.values(), key=lambda s: s["name"]),
    }


def fetch_road_tags_ta() -> dict:
    ql = f"""
    [out:json][timeout:60];
    (
      way["highway"]["name"]["name:ta"]({BBOX});
      way["highway"]["name"]["official_name"]({BBOX});
      way["highway"]["name"]["alt_name"]({BBOX});
    );
    out tags;
    """
    raw = query_overpass(ql)
    roads: dict[str, dict] = {}
    for el in raw.get("elements", []):
        tags = el.get("tags") or {}
        name = (tags.get("name:en") or tags.get("name") or "").strip()
        if not name:
            continue
        ta = (tags.get("name:ta") or "").strip()
        off = (tags.get("official_name") or "").strip()
        alt = (tags.get("alt_name") or "").strip()
        if not (ta or off or alt):
            continue
        entry = roads.setdefault(name, {})
        if ta and "ta" not in entry:
            entry["ta"] = ta
        if off and "official" not in entry:
            entry["official"] = off
        if alt and "alt" not in entry:
            entry["alt"] = alt
    return {
        "attribution": "© OpenStreetMap contributors (ODbL 1.0)",
        "roads": roads,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    metro = fetch_metro()
    metro_path = OUT_DIR / "metro.json"
    metro_path.write_text(json.dumps(metro, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {metro_path}: {len(metro['tracks'])} metro tracks, {len(metro['stations'])} metro stations")

    road_tags = fetch_road_tags_ta()
    tags_path = OUT_DIR / "road_tags_ta.json"
    tags_path.write_text(json.dumps(road_tags, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {tags_path}: {len(road_tags['roads'])} roads with Tamil/official/alt OSM tags")


if __name__ == "__main__":
    main()
