"""
Kit `colonial_clocktower`: a white colonnaded civic building with a central clock tower on its
OSM outline (Ripon Building style; G-184).

    blender -b --factory-startup --python tools/blender/landmarks/colonial_clocktower.py [-- ID ...]

* Main block: the OSM outline extruded to `storeys` x `storey_height` plus a parapet, with a
  band at each floor and a cornice; ground-floor arched windows; on `colonnade_floors` a
  verandah of columns before a shaded recess on every long wall.
* Tower: square, on the front at `tower.at` (-1..1 along the front), rising through the roof
  to `shaft_top`; a clock stage with four faces of `clock_diameter`; an octagonal open
  lantern, a dome and a finial up to the spec height.
* Corner turrets: small domed kiosks at the four corners of the roof.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lkit  # noqa: E402
from mathutils import Vector  # noqa: E402


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    cols = lkit.colours(spec)
    ring = lkit.part_ring(spec, p["part"])
    c = lkit.part_centre(spec, p["part"])
    yaw = lkit.part_yaw(spec, p["part"])
    f = lkit.Frame(c, yaw)
    sh = p["storey_height"]
    eaves = p["storeys"] * sh
    top = eaves + p["parapet"]
    acc.prism(ring, 0.0, top, cols["white"], top_colour=cols["roof"])
    for floor in range(1, p["storeys"]):
        acc.band(ring, floor * sh - 0.2, floor * sh + 0.25, 0.15, cols["shade"])
    acc.band(ring, eaves - 0.3, eaves + 0.15, 0.45, cols["shade"])
    acc.band(ring, top - 0.05, top + 0.25, 0.1, cols["white"])
    bay = p["bay"] * (1 if lod == 0 else 2)
    for a, b, L, u, n in lkit.edges(ring):
        if L < 3.0 or lod == 2:
            continue
        k = max(1, int(L / bay))
        w = L / k
        for i in range(k):
            s = a + u * (w * i)
            for floor in range(p["storeys"]):
                z = floor * sh
                if floor in p["colonnade_floors"] and L > 12:
                    lkit.vface(acc, s + u * (w * 0.12), u, z + 0.5, w * 0.76, sh - 1.2, 0.03, cols["dark"])
                    if lod == 0:
                        cc = s + n * 0.45
                        acc.cylinder((cc.x, cc.y, z + 0.3), 0.26, 0.22, sh - 0.6, cols["white"], sides=8)
                        m = s + u * (w / 2) + n * 0.35
                        acc.box((m.x, m.y, z + 0.25), (w * 0.9, 0.2, 0.9), cols["white"], math.atan2(u.y, u.x))
                else:
                    lkit.vface(acc, s + u * (w * 0.32), u, z + 1.0, w * 0.36, sh * 0.42, 0.03, cols["dark"], arch=3 if lod == 0 else 0)
    if lod == 0:
        # Balustrade on the parapet and window hoods on the ground floor.
        for a, b, L, u, n in lkit.edges(ring):
            k = int(L / 0.9)
            for i in range(k):
                q = a + u * (0.45 + i * L / max(1, k)) + n * 0.05
                acc.box((q.x, q.y, eaves + 0.2), (0.22, 0.22, p["parapet"] - 0.3), cols["shade"], math.atan2(u.y, u.x))
    lkit.wall_collision(col, ring, top)
    # Tower on the front.
    us = [(Vector(q) - f.c).dot(f.u) for q in ring]
    vs = [(Vector(q) - f.c).dot(f.v) for q in ring]
    front = Vector((0.0, -1.0)) if p.get("front", "south") == "south" else Vector((0.0, 1.0))
    fs = 1.0 if f.v.dot(front) > 0 else -1.0
    front_v = max(vs) if fs > 0 else min(vs)
    t = p["tower"]
    size = t["size"]
    at = (min(us) + max(us)) / 2 + t["at"] * ((max(us) - min(us)) / 2 - size)
    tc = f.p(at, front_v - fs * (size / 2))
    ft = lkit.Frame((tc[0], tc[1]), yaw)
    shaft = t["shaft_top"]
    acc.box((tc[0], tc[1], 0), (size, size, shaft), cols["white"], yaw)
    # Porch at the foot and bands up the shaft.
    acc.box(ft.p(0, fs * (size / 2 + 0.7)), (size * 0.8, 1.4, sh * 1.2), cols["white"], yaw)
    acc.box(ft.p(0, fs * (size / 2 + 0.7), sh * 1.2), (size * 0.9, 1.6, 0.5), cols["shade"], yaw)
    z = top + 2.0
    while z < shaft - 1:
        acc.box((tc[0], tc[1], z), (size + 0.3, size + 0.3, 0.4), cols["shade"], yaw)
        z += 4.5
    if lod < 2:
        for k in range(4):
            ang = k * math.pi / 2
            out = ft.u * math.cos(ang) + ft.v * math.sin(ang)
            along = Vector((out.y, -out.x)) * -1
            a = ft.c + out * (size / 2) - along * 0.8
            lkit.vface(acc, a, along, top + 3.0, 1.6, shaft - top - 6.0, 0.03, cols["dark"], arch=3 if lod == 0 else 0, normal=out)
    stage = t["clock_stage"]
    acc.box((tc[0], tc[1], shaft), (size + 0.6, size + 0.6, 0.5), cols["shade"], yaw)
    acc.box((tc[0], tc[1], shaft + 0.5), (size - 0.4, size - 0.4, stage), cols["white"], yaw)
    lkit.clock_faces(acc, ft, (size - 0.4) / 2, shaft + 0.5 + stage / 2, t["clock_diameter"], cols, lod)
    zc = shaft + 0.5 + stage
    acc.box((tc[0], tc[1], zc), (size + 0.4, size + 0.4, 0.6), cols["shade"], yaw)
    # Lantern: eight columns round an octagonal core, then the dome and finial.
    lh = t["lantern_height"]
    r = size * 0.36
    acc.cylinder((tc[0], tc[1], zc + 0.6), r * 0.7, r * 0.7, lh, cols["dark"], sides=8, phase=math.pi / 8 + yaw)
    if lod < 2:
        for k in range(8):
            ang = yaw + k * math.pi / 4
            acc.cylinder((tc[0] + math.cos(ang) * r, tc[1] + math.sin(ang) * r, zc + 0.6), 0.22, 0.2, lh, cols["white"], sides=6 if lod == 0 else 4)
    acc.cylinder((tc[0], tc[1], zc + 0.6 + lh), r + 0.4, r + 0.4, 0.5, cols["white"], sides=8, phase=math.pi / 8 + yaw)
    zd = zc + 1.1 + lh
    acc.dome((tc[0], tc[1], zd), r + 0.1, t["dome_height"], cols["white"], sides=12 if lod == 0 else 6, rings=4 if lod == 0 else 2)
    acc.cylinder((tc[0], tc[1], zd + t["dome_height"] - 0.1), 0.18, 0.02, t["finial"] + 0.1, cols["gold"], sides=5)
    col.append(((tc[0], tc[1], shaft / 2), (size, size, shaft), yaw))
    col.append(((tc[0], tc[1], (shaft + zd) / 2), (size - 0.4, size - 0.4, zd - shaft), yaw))
    # Corner turrets.
    ct = p.get("corner_turrets")
    if ct and lod < 2:
        s = ct["size"]
        for su in (-1, 1):
            for sv in (-1, 1):
                q = f.p((max(us) if su > 0 else min(us)) - su * (s / 2 + 0.3), (max(vs) if sv > 0 else min(vs)) - sv * (s / 2 + 0.3))
                acc.box((q[0], q[1], top), (s, s, ct["height"]), cols["white"], yaw)
                acc.box((q[0], q[1], top + ct["height"]), (s + 0.4, s + 0.4, 0.35), cols["shade"], yaw)
                acc.dome((q[0], q[1], top + ct["height"] + 0.35), s * 0.45, s * 0.5, cols["white"], sides=8 if lod == 0 else 4, rings=3 if lod == 0 else 2)


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__))
