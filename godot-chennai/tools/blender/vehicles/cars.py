"""
Premium cars and the race car for the Godot game, by script in Blender 5.2 LTS (brief §11).

    blender -b --factory-startup --python tools/blender/vehicles/cars.py -- [--only saloon,suv,coupe,formula]

Writes `assets/vehicles/<name>.glb` (LOD0, drivable and parked near the player),
`<name>_lod1.glb` (traffic and beyond ~28 m) and `<name>.json` (the manifest: dimensions, mass,
wheels, doors, seats, grips, cargo, collision boxes, paints, handling, LOD distances, licence).

All four are original designs at realistic proportions: no maker's shapes, badges, grilles or
liveries are copied. The saloon is a long three-box luxury car, the SUV a tall two-box
seven-seater, the coupe a low two-door fastback, the race car an open-wheel single-seater in an
invented team-less livery. India drives on the left: the driver sits on the right (+x).

Body method (from the Three.js game's `vehicles.py`): one shell lofted through cross-sections,
subdivided once at LOD0, wheel arches cut by booleans, colours by face position, doors split from
the shell along their seams with their origins on the hinge line.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vkit as K  # noqa: E402
from vkit import Vector, role  # noqa: E402

OUT = os.path.join(K.ROOT, "assets", "vehicles")
SOURCE = "tools/blender/vehicles/cars.py"

# ----------------------------------------------------------------------------- designs
# sections: (y, lower half width, sill z, shoulder z, roof z, roof half width, lower round, roof round)

SALOON = dict(
    name="saloon", label="Luxury saloon", mass=1850,
    wheelbase=3.0, track=0.81, tyre=0.35, tyre_w=0.245, arch_x=0.95,
    belt=0.97, a_line=((1.12, 0.96), (0.30, 1.44)), c_line=((-0.62, 1.44), (-1.52, 1.02)),
    b_pillar=-0.18, roof_z=1.47, glass_top=1.40,
    doors=[("door_fr", 1, 1.08, -0.14, 65), ("door_fl", -1, 1.08, -0.14, -65),
           ("door_rr", 1, -0.22, -1.18, 65), ("door_rl", -1, -0.22, -1.18, -65)],
    door_z=(0.30, 1.40),
    sections=[
        (-2.60, 0.76, 0.42, 0.84, 0.90, 0.66, 0.10, 0.08),
        (-2.52, 0.87, 0.32, 0.95, 1.00, 0.80, 0.09, 0.08),
        (-2.25, 0.925, 0.27, 0.99, 1.045, 0.86, 0.08, 0.08),
        (-1.66, 0.94, 0.25, 1.00, 1.06, 0.86, 0.08, 0.08),
        (-1.30, 0.945, 0.24, 0.99, 1.20, 0.77, 0.08, 0.10),
        (-0.85, 0.95, 0.24, 0.98, 1.41, 0.71, 0.08, 0.12),
        (-0.40, 0.95, 0.24, 0.97, 1.47, 0.70, 0.08, 0.13),
        (0.25, 0.95, 0.24, 0.96, 1.47, 0.70, 0.08, 0.13),
        (0.55, 0.95, 0.24, 0.955, 1.40, 0.73, 0.08, 0.12),
        (0.95, 0.95, 0.24, 0.935, 1.17, 0.80, 0.08, 0.10),
        (1.25, 0.95, 0.24, 0.90, 0.965, 0.86, 0.08, 0.08),
        (1.80, 0.945, 0.24, 0.845, 0.905, 0.87, 0.08, 0.08),
        (2.22, 0.93, 0.25, 0.79, 0.845, 0.86, 0.08, 0.08),
        (2.40, 0.90, 0.27, 0.72, 0.78, 0.82, 0.09, 0.08),
        (2.46, 0.80, 0.35, 0.62, 0.68, 0.70, 0.10, 0.08),
    ],
    hip=(0.40, 0.18, 0.62),  # driver's hip point (Blender frame: x right, y forward, z up)
    seats=[("seat_driver", 0.40, 0.18), ("seat_front_left", -0.40, 0.18), ("seat_rear_right", 0.42, -0.78),
           ("seat_rear_left", -0.42, -0.78)],
    seat_z=0.52, cargo=(0, -1.95, 0.42), roof_rails=False, spoiler=False,
    paints=[("obsidian black", (0.012, 0.012, 0.014)), ("pearl white", (0.78, 0.78, 0.76)),
            ("champagne", (0.42, 0.33, 0.22)), ("deep blue", (0.02, 0.04, 0.12)),
            ("graphite", (0.09, 0.095, 0.1)), ("burgundy", (0.17, 0.015, 0.03))],
    physics=dict(engineForce=9800, maxSpeed=40, maxSteer=0.55, brakeForce=170, drift=0.5, gears=8),
    ride=0.78, rim="chrome",
)

SUV = dict(
    name="suv", label="Large SUV", mass=2250,
    wheelbase=2.85, track=0.84, tyre=0.40, tyre_w=0.265, arch_x=0.99,
    belt=1.22, a_line=((1.08, 1.22), (0.62, 1.8)), c_line=((-1.7, 1.86), (-1.95, 1.25)),
    b_pillar=-0.1, roof_z=1.88, glass_top=1.80,
    doors=[("door_fr", 1, 1.04, -0.06, 65), ("door_fl", -1, 1.04, -0.06, -65),
           ("door_rr", 1, -0.14, -1.06, 65), ("door_rl", -1, -0.14, -1.06, -65)],
    door_z=(0.56, 1.80),
    # Tall and square: a high, flat bonnet, an upright windscreen and tailgate, short overhangs.
    sections=[
        (-2.02, 0.90, 0.62, 1.12, 1.20, 0.82, 0.12, 0.08),
        (-1.98, 0.96, 0.52, 1.22, 1.62, 0.84, 0.10, 0.10),
        (-1.93, 0.975, 0.50, 1.24, 1.84, 0.83, 0.09, 0.12),
        (-1.70, 0.985, 0.49, 1.24, 1.88, 0.83, 0.09, 0.14),
        (-0.60, 0.99, 0.49, 1.235, 1.885, 0.83, 0.09, 0.14),
        (0.30, 0.99, 0.49, 1.23, 1.88, 0.83, 0.09, 0.14),
        (0.62, 0.99, 0.49, 1.225, 1.78, 0.85, 0.09, 0.12),
        (0.95, 0.985, 0.49, 1.22, 1.42, 0.90, 0.09, 0.10),
        (1.08, 0.98, 0.49, 1.215, 1.29, 0.93, 0.09, 0.08),
        (1.75, 0.975, 0.50, 1.20, 1.27, 0.93, 0.09, 0.07),
        (2.20, 0.965, 0.52, 1.17, 1.24, 0.91, 0.09, 0.07),
        (2.38, 0.94, 0.56, 1.12, 1.19, 0.88, 0.10, 0.07),
        (2.45, 0.88, 0.64, 1.02, 1.08, 0.80, 0.12, 0.07),
    ],
    hip=(0.42, 0.20, 0.95),
    seats=[("seat_driver", 0.42, 0.20), ("seat_front_left", -0.42, 0.20), ("seat_rear_right", 0.44, -0.66),
           ("seat_rear_left", -0.44, -0.66), ("seat_third_row", 0.0, -1.45)],
    seat_z=0.85, cargo=(0, -1.72, 0.74), roof_rails=True, spoiler=False,
    paints=[("forest green", (0.03, 0.08, 0.05)), ("sand", (0.45, 0.38, 0.27)), ("gunmetal", (0.07, 0.075, 0.08)),
            ("white", (0.8, 0.8, 0.78)), ("terracotta", (0.33, 0.1, 0.05)), ("midnight", (0.01, 0.015, 0.03))],
    physics=dict(engineForce=12000, maxSpeed=35, maxSteer=0.55, brakeForce=220, drift=0.45, gears=8),
    ride=1.0, rim="alloy",
)

COUPE = dict(
    name="coupe", label="Sports coupe", mass=1500,
    wheelbase=2.65, track=0.82, tyre=0.345, tyre_w=0.275, arch_x=0.96,
    belt=0.86, a_line=((0.98, 0.86), (0.05, 1.23)), c_line=((-0.55, 1.24), (-1.75, 0.92)),
    b_pillar=None, roof_z=1.27, glass_top=1.20,
    doors=[("door_r", 1, 0.95, -0.40, 62), ("door_l", -1, 0.95, -0.40, -62)],
    door_z=(0.26, 1.20),
    sections=[
        (-2.23, 0.80, 0.34, 0.76, 0.82, 0.70, 0.10, 0.06),
        (-2.15, 0.90, 0.26, 0.86, 0.91, 0.82, 0.09, 0.06),
        (-1.90, 0.955, 0.22, 0.89, 0.945, 0.86, 0.08, 0.06),
        (-1.55, 0.965, 0.21, 0.89, 0.99, 0.78, 0.08, 0.08),
        (-1.05, 0.965, 0.21, 0.88, 1.13, 0.68, 0.08, 0.10),
        (-0.45, 0.96, 0.21, 0.87, 1.25, 0.62, 0.08, 0.12),
        (0.05, 0.955, 0.21, 0.86, 1.27, 0.62, 0.08, 0.12),
        (0.40, 0.95, 0.21, 0.85, 1.12, 0.68, 0.08, 0.10),
        (0.85, 0.95, 0.21, 0.82, 0.885, 0.82, 0.08, 0.06),
        (1.50, 0.94, 0.21, 0.75, 0.80, 0.84, 0.08, 0.06),
        (2.00, 0.91, 0.21, 0.66, 0.71, 0.82, 0.08, 0.06),
        (2.20, 0.86, 0.22, 0.58, 0.63, 0.76, 0.08, 0.06),
        (2.27, 0.76, 0.26, 0.50, 0.54, 0.64, 0.08, 0.05),
    ],
    hip=(0.40, -0.30, 0.44),
    seats=[("seat_driver", 0.40, -0.30), ("seat_front_left", -0.40, -0.30)],
    seat_z=0.34, cargo=(0, -1.85, 0.40), roof_rails=False, spoiler=True,
    paints=[("racing red", (0.4, 0.01, 0.01)), ("signal yellow", (0.75, 0.5, 0.01)), ("lagoon blue", (0.01, 0.15, 0.3)),
            ("silver", (0.45, 0.46, 0.47)), ("black", (0.012, 0.012, 0.014)), ("lime", (0.2, 0.45, 0.02))],
    physics=dict(engineForce=10500, maxSpeed=48, maxSteer=0.52, brakeForce=190, drift=0.7, gears=7),
    ride=0.66, rim="dark_alloy", caliper="caliper",
)


# ----------------------------------------------------------------------------- shared body


def interior_box(x, y0, y1, z0, zbelt, xt, yt0, yt1, zt, mat):
    """Dark inside of the cabin, faces pointing in (seen through an open door): full width up to
    the waist, then leaning in to the roof's width and length so it stays inside the glasshouse."""
    v = [(-x, y0, z0), (x, y0, z0), (x, y1, z0), (-x, y1, z0), (-x, y0, zbelt), (x, y0, zbelt), (x, y1, zbelt), (-x, y1, zbelt),
         (-xt, yt0, zt), (xt, yt0, zt), (xt, yt1, zt), (-xt, yt1, zt)]
    f = [(0, 3, 2, 1), (1, 2, 6, 5), (0, 4, 7, 3), (0, 1, 5, 4), (3, 7, 6, 2),
         (5, 6, 10, 9), (4, 8, 11, 7), (4, 5, 9, 8), (7, 11, 10, 6), (8, 9, 10, 11)]
    o = K.mesh_object("cabin", v, f, mat, recalc=False)
    c = Vector((0, (y0 + y1) / 2, (z0 + zbelt) / 2))
    for p in o.data.polygons:
        if (c - p.center).dot(p.normal) < 0:
            p.flip()
    return o


def car_seat(name, x, y, z, width, mat, back=0.62, recline=0.22):
    parts = [K.box(name + "_c", (width, 0.5, 0.13), (x, y, z - 0.065), mat, bevel=0.03)]
    by = y - 0.21
    b = K.box(name + "_b", (width * 0.95, 0.12, back), (x, by - math.sin(recline) * back / 2, z + math.cos(recline) * back / 2), mat, bevel=0.03)
    b.rotation_euler = (recline, 0, 0)
    parts.append(b)
    if K.LOD == 0:
        top = Vector((x, by - math.sin(recline) * back, z + math.cos(recline) * back))
        h = K.box(name + "_h", (width * 0.55, 0.09, 0.16), top + Vector((0, -0.03, 0.09)), mat, bevel=0.03)
        h.rotation_euler = (recline, 0, 0)
        parts.append(h)
    return parts


def steering_wheel(centre, radius, tilt):
    """Rim, spokes and boss; origin on the hub, the column axis returned (Blender frame)."""
    c = Vector(centre)
    rot = (math.pi / 2 - tilt, 0, 0)
    K.bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.017, major_segments=K.seg(24, 14), minor_segments=K.seg(6, 4),
                                       location=c, rotation=rot)
    rim = K.bpy.context.object
    rim.data.materials.append(role("black"))
    normal = K.Matrix.Rotation(rot[0], 3, "X") @ Vector((0, 0, 1))
    parts = [rim, K.cylinder("boss", 0.06, 0.05, c - normal * 0.01, role("black"), rot=rot, verts=K.seg(16, 8))]
    if K.LOD == 0:
        down = K.Matrix.Rotation(rot[0], 3, "X") @ Vector((0, -1, 0))
        for ax in (Vector((1, 0, 0)), Vector((-1, 0, 0)), down):
            parts.append(K.tube("spoke", c, c + ax * radius * 0.95, 0.013, role("dark_alloy"), verts=6))
    w = K.join(parts, "steering")
    K.set_origin(w, c)
    return w, normal


def roof_crossing(sec, z, front):
    """y where the roof line of the sections crosses height z, walking from the highest section
    towards the front or the rear (so a high bonnet ahead of the windscreen is not mistaken for it)."""
    top = max(range(len(sec)), key=lambda i: sec[i][4])
    idx = list(range(top, len(sec))) if front else list(range(top, -1, -1))
    for i, j in zip(idx, idx[1:]):
        za, zb = sec[i][4], sec[j][4]
        if (za - z) * (zb - z) <= 0 and za != zb:
            return sec[i][0] + (sec[j][0] - sec[i][0]) * (z - za) / (zb - za)
    return sec[idx[-1]][0]


def pillar_lines(d):
    """A and C pillar lines (y at the waist, y at the roof) measured off the sections."""
    sec = d["sections"]
    zl, zh = d["belt"] + 0.03, d["roof_z"] - 0.03
    # The windscreen starts above the bonnet: a high, flat bonnet (the SUV) is higher than the belt.
    bonnet = max(s_[4] for s_ in sec if s_[0] > d["wheelbase"] / 2)
    zf = max(zl, bonnet + 0.04)
    d["a_line"] = ((roof_crossing(sec, zf, True), zf), (roof_crossing(sec, zh, True), zh))
    d["c_line"] = ((roof_crossing(sec, zh, False), zh), (roof_crossing(sec, zl, False), zl))


def car_body(d):
    pillar_lines(d)
    sec = d["sections"]
    axle = d["wheelbase"] / 2
    tyre = d["tyre"]
    paint = K.paint_material(d["paints"][0][1])
    shell = K.car_shell("shell", sec, paint, (axle, -axle), tyre + 0.055, tyre, d["arch_x"], 1 if K.LOD == 0 else 0)
    belt = d["belt"]
    roof = d["roof_z"]
    gtop = d["glass_top"]
    seams = sorted({y for _n, _s, a, b, _o in d["doors"] for y in (a, b)})
    z0, z1 = d["door_z"]
    if K.LOD == 0:
        for y in seams:
            for e in (-0.006, 0.006):
                K.bisect(shell, (0, y + e, 0), (0, 1, 0))
        for z in (z0, z1):
            for e in (-0.006, 0.006):
                K.bisect(shell, (0, 0, z + e), (0, 0, 1))
    K.bisect(shell, (0, 0, belt + 0.02), (0, 0, 1))
    K.bisect(shell, (0, 0, 0.40), (0, 0, 1))

    def line(pts, z):
        (ya, za), (yb, zb) = pts
        t = (z - za) / (zb - za)
        return ya + (yb - ya) * t

    def in_arch(c, n):
        for y in (axle, -axle):
            if math.hypot(c.y - y, c.z - tyre) < tyre + 0.05 and abs(c.x) < d["arch_x"] - 0.03 and abs(n.x) < 0.7:
                return True
        return False

    def side_glass(c, n):
        if abs(n.x) < 0.4 or not (belt + 0.03 < c.z < gtop):
            return False
        return line(d["c_line"], c.z) + 0.07 < c.y < line(d["a_line"], c.z) - 0.07

    def screens(c, n):
        if c.z < belt + 0.03 or c.z > roof - 0.03:
            return False
        rh = K.lerp_sections(sec, c.y, 5)
        if abs(c.x) > rh - 0.07:
            return False
        if c.z < belt + 0.05:
            return False
        if n.y > 0.3 and c.y > 0:  # windscreen
            return True
        if n.y < -0.3 and c.y < 0:  # rear window
            return True
        return False

    K.paint_faces(shell, role("glass"), side_glass)
    K.paint_faces(shell, role("glass"), screens)
    if d["b_pillar"] is not None:
        bp = d["b_pillar"]
        K.paint_faces(shell, role("black"), lambda c, n: abs(n.x) > 0.4 and belt < c.z < gtop and abs(c.y - bp) < 0.06)
    K.paint_faces(shell, role("black"), in_arch)
    front, rear = sec[-1][0], sec[0][0]
    K.paint_faces(shell, role("black"), lambda c, n: c.z < 0.40 and (c.y > front - 0.25 or c.y < rear + 0.25) and abs(c.x) < 0.75 and c.z > 0.2)
    K.paint_faces(shell, role("black"), lambda c, n: abs(n.x) > 0.5 and c.z < sec[5][2] + 0.09)  # sills
    K.paint_faces(shell, role("underframe"), lambda c, n: n.z < -0.7)
    if d["name"] == "suv":
        # Unpainted cladding round the arches and along the sills: reads as an off-roader.
        def clad(c, n):
            if abs(n.x) < 0.3 or c.z > 1.08:
                return False
            if c.z < 0.7:
                return True
            return any(math.hypot(c.y - y, c.z - tyre) < tyre + 0.17 for y in (axle, -axle))
        K.paint_faces(shell, role("dark_grey"), clad)

    def groove(c, n):
        if abs(n.x) < 0.3 or not (z0 - 0.007 < c.z < z1 + 0.007):
            return False
        for _nm, sx, ya, yb, _o in d["doors"]:
            if c.x * sx > 0 and yb - 0.007 < c.y < ya + 0.007:
                if min(abs(c.y - ya), abs(c.y - yb)) < 0.006 or min(abs(c.z - z0), abs(c.z - z1)) < 0.006:
                    return True
        return False

    if K.LOD == 0:
        K.paint_faces(shell, role("dark_grey"), groove)
    K.smooth(shell, 35)
    doors = []
    if K.LOD == 0:
        for nm, sx, ya, yb, open_deg in d["doors"]:
            test = (lambda sx, ya, yb: lambda c, n: abs(n.x) > 0.3 and c.x * sx > 0.3 and yb + 0.007 < c.y < ya - 0.007 and z0 + 0.007 < c.z < z1 - 0.007)(sx, ya, yb)
            dr = K.separate(shell, nm, test)
            xs = [v.co.x for v in dr.data.vertices if v.co.z < belt]
            inner = (min(xs) if sx > 0 else max(xs)) - sx * 0.02
            card = K.box(nm + "_card", (0.03, ya - yb - 0.08, belt - z0 - 0.05), (inner, (ya + yb) / 2, (z0 + belt) / 2), role("interior"))
            h = K.surface((sx * 2.0, ya - 0.18 if sx else 0, belt - 0.07), (-sx, 0, 0), only=shell)
            parts = [dr, card]
            dr_obj = K.join(parts, nm)
            xh = max(abs(v.co.x) for v in dr_obj.data.vertices if abs(v.co.y - ya) < 0.05) if dr_obj.data.vertices else d["arch_x"]
            doors.append((dr_obj, (sx * xh, ya), open_deg, sx))
    return shell, doors


def fittings(d, shell):
    parts = []
    sec = d["sections"]
    front, rear = sec[-1][0], sec[0][0]
    belt = d["belt"]
    wl = sec[len(sec) // 2][1]
    # Headlamps: a black-framed cluster at each front corner with three lamp cells, and a
    # daytime light strip under it (an invented signature), all placed by rays onto the shell.
    lamp_z = sec[-3][3] - 0.07
    for sx in (1, -1):
        hit = K.surface((sx * (wl - 0.33), front + 2, lamp_z), (0, -1, 0), only=shell)
        if not hit:
            continue
        p, nrm = hit
        parts.append(K.box("lamp_frame", (0.46, 0.03, 0.15), p + nrm * 0.004, role("black"), bevel=0.012))
        for k in range(3 if K.LOD == 0 else 1):
            dx = (k - 1) * 0.135 if K.LOD == 0 else 0
            parts.append(K.box("headlamp", (0.115 if K.LOD == 0 else 0.4, 0.03, 0.085), p + nrm * 0.022 + Vector((dx, 0, 0.018)), role("headlamp")))
        parts.append(K.box("drl", (0.42, 0.03, 0.02), p + nrm * 0.022 + Vector((0, 0, -0.05)), role("strobe")))
    # Upper grille between the lamps: a plain dark panel with one bright bar (no make's shape).
    hit = K.surface((0, front + 2, lamp_z - 0.02), (0, -1, 0), only=shell)
    if hit:
        gw = 2 * (wl - 0.56) if d["name"] != "coupe" else 0.5
        gh = 0.2 if d["name"] == "suv" else 0.1
        parts.append(K.box("grille", (gw, 0.05, gh), hit[0] + hit[1] * 0.006, role("dark_grey"), bevel=0.02))
        parts.append(K.box("grille_bar", (gw - 0.04, 0.05, 0.02), hit[0] + hit[1] * 0.03, role("chrome")))
    # Tail lamps: a light bar across the rear (an invented signature) with corner clusters.
    hit = K.surface((0, rear - 2, sec[1][3] - 0.10), (0, 1, 0), only=shell)
    if hit:
        parts.append(K.box("tailbar", (sec[1][1] * 1.7, 0.04, 0.05), hit[0] + hit[1] * 0.012, role("taillamp")))
    for sx in (1, -1):
        hit = K.surface((sx * (sec[2][1] - 0.18), rear - 2, sec[1][3] - 0.18), (0, 1, 0), only=shell)
        if hit:
            parts.append(K.box("tail", (0.3, 0.05, 0.1), hit[0] + hit[1] * 0.015, role("taillamp")))
    # Plates (blank: the game draws its own invented number).
    for yy, nrm in ((front + 2, -1), (rear - 2, 1)):
        hit = K.surface((0, yy, 0.47), (0, nrm, 0), only=shell)
        if hit:
            parts.append(K.box("plate", (0.52, 0.02, 0.12), hit[0] + hit[1] * 0.012, role("plate")))
    # Air intake: horizontal slats low in the bumper (no grille shape copied from any make).
    hit = K.surface((0, front + 2, 0.33), (0, -1, 0), only=shell)
    if hit:
        parts.append(K.box("intake", (1.1, 0.04, 0.12), hit[0] + hit[1] * 0.012, role("black"), bevel=0.02))
        if K.LOD == 0:
            for k in range(3):
                parts.append(K.box("slat", (1.06, 0.03, 0.012), hit[0] + hit[1] * 0.03 + Vector((0, 0, -0.04 + k * 0.04)), role("dark_alloy")))
    # Mirrors on the doors' front corner.
    for sx in (1, -1):
        y = d["a_line"][0][0] - 0.12
        hit = K.surface((sx * 2, y, belt + 0.08), (-sx, 0, 0), only=shell)
        if hit:
            p = hit[0]
            parts.append(K.box("mirror", (0.2, 0.08, 0.11), p + Vector((sx * 0.1, 0, 0.02)), K.paint_material(d["paints"][0][1]), bevel=0.03))
            if K.LOD == 0:
                parts.append(K.box("mirror_glass", (0.16, 0.01, 0.08), p + Vector((sx * 0.11, -0.045, 0.02)), role("chrome")))
    # Door handles: flush chrome strips.
    if K.LOD == 0:
        for _nm, sx, ya, yb, _o in d["doors"]:
            hit = K.surface((sx * 2, ya - (ya - yb) * 0.78, belt - 0.07), (-sx, 0, 0), only=shell)
            if hit:
                parts.append(K.box("handle", (0.02, 0.16, 0.025), hit[0] + hit[1] * 0.006, role("chrome")))
    # Exhaust tips.
    for sx in (1, -1):
        parts.append(K.cylinder("exhaust", 0.045, 0.12, (sx * 0.55, rear + 0.08, 0.30), role("chrome"), rot=(math.pi / 2, 0, 0), verts=K.seg(12, 6)))
    if d["roof_rails"]:
        for sx in (1, -1):
            rh = sec[5][5] - 0.08
            hit = K.surface((sx * rh, -0.6, 3), (0, 0, -1), only=shell)
            rz = hit[0].z if hit else d["roof_z"]
            parts.append(K.box("rail", (0.04, 2.3, 0.035), (sx * rh, -0.6, rz + 0.05), role("dark_alloy"), bevel=0.012))
            for yy in (-1.7, 0.45):
                parts.append(K.box("rail_foot", (0.05, 0.08, 0.07), (sx * rh, yy, rz + 0.02), role("black")))
        # Flared arch mouldings: a thick dark lip round each wheel arch.
        axle = d["wheelbase"] / 2
        r = d["tyre"] + 0.11
        for y in (axle, -axle):
            for sx in (1, -1):
                pts = [(sx * (d["arch_x"] - 0.02), y + r * math.cos(a), d["tyre"] + r * math.sin(a))
                       for a in [math.radians(8 + i * 164 / (8 if K.LOD == 0 else 4)) for i in range((8 if K.LOD == 0 else 4) + 1)]]
                parts.append(K.path_tube("arch_lip", pts, 0.055, role("dark_grey"), verts=K.seg(6, 4)))
        parts.append(K.box("skid_rear", (1.0, 0.22, 0.06), (0, rear + 0.13, 0.66), role("dark_alloy")))
        # Skid plate and side steps.
        parts.append(K.box("skid", (1.0, 0.25, 0.06), (0, front - 0.18, 0.6), role("dark_alloy")))
        for sx in (1, -1):
            parts.append(K.box("step", (0.16, 1.85, 0.05), (sx * (d["arch_x"] - 0.01), -0.05, 0.44), role("dark_alloy"), bevel=0.012))
    if d["spoiler"]:
        hit = K.surface((0, rear + 0.25, 3), (0, 0, -1), only=shell)
        if hit:
            parts.append(K.box("spoiler", (1.3, 0.22, 0.03), hit[0] + Vector((0, 0, 0.1)), role("carbon"), bevel=0.01))
            for sx in (1, -1):
                parts.append(K.box("spoiler_post", (0.03, 0.08, 0.1), hit[0] + Vector((sx * 0.45, 0, 0.05)), role("carbon")))
        parts.append(K.box("diffuser", (1.3, 0.2, 0.08), (0, rear + 0.2, 0.24), role("carbon")))
        for k in range(4 if K.LOD == 0 else 0):
            parts.append(K.box("fin", (0.015, 0.2, 0.08), (-0.45 + k * 0.3, rear + 0.2, 0.22), role("black")))
    return parts


def interior(d):
    if K.LOD > 0:
        return []
    sec = d["sections"]
    wl = sec[len(sec) // 2][1]
    rt = sec[len(sec) // 2][5] - 0.08
    parts = [interior_box(wl - 0.08, d["c_line"][1][0] + 0.2, d["a_line"][0][0] - 0.1, d["seat_z"] - 0.28, d["belt"] - 0.02,
                          rt, d["c_line"][0][0] + 0.1, d["a_line"][1][0] - 0.1, d["roof_z"] - 0.07, role("inside_dark"))]
    for nm, x, y in d["seats"]:
        width = 0.5 if nm != "seat_third_row" else 1.2
        parts += car_seat(nm + "_m", x, y, d["seat_z"], width, role("seat_tan") if d["name"] == "saloon" else role("seat_dark"))
    # Dashboard.
    ay = d["a_line"][0][0]
    parts.append(K.box("dash", (2 * wl - 0.14, 0.45, 0.22), (0, ay - 0.25, d["belt"] - 0.04), role("interior"), bevel=0.04))
    if d["name"] != "coupe":
        parts.append(K.box("console", (0.24, 0.9, 0.2), (0, (d["seats"][0][2] + ay) / 2 - 0.3, d["seat_z"] - 0.05), role("interior")))
    parts.append(K.box("screen", (0.4, 0.02, 0.18), (0, ay - 0.43, d["belt"] + 0.04), role("screen")))
    return parts


def ground_wheels(d):
    axle = d["wheelbase"] / 2
    out = []
    for nm, y in (("wheel_fl", axle), ("wheel_fr", axle), ("wheel_rl", -axle), ("wheel_rr", -axle)):
        sx = 1 if nm.endswith("r") else -1
        out.append(K.car_wheel(nm, (sx * d["track"], y, d["tyre"]), d["tyre"], d["tyre_w"], spokes=5 if d["name"] != "suv" else 6,
                               rim_role=d["rim"], caliper=d.get("caliper"), sidewall=0.30 if d["name"] != "suv" else 0.36))
    return out


def build_car(d, lod):
    K.LOD = lod
    K.reset()
    shell, doors = car_body(d)
    parts = [shell] + fittings(d, shell) + interior(d)
    body = K.join(parts, "body")
    wheels = ground_wheels(d)
    anchors = {}
    hinges = []
    for dr, (hx, hy), open_deg, sx in doors:
        K.set_origin(dr, (hx, hy, 0))
        hinges.append(dict(node=dr.name, hinge=K.g((hx, hy, 0)), axis=[0, 1, 0], open_deg=open_deg, side="right" if sx > 0 else "left"))
    st = None
    if lod == 0 or True:
        hip = Vector(d["hip"])
        centre = hip + Vector((0, 0.42, 0.30))
        st, normal = steering_wheel(centre, 0.18 if d["name"] != "suv" else 0.19, math.radians(24))
        anchors["steering"] = dict(node="steering", hub=K.g(centre), axis=K.g_axis(normal), radius=0.18)
        for side in (1, -1):
            e = K.empty("grip_steer_" + ("r" if side > 0 else "l"), centre + Vector((side * 0.17, 0, 0)))
    for nm, x, y in d["seats"]:
        K.empty(nm, (x, y, d["seat_z"] + 0.1))
    K.empty("cargo_boot", d["cargo"])
    sec = d["sections"]
    K.empty("marker_front", (0, sec[-1][0], 0.5))
    K.empty("exit_driver", (d["arch_x"] + 0.45, d["seats"][0][2] + 0.1, 0))
    lo, hi = K.scene_bounds()
    path = os.path.join(OUT, d["name"] + ("" if lod == 0 else f"_lod{lod}") + ".glb")
    tris = K.export_glb(path)
    return dict(tris=tris, lo=lo, hi=hi, doors=hinges, anchors=anchors)


# ----------------------------------------------------------------------------- race car

FORMULA = dict(
    name="formula", label="Open-wheel race car", mass=800,
    wheelbase=3.4, track_f=0.80, track_r=0.78, tyre_f=0.335, tyre_r=0.36, w_f=0.30, w_r=0.40,
    paints=[("teal and amber", (0.004, 0.07, 0.075)), ("white and coral", (0.8, 0.8, 0.78)),
            ("violet and lime", (0.06, 0.02, 0.15)), ("orange and navy", (0.8, 0.22, 0.0))],
    physics=dict(engineForce=12000, maxSpeed=70, maxSteer=0.42, brakeForce=260, drift=0.9, gears=8),
    ride=0.42,
)


def formula_build(d, lod):
    K.LOD = lod
    K.reset()
    paint = K.paint_material(d["paints"][0][1], rough=0.3, metal=0.2)
    fa, ra = d["wheelbase"] / 2 - 0.15, -d["wheelbase"] / 2 - 0.15
    # Monocoque, nose to gearbox: (y, half width, bottom, top)
    secs = [
        (2.55, 0.07, 0.10, 0.22), (2.15, 0.12, 0.10, 0.30), (1.60, 0.19, 0.08, 0.42), (0.95, 0.26, 0.05, 0.58),
        (0.45, 0.36, 0.05, 0.66), (0.0, 0.40, 0.05, 0.70), (-0.55, 0.42, 0.05, 0.78), (-1.10, 0.33, 0.06, 0.90),
        (-1.65, 0.22, 0.08, 0.72), (-2.10, 0.14, 0.12, 0.52), (-2.35, 0.10, 0.16, 0.44),
    ]
    n = K.seg(10, 6, 4)
    rings = []
    for y, w, zb, zt in secs:
        r = []
        for i in range(n * 2):
            a = math.pi * 2 * i / (n * 2)
            c, s = math.cos(a), math.sin(a)
            # superellipse: flat floor, rounded top
            e = 0.6
            x = w * math.copysign(abs(c) ** e, c)
            zc, hz = (zb + zt) / 2, (zt - zb) / 2
            z = zc + hz * math.copysign(abs(s) ** (e if s > 0 else 0.3), s)
            r.append(Vector((x, y, z)))
        rings.append(r)
    tub = K.loft("tub", K.inset_ends(rings, (0.5,)), paint, caps=(True, True))
    if lod == 0:
        K.subsurf(tub, 1)
        K.apply_all(tub)
    # Cockpit opening.
    cut = K.cutter_box("cockpit", (0.52, 1.0, 0.6), (0, -0.15, 0.85))
    K.boolean_cut(tub, [cut])
    K.paint_faces(tub, role("carbon"), lambda c, n: c.z < 0.16)
    K.paint_faces(tub, role("teal"), lambda c, n: c.y > 1.9)  # nose tip accent
    K.paint_faces(tub, role("amber"), lambda c, n: abs(n.x) > 0.4 and 0.35 < c.z < 0.45 and c.y < 1.0)
    K.paint_faces(tub, role("inside_dark"), lambda c, n: abs(c.x) < 0.27 and -0.66 < c.y < 0.36 and c.z > 0.5 and n.z < 0.6)
    K.smooth(tub, 50)
    parts = [tub]
    # Sidepods.
    for sx in (1, -1):
        sp = K.box("sidepod", (0.38, 1.7, 0.36), (sx * 0.52, -0.55, 0.28), paint, bevel=0.1, segments=3)
        parts.append(sp)
        parts.append(K.box("sidepod_inlet", (0.3, 0.04, 0.2), (sx * 0.52, 0.31, 0.33), role("inside_dark")))
        parts.append(K.box("sidepod_stripe", (0.39, 1.4, 0.04), (sx * 0.53, -0.65, 0.43), role("amber")))
    # Floor plank and floor.
    parts.append(K.box("floor", (1.3, 3.2, 0.03), (0, -0.55, 0.06), role("carbon")))
    # Front wing: main plane, flap, endplates.
    parts.append(K.box("fw_main", (1.8, 0.42, 0.025), (0, 2.45, 0.11), role("carbon"), bevel=0.01))
    parts.append(K.box("fw_flap", (1.6, 0.22, 0.02), (0, 2.28, 0.17), paint, rot=(0.35, 0, 0)))
    for sx in (1, -1):
        parts.append(K.box("fw_end", (0.02, 0.55, 0.22), (sx * 0.9, 2.42, 0.16), role("teal")))
        parts.append(K.box("fw_pylon", (0.03, 0.2, 0.12), (sx * 0.12, 2.45, 0.17), role("carbon")))
    # Rear wing.
    parts.append(K.box("rw_main", (1.0, 0.36, 0.03), (0, -2.55, 0.86), role("carbon"), rot=(-0.12, 0, 0)))
    parts.append(K.box("rw_flap", (1.0, 0.18, 0.02), (0, -2.42, 0.97), paint, rot=(-0.4, 0, 0)))
    for sx in (1, -1):
        parts.append(K.box("rw_end", (0.02, 0.7, 0.62), (sx * 0.51, -2.55, 0.72), paint))
        parts.append(K.box("rw_end_stripe", (0.025, 0.7, 0.08), (sx * 0.51, -2.55, 0.62), role("amber")))
    parts.append(K.box("rw_pillar", (0.04, 0.2, 0.45), (0, -2.45, 0.6), role("carbon")))
    parts.append(K.box("rain_light", (0.08, 0.02, 0.05), (0, -2.47, 0.24), role("taillamp")))
    # Airbox and roll hoop.
    parts.append(K.box("airbox", (0.22, 0.4, 0.3), (0, -0.95, 1.0), paint, bevel=0.06, segments=2))
    parts.append(K.box("airbox_mouth", (0.14, 0.03, 0.14), (0, -0.74, 1.02), role("inside_dark")))
    # Halo: a hoop over the cockpit on a centre strut.
    pts = []
    k = K.seg(14, 8, 5)
    for i in range(k + 1):
        a = math.pi * i / k
        pts.append((0.3 * math.cos(a), -0.62 + 0.55 * math.sin(a) * 0.95 + 0.0, 0.88 + 0.06 * math.sin(a)))
    parts.append(K.path_tube("halo", [(0.3, -0.62, 0.72)] + pts + [(-0.3, -0.62, 0.72)], 0.022, role("carbon"), verts=K.seg(8, 6, 4)))
    parts.append(K.tube("halo_strut", (0, 0.42, 0.66), (0, -0.07, 0.93), 0.02, role("carbon"), verts=6))
    # Suspension arms (wishbones) and push rods to each wheel.
    for (y, tr, r) in ((fa, d["track_f"], d["tyre_f"]), (ra, d["track_r"], d["tyre_r"])):
        for sx in (1, -1):
            hub = Vector((sx * (tr - 0.06), y, r))
            for dz, dy in ((0.09, 0.18), (0.09, -0.18), (-0.06, 0.18), (-0.06, -0.18)):
                parts.append(K.tube("arm", hub + Vector((0, 0, dz)), Vector((sx * 0.22, y + dy, r + dz * 0.5)), 0.014, role("carbon"), verts=K.seg(6, 4, 3)))
    # Seat, steering wheel and mirrors.
    if lod == 0:
        parts.append(K.box("seat", (0.4, 0.5, 0.06), (0, -0.4, 0.13), role("seat_dark"), rot=(-0.6, 0, 0)))
        parts.append(K.box("headrest", (0.5, 0.18, 0.18), (0, -0.7, 0.78), role("seat_dark"), bevel=0.04))
    for sx in (1, -1):
        parts.append(K.box("mirror", (0.14, 0.04, 0.07), (sx * 0.42, 0.38, 0.72), paint, bevel=0.015))
        parts.append(K.tube("mirror_arm", (sx * 0.3, 0.38, 0.62), (sx * 0.38, 0.38, 0.7), 0.01, role("carbon"), verts=4))
    # Number roundels on the nose top and the airbox sides: white discs (the number is drawn by the game).
    parts.append(K.cylinder("roundel", 0.1, 0.005, (0, 1.45, 0.455), role("white"), verts=K.seg(16, 8)))
    body = K.join(parts, "body")
    wheels = []
    for nm, y, tr, r, w in (("wheel_fl", fa, d["track_f"], d["tyre_f"], d["w_f"]), ("wheel_fr", fa, d["track_f"], d["tyre_f"], d["w_f"]),
                            ("wheel_rl", ra, d["track_r"], d["tyre_r"], d["w_r"]), ("wheel_rr", ra, d["track_r"], d["tyre_r"], d["w_r"])):
        sx = 1 if nm.endswith("r") else -1
        wheels.append(K.car_wheel(nm, (sx * (tr + w / 2), y, r), r, w, spokes=6, rim_role="dark_alloy", sidewall=0.42))
    centre = Vector((0, 0.05, 0.62))
    st = K.box("steering_rim", (0.28, 0.03, 0.14), centre, role("carbon"), bevel=0.02)
    st2 = K.box("steering_screen", (0.1, 0.035, 0.05), centre + Vector((0, -0.005, 0.02)), role("screen"))
    stw = K.join([st, st2], "steering")
    stw.rotation_euler = (0, 0, 0)
    K.set_origin(stw, centre)
    for side in (1, -1):
        K.empty("grip_steer_" + ("r" if side > 0 else "l"), centre + Vector((side * 0.13, 0, 0)))
    K.empty("seat_driver", (0, -0.3, 0.28))
    K.empty("marker_front", (0, 2.66, 0.12))
    K.empty("exit_driver", (1.4, -0.3, 0))
    lo, hi = K.scene_bounds()
    path = os.path.join(OUT, d["name"] + ("" if lod == 0 else f"_lod{lod}") + ".glb")
    tris = K.export_glb(path)
    anchors = {"steering": dict(node="steering", hub=K.g(centre), axis=[0, 0.2, 1.0], radius=0.14)}
    return dict(tris=tris, lo=lo, hi=hi, doors=[], anchors=anchors)


# ----------------------------------------------------------------------------- manifests


def physics_block(d, wheels_bl):
    """VehicleSpec-shaped handling numbers (like `packages/vehicles/src/specs.ts`), chassis frame:
    wheel y = radius + settled suspension 0.3 - ride height, so `groundBelow` works unchanged."""
    ph = dict(d["physics"])
    gears = ph.pop("gears")
    wheels = []
    for x, y, r, steers, driven in wheels_bl:
        wheels.append(dict(x=round(x, 3), y=round(r + 0.3 - d["ride"], 3), z=round(-y, 3), radius=r, steers=steers, driven=driven))
    return dict(mass=d["mass"], wheels=wheels, gears=gears, rideHeight=d["ride"], **ph)


def manifest(d, r0, r1, wheels_bl, kind, seats, collision, extra=None):
    lo, hi = r0["lo"], r0["hi"]
    m = dict(
        name=d["name"], label=d["label"], kind=kind, source=SOURCE, licence=K.LICENCE,
        frame="metres; +Y up, front faces -Z, +X right; ground at y = 0; origin centred between the axles",
        size_m=dict(zip(("width", "height", "length"), K.size_godot(lo, hi))),
        mass_kg=d["mass"],
        lods=[dict(file=d["name"] + ".glb", triangles=r0["tris"], max_distance_m=28),
              dict(file=d["name"] + "_lod1.glb", triangles=r1["tris"], min_distance_m=28, max_distance_m=300)],
        wheels=[dict(node=nm, centre=K.g((x, y, r)), radius=r, steers=st, driven=dv) for nm, (x, y, r, st, dv) in zip(
            ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"), wheels_bl)],
        steering=r0["anchors"].get("steering"),
        doors=r0["doors"],
        seats=seats,
        grips=[dict(node="grip_steer_l", hand="left"), dict(node="grip_steer_r", hand="right")],
        cargo=[dict(node="cargo_boot", what="boot floor / luggage")] if kind != "race_car" else [],
        collision=collision,
        paints=[dict(name=n, srgb=[round(K._srgb(c), 4) for c in rgb]) for n, rgb in d["paints"]],
        paint_surface="material named `paint`: set albedo_color = Color(srgb) (Godot colours are sRGB)",
        physics=physics_block(d, wheels_bl),
        notes="Handling numbers are proposed starting values for Phase 2 tuning (estimated), not measured.",
    )
    if extra:
        m.update(extra)
    K.write_manifest(os.path.join(OUT, d["name"] + ".json"), m)


def run_car(d):
    r0 = build_car(d, 0)
    r1 = build_car(d, 1)
    axle = d["wheelbase"] / 2
    t, r = d["track"], d["tyre"]
    drive_front = d["name"] == "suv"  # the SUV is all-wheel drive; the others drive the rear wheels
    wheels = [(-t, axle, r, True, drive_front), (t, axle, r, True, drive_front), (-t, -axle, r, False, True), (t, -axle, r, False, True)]
    sec = d["sections"]
    half_w = max(s[1] for s in sec)
    seats = []
    for nm, x, y in d["seats"]:
        seats.append(dict(node=nm, hip=K.g((x, y, d["seat_z"] + 0.1)), role="driver" if nm == "seat_driver" else "passenger",
                          door=next((dd[0] for dd in d["doors"] if (dd[1] > 0) == (x > 0) and dd[3] < y < dd[2]), None)))
    belt = d["belt"]
    collision = [
        dict(shape="box", centre=K.g((0, (sec[0][0] + sec[-1][0]) / 2, (sec[5][2] + belt) / 2)),
             half_extents=[round(half_w, 3), round((belt - sec[5][2]) / 2, 3), round((sec[-1][0] - sec[0][0]) / 2, 3)]),
        dict(shape="box", centre=K.g((0, (d["c_line"][1][0] + d["a_line"][0][0]) / 2, (belt + d["roof_z"]) / 2)),
             half_extents=[round(sec[6][5], 3), round((d["roof_z"] - belt) / 2, 3), round((d["a_line"][0][0] - d["c_line"][1][0]) / 2, 3)]),
    ]
    manifest(d, r0, r1, wheels, "car", seats, collision,
             extra=dict(pose=dict(lean=-0.1, hand=[0.17, 0.3, -0.42], foot=[0.12, -0.15 - (d["seat_z"] - 0.5) * 0.3, -0.78]),
                        entry=dict(side=1, point=K.g((d["arch_x"] + 0.45, d["seats"][0][2] + 0.1, 0)), door="hinged", style="door")))


def run_formula(d):
    r0 = formula_build(d, 0)
    r1 = formula_build(d, 1)
    fa, ra = d["wheelbase"] / 2 - 0.15, -d["wheelbase"] / 2 - 0.15
    wheels = [(-(d["track_f"] + d["w_f"] / 2), fa, d["tyre_f"], True, False), ((d["track_f"] + d["w_f"] / 2), fa, d["tyre_f"], True, False),
              (-(d["track_r"] + d["w_r"] / 2), ra, d["tyre_r"], False, True), ((d["track_r"] + d["w_r"] / 2), ra, d["tyre_r"], False, True)]
    seats = [dict(node="seat_driver", hip=K.g((0, -0.3, 0.28)), role="driver", door=None)]
    collision = [dict(shape="box", centre=K.g((0, 0.0, 0.4)), half_extents=[0.55, 0.38, 2.6]),
                 dict(shape="box", centre=K.g((0, 2.42, 0.15)), half_extents=[0.9, 0.12, 0.25]),
                 dict(shape="box", centre=K.g((0, -2.5, 0.75)), half_extents=[0.52, 0.25, 0.3])]
    manifest(d, r0, r1, wheels, "race_car", seats, collision,
             extra=dict(pose=dict(lean=-0.55, hand=[0.13, 0.32, -0.38], foot=[0.12, -0.05, -1.05]),
                        entry=dict(side=1, point=K.g((1.4, -0.3, 0)), door="none", style="step"),
                        livery="paint is the main colour; teal, amber, carbon and white accents are atlas cells; "
                               "the race number is drawn by the game on the white roundel (no team, sponsor or real number)",
                        notes="Very high grip and speed (brief §11): proposed starting values, estimated."))


if __name__ == "__main__":
    for d in (SALOON, SUV, COUPE):
        if not K.ONLY or d["name"] in K.ONLY:
            run_car(d)
    if not K.ONLY or "formula" in K.ONLY:
        run_formula(FORMULA)
    K.save_palette(os.path.join(K.ROOT, "assets", "vehicles", "shared"))
