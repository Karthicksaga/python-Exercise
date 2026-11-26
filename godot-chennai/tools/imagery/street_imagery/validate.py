"""Validators for the data files under `assets/street_ref/`: the source manifest, the hand-reviewed
observation files and the facade categories. They return a list of problems (empty = valid).

The rules that keep the workflow honest (docs/street-imagery.md section 4):
- every image the data cites is listed in the manifest with provider, licence and attribution;
- the manifest lists only Mapillary and KartaView images, never Google, and never a link to an
  image file (no photograph, thumbnail or tile is referenced for download);
- a value marked `observed` names its source images (or a human inspection); a value marked
  `estimated` says it comes from general knowledge, not imagery;
- no image file may sit under `assets/street_ref/`.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3] / "assets" / "street_ref"
PROVIDERS = ("mapillary", "kartaview")
LICENCES = ("CC-BY-SA-4.0", "CC-BY-4.0", "CC0-1.0")  # what a manifest row may carry; the API's own value is kept in the tools' database
LICENCE_SOURCES = ("api_field", "provider_terms")
STATUSES = ("observed", "estimated")
CATEGORIES = ("residential_house", "independent_house", "apartment", "commercial", "retail_shop", "office", "institutional")
FACADE_FIELDS = ("palette", "floors", "windows", "balconies", "gates", "shutters", "signboard_slots", "roofs")
OBSERVATION_FIELDS = ("wall_colour", "accent_colour", "floors", "shop_type", "roof_type", "roof_colour", "wall_style", "gate_style", "shutter_style",
                      "balcony_style", "window_style", "signboard_slots", "compound_wall", "sunshade", "water_tank")
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
IMAGE_URL = re.compile(r"\.(jpe?g|png|webp|gif|tiff?|bmp|heic)(\?|$)|fbcdn|/thumb|scontent|tiles?\.mapillary|\bgoogle", re.I)
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".bmp", ".heic", ".avif"}
ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _walk_strings(v: Any) -> list[str]:
    if isinstance(v, str):
        return [v]
    if isinstance(v, dict):
        return [s for x in v.values() for s in _walk_strings(x)]
    if isinstance(v, list):
        return [s for x in v for s in _walk_strings(x)]
    return []


def _no_image_urls(doc: Any, where: str) -> list[str]:
    return [f"{where}: '{s[:80]}' looks like a link to an image or to Google; reference imagery by provider + id only"
            for s in _walk_strings(doc) if s.startswith(("http://", "https://")) and IMAGE_URL.search(s)]


def manifest_ids(manifest: dict[str, Any]) -> set[tuple[str, str]]:
    return {(str(i.get("provider")), str(i.get("id"))) for i in manifest.get("images", []) if isinstance(i, dict)}


def validate_manifest(m: Any) -> list[str]:
    p: list[str] = []
    if not isinstance(m, dict) or m.get("format") != 1:
        return ["manifest: must be an object with format 1"]
    images = m.get("images")
    if not isinstance(images, list):
        return ["manifest: 'images' must be a list"]
    seen: set[tuple[str, str]] = set()
    for n, im in enumerate(images):
        w = f"manifest.images[{n}]"
        if not isinstance(im, dict):
            p.append(f"{w}: not an object")
            continue
        prov, iid = im.get("provider"), im.get("id")
        if prov not in PROVIDERS:
            p.append(f"{w}: provider {prov!r} must be one of {PROVIDERS} (never Google or any other)")
        if not isinstance(iid, str) or not ID_PATTERN.match(iid):
            p.append(f"{w}: id must be a string of letters, digits, _ or -")
        elif (prov, iid) in seen:
            p.append(f"{w}: duplicate {prov}:{iid}")
        else:
            seen.add((str(prov), iid))
        if im.get("license") not in LICENCES:
            p.append(f"{w}: license {im.get('license')!r} must be one of {LICENCES}")
        if im.get("license_source") not in LICENCE_SOURCES:
            p.append(f"{w}: license_source must be one of {LICENCE_SOURCES}")
        for k in ("attribution", "retrieved_at", "used_for"):
            if not im.get(k):
                p.append(f"{w}: '{k}' is required and not empty")
        if "captured_at" not in im:
            p.append(f"{w}: 'captured_at' is required (null when the provider gave none)")
        ca = im.get("captured_at")
        if ca is not None and not (isinstance(ca, str) and re.match(r"^\d{4}-\d{2}-\d{2}", ca)):
            p.append(f"{w}: captured_at must be an ISO date or null")
        if not isinstance(im.get("used_for", []), list):
            p.append(f"{w}: used_for must be a list of observation ids")
    p += _no_image_urls(m, "manifest")
    return p


def _check_sources(srcs: Any, where: str, ids: set[tuple[str, str]] | None, p: list[str]) -> None:
    if not isinstance(srcs, list) or not srcs:
        p.append(f"{where}: an observed value needs a non-empty 'sources' list")
        return
    for s in srcs:
        if not isinstance(s, dict):
            p.append(f"{where}: source is not an object")
        elif s.get("kind") == "human_inspection":
            if not s.get("note") or not s.get("date"):
                p.append(f"{where}: a human_inspection source needs 'note' and 'date'")
            if s.get("image_id") or s.get("provider") in PROVIDERS:
                p.append(f"{where}: a human_inspection source carries no image id")
        elif s.get("provider") in PROVIDERS and s.get("image_id"):
            if ids is not None and (s["provider"], str(s["image_id"])) not in ids:
                p.append(f"{where}: {s['provider']}:{s['image_id']} is not in the manifest")
        else:
            p.append(f"{where}: source must be {{provider (mapillary|kartaview), image_id}} or {{kind: human_inspection, note, date}}")


def _check_status(entry: dict[str, Any], where: str, ids: set[tuple[str, str]] | None, p: list[str]) -> None:
    st = entry.get("status")
    if st not in STATUSES:
        p.append(f"{where}: status must be one of {STATUSES}")
    elif st == "observed":
        _check_sources(entry.get("sources"), where, ids, p)
    elif entry.get("basis") != "general_knowledge" or not entry.get("basis_note"):
        p.append(f"{where}: an estimated value needs basis 'general_knowledge' and a basis_note (it is not from imagery)")


def validate_observations(o: Any, ids: set[tuple[str, str]] | None = None) -> list[str]:
    p: list[str] = []
    if not isinstance(o, dict) or o.get("format") != 1 or not isinstance(o.get("observations"), list):
        return ["observations: must be an object with format 1 and an 'observations' list"]
    if o["observations"] and not (o.get("reviewed_by") and o.get("reviewed_on")):
        p.append("observations: a file with observations needs reviewed_by and reviewed_on (hand review)")
    seen: set[str] = set()
    for n, ob in enumerate(o["observations"]):
        w = f"observations[{n}]"
        if not isinstance(ob, dict):
            p.append(f"{w}: not an object")
            continue
        if ob.get("id") in seen:
            p.append(f"{w}: duplicate id {ob.get('id')!r}")
        seen.add(str(ob.get("id")))
        if ob.get("category") not in CATEGORIES:
            p.append(f"{w}: category must be one of {CATEGORIES}")
        loc = ob.get("location")
        if not (isinstance(loc, dict) and isinstance(loc.get("lat"), (int, float)) and isinstance(loc.get("lng"), (int, float))):
            p.append(f"{w}: location needs numeric lat and lng")
        facts = ob.get("facts")
        if not isinstance(facts, list) or not facts:
            p.append(f"{w}: needs a non-empty 'facts' list")
            continue
        for k, f in enumerate(facts):
            fw = f"{w}.facts[{k}]"
            if not isinstance(f, dict) or f.get("field") not in OBSERVATION_FIELDS or "value" not in f:
                p.append(f"{fw}: needs 'field' (one of {OBSERVATION_FIELDS}) and 'value'")
                continue
            if f["field"] in ("wall_colour", "accent_colour", "roof_colour") and not (isinstance(f["value"], str) and HEX.match(f["value"])):
                p.append(f"{fw}: colour must be #RRGGBB")
            _check_status(f, fw, ids, p)
    p += _no_image_urls(o, "observations")
    return p


def _num_range(v: Any, where: str, p: list[str], lo: float = 0, hi: float = 1000) -> None:
    if not (isinstance(v, dict) and isinstance(v.get("min"), (int, float)) and isinstance(v.get("max"), (int, float)) and lo <= v["min"] <= v["max"] <= hi):
        p.append(f"{where}: needs {{min, max}} numbers with {lo} <= min <= max <= {hi}")


def validate_facades(f: Any, ids: set[tuple[str, str]] | None = None) -> list[str]:
    p: list[str] = []
    if not isinstance(f, dict) or f.get("format") != 1 or not isinstance(f.get("categories"), list):
        return ["facades: must be an object with format 1 and a 'categories' list"]
    got = [c.get("id") for c in f["categories"] if isinstance(c, dict)]
    if sorted(map(str, got)) != sorted(CATEGORIES):
        p.append(f"facades: categories must be exactly {CATEGORIES}, got {got}")
    for c in f["categories"]:
        if not isinstance(c, dict):
            continue
        w = f"facades.{c.get('id')}"
        fields = c.get("fields")
        if not isinstance(fields, dict) or sorted(fields) != sorted(FACADE_FIELDS):
            p.append(f"{w}: fields must be exactly {FACADE_FIELDS}")
            continue
        if c.get("game_kind") not in ("house", "apartments", "commercial"):
            p.append(f"{w}: game_kind must be house, apartments or commercial (the Building kinds)")
        for name, fd in fields.items():
            fw = f"{w}.{name}"
            if not isinstance(fd, dict):
                p.append(f"{fw}: not an object")
                continue
            _check_status(fd, fw, ids, p)
            val = fd.get("value")
            if name == "palette":
                if not (isinstance(val, list) and len(val) >= 3):
                    p.append(f"{fw}: palette needs at least 3 entries")
                else:
                    for e in val:
                        if not (isinstance(e, dict) and isinstance(e.get("hex"), str) and HEX.match(e["hex"]) and isinstance(e.get("weight"), (int, float)) and e["weight"] > 0):
                            p.append(f"{fw}: entries need hex #RRGGBB and weight > 0")
                            break
            elif name == "floors":
                _num_range(val, fw, p, 1, 60)
            elif name == "windows":
                if not (isinstance(val, dict) and isinstance(val.get("per_bay"), dict) and isinstance(val.get("kinds"), list) and val["kinds"]):
                    p.append(f"{fw}: needs per_bay {{min,max}} and kinds")
                else:
                    _num_range(val["per_bay"], fw + ".per_bay", p, 1, 6)
            elif name in ("balconies", "shutters"):
                pr = val.get("probability") if isinstance(val, dict) else None
                if not (isinstance(val, dict) and isinstance(pr, (int, float)) and 0 <= pr <= 1 and isinstance(val.get("kinds"), list)):
                    p.append(f"{fw}: needs probability 0..1 and kinds")
            elif name == "gates":
                if not (isinstance(val, dict) and isinstance(val.get("kinds"), list) and val["kinds"] and isinstance(val.get("probability"), (int, float)) and 0 <= val["probability"] <= 1):
                    p.append(f"{fw}: needs probability 0..1 and kinds")
            elif name == "signboard_slots":
                if not (isinstance(val, dict) and isinstance(val.get("ground_floor"), dict) and isinstance(val.get("upper"), dict)):
                    p.append(f"{fw}: needs ground_floor and upper {{min,max}}")
                else:
                    _num_range(val["ground_floor"], fw + ".ground_floor", p, 0, 10)
                    _num_range(val["upper"], fw + ".upper", p, 0, 10)
            elif name == "roofs":
                w2 = val.get("types") if isinstance(val, dict) else None
                if not (isinstance(w2, list) and w2 and all(isinstance(e, dict) and isinstance(e.get("weight"), (int, float)) and e["weight"] > 0 for e in w2)):
                    p.append(f"{fw}: needs types [{{kind, weight}}]")
    p += _no_image_urls(f, "facades")
    return p


def check_tree(root: Path = ROOT) -> list[str]:
    """Validate everything under `assets/street_ref/` and cross-check ids."""
    p: list[str] = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            p.append(f"{path}: image files must never be stored in the repository")
    mpath = root / "manifest.json"
    manifest = load(mpath)
    p += validate_manifest(manifest)
    ids = manifest_ids(manifest) if isinstance(manifest, dict) else set()
    cited: set[tuple[str, str]] = set()
    obs_ids: set[str] = set()
    for opath in sorted((root / "observations").glob("*.json")):
        o = load(opath)
        p += [f"{opath.name}: {m}" for m in validate_observations(o, ids)]
        for ob in o.get("observations", []) if isinstance(o, dict) else []:
            obs_ids.add(str(ob.get("id")))
            for f in ob.get("facts", []):
                for s in f.get("sources", []) if isinstance(f, dict) else []:
                    if isinstance(s, dict) and s.get("image_id"):
                        cited.add((str(s.get("provider")), str(s["image_id"])))
    fpath = root / "facade_categories.json"
    if fpath.exists():
        facades = load(fpath)
        p += validate_facades(facades, ids)
        for c in facades.get("categories", []) if isinstance(facades, dict) else []:
            for fd in c.get("fields", {}).values() if isinstance(c, dict) else []:
                for s in fd.get("sources", []) if isinstance(fd, dict) else []:
                    if isinstance(s, dict) and s.get("image_id"):
                        cited.add((str(s.get("provider")), str(s["image_id"])))
    for im in manifest.get("images", []) if isinstance(manifest, dict) else []:
        k = (str(im.get("provider")), str(im.get("id")))
        if k not in cited:
            p.append(f"manifest: {k[0]}:{k[1]} is listed but no observation cites it (remove it, or cite it)")
        for u in im.get("used_for", []) if isinstance(im.get("used_for"), list) else []:
            if u not in obs_ids:
                p.append(f"manifest: {k[0]}:{k[1]} used_for names unknown observation {u!r}")
    return p
