"""
Kit `mall`: a generic modern shopping complex on its OSM outline (G-189).

    blender -b --factory-startup --python tools/blender/landmarks/mall.py [-- ID ...]

No real mall name, logo or livery anywhere (TD-18): the only sign is the generic category,
added by the game from the spec ("வணிக வளாகம் / SHOPPING COMPLEX").

* Podium: the OSM outline extruded to `storeys` x `storey_height`, concrete with floor bands and
  dark ribbon windows on the side and back walls.
* Atrium front: on the front wall, a glass curtain wall over the middle `atrium_share` of its
  length, with vertical mullions every `mullion` metres and a transom at each floor, and a
  glazed pyramid roof light over the atrium.
* Canopy: a thin projecting roof over the entrance on slim columns (within 1.8 m of the wall).
* Roof: `rooftop` = "parking" (dark deck with white bays and ramp housing) or "plant" (AC
  units and tanks); a parapet round it.
* Plaza: a paved strip along the front wall inside the outline's 2 m tolerance.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lkit  # noqa: E402
from mathutils import Vector  # noqa: E402

DIRS = {"south": Vector((0.0, -1.0)), "north": Vector((0.0, 1.0)), "east": Vector((1.0, 0.0)), "west": Vector((-1.0, 0.0))}


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    cols = lkit.colours(spec)
    ring = lkit.part_outline(spec, p["part"])
    sh = p["storey_height"]
    H = p["storeys"] * sh
    par = p.get("parapet", 1.1)
    acc.prism(ring, 0.0, H, cols["concrete"], top_colour=cols["roof"])
    acc.band(ring, H, H + par, 0.0, cols["concrete_dark"])
    for floor in range(1, p["storeys"]):
        acc.band(ring, floor * sh - 0.25, floor * sh + 0.25, 0.1, cols["concrete_dark"])
    front_dir = DIRS[p.get("front", "south")]
    fronts = lkit.front_edges(ring, front_dir, min_len=20.0)
    front = max(fronts, key=lambda e: e[2]) if fronts else max(lkit.edges(ring), key=lambda e: e[2])
    fa, fb, fL, fu, fn = front
    share = p.get("atrium_share", 0.45)
    g0 = fL * (1 - share) / 2
    gw = fL * share
    # Ribbon windows on every other long wall (and the front outside the atrium).
    if lod < 2:
        for a, b, L, u, n in lkit.edges(ring):
            if L < 8:
                continue
            for floor in range(1, p["storeys"]):
                z = floor * sh + 0.9
                if (a - fa).length < 0.01 and (b - fb).length < 0.01:
                    for s0, s1 in ((0.6, g0 - 0.6), (g0 + gw + 0.6, L - 0.6)):
                        if s1 - s0 > 2:
                            lkit.vface(acc, a + u * s0, u, z, s1 - s0, sh * 0.45, 0.04, cols["window"])
                else:
                    lkit.vface(acc, a + u * 0.8, u, z, L - 1.6, sh * 0.4, 0.04, cols["window"])
    # Vertical cladding fins on every long wall (LOD0).
    if lod == 0:
        for a, b, L, u, n in lkit.edges(ring):
            if L < 8:
                continue
            k = int(L / p.get("fin", 4.0))
            for i in range(1, k):
                q = a + u * (L * i / k) + n * 0.25
                if (a - fa).length < 0.01 and g0 - 0.5 < L * i / k < g0 + gw + 0.5:
                    continue
                acc.box((q.x, q.y, sh), (0.25, 0.5, H - sh), cols["concrete_dark"], math.atan2(u.y, u.x))
    # Ground-floor shopfront glazing either side of the atrium (LOD0), framed every 2.5 m.
    if lod == 0:
        yaw_f = math.atan2(fu.y, fu.x)
        for s0, s1 in ((1.0, g0 - 1.0), (g0 + gw + 1.0, fL - 1.0)):
            if s1 - s0 < 3:
                continue
            lkit.vface(acc, fa + fu * s0, fu, 0.4, s1 - s0, sh * 0.62, 0.05, cols["glass"])
            k = int((s1 - s0) / 2.5)
            for i in range(k + 1):
                q = fa + fu * (s0 + (s1 - s0) * i / k) + fn * 0.1
                acc.box((q.x, q.y, 0.4), (0.14, 0.14, sh * 0.62), cols["mullion"], yaw_f)
    # Glass atrium front with mullions and transoms.
    ga = fa + fu * g0
    lkit.vface(acc, ga, fu, 0.3, gw, H - 0.6, 0.06, cols["glass"])
    if lod < 2:
        step = p.get("mullion", 3.0) * (1 if lod == 0 else 3)
        k = max(1, int(gw / step))
        yaw = math.atan2(fu.y, fu.x)
        for i in range(k + 1):
            q = ga + fu * (gw * i / k) + fn * 0.12
            acc.box((q.x, q.y, 0.3), (0.16, 0.16, H - 0.6), cols["mullion"], yaw)
        for floor in range(0, p["storeys"] + 1):
            q = ga + fu * (gw / 2) + fn * 0.14
            acc.box((q.x, q.y, max(0.3, floor * sh - 0.1)), (gw, 0.12, 0.2), cols["mullion"], yaw)
    # Pyramid roof light over the atrium, set back from the front.
    yaw = math.atan2(fu.y, fu.x)
    depth = min(24.0, gw * 0.5)
    rc = fa + fu * (g0 + gw / 2) - fn * (depth / 2 + 2)
    acc.box((rc.x, rc.y, H), (gw * 0.8, depth, 0.6), cols["concrete_dark"], yaw)
    acc.box((rc.x, rc.y, H + 0.6), (gw * 0.8, depth, p.get("roof_light", 5.0)), cols["glass"], yaw, top=(gw * 0.12, 0.6))
    # Canopy over the entrance on slim columns.
    cw = min(gw * 0.6, 30.0)
    cc = fa + fu * (g0 + gw / 2) + fn * 0.9
    acc.box((cc.x, cc.y, sh * 1.1), (cw, 1.8, 0.45), cols["canopy"], yaw)
    if lod < 2:
        for s in (-1, -0.33, 0.33, 1):
            q = cc + fu * (s * cw / 2 * 0.95) + fn * 0.6
            acc.cylinder((q.x, q.y, 0.0), 0.18, 0.18, sh * 1.1, cols["mullion"], sides=8 if lod == 0 else 4, top=False)
    # Plaza: paving strip in front (inside the outline's 2 m tolerance).
    pa = fa + fu * (g0 - 4) + fn * 0.05
    acc.face([(pa.x, pa.y, 0.04), (pa.x + fu.x * (gw + 8), pa.y + fu.y * (gw + 8), 0.04),
              (pa.x + fu.x * (gw + 8) + fn.x * 1.7, pa.y + fu.y * (gw + 8) + fn.y * 1.7, 0.04), (pa.x + fn.x * 1.7, pa.y + fn.y * 1.7, 0.04)], cols["paving"])
    # Sign board on the parapet over the atrium (the game adds the generic letters).
    if lod < 2 and spec.get("signs"):
        sb = fa + fu * (g0 + gw / 2) - fn * 2.0  # 2 m inside, where the game stands the letters
        acc.box((sb.x, sb.y, H + par), (min(26.0, gw * 0.7), 0.3, 3.6), cols["sign"], yaw)
    # Roof: parking or plant.
    if lod < 2:
        inner = lkit.offset(ring, -3.0)
        c = Vector((sum(q[0] for q in inner) / len(inner), sum(q[1] for q in inner) / len(inner)))
        if p.get("rooftop", "parking") == "parking":
            acc.cap(inner, H + 0.06, cols["deck"])
            if lod == 0:
                for a, b, L, u, n in lkit.edges(inner):
                    if L < 12:
                        continue
                    k = int(L / 2.7)
                    for i in range(1, k):
                        q = a + u * (L * i / k) - n * 2.6
                        acc.box((q.x, q.y, H + 0.07), (0.12, 5.0, 0.02), cols["line"], math.atan2(u.y, u.x))
            acc.box((c.x, c.y, H), (8.0, 14.0, 3.4), cols["concrete_dark"], yaw)
        else:
            for i in range(6):
                q = c + fu * ((i - 2.5) * 6.0)
                acc.box((q.x, q.y, H), (4.0, 2.6, 2.2), cols["plant"], yaw)
    lkit.wall_collision(col, ring, H + par)
    col.append(((cc.x, cc.y, sh * 1.1 + 0.22), (cw, 1.8, 0.45), yaw))


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__))
