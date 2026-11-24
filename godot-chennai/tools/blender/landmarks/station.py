"""
Kit `station`: a colonial railway terminus on its OSM outline (G-184).

    blender -b --factory-startup --python tools/blender/landmarks/station.py [-- ID ...]

* The main block is the OSM outline extruded (`storeys` x `storey_height`), with white bands at
  each floor and a cornice; ground-floor arched openings and, on `arcade_floor`, an arcade of
  tall arched openings with slim white columns and a balustrade, on every long wall.
* `pavilions[]` and `towers[]` stand on the front wall at `at` (-1 west end .. +1 east end of
  the front): square blocks with white bands, a big arched window, and a cap (`pyramid`, pale
  and steep with iron cresting, or `dome`, an onion dome with corner chhatris). A tower may
  carry clock faces, paired belfry openings and a balcony.
* `skyline_chhatris`: small domed kiosks along the front parapet (Indo-Saracenic).
* `shed`: a train shed on its OSM outline: `spans` barrel-vaulted roofs on rows of columns
  (only the columns collide; trains pass under the roof).
* `signs`: white boards on the roof for the real public name; the game adds the letters.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lkit  # noqa: E402
from mathutils import Vector  # noqa: E402


def _front(spec, p):
    return Vector((0.0, -1.0)) if p.get("front", "south") == "south" else Vector((0.0, 1.0))


def _span(ring, f):
    us = [(Vector(q) - f.c).dot(f.u) for q in ring]
    vs = [(Vector(q) - f.c).dot(f.v) for q in ring]
    return min(us), max(us), min(vs), max(vs)


def facade(acc, ring, p, cols, lod, eaves):
    sh = p["storey_height"]
    bay = p["bay"] * (1 if lod == 0 else 2)
    for a, b, L, u, n in lkit.edges(ring):
        if L < 3.0:
            continue
        k = max(1, int(L / bay))
        w = L / k
        for i in range(k):
            s = a + u * (w * i)
            for floor in range(p["storeys"]):
                z = floor * sh
                if lod == 2:
                    continue
                if floor == p.get("arcade_floor", -1):
                    ow = w * 0.62
                    lkit.vface(acc, s + u * ((w - ow) / 2), u, z + 0.9, ow, sh * 0.5, 0.04, cols["opening"], arch=4 if lod == 0 else 2)
                    if lod == 0:
                        c = s + n * 0.25
                        acc.box((c.x, c.y, z + 0.2), (0.34, 0.34, sh * 0.72), cols["band"], math.atan2(u.y, u.x))
                        m = s + u * (w / 2) + n * 0.2
                        acc.box((m.x, m.y, z + 0.1), (w * 0.9, 0.25, 0.85), cols["band"], math.atan2(u.y, u.x))
                else:
                    ow = w * 0.4
                    lkit.vface(acc, s + u * ((w - ow) / 2), u, z + 1.0, ow, sh * 0.42, 0.04, cols["opening"], arch=3 if lod == 0 else 0)
                    if lod == 0:
                        # White arch surround (hood) and the pilaster between bays.
                        lkit.vface(acc, s + u * ((w - ow) / 2 - 0.25), u, z + 1.0 + sh * 0.42, ow + 0.5, 0.25, 0.06, cols["band"], arch=3)
                if lod == 0 and L > 12:
                    pc = s + n * 0.12
                    acc.box((pc.x, pc.y, z), (0.45, 0.24, sh), cols["band"] if p.get("style") == "romanesque" else cols["brick"], math.atan2(u.y, u.x))
    if lod == 0:
        lkit.arch_frieze(acc, ring, eaves - 1.6, 1.4, 1.0, cols["band"])
    # Floor bands and cornice.
    for floor in range(1, p["storeys"]):
        acc.band(ring, floor * sh - 0.25, floor * sh + 0.25, 0.12, cols["band"])
    acc.band(ring, eaves - 0.5, eaves, 0.35, cols["band"])


def square_block(acc, col, f, at_u, v, size, eaves, cap, style, cols, lod, t, base_z=0.0):
    c = f.p(at_u, v)
    yaw = f.yaw
    fb = lkit.Frame((c[0], c[1]), yaw)
    acc.box((c[0], c[1], base_z), (size, size, eaves - base_z), cols["brick"], yaw)
    step = 6.0
    z = 6.0
    while z < eaves - 1.0:
        acc.box((c[0], c[1], z - 0.25), (size + 0.25, size + 0.25, 0.5), cols["band"], yaw)
        z += step
    acc.box((c[0], c[1], eaves - 0.6), (size + 0.7, size + 0.7, 0.6), cols["band"], yaw)
    if lod < 2:
        # Big arched window on the four faces of the upper part.
        for k in range(4):
            ang = k * math.pi / 2
            out = fb.u * math.cos(ang) + fb.v * math.sin(ang)
            along = Vector((out.y, -out.x)) * -1
            w = size * 0.42
            a = fb.c + out * (size / 2) - along * (w / 2)
            lkit.vface(acc, a, along, eaves - 9.5, w, 4.2, 0.03, cols["opening"], arch=4 if lod == 0 else 2, normal=out)
            if lod == 0:
                lkit.vface(acc, fb.c + out * (size / 2) - along * (w / 2 + 0.35), along, eaves - 9.8, w + 0.7, 0.3, 0.05, cols["band"], normal=out)
    if cap > 0:
        if style == "pyramid":
            lkit.pyramid_cap(acc, c, size, eaves, cap, cols["cap"], yaw, overhang=0.6)
            if lod < 2:
                acc.box((c[0], c[1], eaves + cap * 0.55), (size * 0.45, size * 0.45, 0.6), cols["iron"], yaw, top=(size * 0.4, size * 0.4))
            if t.get("finial"):
                acc.cylinder((c[0], c[1], eaves + cap - 0.2), 0.12, 0.03, t["finial"], cols["iron"], sides=5)
        else:
            acc.box((c[0], c[1], eaves), (size * 0.8, size * 0.8, 1.4), cols["band"], yaw)
            acc.cylinder((c[0], c[1], eaves + 1.4), size * 0.36, size * 0.36, 1.0, cols["dome_shade"], sides=12 if lod == 0 else 6)
            acc.dome((c[0], c[1], eaves + 2.4), size * 0.38, cap - 2.4, cols["dome"], sides=12 if lod == 0 else 6, rings=4 if lod == 0 else 2, onion=0.18, tip=0.8)
            if t.get("chhatris") and lod < 2:
                for sx in (-1, 1):
                    for sy in (-1, 1):
                        q = fb.p(sx * size * 0.42, sy * size * 0.42)
                        chhatri(acc, q, eaves, 1.4, cols, lod)
    col.append(((c[0], c[1], (base_z + eaves) / 2), (size, size, eaves - base_z), yaw))
    return fb


def chhatri(acc, q, z, s, cols, lod):
    """A small domed kiosk: four posts and a dome."""
    if lod == 0:
        for dx in (-1, 1):
            for dy in (-1, 1):
                acc.box((q[0] + dx * s * 0.35, q[1] + dy * s * 0.35, z), (0.16, 0.16, s * 0.9), cols["band"], 0.0)
    else:
        acc.box((q[0], q[1], z), (s * 0.7, s * 0.7, s * 0.9), cols["band"], 0.0)
    acc.box((q[0], q[1], z + s * 0.9), (s, s, 0.15), cols["band"], 0.0)
    acc.dome((q[0], q[1], z + s * 1.05), s * 0.42, s * 0.6, cols["dome"], sides=8 if lod == 0 else 4, rings=2, onion=0.2, tip=0.25)


def tower_extras(acc, fb, size, t, cols, lod):
    half = size / 2
    if "clock" in t:
        lkit.clock_faces(acc, fb, half, t["clock"]["z"], t["clock"]["diameter"], cols, lod)
    if lod == 2:
        return
    for k in range(4):
        ang = k * math.pi / 2
        out = fb.u * math.cos(ang) + fb.v * math.sin(ang)
        along = Vector((out.y, -out.x)) * -1
        if t.get("belfry"):
            z = t["clock"]["z"] - 9.0 if "clock" in t else t["eaves"] - 10
            for s in (-1, 1):
                a = fb.c + out * half + along * (s * 0.9 - 0.55)
                lkit.vface(acc, a, along, z, 1.1, 3.0, 0.03, cols["opening"], arch=3 if lod == 0 else 0, normal=out)
            if t.get("balcony"):
                m = fb.c + out * (half + 0.45)
                acc.box((m.x, m.y, z - 0.6), (2.8, 0.9, 0.7), cols["band"], math.atan2(along.y, along.x))


def shed(acc, col, spec, sp, cols, lod):
    ring = lkit.part_ring(spec, sp["part"])
    c = lkit.part_centre(spec, sp["part"])
    yaw = lkit.part_yaw(spec, sp["part"])
    f = lkit.Frame(c, yaw)
    u0, u1, v0, v1 = _span(ring, f)
    L = u1 - u0
    D = v1 - v0
    spans = sp["spans"]
    h, rise = sp["height"], sp["rise"]
    segs = 8 if lod == 0 else (4 if lod == 1 else 2)
    sw = D / spans
    for s in range(spans):
        va = v0 + sw * s
        prev = None
        for k in range(segs + 1):
            t = k / segs
            vv = va + sw * t
            zz = h + rise * math.sin(math.pi * t)
            cur = (vv, zz)
            if prev is not None:
                quad = [f.p(u0, prev[0], prev[1]), f.p(u1, prev[0], prev[1]), f.p(u1, cur[0], cur[1]), f.p(u0, cur[0], cur[1])]
                acc.face(quad, cols["shed_roof"])
                if lod < 2:
                    acc.face(quad[::-1], cols["shed"])
            prev = cur
    rows = spans + 1
    n = max(2, int(L / sp["column_spacing"]) + 1)
    for r in range(rows):
        vv = v0 + sw * r
        vv = min(max(vv, v0 + 0.4), v1 - 0.4)
        if lod < 2:
            acc.box(f.p((u0 + u1) / 2, vv, h - 0.6), (L, 0.35, 0.6), cols["shed"], yaw)
        for i in range(n):
            uu = u0 + 0.4 + (L - 0.8) * i / (n - 1)
            p = f.p(uu, vv)
            if lod < 2:
                acc.box(p, (0.4, 0.4, h), cols["shed"], yaw)
            col.append(((p[0], p[1], h / 2), (0.4, 0.4, h), yaw))


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    cols = lkit.colours(spec)
    main = p["part"]
    ring = lkit.part_outline(spec, main)
    c = lkit.part_centre(spec, main)
    yaw = lkit.part_yaw(spec, main)
    f = lkit.Frame(c, yaw)
    front = _front(spec, p)
    fs = 1.0 if f.v.dot(front) > 0 else -1.0  # +v or -v is the front
    u0, u1, v0, v1 = _span(ring, f)
    eaves = p["storeys"] * p["storey_height"] + 0.8
    rings = [ring] + [lkit.part_outline(spec, x) for x in p.get("extra_parts", [])]
    for r in rings:
        acc.prism(r, 0.0, eaves, cols["brick"], top_colour=cols["roof"])
        facade(acc, r, p, cols, lod, eaves)
        if p.get("roof_pitch", 0) > 0:
            inner = lkit.offset(r, -0.6)
            _, _, a0, a1 = _span(r, f)
            acc.prism(inner, eaves, eaves + p["roof_pitch"] * (a1 - a0) * 0.5, cols["roof"], top_colour=cols["roof"])
        lkit.wall_collision(col, r, eaves)
    front_v = v1 if fs > 0 else v0
    half_u = (u1 - u0) / 2
    mid_u = (u0 + u1) / 2
    for pv in p.get("pavilions", []):
        size = pv["size"]
        at = mid_u + pv["at"] * (half_u - size / 2)
        square_block(acc, col, f, at, front_v - fs * size / 2 + fs * 0.3, size, pv["eaves"], pv["cap"], pv["cap_style"], cols, lod, pv)
    for t in p.get("towers", []):
        size = t["size"]
        at = mid_u + t["at"] * (half_u - size / 2)
        fb = square_block(acc, col, f, at, front_v - fs * size / 2 + fs * 0.3, size, t["eaves"], t["cap"], t["cap_style"], cols, lod, t)
        tower_extras(acc, fb, size, t, cols, lod)
    n = p.get("skyline_chhatris", 0)
    if n and lod < 2:
        for i in range(n):
            uu = u0 + 3 + (u1 - u0 - 6) * i / max(1, n - 1)
            chhatri(acc, f.p(uu, front_v - fs * 1.2), eaves, 1.6, cols, lod)
    for sign in spec.get("signs", []):
        if lod == 2:
            break
        # A white board on the roof facing the front; the letters are added in the game.
        at = mid_u + sign["at"] * half_u
        h = sign.get("height", 1.5)
        q = f.p(at, front_v - fs * 2.0)
        w = 26.0
        acc.box((q[0], q[1], eaves + 0.6), (w, 0.25, 2 * h + 0.8), cols["sign"], yaw)
        for s in (-1, 1):
            pq = f.p(at + s * w * 0.4, front_v - fs * 2.6)
            acc.box((pq[0], pq[1], eaves), (0.15, 0.15, 1.0), cols["iron"], yaw)
    if "shed" in p:
        shed(acc, col, spec, p["shed"], cols, lod)


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__))
