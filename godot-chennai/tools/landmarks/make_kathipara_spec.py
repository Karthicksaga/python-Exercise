#!/usr/bin/env python3
"""Writes assets/landmarks/kathipara-junction/spec.json from a dump of the world's own road pieces
(tools/landmarks/dump_decks.gd, run with the centre -700 8620 and radius 300) (G-390).

    godot --headless --path . --script res://tools/landmarks/dump_decks.gd -- -700 8620 300 > dump.txt
    python3 tools/landmarks/make_kathipara_spec.py DUMP.json

The spec keeps a copy of the road pieces near the junction (centre line, width, heights) because the
Blender kit draws on the same decks the chunk builder draws (`DeckMeshes`); a test compares the copy
with the live world and fails when the world was rebuilt and the spec was not.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "landmarks" / "kathipara-junction" / "spec.json"
ORIGIN = (-700.0, 8620.0)
ZONE = 200.0       # model detail radius (m)
KEEP = 300.0       # road pieces kept for the neighbour checks

# Gantry boards: approach boards name the junction, exit boards name the place the road leads to.
# Tamil place names are common usage, not read from a sign: they need native review.
JUNCTION = {"ta": "கத்திப்பாரா சந்திப்பு", "en": "KATHIPARA JUNCTION"}
EXITS = {
    280718090: {"ta": "கிண்டி", "en": "GUINDY", "why": "the flyover leaves the junction towards the north-east (Guindy)"},
    280780450: {"ta": "பல்லாவரம்", "en": "PALLAVARAM", "why": "GST Road leaves towards the south-west (Pallavaram, the airport)"},
    2313918660: {"ta": "அசோக் நகர்", "en": "ASHOK NAGAR", "why": "the Inner Ring Road leaves to the north (Ashok Nagar, Koyambedu)"},
}
APPROACH = [277692300, 8126799660, 280780460]


def length(pts):
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def at_distance(pts, d):
    run = 0.0
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        if run + L >= d:
            t = (d - run) / L
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        run += L
    return pts[-1], (0.0, 1.0)


def height_at(r, d):
    hs = r["heights"]
    if not hs:
        return 0.0
    step = r["height_step"]
    k = max(0, min(int(d // step), len(hs) - 2))
    total = length(r["points"])
    span = max(min((k + 1) * step, total) - k * step, 1e-4)
    return hs[k] + (hs[k + 1] - hs[k]) * max(0.0, min(1.0, (d - k * step) / span))


def board_for(r, mode):
    pts = r["points"]
    L = length(pts)
    ds = [i * 1.0 for i in range(int(L))]
    inside = [d for d in ds if math.dist(at_distance(pts, d)[0], ORIGIN) <= (175.0 if mode == "approach" else 165.0)]
    d = inside[0] if mode == "approach" else inside[-1]
    p, tr = at_distance(pts, d)
    return d, p, tr


def main(dump):
    roads = json.load(open(dump))
    decks = []
    for r in roads:
        if r["highway"] in ("steps", "pedestrian") or not r["points"]:
            continue
        if min(math.dist(p, ORIGIN) for p in r["points"]) > KEEP:
            continue
        decks.append({k: r[k] for k in ("id", "piece", "offset_along", "name", "highway", "width", "layer", "bridge", "oneway", "height_step", "heights", "points")})
    byid = {r["id"]: r for r in roads}
    boards = []
    for rid in APPROACH + list(EXITS):
        r = byid[rid]
        mode = "approach" if rid in APPROACH else "exit"
        d, p, tr = board_for(r, mode)
        h = height_at(r, d)
        text = JUNCTION if mode == "approach" else EXITS[rid]
        face = (-tr[0], -tr[1])  # towards the traffic coming at it
        boards.append({"road": rid, "mode": mode, "d": round(d, 1), "world": [round(p[0], 2), round(p[1], 2)], "deck_height": round(h, 2),
                       "facing": [round(face[0], 4), round(face[1], 4)], "width": 9.0, "board_z": [4.0, 6.4],
                       "ta": text["ta"], "en": text["en"], "ta_review": "needs native review",
                       "source": "the junction's own name (OSM way name) on approach boards; place names in common usage on exit boards, direction from the road's bearing in OSM, not read from a sign"})
    spec = {
        "format": 1, "id": "kathipara-junction", "kind": "junction", "hero": True,
        "names": {"en": "Kathipara Junction", "ta": "கத்திப்பாரா சந்திப்பு",
                  "en_source": "OSM way names \"Kathipara Interchange\" and Wikipedia article title",
                  "ta_source": "common usage, written by the model's author; needs review by a native Tamil speaker (G-324)"},
        "style": "1970s-2008 Indian highway cloverleaf grade separator: concrete decks on pier-and-cap bents, 1 m parapets, "
                 "two levels (the loop ramps and the straight flyover over them), black-and-white painted kerbs",
        "height": {"value": 20.0, "osm_tag": None, "of": "lamp heads and gantry boards over the upper deck (deck level 13 m by the G-150 rule)",
                   "source": "estimated: deck heights are the world's own estimate (G-150); lamp posts 7 m on 1 m parapets",
                   "alternatives": [], "chosen_because": "OSM carries no heights; the model's top is the lamp heads over the 13 m upper deck."},
        "osm": {"main": "flyover", "overlay": True, "exclude": [], "wikidata": None, "wikipedia": "en:Kathipara Junction",
                "data_date": "2026-11-23T00:28:57Z", "licence": "ODbL 1.0, © OpenStreetMap contributors",
                "parts": {"flyover": {"osm": "way/280718090", "tags": {"highway": "primary", "bridge": "yes", "name": "Kathipara Interchange Flyover"}, "role": "info", "road": True}}},
        "origin": list(ORIGIN), "yaw_deg": 0.0,
        "recipe": {"kit": "hero_flyover", "params": {"radius": ZONE, "pier_spacing": 30.0, "lamp_spacing": 30.0, "decks_of": "decks"}},
        "colours": {"concrete": "#b9b6ad", "concrete_dark": "#8f8c84", "kerb_black": "#1f1f21", "kerb_white": "#ecebe6",
                    "pier_red": "#b3382c", "steel": "#3a3d42", "sign_green": "#1f6b4a", "sign_white": "#f2f2ee"},
        "materials": [{"name": "cast concrete", "where": "parapets, coping, piers"}, {"name": "road paint", "where": "kerbs and pier guards"},
                      {"name": "galvanised steel", "where": "lamp posts, gantries, expansion joints"}],
        "facts": [
            {"en": "A cloverleaf grade separator built under the NHDP at the junction of the Grand Southern Trunk Road, Inner Ring Road, Anna Salai and Mount-Poonamallee Road.", "source": "https://en.wikipedia.org/wiki/Kathipara_Junction"},
            {"en": "The main span linking the Inner Ring Road and the Grand Southern Trunk Road opened on 9 April 2008 and the rest on 26 October 2008.", "source": "https://en.wikipedia.org/wiki/Kathipara_Junction"},
            {"en": "The junction was a roundabout with a statue of Jawaharlal Nehru before the flyover.", "source": "https://en.wikipedia.org/wiki/Kathipara_Junction"},
        ],
        "references": [], "references_withheld": "No photograph was used: the model is drawn from the world's own road decks (OSM centre lines, G-150 heights) and general knowledge of Indian highway flyover details.",
        "atlas": {"file": "kathipara-junction_atlas.png", "size": 512},
        "budget": {"lod0_min": 1500, "lod0_max": 6000, "lod1_max": 1500, "lod2_max": 2000},
        "lod": {"lod0_end": 260.0, "lod1_end": 700.0, "lod2_end": 4000.0},
        "collision": {"plan": "Jolt boxes for lamp posts and gantry posts; the decks, parapets and piers keep the chunk builder's colliders (DeckMeshes).", "min_boxes": 4},
        "estimated": ["deck heights (G-150 rule, not surveyed)", "lamp spacing and height", "gantry board sizes and positions", "all colours", "Tamil text (needs native review)"],
        "hooks": {"entrances": [], "peace_zone": {"centre": list(ORIGIN), "radius": 0.0, "reason": "none: a road junction, not a place to stand (data only)"},
                  "facts_card": {"title_en": "Kathipara Junction", "title_ta": "கத்திப்பாரா சந்திப்பு", "facts": "facts"}},
        "boards": boards, "decks": decks,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(spec, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(OUT, len(decks), "road pieces", len(boards), "boards")


if __name__ == "__main__":
    main(sys.argv[1])
