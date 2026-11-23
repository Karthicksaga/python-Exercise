"""
Aircraft for the Godot game, by script in Blender 5.2 LTS (brief §11, phase 6b):

    blender -b --factory-startup --python tools/blender/vehicles/aircraft.py -- [--only helicopter,airliner,light_aircraft]

Writes `assets/aircraft/<name>.glb`, `<name>_lod1.glb`, `<name>_lod2.glb` and `<name>.json`.

* `helicopter`: an original light utility helicopter: five seats, three-blade main rotor (10.7 m),
  two-blade tail rotor on the left of the boom, skids, hinged front doors and sliding rear doors.
* `airliner`: an original small narrow-body twin (36 m long, 34 m span, about 150 seats): two
  underwing engines with fan nodes, retractable tricycle gear with pivot nodes, ailerons, flaps,
  elevators and rudder as hinged nodes, a forward passenger door. Invented airline colours (white,
  deep teal belly, coral cheatline, teal fin with a coral disc): no name, no logo, no registration.
* `light_aircraft`: an original high-wing four-seat single-engine trainer with a fixed tricycle
  gear, two-blade propeller, hinged doors and control surfaces.

Frames as in `vkit.py` (+Y up, the nose towards -Z in Godot). Origins: the helicopter's on the
ground below the main rotor mast; the aeroplanes' on the ground below the main gear axle. Every
moving part is its own node with its origin on its pivot or hinge, listed in the manifest's
`pivots` with the axis (Godot frame) and range.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vkit as K  # noqa: E402
from vkit import Vector, role  # noqa: E402

OUT = os.path.join(K.ROOT, "assets", "aircraft")
SOURCE = "tools/blender/vehicles/aircraft.py"
LOD_DIST = {"helicopter": (40, 250, 2000), "airliner": (90, 600, 4000), "light_aircraft": (40, 250, 2000)}


# ----------------------------------------------------------------------------- shared parts


def body_of_revolution(name, rings, mat, n, uv=None, caps=(True, True)):
    """Fuselage through rings (y, centre z, half width, half height); seam at the belly.
    With `uv(y, theta)` -> (u, v), vertices get livery UVs (the seam column is duplicated)."""
    verts, uvs = [], []
    cols = n + 1 if uv else n
    for y, cz, hw, hh in rings:
        for i in range(cols):
            t = 2 * math.pi * i / n
            verts.append(Vector((hw * math.sin(t), y, cz - hh * math.cos(t))))
            if uv:
                uvs.append(uv(y, t))
    faces = []
    for r in range(len(rings) - 1):
        for i in range(n):
            a = r * cols + i
            b = r * cols + (i + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    if caps[0]:
        faces.append(tuple(reversed(range(n))))
    if caps[1]:
        last = (len(rings) - 1) * cols
        faces.append(tuple(range(last, last + n)))
    return K.mesh_object(name, verts, faces, mat, uvs if uv else None)


def strip(name, span0, span1, le, chord, base, f0, f1, thick, mat, frame="wing", n=None, flat=False):
    """
    A lifting-surface strip between spanwise stations span0 and span1, covering chord fractions
    f0..f1 (0 leading edge, 1 trailing edge) of an airfoil with thickness/chord `thick`.
    `le(s)`, `chord(s)`, `base(s)` give the leading edge y, the chord and the surface height (or x
    for a fin) at span s. frame "wing": span along x, thickness along z; "fin": span along z,
    thickness along x.
    """
    k = n or (8 if K.LOD == 0 else (4 if K.LOD == 1 else 2))

    def section(s):
        c = chord(s)
        top, bot = [], []
        for i in range(k + 1):
            f = f0 + (f1 - f0) * i / k
            th = 5 * thick * (0.2969 * math.sqrt(max(f, 1e-4)) - 0.126 * f - 0.3516 * f * f + 0.2843 * f ** 3 - 0.1036 * f ** 4) * c
            if flat:
                th = max(th, 0.01)
            th = max(th, 0.004)
            y = le(s) - f * c
            if frame == "wing":
                top.append(Vector((s, y, base(s) + th)))
                bot.append(Vector((s, y, base(s) - th)))
            else:
                top.append(Vector((base(s) + th, y, s)))
                bot.append(Vector((base(s) - th, y, s)))
        return top + list(reversed(bot))

    return K.loft(name, [section(span0), section(span1)], mat, caps=(True, True))


def lerp(a, b, t):
    return a + (b - a) * t


def hinge_node(obj, p0, p1):
    """Origin of a control surface or gear leg on its hinge line (p0..p1, Blender frame);
    returns the pivot and the unit axis (Godot frame) for the manifest."""
    p0, p1 = Vector(p0), Vector(p1)
    mid = (p0 + p1) / 2
    K.set_origin(obj, mid)
    axis = (p1 - p0).normalized()
    return K.g(mid), K.g_axis(axis)


def wheel(name, location, radius, width, rim="alloy"):
    """An aircraft wheel: tyre and hub, axle along x."""
    w = K.car_wheel(name, location, radius, width, spokes=0, rim_role=rim, sidewall=0.45, face_sign=1)
    return w


def lod_suffix(lod):
    return "" if lod == 0 else f"_lod{lod}"


def export(name, lod):
    path = os.path.join(OUT, name + lod_suffix(lod) + ".glb")
    lo, hi = K.scene_bounds()
    tris = K.export_glb(path)
    return dict(tris=tris, lo=lo, hi=hi)


# ----------------------------------------------------------------------------- helicopter

HELI_PAINTS = [("white and red", (0.8, 0.8, 0.78)), ("rescue yellow", (0.75, 0.45, 0.01)), ("police blue", (0.01, 0.04, 0.16)),
               ("charcoal", (0.05, 0.05, 0.055)), ("sea green", (0.03, 0.18, 0.14))]
MAST = Vector((0, 0.0, 2.72))
TAIL_ROTOR = Vector((-0.24, -7.02, 2.12))


def helicopter(lod):
    K.LOD = lod
    K.reset()
    paint = K.paint_material(HELI_PAINTS[0][1], rough=0.3, metal=0.1)
    rings = [
        (2.62, 1.02, 0.12, 0.14), (2.48, 0.98, 0.42, 0.38), (2.15, 1.18, 0.66, 0.6), (1.55, 1.32, 0.78, 0.74),
        (0.6, 1.37, 0.8, 0.79), (-0.6, 1.38, 0.79, 0.79), (-1.3, 1.5, 0.66, 0.72), (-2.0, 1.66, 0.36, 0.4),
        (-2.7, 1.72, 0.2, 0.2), (-6.5, 1.8, 0.1, 0.1), (-7.15, 1.82, 0.07, 0.08),
    ]
    if lod == 2:
        rings = [rings[i] for i in (0, 2, 4, 5, 7, 9, 10)]
    n = K.seg(20, 12, 6)
    fus = body_of_revolution("fuselage", rings, paint, n)
    if lod == 0:
        K.subsurf(fus, 1)
        K.apply_all(fus)
    # Cut along the paint and door lines first, so colours and doors end on straight edges.
    if lod < 2:
        K.bisect_planes(fus, ys=(1.8, 1.45, 1.35, 1.0, 1.7, 0.25, 0.1, -1.05, -1.3, -2.2, -6.6),
                        zs=(0.7, 0.75, 0.85, 0.95, 1.05, 1.25, 1.72, 1.85, 1.9, 1.95, 2.02))
    # Glass: the nose bubble and the cabin windows (doors).
    def glass(c, n_):
        if c.y > 1.45 and c.z > 0.95 and not (c.z > 1.85 and c.y < 1.8):
            return True
        if abs(n_.x) > 0.55 and 1.25 < c.z < 1.9 and -1.05 < c.y < 1.35 and not (0.1 < c.y < 0.25):
            return True
        return c.z > 2.02 and 1.0 < c.y < 1.7  # roof windows over the pilots
    K.paint_faces(fus, role("glass_cockpit"), glass)
    K.paint_faces(fus, role("red"), lambda c, n_: abs(n_.x) > 0.3 and -6.6 < c.y < -2.2 and 1.72 < c.z < 1.9)
    K.paint_faces(fus, role("red"), lambda c, n_: abs(n_.x) > 0.5 and 0.85 < c.z < 1.05 and c.y > -1.3)
    K.paint_faces(fus, role("dark_grey"), lambda c, n_: c.z < 0.7)
    K.smooth(fus, 45)
    parts = [fus]
    doors = []
    if lod == 0:
        for sx in (1, -1):
            # Front door: the pilot's (right) and co-pilot's, hinged at the front edge.
            t = (lambda sx: lambda c, n_: abs(n_.x) > 0.45 and c.x * sx > 0.4 and 0.25 < c.y < 1.35 and 0.75 < c.z < 1.95)(sx)
            d = K.separate(fus, "door_front_" + ("r" if sx > 0 else "l"), t)
            doors.append((d, "hinge", sx, 1.35))
            t2 = (lambda sx: lambda c, n_: abs(n_.x) > 0.45 and c.x * sx > 0.4 and -1.05 < c.y < 0.1 and 0.75 < c.z < 1.95)(sx)
            d2 = K.separate(fus, "door_rear_" + ("r" if sx > 0 else "l"), t2)
            doors.append((d2, "slide", sx, 0.1))
        # Cabin inside (seen with a door open): dark liner, seats.
        parts.append(K.box("cabin_floor", (1.4, 2.4, 0.04), (0, 0.15, 0.68), role("interior")))
        for x, y in ((0.38, 1.0), (-0.38, 1.0)):
            parts.append(K.box("seat", (0.48, 0.48, 0.1), (x, y, 0.9), role("seat_dark"), bevel=0.02))
            parts.append(K.box("seat_back", (0.48, 0.1, 0.6), (x, y - 0.26, 1.2), role("seat_dark"), bevel=0.02))
        parts.append(K.box("bench", (1.4, 0.5, 0.1), (0, -0.55, 0.9), role("seat_dark"), bevel=0.02))
        parts.append(K.box("bench_back", (1.4, 0.1, 0.65), (0, -0.82, 1.22), role("seat_dark"), bevel=0.02))
        parts.append(K.box("console", (1.2, 0.35, 0.3), (0, 1.75, 1.25), role("interior"), bevel=0.03))
        parts.append(K.box("panel", (1.0, 0.04, 0.22), (0, 1.6, 1.45), role("screen")))
    # Engine cowling and exhausts on the roof, behind the mast; the mast fairing.
    parts.append(K.box("cowling", (0.9, 1.9, 0.42), (0, -0.85, 2.18), paint, bevel=0.15, segments=2))
    parts.append(K.box("intake", (0.5, 0.05, 0.22), (0, 0.11, 2.2), role("dark_grey")))
    for sx in (1, -1):
        parts.append(K.cylinder("exhaust", 0.1, 0.4, (sx * 0.28, -1.85, 2.2), role("steel"), rot=(math.pi / 2 + 0.3, 0, 0), verts=K.seg(10, 6, 4)))
    parts.append(K.cylinder("mast_fairing", 0.2, 0.32, (0, 0, 2.48), paint, verts=K.seg(14, 8, 4)))
    parts.append(K.cylinder("mast", 0.07, 0.2, (0, 0, 2.68), role("steel"), verts=K.seg(10, 6, 4)))
    # Tail: fin, horizontal stabiliser with end plates, tail skid; the tail-rotor gearbox.
    fin_le = lambda s: -6.2 - (s - 1.8) * 0.55
    parts.append(strip("fin", 1.75, 2.75, fin_le, lambda s: 0.85 - (s - 1.75) * 0.25, lambda s: 0.0, 0.0, 1.0, 0.12, paint, frame="fin"))
    parts.append(strip("fin_low", 1.0, 1.75, lambda s: -6.55 + (1.75 - s) * 0.2, lambda s: 0.6, lambda s: 0.0, 0.0, 1.0, 0.12, paint, frame="fin"))
    parts.append(strip("stab", -1.1, 1.1, lambda s: -5.25, lambda s: 0.55, lambda s: 1.8, 0.0, 1.0, 0.12, paint))
    for sx in (1, -1):
        parts.append(K.box("stab_end", (0.03, 0.5, 0.35), (sx * 1.1, -5.5, 1.82), role("red")))
    parts.append(K.box("gearbox", (0.18, 0.3, 0.25), (-0.1, -7.02, 2.12), role("mid_grey"), bevel=0.04))
    parts.append(K.box("beacon", (0.08, 0.08, 0.06), (0, -0.4, 2.42), role("nav_red")))
    parts.append(K.box("strobe", (0.05, 0.05, 0.05), (0, -7.2, 2.7), role("strobe")))
    parts.append(K.box("nav_l", (0.05, 0.08, 0.05), (-1.1, -5.4, 1.85), role("nav_red")))
    parts.append(K.box("nav_r", (0.05, 0.08, 0.05), (1.1, -5.4, 1.85), role("nav_green")))
    parts.append(K.box("landing_light", (0.18, 0.05, 0.1), (0, 2.35, 0.75), role("headlamp")))
    # Skids: two tubes with upturned toes on two cross tubes.
    sk = K.seg(8, 6, 4)
    for sx in (1, -1):
        x = sx * 1.12
        parts.append(K.path_tube("skid", [(x, -1.75, 0.04), (x, 1.3, 0.04), (x, 1.65, 0.12), (x, 1.82, 0.32)], 0.04, role("skid"), verts=sk))
        for y in (0.95, -0.95):
            parts.append(K.path_tube("cross", [(x, y, 0.04), (sx * 1.05, y, 0.45), (sx * 0.65, y, 0.66)], 0.035, role("skid"), verts=sk))
    body = K.join(parts, "body")
    if lod == 2:
        K.decimate(body, 240)
    # Main rotor: hub and three blades with painted tips; node origin on the mast, spins about +Y.
    rp = [K.cylinder("hub", 0.18, 0.16, MAST + Vector((0, 0, 0.05)), role("mid_grey"), verts=K.seg(14, 8, 4))]
    for i in range(3):
        a = 2 * math.pi * i / 3 + math.pi / 2
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0))
        for r0, r1, rl in ((0.12, 4.85, "blade"), (4.85, 5.35, "blade_tip")) if lod < 2 else ((0.12, 5.35, "blade"),):
            c = MAST + d * ((r0 + r1) / 2) + Vector((0, 0, 0.06 - 0.01 * (r0 + r1) / 2 * 0.1))
            b = K.box("blade", ((r1 - r0), 0.3, 0.04), c, role(rl))
            b.rotation_euler = (0, 0, a)
            rp.append(b)
        if lod < 2:
            rp.append(K.box("grip", (0.4, 0.14, 0.1), MAST + d * 0.3 + Vector((0, 0, 0.06)), role("steel"), rot=(0, 0, a)))
        del side
    rotor = K.join(rp, "rotor_main")
    K.set_origin(rotor, MAST)
    tp = [K.cylinder("thub", 0.08, 0.12, TAIL_ROTOR, role("mid_grey"), rot=(0, math.pi / 2, 0), verts=K.seg(10, 6, 4))]
    for i in range(2 if lod < 2 else 1):
        a = math.pi * i + 0.4
        b = K.box("tblade", (0.04, 0.16, 0.82), TAIL_ROTOR + Vector((-0.03, math.sin(a) * 0.42, math.cos(a) * 0.42)), role("blade"))
        b.rotation_euler = (-a, 0, 0)
        tp.append(b)
        tip = K.box("ttip", (0.045, 0.17, 0.12), TAIL_ROTOR + Vector((-0.03, math.sin(a) * 0.78, math.cos(a) * 0.78)), role("blade_tip"))
        tip.rotation_euler = (-a, 0, 0)
        tp.append(tip)
    trotor = K.join(tp, "rotor_tail")
    K.set_origin(trotor, TAIL_ROTOR)
    door_data = []
    for d, kind, sx, edge in doors:
        if kind == "hinge":
            K.set_origin(d, (sx * 0.8, edge, 0))
            door_data.append(dict(node=d.name, hinge=K.g((sx * 0.8, edge, 0)), axis=[0, 1, 0], open_deg=70 * sx,
                                  side="right" if sx > 0 else "left"))
        else:
            K.set_origin(d, (sx * 0.8, edge, 0))
            door_data.append(dict(node=d.name, hinge=K.g((sx * 0.8, edge, 0)), axis=[0, 1, 0], open_deg=0, slide=K.g_axis((sx * 0.06, -1.0, 0)),
                                  slide_m=1.05, side="right" if sx > 0 else "left", notes="sliding door: translate along `slide` by slide_m"))
    if lod == 0:
        for nm, p in (("seat_pilot", (0.38, 1.0, 1.05)), ("seat_copilot", (-0.38, 1.0, 1.05)), ("seat_rear_l", (-0.48, -0.55, 1.05)),
                      ("seat_rear_c", (0, -0.55, 1.05)), ("seat_rear_r", (0.48, -0.55, 1.05)), ("grip_cyclic", (0.38, 1.38, 1.1)),
                      ("grip_collective", (0.08, 1.05, 1.0)), ("cargo_floor", (0, -0.1, 0.7))):
            K.empty(nm, p)
    K.empty("marker_front", (0, 2.64, 1.02))
    return export("helicopter", lod), door_data


def run_helicopter():
    res = []
    doors = None
    for lod in (0, 1, 2):
        r, dd = helicopter(lod)
        res.append(r)
        doors = doors or dd
    lo, hi = res[0]["lo"], res[0]["hi"]
    d = LOD_DIST["helicopter"]
    m = dict(
        name="helicopter", label="Light utility helicopter", kind="helicopter", source=SOURCE, licence=K.LICENCE,
        frame="metres; +Y up, nose towards -Z, +X right; skids on y = 0; origin on the ground below the main rotor mast",
        size_m=dict(zip(("width", "height", "length"), K.size_godot(lo, hi))),
        size_note="bounds include the main rotor (10.7 m across) with one blade pointing forwards",
        fuselage_length_m=9.85, rotor_diameter_m=10.7, mass_kg=dict(empty=1250, max_takeoff=2250),
        lods=[dict(file="helicopter.glb", triangles=res[0]["tris"], max_distance_m=d[0]),
              dict(file="helicopter_lod1.glb", triangles=res[1]["tris"], min_distance_m=d[0], max_distance_m=d[1]),
              dict(file="helicopter_lod2.glb", triangles=res[2]["tris"], min_distance_m=d[1], max_distance_m=d[2])],
        wheels=[],
        pivots=[dict(node="rotor_main", what="main rotor, spins", pivot=K.g(MAST), axis=[0, 1, 0], rpm=400, direction="anticlockwise seen from above"),
                dict(node="rotor_tail", what="tail rotor, spins", pivot=K.g(TAIL_ROTOR), axis=[1, 0, 0], rpm=2100)],
        doors=doors,
        seats=[dict(node="seat_pilot", role="pilot", side="right"), dict(node="seat_copilot", role="passenger"),
               dict(node="seat_rear_l", role="passenger"), dict(node="seat_rear_c", role="passenger"), dict(node="seat_rear_r", role="passenger")],
        grips=[dict(node="grip_cyclic", hand="right", what="cyclic stick between the knees"),
               dict(node="grip_collective", hand="left", what="collective lever beside the seat")],
        cargo=[dict(node="cargo_floor", what="cabin floor (stretcher or goods with the rear seats folded)")],
        landing_contacts=[K.g((sx * 1.12, y, 0.0)) for sx in (1, -1) for y in (1.3, -1.75)],
        collision=[dict(shape="box", centre=K.g((0, 0.4, 1.35)), half_extents=[0.85, 0.8, 2.2]),
                   dict(shape="box", centre=K.g((0, -4.6, 1.85)), half_extents=[0.25, 0.3, 2.4]),
                   dict(shape="box", centre=K.g((0, -6.8, 2.2)), half_extents=[0.1, 0.6, 0.6]),
                   dict(shape="box", centre=K.g((0, 0, 0.3)), half_extents=[1.2, 0.3, 1.8]),
                   dict(shape="cylinder", centre=K.g(MAST + Vector((0, 0, 0.06))), radius=5.35, height=0.2, what="rotor disc, for blade strikes")],
        paints=[dict(name=nm, srgb=[round(K._srgb(c), 4) for c in rgb]) for nm, rgb in HELI_PAINTS],
        paint_surface="material named `paint`: set albedo_color = Color(srgb)",
        flight=dict(max_speed_ms=72, cruise_ms=60, service_ceiling_m=5500, hover_power_share=0.75,
                    notes="proposed starting values for the arcade flight model (estimated)"),
        required_nodes=["body", "rotor_main", "rotor_tail", "marker_front"],
    )
    K.write_manifest(os.path.join(OUT, "helicopter.json"), m)


# ----------------------------------------------------------------------------- airliner

AL_NOSE, AL_TAIL = 16.0, -20.0
AL_LEN = AL_NOSE - AL_TAIL
AL_CZ, AL_R = 3.55, 1.97
WHITE = (0.82, 0.82, 0.8)
TEAL = (0.01, 0.12, 0.13)
CORAL = (0.8, 0.2, 0.09)
GREY = (0.45, 0.46, 0.47)
NOSE_GEAR_Y, MAIN_GEAR_Y, MAIN_GEAR_X = 12.7, 0.0, 3.8
NOSE_WHEEL_R, MAIN_WHEEL_R = 0.37, 0.58
WING_ROOT_LE, WING_ROOT_X, WING_TIP_X = 5.0, 1.75, 17.0
WING_SWEEP = math.tan(math.radians(26))


def al_rings(lod):
    """(y, centre z, half width, half height): nose, barrel, tail cone sweeping up."""
    nose = [(16.0, 3.3, 0.05, 0.05), (15.85, 3.32, 0.45, 0.42), (15.5, 3.36, 0.85, 0.8), (14.9, 3.42, 1.3, 1.25), (14.0, 3.48, 1.68, 1.64),
            (12.8, 3.53, 1.92, 1.9), (11.5, AL_CZ, AL_R, AL_R)]
    tail = [(-9.0, AL_CZ, AL_R, AL_R), (-12.0, 3.68, 1.86, 1.82), (-15.0, 3.95, 1.5, 1.4), (-17.5, 4.25, 1.0, 0.92),
            (-19.4, 4.55, 0.45, 0.4), (-20.0, 4.65, 0.12, 0.1)]
    mid = [(y, AL_CZ, AL_R, AL_R) for y in (8.0, 4.0, 0.0, -4.0)] if lod == 0 else []
    if lod == 2:
        nose = [nose[0], nose[3], nose[6]]
        tail = [tail[0], tail[2], tail[5]]
    return nose + mid + tail


def al_uv(y, t):
    """Fuselage UVs: u along the length, v round the body (belly seam), the top half of the atlas."""
    return ((AL_NOSE - y) / AL_LEN, 0.5 + 0.5 * t / (2 * math.pi))


def airliner_livery():
    """1024 x 1024: fuselage (top half), fin (bottom-left quarter), engine cowls (bottom right)."""
    W = 1024
    p = K.Painter("livery_airliner", W, W, WHITE)
    fy0 = 512  # fuselage region rows 512..1024 (v 0.5..1), theta 0..2pi from the belly

    def row(theta):
        return fy0 + theta / (2 * math.pi) * 512

    def col(y):
        return (AL_NOSE - y) / AL_LEN * W

    # Belly: deep teal below the cheatline on both sides; coral cheatline.
    p.rect(0, row(0), W, row(math.pi / 2 - 0.42), TEAL)
    p.rect(0, row(3 * math.pi / 2 + 0.42), W, row(2 * math.pi), TEAL)
    p.rect(0, row(math.pi / 2 - 0.42), W, row(math.pi / 2 - 0.3), CORAL)
    p.rect(0, row(3 * math.pi / 2 + 0.3), W, row(3 * math.pi / 2 + 0.42), CORAL)
    # Nose cone (radome) grey, tail cone grey.
    p.rect(0, fy0, col(15.55), W, GREY)
    p.rect(col(-19.3), fy0, W, W, GREY)
    # Passenger windows: one row each side, a little above the widest point.
    dark = (0.02, 0.025, 0.03)
    for side_t in (math.pi / 2 + 0.2, 3 * math.pi / 2 - 0.2):
        y = 10.6
        while y > -12.6:
            if not (9.7 < y < 10.9 or -11.4 < y < -10.2 or 0.6 < y < 1.6 or -1.2 < y < -0.4):
                c = col(y)
                p.rect(c - 3.5, row(side_t) - 7, c + 3.5, row(side_t) + 7, dark)
            y -= 0.53
        # Doors: outlines of the forward and aft doors and the overwing exits.
        for dy, w in ((11.4, 0.95), (-10.0, 0.9)):
            c0, c1 = col(dy), col(dy - w)
            r0, r1 = row(side_t - 0.55), row(side_t + 0.38)
            for a, b, cc, dd in ((c0, r0, c1, r0 + 2), (c0, r1 - 2, c1, r1), (c0, r0, c0 + 2, r1), (c1 - 2, r0, c1, r1)):
                p.rect(min(a, cc), min(b, dd), max(a, cc), max(b, dd), (0.35, 0.36, 0.37))
    # Cockpit windows: four panes across the front, above the nose.
    for side in (1, -1):
        for k in range(2):
            t0 = math.pi + side * (0.12 + k * 0.42)
            t1 = math.pi + side * (0.5 + k * 0.42)
            c0, c1 = col(14.75 - k * 0.15), col(14.2 - k * 0.2)
            p.poly([(c0, row(t0)), (c1, row(t0)), (c1, row(t1)), (c0 + 4, row(t1))], dark)
    # Fin (bottom-left quarter, u 0..0.5, v 0..0.5): teal with a coral disc and a white arc.
    p.rect(0, 0, 512, 512, TEAL)
    p.disc(250, 230, 120, CORAL)
    p.disc(250, 230, 84, TEAL)
    p.disc(250, 230, 60, CORAL)
    p.rect(60, 120, 460, 132, WHITE)
    # Engine cowls (bottom right): teal with a coral lip band.
    p.rect(512, 0, 1024, 512, TEAL)
    p.rect(512, 440, 1024, 512, CORAL)
    return p.image()


def airliner(lod):
    K.LOD = lod
    K.reset()
    img = airliner_livery()
    liv = K.livery_material("livery_airliner", img, rough=0.35, metal=0.05)
    n = K.seg(24, 14, 8)
    fus = body_of_revolution("fuselage", al_rings(lod), liv, n, uv=al_uv)
    K.smooth(fus, 50)
    parts = [fus]
    pivots = []
    # Wings: inner (fixed + flap), outer (fixed + aileron), winglets; spar at 72 % chord.
    semi = WING_TIP_X - WING_ROOT_X
    le = lambda s: WING_ROOT_LE - (abs(s) - WING_ROOT_X) * WING_SWEEP
    chord = lambda s: 6.2 - (abs(s) - WING_ROOT_X) / semi * (6.2 - 1.55) - (0.9 if abs(s) > 6.5 else 0.9 * (abs(s) - WING_ROOT_X) / (6.5 - WING_ROOT_X))
    zb = lambda s: 2.35 + (abs(s) - WING_ROOT_X) * math.tan(math.radians(5))
    wing_mat = role("white")
    kink = 6.5
    ail0 = 11.5
    for sx in (1, -1):
        sname = "r" if sx > 0 else "l"
        st = [WING_ROOT_X * sx * 0.6, kink * sx, ail0 * sx, WING_TIP_X * sx]
        # Fixed parts (leading edge to the spar).
        parts.append(strip("wing", st[0], st[1], le, chord, zb, 0.0, 1.0, 0.13, wing_mat))  # inner wing to the trailing edge (flap is below)
        parts.append(strip("wing", st[1], st[3], le, chord, zb, 0.0, 0.74, 0.11, wing_mat))
        if lod < 2:
            # Flap: the outer trailing edge between the kink and the aileron.
            fl = strip("flap_" + sname, st[1], st[2], le, chord, zb, 0.74, 1.0, 0.11, role("light_grey"))
            fl = K.join([fl], "flap_" + sname)
            h0 = Vector((st[1], le(st[1]) - 0.74 * chord(st[1]), zb(st[1])))
            h1 = Vector((st[2], le(st[2]) - 0.74 * chord(st[2]), zb(st[2])))
            pv, ax = hinge_node(fl, h0, h1)
            pivots.append(dict(node=fl.name, what="flap", pivot=pv, axis=ax, range_deg=[0, 35]))
            ai = strip("aileron_" + sname, st[2], st[3] - sx * 0.3, le, chord, zb, 0.74, 1.0, 0.1, role("light_grey"))
            ai = K.join([ai], "aileron_" + sname)
            h0 = Vector((st[2], le(st[2]) - 0.74 * chord(st[2]), zb(st[2])))
            h1 = Vector((st[3] - sx * 0.3, le(st[3] - sx * 0.3) - 0.74 * chord(st[3] - sx * 0.3), zb(st[3] - sx * 0.3)))
            pv, ax = hinge_node(ai, h0, h1)
            pivots.append(dict(node=ai.name, what="aileron", pivot=pv, axis=ax, range_deg=[-25, 25]))
        else:
            parts.append(strip("wing_te", st[1], st[3], le, chord, zb, 0.74, 1.0, 0.11, wing_mat))
        # Winglet.
        tipx = WING_TIP_X * sx
        parts.append(strip("winglet", zb(tipx), zb(tipx) + 2.2, lambda s: le(tipx) - (s - zb(tipx)) * 0.6, lambda s: 1.5 - (s - zb(tipx)) * 0.35,
                           lambda s: tipx + sx * (s - zb(tipx)) * 0.12, 0.0, 1.0, 0.09, role("white"), frame="fin"))
        parts.append(K.box("nav", (0.1, 0.15, 0.1), (tipx, le(tipx) - 0.3, zb(tipx)), role("nav_green" if sx > 0 else "nav_red")))
        # Engine nacelle (cowl in livery teal via the atlas cell), pylon, exhaust cone; fan node.
        ex = 5.8 * sx
        ey = le(ex) + 2.3
        ez = zb(ex) - 1.15
        nac_r = 1.0
        prof = [(nac_r * 0.88, 0.0), (nac_r, -0.4), (nac_r, -2.4), (nac_r * 0.72, -3.4), (0.5, -3.45), (0.45, -3.4)]
        nac = K.lathe("nacelle", prof, role("teal"), K.seg(24, 14, 8), axis="Y")
        nac.location = (ex, ey, ez)
        parts.append(nac)
        inner = K.lathe("nac_in", [(nac_r * 0.86, 0.0), (nac_r * 0.84, -0.5)], role("fan"), K.seg(24, 14, 8), axis="Y")
        inner.location = (ex, ey, ez)
        parts.append(inner)
        lip = K.lathe("lip", [(nac_r * 0.86, 0.02), (nac_r * 0.95, 0.03), (nac_r, -0.12)], role("chrome"), K.seg(24, 14, 8), axis="Y")
        lip.location = (ex, ey, ez)
        parts.append(lip)
        cone = K.lathe("exh", [(0.45, -3.4), (0.3, -4.1), (0.01, -4.5)], role("engine"), K.seg(16, 8, 6), axis="Y")
        cone.location = (ex, ey, ez)
        parts.append(cone)
        parts.append(K.box("pylon", (0.35, 3.6, 1.1), (ex, ey - 2.3, ez + 0.9), role("white"), bevel=0.1))
        if lod < 2:
            fan = [K.lathe("spinner", [(0.32, -0.3), (0.2, -0.1), (0.01, 0.05)], role("fan"), K.seg(16, 8), axis="Y")]
            for i in range(K.seg(18, 8)):
                a = 2 * math.pi * i / K.seg(18, 8)
                b = K.box("fanblade", (0.06, 0.12, 0.55), (math.cos(a) * 0.6, -0.3, math.sin(a) * 0.6), role("fan"))
                b.rotation_euler = (0, -a + math.pi / 2, 0)
                b.rotation_euler.y = math.pi / 2 - a
                fan.append(b)
            fan_o = K.join(fan, "fan_" + sname)
            fan_o.location = (ex, ey, ez)
            K.set_origin(fan_o, (ex, ey - 0.3, ez))
            pivots.append(dict(node=fan_o.name, what="engine fan, spins", pivot=K.g((ex, ey - 0.3, ez)), axis=[0, 0, -1], rpm=3000))
    # Wing-body fairing (belly).
    parts.append(K.box("fairing", (3.6, 9.0, 1.2), (0, 1.0, 2.05), role("white"), bevel=0.5, segments=2))
    # Horizontal stabiliser and elevators.
    hs_le = lambda s: -15.2 - abs(s) * math.tan(math.radians(30))
    hs_c = lambda s: 3.6 - abs(s) / 6.2 * 2.2
    hs_z = lambda s: 4.35 + abs(s) * 0.08
    for sx in (1, -1):
        sname = "r" if sx > 0 else "l"
        parts.append(strip("stab", 0.4 * sx, 6.2 * sx, hs_le, hs_c, hs_z, 0.0, 0.7, 0.1, role("white")))
        el = strip("elevator_" + sname, 0.6 * sx, 6.0 * sx, hs_le, hs_c, hs_z, 0.7, 1.0, 0.09, role("light_grey"))
        el = K.join([el], "elevator_" + sname)
        if lod < 2:
            h0 = Vector((0.6 * sx, hs_le(0.6) - 0.7 * hs_c(0.6), hs_z(0.6)))
            h1 = Vector((6.0 * sx, hs_le(6.0) - 0.7 * hs_c(6.0), hs_z(6.0)))
            pv, ax = hinge_node(el, h0, h1)
            pivots.append(dict(node=el.name, what="elevator", pivot=pv, axis=ax, range_deg=[-25, 20]))
        else:
            parts.append(el)
    # Fin and rudder; the fin's sides carry the livery (bottom-left quarter of the atlas).
    fin_le = lambda s: -13.8 - (s - 5.2) * 0.85
    fin_c = lambda s: 5.4 - (s - 5.2) * 0.5
    fin = strip("fin", 5.2, 11.8, fin_le, fin_c, lambda s: 0.0, 0.0, 0.72, 0.11, liv, frame="fin")
    _fin_uv(fin)
    parts.append(fin)
    rud = strip("rudder", 5.3, 11.6, fin_le, fin_c, lambda s: 0.0, 0.72, 1.0, 0.1, liv, frame="fin")
    _fin_uv(rud)
    rud = K.join([rud], "rudder")
    if lod < 2:
        h0 = Vector((0, fin_le(5.3) - 0.72 * fin_c(5.3), 5.3))
        h1 = Vector((0, fin_le(11.6) - 0.72 * fin_c(11.6), 11.6))
        pv, ax = hinge_node(rud, h0, h1)
        pivots.append(dict(node="rudder", what="rudder", pivot=pv, axis=ax, range_deg=[-30, 30]))
    else:
        parts.append(rud)
    parts.append(K.box("beacon", (0.15, 0.15, 0.1), (0, 2.0, AL_CZ + AL_R + 0.03), role("nav_red")))
    parts.append(K.box("tail_strobe", (0.1, 0.1, 0.1), (0, -20.05, 4.65), role("strobe")))
    # Landing gear: nose leg (retracts forwards) with twin wheels, two main legs (retract inwards)
    # with twin wheels. Each leg's origin is its retract pivot; wheels are child nodes on the axle.
    gear = []
    nleg_top = Vector((0, NOSE_GEAR_Y, 2.15))
    nl = [K.tube("strut", nleg_top, (0, NOSE_GEAR_Y, NOSE_WHEEL_R), 0.09, role("light_grey"), verts=K.seg(10, 6, 4))]
    if lod == 0:
        nl.append(K.tube("brace", (0, NOSE_GEAR_Y + 1.0, 2.15), (0, NOSE_GEAR_Y, 1.2), 0.05, role("light_grey"), verts=6))
        nl.append(K.box("light", (0.14, 0.08, 0.1), (0, NOSE_GEAR_Y + 0.12, 1.3), role("headlamp")))
    ngear = K.join(nl, "gear_nose")
    K.set_origin(ngear, nleg_top)
    pivots.append(dict(node="gear_nose", what="nose gear leg, retracts forwards", pivot=K.g(nleg_top), axis=[1, 0, 0], range_deg=[0, -95]))
    nw = []
    for sx in ((1, -1) if lod < 2 else ()):
        w = wheel(f"wheel_nose_{'r' if sx > 0 else 'l'}", (sx * 0.24, NOSE_GEAR_Y, NOSE_WHEEL_R), NOSE_WHEEL_R, 0.24)
        K.parent_keep(w, ngear)
        nw.append(w)
    gear.append(ngear)
    mains = []
    for sx in (1, -1):
        sname = "r" if sx > 0 else "l"
        top = Vector((sx * MAIN_GEAR_X, MAIN_GEAR_Y, 2.3))
        ml = [K.tube("strut", top, (sx * MAIN_GEAR_X, MAIN_GEAR_Y, MAIN_WHEEL_R), 0.13, role("light_grey"), verts=K.seg(10, 6, 4))]
        if lod == 0:
            ml.append(K.tube("side_brace", (sx * (MAIN_GEAR_X - 1.4), MAIN_GEAR_Y, 2.2), (sx * MAIN_GEAR_X, MAIN_GEAR_Y, 1.35), 0.07, role("light_grey"), verts=6))
            ml.append(K.box("door", (0.05, 1.1, 1.3), (sx * (MAIN_GEAR_X + 0.2), MAIN_GEAR_Y, 1.55), role("white")))
        mg = K.join(ml, "gear_main_" + sname)
        K.set_origin(mg, top)
        pivots.append(dict(node=mg.name, what="main gear leg, retracts inwards", pivot=K.g(top), axis=[0, 0, -1.0 * sx] if True else None,
                           range_deg=[0, 90]))
        for k in ((-1, 1) if lod < 2 else ()):
            w = wheel(f"wheel_main_{sname}{'o' if k * sx > 0 else 'i'}", (sx * MAIN_GEAR_X + k * 0.48, MAIN_GEAR_Y, MAIN_WHEEL_R), MAIN_WHEEL_R, 0.38)
            K.parent_keep(w, mg)
        mains.append(mg)
    # Forward passenger door (left side), hinged at its forward edge.
    door = None
    if lod == 0:
        dp = [K.box("door_panel", (0.06, 0.95, 1.85), (-(AL_R - 0.02), 10.95, AL_CZ - 0.1), role("white"))]
        door = K.join(dp, "door_fwd_l")
        K.set_origin(door, (-(AL_R + 0.01), 11.42, AL_CZ - 0.1))
        K.empty("seat_captain", (-0.45, 14.0, 3.3))
        K.empty("seat_first_officer", (0.45, 14.0, 3.3))
        K.empty("grip_yoke_l", (-0.45, 14.5, 3.45))
        K.empty("grip_yoke_r", (0.45, 14.5, 3.45))
        K.empty("cargo_hold_fwd", (0, 8.0, 2.0))
    body = K.join(parts, "body")
    if lod == 2:
        K.decimate(body, 520)
    K.empty("marker_front", (0, AL_NOSE, 3.3))
    r = export("airliner", lod)
    return r, pivots


def _fin_uv(obj):
    """Project the fin's sides onto the bottom-left quarter of the livery (u 0..0.5, v 0..0.5)."""
    me = obj.data
    layer = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
    for p in me.polygons:
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            u = (-13.8 - v.y + 1.0) / 11.0
            vv = (v.z - 4.6) / 7.4
            layer.data[li].uv = (max(0.0, min(0.5, u * 0.5)), max(0.0, min(0.5, vv * 0.5)))


def run_airliner():
    res, pivots = [], None
    for lod in (0, 1, 2):
        r, pv = airliner(lod)
        res.append(r)
        pivots = pivots or pv
    lo, hi = res[0]["lo"], res[0]["hi"]
    d = LOD_DIST["airliner"]
    wheels = [dict(node="wheel_nose_l", centre=K.g((-0.24, NOSE_GEAR_Y, NOSE_WHEEL_R)), radius=NOSE_WHEEL_R, steers=True, driven=False),
              dict(node="wheel_nose_r", centre=K.g((0.24, NOSE_GEAR_Y, NOSE_WHEEL_R)), radius=NOSE_WHEEL_R, steers=True, driven=False)]
    for sx, sname in ((1, "r"), (-1, "l")):
        for k in (-1, 1):
            nm = f"wheel_main_{sname}{'o' if k * sx > 0 else 'i'}"
            wheels.append(dict(node=nm, centre=K.g((sx * MAIN_GEAR_X + k * 0.48, MAIN_GEAR_Y, MAIN_WHEEL_R)), radius=MAIN_WHEEL_R,
                               steers=False, driven=False))
    for w in wheels:
        w["lod_max"] = 1  # LOD2 (beyond 600 m) has the gear legs but no wheels
    m = dict(
        name="airliner", label="Narrow-body airliner (invented airline colours)", kind="airliner", source=SOURCE, licence=K.LICENCE,
        frame="metres; +Y up, nose towards -Z, +X right; wheels on y = 0, gear down; origin on the ground below the main gear axles",
        size_m=dict(zip(("width", "height", "length"), K.size_godot(lo, hi))),
        mass_kg=dict(empty=42000, max_takeoff=73000), seats_passengers=150,
        lods=[dict(file="airliner.glb", triangles=res[0]["tris"], max_distance_m=d[0]),
              dict(file="airliner_lod1.glb", triangles=res[1]["tris"], min_distance_m=d[0], max_distance_m=d[1]),
              dict(file="airliner_lod2.glb", triangles=res[2]["tris"], min_distance_m=d[1], max_distance_m=d[2])],
        wheels=wheels,
        pivots=pivots,
        doors=[dict(node="door_fwd_l", hinge=K.g((-(AL_R + 0.01), 11.42, AL_CZ - 0.1)), axis=[0, 1, 0], open_deg=-150, side="left",
                    notes="plug door: swing outwards and forwards about its forward edge")],
        seats=[dict(node="seat_captain", role="pilot", side="left"), dict(node="seat_first_officer", role="co-pilot")],
        grips=[dict(node="grip_yoke_l", hand="captain"), dict(node="grip_yoke_r", hand="first officer")],
        cargo=[dict(node="cargo_hold_fwd", what="forward cargo hold floor")],
        collision=[dict(shape="capsule", centre=K.g((0, -2.0, AL_CZ)), radius=AL_R, height=AL_LEN, axis="z", what="fuselage"),
                   dict(shape="box", centre=K.g((0, 1.0, 2.6)), half_extents=[17.0, 0.4, 3.0], what="wings (coarse)"),
                   dict(shape="box", centre=K.g((0, -17.0, 8.0)), half_extents=[0.4, 3.6, 2.8], what="fin"),
                   dict(shape="box", centre=K.g((0, -17.0, 4.5)), half_extents=[6.2, 0.3, 1.8], what="tailplane")],
        livery=dict(texture="embedded livery_airliner 1024 px", colours=dict(body="white", belly="deep teal", cheatline="coral", fin="teal, coral disc"),
                    notes="invented airline colours: no name, logo or registration"),
        flight=dict(rotate_ms=72, approach_ms=70, cruise_ms=230, stall_clean_ms=62, notes="proposed starting values (estimated)"),
        gear_retract_s=8.0,
        required_nodes=["body", "gear_nose", "gear_main_l", "gear_main_r", "aileron_l", "aileron_r", "elevator_l", "elevator_r", "rudder",
                        "flap_l", "flap_r", "fan_l", "fan_r", "marker_front"],
    )
    K.write_manifest(os.path.join(OUT, "airliner.json"), m)


# ----------------------------------------------------------------------------- light aircraft

LA_PAINTS = [("white and blue", (0.8, 0.8, 0.78)), ("cream and red", (0.7, 0.62, 0.45)), ("sky blue", (0.2, 0.4, 0.65)),
             ("yellow", (0.75, 0.5, 0.02))]
LA_PROP = Vector((0, 2.36, 1.18))
LA_NOSE_Y, LA_NOSE_R, LA_MAIN_X, LA_MAIN_R = 1.55, 0.19, 1.2, 0.25
LA_WING_Z, LA_WING_LE, LA_CHORD, LA_SPAN = 2.02, 0.95, 1.5, 5.5


def light_aircraft(lod):
    K.LOD = lod
    K.reset()
    paint = K.paint_material(LA_PAINTS[0][1], rough=0.3, metal=0.05)
    rings = [
        (2.34, 1.18, 0.18, 0.16), (2.25, 1.16, 0.4, 0.34), (1.9, 1.17, 0.5, 0.45), (1.4, 1.3, 0.55, 0.6), (0.9, 1.4, 0.56, 0.62),
        (-0.1, 1.42, 0.56, 0.6), (-0.95, 1.45, 0.5, 0.52), (-2.0, 1.48, 0.36, 0.33), (-4.0, 1.55, 0.2, 0.18), (-5.5, 1.62, 0.1, 0.1),
        (-5.94, 1.64, 0.05, 0.06),
    ]
    if lod == 2:
        rings = [rings[i] for i in (0, 2, 4, 6, 8, 10)]
    fus = body_of_revolution("fuselage", rings, paint, K.seg(16, 10, 6))
    if lod == 0:
        K.subsurf(fus, 1)
        K.apply_all(fus)
    if lod < 2:
        K.bisect_planes(fus, ys=(1.75, 1.3, 1.25, 1.9, 0.1, -0.05, -1.2, -2.0), zs=(0.95, 1.15, 1.3, 1.4, 1.5, 1.55, 1.6, 2.0))
    K.paint_faces(fus, role("glass_cockpit"), lambda c, n: (1.25 < c.y < 1.75 and c.z > 1.55 and n.y > 0.2) or
                  (abs(n.x) > 0.5 and 1.5 < c.z < 2.0 and -1.2 < c.y < 1.3 and not (-0.05 < c.y < 0.1)))
    K.paint_faces(fus, role("navy"), lambda c, n: abs(n.x) > 0.4 and 1.15 < c.z < 1.3 and c.y < 1.9)
    K.paint_faces(fus, role("navy"), lambda c, n: abs(n.x) > 0.3 and c.y < -2.0 and 1.4 < c.z < 1.6)
    K.smooth(fus, 45)
    parts = [fus]
    doors, pivots = [], []
    if lod == 0:
        for sx in (1, -1):
            t = (lambda sx: lambda c, n: abs(n.x) > 0.45 and c.x * sx > 0.3 and 0.1 < c.y < 1.25 and 0.95 < c.z < 2.0)(sx)
            dd = K.separate(fus, "door_" + ("r" if sx > 0 else "l"), t)
            doors.append((dd, sx))
        parts.append(K.box("cabin", (1.0, 2.0, 0.04), (0, 0.2, 0.85), role("interior")))
        for x, y in ((0.27, 0.55), (-0.27, 0.55), (0.27, -0.45), (-0.27, -0.45)):
            parts.append(K.box("seat", (0.44, 0.45, 0.1), (x, y, 1.05), role("seat_dark"), bevel=0.02))
            parts.append(K.box("seat_back", (0.44, 0.08, 0.6), (x, y - 0.25, 1.35), role("seat_dark"), bevel=0.02))
        parts.append(K.box("panel", (1.0, 0.1, 0.3), (0, 1.35, 1.55), role("interior"), bevel=0.03))
    # Engine cowl inlets, exhaust; spinner is part of the propeller node.
    for sx in (1, -1):
        parts.append(K.box("inlet", (0.14, 0.04, 0.09), (sx * 0.17, 2.27, 1.02), role("inside_dark")))
    parts.append(K.tube("exhaust", (0.2, 1.7, 0.78), (0.24, 1.6, 0.7), 0.035, role("steel"), verts=6))
    # Wing on top of the cabin with struts; flaps and ailerons as hinged nodes.
    le = lambda s: LA_WING_LE
    ch = lambda s: LA_CHORD if abs(s) < 3.0 else LA_CHORD - (abs(s) - 3.0) * 0.12
    zf = lambda s: LA_WING_Z + abs(s) * 0.03
    for sx in (1, -1):
        sname = "r" if sx > 0 else "l"
        parts.append(strip("wing", 0.0, LA_SPAN * sx, le, ch, zf, 0.0, 0.75, 0.15, paint))
        if lod < 2:
            for nm, a, b, what, rg in (("flap_", 0.3, 2.8, "flap", [0, 30]), ("aileron_", 2.8, 5.3, "aileron", [-20, 20])):
                s0, s1 = a * sx, b * sx
                cs = strip(nm + sname, s0, s1, le, ch, zf, 0.75, 1.0, 0.13, role("white"))
                cs = K.join([cs], nm + sname)
                h0 = Vector((s0, le(s0) - 0.75 * ch(s0), zf(s0)))
                h1 = Vector((s1, le(s1) - 0.75 * ch(s1), zf(s1)))
                pv, ax = hinge_node(cs, h0, h1)
                pivots.append(dict(node=cs.name, what=what, pivot=pv, axis=ax, range_deg=rg))
        else:
            parts.append(strip("wing_te", 0.0, LA_SPAN * sx, le, ch, zf, 0.75, 1.0, 0.13, paint))
        parts.append(K.tube("strut", (sx * 0.55, 0.55, 0.95), (sx * 2.5, 0.65, LA_WING_Z - 0.05), 0.035, role("white"), verts=K.seg(8, 4, 3)))
        parts.append(K.box("nav", (0.06, 0.1, 0.06), (sx * (LA_SPAN + 0.02), 0.6, zf(LA_SPAN)), role("nav_green" if sx > 0 else "nav_red")))
    # Tailplane + elevator (one node across), fin + rudder.
    ht_le = lambda s: -4.75 - abs(s) * 0.08
    ht_c = lambda s: 1.0 - abs(s) * 0.12
    ht_z = lambda s: 1.62
    parts.append(strip("stab", -1.7, 1.7, ht_le, ht_c, ht_z, 0.0, 0.6, 0.1, paint))
    el = strip("elevator", -1.7, 1.7, ht_le, ht_c, ht_z, 0.6, 1.0, 0.08, paint)
    el = K.join([el], "elevator")
    if lod < 2:
        pv, ax = hinge_node(el, (-1.7, ht_le(0) - 0.6 * ht_c(0), 1.62), (1.7, ht_le(0) - 0.6 * ht_c(0), 1.62))
        pivots.append(dict(node="elevator", what="elevator", pivot=pv, axis=ax, range_deg=[-25, 15]))
    else:
        parts.append(el)
    fin_le = lambda s: -4.3 - (s - 1.6) * 0.7
    fin_c = lambda s: 1.25 - (s - 1.6) * 0.45
    parts.append(strip("fin", 1.6, 2.72, fin_le, fin_c, lambda s: 0.0, 0.0, 0.62, 0.1, paint, frame="fin"))
    rd = strip("rudder", 1.62, 2.72, fin_le, fin_c, lambda s: 0.0, 0.62, 1.0, 0.09, role("navy"), frame="fin")
    rd = K.join([rd], "rudder")
    if lod < 2:
        pv, ax = hinge_node(rd, (0, fin_le(1.62) - 0.62 * fin_c(1.62), 1.62), (0, fin_le(2.72) - 0.62 * fin_c(2.72), 2.72))
        pivots.append(dict(node="rudder", what="rudder", pivot=pv, axis=ax, range_deg=[-25, 25]))
    else:
        parts.append(rd)
    parts.append(K.box("beacon", (0.05, 0.08, 0.05), (0, -4.95, 2.74), role("nav_red")))
    # Fixed tricycle gear: spring legs to the mains, the nose leg; the nose wheel steers.
    for sx in (1, -1):
        parts.append(K.tube("main_leg", (sx * 0.4, 0.05, 0.95), (sx * (LA_MAIN_X - 0.12), 0.0, LA_MAIN_R), 0.035, role("light_grey"), verts=K.seg(8, 4, 3)))
        if lod == 0:
            parts.append(K.box("spat", (0.16, 0.6, 0.32), (sx * LA_MAIN_X, 0.0, LA_MAIN_R + 0.02), paint, bevel=0.07, segments=2))
    nose_leg = K.join([K.tube("nose_leg", (0, LA_NOSE_Y + 0.1, 0.92), (0, LA_NOSE_Y, LA_NOSE_R), 0.035, role("light_grey"), verts=K.seg(8, 4, 3))],
                      "gear_nose")
    K.set_origin(nose_leg, (0, LA_NOSE_Y, 0.92))
    pivots.append(dict(node="gear_nose", what="nose wheel steering", pivot=K.g((0, LA_NOSE_Y, 0.92)), axis=[0, 1, 0], range_deg=[-30, 30]))
    body = K.join(parts, "body")
    if lod == 2:
        K.decimate(body, 260)
    if lod < 2:
        nw = wheel("wheel_nose", (0, LA_NOSE_Y, LA_NOSE_R), LA_NOSE_R, 0.13)
        K.parent_keep(nw, nose_leg)
    for sx in ((1, -1) if lod < 2 else ()):
        wheel("wheel_main_" + ("r" if sx > 0 else "l"), (sx * LA_MAIN_X, 0.0, LA_MAIN_R), LA_MAIN_R, 0.15)
    # Propeller: two blades and the spinner; spins about the thrust line.
    pp = [K.lathe("spinner", [(0.17, 0.0), (0.12, 0.17), (0.01, 0.26)], role("white"), K.seg(14, 8, 6), axis="Y")]
    for a in (0.0, math.pi):
        b = K.box("pblade", (0.11, 0.035, 0.86), (0, 0.05, 0.53), role("blade"))
        tip = K.box("ptip", (0.115, 0.04, 0.1), (0, 0.05, 0.92), role("blade_tip"))
        for o in (b, tip):
            o.rotation_euler = (0.25, a, 0)
            o.location = Vector((math.sin(a) * o.location.z, o.location.y, math.cos(a) * o.location.z))
        pp += [b, tip]
    prop = K.join(pp, "propeller")
    prop.location = LA_PROP
    pivots.append(dict(node="propeller", what="propeller, spins", pivot=K.g(LA_PROP), axis=[0, 0, -1], rpm=2400))
    door_data = []
    for dd, sx in doors:
        K.set_origin(dd, (sx * 0.56, 1.25, 0))
        door_data.append(dict(node=dd.name, hinge=K.g((sx * 0.56, 1.25, 0)), axis=[0, 1, 0], open_deg=75 * sx, side="right" if sx > 0 else "left"))
    if lod == 0:
        for nm, p in (("seat_pilot", (-0.27, 0.55, 1.2)), ("seat_front_r", (0.27, 0.55, 1.2)), ("seat_rear_l", (-0.27, -0.45, 1.2)),
                      ("seat_rear_r", (0.27, -0.45, 1.2)), ("grip_yoke_l", (-0.27, 1.05, 1.45)), ("grip_yoke_r", (0.27, 1.05, 1.45)),
                      ("cargo_baggage", (0, -1.1, 0.95))):
            K.empty(nm, p)
    K.empty("marker_front", (0, 2.34, 1.18))
    return export("light_aircraft", lod), door_data, pivots


def run_light_aircraft():
    res, doors, pivots = [], None, None
    for lod in (0, 1, 2):
        r, dd, pv = light_aircraft(lod)
        res.append(r)
        doors = doors or dd
        pivots = pivots or pv
    lo, hi = res[0]["lo"], res[0]["hi"]
    d = LOD_DIST["light_aircraft"]
    m = dict(
        name="light_aircraft", label="High-wing light aircraft", kind="light_aircraft", source=SOURCE, licence=K.LICENCE,
        frame="metres; +Y up, nose towards -Z, +X right; wheels on y = 0; origin on the ground below the main wheels' axle",
        size_m=dict(zip(("width", "height", "length"), K.size_godot(lo, hi))),
        mass_kg=dict(empty=760, max_takeoff=1110),
        lods=[dict(file="light_aircraft.glb", triangles=res[0]["tris"], max_distance_m=d[0]),
              dict(file="light_aircraft_lod1.glb", triangles=res[1]["tris"], min_distance_m=d[0], max_distance_m=d[1]),
              dict(file="light_aircraft_lod2.glb", triangles=res[2]["tris"], min_distance_m=d[1], max_distance_m=d[2])],
        wheels=[dict(node="wheel_nose", centre=K.g((0, LA_NOSE_Y, LA_NOSE_R)), radius=LA_NOSE_R, steers=True, driven=False),
                dict(node="wheel_main_l", centre=K.g((-LA_MAIN_X, 0, LA_MAIN_R)), radius=LA_MAIN_R, steers=False, driven=False),
                dict(node="wheel_main_r", centre=K.g((LA_MAIN_X, 0, LA_MAIN_R)), radius=LA_MAIN_R, steers=False, driven=False)],
        wheels_note="LOD2 (beyond 250 m) has no wheel nodes",
        pivots=pivots, doors=doors,
        seats=[dict(node="seat_pilot", role="pilot", side="left"), dict(node="seat_front_r", role="passenger"),
               dict(node="seat_rear_l", role="passenger"), dict(node="seat_rear_r", role="passenger")],
        grips=[dict(node="grip_yoke_l", hand="pilot"), dict(node="grip_yoke_r", hand="passenger")],
        cargo=[dict(node="cargo_baggage", what="baggage area behind the rear seats")],
        collision=[dict(shape="box", centre=K.g((0, -1.6, 1.35)), half_extents=[0.55, 0.55, 4.0], what="fuselage"),
                   dict(shape="box", centre=K.g((0, 0.2, 2.05)), half_extents=[5.5, 0.1, 0.75], what="wing"),
                   dict(shape="box", centre=K.g((0, -5.0, 1.9)), half_extents=[1.7, 0.6, 0.5], what="tail")],
        paints=[dict(name=nm, srgb=[round(K._srgb(c), 4) for c in rgb]) for nm, rgb in LA_PAINTS],
        paint_surface="material named `paint`: set albedo_color = Color(srgb)",
        flight=dict(rotate_ms=28, cruise_ms=58, stall_ms=24, notes="proposed starting values (estimated)"),
        required_nodes=["body", "propeller", "gear_nose", "aileron_l", "aileron_r", "flap_l", "flap_r", "elevator", "rudder", "marker_front"],
    )
    for w in m["wheels"]:
        w["lod_max"] = 1
    K.write_manifest(os.path.join(OUT, "light_aircraft.json"), m)


if __name__ == "__main__":
    if not K.ONLY or "helicopter" in K.ONLY:
        run_helicopter()
    if not K.ONLY or "airliner" in K.ONLY:
        run_airliner()
    if not K.ONLY or "light_aircraft" in K.ONLY:
        run_light_aircraft()
