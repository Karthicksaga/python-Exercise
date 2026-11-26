"""
Kit `tower`: a 1960s observation tower (Anna Nagar Tower; G-184), ported from the game's first
procedural model (`LandmarkMeshes.tower` / `LandmarkProfiles.tower`, now retired) so the look is
kept, on the OSM outline of the tower's plinth.

    blender -b --factory-startup --python tools/blender/landmarks/tower.py [-- ID ...]

The first step of the plinth is the OSM outline itself; inside it: stepped round plinth, a drum
with openings, the shaft with three slots, six slim columns, `levels` circular viewing levels
with railings, a canopy with a shallow dome and a finial up to the spec height.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lkit  # noqa: E402


def r2(v):
    return round(v * 100.0) / 100.0


def profile(spec, p):
    H = spec["height"]["value"]
    count = max(2, p["levels"])
    footprint = p["core_radius"]
    steps = [(r2(footprint - i * 0.8), r2(0.18 * (i + 1))) for i in range(3)]
    plinth_top = steps[2][1]
    scale = min(1.35, max(0.5, footprint / 9.5))
    drum = (r2(4.4 * scale), r2(plinth_top + 4.2))
    canopy_top = H - 1.6
    canopy_bottom = canopy_top - 1.8
    first, last = drum[1] + 2.2, canopy_bottom - 2.2
    levels = [(r2(first + (last - first) * i / (count - 1)), r2((3.9 - 0.6 * i / (count - 1)) * scale)) for i in range(count)]
    return {"steps": steps, "drum": drum, "shaft": r2(2.3 * scale), "levels": levels, "canopy": (r2(canopy_bottom), r2(canopy_top), r2(4.3 * scale)), "height": H}


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    cols = lkit.colours(spec)
    pr = profile(spec, p)
    S = 24 if lod == 0 else (12 if lod == 1 else 8)
    ring = lkit.part_ring(spec, p["part"])
    cx, cy = lkit.part_centre(spec, p["part"])
    o = (cx, cy, 0.0)
    # OSM outline as the outer platform, then the round steps inside it.
    acc.prism(ring, 0.0, 0.12, cols["step"], top_colour=cols["plinth"])
    for i, (r, top) in enumerate(pr["steps"]):
        acc.cylinder((cx, cy, 0.0), r, r, top + 0.12, cols["step"] if i % 2 else cols["plinth"], sides=S)
    plinth_top = pr["steps"][2][1] + 0.12
    dr, dtop = pr["drum"]
    acc.cylinder((cx, cy, plinth_top), dr, dr, dtop - plinth_top, cols["cream"], sides=S)
    acc.cylinder((cx, cy, dtop - 0.55), dr + 0.18, dr + 0.18, 0.55, cols["accent"], sides=S, top=False)
    acc.cylinder((cx, cy, dtop), dr + 0.4, dr + 0.4, 0.22, cols["white"], sides=S)
    if lod < 2:
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            acc.box((cx + math.cos(a) * (dr - 0.05), cy + math.sin(a) * (dr - 0.05), plinth_top + 0.05), (1.5, 0.3, 2.6), cols["opening"], a + math.pi / 2)
    cb, ct, cr = pr["canopy"]
    sr = pr["shaft"]
    acc.cylinder((cx, cy, dtop), sr, sr * 0.9, cb - dtop, cols["cream"], sides=S, top=False)
    if lod < 2:
        sh = cb - dtop - 2.0
        for k in range(3):
            a = math.pi / 6 + k * 2 * math.pi / 3
            acc.box((cx + math.cos(a) * sr * 0.93, cy + math.sin(a) * sr * 0.93, dtop + 1.0), (0.25, 0.45, sh), cols["opening"], a)
        last_r = pr["levels"][-1][1]
        for k in range(6):
            a = 2 * math.pi * k / 6
            acc.cylinder((cx + math.cos(a) * (last_r - 0.45), cy + math.sin(a) * (last_r - 0.45), dtop), 0.2, 0.2, cb - dtop, cols["white"], sides=6, top=False)
    for (y, r) in pr["levels"]:
        acc.cylinder((cx, cy, y - 0.28), r, r, 0.28, cols["white"], sides=S)
        if lod < 2:
            acc.cylinder((cx, cy, y - 0.2), r + 0.03, r + 0.03, 0.14, cols["accent"], sides=S, top=False)
            acc.cylinder((cx, cy, y), r - 0.06, r - 0.06, 0.45, cols["cream"], sides=S, top=False)
        if lod == 0:
            for k in range(16):
                a = 2 * math.pi * k / 16
                acc.box((cx + math.cos(a) * (r - 0.06), cy + math.sin(a) * (r - 0.06), y + 0.45), (0.07, 0.07, 0.55), cols["rail"], a)
            acc.cylinder((cx, cy, y + 0.98), r - 0.05, r - 0.05, 0.08, cols["rail"], sides=S, top=False)
    acc.cylinder((cx, cy, cb), cr, cr, 0.4, cols["white"], sides=S)
    acc.cylinder((cx, cy, cb + 0.4), cr + 0.05, cr + 0.05, 0.22, cols["accent"], sides=S, top=False)
    acc.dome((cx, cy, cb + 0.62), cr, ct - cb - 0.62, cols["accent"], sides=S, rings=4 if lod == 0 else 2)
    acc.cylinder((cx, cy, ct - 0.2), 0.9, 0.9, 0.7, cols["cream"], sides=12 if lod < 2 else 6)
    acc.cylinder((cx, cy, ct + 0.5), 0.32, 0.0, pr["height"] - ct - 0.5, cols["white"], sides=8 if lod < 2 else 4)
    # Collision: plinth steps and drum as octagon-ish boxes, the shaft with its levels as a box.
    for (r, top) in pr["steps"][:1]:
        for k in range(2):
            col.append(((cx, cy, (top + 0.12) / 2), (r * 1.7, r * 1.7, top + 0.12), k * math.pi / 4))
    for k in range(2):
        col.append(((cx, cy, dtop / 2), (dr * 1.8, dr * 1.8, dtop), k * math.pi / 4))
    mid_r = pr["levels"][len(pr["levels"]) // 2][1]
    col.append(((cx, cy, (dtop + ct) / 2), (mid_r * 1.6, mid_r * 1.6, ct - dtop), 0.0))
    col.append(((cx, cy, (dtop + ct) / 2), (mid_r * 1.6, mid_r * 1.6, ct - dtop), math.pi / 4))


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__))
