"""
Kit `hero_flyover`: Kathipara Junction as a detail layer on the road decks the chunk builder already
draws (G-390).

    blender -b --factory-startup --python tools/blender/landmarks/hero_flyover.py [-- ID ...]

`DeckMeshes` (G-151) builds the deck slab, the 1 m parapets, the fascia and a plain pier and cap beam
for every bridge piece from the world's road data (OSM centre line, width, estimated heights). This
kit does not repeat any of that. It reads a copy of the same road pieces from the spec (`decks`) and
adds what a flyover has on top of those shapes, within `radius` m of the junction:

* coping on both parapets (a slab that overhangs them) and black-and-white painted kerb stripes on
  the parapets' inner faces, laid as repeating tiles;
* a steel expansion-joint plate across the deck over every pier;
* a red-and-white painted guard round the foot of every pier column (the columns are DeckMeshes');
* lamp posts with an arm and a head, every `lamp_spacing` m on alternate sides;
* gantry boards over the carriageways at the arms (the green boards; the game writes the Tamil and
  English letters, `spec.boards`).
Positions follow DeckMeshes' rules (piers every 30 m of the whole road, columns at a quarter of the
width, none on a lower road, no parapet where a ramp leaves a deck), so nothing floats.
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
    "kerb": (0, 0, 2, 1), "concrete": (2, 0, 1, 1), "concrete_dark": (3, 0, 1, 1), "pole": (4, 0, 1, 1),
    "lamp": (5, 0, 1, 1), "white": (6, 0, 1, 1), "pier_band": (0, 1, 2, 2), "joint": (2, 1, 2, 1), "sign_green": (2, 2, 2, 1),
    "steel": (4, 1, 1, 1),
}
Y_ROAD = 0.06
PARAPET = 1.0
MIN_PARAPET = 0.45
MIN_PIER = 2.8
KERB_PIECE = 16.0


def layout(spec):
    return LAYOUT


def paint(spec, sheet):
    c = {k: A.rgb(v) for k, v in spec["colours"].items()}
    t = sheet.view("kerb")  # 16 blocks of 8 px: one 16 m piece of kerb painted in 1 m blocks
    for k in range(16):
        A.rect(t, k / 16, 0.0, (k + 1) / 16, 1.0, c["kerb_black"] if k % 2 == 0 else c["kerb_white"])
    A.grain(t, 0.12, 71)
    t = sheet.view("concrete")
    A.fill(t, c["concrete"])
    A.grain(t, 0.14, 72)
    t = sheet.view("concrete_dark")
    A.fill(t, c["concrete_dark"])
    A.grain(t, 0.14, 73)
    for k in range(1, 6):  # shuttering board lines
        A.rect(t, 0.0, k / 6, 1.0, k / 6 + 0.01, c["concrete_dark"] * 0.82)
    t = sheet.view("pole")
    A.fill(t, A.rgb("#8d949a"))
    A.grain(t, 0.08, 74)
    t = sheet.view("lamp")
    A.fill(t, A.rgb("#cfd3d6"))
    A.rect(t, 0.15, 0.15, 0.85, 0.85, A.rgb("#fff4c8"))
    t = sheet.view("white")
    A.fill(t, A.rgb("#f2f2ee"))
    t = sheet.view("pier_band")  # diagonal red and white (the road-safety guard painted on pier feet)
    A.fill(t, c["kerb_white"])
    fx, fy, w, h = A.grid(t)
    m = (((fx * w + fy * h) / 24.0) % 2.0) < 1.0
    t[m] = c["pier_red"]
    A.grain(t, 0.1, 75)
    t = sheet.view("joint")
    A.fill(t, c["steel"])
    A.rect(t, 0.0, 0.0, 1.0, 0.12, c["steel"] * 1.5)
    A.rect(t, 0.0, 0.88, 1.0, 1.0, c["steel"] * 1.5)
    A.rect(t, 0.0, 0.46, 1.0, 0.54, c["steel"] * 0.6)
    t = sheet.view("sign_green")
    A.fill(t, c["sign_green"])
    A.rect(t, 0.0, 0.0, 1.0, 0.04, c["sign_white"])
    A.rect(t, 0.0, 0.96, 1.0, 1.0, c["sign_white"])
    A.rect(t, 0.0, 0.0, 0.02, 1.0, c["sign_white"])
    A.rect(t, 0.98, 0.0, 1.0, 1.0, c["sign_white"])
    t = sheet.view("steel")
    A.fill(t, c["steel"] * 1.3)
    A.grain(t, 0.1, 76)


# ---------------------------------------------------------------------------- the road data

class Deck:
    def __init__(self, d, ox, oz):
        self.id = d["id"]
        self.width = d["width"]
        self.highway = d["highway"]
        self.bridge = d["bridge"]
        self.step = d["height_step"]
        self.heights = d["heights"]
        self.offset = d["offset_along"]
        self.pts = [Vector((x - ox, -(z - oz))) for x, z in d["points"]]
        self.along = [0.0]
        for i in range(1, len(self.pts)):
            self.along.append(self.along[-1] + (self.pts[i] - self.pts[i - 1]).length)
        self.raised = bool(self.heights)

    def h_along(self, d):
        if not self.heights:
            return 0.0
        last = len(self.heights) - 1
        k = max(0, min(int(d // self.step), last - 1))
        end = min((k + 1) * self.step, self.along[-1])
        span = max(end - k * self.step, 1e-4)
        t = max(0.0, min(1.0, (d - k * self.step) / span))
        return self.heights[k] + (self.heights[k + 1] - self.heights[k]) * t

    def h_seg(self, i, t):
        if not self.heights:
            return 0.0
        a = self.along[i]
        b = self.along[min(i + 1, len(self.along) - 1)]
        return self.h_along(a + (b - a) * t)

    def profile(self):
        """DeckMeshes.profile: the points plus every height sample inside a raised segment."""
        out = []
        n = len(self.pts)
        for i in range(n):
            d = self.along[i]
            out.append((self.pts[i], self.h_along(d), self.offset + d))
            if i == n - 1:
                continue
            d1 = self.along[i + 1]
            k = int(d // self.step) + 1
            while k * self.step < d1 - 0.05:
                s = k * self.step
                t = (s - d) / max(d1 - d, 1e-6)
                out.append((self.pts[i].lerp(self.pts[i + 1], t), self.h_along(s), self.offset + s))
                k += 1
        return out


def seg_near(decks, p, reach, fn):
    for dk in decks:
        for i in range(len(dk.pts) - 1):
            a, b = dk.pts[i], dk.pts[i + 1]
            if min(a.x, b.x) - reach > p.x or max(a.x, b.x) + reach < p.x or min(a.y, b.y) - reach > p.y or max(a.y, b.y) + reach < p.y:
                continue
            ab = b - a
            l2 = ab.length_squared
            t = 0.0 if l2 < 1e-9 else max(0.0, min(1.0, (p - a).dot(ab) / l2))
            if fn(dk, i, t, (a + ab * t - p).length):
                return True
    return False


def on_other_deck(decks, p, deck, h):
    def f(o, i, t, dist):
        return o is not deck and o.id != deck.id and o.raised and dist <= o.width / 2 + 0.2 and abs(o.h_seg(i, t) - h) < 1.6
    return seg_near(decks, p, 20.0, f)


def on_lower_road(decks, p, deck, h, margin):
    def f(o, i, t, dist):
        return o.id != deck.id and o.highway not in ("footway", "steps") and dist <= o.width / 2 + margin and o.h_seg(i, t) < h - 2.5
    return seg_near(decks, p, 24.0, f)


def mitred(pts):
    out = []
    n = len(pts)
    for i in range(n):
        n0 = n1 = Vector((0, 0))
        if i > 0:
            d = (pts[i] - pts[i - 1]).normalized()
            n0 = Vector((d.y, -d.x))
        if i < n - 1:
            d = (pts[i + 1] - pts[i]).normalized()
            n1 = Vector((d.y, -d.x))
        if i == 0:
            out.append(n1)
        elif i == n - 1:
            out.append(n0)
        else:
            m = n0 + n1
            if m.length < 1e-6:
                out.append(n1)
                continue
            m.normalize()
            out.append(m / max(0.5, m.dot(n0)))
    return out


def simplify(prof, tol):
    """Douglas-Peucker on (x, y, height); the ends stay."""
    pts = [(p.x, p.y, h) for p, h, _ in prof]

    def dist(a, b, c):
        ab = Vector(b) - Vector(a)
        L2 = ab.length_squared
        t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, (Vector(c) - Vector(a)).dot(ab) / L2))
        return (Vector(a) + ab * t - Vector(c)).length

    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        worst, wi = 0.0, -1
        for i in range(a + 1, b):
            d = dist(pts[a], pts[b], pts[i])
            if d > worst:
                worst, wi = d, i
        if worst > tol and wi > 0:
            keep[wi] = True
            stack += [(a, wi), (wi, b)]
    return [prof[i] for i in range(len(prof)) if keep[i]]


# ---------------------------------------------------------------------------- emitting

def quad(acc, pts, tile, want):
    n = Vector((0, 0, 0))
    for i in range(4):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % 4])
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    acc.face(pts if n.dot(want) >= 0 else pts[::-1], tile)


def strip(acc, a0, a1, b0, b1, tile, want, piece=None):
    """Quad a0 a1 (bottom) b1 b0 (top), cut into pieces of `piece` m so a repeating tile stays true."""
    L = (Vector(a1[:2]) - Vector(a0[:2])).length
    k = 1 if piece is None else max(1, math.ceil(L / piece - 1e-9))
    for i in range(k):
        t0 = i / k if piece is None else i * piece / L
        t1 = 1.0 if piece is None else min(1.0, (i + 1) * piece / L)
        if piece is not None and i == k - 1:
            t1 = 1.0

        def lerp(p, q, t):
            return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t)
        u1 = 1.0 if piece is None else (t1 - t0) * L / piece
        tl = A.Tile(tile.name, tile.tint, (0.0, u1), (0.0, 1.0))
        quad(acc, [lerp(a0, a1, t0), lerp(a0, a1, t1), lerp(b0, b1, t1), lerp(b0, b1, t0)], tl, want)


def v3(p, z):
    return (p.x, p.y, z)


def collar(acc, c, u, n, hx, hy, h, tile):
    cs = [c - u * hx - n * hy, c + u * hx - n * hy, c + u * hx + n * hy, c - u * hx + n * hy]
    for i in range(4):
        a, b = cs[i], cs[(i + 1) % 4]
        mid = (a + b) / 2 - c
        quad(acc, [v3(a, 0.0), v3(b, 0.0), v3(b, h), v3(a, h)], tile, Vector((mid.x, mid.y, 0.0)))


def lamp(acc, col, base, away, z, lod):
    """A lamp post at `base` (Blender xy) on a parapet at height z; its arm reaches back over the road
    (opposite to `away`, the outward direction)."""
    ph = 6.5
    sides = 4 if lod == 0 else 3
    acc.cylinder((base.x, base.y, z), 0.15, 0.09, ph, T("pole"), sides=sides, top=False, phase=math.pi / 4)
    tip = base - away * 2.2
    ztop = z + ph
    side = Vector((-away.y, away.x)) * 0.5
    if lod == 0:
        arm = [(base.x, base.y, ztop - 0.1), (tip.x, tip.y, ztop + 0.25), (tip.x, tip.y, ztop + 0.4), (base.x, base.y, ztop + 0.1)]
        acc.face(arm, T("pole"))
        acc.face(arm[::-1], T("pole"))
        h0, h1 = tip + side, tip - side
        acc.face([(h0.x, h0.y, ztop + 0.22), (h1.x, h1.y, ztop + 0.22), (h1.x - away.x * 0.9, h1.y - away.y * 0.9, ztop + 0.22), (h0.x - away.x * 0.9, h0.y - away.y * 0.9, ztop + 0.22)][::-1], T("lamp"))
        acc.face([(h0.x, h0.y, ztop + 0.3), (h1.x, h1.y, ztop + 0.3), (h1.x + away.x * 0.9, h1.y + away.y * 0.9, ztop + 0.3), (h0.x + away.x * 0.9, h0.y + away.y * 0.9, ztop + 0.3)], T("steel"))
    else:
        h0, h1 = tip + side, tip - side
        acc.face([(h0.x, h0.y, ztop + 0.2), (h1.x, h1.y, ztop + 0.2), (base.x, base.y, ztop + 0.2)], T("lamp"))
    col.append(((base.x, base.y, z + ph / 2), (0.3, 0.3, ph), 0.0))


def gantry(acc, col, spec, b, decks, lod):
    ox, oz = spec["origin"]
    dk = next(d for d in decks if d.id == b["road"])
    wx, wz = b["world"]
    c = Vector((wx - ox, -(wz - oz)))
    f = Vector((b["facing"][0], -b["facing"][1]))
    n = Vector((f.y, -f.x))
    half = dk.width / 2 + 0.15
    zb = b["deck_height"] + Y_ROAD
    z0, z1 = zb + b["board_z"][0], zb + b["board_z"][1]
    bw = b["width"] / 2
    front = f * 0.2
    quad(acc, [v3(c + n * bw + front, z0), v3(c - n * bw + front, z0), v3(c - n * bw + front, z1), v3(c + n * bw + front, z1)], T("sign_green"), Vector((f.x, f.y, 0)))
    if lod == 2:
        return
    quad(acc, [v3(c + n * bw + front * 0.5, z0), v3(c - n * bw + front * 0.5, z0), v3(c - n * bw + front * 0.5, z1), v3(c + n * bw + front * 0.5, z1)], T("steel"), Vector((-f.x, -f.y, 0)))
    top = zb + 6.9
    for s in (-1, 1):
        p = c + n * (half * s)
        acc.cylinder((p.x, p.y, zb + PARAPET), 0.2, 0.15, top - zb - PARAPET, T("steel"), sides=4, top=False, phase=math.pi / 4)
        col.append(((p.x, p.y, (zb + PARAPET + top) / 2), (0.4, 0.4, top - zb - PARAPET), 0.0))
    if lod == 0:
        acc.box((c.x, c.y, top - 0.3), (2 * half, 0.3, 0.3), T("steel"), math.atan2(n.y, n.x))


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    ox, oz = spec["origin"]
    R = p["radius"]
    decks = [Deck(d, ox, oz) for d in spec["decks"]]
    spacing = p["pier_spacing"]
    lamp_spacing = p["lamp_spacing"] * (1 if lod == 0 else 2)
    tol = {0: 0.12, 1: 0.3, 2: 0.8}[lod]
    for dk in decks:
        if not dk.bridge or dk.highway in ("footway", "steps"):
            continue
        prof = dk.profile()
        half = dk.width / 2
        # Piers, joints and lamps at fixed distances along the whole road, like DeckMeshes.
        first, last = prof[0][2], prof[-1][2]

        def at(d):
            j = 0
            while j < len(prof) - 2 and prof[j + 1][2] < d:
                j += 1
            a, b = prof[j], prof[j + 1]
            t = max(0.0, min(1.0, (d - a[2]) / max(b[2] - a[2], 1e-6)))
            u = (b[0] - a[0]).normalized()
            return a[0].lerp(b[0], t), a[1] + (b[1] - a[1]) * t, u
        simp = simplify(prof, tol)
        pts = [q[0] for q in simp]
        ns = mitred(pts)
        for i in range(len(simp) - 1):
            p0, p1 = pts[i], pts[i + 1]
            mid = (p0 + p1) / 2
            if mid.length > R:
                continue
            h0, h1 = simp[i][1], simp[i + 1][1]
            if max(h0, h1) < 0.02:
                continue
            y0, y1 = h0 + Y_ROAD, h1 + Y_ROAD
            for s in (1.0, -1.0):
                guard = min(h0, h1) >= MIN_PARAPET and not on_other_deck(decks, mid + ns[i] * s * (half + 0.6), dk, (h0 + h1) / 2)
                if not guard:
                    continue
                n0, n1 = ns[i] * s, ns[i + 1] * s
                ci0, ci1 = p0 + n0 * (half - 0.1), p1 + n1 * (half - 0.1)
                co0, co1 = p0 + n0 * (half + 0.4), p1 + n1 * (half + 0.4)
                zt0, zt1 = y0 + PARAPET + 0.12, y1 + PARAPET + 0.12
                zb0, zb1 = y0 + PARAPET, y1 + PARAPET
                quad(acc, [v3(ci0, zt0), v3(ci1, zt1), v3(co1, zt1), v3(co0, zt0)], T("concrete"), Vector((0, 0, 1)))
                if lod == 2:
                    continue
                quad(acc, [v3(ci0, zb0), v3(ci1, zb1), v3(ci1, zt1), v3(ci0, zt0)], T("concrete_dark"), Vector((-n0.x, -n0.y, 0)))
                quad(acc, [v3(co0, zb0), v3(co1, zb1), v3(co1, zt1), v3(co0, zt0)], T("concrete_dark"), Vector((n0.x, n0.y, 0)))
                if lod == 0:
                    k0, k1 = p0 + n0 * (half - 0.02), p1 + n1 * (half - 0.02)
                    strip(acc, v3(k0, y0), v3(k1, y1), v3(k0, y0 + 0.5), v3(k1, y1 + 0.5), T("kerb"), Vector((-n0.x, -n0.y, 0)), KERB_PIECE)
        if lod == 2:
            continue
        k = math.ceil(first / spacing)
        while k * spacing < last:
            d = k * spacing
            k += 1
            c, h, u = at(d)
            if c.length > R:
                continue
            n = Vector((u.y, -u.x))
            y = h + Y_ROAD
            if lod == 0 and not on_other_deck(decks, c, dk, h) and not on_other_deck(decks, c + n * half * 0.8, dk, h) and not on_other_deck(decks, c - n * half * 0.8, dk, h):
                quad(acc, [v3(c - n * half - u * 0.18, y + 0.045), v3(c + n * half - u * 0.18, y + 0.045), v3(c + n * half + u * 0.18, y + 0.045), v3(c - n * half + u * 0.18, y + 0.045)], T("joint"), Vector((0, 0, 1)))
            if h < MIN_PIER or lod > 0:
                continue
            offs = [-dk.width / 4, dk.width / 4] if dk.width >= 12.0 else [0.0]
            for off in offs:
                cc = c + n * off
                hy = min(1.1, dk.width * 0.12)
                if on_lower_road(decks, cc, dk, h, hy + 0.3):
                    continue
                collar(acc, cc, u, n, 0.77, hy + 0.07, 1.8, T("pier_band"))
        k = math.ceil((first + lamp_spacing / 2) / lamp_spacing)
        while k * lamp_spacing - lamp_spacing / 2 < last:
            d = k * lamp_spacing - lamp_spacing / 2
            side = 1.0 if k % 2 == 0 else -1.0
            k += 1
            c, h, u = at(d)
            if c.length > R - 10 or h < 1.0:
                continue
            n = Vector((u.y, -u.x)) * side
            base = c + n * (half + 0.15)
            if on_other_deck(decks, c + n * (half + 0.6), dk, h):
                continue
            lamp(acc, col, base, n, h + Y_ROAD + PARAPET, lod)
    for b in spec["boards"]:
        gantry(acc, col, spec, b, decks, lod)


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__), atlas=(layout, paint))
