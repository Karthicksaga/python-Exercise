#!/usr/bin/env python3
"""Builds src/missions/content/missions_v2.json: the five missions of docs/mission-design.md §4
(Hall Ticket, Sambar for Sixty, Wrong Number, Monsoon Night, The Bandh) as data, from the anchors,
routes and rough patches baked from the real roads (tools/rules/bake_missions_v2.gd, G-145).

    python3 tools/rules/build_missions_v2.py

Original fiction and names only: no brands, no real businesses; no children anywhere.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "..", "..", "src", "missions", "content")
A = json.load(open(os.path.join(CONTENT, "anchors.json")))
anchors, paths = A["anchors"], A["paths"]


def r1(v):
    return round(v * 10) / 10


def at(name):
    a = anchors[name]
    return {"x": r1(a["x"]), "z": r1(a["z"])}


def kerb(name):
    return {"x": r1(anchors[name]["kerb"]["x"]), "z": r1(anchors[name]["kerb"]["z"])}


def length(path):
    return sum(math.hypot(path[i]["x"] - path[i - 1]["x"], path[i]["z"] - path[i - 1]["z"]) for i in range(1, len(path)))


def along(path, d):
    """The point d metres along a path and its heading (0 = north, -Z)."""
    left = max(0.0, d)
    for i in range(1, len(path)):
        ax, az, bx, bz = path[i - 1]["x"], path[i - 1]["z"], path[i]["x"], path[i]["z"]
        seg = math.hypot(bx - ax, bz - az)
        if left <= seg or i == len(path) - 1:
            t = min(1.0, left / seg) if seg else 1.0
            return {"x": r1(ax + (bx - ax) * t), "z": r1(az + (bz - az) * t)}, math.atan2(-(bx - ax), -(bz - az))
        left -= seg
    return {"x": path[0]["x"], "z": path[0]["z"]}, 0.0


def dist_to_path(p, path):
    best = 1e18
    for i in range(1, len(path)):
        ax, az, bx, bz = path[i - 1]["x"], path[i - 1]["z"], path[i]["x"], path[i]["z"]
        dx, dz = bx - ax, bz - az
        t = 0 if dx == dz == 0 else max(0, min(1, ((p["x"] - ax) * dx + (p["z"] - az) * dz) / (dx * dx + dz * dz)))
        best = min(best, math.hypot(p["x"] - (ax + dx * t), p["z"] - (az + dz * t)))
    return best


def simple(path):
    return [{"x": r1(p["x"]), "z": r1(p["z"])} for p in path]


def fare(board=0, alight=0, k=None, patient=False, party=None):
    f = {"kerb": k}
    if board:
        f["board"] = board
    if alight:
        f["alight"] = alight
    if patient:
        f["patient"] = True
    if party:
        f["party"] = party
    return f


def reach(label, name, **kw):
    o = {"type": "reach", "label": label, **at(name), "radius": kw.pop("radius", 7)}
    o.update(kw)
    return o


parking = []


def park(pid, kind, name, back=14, colour=0x2f5d8a):
    a = anchors[name]["park"]  # a few metres back along the road from the marker, baked on the road
    parking.append({"id": pid, "kind": kind, "x": r1(a["x"]), "z": r1(a["z"]), "yaw": a["yaw"], "color": colour})


# --- 1. Hall Ticket -----------------------------------------------------------------------------
park("auto-hall", "auto", "hall_lodge")
mid, _ = along(paths["hall_route"], length(paths["hall_route"]) * 0.5)
hall = {
    "id": "hall-ticket", "stage": 22, "kind": "extra", "where": "Triplicane",
    "title": "Hall Ticket", "reward": 1200, "reputation": 6, "dynamic": True,
    "brief": "A student's entrance exam starts at nine and the gates shut on the stroke. The lodge to the exam centre on Greams Road is across the city at rush hour. Get there on time, and if the gate has shut, the side gate on Pathari Road stays open for a few minutes more.",
    "quietZones": [{**mid, "radius": 90, "label": "Hospital zone: no horns"}],
    "goals": [
        {"id": "early", "label": "Reach the gate with 2 minutes to spare", "kind": "time_left", "value": 120},
        {"id": "quiet", "label": "No horn in the hospital zone", "kind": "quiet_zone"},
        {"id": "clean", "label": "No crashes", "kind": "no_damage"},
    ],
    "objectives": [
        {"type": "enter", "label": "Get in the auto outside the lodge", "vehicle": "auto", "checkpoint": True},
        reach("Pick up the student at the lodge", "hall_lodge", mode="auto", stop=True, radius=7, fare=fare(board=1, k=kerb("hall_lodge")), checkpoint=True),
        reach("Drive to the exam centre gate, Greams Road", "hall_gate", mode="auto", stop=True, radius=8, timeLimit=420, fare=fare(alight=1, k=kerb("hall_gate")), onFail="side", onFailScale=0.5, next="end"),
        reach("The gate has shut: run to the side gate, Pathari Road", "hall_side", id="side", mode="foot", radius=6, timeLimit=150),
    ],
}

# --- 2. Sambar for Sixty -----------------------------------------------------------------------
park("auto-sambar", "auto", "sambar_kitchen", colour=0x3f6b3a)
main_p, lane_p = paths["sambar_main"], paths["sambar_lane"]
rough = []
for frac, kind in [(0.16, "breaker"), (0.34, "pothole"), (0.5, "breaker"), (0.66, "pothole"), (0.84, "breaker")]:
    p, _ = along(main_p, length(main_p) * frac)
    if dist_to_path(p, lane_p) > 30:
        rough.append({**p, "radius": 5, "kind": kind, "label": "speed breaker" if kind == "breaker" else "pothole"})
for frac, kind in [(0.2, "pothole"), (0.32, "pothole"), (0.45, "breaker"), (0.58, "pothole"), (0.72, "pothole"), (0.85, "pothole")]:
    p, _ = along(lane_p, length(lane_p) * frac)
    if dist_to_path(p, main_p) > 30:
        rough.append({**p, "radius": 5, "kind": kind, "label": "speed breaker" if kind == "breaker" else "pothole"})
sambar = {
    "id": "sambar-sixty", "stage": 23, "kind": "extra", "where": "Mylapore",
    "title": "Sambar for Sixty", "reward": 1500, "reputation": 5,
    "brief": "Sixty guests, one wedding hall, and a vessel of sambar that must arrive hot and not half-spilled. The lane through the back streets is short and rough; the main road is smooth and long. Watch the stability meter: every breaker and pothole takes some.",
    "goals": [
        {"id": "intact", "label": "Arrive with the vessel over 90% intact", "kind": "cargo", "value": 90},
        {"id": "hot", "label": "Arrive with 90 seconds to spare", "kind": "time_left", "value": 90},
    ],
    "objectives": [
        {"type": "enter", "label": "Get in the goods auto behind the caterer's", "vehicle": "auto", "checkpoint": True},
        reach("Load the sambar vessel at the caterer's kitchen", "sambar_kitchen", mode="auto", stop=True, radius=7,
              goods={"action": "load", "items": ["vessel"], "who": "shopkeeper", "kerb": kerb("sambar_kitchen")}, checkpoint=True),
        {**reach("Deliver the vessel to the wedding hall, Venkatakrishna Road", "sambar_hall", mode="auto", stop=True, radius=8, timeLimit=300,
                                    goods={"action": "unload", "items": ["vessel"], "kerb": kerb("sambar_hall")}),
         "type": "fragile", "ruin": "cargo_ruined", "rough": rough},
    ],
}

# --- 3. Wrong Number -----------------------------------------------------------------------------
park("bike-wrong", "bike", "wrong_start", colour=0x7a3b2e)
wr = paths["wrong_route"]
wl = length(wr)
tail = {"type": "tail", "label": "Follow the parcel runner to the drop-off, unseen", "near": 25, "far": 90, "notice": 12, "grace": 2,
        "radius": 90, "speed": 8, "quarry": "bike", "path": simple(wr), "checkpoint": True,
        "pauses": [{"at": r1(wl * f), "seconds": 4, "label": "He swaps scooters in a side lane"} for f in (0.18, 0.45, 0.72)]}
wrong = {
    "id": "wrong-number", "stage": 24, "kind": "extra", "where": "Thousand Lights",
    "title": "Wrong Number", "reward": 400, "reputation": 0,
    "brief": "A call to the wrong number, and a stranger's voice sounding afraid: a parcel runner is carrying something that is not his, and he keeps changing scooters. Follow him down Mount Road without being noticed, then decide what to do with what you learn.",
    "briefIf": {},
    "goals": [
        {"id": "unseen", "label": "Never more than 40% suspicion", "kind": "no_suspicion", "value": 40},
        {"id": "clean", "label": "No crashes", "kind": "no_damage"},
        {"id": "quick", "label": "Finish in 10 minutes", "kind": "par_time", "value": 600},
    ],
    "objectives": [
        {"type": "enter", "label": "Get on the motorbike", "vehicle": "bike"},
        reach("Wait at the junction on Mount Road where the runner appears", "wrong_start", mode="bike", radius=15, checkpoint=True),
        tail,
        {"type": "choice", "label": "He has dropped the envelope. What now?", "options": [
            {"id": "report", "label": "Report it to the police station", "detail": "Reputation up, a small reward.", "reward": 300, "reputation": 6, "flag": "reported_envelope", "next": "station"},
            {"id": "take", "label": "Take the envelope", "detail": "More money, and a star of police heat. Something later reacts.", "reward": 1100, "wanted": 1, "flag": "took_envelope", "next": "end"},
        ]},
        reach("Take it to the police station, Nandanam Main Road", "wrong_station", id="station", mode="bike", stop=True, radius=8),
    ],
}

# --- 4. Monsoon Night ------------------------------------------------------------------------------
park("ambulance-monsoon", "ambulance", "monsoon_patient", colour=0xe6e6e6)
short, alt = paths["monsoon_short"], paths["monsoon_alt"]
z1, _ = along(short, length(short) * 0.33)
z2, _ = along(short, length(short) * 0.62)
z3, _ = along(alt, length(alt) * 0.5)
floods = [
    {"kind": "flood", "label": "Underpass on the shortest road", **z1, "radius": 22, "growth": 0.12, "maxRadius": 40, "start": 30, "maxDepth": 0.9, "rise": 0.012},
    {"kind": "flood", "label": "Low junction ahead", **z2, "radius": 20, "growth": 0.1, "maxRadius": 36, "start": 90, "maxDepth": 0.9, "rise": 0.012},
    {"kind": "flood", "label": "The long way floods last", **z3, "radius": 20, "growth": 0.08, "maxRadius": 32, "start": 300, "maxDepth": 0.8, "rise": 0.01},
]
monsoon = {
    "id": "monsoon-night", "stage": 25, "kind": "extra", "where": "Santhome", "rain": 1.0,
    "title": "Monsoon Night", "reward": 2000, "reputation": 8,
    "brief": "The northeast monsoon has broken over the coast and a patient needs the hospital in Alwarpet. The shortest road floods first; the minimap shows the water. Re-route early and drive smoothly: the patient feels every jolt.",
    "goals": [
        {"id": "health", "label": "Patient health above 70%", "kind": "cargo", "value": 70},
        {"id": "clean", "label": "No crashes", "kind": "no_damage"},
    ],
    "objectives": [
        {"type": "enter", "label": "Get in the ambulance", "vehicle": "ambulance", "checkpoint": True},
        reach("Pick up the patient on Santhome High Road", "monsoon_patient", mode="ambulance", stop=True, radius=8, strict=True, fare=fare(board=1, k=kerb("monsoon_patient"), patient=True), checkpoint=True),
        {**reach("Take the patient to the hospital, TTK Road", "monsoon_hospital", mode="ambulance", stop=True, radius=9, timeLimit=480, strict=True, fare=fare(alight=1, k=kerb("monsoon_hospital"), patient=True)),
         "type": "fragile", "ruin": "patient_lost", "hazards": floods},
    ],
}

# --- 5. The Bandh ----------------------------------------------------------------------------------
park("bike-bandh", "bike", "bandh_depot", colour=0x2f4f2f)
strikes = [{"kind": "strike", "label": "Bandh: road shut", **at(n), "radius": 45, "blocks": True, "start": 0} for n in ("strike_one", "strike_two", "strike_three")]
bandh = {
    "id": "the-bandh", "stage": 26, "kind": "extra", "where": "Egmore",
    "title": "The Bandh", "reward": 1800, "reputation": 5,
    "brief": "A general strike has shut the main roads and every shop. Three urgent deliveries must still cross the city before noon, and the only doors open are the back ones. Use the lanes and the beach road; the shut roads show red on the minimap.",
    "briefIf": {"took_envelope": "The envelope's owners know your bike now. Keep clear of the police."},
    "goals": [
        {"id": "quiet", "label": "No police attention", "kind": "no_police"},
        {"id": "clean", "label": "No crashes", "kind": "no_damage"},
        {"id": "fast", "label": "All three delivered in 12 minutes", "kind": "par_time", "value": 720},
    ],
    "objectives": [
        {"type": "enter", "label": "Get on the motorbike behind the depot", "vehicle": "bike", "checkpoint": True},
        reach("Collect the three urgent parcels at the depot's back door, Pantheon Road", "bandh_depot", mode="bike", stop=True, radius=7,
              goods={"action": "load", "items": ["parcel", "medicine", "tiffin"], "who": "sender", "kerb": kerb("bandh_depot")}, checkpoint=True, hazards=strikes),
        reach("Back door 1, Bharathi Salai: the medicine", "bandh_one", mode="bike", stop=True, radius=7, timeLimit=300,
              goods={"action": "unload", "items": ["medicine"], "kerb": kerb("bandh_one")}, hazards=strikes),
        reach("Back door 2, Buchi Babu Street: the lunch box", "bandh_two", mode="bike", stop=True, radius=6, timeLimit=300,
              goods={"action": "unload", "items": ["tiffin"], "kerb": kerb("bandh_two")}, hazards=strikes, checkpoint=True),
        reach("Back door 3, the beach road: the parcel", "bandh_three", mode="bike", stop=True, radius=6, timeLimit=300,
              goods={"action": "unload", "items": ["parcel"], "kerb": kerb("bandh_three")}, hazards=strikes),
    ],
}

out = {"format": "chennai-missions-v2", "version": 1, "source": "tools/rules/build_missions_v2.py on anchors.json (G-145)",
       "parking": parking, "missions": [hall, sambar, wrong, monsoon, bandh]}
for m in out["missions"]:
    for o in m["objectives"]:
        if o["type"] in ("reach", "fragile") and "goods" in o:
            o["goods"]["who"] = o["goods"].get("who", "recipient") if o["goods"]["action"] == "load" else o["goods"].get("who", "")
open(os.path.join(CONTENT, "missions_v2.json"), "w").write(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print("missions_v2.json:", [m["id"] for m in out["missions"]], len(parking), "parking spots,", len(rough), "rough patches")
