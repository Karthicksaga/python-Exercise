#!/usr/bin/env python3
"""Map the 100 generated Chennai building archetypes across all 391,283 OSM buildings
using locality/landuse context, footprint geometry, height/floors, and protection rules.

Produces:
  - data/chennai_building_mapping.json       (complete 391,283-building mapping dataset)
  - data/chennai_building_mapping.geojson    (GeoJSON visualization layer across all 47 tiles)
  - data/building_replacement_manifest.json  (per-asset replacement manifest & gap counts)
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "geo"))
from chennai_geo import codec_v2
from chennai_geo.binio import Reader
from chennai_geo.projection import PROJECTION

WORLD_DIR = Path("godot-chennai/world")
ASSETS_INDEX = Path("godot-chennai/assets/world/index.json")
CATALOG_PATH = Path("godot-chennai/assets/buildings/pack_100/catalog.json")
PROTECTED_PATH = Path("godot-chennai/data/protected_buildings.json")
LANDMARKS_DIR = Path("godot-chennai/assets/landmarks")

OUT_MAPPING_JSON = Path("godot-chennai/data/chennai_building_mapping.json")
OUT_MAPPING_GEOJSON = Path("godot-chennai/data/chennai_building_mapping.geojson")
OUT_MANIFEST_JSON = Path("godot-chennai/data/building_replacement_manifest.json")
OUT_EXPLORER_SUMMARY = Path("/Users/kjayap419@apac.comcast.com/.gemini/antigravity/brain/1cfe8660-abdc-40ec-849a-46e64950a0cb/scratch/explorer_map_summary.json")

NORTH_LOCALITIES = {
    "George Town", "Parrys Corner", "Royapuram", "Washermanpet", "Kasimedu",
    "Tondiarpet", "Flower Bazaar", "Sowcarpet", "Chintadripet", "Perambur",
    "Vyasarpadi", "Mint", "Korukkupet",
}
COASTAL_LOCALITIES = {
    "Marina", "Besant Nagar", "Thiruvanmiyur", "Santhome", "Elliot's Beach",
    "Valmiki Nagar", "Neelankarai", "Palavakkam", "Kottivakkam", "Foreshore Estate",
    "Triplicane", "Royapuram", "Kasimedu",
}
INDUSTRIAL_LOCALITIES = {
    "Ambattur", "Guindy", "Manali", "Vikram Sarabhai Industrial Estate",
    "Korattur", "Madhavaram", "Ennore", "Sidco", "Padi",
}
TRADITIONAL_LOCALITIES = {
    "Mylapore", "Triplicane", "George Town", "Royapuram", "West Mambalam",
    "Chintadripet", "Mandaveli", "Royapettah", "Washermanpet",
}
COMMERCIAL_LOCALITIES = {
    "T. Nagar", "Nungambakkam", "Teynampet", "Parrys Corner", "Flower Bazaar",
    "George Town", "Anna Salai", "Thousand Lights", "Koyambedu", "Vadapalani",
}


def point_in_poly(x: float, z: float, poly: Sequence[Sequence[float]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, zi = poly[i][0], poly[i][1]
        xj, zj = poly[j][0], poly[j][1]
        if ((zi > z) != (zj > z)) and (x < (xj - xi) * (z - zi) / ((zj - zi) + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def load_landmark_exclusions() -> Tuple[set[str], List[Tuple[str, Tuple[float, float, float, float], List[List[List[float]]]]]]:
    prot = json.loads(PROTECTED_PATH.read_text(encoding="utf-8"))
    osm_ids: set[str] = set()
    polys: List[Tuple[str, Tuple[float, float, float, float], List[List[List[float]]]]] = []
    for item in prot["protected_buildings"]:
        for oid in item.get("excluded_osm_ids", []):
            osm_ids.add(oid)
        if not item.get("overlay_only", False):
            for oid in item.get("osm_ids", []):
                osm_ids.add(oid)
        spec_p = LANDMARKS_DIR / item["id"] / "spec.json"
        if not spec_p.exists():
            continue
        sp = json.loads(spec_p.read_text(encoding="utf-8"))
        excl_keys = sp.get("osm", {}).get("exclude", [])
        parts = sp.get("osm", {}).get("parts", {})
        rings = []
        for k in excl_keys:
            ring = parts.get(k, {}).get("footprint")
            if ring:
                rings.append(ring)
        if rings:
            xs = [pt[0] for r in rings for pt in r]
            zs = [pt[1] for r in rings for pt in r]
            polys.append((item["id"], (min(xs), max(xs), min(zs), max(zs)), rings))
    return osm_ids, polys


def infer_zone(kind: str, use: str, locality: str, tile_areas: List[Tuple[str, Tuple[float, float, float, float]]], mx: float, mz: float) -> str:
    # Check landuse polygon containment
    for akind, (ax0, ax1, az0, az1) in tile_areas:
        if ax0 <= mx <= ax1 and az0 <= mz <= az1:
            if akind in ("industrial", "saltpan", "aerodrome"):
                return "Industrial"
            if akind == "commercial":
                return "Commercial"
            if akind == "beach":
                return "Coastal"
    if use in ("industrial", "warehouse", "hangar"):
        return "Industrial"
    if use in ("commercial", "retail", "office") or kind == "commercial":
        return "Commercial"
    if use in ("school", "hospital", "public", "transport"):
        return "Institutional"
    if locality in INDUSTRIAL_LOCALITIES:
        return "Industrial"
    if locality in NORTH_LOCALITIES:
        return "North Chennai"
    if locality in COASTAL_LOCALITIES and mx >= 6200:
        return "Coastal"
    if locality in COMMERCIAL_LOCALITIES:
        return "Mixed-Use"
    return "Residential"


def match_building(
    kind: str,
    use: str,
    floors: int,
    h: float,
    short_s: float,
    long_s: float,
    zone: str,
    locality: str,
    models: List[dict],
) -> Tuple[dict | None, float, str]:
    area = short_s * long_s
    if area < 14.0 or use in ("roof", "shed", "garage", "hut", "construction") or long_s > 125.0 or floors > 20:
        return None, 0.0, "minor_or_oversized_gap"

    best_m = None
    best_score = 0.0

    for m in models:
        mw = min(m["dimensions_m"]["width"], m["dimensions_m"]["depth"])
        md = max(m["dimensions_m"]["width"], m["dimensions_m"]["depth"])
        m_cat = m["category"]

        # Hard style-compatibility guards (prevent unrealistic mismatches)
        if m_cat == "industrial" and zone != "Industrial" and use not in ("industrial", "warehouse", "hangar", "water_tower"):
            continue
        if m["id"] in ("B31_temple_hall", "B32_church_gothic", "B33_mosque_urban", "B34_colonial_heritage", "B35_museum_heritage", "B37_rotunda_historic", "B39_market_heritage", "B40_public_library"):
            # Do not randomly place hero religious/historic monuments on ordinary houses/shops
            if use not in ("public", "other") and not (kind == "commercial" and area > 400):
                continue
        if m_cat == "coastal" and zone != "Coastal" and locality not in COASTAL_LOCALITIES:
            continue
        if m_cat == "north_chennai" and zone != "North Chennai" and locality not in NORTH_LOCALITIES and zone != "Residential":
            continue
        if kind == "house" and m_cat in ("commercial", "institutional") and not m["shop_ground"]:
            continue
        if kind == "apartments" and m["floors"] == 1 and m_cat == "residential":
            continue
        if m["id"].startswith("CHN_001") and zone == "Industrial":
            continue

        # Scale envelope check
        rw = short_s / max(1.0, mw)
        rd = long_s / max(1.0, md)
        if not (0.50 <= rw <= 1.95 and 0.50 <= rd <= 1.95):
            continue

        size_score = max(0.0, 1.0 - 0.65 * (abs(math.log(rw)) + abs(math.log(rd))))
        floor_diff = abs(floors - m["floors"])
        if floor_diff > 4:
            continue
        floor_score = max(0.0, 1.0 - 0.22 * floor_diff)

        # Category & use alignment
        cat_score = 0.35
        if kind == "house":
            if m_cat == "residential" and m["floors"] <= 3:
                cat_score = 1.0
            elif m_cat in ("north_chennai", "coastal") and m["floors"] <= 3:
                cat_score = 0.90
            elif m_cat == "mixed_use" and m["floors"] <= 3:
                cat_score = 0.72
            elif m_cat == "heritage" and "house" in m["id"]:
                cat_score = 0.95
        elif kind == "apartments":
            if "apt" in m["id"] or "block" in m["id"] or "highrise" in m["id"] or "tnhb" in m["id"] or "tenement" in m["id"]:
                cat_score = 1.0
            elif m_cat in ("residential", "mixed_use") and m["floors"] >= 3:
                cat_score = 0.78
        elif kind == "commercial":
            if use in ("industrial", "warehouse", "hangar") and m_cat == "industrial":
                cat_score = 1.0
            elif use in ("school", "hospital", "public", "transport") and m_cat == "institutional":
                cat_score = 1.0
            elif m_cat in ("commercial", "mixed_use"):
                cat_score = 0.95
            elif m_cat == "industrial" and zone == "Industrial":
                cat_score = 0.90

        loc_bonus = 0.0
        if locality in m["preferred_localities"]:
            loc_bonus = 0.16
        elif zone == "North Chennai" and m_cat == "north_chennai":
            loc_bonus = 0.12
        elif zone == "Coastal" and m_cat == "coastal":
            loc_bonus = 0.12
        elif locality in TRADITIONAL_LOCALITIES and m["substyle"] in ("agraharam", "mylapore_trad", "courtyard_old", "chettinad", "madras_terrace", "verandah", "traditional_house"):
            loc_bonus = 0.10
        elif locality not in TRADITIONAL_LOCALITIES and m["substyle"] in ("agraharam", "mylapore_trad", "chettinad"):
            loc_bonus = -0.10

        score = 0.40 * size_score + 0.25 * floor_score + 0.25 * cat_score + loc_bonus
        if score > best_score:
            best_score = score
            best_m = m

    if best_m is None or best_score < 0.56:
        return None, round(best_score, 3), "no_style_or_scale_match"
    return best_m, round(min(1.0, best_score), 3), "matched"


def main() -> None:
    wjson = json.loads((WORLD_DIR / "world.json").read_text(encoding="utf-8"))
    idx = json.loads(ASSETS_INDEX.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    models = catalog["models"]
    protected_json = json.loads(PROTECTED_PATH.read_text(encoding="utf-8"))

    districts = idx.get("districts", [])
    grid = wjson["grid"]
    gx, gz = float(grid["minX"]), float(grid["minZ"])
    cs = float(wjson["chunkSize"])
    prot_osm_ids, lm_polys = load_landmark_exclusions()

    def nearest_locality(x: float, z: float) -> str:
        best_d = 1e18
        best_n = "Outer Suburbs"
        for d in districts:
            dd = (x - d["x"]) ** 2 + (z - d["z"]) ** 2
            if dd < best_d:
                best_d = dd
                best_n = d["name"]
        return best_n if best_d <= 2500.0 ** 2 else "Outer Suburbs"

    def is_protected(src_id: int, mx: float, mz: float, use: str) -> Tuple[bool, str]:
        wkey = f"way/{src_id}"
        rkey = f"relation/{src_id}"
        if wkey in prot_osm_ids or rkey in prot_osm_ids:
            return True, "landmark_osm_id"
        for lid, (x0, x1, z0, z1), rings in lm_polys:
            if x0 <= mx <= x1 and z0 <= mz <= z1:
                for ring in rings:
                    if point_in_poly(mx, mz, ring):
                        return True, f"inside_landmark:{lid}"
        if use in ("religious", "historic"):
            return True, f"protected_osm_use:{use}"
        return False, "eligible"

    # Pre-group models by coarse kind to keep O(391k * ~25) super fast (<12s)!
    models_by_bucket: Dict[str, List[dict]] = {
        "house": [m for m in models if m["category"] in ("residential", "mixed_use", "north_chennai", "coastal", "heritage") and m["floors"] <= 4],
        "apartments": [m for m in models if ("apt" in m["id"] or "block" in m["id"] or "highrise" in m["id"] or "tenement" in m["id"] or "tnhb" in m["id"] or "beach_apartment" in m["id"] or "canal_mixed_row" in m["id"] or m["floors"] >= 3)],
        "commercial": [m for m in models if m["category"] in ("commercial", "mixed_use", "industrial", "institutional", "north_chennai", "coastal", "heritage")],
    }

    total = 0
    counts = Counter()
    by_asset = Counter()
    by_locality = defaultdict(lambda: Counter())
    by_zone = defaultdict(lambda: Counter())
    gap_reasons = Counter()
    mapping_rows: List[list] = []
    geojson_features: List[dict] = []

    # Add the 8 protected landmarks first to GeoJSON
    for item in protected_json["protected_buildings"]:
        geojson_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [item["coordinates_latlng"][1], item["coordinates_latlng"][0]]},
            "properties": {
                "osm_id": ",".join(item["osm_ids"]),
                "project_id": item["id"],
                "name": item["name"],
                "selected_asset_id": item["id"],
                "locality": item["name"],
                "category": item["kind"],
                "protected_status": "protected",
                "integration_status": "locked_preserved",
                "score": 1.0,
            },
        })

    tiles_dir = WORLD_DIR / "tiles"
    for tile_dir in sorted(tiles_dir.iterdir()):
        # Read tile areas.bin for landuse bboxes
        tile_areas: List[Tuple[str, Tuple[float, float, float, float]]] = []
        areas_p = tile_dir / "areas.bin"
        if areas_p.exists():
            for a in codec_v2.decode_areas(areas_p.read_bytes()):
                if a.kind in ("industrial", "commercial", "beach", "saltpan", "aerodrome") and a.outline:
                    xs = [p[0] for p in a.outline]
                    zs = [p[1] for p in a.outline]
                    tile_areas.append((a.kind, (min(xs), max(xs), min(zs), max(zs))))

        pack = (tile_dir / "chunks.bin").read_bytes()
        pr = Reader(pack)
        pr.u32(); pr.u16(); pr.i16(); pr.i16()
        n = pr.u32()
        blobs = []
        for _ in range(n):
            c, rw, off, ln = pr.i16(), pr.i16(), pr.u32(), pr.u32()
            if ln > 0:
                blobs.append((c, rw, off, ln))

        for c, rw, off, ln in blobs:
            cr = Reader(pack[off:off + ln])
            if cr.u32() != codec_v2.CHUNK_MAGIC:
                continue
            cr.u16(); cc = cr.i16(); crr = cr.i16()
            ring = cr.u8(); cr.u8()
            cx = gx + (cc + 0.5) * cs
            cz = gz + (crr + 0.5) * cs
            nb, nt, na, ns = cr.u16(), cr.u16(), cr.u16(), cr.u16()
            for _ in range(nb):
                bid = cr.u32()
                ds = cr.u8(); src_id = cr.u64()
                for _ in range(cr.u8()):
                    cr.u8(); cr.u64()
                h = cr.u16() / 10.0; mh = cr.u16() / 10.0
                floors = cr.u8()
                kind = codec_v2.BUILDING_KINDS[cr.u8()]
                hf = codec_v2.HEIGHT_FROM[cr.u8()]
                use = codec_v2.BUILDING_USES[cr.u8()]
                cr.u8(); cr.u8(); cr.u8(); cr.u8(); cr.u8()
                rcount = cr.u8()
                pts = []
                for k in range(rcount):
                    np_ = cr.u16()
                    cur = [(cx + cr.i16() / 20.0, cz + cr.i16() / 20.0) for _ in range(np_)]
                    if k == 0:
                        pts = cur
                if not pts:
                    continue

                total += 1
                xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
                w = max(xs) - min(xs); d = max(zs) - min(zs)
                short_s, long_s = round(min(w, d), 2), round(max(w, d), 2)
                mx = sum(xs) / len(xs); mz = sum(zs) / len(zs)
                ll = PROJECTION.to_latlng(mx, mz)
                lat_r, lng_r = round(ll.lat, 6), round(ll.lng, 6)
                locality = nearest_locality(mx, mz)
                zone = infer_zone(kind, use, locality, tile_areas, mx, mz)

                prot, prot_reason = is_protected(src_id, mx, mz, use)
                if prot or mh > 0.0:
                    prot_status = "protected" if prot else "uncertain"
                    integ_status = "excluded_protected" if prot else "retain_procedural"
                    counts[integ_status] += 1
                    by_locality[locality][integ_status] += 1
                    by_zone[zone][integ_status] += 1
                    mapping_rows.append([
                        src_id, bid, None, lat_r, lng_r, locality, zone,
                        f"{kind}:{use}", [short_s, long_s, round(h, 1), floors], None,
                        1.0 if prot else 0.0, prot_status, integ_status,
                    ])
                    continue

                # Force pilot prototype match for sample way/354245383 if desired or match naturally
                cand_pool = models_by_bucket.get(kind, models_by_bucket["house"])
                m, score, status = match_building(kind, use, floors, h, short_s, long_s, zone, locality, cand_pool)
                if m is not None:
                    counts["matched"] += 1
                    by_asset[m["id"]] += 1
                    by_locality[locality]["matched"] += 1
                    by_zone[zone]["matched"] += 1
                    m_dims = [m["dimensions_m"]["width"], m["dimensions_m"]["depth"], m["dimensions_m"]["height"], m["floors"]]
                    mapping_rows.append([
                        src_id, bid, m["id"], lat_r, lng_r, locality, zone,
                        f"{kind}:{use}", [short_s, long_s, round(h, 1), floors], m_dims,
                        score, "replaceable", "proposed_glb_swap",
                    ])
                    # Include special archetypes + 1-in-60 stratified residential sample in GeoJSON for snappy map viewing
                    if (kind != "house" or (total % 60 == 0)) and len(geojson_features) < 16000:
                        geojson_features.append({
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [lng_r, lat_r]},
                            "properties": {
                                "osm_id": f"way/{src_id}",
                                "project_id": bid,
                                "selected_asset_id": m["id"],
                                "locality": locality,
                                "zone": zone,
                                "category": f"{kind}:{use}",
                                "footprint_m": f"{short_s}x{long_s}m ({floors}F)",
                                "model_m": f"{m['dimensions_m']['width']}x{m['dimensions_m']['depth']}m ({m['floors']}F)",
                                "score": score,
                                "protected_status": "replaceable",
                                "integration_status": "proposed_glb_swap",
                            },
                        })
                else:
                    counts["retain_procedural"] += 1
                    gap_reasons[status] += 1
                    by_locality[locality]["retain_procedural"] += 1
                    by_zone[zone]["retain_procedural"] += 1
                    mapping_rows.append([
                        src_id, bid, None, lat_r, lng_r, locality, zone,
                        f"{kind}:{use}", [short_s, long_s, round(h, 1), floors], None,
                        score, "replaceable", "retain_procedural",
                    ])
                    if total % 120 == 0 and len(geojson_features) < 16000:
                        geojson_features.append({
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [lng_r, lat_r]},
                            "properties": {
                                "osm_id": f"way/{src_id}",
                                "project_id": bid,
                                "selected_asset_id": None,
                                "locality": locality,
                                "zone": zone,
                                "category": f"{kind}:{use}",
                                "footprint_m": f"{short_s}x{long_s}m ({floors}F)",
                                "score": score,
                                "protected_status": "replaceable",
                                "integration_status": "retain_procedural",
                            },
                        })

    summary = {
        "total_osm_buildings": total,
        "matched_for_replacement": counts["matched"],
        "retained_procedural": counts["retain_procedural"],
        "excluded_protected": counts["excluded_protected"],
        "match_rate_pct": round(100.0 * counts["matched"] / max(1, total), 2),
        "gap_reasons": dict(gap_reasons),
        "zone_breakdown": {z: dict(c) for z, c in sorted(by_zone.items())},
        "top_localities": sorted(
            [{"locality": k, **dict(v)} for k, v in by_locality.items()],
            key=lambda x: x.get("matched", 0) + x.get("retain_procedural", 0),
            reverse=True,
        )[:40],
        "archetype_usage": dict(by_asset.most_common()),
        "unused_archetypes": [m["id"] for m in models if by_asset[m["id"]] == 0],
    }

    # Compact columnar schema for all 391,283 records so full mapping fits cleanly in one JSON
    full_doc = {
        "schema": {
            "columns": [
                "osm_id", "project_building_id", "selected_asset_id",
                "lat", "lng", "locality", "zone", "building_category",
                "footprint_dims_whf", "model_dims_whf",
                "matching_score", "protected_status", "integration_status",
            ],
            "note": "Compact row tuples for all 391,283 OSM buildings; coords in WGS84 [lat, lng], dims in [short_m, long_m, height_m, floors].",
        },
        "summary": summary,
        "mappings": mapping_rows,
    }
    OUT_MAPPING_JSON.write_text(json.dumps(full_doc, separators=(",", ":")), encoding="utf-8")

    geojson_doc = {
        "type": "FeatureCollection",
        "metadata": {
            "description": "Geographic visualization layer across Chennai (all 8 protected landmarks + non-house matched buildings + stratified residential & gap points across 47 tiles).",
            "total_city_buildings": total,
            "features_in_geojson": len(geojson_features),
        },
        "features": geojson_features,
    }
    OUT_MAPPING_GEOJSON.write_text(json.dumps(geojson_doc), encoding="utf-8")

    manifest_doc = {
        "version": 1,
        "status": "proposed_awaiting_approval",
        "protected_landmarks_locked": len(protected_json["protected_buildings"]),
        "total_osm_buildings": total,
        "matched_for_replacement": counts["matched"],
        "retained_procedural": counts["retain_procedural"],
        "excluded_protected": counts["excluded_protected"],
        "pilot_cell": "Anna Nagar (0..500, -500..0), sample way/354245383",
        "assets": [
            {
                "asset_id": m["id"],
                "title": m["title"],
                "source_card": m["source_card"],
                "glb_path": m["glb_path"],
                "atlas": m["atlas"],
                "category": m["category"],
                "assigned_instances": by_asset[m["id"]],
                "dimensions_m": m["dimensions_m"],
                "lod0_tris": m["lod_stats"]["LOD0"]["tris"],
                "lod1_tris": m["lod_stats"]["LOD1"]["tris"],
                "lod2_tris": m["lod_stats"]["LOD2"]["tris"],
            }
            for m in models
        ],
    }
    OUT_MANIFEST_JSON.write_text(json.dumps(manifest_doc, indent=2), encoding="utf-8")

    # Compact summary + map scatter points (~2,200 points) for chat visualization widget
    scatter_pts = []
    for f in geojson_features:
        if len(scatter_pts) >= 2400:
            break
        lng, lat = f["geometry"]["coordinates"]
        x, z = PROJECTION.to_local(lat, lng)
        p = f["properties"]
        scatter_pts.append([round(x), round(z), p.get("integration_status", ""), p.get("zone", p.get("category", "")), p.get("selected_asset_id") or p.get("name", "")])

    OUT_EXPLORER_SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    OUT_EXPLORER_SUMMARY.write_text(json.dumps({"summary": summary, "scatter": scatter_pts}), encoding="utf-8")
    print(json.dumps({
        "total": total,
        "matched": counts["matched"],
        "retained": counts["retain_procedural"],
        "protected": counts["excluded_protected"],
        "match_rate_pct": summary["match_rate_pct"],
        "unused_archetypes": summary["unused_archetypes"],
        "mapping_json_mb": round(OUT_MAPPING_JSON.stat().st_size / 1e6, 2),
        "geojson_mb": round(OUT_MAPPING_GEOJSON.stat().st_size / 1e6, 2),
    }, indent=2))


if __name__ == "__main__":
    main()
