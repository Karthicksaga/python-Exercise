"""
Tamil Nadu trains for the Godot game, by script in Blender 5.2 LTS (brief §11, research note
`suggestions/2026-11-23-chennai-real-trains-and-buildings.md`, phase 6):

    blender -b --factory-startup --python tools/blender/vehicles/trains.py -- [--only emu,emu_ac,wap7,lhb,vb]

Writes `assets/trains/<name>.glb`, `<name>_lod1.glb`, `<name>_lod2.glb` and `<name>.json` for:

* `emu_cab`, `emu_motor`, `emu_trailer`: an ICF-style 12-car suburban EMU (driving cab,
  motor coach with pantograph, trailer coach): stainless body, Chennai's customary green and
  cream as a colour family, open doorways with sliding leaves.
* `emu_ac_cab`, `emu_ac_motor`, `emu_ac_trailer`: the AC EMU variant of the same shell: white
  with a blue window band, roof air-conditioning units, closed doors.
* `wap7`: a WAP-7-style twin-cab electric locomotive (Co-Co, two pantographs) in a red and
  cream colour family; `lhb_coach`: an LHB-style coach in a matching express colour family.
* `vb_cab`, `vb_coach`: a Vande-Bharat-style semi-high-speed set (aerodynamic nose car and an
  intermediate car) in a saffron and grey colour family.

Shapes and colour families only: no Indian Railways, metro or train-name logo, no lettering, no
real numbers (TD-18; the owner may decide on closer liveries later). Dimensions are broad gauge
(1,676 mm) estimates from published figures, labelled estimated in the manifests.

Frames as `vkit.py`: rail top at y = 0 (Godot), the front (cab end, or the +Y end in Blender)
towards -Z; origin at the middle of the car on the rail top. Body texture: one 512 px livery
per train type, wrapped round the body (u along the car, v round the half section from the
belly, both sides share it), windows and doors painted in it, not modelled (research note).
Nodes: `body`, `bogie_front`/`bogie_rear` (origin on the pivot, turn about Y) with child
`wheelset_*` (origin on the axle, spin about X), sliding `door_*` leaves, `pantograph*`.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vkit as K  # noqa: E402
from vkit import Vector, role  # noqa: E402

OUT = os.path.join(K.ROOT, "assets", "trains")
SOURCE = "tools/blender/vehicles/trains.py"
GAUGE_HALF = 0.838  # wheel tread centre, half of 1,676 mm
LOD_DIST = (60, 300, 900)  # research note: LOD0 <= 60 m, LOD1 60-300 m, LOD2 300-900 m

# Half cross-section (x, z) from the belly centre up the right side to the roof centre.
COACH_PROFILE = [(0.0, 1.05), (1.56, 1.05), (1.625, 1.13), (1.625, 3.02), (1.6, 3.3), (1.5, 3.53), (1.27, 3.74), (0.8, 3.9), (0.0, 3.96)]
LOCO_PROFILE = [(0.0, 1.12), (1.5, 1.12), (1.575, 1.2), (1.575, 3.55), (1.5, 3.78), (1.25, 3.92), (0.0, 3.98)]
VB_PROFILE = [(0.0, 0.9), (1.5, 0.9), (1.62, 1.05), (1.63, 2.95), (1.58, 3.35), (1.42, 3.62), (1.1, 3.82), (0.6, 3.92), (0.0, 3.95)]


def simplify(profile, lod):
    if lod == 0:
        return profile
    if lod == 1:
        keep = [0, 1, 2, 3, 5, len(profile) - 2, len(profile) - 1] if len(profile) > 7 else list(range(len(profile)))
        return [profile[i] for i in sorted(set(keep))]
    return [profile[0], profile[1], profile[3], (profile[-2][0] * 0.9, profile[-2][1]), profile[-1]]


def arc_lengths(profile):
    s = [0.0]
    for a, b in zip(profile, profile[1:]):
        s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return s


# ----------------------------------------------------------------------------- liveries

W = 512
WRAP0 = 128  # body wrap: rows 128..512 (v 0.25..1); rows 0..128 hold the door leaf and the end faces
LEAF_COLS = (0, 64)
END_COLS = (64, 288)
CAB_COLS = (288, 512)


class Livery:
    """Painter helpers in body units: y along the car (Blender), z height on the side wall."""

    def __init__(self, name, length, front, profile, base):
        self.p = K.Painter(name, W, W, base)
        self.L, self.front, self.prof = length, front, profile
        self.s = arc_lengths(profile)
        self.S = self.s[-1]

    def col(self, y):
        return (self.front - y) / self.L * W

    def row_s(self, s):
        return WRAP0 + s / self.S * (W - WRAP0)

    def s_of_z(self, z):
        """Arc length at height z on the side wall (the vertical part of the profile)."""
        for (a, sa), (b, sb) in zip(zip(self.prof, self.s), zip(self.prof[1:], self.s[1:])):
            if a[1] <= z <= b[1] and b[1] > a[1]:
                return sa + (sb - sa) * (z - a[1]) / (b[1] - a[1])
        return self.S if z > self.prof[-1][1] else 0.0

    def band(self, z0, z1, rgb, y0=None, y1=None):
        c0 = 0 if y0 is None else self.col(y0)
        c1 = W if y1 is None else self.col(y1)
        self.p.rect(min(c0, c1), self.row_s(self.s_of_z(z0)), max(c0, c1), self.row_s(self.s_of_z(z1)), rgb)

    def roof(self, z_from, rgb):
        self.p.rect(0, self.row_s(self.s_of_z(z_from)), W, W, rgb)

    def window(self, y0, y1, z0, z1, rgb, bars=None):
        self.band(z0, z1, rgb, y0, y1)
        if bars:
            n = 3
            for k in range(1, n + 1):
                z = z0 + (z1 - z0) * k / (n + 1)
                self.band(z - 0.015, z + 0.015, bars, y0, y1)

    def end_rect(self, cols, x0, x1, z0, z1, rgb, hw=1.625, zb=1.05, zt=3.98):
        c0, c1 = cols
        u = lambda x: c0 + (x + hw) / (2 * hw) * (c1 - c0)
        v = lambda z: (z - zb) / (zt - zb) * WRAP0
        self.p.rect(u(x0), v(z0), u(x1), v(z1), rgb)

    def leaf_rect(self, x0, x1, z0, z1, rgb):
        """The door leaf region: x0..x1 in 0..1 across the leaf, z0..z1 in 0..1 up it."""
        c0, c1 = LEAF_COLS
        self.p.rect(c0 + x0 * (c1 - c0), z0 * WRAP0, c0 + x1 * (c1 - c0), z1 * WRAP0, rgb)

    def image(self):
        return self.p.image()


STAINLESS = (0.42, 0.43, 0.44)
DARK = (0.015, 0.017, 0.02)
UNDER = (0.05, 0.05, 0.05)
ROOF = (0.08, 0.08, 0.075)
GREEN = (0.03, 0.2, 0.08)
CREAM = (0.68, 0.58, 0.36)
WHITE = (0.78, 0.79, 0.78)
BLUE = (0.01, 0.05, 0.22)
VIOLET = (0.15, 0.03, 0.25)
YELLOW = (0.8, 0.55, 0.02)
LOCO_RED = (0.38, 0.03, 0.02)
LHB_RED = (0.28, 0.02, 0.025)
GREY = (0.2, 0.21, 0.22)
SAFFRON = (0.85, 0.27, 0.02)
VB_GREY = (0.16, 0.17, 0.18)


def emu_livery(kind, length, front, doors, ac):
    lv = Livery(f"livery_{'emu_ac' if ac else 'emu'}_{kind}", length, front, COACH_PROFILE, WHITE if ac else STAINLESS)
    lv.band(1.05, 1.25, UNDER)
    lv.roof(3.3, ROOF)
    if ac:
        lv.band(1.95, 2.85, BLUE)
        lv.band(1.55, 1.62, VIOLET)
    else:
        lv.band(1.45, 1.58, GREEN)
        lv.band(1.58, 1.7, CREAM)
    # Windows between the doors; the doorways dark (the sliding leaves cover them).
    cab_end = front - 2.6 if kind == "cab" else front - 0.4
    edges = sorted([front - 0.4 if kind != "cab" else cab_end] + [y for d in doors for y in (d + 0.65, d - 0.65)] + [front - length + 0.4])
    edges = list(reversed(edges))
    for a, b in zip(edges[0::2], edges[1::2]):
        y = a - 0.35
        while y - 0.9 > b + 0.2:
            lv.window(y, y - 0.9, 2.05, 2.75, (0.03, 0.04, 0.05) if ac else DARK, bars=None if ac else (0.25, 0.25, 0.25))
            y -= 1.25
    for d in doors:
        lv.band(1.13, 3.0, (0.01, 0.01, 0.012), d + 0.65, d - 0.65)
    if kind == "cab":
        # Cab side window and the cab door.
        lv.window(front - 0.5, front - 1.4, 2.15, 2.85, DARK)
        lv.band(1.13, 3.0, (0.01, 0.01, 0.012), front - 1.6, front - 2.3)
    if kind == "motor":
        lv.band(1.3, 1.36, YELLOW, front - 3, front - 5)  # an invented equipment marking, no lettering
    # Door leaf (rows 0..128, cols 0..64): body colour with a window and the stripes.
    lv.leaf_rect(0, 1, 0, 1, WHITE if ac else STAINLESS)
    lv.leaf_rect(0.18, 0.82, 0.52, 0.85, DARK)
    if ac:
        lv.leaf_rect(0, 1, 0.47, 0.92, BLUE)
        lv.leaf_rect(0.18, 0.82, 0.52, 0.85, (0.03, 0.04, 0.05))
    else:
        lv.leaf_rect(0, 1, 0.17, 0.24, GREEN)
        lv.leaf_rect(0, 1, 0.24, 0.3, CREAM)
    # Ends: the gangway end (grey, a dark door) and the cab front.
    lv.end_rect(END_COLS, -1.625, 1.625, 1.05, 3.98, WHITE if ac else STAINLESS)
    lv.end_rect(END_COLS, -0.4, 0.4, 1.13, 3.0, DARK)
    lv.end_rect(CAB_COLS, -1.625, 1.625, 1.05, 3.98, WHITE if ac else STAINLESS)
    lv.end_rect(CAB_COLS, -1.625, 1.625, 1.1, 1.55, YELLOW)
    lv.end_rect(CAB_COLS, -1.4, -0.08, 2.4, 3.2, DARK)
    lv.end_rect(CAB_COLS, 0.08, 1.4, 2.4, 3.2, DARK)
    lv.end_rect(CAB_COLS, -1.625, 1.625, 3.5, 3.98, ROOF)
    if ac:
        lv.end_rect(CAB_COLS, -1.625, 1.625, 1.95, 2.35, BLUE)
    return lv.image()


def lhb_livery(length, front):
    lv = Livery("livery_lhb", length, front, COACH_PROFILE, LHB_RED)
    lv.band(1.05, 1.25, UNDER)
    lv.band(1.95, 2.85, GREY)
    lv.band(1.85, 1.92, CREAM)
    lv.roof(3.3, ROOF)
    y = front - 2.2
    while y > front - length + 2.2 + 1.3:
        lv.window(y, y - 1.3, 2.05, 2.75, DARK)
        y -= 1.6
    for d in (front - 0.95, front - length + 0.95):
        lv.band(1.13, 3.0, (0.1, 0.1, 0.1), d + 0.4, d - 0.4)
        lv.window(d + 0.25, d - 0.25, 2.2, 2.7, DARK)
    lv.leaf_rect(0, 1, 0, 1, LHB_RED)
    lv.end_rect(END_COLS, -1.625, 1.625, 1.05, 3.98, LHB_RED)
    lv.end_rect(END_COLS, -0.4, 0.4, 1.13, 3.0, DARK)
    return lv.image()


def wap7_livery(length, front):
    lv = Livery("livery_wap7", length, front, LOCO_PROFILE, LOCO_RED)
    lv.band(1.12, 1.3, UNDER)
    lv.band(2.0, 2.18, CREAM)
    lv.band(2.18, 2.26, (0.2, 0.17, 0.12))
    lv.roof(3.6, GREY)
    for end in (front, front - length):
        sgn = -1 if end == front else 1
        # Cab side windows and doors at both ends.
        lv.window(end + sgn * 0.6, end + sgn * 1.4, 2.35, 3.0, DARK)
        lv.band(1.25, 3.25, (0.2, 0.02, 0.015), end + sgn * 1.55, end + sgn * 2.25)
        lv.band(1.25, 1.3, (0.05, 0.05, 0.05), end + sgn * 1.55, end + sgn * 2.25)
    # Machine-room louvres along the side.
    y = front - 3.0
    while y > front - length + 3.0 + 0.8:
        lv.window(y, y - 0.8, 2.45, 3.25, (0.06, 0.02, 0.015), bars=(0.14, 0.03, 0.02))
        y -= 1.05
    lv.end_rect(CAB_COLS, -1.575, 1.575, 1.12, 3.98, LOCO_RED, hw=1.575, zb=1.12, zt=3.98)
    lv.end_rect(CAB_COLS, -1.575, 1.575, 1.2, 1.75, YELLOW, hw=1.575, zb=1.12, zt=3.98)
    for k in range(5):
        x = -1.575 + k * 0.7
        lv.end_rect(CAB_COLS, x, x + 0.3, 1.2, 1.75, DARK, hw=1.575, zb=1.12, zt=3.98)
    lv.end_rect(CAB_COLS, -1.575, 1.575, 2.0, 2.26, CREAM, hw=1.575, zb=1.12, zt=3.98)
    lv.end_rect(CAB_COLS, -1.35, -0.1, 2.55, 3.3, DARK, hw=1.575, zb=1.12, zt=3.98)
    lv.end_rect(CAB_COLS, 0.1, 1.35, 2.55, 3.3, DARK, hw=1.575, zb=1.12, zt=3.98)
    lv.end_rect(CAB_COLS, -1.575, 1.575, 3.6, 3.98, GREY, hw=1.575, zb=1.12, zt=3.98)
    lv.leaf_rect(0, 1, 0, 1, LOCO_RED)
    return lv.image()


def vb_livery(kind, length, front):
    lv = Livery(f"livery_vb_{kind}", length, front, VB_PROFILE, SAFFRON)
    lv.band(0.9, 1.35, VB_GREY)
    lv.band(2.0, 2.85, (0.02, 0.022, 0.025))
    lv.band(1.88, 1.96, VB_GREY)
    lv.roof(3.05, VB_GREY)
    for d in ((front - 4.6,) if kind == "cab" else (front - 0.9,)) + (front - length + 0.9,):
        lv.band(1.0, 2.9, (0.6, 0.18, 0.015), d + 0.45, d - 0.45)
        lv.band(2.0, 2.85, (0.04, 0.04, 0.045), d + 0.45, d - 0.45)
    lv.leaf_rect(0, 1, 0, 1, SAFFRON)
    lv.leaf_rect(0, 1, 0.58, 1.0, (0.04, 0.04, 0.045))
    lv.end_rect(END_COLS, -1.63, 1.63, 0.9, 3.95, SAFFRON, hw=1.63, zb=0.9, zt=3.95)
    lv.end_rect(END_COLS, -0.4, 0.4, 1.0, 2.9, DARK, hw=1.63, zb=0.9, zt=3.95)
    # Nose (cab region, projected from the side: u along the nose, v up): grey skirt, saffron
    # sides, a black wrap-round windscreen band rising to the nose top.
    c0, c1 = CAB_COLS
    p = lv.p
    p.rect(c0, 0, c1, WRAP0, SAFFRON)
    p.rect(c0, 0, c1, WRAP0 * 0.16, VB_GREY)
    r = lambda z: (z - 0.9) / (3.95 - 0.9) * WRAP0
    w = c1 - c0
    p.rect(c0, r(3.05), c0 + 0.5 * w, WRAP0, VB_GREY)  # grey roof running onto the nose
    p.poly([(c0, r(2.0)), (c0 + 0.55 * w, r(1.72)), (c0 + 0.72 * w, r(1.8)), (c0 + 0.62 * w, r(2.45)), (c0 + 0.3 * w, r(2.9)), (c0, r(2.85))],
           (0.02, 0.022, 0.025))  # the window band sweeping down into the windscreen
    return lv.image()


# ----------------------------------------------------------------------------- body building


def wrap_body(name, profile, ys, front, length, mat, lift=None, scale=None):
    """A car body lofted through `ys` (front first) with livery UVs: u along the car, v round the
    half section; `lift(y)`/`scale(y)` shape a nose. Both sides share the texture (mirrored)."""
    s = arc_lengths(profile)
    S = s[-1]
    half = profile
    ring = [(x, z, sv) for (x, z), sv in zip(half, s)]
    full = ring + [(-x, z, sv) for x, z, sv in reversed(ring[1:-1])]
    n = len(full)
    verts, uvs, faces = [], [], []
    for y in ys:
        k = scale(y) if scale else 1.0
        for x, z, sv in full:
            zz = z
            if lift:
                zz = lift(y, z)
            verts.append(Vector((x * k, y, zz)))
            uvs.append(((front - y) / length, 0.25 + 0.75 * sv / S))
    for r in range(len(ys) - 1):
        for i in range(n):
            a = r * n + i
            b = r * n + (i + 1) % n
            faces.append((a, a + n, b + n, b))
    o = K.mesh_object(name, verts, faces, mat, uvs)
    return o


def end_cap(name, profile, y, mat, cols, facing, hw, zb, zt, scale=1.0, lift=None):
    """A flat end face at y with planar UVs into the livery's end or cab region."""
    half = profile
    full = half + [(-x, z) for x, z in reversed(half[1:-1])]
    verts = []
    uvs = []
    c0, c1 = cols
    for x, z in full:
        zz = lift(y, z) if lift else z
        verts.append(Vector((x * scale, y, zz)))
        uvs.append(((c0 + (x + hw) / (2 * hw) * (c1 - c0)) / W, (z - zb) / (zt - zb) * WRAP0 / W))
    face = list(range(len(full)))
    if facing < 0:
        face.reverse()
    o = K.mesh_object(name, verts, [tuple(face)], mat, uvs, recalc=False)
    if o.data.polygons[0].normal.y * facing < 0:
        o.data.flip_normals()
    return o


def leaf(name, y0, y1, z0, z1, x, mat):
    """A sliding door leaf on the side at x (sign = side): its outside face maps to the leaf region."""
    sx = 1 if x > 0 else -1
    t = 0.03
    xo, xi = x + sx * 0.012, x - sx * (t - 0.012)
    v = [(xo, y0, z0), (xo, y1, z0), (xo, y1, z1), (xo, y0, z1), (xi, y0, z0), (xi, y1, z0), (xi, y1, z1), (xi, y0, z1)]
    f = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2)]
    lu = lambda a, b: ((LEAF_COLS[0] + a * (LEAF_COLS[1] - LEAF_COLS[0])) / W, b * WRAP0 / W)
    uvs = [lu(0, 0), lu(1, 0), lu(1, 1), lu(0, 1)] + [lu(0.5, 0.5)] * 4
    o = K.mesh_object(name, v, f, mat, uvs)
    return o


def wheelset(name, y, r, lod, loco=False):
    """Axle with two wheels (tread radius r, flange 28 mm deeper on the inside); origin on the
    axle. Twelve segments (eight on a three-axle locomotive bogie), so a bogie with its wheelsets
    stays within 400 triangles (research note)."""
    parts = []
    for sx in (1, -1):
        prof = [(r * 0.62, sx * (GAUGE_HALF + 0.07)), (r, sx * (GAUGE_HALF + 0.065)), (r, sx * (GAUGE_HALF - 0.045)),
                (r + 0.028, sx * (GAUGE_HALF - 0.065))]
        if sx < 0:
            prof = list(reversed(prof))
        parts.append(K.lathe("wheel", prof, role("steel"), 8 if loco else 12, axis="X"))
    parts.append(K.cylinder("axle", 0.09, 2 * GAUGE_HALF + 0.1, (0, 0, 0), role("bogie"), rot=(0, math.pi / 2, 0), verts=6, caps=False))
    ws = K.join(parts, name)
    ws.location = (0, y, r)
    return ws


def bogie(name, y, wheel_r, axles, spacing, lod, loco=False):
    """A bogie frame on its wheelsets; origin on the pivot at axle height. Returns (bogie, wheelsets)."""
    pivot = Vector((0, y, wheel_r))
    parts = []
    span = spacing * (axles - 1)
    for sx in (1, -1):
        # Side frame with the axle boxes in one piece, and the spring nest above it.
        parts.append(K.box("sideframe", (0.2, span + 0.9, 0.36), (sx * 1.05, y, wheel_r + 0.06), role("bogie")))
        parts.append(K.box("springs", (0.26, 0.6, 0.3), (sx * 1.05, y, wheel_r + 0.38), role("underframe")))
    parts.append(K.box("bolster", (2.2, 0.5, 0.24), (0, y, wheel_r + 0.36), role("bogie")))
    if loco:
        parts.append(K.box("motors", (1.2, span * 0.9, 0.5), (0, y, wheel_r + 0.02), role("underframe")))
    b = K.join(parts, name)
    K.set_origin(b, pivot)
    sets = []
    for k in range(axles):
        ay = y + span / 2 - k * spacing
        ws = wheelset(f"wheelset_{name.split('_')[1][0]}{k + 1}", ay, wheel_r, lod, loco)
        K.parent_keep(ws, b)
        sets.append((ws.name, ay))
    return b, sets


def pantograph(name, y, z_roof, lod):
    """A single-arm pantograph, lowered; origin on the base hinge (raises about X)."""
    base = Vector((0, y - 0.8, z_roof + 0.35))
    parts = [K.box("frame", (1.2, 1.4, 0.12), (0, y, z_roof + 0.25), role("pantograph"))]
    for sx in (1, -1):
        parts.append(K.cylinder("insulator", 0.08, 0.25, (sx * 0.5, y + 0.5 * sx, z_roof + 0.12), role("insulator"), verts=K.seg(8, 5, 4)))
    parts.append(K.tube("lower_arm", base, (0, y + 0.85, z_roof + 0.6), 0.04, role("pantograph"), verts=K.seg(6, 4, 3)))
    parts.append(K.tube("upper_arm", (0, y + 0.85, z_roof + 0.6), (0, y - 0.55, z_roof + 0.75), 0.03, role("pantograph"), verts=K.seg(6, 4, 3)))
    parts.append(K.box("pan_head", (1.6, 0.25, 0.06), (0, y - 0.55, z_roof + 0.78), role("pantograph")))
    p = K.join(parts, name)
    K.set_origin(p, base)
    return p, base


def underframe(length, zb, lod, kinds):
    parts = []
    if lod > 0:
        parts.append(K.box("under", (2.2, length * 0.55, 0.45), (0, 0, zb - 0.25), role("underframe")))
        return parts
    y = length * 0.3
    for i, (w, l, h) in enumerate(kinds):
        parts.append(K.box("tank", (w, l, h), (0.2 * (1 if i % 2 else -1), y - i * (l + 0.4), zb - h / 2), role("underframe")))
    return parts


def coupler_end(y, zb, sgn, lod, gangway=True, buffers=False):
    parts = [K.box("coupler", (0.3, 0.6, 0.25), (0, y + sgn * 0.25, zb + 0.0), role("bogie"))]
    if gangway and lod == 0:
        parts.append(K.box("gangway", (1.1, 0.22, 2.0), (0, y + sgn * 0.1, zb + 1.1), role("dark_grey")))
    if buffers:
        for sx in (1, -1):
            parts.append(K.cylinder("buffer", 0.2, 0.45, (sx * 0.95, y + sgn * 0.22, zb + 0.0), role("bogie"), rot=(math.pi / 2, 0, 0), verts=K.seg(10, 6, 4)))
    return parts


# ----------------------------------------------------------------------------- the cars


def build_car(spec, lod):
    """spec: dict(name, kind 'coach'|'cab', length, profile, livery fn, doors, bogies, ...)."""
    K.LOD = lod
    K.reset()
    L = spec["length"]
    front, rear = L / 2, -L / 2
    prof = simplify(spec["profile"], lod)
    img = spec["livery"]()
    mat = K.livery_material("livery_" + spec["family"], img, rough=spec.get("rough", 0.45), metal=spec.get("metal", 0.15))
    zb = prof[0][1]
    zt = prof[-1][1]
    hw = max(x for x, _ in prof)
    nose = spec.get("nose")
    body_front = front - (nose["length"] if nose else 0)
    ys = [body_front, rear] if lod == 2 else [body_front] + [y for y in spec.get("ring_ys", []) if rear < y < body_front] + [rear]
    ys = sorted(set(ys), reverse=True)
    body = wrap_body("shell", prof, ys, front, L, mat)
    parts = [body]
    parts.append(end_cap("end_rear", prof, rear, mat, END_COLS, -1, hw, zb, zt))
    if nose:
        parts += build_nose(spec, prof, body_front, front, mat, lod, hw, zb, zt)
    elif spec["kind"] == "cab":
        parts += flat_cab(spec, prof, body_front, mat, lod, hw, zb, zt)
    else:
        parts.append(end_cap("end_front", prof, body_front, mat, END_COLS, 1, hw, zb, zt))
    if spec.get("twin_cab"):
        K.bpy.data.objects.remove(parts.pop(1))  # no gangway end: a second cab instead
        parts += flat_cab(spec, prof, rear, mat, lod, hw, zb, zt, sgn=-1)
    K.smooth(body, 32)
    # Underframe, ends, roof equipment.
    parts += underframe(L * 0.8, zb, lod, spec.get("under", [(1.6, 2.2, 0.5), (1.2, 1.6, 0.4), (1.8, 2.6, 0.55)]))
    if lod < 2:
        if spec["kind"] == "coach" or not spec.get("twin_cab"):
            parts += coupler_end(rear, zb + 0.0, -1, lod, gangway=spec.get("gangway", True), buffers=spec.get("buffers", False))
        if spec["kind"] == "coach":
            parts += coupler_end(front, zb + 0.0, 1, lod, gangway=spec.get("gangway", True), buffers=spec.get("buffers", False))
    for (bw, bl, bh, by) in spec.get("roof_units", []) if lod < 2 else []:
        parts.append(K.box("roof_unit", (bw, bl, bh), (0, by, zt + bh / 2 - 0.05), role("light_grey"), bevel=0.05))
    if lod == 0:
        for y in spec.get("roof_vents", []):
            parts.append(K.box("vent", (0.5, 0.5, 0.14), (0, y, zt + 0.02), role("roof_grey"), bevel=0.03))
    nodes = {"doors": [], "pivots": [], "bogies": [], "wheels": []}
    # Bogies (LOD0 nodes; LOD1 a merged low box per bogie; LOD2 none).
    wr = spec["wheel_r"]
    for bname, by in (("bogie_front", spec["bogie_y"]), ("bogie_rear", -spec["bogie_y"])):
        if lod == 0:
            b, sets = bogie(bname, by, wr, spec["axles"], spec["axle_spacing"], lod, loco=spec.get("loco", False))
            nodes["bogies"].append(bname)
            nodes["pivots"].append(dict(node=bname, what="bogie, turns on the curve", pivot=K.g((0, by, wr)), axis=[0, 1, 0], range_deg=[-8, 8]))
            for ws, ay in sets:
                nodes["wheels"].append(dict(node=ws, centre=K.g((0, ay, wr)), radius=wr, steers=False, driven=spec.get("loco", False) or spec.get("motor", False),
                                            lod_max=0))
        elif lod == 1:
            span = spec["axle_spacing"] * (spec["axles"] - 1) + 0.9
            parts.append(K.box("bogie", (2.3, span, 0.7), (0, by, wr + 0.1), role("bogie")))
            for sx in (1, -1):
                parts.append(K.box("wheels", (0.12, span - 0.2, 2 * wr), (sx * GAUGE_HALF, by, wr), role("steel")))
    body_obj = K.join(parts, "body")
    if lod == 2:
        K.decimate(body_obj, spec["lod2_budget"] - 8)
    # Doors: sliding leaves, LOD0 only.
    if lod == 0:
        for i, dy in enumerate(spec.get("doors", [])):
            for sx in (1, -1):
                nm = f"door_{'r' if sx > 0 else 'l'}{i + 1}"
                hwd = spec.get("door_w", 1.3) / 2
                lf = leaf(nm, dy + hwd, dy - hwd, zb + 0.08, spec.get("door_top", 3.0), sx * spec.get("door_x", 1.625), mat)
                lf = K.join([lf], nm)
                K.set_origin(lf, (sx * spec.get("door_x", 1.625), dy + hwd, 0))
                nodes["doors"].append(dict(node=nm, hinge=K.g((sx * spec.get("door_x", 1.625), dy + hwd, 0)), axis=[0, 1, 0], open_deg=0,
                                           slide=K.g_axis((0, 1, 0) if dy > 0 else (0, -1, 0)), slide_m=round(2 * hwd * 0.95, 3),
                                           side="right" if sx > 0 else "left", notes="sliding leaf: translate along `slide` by slide_m"))
        for pn, py in spec.get("pantographs", []):
            p, base = pantograph(pn, py, zt, lod)
            nodes["pivots"].append(dict(node=pn, what="pantograph arm, raises", pivot=K.g(base), axis=[1, 0, 0], range_deg=[0, 35]))
        for nm, p in spec.get("anchors", {}).items():
            K.empty(nm, p)
    elif lod == 1:
        for pn, py in spec.get("pantographs", []):
            p, base = pantograph(pn, py, zt, lod)
    lo, hi = K.scene_bounds()
    # The front marker on the leading face (coupler or nose tip): where the next car's coupler meets.
    K.empty("marker_front", (0, hi.y, zb))
    path = os.path.join(OUT, spec["name"] + ("" if lod == 0 else f"_lod{lod}") + ".glb")
    tris = K.export_glb(path)
    return dict(tris=tris, lo=lo, hi=hi, nodes=nodes)


def flat_cab(spec, prof, y, mat, lod, hw, zb, zt, sgn=1):
    """A flat-fronted cab end (EMU, locomotive): the front face leans back above the waist, with
    headlamps, marker lamps, a horn, a coupler and a pilot (cowcatcher)."""
    out = []
    cap = end_cap("cab_front", prof, y, mat, CAB_COLS, sgn, hw, zb, zt)
    # Lean the upper front back a little.
    for v in cap.data.vertices:
        if v.co.z > 2.3:
            v.co.y -= sgn * (v.co.z - 2.3) * 0.12
    out.append(cap)
    # Close the gap between the leaned face and the body sides with the body texture's edge.
    if lod < 2:
        for sx in (1, -1):
            out.append(K.box("head", (0.3, 0.06, 0.18), (sx * 0.9, y + sgn * 0.03, 1.95), role("headlamp")))
            out.append(K.box("marker", (0.12, 0.05, 0.1), (sx * 1.3, y + sgn * 0.03, 1.75), role("taillamp")))
        out.append(K.box("head_top", (0.36, 0.08, 0.18), (0, y - sgn * 0.12, zt - 0.3), role("headlamp")))
        out.append(K.box("pilot", (2.4, 0.18, 0.55), (0, y + sgn * 0.12, 0.5), role("dark_grey")))
        out.append(K.box("coupler", (0.3, 0.6, 0.25), (0, y + sgn * 0.3, zb), role("bogie")))
        if spec.get("buffers"):
            for sx in (1, -1):
                out.append(K.cylinder("buffer", 0.2, 0.45, (sx * 0.95, y + sgn * 0.2, zb), role("bogie"), rot=(math.pi / 2, 0, 0), verts=K.seg(10, 6, 4)))
        if lod == 0:
            out.append(K.box("wiper", (0.03, 0.02, 0.6), (-0.7, y + sgn * 0.01, 2.75), role("black")))
            out.append(K.box("wiper", (0.03, 0.02, 0.6), (0.7, y + sgn * 0.01, 2.75), role("black")))
            out.append(K.cylinder("horn", 0.07, 0.35, (0.5, y - sgn * 0.3, zt + 0.05), role("chrome"), rot=(math.pi / 2, 0, 0), verts=8))
    return out


def build_nose(spec, prof, body_front, front, mat, lod, hw, zb, zt):
    """The Vande-Bharat-style nose: the section shrinks and drops to a rounded snout over
    `nose.length` m; its UVs come from a side projection into the cab region of the livery."""
    nl = spec["nose"]["length"]
    steps = [0.0, 0.18, 0.38, 0.58, 0.76, 0.9, 1.0] if lod == 0 else ([0.0, 0.4, 0.75, 1.0] if lod == 1 else [0.0, 1.0])
    rings = []
    for t in steps:
        y = body_front + t * nl
        k = 1 - 0.55 * t ** 2.2  # half width scale
        top = zt - (zt - 1.85) * t ** 1.6  # roof drops to the snout
        bot = zb + 0.25 * t ** 2  # the skirt rises a little
        rings.append((y, k, top, bot))
    full = prof + [(-x, z) for x, z in reversed(prof[1:-1])]
    n = len(full)
    verts, uvs = [], []
    c0, c1 = CAB_COLS
    for y, k, top, bot in rings:
        for x, z in full:
            zz = bot + (z - zb) / (zt - zb) * (top - bot)
            verts.append(Vector((x * k, y, zz)))
            uvs.append(((c0 + (y - body_front) / nl * (c1 - c0)) / W, (zz - zb) / (zt - zb) * WRAP0 / W))
    faces = []
    for r in range(len(rings) - 1):
        for i in range(n):
            a, b = r * n + i, r * n + (i + 1) % n
            faces.append((a, a + n, b + n, b))
    last = (len(rings) - 1) * n
    faces.append(tuple(range(last, last + n)))
    o = K.mesh_object("nose", verts, faces, mat, uvs)
    K.smooth(o, 50)
    out = [o]
    if lod < 2:
        for sx in (1, -1):
            out.append(K.box("head", (0.45, 0.1, 0.12), (sx * 0.62, front - 0.55, 1.42), role("headlamp"), rot=(0, 0, sx * 0.5)))
        out.append(K.box("skirt", (2.6, 1.0, 0.35), (0, front - 0.9, 0.75), role("dark_grey"), bevel=0.1))
        out.append(K.box("coupler_cover", (0.6, 0.12, 0.3), (0, front - 0.05, 1.3), role("dark_grey")))
    return out


def emu_spec(kind, ac):
    L = 20.8
    doors = [7.0, 0.0, -7.0] if kind != "cab" else [4.6, -2.5, -8.0]
    fam = ("emu_ac_" if ac else "emu_") + kind
    spec = dict(
        name=fam, family=fam, kind="cab" if kind == "cab" else "coach", length=L, profile=COACH_PROFILE,
        livery=lambda: emu_livery(kind, L, L / 2, doors, ac), doors=doors, door_w=1.3 if not ac else 1.25,
        wheel_r=0.476 if kind == "motor" else 0.4575, axles=2, axle_spacing=2.6 if kind == "motor" else 2.9, bogie_y=7.35,
        ring_ys=[d + s for d in doors for s in (0.65, -0.65)] + ([L / 2 - 2.6] if kind == "cab" else []),
        roof_vents=[] if ac else [y for y in (8.5, 5.0, 2.5, -2.5, -5.0, -8.5)],
        roof_units=[(2.2, 3.0, 0.42, 5.0), (2.2, 3.0, 0.42, -5.0)] if ac else [],
        pantographs=[("pantograph", -3.6)] if kind == "motor" else [],
        motor=kind == "motor", metal=0.35 if not ac else 0.1, rough=0.38,
        lod2_budget=150 if kind == "cab" else 120,
        anchors={"seat_driver": (0.6, L / 2 - 1.2, 2.25), "grip_master_controller": (0.45, L / 2 - 0.75, 2.2)} if kind == "cab" else
                {"standing_area": (0, 0.0, 1.2)},
    )
    if kind == "motor":
        spec["under"] = [(1.8, 2.4, 0.6), (1.5, 2.0, 0.55), (1.8, 2.8, 0.6), (1.4, 1.8, 0.5)]
    return spec


WAP7 = dict(
    name="wap7", family="wap7", kind="cab", length=20.56, profile=LOCO_PROFILE, twin_cab=True, buffers=True, gangway=False,
    livery=lambda: wap7_livery(20.56, 10.28), doors=[], wheel_r=0.546, axles=3, axle_spacing=2.0, bogie_y=5.6, loco=True,
    ring_ys=[10.28 - 2.25, -10.28 + 2.25], roof_units=[(2.0, 6.0, 0.35, 0.0)], pantographs=[("pantograph_front", 4.9), ("pantograph_rear", -4.9)],
    under=[(1.6, 3.5, 0.6)], metal=0.1, rough=0.4, lod2_budget=150,
    anchors={"seat_driver": (0.6, 10.28 - 1.0, 2.35), "grip_master_controller": (0.45, 10.28 - 0.6, 2.3)},
)
LHB = dict(
    name="lhb_coach", family="lhb", kind="coach", length=23.54, profile=COACH_PROFILE, buffers=True,
    livery=lambda: lhb_livery(23.54, 11.77), doors=[11.77 - 0.95, -11.77 + 0.95], door_w=0.8, door_top=2.95,
    wheel_r=0.4575, axles=2, axle_spacing=2.56, bogie_y=7.4, ring_ys=[11.77 - 1.35, 11.77 - 0.55, -11.77 + 1.35, -11.77 + 0.55],
    roof_units=[(2.0, 2.2, 0.4, 8.6), (2.0, 2.2, 0.4, -8.6)], metal=0.05, rough=0.4, lod2_budget=120,
    anchors={"standing_area": (0, 0.0, 1.3)},
)
VB_CAB = dict(
    name="vb_cab", family="vb_cab", kind="cab", length=25.0, profile=VB_PROFILE, nose=dict(length=4.2),
    livery=lambda: vb_livery("cab", 25.0, 12.5), doors=[12.5 - 4.6, -12.5 + 0.9], door_w=0.9, door_top=2.9, door_x=1.63,
    wheel_r=0.46, axles=2, axle_spacing=2.6, bogie_y=7.2, ring_ys=[12.5 - 4.15, 12.5 - 5.05, -12.5 + 1.35, -12.5 + 0.45],
    under=[(2.6, 6.0, 0.6), (2.6, 4.0, 0.6)], metal=0.15, rough=0.32, lod2_budget=150,
    anchors={"seat_driver": (0.0, 12.5 - 3.3, 2.2), "grip_master_controller": (0.25, 12.5 - 2.9, 2.15)},
)
VB_COACH = dict(
    name="vb_coach", family="vb_coach", kind="coach", length=24.0, profile=VB_PROFILE,
    livery=lambda: vb_livery("coach", 24.0, 12.0), doors=[12.0 - 0.9, -12.0 + 0.9], door_w=0.9, door_top=2.9, door_x=1.63,
    wheel_r=0.46, axles=2, axle_spacing=2.6, bogie_y=8.0, ring_ys=[12.0 - 1.35, 12.0 - 0.45, -12.0 + 1.35, -12.0 + 0.45],
    under=[(2.6, 6.0, 0.6), (2.6, 4.0, 0.6)], metal=0.15, rough=0.32, lod2_budget=120,
    anchors={"standing_area": (0, 0.0, 1.2)},
)

FORMATIONS = {
    "emu": dict(cars=["emu_cab", "emu_motor", "emu_trailer", "emu_trailer", "emu_motor", "emu_trailer", "emu_trailer", "emu_motor",
                      "emu_trailer", "emu_trailer", "emu_motor", "emu_cab@reversed"],
                notes="12-car suburban rake (estimated order: three motor units of four)"),
    "emu_ac": dict(cars=["emu_ac_cab", "emu_ac_motor", "emu_ac_trailer", "emu_ac_trailer", "emu_ac_motor", "emu_ac_trailer", "emu_ac_trailer",
                         "emu_ac_motor", "emu_ac_trailer", "emu_ac_trailer", "emu_ac_motor", "emu_ac_cab@reversed"], notes="12-car AC rake (estimated)"),
    "express": dict(cars=["wap7"] + ["lhb_coach"] * 18, notes="WAP-7-style locomotive with up to 22 LHB-style coaches; 18 shown (estimated)"),
    "vb": dict(cars=["vb_cab"] + ["vb_coach"] * 6 + ["vb_cab@reversed"], notes="8-car semi-high-speed set (estimated)"),
}


def run(spec, family):
    res = [build_car(spec, lod) for lod in (0, 1, 2)]
    lo, hi = res[0]["lo"], res[0]["hi"]
    nodes = res[0]["nodes"]
    kind = "train_cab" if spec["kind"] == "cab" else "train_coach"
    m = dict(
        name=spec["name"], label=spec["name"].replace("_", " "), kind=kind, source=SOURCE, licence=K.LICENCE,
        frame="metres; +Y up, the front (cab or +Y end) towards -Z, +X right; rail top at y = 0; origin mid-car on the rail top",
        size_m=dict(zip(("width", "height", "length"), K.size_godot(lo, hi))),
        dimensions_note="broad gauge (1,676 mm); car length, width, height and wheel sizes are estimates from published figures",
        lods=[dict(file=spec["name"] + ".glb", triangles=res[0]["tris"], max_distance_m=LOD_DIST[0]),
              dict(file=spec["name"] + "_lod1.glb", triangles=res[1]["tris"], min_distance_m=LOD_DIST[0], max_distance_m=LOD_DIST[1]),
              dict(file=spec["name"] + "_lod2.glb", triangles=res[2]["tris"], min_distance_m=LOD_DIST[1], max_distance_m=LOD_DIST[2])],
        wheels=nodes["wheels"], bogies=nodes["bogies"], pivots=nodes["pivots"], doors=nodes["doors"],
        seats=[dict(node=k, role="driver") for k in spec.get("anchors", {}) if k.startswith("seat")],
        grips=[dict(node=k, hand="right") for k in spec.get("anchors", {}) if k.startswith("grip")],
        cargo=[dict(node=k, what="standing passengers' floor") for k in spec.get("anchors", {}) if k == "standing_area"],
        coupler_faces_z=dict(front=K.g(hi)[2], rear=K.g(lo)[2], notes="Godot z of the leading and trailing faces: car pitch in a rake = sum of the faces' distance"),
        collision=[dict(shape="box", centre=K.g((0, 0, (lo.z + hi.z) / 2 + 0.25)), half_extents=[round((hi.x - lo.x) / 2, 3), round((hi.z - lo.z) / 2 - 0.25, 3),
                                                                                                round(spec["length"] / 2, 3)])],
        livery=dict(texture=f"embedded livery_{spec['family']} 512 px", family=family,
                    notes="shapes and colour families only: no logos, lettering or real numbers"),
        formation=FORMATIONS.get(family) if spec["name"] in ("emu_cab", "emu_ac_cab", "wap7", "vb_cab") else None,
        draw_note="instance one mesh per car type per LOD (MultiMesh) so a whole train is a few draw calls",
        required_nodes=["body", "marker_front"] + nodes["bogies"] + [p["node"] for p in nodes["pivots"]],
    )
    K.write_manifest(os.path.join(OUT, spec["name"] + ".json"), m)


if __name__ == "__main__":
    want = K.ONLY
    if not want or "emu" in want:
        for kind in ("cab", "motor", "trailer"):
            run(emu_spec(kind, False), "emu")
    if not want or "emu_ac" in want:
        for kind in ("cab", "motor", "trailer"):
            run(emu_spec(kind, True), "emu_ac")
    if not want or "wap7" in want:
        run(WAP7, "express")
    if not want or "lhb" in want:
        run(LHB, "express")
    if not want or "vb" in want:
        run(VB_CAB, "vb")
        run(VB_COACH, "vb")
