"""
Detailed (LOD0) train bodies for `trains.py`: real openings instead of painted rectangles.

The body is built in pieces that meet exactly:
* the belly and the roof are lofted strips of the cross-section (below the sill, above the cant
  rail), with the livery's wrap UVs (u along the car, v round the half section);
* each side wall (vertical, between sill and cant rail) is a panel with rectangular openings:
  windows set in with a frame (and bars on ICF-style windows), doorways set in as vestibules with
  a floor, a lintel and grab rails, louvres with slats on the locomotive;
* the ends are panels too: a gangway end with bellows, or a cab front with recessed windows, a
  route board, head and marker lamps, a horn and a pilot.
Faces are built with explicit outward normals (`MB.quad`), so nothing depends on normal
recalculation. Materials: the car's livery (wrap UVs), and atlas roles for glass, frames, bars,
roof and equipment (`vkit.to_atlas` turns roles into palette UVs at export).
"""
import math

import vkit as K
from vkit import Vector, role


class MB:
    """A mesh under construction: unshared vertices, a material and UV per face corner."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.uvs, self.mats = [], [], [], []

    def face(self, pts, want, mat, uv=None):
        pts = [Vector(p) for p in pts]
        n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        if len(pts) > 3 and n.length < 1e-9:
            n = (pts[2] - pts[1]).cross(pts[3] - pts[1])
        order = list(range(len(pts)))
        if n.dot(Vector(want)) < 0:
            order.reverse()
        base = len(self.verts)
        self.verts += [pts[i] for i in order]
        self.uvs += [(uv[i] if uv else (0.5, 0.5)) for i in order]
        self.faces.append(tuple(range(base, base + len(pts))))
        self.mats.append(mat)

    quad = face

    def build(self):
        me = K.bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        me.update()
        obj = K.link(K.bpy.data.objects.new(self.name, me))
        slots = {}
        for m in self.mats:
            if m.name not in slots:
                slots[m.name] = len(obj.data.materials)
                obj.data.materials.append(m)
        for p, m in zip(me.polygons, self.mats):
            p.material_index = slots[m.name]
        layer = me.uv_layers.new(name="UVMap")
        for p in me.polygons:
            for li in p.loop_indices:
                layer.data[li].uv = self.uvs[me.loops[li].vertex_index]
        K.merge_by_distance(obj, 0.0002)
        return obj


def panel(mb, a_rng, b_rng, openings, P, N, UV, mat):
    """
    A flat panel over a in a_rng, b in b_rng (P(a, b, depth) -> point, depth inwards along -N),
    with rectangular openings. Each opening: dict(a=(a0, a1), b=(b0, b1), depth, back (material
    or None for a through hole), frame (material or None), frame_w, bars (count), bar (material),
    step/floor (material for the bottom jamb)). Jambs carry the wall's livery (UV at the edge).
    """
    a0, a1 = a_rng
    b0, b1 = b_rng
    edges = {a0, a1}
    for o in openings:
        edges.update(x for x in o["a"] if a0 < x < a1)
    edges = sorted(edges)

    def corners(aa, ab, ba, bb):
        pts = [P(aa, ba, 0), P(ab, ba, 0), P(ab, bb, 0), P(aa, bb, 0)]
        return pts, [UV(aa, ba), UV(ab, ba), UV(ab, bb), UV(aa, bb)]

    for ca, cb in zip(edges, edges[1:]):
        o = next((o for o in openings if o["a"][0] <= ca + 1e-6 and cb <= o["a"][1] + 1e-6), None)
        spans = [(b0, b1)] if o is None else [(b0, o["b"][0]), (o["b"][1], b1)]
        for ba, bb in spans:
            if bb - ba > 1e-4:
                pts, uv = corners(ca, cb, ba, bb)
                mb.quad(pts, N, mat, uv)
    n = Vector(N)
    for o in openings:
        (oa, ob), (ob0, ob1), d = o["a"], o["b"], o["depth"]
        # Jambs: four faces from the wall face back to the depth, facing into the opening.
        mid_a, mid_b = (oa + ob) / 2, (ob0 + ob1) / 2
        jambs = [((oa, ob0), (ob, ob0)), ((ob, ob0), (ob, ob1)), ((ob, ob1), (oa, ob1)), ((oa, ob1), (oa, ob0))]
        for k, ((pa, pb), (qa, qb)) in enumerate(jambs):
            centre = P(mid_a, mid_b, d / 2)
            pts = [P(pa, pb, 0), P(qa, qb, 0), P(qa, qb, d), P(pa, pb, d)]
            want = centre - (pts[0] + pts[2]) / 2
            jm = o.get("floor") if k == 0 and o.get("floor") else o.get("jamb", mat)
            u = UV((pa + qa) / 2, (pb + qb) / 2)
            mb.quad(pts, want, jm, [u] * 4)
        if o.get("back") is not None:
            mb.quad([P(oa, ob0, d), P(ob, ob0, d), P(ob, ob1, d), P(oa, ob1, d)], N, o["back"])
        fw = o.get("frame_w", 0.035)
        if o.get("frame") is not None:
            lift = -0.01
            ring = [(oa, ob0), (ob, ob0), (ob, ob1), (oa, ob1)]
            outer = [(oa - fw, ob0 - fw), (ob + fw, ob0 - fw), (ob + fw, ob1 + fw), (oa - fw, ob1 + fw)]
            for i in range(4):
                j = (i + 1) % 4
                mb.quad([P(*outer[i], lift), P(*outer[j], lift), P(*ring[j], lift), P(*ring[i], lift)], N, o["frame"])
        for k in range(o.get("bars", 0)):
            bz = ob0 + (ob1 - ob0) * (k + 1) / (o["bars"] + 1)
            h = 0.011
            dd = 0.025
            mb.quad([P(oa, bz - h, dd), P(ob, bz - h, dd), P(ob, bz + h, dd), P(oa, bz + h, dd)], N, o["bar"])
            mb.quad([P(oa, bz + h, dd), P(ob, bz + h, dd), P(ob, bz + h, dd + 0.02), P(oa, bz + h, dd + 0.02)], Vector((0, 0, 1)), o["bar"])


def strip(mb, pts2d, s_vals, S, ys, front, length, mat, outward_from, scale=None):
    """Loft an open profile path (x, z) through the rings at ys; wrap UVs from arc lengths s."""
    for r in range(len(ys) - 1):
        ya, yb = ys[r], ys[r + 1]
        for i in range(len(pts2d) - 1):
            (xa, za), (xb, zb) = pts2d[i], pts2d[i + 1]
            pts = [Vector((xa, ya, za)), Vector((xb, ya, zb)), Vector((xb, yb, zb)), Vector((xa, yb, za))]
            mid = sum(pts, Vector()) / 4
            want = mid - Vector((0, mid.y, outward_from))
            want.y = 0
            uv = [((front - ya) / length, 0.25 + 0.75 * s_vals[i] / S), ((front - ya) / length, 0.25 + 0.75 * s_vals[i + 1] / S),
                  ((front - yb) / length, 0.25 + 0.75 * s_vals[i + 1] / S), ((front - yb) / length, 0.25 + 0.75 * s_vals[i] / S)]
            mb.quad(pts, want, mat, uv)


def section_parts(profile, sill, head):
    """Split the half profile into the belly (to the sill), the wall and the roof (from the head)."""
    s = [0.0]
    for a, b in zip(profile, profile[1:]):
        s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    S = s[-1]
    belly = [(p, sv) for p, sv in zip(profile, s) if p[1] <= sill + 1e-6]
    roof = [(p, sv) for p, sv in zip(profile, s) if p[1] >= head - 1e-6]
    hw = max(x for x, _ in profile)
    s_sill = next(sv for p, sv in zip(profile, s) if abs(p[0] - hw) < 1e-6 and abs(p[1] - sill) < 1e-6)
    return belly, roof, s, S, hw, s_sill


def full_path(half):
    """Right half (from the centre) mirrored into a left-to-right path over the top or bottom."""
    pts = [p for p, _ in half]
    sv = [s for _, s in half]
    return [(-x, z) for x, z in reversed(pts)] + pts[1:], list(reversed(sv)) + sv[1:]


def end_face(mb, profile, y, want_y, mat, uvfun, sill, head, openings=(), hw=None):
    """An end at y: the belly cap, a wall panel (sill to head, with openings) and the roof cap."""
    belly = [p for p in profile if p[1] <= sill + 1e-6]
    roof = [p for p in profile if p[1] >= head - 1e-6]
    hw = hw or max(x for x, _ in profile)
    N = (0, want_y, 0)
    for half in (belly, roof):
        poly = [(-x, z) for x, z in reversed(half)] + half[1:]
        pts = [Vector((x, y, z)) for x, z in poly]
        if len(pts) >= 3:
            mb.face(pts, N, mat, [uvfun(x, z) for x, z in poly])
    P = lambda a, b, d: Vector((a, y - want_y * d, b))
    panel(mb, (-hw, hw), (sill, head), list(openings), P, N, lambda a, b: uvfun(a, b), mat)


def bellows(mb, y, sgn, zb, mat_dark, mat_face):
    """A gangway vestibule: three bellows folds and a face plate with a dark door."""
    parts = []
    for k in range(3):
        w = 1.25 - 0.06 * (k % 2)
        yy = y + sgn * (0.07 + 0.09 * k)
        parts.append(K.box("bellows", (w, 0.08, 2.15), (0, yy, zb + 1.25), mat_dark))
    parts.append(K.box("gangway_face", (1.3, 0.05, 2.2), (0, y + sgn * 0.33, zb + 1.25), mat_face))
    parts.append(K.box("gangway_door", (0.62, 0.02, 1.85), (0, y + sgn * 0.36, zb + 1.18), role("inside_dark")))
    return parts


def grab_rail(x, y, z0, z1):
    return K.tube("grab", (x, y, z0), (x, y, z1), 0.016, role("steel"), verts=6)


def torpedo_vent(x, y, z):
    v = K.sphere("vent", 0.24, (x, y, z), role("roof_grey"), scale=(1.0, 1.5, 0.45), segments=6, rings=3)
    return v


def lamp(x, y, z, sgn, r, mat, depth=0.06):
    """A round lamp facing along +-y with a dark bezel."""
    rot = (math.pi / 2, 0, 0)
    return [K.cylinder("bezel", r + 0.03, depth, (x, y + sgn * depth / 2, z), role("black"), rot=rot, verts=10),
            K.cylinder("lamp", r, 0.02, (x, y + sgn * (depth + 0.005), z), mat, rot=rot, verts=10)]


def pantograph(name, y, z_roof, sgn=1):
    """Single-arm pantograph (lowered): base frame on four insulators, lower and upper arms, the
    knuckle, a collector head with horns. Origin on the base hinge; raises about X."""
    base = Vector((0, y - sgn * 0.75, z_roof + 0.42))
    parts = [K.box("frame", (1.1, 1.5, 0.08), (0, y, z_roof + 0.36), role("pantograph"))]
    for sx in (1, -1):
        for sy in (1, -1):
            parts.append(K.cylinder("insulator", 0.06, 0.3, (sx * 0.45, y + sy * 0.6, z_roof + 0.17), role("insulator"), verts=6))
    knee = Vector((0, y + sgn * 0.95, z_roof + 0.68))
    for sx in (0.18, -0.18):
        parts.append(K.tube("lower_arm", base + Vector((sx, 0, 0)), knee + Vector((sx * 0.6, 0, 0)), 0.03, role("pantograph"), verts=5))
    head = Vector((0, y - sgn * 0.45, z_roof + 0.86))
    parts.append(K.tube("upper_arm", knee, head, 0.025, role("pantograph"), verts=5))
    parts.append(K.tube("link", base + Vector((0, 0, 0.05)), head + Vector((0, sgn * 0.3, -0.12)), 0.012, role("pantograph"), verts=4))
    parts.append(K.box("collector", (1.5, 0.1, 0.05), head + Vector((0, 0, 0.03)), role("dark_alloy")))
    parts.append(K.box("collector2", (1.5, 0.1, 0.05), head + Vector((0, -sgn * 0.25, 0.03)), role("dark_alloy")))
    for sx in (1, -1):
        parts.append(K.tube("horn", head + Vector((sx * 0.75, 0, 0.03)), head + Vector((sx * 0.98, 0, -0.12)), 0.018, role("dark_alloy"), verts=4))
    p = K.join(parts, name)
    K.set_origin(p, base)
    return p, base


def bogie(name, y, wheel_r, axles, spacing, loco=False):
    """A bogie: side frames with axle boxes and coil springs, a bolster, brake gear, traction
    motors on a loco; wheelsets as children. Within 400 triangles (coach) or 600 (Co-Co loco)."""
    pivot = Vector((0, y, wheel_r))
    parts = []
    span = spacing * (axles - 1)
    for sx in (1, -1):
        x = sx * 1.02
        # Side frame: a deep middle and lighter ends over the axle boxes.
        parts.append(K.box("frame_mid", (0.16, span * 0.55, 0.42), (x, y, wheel_r + 0.12), role("bogie")))
        parts.append(K.box("frame_top", (0.14, span + 0.9, 0.14), (x, y, wheel_r + 0.28), role("bogie")))
        for k in range(axles):
            ay = y + span / 2 - k * spacing
            parts.append(K.box("axlebox", (0.24, 0.3, 0.26), (sx * 1.07, ay, wheel_r), role("underframe")))
            parts.append(K.cylinder("spring", 0.09, 0.22, (sx * 1.07, ay, wheel_r + 0.27), role("yellow" if not loco else "underframe"), verts=6, caps=False))
    parts.append(K.box("bolster", (2.25, 0.45, 0.22), (0, y, wheel_r + 0.38), role("bogie")))
    if loco:
        parts.append(K.box("motors", (1.3, span * 0.85, 0.55), (0, y, wheel_r + 0.02), role("underframe")))
    b = K.join(parts, name)
    K.set_origin(b, pivot)
    return b, pivot


def wheelset(name, y, r, gauge_half, segs):
    parts = []
    for sx in (1, -1):
        prof = [(r * 0.62, sx * (gauge_half + 0.07)), (r, sx * (gauge_half + 0.065)), (r, sx * (gauge_half - 0.045)),
                (r + 0.028, sx * (gauge_half - 0.065))]
        if sx < 0:
            prof = list(reversed(prof))
        parts.append(K.lathe("wheel", prof, role("steel"), segs, axis="X"))
    parts.append(K.cylinder("axle", 0.09, 2 * gauge_half + 0.1, (0, 0, 0), role("bogie"), rot=(0, math.pi / 2, 0), verts=6, caps=False))
    ws = K.join(parts, name)
    ws.location = (0, y, r)
    return ws
