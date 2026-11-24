"""
Kit `gopuram_complex`: a South Indian (Dravidian) temple from its OSM parts (G-184).

    blender -b --factory-startup --python tools/blender/landmarks/gopuram_complex.py [-- ID ...]

Parts read from the spec (all footprints from OpenStreetMap):
* `wall.part`: the compound; a striped wall (ochre and white vertical bands) on its outline,
  open where a gopuram stands so people walk through the gateway.
* `gopurams[]`: gateway towers on their OSM footprints: a stone base with the passage, tapering
  tiers with cornices, pilasters, dark niches and rows of small coloured stucco forms
  (**abstract shapes only: no deity figures or images**, culture note §3), a barrel-vaulted
  crown with gold finials.
* `vimanas[]`: shrine towers over the named shrine buildings (stepped, a dome and a finial).
* `halls`: the other buildings inside the compound as pillared, flat-roofed mandapams.
* `flagstaff`: the gilded pillar on the axis between the main gopuram and the main shrine.
* `tank`: the temple tank's stepped banks (striped steps down to the water drawn by the city's
  water layer) and the pillared mandapam at its centre.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lkit  # noqa: E402
from mathutils import Vector  # noqa: E402

SHADOW = "#3b3029"


def _outward(spec, part):
    """Unit vector (Blender xy) from the compound's centre towards the part, snapped to the
    part's short axis (the passage runs through the short side)."""
    c = Vector(lkit.part_centre(spec, part))
    yaw = lkit.part_yaw(spec, part)
    across = Vector((-math.sin(yaw), math.cos(yaw)))
    return across if across.dot(c) >= 0 else -across


def gopuram(acc, col, spec, g, lod, cols, out_collision):
    part = g["part"]
    c = Vector(lkit.part_centre(spec, part))
    width, depth = lkit.part_rect(spec, part)
    width *= g.get("scale", 1.0)
    depth *= g.get("scale", 1.0)
    fwd = _outward(spec, part)
    yaw = math.atan2(fwd.y, fwd.x) - math.pi / 2  # frame u along the broad face, v outwards
    f = lkit.Frame(c, yaw)
    H = g["height"]
    tiers = g["tiers"]
    base_h = g["base_height"]
    passage_w = g.get("passage_width", 3.4)
    passage_h = g.get("passage_height", 6.2)
    stone, stone_d, stone_l = cols["stone"], cols["stone_dark"], cols["stone_light"]
    shadow = cols["shadow"]
    pier_w = (width - passage_w) / 2
    # Base: a moulded plinth, two piers either side of the passage, the lintel mass above it.
    acc.box(f.p(0, 0), (width + 0.6, depth + 0.6, 0.8), stone_d, yaw)
    for s in (-1, 1):
        u = s * (passage_w / 2 + pier_w / 2)
        acc.box(f.p(u, 0, 0.8), (pier_w, depth, base_h - 0.8 - 0.7), stone, yaw)
        if lod < 2:
            # Pilasters on both broad faces and dark niches between them.
            n = max(2, int(pier_w / 1.6))
            for k in range(n):
                uu = u - pier_w / 2 + (k + 0.5) * pier_w / n
                for side in (-1, 1):
                    acc.box(f.p(uu, side * (depth / 2 + 0.06), 1.0), (0.45, 0.14, base_h - 2.2), stone_l, yaw)
                    if lod == 0 and k + 1 < n:
                        acc.box(f.p(uu + pier_w / n / 2, side * (depth / 2 + 0.02), 2.2), (0.7, 0.06, 2.4), shadow, yaw)
        out_collision.append((f.p(u, 0, base_h / 2), (pier_w, depth, base_h), yaw))
    acc.box(f.p(0, 0, passage_h), (passage_w + 0.1, depth, base_h - 0.7 - passage_h), stone, yaw)
    # Passage ceiling and door frame (dark, so the gateway reads from the street).
    acc.box(f.p(0, 0, passage_h - 0.25), (passage_w, depth - 0.2, 0.25), shadow, yaw)
    for side in (-1, 1):
        acc.box(f.p(0, side * (depth / 2 + 0.08), passage_h - 0.1), (passage_w + 0.9, 0.2, 0.7), stone_l, yaw)
    out_collision.append((f.p(0, 0, (passage_h + base_h) / 2), (passage_w + 0.2, depth, base_h - passage_h), yaw))
    acc.box(f.p(0, 0, base_h - 0.7), (width + 0.5, depth + 0.5, 0.7), stone_l, yaw)
    # Tiers.
    crown_h = g.get("crown_height", 3.6)
    finial_h = g.get("finial_height", 2.0)
    tiers_top = H - crown_h - finial_h + 0.3
    rise = (tiers_top - base_h) / tiers
    w0, d0 = width * 0.94, depth * 0.92
    w1, d1 = width * g.get("top_width", 0.46), depth * g.get("top_depth", 0.56)
    palette = [lkit.hex_to_linear(h) for h in g["tier_colours"]]
    accents = [lkit.hex_to_linear(h) for h in g["stucco_colours"]]
    cornice = cols["cornice"]
    taper = g.get("taper_power", 0.9)
    for i in range(tiers):
        t0, t1 = (i / tiers) ** taper, ((i + 1) / tiers) ** taper
        wa, wb = w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1
        da, db = d0 + (d1 - d0) * t0, d0 + (d1 - d0) * t1
        z0 = base_h + rise * i
        body = rise * 0.74
        tier_col = palette[i % len(palette)]
        acc.box(f.p(0, 0, z0), (wa, da, body), tier_col, yaw, top=(wb + 0.2, db + 0.2))
        # Cornice (kapota) overhanging, then the parapet of small pavilions (hara).
        zk = z0 + body
        acc.box(f.p(0, 0, zk), (wb + 0.9, db + 0.9, rise * 0.1), cornice, yaw, top=(wb + 0.6, db + 0.6))
        zp = zk + rise * 0.1
        ph = rise * 0.16
        acc.box(f.p(0, 0, zp), (wb + 0.1, db + 0.1, ph * 0.5), tier_col, yaw)
        if lod < 2:
            # Corner pavilions (kuta) with domed caps; a barrel-roofed pavilion (sala) mid-face.
            for su in (-1, 1):
                for sv in (-1, 1):
                    q = f.p(su * (wb / 2 - 0.45), sv * (db / 2 - 0.45), zp)
                    acc.box(q, (0.95, 0.95, ph), cornice, yaw)
                    acc.dome((q[0], q[1], zp + ph), 0.5, 0.45, palette[(i + 2) % len(palette)], sides=6 if lod == 0 else 4, rings=2)
            for sv in (-1, 1):
                q = f.p(0, sv * (db / 2 - 0.4), zp)
                sw = max(1.6, wb * 0.22)
                acc.box(q, (sw, 0.8, ph), cornice, yaw)
                acc.box((q[0], q[1], zp + ph), (sw, 0.8, 0.5), cols["crown"], yaw, top=(sw - 0.3, 0.12))
            if lod == 0:
                n_p = max(2, int(wb / 3.2))
                for k in range(n_p):
                    uu = -wb / 2 + 0.45 + (wb - 0.9) * (k + 0.5) / n_p
                    if abs(uu) < max(1.6, wb * 0.22) / 2 + 0.6 or abs(abs(uu) - (wb / 2 - 0.45)) < 1.0:
                        continue
                    for sv in (-1, 1):
                        acc.box(f.p(uu, sv * (db / 2 - 0.35), zp), (0.6, 0.6, ph * 0.8), cornice, yaw, top=(0.3, 0.3))
        if lod == 2:
            continue
        zc = z0 + body * 0.1
        hh = body * 0.8
        wm = (wa + wb) / 2
        dm = (da + db) / 2
        # Central projecting bay on both broad faces, with the window opening.
        for side in (-1, 1):
            acc.box(f.p(0, side * (dm / 2), zc), (wm * 0.28, 0.7, hh), tier_col, yaw)
            acc.box(f.p(0, side * (dm / 2 + 0.36), zc + hh * 0.18), (min(1.4, wm * 0.12), 0.05, hh * 0.62), shadow, yaw)
        # Pilasters and stucco forms: abstract coloured shapes in rows (no figures, no faces).
        n = max(3, int(wm / g.get("stucco_spacing", 1.7))) if lod == 0 else max(2, int(wm / 4.0))
        for k in range(n):
            u = -wm / 2 + (k + 0.5) * wm / n
            if abs(u) < wm * 0.16:
                continue
            for side in (-1, 1):
                v = side * (dm / 2 + 0.05)
                acc.box(f.p(u - wm / n / 2 + 0.2, v, zc), (0.3, 0.2, hh), cols["pilaster"], yaw)
                if lod == 0:
                    a = accents[(i * 3 + k + (side > 0)) % len(accents)]
                    acc.box(f.p(u, v + side * 0.12, zc + hh * 0.12), (0.62, 0.34, hh * 0.62), a, yaw, top=(0.34, 0.22))
                    acc.box(f.p(u, v + side * 0.12, zc + hh * 0.74), (0.34, 0.3, hh * 0.18), accents[(i + k + 3) % len(accents)], yaw, top=(0.18, 0.16))
        m = max(2, int(dm / 2.0)) if lod == 0 else 1
        for k in range(m):
            v = -dm / 2 + (k + 0.5) * dm / m
            for side in (-1, 1):
                u = side * (wm / 2 + 0.05)
                acc.box(f.p(u, v - dm / m / 2 + 0.2, zc), (0.2, 0.3, hh), cols["pilaster"], yaw)
                if lod == 0:
                    a = accents[(i + k * 2 + (side > 0)) % len(accents)]
                    acc.box(f.p(u + side * 0.12, v, zc + hh * 0.12), (0.34, 0.62, hh * 0.62), a, yaw, top=(0.22, 0.34))
    # Crown: a barrel vault along u with rounded ends and gold finials.
    zt = base_h + rise * tiers
    vw = w1 * 0.92
    vr = min(d1 * 0.5, crown_h)
    segs = 10 if lod == 0 else (6 if lod == 1 else 4)
    crown = cols["crown"]
    acc.box(f.p(0, 0, zt), (vw + 0.4, d1 + 0.3, 0.4), cornice, yaw)
    zb = zt + 0.4
    prev = None
    for k in range(segs + 1):
        a = math.pi * k / segs
        vv, zz = math.cos(a) * vr, math.sin(a) * crown_h
        cur = (vv, zz)
        if prev is not None:
            acc.face([f.p(-vw / 2, prev[0], zb + prev[1]), f.p(-vw / 2, cur[0], zb + cur[1]), f.p(vw / 2, cur[0], zb + cur[1]), f.p(vw / 2, prev[0], zb + prev[1])][::-1], crown)
        prev = cur
    for side in (-1, 1):
        pts = [f.p(side * vw / 2, math.cos(math.pi * k / segs) * vr, zb + math.sin(math.pi * k / segs) * crown_h) for k in range(segs + 1)]
        acc.face(pts if side > 0 else pts[::-1], crown)
        # Horn-like end ornaments of the vault (simple tapered blocks).
        if lod < 2:
            acc.box(f.p(side * (vw / 2 + 0.3), 0, zb), (0.6, 1.2, crown_h * 1.15), cornice, yaw, top=(0.2, 0.5))
    finials = g.get("finials", 7) if lod < 2 else 3
    profile = [(0.0, 0.0), (0.42, 0.05), (0.5, 0.3), (0.36, 0.55), (0.14, 0.66), (0.24, 0.76), (0.07, 0.93), (0.0, 1.0)]
    for k in range(finials):
        u = -vw / 2 + 0.8 + (vw - 1.6) * (k / max(1, finials - 1))
        p = f.p(u, 0, zb + crown_h - 0.15)
        acc.lathe(p, [(r * finial_h * 0.6, h * finial_h) for r, h in profile], cols["gold"], sides=8 if lod == 0 else 5)
    # Collision: the tower above the base as one tapered block (a box at mid width).
    out_collision.append((f.p(0, 0, (base_h + zt) / 2), (w0 * 0.8, d0 * 0.85, zt - base_h), yaw))
    return f


def wall(acc, col, spec, w, gates, lod, cols):
    """The compound wall: white runs between the gateways, with ochre vertical bands painted on
    both faces (thin panels, two triangles each) and a coping."""
    ring = lkit.offset(lkit.part_ring(spec, w["part"]), -w.get("inset", 0.5))
    h, t = w["height"], w["thickness"]
    stripe = w["stripe"]
    piece = 1.0
    runs = []
    for a, b, L, u, n in lkit.edges(ring):
        yaw = math.atan2(u.y, u.x)
        steps = max(1, int(round(L / piece)))
        seg = L / steps
        run = None
        for k in range(steps):
            mid = a + u * (seg * (k + 0.5))
            if any(g.contains(mid) for g in gates):
                if run:
                    runs.append(run)
                run = None
                continue
            if run is None:
                run = [mid - u * seg / 2, mid + u * seg / 2, yaw, u, n]
            else:
                run[1] = mid + u * seg / 2
        if run:
            runs.append(run)
    for s, e, yaw, u, n in runs:
        m = (s + e) / 2
        L = (e - s).length
        acc.box((m.x, m.y, 0.0), (L, t, h), cols["wall_white"], yaw)
        acc.box((m.x, m.y, h), (L, t + 0.3, 0.35), cols["coping"], yaw)
        col.append(((m.x, m.y, h / 2), (L, t, h), yaw))
        if lod == 2:
            continue
        sw = stripe if lod == 0 else stripe * 3
        k = int(L / (2 * sw))
        for i in range(k):
            a0 = s + u * (sw * (2 * i + 0.5))
            for side in (1, -1):
                nn = n * side
                base = a0 + nn * (t / 2)
                uu = u if side > 0 else -u
                start = base if side > 0 else base + u * sw
                lkit.vface(acc, start, uu, 0.45, sw, h - 0.9, 0.02, cols["wall_ochre"], normal=nn)


class Gate:
    """A gopuram footprint (frame and half sizes) that opens the wall."""

    def __init__(self, f, hw, hd):
        self.f, self.hw, self.hd = f, hw, hd

    def contains(self, p):
        d = Vector(p) - self.f.c
        return abs(d.dot(self.f.u)) <= self.hw and abs(d.dot(self.f.v)) <= self.hd


def vimana(acc, col, spec, v, lod, cols):
    c = Vector(lkit.part_centre(spec, v["part"]))
    yaw = lkit.part_yaw(spec, v["part"])
    L, S = lkit.part_rect(spec, v["part"])
    side = min(L, S) * v.get("size", 0.55)
    H = v["height"]
    base = v.get("base_height", 5.0)
    acc.box((c.x, c.y, 0), (side, side, base), cols["stone"], yaw)
    acc.box((c.x, c.y, base), (side + 0.6, side + 0.6, 0.5), cols["cornice"], yaw)
    tiers = v["tiers"]
    dome_h = (H - base) * 0.28
    rise = (H - base - dome_h - 1.6) / tiers
    s = side
    for i in range(tiers):
        z = base + 0.5 + rise * i
        s1 = s * 0.8
        acc.box((c.x, c.y, z), (s, s, rise * 0.8), lkit.hex_to_linear(v["colours"][i % len(v["colours"])]), yaw, top=(s1, s1))
        acc.box((c.x, c.y, z + rise * 0.8), (s1 + 0.5, s1 + 0.5, rise * 0.2), cols["cornice"], yaw)
        s = s1
    z = base + 0.5 + rise * tiers
    acc.dome((c.x, c.y, z), s * 0.62, dome_h, cols["gold"] if v.get("gilded") else cols["crown"], sides=8 if lod == 0 else 4, rings=3 if lod == 0 else 2)
    acc.lathe((c.x, c.y, z + dome_h - 0.1), [(0, 0), (0.35, 0.1), (0.4, 0.5), (0.12, 0.9), (0.0, 1.6)], cols["gold"], sides=6 if lod < 2 else 4)
    col.append(((c.x, c.y, (base + 0.5 + z) / 2), (side, side, z - 0.5), yaw))


def hall(acc, col, spec, part, hp, lod, cols):
    ring = lkit.part_ring(spec, part)
    h = hp["height"]
    inner = lkit.offset(ring, -hp.get("verandah", 1.2))
    acc.prism(inner, 0.0, h - 0.6, cols["hall_wall"], top=False)
    acc.prism(ring, h - 0.6, h, cols["stone_light"], top_colour=cols["roof"])
    if lod < 2:
        acc.band(ring, h - 0.05, h + 0.45, 0.0, cols["coping"])
    if lod == 0:
        sp = hp["pillar_spacing"]
        for a, b, L, u, n in lkit.edges(lkit.offset(ring, -0.35)):
            k = max(1, int(L / sp))
            for i in range(k + 1):
                p = a + u * (L * i / k)
                acc.box((p.x, p.y, 0), (0.42, 0.42, h - 0.6), cols["pillar"], math.atan2(u.y, u.x))
    for a, b, L, u, n in lkit.edges(inner):
        m = (a + b) / 2
        col.append(((m.x, m.y, h / 2), (L, 0.6, h), math.atan2(u.y, u.x)))


def flagstaff(acc, col, spec, fp, lod, cols):
    a = Vector(lkit.part_centre(spec, fp["between"][0]))
    b = Vector(lkit.part_centre(spec, fp["between"][1]))
    p = a + (b - a) * fp["at"]
    H = fp["height"]
    acc.box((p.x, p.y, 0), (2.4, 2.4, 1.2), cols["stone"], 0.0)
    acc.cylinder((p.x, p.y, 1.2), 0.32, 0.22, H - 2.0, cols["gold"], sides=8 if lod == 0 else 5)
    if lod < 2:
        for k in range(3):
            acc.box((p.x, p.y, H - 0.8 - k * 0.45), (1.1, 0.3, 0.12), cols["gold"], 0.0)
    acc.cylinder((p.x, p.y, H - 0.8), 0.25, 0.0, 0.8, cols["gold"], sides=6)
    col.append(((p.x, p.y, H / 2), (0.6, 0.6, H), 0.0))


def tank(acc, col, spec, tp, lod, cols):
    ring = lkit.part_ring(spec, tp["part"])
    steps = tp["steps"] if lod == 0 else (tp["steps"] // 2 if lod == 1 else 2)
    rise = tp["rise"] * tp["steps"] / steps
    tread = tp["tread"] * tp["steps"] / steps
    z = tp.get("rim", 0.05)
    outer = ring
    for i in range(steps):
        inner = lkit.offset(ring, -tread * (i + 1))
        colour = cols["step_red"] if (i % 2 == 0 and lod < 2) else cols["step_white"]
        # Riser down from the previous level, then the tread.
        acc.prism(outer, z - rise, z, colour, top=False)
        _ring(acc, outer, inner, z - rise, colour)
        outer = inner
        z -= rise
    m = tp["mandapam"]
    c = Vector(lkit.part_centre(spec, tp["part"]))
    yaw = lkit.part_yaw(spec, tp["part"])
    s, H = m["size"], m["height"]
    z0 = -0.75  # the city's water surface (G-152)
    acc.box((c.x, c.y, z0 - 0.2), (s + 1.2, s + 1.2, 1.1), cols["stone_dark"], yaw)
    n = 4
    f = lkit.Frame(c, yaw)
    if lod < 2:
        for i in range(n):
            for j in range(n):
                acc.box(f.p(-s / 2 + 0.5 + i * (s - 1) / (n - 1), -s / 2 + 0.5 + j * (s - 1) / (n - 1), z0 + 0.9), (0.5, 0.5, H * 0.45), cols["stone"], yaw)
    else:
        acc.box(f.p(0, 0, z0 + 0.9), (s - 1.2, s - 1.2, H * 0.45), cols["stone"], yaw)
    zr = z0 + 0.9 + H * 0.45
    acc.box(f.p(0, 0, zr), (s + 0.6, s + 0.6, 0.6), cols["stone_light"], yaw)
    acc.box(f.p(0, 0, zr + 0.6), (s * 0.55, s * 0.55, H * 0.25), m.get("colour") and lkit.hex_to_linear(m["colour"]) or cols["stone"], yaw, top=(s * 0.35, s * 0.35))
    acc.dome(f.p(0, 0, zr + 0.6 + H * 0.25), s * 0.2, H * 0.14, cols["crown"], sides=8 if lod == 0 else 4, rings=2)
    acc.cylinder(f.p(0, 0, zr + 0.6 + H * 0.39), 0.18, 0.0, 0.9, cols["gold"], sides=6)


def _ring(acc, outer, inner, z, colour):
    o, i = lkit._ccw(outer), lkit._ccw(inner)
    for k in range(len(o)):
        j = (k + 1) % len(o)
        acc.face([(o[k][0], o[k][1], z), (o[j][0], o[j][1], z), (i[j][0], i[j][1], z), (i[k][0], i[k][1], z)], colour)


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    cols = lkit.colours(spec)
    cols.setdefault("shadow", lkit.hex_to_linear(SHADOW))
    gates = []
    for g in p["gopurams"]:
        f = gopuram(acc, col, spec, g, lod, cols, col)
        w, d = lkit.part_rect(spec, g["part"])
        gates.append(Gate(f, w * g.get("scale", 1.0) / 2 + 0.3, d * g.get("scale", 1.0) / 2 + 1.5))
    wall(acc, col, spec, p["wall"], gates, lod, cols)
    for v in p["vimanas"]:
        vimana(acc, col, spec, v, lod, cols)
    for part in p["halls"]["parts"]:
        hall(acc, col, spec, part, p["halls"], lod, cols)
    flagstaff(acc, col, spec, p["flagstaff"], lod, cols)
    tank(acc, col, spec, p["tank"], lod, cols)


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__))
