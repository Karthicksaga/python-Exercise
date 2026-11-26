#!/usr/bin/env python3
"""Folds the baked job sites (tools/rules/job_sites.json, from `respace_stages.gd -- jobs`) into
src/missions/content/content.json (G-453): nine of the ten Anna Nagar city jobs and the four life
places (hospital, gym, mall, cinema) with the stories that use them move out to districts of their
own, each as a cluster that keeps its distances (a job's stops 0.5 to 3 km apart). `share-auto` stays
(its route is a recorded Anna Nagar road line) and so does home (the start).

    godot --headless --audio-driver Dummy --path . --script res://tools/rules/respace_stages.gd -- jobs
    python3 tools/rules/apply_job_sites.py

Idempotent on a fresh content.json only: it matches stops by their original positions (`from` in the
bake), so run it once on the Three.js-derived file (after `apply_stage_sites.py`) and commit the result.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "..", "src", "missions", "content", "content.json")
SITES = json.load(open(os.path.join(HERE, "job_sites.json")))

# A job begins when the vehicle is this close to its first stop (the clock waits until then).
START_RADIUS = 300.0
# The labels name {road} (the street the stop was put on, or "the main road" where the map has no name)
# and {district} (the district the stop stands in, from the data: the first stop only).
# Stop labels (the originals name real Anna Nagar streets): {on} is ", <street>" where the map names
# the road and "" where it does not, {in} is ", <district>" (the district the stop stands in, from the
# data). Index = stop; None keeps the original text.
LABELS = {
    "courier": ["Collect the parcel at the post office{on}{in}", "Deliver the parcel{on}{in}"],
    "cab-ride": [None, "Drop the passenger{on}{in}"],
    "bus-route": ["Bus stop 1 of 4{on}{in}", "Bus stop 2 of 4{on}", "Bus stop 3 of 4{on}", "Bus stop 4 of 4{on}"],
    "hospital-transfer": ["Collect the patient at the hospital{on}{in}", None],
    "food-delivery": ["Collect the orders{on}{in}", "Delivery 1 of 3{on}{in}", "Delivery 2 of 3{on}{in}", "Delivery 3 of 3{on}{in}"],
    "medicine-run": ["Collect the medicine{on}{in}", None],
    "tower-park-visit": ["Pick up the visitor{on}{in}", "Drop them at the park gate{on}{in}"],
    "evening-bus": ["Bus stop 1 of 4{on}{in}", "Bus stop 2 of 4{on}", "Bus stop 3 of 4{on}", "Bus stop 4 of 4{on}"],
}
# Story steps that stand at a moved place: step positions follow `places`; the way home takes longer.
HOME = (18.0, 42.8)


def near(o, p):
    return abs(o["x"] - p[0]) < 0.05 and abs(o["z"] - p[1]) < 0.05


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def slug(name):
    return "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")


def on_road(p):
    return ", " + p["road"] if p["road"] else ""


def in_district(p):
    return ", " + p["district"] if p.get("district") else ""


def find(points, o):
    for p in points:
        if near(o, p["from"]):
            return p
    return None


def length(points):
    return sum(dist(points[i - 1], points[i]) for i in range(1, len(points)))


def main():
    c = json.load(open(PATH))
    for jid, site in SITES["jobs"].items():
        job = next(j for j in c["jobs"] if j["id"] == jid)
        points = site["points"]
        old = [(p["from"][0], p["from"][1]) for p in (find(points, s) for s in job["stops"])]
        new = []
        for i, s in enumerate(job["stops"]):
            p = find(points, s)
            old_pos = (s["x"], s["z"])
            s["x"], s["z"] = p["x"], p["z"]
            new.append((p["x"], p["z"]))
            for key in ("fare", "goods"):
                if key in s:
                    s[key]["kerb"] = {"x": p["kerb"][0], "z": p["kerb"][1]}
                    s[key].pop("kerbSide", None)
                    s[key].pop("kerbShift", None)
            text = LABELS.get(jid, [])[i] if i < len(LABELS.get(jid, [])) else None
            if text:
                s["label"] = text.format(on=on_road(p), **{"in": in_district(p)})
        # The same trip over a longer road takes longer: the clock is scaled by how much longer the new
        # drive between the stops is than the old one (by road, measured by the bake), never shortened.
        factor = max(1.0, site["road_m"] / site["was_road_m"]) if site.get("was_road_m", 0) > 0 else 1.0
        job["timeLimit"] = math.ceil(job["timeLimit"] * factor)
        for s in job["stops"]:
            if "due" in s:
                s["due"] = math.ceil(s["due"] * factor)
        job["startRadius"] = START_RADIUS
        first = points[0]
        kind = job["vehicle"]
        pid = "%s-%s" % (kind, slug(first["district"]))
        template = next(s for s in c["parking"] if s["kind"] == kind)
        spot = next((s for s in c["parking"] if s["id"] == pid), None)
        if spot is None:
            spot = {"id": pid, "kind": kind, "x": 0, "z": 0, "yaw": 0, "color": template["color"]}
            c["parking"].append(spot)
        spot["x"], spot["z"], spot["yaw"] = first["park"][0], first["park"][1], first["park"][2]
    places = SITES["places"]
    by_place = {p["id"]: p for p in c["places"]}
    # Each place's own point is where its first key went; the pavement spot is where people walk to.
    for pid, site in places.items():
        p0 = site["points"][0]
        by_place[pid]["x"], by_place[pid]["z"] = p0["kerb"][0], p0["kerb"][1]
    where = {pid: site["points"] for pid, site in places.items()}
    for story in c["stories"]:
        for step in story["steps"]:
            if "x" not in step:
                continue
            for pid, pts in where.items():
                hit = find(pts, step)
                if hit is None:
                    continue
                foot = step["type"] == "activity" or step.get("mode") == "foot"
                step["x"], step["z"] = (hit["kerb"][0], hit["kerb"][1]) if foot else (hit["x"], hit["z"])
                break
    # Paati's way home from the hospital is as long as the new road: the old limit was for 300 m.
    paati = next(s for s in c["stories"] if s["id"] == "paati-checkup")
    hospital = places["hospital"]["points"][0]
    metres = dist((hospital["x"], hospital["z"]), HOME)
    step = paati["steps"][-1]
    step["timeLimit"] = math.ceil(step["timeLimit"] + metres / 6.0)
    with open(PATH, "w") as f:
        f.write(json.dumps(c, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
