#!/usr/bin/env python3
"""Folds the baked stage sites (tools/rules/stage_sites.json, from respace_stages.gd) into
src/missions/content/content.json (G-280): new marker, kerb, enemy and parking positions for the
ten stages moved out of the Anna Nagar box, their new texts, and the new stage order of stages
16-21 so that consecutive stages start 2 km or more from where the last one ended.

    godot --headless --audio-driver Dummy --path . --script res://tools/rules/respace_stages.gd
    python3 tools/rules/apply_stage_sites.py

Idempotent on a fresh content.json only: it matches objectives by their original positions
(`from` in the bake), so run it once on the Three.js-derived file and commit the result.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "..", "src", "missions", "content", "content.json")
SITES = json.load(open(os.path.join(HERE, "stage_sites.json")))

# Original fiction only. {id: (brief or None, {objective index: label})}
TEXTS = {
    "borrowed-wheels": ("Your cousin left his hatchback on the street. Take it across town to Kilpauk Garden Road.",
                        {1: "Drive to Kilpauk Garden Road, Kilpauk"}),
    "auto-shift": ("Cover a friend's auto in Perambur for one fare. Pick the passenger up and drop them in Amirthammal Colony before they lose patience.",
                   {}),
    "parcel-run": ("Three parcels, three addresses between Chetpet and Nungambakkam, and the clock is running on each one.",
                   {1: "Deliver parcel 1 of 3, Mc Nichols Road", 2: "Deliver parcel 2 of 3, Nungambakkam", 3: "Deliver parcel 3 of 3, Spur Tank Road"}),
    "bike-courier": (None, {1: "Collect the lunch boxes, Jeenis Road, Saidapet", 2: "First drop, Jothiammal Nagar", 3: "Second drop, Saidapet"}),
    "bike-thieves": ("A stolen motorbike is being stripped on a back street off Jawaharlal Nehru Road in Vadapalani, and two of the gang are armed. You have a pistol now: FIRE shoots where you look.",
                     {0: "Find the thieves, off Jawaharlal Nehru Road", 3: "Ride it back to its owner on Arcot Road"}),
    "godown-raid": ("The gang keeps its takings in a godown in the Ambattur Industrial Estate, far across town. Four guards, all armed. Use the corners.",
                    {0: "Get to the godown, Ambit Park Road, Ambattur"}),
    "tea-shop": ("A tea shop owner in the Flower Bazaar paid the Manjal Puli for years. Now the Neela Nandu (Blue Crabs) want a cut too, and four of them are walking up the street. Stand with him. He keeps an old shotgun under the counter for you.",
                 {0: "Wait at the tea shop, Audiappa Naicken Street"}),
    "turf-war": ("The Manjal Puli boss has called every crew he has left to the bus junction in T. Nagar to finish this. So have you.",
                 {0: "Go to the bus junction, T. Nagar"}),
    "planted-chain": ("Lakshmi, who sells jasmine by the temple near Elliot's Beach, wants a word. As she talks, someone slips a gold chain into your pocket and a constable starts shouting. Lose the police, then hand the chain in at the temple office.",
                      {0: "Meet Lakshmi at her flower stall, Besant Nagar 2nd Avenue", 2: "Hand the chain in at the temple office, Besant Nagar"}),
    "beach-road-brawl": ("A gang is robbing delivery riders on the beach road at Santhome. Five of them, bats and fists. Police patrols are thick on the beach road, so leave the guns holstered and settle it by hand.",
                         {0: "Go to Kamarajar Salai, the beach road at Santhome"}),
}
# Vehicles parked for a stage: (parking id, kind, which marker). `auto-park` already exists and moves.
PARKING = {
    "auto-shift": ("auto-park", "auto", 0),
    "parcel-run": ("car-chetpet", "car", 0),
    "bike-courier": ("bike-saidapet", "bike", 0),
    "bike-thieves": ("bike-kodambakkam", "bike", 0),
}
# Stages 16-21 in their new order (consecutive stages are 2 km or more apart, G-280).
ORDER_16_21 = ["stadium-biryani", "wedding-party", "planted-chain", "mumbai-mail", "beach-road-brawl", "harmonium-thief"]


def near(o, p):
    return abs(o["x"] - p[0]) < 0.05 and abs(o["z"] - p[1]) < 0.05


def main():
    c = json.load(open(PATH))
    by_id = {m["id"]: m for m in c["missions"]}
    for mid, site in SITES.items():
        m = by_id[mid]
        points = site["points"]
        for o in m["objectives"]:
            if "x" not in o:
                continue
            for p in points:
                if near(o, p["from"]):
                    o["x"], o["z"] = p["x"], p["z"]
                    for key in ("fare", "goods"):
                        if key in o:
                            o[key]["kerb"] = {"x": p["kerb"][0], "z": p["kerb"][1]}
                            o[key].pop("kerbSide", None)
                            o[key].pop("kerbShift", None)
                    break
        for gid, members in site["groups"].items():
            for e, n in zip(c["enemies"][gid], members):
                e["x"], e["z"] = n["x"], n["z"]
        brief, labels = TEXTS[mid]
        if brief:
            m["brief"] = brief
        for i, text in labels.items():
            m["objectives"][i]["label"] = text
        if mid in PARKING:
            pid, kind, k = PARKING[mid]
            park = points[k]["park"]
            spot = next((s for s in c["parking"] if s["id"] == pid), None)
            if spot is None:
                colour = next(s["color"] for s in c["parking"] if s["kind"] == kind)
                spot = {"id": pid, "kind": kind, "x": 0, "z": 0, "yaw": 0, "color": colour}
                c["parking"].append(spot)
            spot["x"], spot["z"], spot["yaw"] = park[0], park[1], park[2]
    head = c["missions"][:15]
    tail = [by_id[i] for i in ORDER_16_21]
    assert len(head) + len(tail) == len(c["missions"])
    c["missions"] = head + tail
    for n, m in enumerate(c["missions"], 1):
        m["stage"] = n
    with open(PATH, "w") as f:
        f.write(json.dumps(c, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
