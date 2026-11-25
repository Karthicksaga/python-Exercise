"""
Kit `hero_station`: Chennai Egmore as a hero model (G-390): an Indo-Saracenic brick terminus on its
OSM outline, detailed by texture rather than by triangles.

    blender -b --factory-startup --python tools/blender/landmarks/hero_station.py [-- ID ...]

What it draws (LOD0 under 6,000 triangles, LOD1 under 1,500, LOD2 a painted box):
* the main block and the west wing on their OSM outlines, one quad per bay and storey: the atlas
  paints the brick, the cream arched openings, the arcade and the balustrade on those quads;
* plinth, floor string course and cornice as cream bands, a blind-arch frieze under the cornice,
  slim pilasters every third bay and a row of small cream finials on the parapet;
* two domed porch towers on the OSM porches (square shafts, cream stage ledges, an octagonal drum, an
  onion dome with four corner kiosks), a clock on all four faces of one of them, a carriage-porch
  portal on the south face of each: these are the entrances (`ENTRANCE_n` empties in the GLB);
* the three-span train shed on its OSM outline: barrel-vault sheet roofs, lattice end walls and
  cross trusses, columns (only the columns collide);
* the roof board for the real public name (the game adds the letters, as in `station`).
Nothing stands more than 0.3 m (a pilaster's depth) outside the OSM outline at ground level.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import atlas as A  # noqa: E402
import lkit  # noqa: E402
from atlas import T  # noqa: E402
from mathutils import Vector  # noqa: E402

LAYOUT = {
    "bay_ground": (0, 0, 2, 3), "bay_upper": (2, 0, 2, 3), "tower_wall": (4, 0, 2, 3), "tower_porch": (6, 0, 2, 3),
    "facade_far": (0, 3, 3, 3), "cream": (3, 3, 1, 1), "moulding": (4, 3, 2, 1), "frieze": (6, 3, 2, 1),
    "dome": (3, 4, 1, 1), "brick": (4, 4, 2, 2), "roof_flat": (6, 4, 1, 1), "gold": (7, 4, 1, 1),
    "chhatri": (3, 5, 1, 1), "shed_roof": (6, 5, 2, 1), "shed_truss": (0, 6, 2, 2), "steel": (2, 6, 1, 1),
    "column": (3, 6, 1, 1), "sign": (4, 6, 2, 1), "clock": (6, 6, 2, 2),
}


def layout(spec):
    return LAYOUT


def paint(spec, sheet):
    c = {k: A.rgb(v) for k, v in spec["colours"].items()}
    brick, cream, dark, shade = c["brick"], c["band"], c["opening"], c["dome_shade"]
    mortar = brick * 0.62 + cream * 0.1
    mortar[3] = 1.0
    wood = A.rgb("#3a2a20")

    def surround(t, x0, x1, spring, bottom, pad, col):
        A.arch(t, x0 - pad, x1 + pad, bottom + pad * 0.5, spring, col)

    t = sheet.view("brick")
    A.bricks(t, brick, mortar, 16, 6, 3)
    for name, spec_ in (("bay_ground", 0), ("bay_upper", 1)):
        t = sheet.view(name)
        A.bricks(t, brick, mortar, 24, 6, 11 + spec_)
        A.rect(t, 0.0, 0.0, 0.035, 1.0, brick * 0.85 + cream * 0.05)   # pilaster edge shading
        A.rect(t, 0.965, 0.0, 1.0, 1.0, brick * 0.85 + cream * 0.05)
        if spec_ == 0:
            A.rect(t, 0.0, 0.93, 1.0, 1.0, cream)                          # plinth
            surround(t, 0.24, 0.76, 0.36, 0.82, 0.07, cream)
            A.arch(t, 0.24, 0.76, 0.82, 0.36, dark)
            A.rect(t, 0.495, 0.36, 0.505, 0.82, cream * 0.8)               # mullion
            A.rect(t, 0.20, 0.80, 0.80, 0.85, cream)                       # sill
        else:
            A.rect(t, 0.0, 0.0, 0.07, 1.0, cream)                          # slim columns at the bay edges
            A.rect(t, 0.93, 0.0, 1.0, 1.0, cream)
            surround(t, 0.16, 0.84, 0.32, 0.74, 0.05, cream)
            A.arch(t, 0.16, 0.84, 0.74, 0.32, dark)
            A.rect(t, 0.07, 0.74, 0.93, 0.96, cream)                       # balustrade
            for i in range(9):
                A.rect(t, 0.12 + i * 0.095, 0.77, 0.15 + i * 0.095, 0.93, shade)
            A.rect(t, 0.0, 0.0, 1.0, 0.025, cream)                         # string course lines
    t = sheet.view("tower_wall")
    A.bricks(t, brick, mortar, 30, 6, 21)
    A.rect(t, 0.0, 0.0, 0.08, 1.0, cream)                                  # quoins
    A.rect(t, 0.92, 0.0, 1.0, 1.0, cream)
    surround(t, 0.30, 0.70, 0.30, 0.66, 0.06, cream)
    A.arch(t, 0.30, 0.70, 0.66, 0.30, dark)
    for k in range(5):
        A.rect(t, 0.34 + k * 0.08, 0.34, 0.355 + k * 0.08, 0.66, cream * 0.7)  # louvre
    A.rect(t, 0.0, 0.76, 1.0, 0.80, cream)
    A.rect(t, 0.0, 0.94, 1.0, 1.0, cream)
    t = sheet.view("tower_porch")
    A.bricks(t, brick, mortar, 30, 6, 31)
    A.rect(t, 0.0, 0.0, 0.07, 1.0, cream)
    A.rect(t, 0.93, 0.0, 1.0, 1.0, cream)
    surround(t, 0.16, 0.84, 0.30, 1.0, 0.07, cream)
    A.arch(t, 0.16, 0.84, 1.0, 0.30, wood)
    A.arch(t, 0.24, 0.76, 0.46, 0.30, dark * 0.8 + cream * 0.1)            # fanlight
    for k in range(8):
        A.rect(t, 0.17 + k * 0.0825, 0.50, 0.175 + k * 0.0825, 1.0, wood * 0.6)  # door planks
    A.rect(t, 0.495, 0.50, 0.505, 1.0, dark)
    A.rect(t, 0.0, 0.0, 1.0, 0.03, cream)
    t = sheet.view("facade_far")
    A.bricks(t, brick, mortar, 18, 8, 41)
    A.rect(t, 0.0, 0.47, 1.0, 0.52, cream)
    A.rect(t, 0.0, 0.93, 1.0, 1.0, cream)
    for f, (lo, hi) in enumerate(((0.55, 0.90), (0.06, 0.44))):
        for k in range(3):
            x0 = k / 3 + 0.07
            A.arch(t, x0, x0 + 0.2, hi, lo + 0.1, cream)
            A.arch(t, x0 + 0.02, x0 + 0.18, hi - 0.02, lo + 0.1, dark)
    t = sheet.view("cream")
    A.fill(t, cream)
    A.grain(t, 0.06, 51)
    t = sheet.view("moulding")
    A.fill(t, cream)
    for y in (0.15, 0.3, 0.7, 0.85):
        A.rect(t, 0.0, y, 1.0, y + 0.07, shade)
    A.grain(t, 0.05, 52)
    t = sheet.view("frieze")
    A.fill(t, cream)
    for k in range(2):
        x0 = k / 2 + 0.05
        A.arch(t, x0, x0 + 0.4, 1.0, 0.55, brick)
        A.arch(t, x0 + 0.04, x0 + 0.36, 1.0, 0.58, cream * 0.9 + brick * 0.1)
    A.rect(t, 0.0, 0.0, 1.0, 0.12, shade)
    t = sheet.view("dome")
    A.fill(t, cream)
    A.rect(t, 0.0, 0.0, 0.06, 1.0, shade)
    A.rect(t, 0.94, 0.0, 1.0, 1.0, shade)
    A.rect(t, 0.0, 0.82, 1.0, 1.0, shade * 0.95)     # the bottom edge of the facet is v = 0 (row 1.0)
    A.grain(t, 0.05, 53)
    t = sheet.view("roof_flat")
    A.fill(t, c["roof"])
    A.grain(t, 0.12, 54)
    t = sheet.view("gold")
    A.fill(t, c["gold"])
    t = sheet.view("chhatri")
    A.fill(t, cream)
    for k in range(3):
        A.arch(t, 0.08 + k * 0.30, 0.30 + k * 0.30, 0.95, 0.40, dark)
    t = sheet.view("shed_roof")
    A.fill(t, c["shed_roof"])
    for k in range(24):
        A.rect(t, k / 24, 0.0, k / 24 + 0.012, 1.0, c["shed_roof"] * 0.78)
    A.grain(t, 0.10, 55)
    t = sheet.view("shed_truss")
    A.fill(t, c["shed"] * 0.55)
    for k in range(-4, 9):
        A.line(t, k / 6, 1.0, k / 6 + 0.17, 0.0, 2.0, c["shed"] * 0.95)
        A.line(t, k / 6 + 0.17, 1.0, k / 6, 0.0, 2.0, c["shed"] * 0.95)
    A.rect(t, 0.0, 0.0, 1.0, 0.05, c["shed"])
    t = sheet.view("steel")
    A.fill(t, c["shed"] * 0.8)
    A.grain(t, 0.1, 56)
    t = sheet.view("column")
    A.fill(t, A.rgb("#4b5a52"))
    A.rect(t, 0.0, 0.0, 1.0, 0.08, A.rgb("#6d7b72"))
    A.rect(t, 0.0, 0.92, 1.0, 1.0, A.rgb("#6d7b72"))
    t = sheet.view("sign")
    A.fill(t, A.rgb("#f2efe6"))
    A.rect(t, 0.0, 0.0, 1.0, 0.07, A.rgb("#1f2a44"))
    A.rect(t, 0.0, 0.93, 1.0, 1.0, A.rgb("#1f2a44"))
    t = sheet.view("clock")
    A.fill(t, cream)
    A.circle(t, 0.5, 0.5, 52, A.rgb("#3a3128"))
    A.circle(t, 0.5, 0.5, 47, A.rgb("#f6f2e6"))
    for k in range(12):
        a = k * math.pi / 6
        A.line(t, 0.5 + 0.34 * math.sin(a), 0.5 - 0.34 * math.cos(a), 0.5 + 0.39 * math.sin(a), 0.5 - 0.39 * math.cos(a), 3.0, A.rgb("#3a3128"))
    A.line(t, 0.5, 0.5, 0.5 + 0.2 * math.sin(math.radians(305)), 0.5 - 0.2 * math.cos(math.radians(305)), 4.0, A.rgb("#2a231c"))  # hour hand, ten past ten
    A.line(t, 0.5, 0.5, 0.5 + 0.32 * math.sin(math.radians(60)), 0.5 - 0.32 * math.cos(math.radians(60)), 3.0, A.rgb("#2a231c"))   # minute hand
    A.circle(t, 0.5, 0.5, 4, A.rgb("#2a231c"))


def _front(p):
    return Vector((0.0, -1.0)) if p.get("front", "south") == "south" else Vector((0.0, 1.0))


def _span(ring, f):
    us = [(Vector(q) - f.c).dot(f.u) for q in ring]
    vs = [(Vector(q) - f.c).dot(f.v) for q in ring]
    return min(us), max(us), min(vs), max(vs)


def tint(i, amount=0.05):
    v = 1.0 - amount + amount * 2 * (((i * 2654435761) >> 8) % 1000) / 1000.0
    return (v, v, v, 1.0)


def pyramid(acc, c, s, z, h, tile):
    base = [(c[0] - s, c[1] - s, z), (c[0] + s, c[1] - s, z), (c[0] + s, c[1] + s, z), (c[0] - s, c[1] + s, z)]
    top = (c[0], c[1], z + h)
    for i in range(4):
        acc.face([base[i], base[(i + 1) % 4], top], tile)


def shared_edge(a, b, rings):
    """True when edge a-b lies on another ring's edge (two buildings' party wall: not drawn)."""
    for r in rings:
        n = len(r)
        for i in range(n):
            c, d = Vector(r[i]), Vector(r[(i + 1) % n])
            if (a - d).length < 0.4 and (b - c).length < 0.4:
                return True
    return False


def walls(acc, ring, others, p, lod, eaves):
    sh = p["storey_height"]
    bay = p["bay"]
    for ei, (a, b, L, u, n) in enumerate(lkit.edges(ring)):
        if shared_edge(a, b, others):
            continue
        if L < 3.0:
            acc.strip(a, b, 0.0, eaves, 0.0, eaves, T("brick"), 4.0)
            continue
        if lod == 2:
            acc.strip(a, b, 0.0, eaves, 0.0, eaves, T("facade_far"), 3 * bay * 2)
            continue
        if lod == 1:
            acc.strip(a, b, 0.0, 2 * sh, 0.0, 2 * sh, T("facade_far"), 3 * bay)
            acc.strip(a, b, 2 * sh, eaves, 2 * sh, eaves, T("cream"), 20.0)
            continue
        k = max(1, round(L / bay))
        w = L / k
        for i in range(k):
            s, e = a + u * (w * i), a + u * (w * (i + 1))
            tn = tint(ei * 97 + i)
            acc.face([(s.x, s.y, 0.0), (e.x, e.y, 0.0), (e.x, e.y, sh), (s.x, s.y, sh)], T("bay_ground", tn))
            acc.face([(s.x, s.y, sh), (e.x, e.y, sh), (e.x, e.y, 2 * sh - 0.4), (s.x, s.y, 2 * sh - 0.4)], T("bay_upper", tn))
            if i % 3 == 1 and L > 12:
                # A slim pilaster on the bay line: front and two sides.
                q = s + n * 0.0
                lkit_pilaster(acc, q, u, n, eaves - 1.4)
        acc.strip(a, b, 2 * sh - 0.4, eaves - 0.6, 2 * sh - 0.4, eaves - 0.6, T("frieze"), 2 * bay)


def lkit_pilaster(acc, q, u, n, h):
    w = 0.5
    d = 0.3
    a = q - u * (w / 2)
    b = q + u * (w / 2)
    a2, b2 = a + n * d, b + n * d
    acc.face([(a2.x, a2.y, 0.0), (b2.x, b2.y, 0.0), (b2.x, b2.y, h), (a2.x, a2.y, h)], T("cream"))
    acc.face([(a.x, a.y, 0.0), (a2.x, a2.y, 0.0), (a2.x, a2.y, h), (a.x, a.y, h)][::-1], T("cream"))
    acc.face([(b.x, b.y, 0.0), (b2.x, b2.y, 0.0), (b2.x, b2.y, h), (b.x, b.y, h)], T("cream"))


def bands(acc, ring, others, p, eaves, lod):
    sh = p["storey_height"]
    if lod >= 2:
        return
    # Plinth, floor string course, cornice (cream, stretch-proof tiles).
    for z0, z1, out in ((0.0, 0.9, 0.12), (sh - 0.25, sh + 0.25, 0.14), (eaves - 0.6, eaves, 0.4)):
        if lod == 1 and z0 < 1.0:
            continue
        acc.band(ring, z0, z1, out, T("moulding"))


def finials(acc, ring, others, p, eaves):
    bay = p["bay"]
    for a, b, L, u, n in lkit.edges(ring):
        if L < 6.0 or shared_edge(a, b, others):
            continue
        k = max(1, round(L / bay))
        w = L / k
        for i in range(k):
            m = a + u * (w * (i + 0.5)) + n * 0.1
            pyramid(acc, (m.x, m.y), 0.28, eaves, 0.95, T("cream"))


def kiosk(acc, q, z, s, lod):
    """A small domed kiosk: a cream box with painted arches, a slab and a dome."""
    acc.box((q[0], q[1], z), (s, s, s * 0.9), T("chhatri"), 0.0)
    acc.box((q[0], q[1], z + s * 0.9), (s * 1.15, s * 1.15, 0.15), T("cream"), 0.0)
    acc.dome((q[0], q[1], z + s * 1.05), s * 0.5, s * 0.6, T("dome"), sides=6, rings=2, onion=0.2, tip=0.3)


def tower(acc, col, f, at, front_v, fs, t, lod, hooks):
    size = t["size"]
    eaves = t["eaves"]
    c = f.p(at, front_v - fs * size / 2)
    fb = lkit.Frame((c[0], c[1]), f.yaw)
    h = size / 2
    corners = [fb.c + fb.u * (sx * h) + fb.v * (sy * h) for sx, sy in ((1, -1), (1, 1), (-1, 1), (-1, -1))]  # ccw
    # the face whose outward normal is the front (toward fs * f.v)
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        d = (b - a).normalized()
        nrm = Vector((d.y, -d.x))
        front = nrm.dot(f.v * fs) > 0.7
        if lod == 2:
            acc.face([(a.x, a.y, 0.0), (b.x, b.y, 0.0), (b.x, b.y, eaves), (a.x, a.y, eaves)], T("tower_wall"))
            continue
        z1 = 7.0
        acc.face([(a.x, a.y, 0.0), (b.x, b.y, 0.0), (b.x, b.y, z1), (a.x, a.y, z1)], T("tower_porch" if front else "bay_ground"))
        acc.face([(a.x, a.y, z1), (b.x, b.y, z1), (b.x, b.y, eaves), (a.x, a.y, eaves)], T("tower_wall"))
        if front:
            m = (a + b) / 2 + nrm * 0.15
            hooks.append({"id": "porch_%d" % len(hooks), "blender": (m.x, m.y), "normal": (nrm.x, nrm.y)})
    if lod == 2:
        acc.dome((c[0], c[1], eaves), size * 0.34, t["cap"] - 1.0, T("dome"), sides=6, rings=2, onion=0.18, tip=0.8)
        col.append(((c[0], c[1], eaves / 2), (size, size, eaves), f.yaw))
        return
    for z, grow, hh in ((7.0, 0.30, 0.45), (12.0, 0.30, 0.4), (eaves - 0.7, 0.9, 0.7)):
        acc.box((c[0], c[1], z), (size + grow, size + grow, hh), T("moulding"), f.yaw)
    if t.get("clock"):
        r = t["clock"]["diameter"] / 2
        zc = t["clock"]["z"]
        for k in range(4):
            a, b = corners[k], corners[(k + 1) % 4]
            d = (b - a).normalized()
            nrm = Vector((d.y, -d.x))
            m = (a + b) / 2 + nrm * 0.12
            p0, p1 = m - d * r, m + d * r
            acc.face([(p0.x, p0.y, zc - r), (p1.x, p1.y, zc - r), (p1.x, p1.y, zc + r), (p0.x, p0.y, zc + r)], T("clock"))
    drum = size * 0.34
    acc.cylinder((c[0], c[1], eaves), drum, drum, 1.9, T("cream"), sides=8, top=False)
    acc.cylinder((c[0], c[1], eaves + 1.9), drum * 1.12, drum * 1.12, 0.35, T("moulding"), sides=8, top=True)
    acc.dome((c[0], c[1], eaves + 2.25), drum * 1.05, t["cap"] - 3.2, T("dome"), sides=8, rings=4 if lod == 0 else 2, onion=0.2, tip=1.0)
    acc.cylinder((c[0], c[1], eaves + t["cap"] - 0.95), 0.08, 0.02, 1.3, T("gold"), sides=4)
    if lod == 0:
        for sx in (-1, 1):
            for sy in (-1, 1):
                q = fb.p(sx * (h + 0.05 - 0.6), sy * (h + 0.05 - 0.6))
                kiosk(acc, q, eaves + 0.7, 1.5, lod)
    col.append(((c[0], c[1], eaves / 2), (size, size, eaves), f.yaw))
    return corners


def shed(acc, col, spec, sp, lod):
    ring = lkit.part_ring(spec, sp["part"])
    c = lkit.part_centre(spec, sp["part"])
    yaw = lkit.part_yaw(spec, sp["part"])
    f = lkit.Frame(c, yaw)
    u0, u1, v0, v1 = _span(ring, f)
    L, D = u1 - u0, v1 - v0
    spans, h, rise = sp["spans"], sp["height"], sp["rise"]
    segs = 6 if lod == 0 else (3 if lod == 1 else 1)
    sw = D / spans
    piece = 24.0
    kk = max(1, math.ceil(L / piece))
    for s in range(spans):
        va = v0 + sw * s
        prev = None
        for k in range(segs + 1):
            t = k / segs
            cur = (va + sw * t, h + rise * math.sin(math.pi * t))
            if prev is not None:
                tile = T("shed_roof") if lod < 2 else T("steel")
                step = L if lod == 2 else piece
                for i in range(1 if lod == 2 else kk):
                    ua = u0 + i * step
                    ub = min(u1, ua + step)
                    fu = (ub - ua) / step
                    tl = A.Tile(tile.name, tile.tint, (0.0, fu), (0.0, 1.0))
                    acc.face([f.p(ua, prev[0], prev[1]), f.p(ub, prev[0], prev[1]), f.p(ub, cur[0], cur[1]), f.p(ua, cur[0], cur[1])], tl)
            prev = cur
    if lod == 2:
        return
    rows = spans + 1
    n = max(2, int(L / sp["column_spacing"]) + 1)

    def vault(u, s, tile, thick):
        """A lattice wall in the vault's profile at distance u along the shed."""
        va = v0 + sw * s
        pts = []
        for k in range(segs + 1):
            t = k / segs
            pts.append(f.p(u, va + sw * t, h + rise * math.sin(math.pi * t) - 0.05))
        pts.append(f.p(u, va + sw, h - 0.6))
        pts.append(f.p(u, va, h - 0.6))
        acc.face(pts, tile)
        acc.face(pts[::-1], tile)

    for s in range(spans):
        vault(u0 + 0.05, s, T("shed_truss"), 0.0)
        vault(u1 - 0.05, s, T("shed_truss"), 0.0)
        if lod == 0:
            for i in range(1, kk):
                vault(u0 + L * i / kk, s, T("shed_truss"), 0.0)
    for r in range(rows):
        vv = min(max(v0 + sw * r, v0 + 0.4), v1 - 0.4)
        if lod == 0:
            acc.box(f.p((u0 + u1) / 2, vv, h - 0.7), (L, 0.4, 0.7), T("steel"), yaw)
        for i in range(n):
            uu = u0 + 0.4 + (L - 0.8) * i / (n - 1)
            p = f.p(uu, vv)
            if lod == 0:
                acc.box(p, (0.4, 0.4, h - 0.7), T("column"), yaw)
            col.append(((p[0], p[1], h / 2), (0.4, 0.4, h), yaw))


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    main = p["part"]
    ring = lkit.part_outline(spec, main)
    c = lkit.part_centre(spec, main)
    yaw = lkit.part_yaw(spec, main)
    f = lkit.Frame(c, yaw)
    front = _front(p)
    fs = 1.0 if f.v.dot(front) > 0 else -1.0
    u0, u1, v0, v1 = _span(ring, f)
    sh = p["storey_height"]
    eaves = p["storeys"] * sh + 0.8
    rings = [ring] + [lkit.part_outline(spec, x) for x in p.get("extra_parts", [])]
    for r in rings:
        others = [q for q in rings if q is not r]
        walls(acc, r, others, p, lod, eaves)
        bands(acc, r, others, p, eaves, lod)
        acc.cap(r, eaves, T("roof_flat"))
        if lod == 0:
            finials(acc, r, others, p, eaves)
        lkit.wall_collision(col, r, eaves)
    front_v = v1 if fs > 0 else v0
    half_u = (u1 - u0) / 2
    mid_u = (u0 + u1) / 2
    hooks = []
    for t in p.get("towers", []):
        at = mid_u + t["at"] * (half_u - t["size"] / 2)
        tower(acc, col, f, at, front_v, fs, t, lod, hooks)
    n = p.get("skyline_chhatris", 0)
    if n and lod == 0:
        for i in range(n):
            uu = u0 + 3 + (u1 - u0 - 6) * i / max(1, n - 1)
            kiosk(acc, f.p(uu, front_v - fs * 1.4), eaves, 1.5, lod)
    for sign in spec.get("signs", []):
        if lod == 2:
            break
        at = mid_u + sign["at"] * half_u
        h = sign.get("height", 1.5)
        q = f.p(at, front_v - fs * 2.0)
        w = 26.0
        acc.box((q[0], q[1], eaves + 0.6), (w, 0.25, 2 * h + 0.8), T("sign"), yaw)
        for s in (-1, 1):
            pq = f.p(at + s * w * 0.4, front_v - fs * 2.6)
            acc.box((pq[0], pq[1], eaves), (0.15, 0.15, 1.0), T("steel"), yaw)
    if "shed" in p:
        shed(acc, col, spec, p["shed"], lod)
    if lod == 0:
        ox, oz = spec["origin"]
        for h in hooks:
            print("HOOK %s world %.2f %.2f normal %.3f %.3f" % (spec["id"], h["blender"][0] + ox, -h["blender"][1] + oz, h["normal"][0], -h["normal"][1]))


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__), atlas=(layout, paint))
