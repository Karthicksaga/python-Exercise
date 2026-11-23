"""
Indian everyday cars and the van ambulance, by script in Blender 5.2 LTS.

    blender -b --factory-startup --python godot-chennai/tools/blender/vehicles/road/cars_in.py -- [--only hatchback,sedan,taxi,ambulance]

Writes `assets/vehicles/<name>.glb`, `<name>_lod1.glb` and `<name>.json` for:

* `hatchback`: a small tall-boy Indian hatchback (redesign of the Three.js game's car: same
  handling, also the traffic, police and gang car), five doors, 13-inch steel wheels with covers.
* `sedan`: a compact (sub-4-metre) Indian saloon with a short boot.
* `taxi`: the sedan as a Chennai taxi: a plain yellow and black roof board (no lettering),
  yellow commercial plates (blank).
* `ambulance`: a high-roof Indian van ambulance (redesign): white with a red waist band, a
  beacon bar, frosted rear windows, cab doors and two rear doors on hinges, a stretcher place.
  Plain: no service name, number, cross or star emblem.

Body method of `cars.py` (the premium cars): one lofted shell through cross-sections, wheel arches
cut by booleans, glass and trim given by face position, doors split from the shell along their
seams with their origins on the hinge. The fittings here are Indian small-car ones (swept-back
headlamp clusters, a slim grille slot, black bumper intakes, vertical tail lamps). No make's
shapes, grilles or badges. India drives on the left: the driver sits on the right (+x).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tnkit as T  # noqa: E402
from tnkit import K, Vector, role  # noqa: E402
import cars as C  # noqa: E402  (car_body, interior, steering_wheel: the shared, brand-free body method)

SOURCE = "tools/blender/vehicles/road/cars_in.py"

INDIAN_PAINTS = [("pearl white", (0.8, 0.8, 0.78)), ("silky silver", (0.45, 0.46, 0.47)), ("granite grey", (0.11, 0.115, 0.12)),
                 ("fire red", (0.42, 0.02, 0.02)), ("ocean blue", (0.02, 0.08, 0.25)), ("wine maroon", (0.16, 0.012, 0.025))]

# sections: (y, lower half width, sill z, shoulder z, roof z, roof half width, lower round, roof round)
HATCH = dict(
    name="hatchback", label="Small hatchback", mass=950,
    wheelbase=2.40, track=0.70, tyre=0.287, tyre_w=0.155, arch_x=0.80,
    belt=0.93, b_pillar=0.02, roof_z=1.56, glass_top=1.47,
    doors=[("door_fr", 1, 1.04, 0.05, 65), ("door_fl", -1, 1.04, 0.05, -65),
           ("door_rr", 1, 0.0, -0.84, 65), ("door_rl", -1, 0.0, -0.84, -65)],
    door_z=(0.30, 1.47),
    sections=[
        (-1.77, 0.70, 0.42, 0.88, 0.96, 0.60, 0.10, 0.06),
        (-1.73, 0.77, 0.30, 0.95, 1.30, 0.66, 0.09, 0.08),
        (-1.67, 0.79, 0.27, 0.96, 1.50, 0.66, 0.08, 0.10),
        (-1.45, 0.80, 0.25, 0.95, 1.555, 0.66, 0.08, 0.12),
        (-0.40, 0.80, 0.24, 0.94, 1.56, 0.66, 0.08, 0.12),
        (0.40, 0.80, 0.24, 0.93, 1.545, 0.67, 0.08, 0.12),
        (0.78, 0.80, 0.24, 0.92, 1.38, 0.70, 0.08, 0.10),
        (1.13, 0.79, 0.24, 0.90, 1.04, 0.74, 0.08, 0.08),
        (1.50, 0.78, 0.25, 0.86, 0.94, 0.74, 0.08, 0.08),
        (1.76, 0.75, 0.28, 0.79, 0.85, 0.69, 0.09, 0.08),
        (1.87, 0.66, 0.36, 0.70, 0.75, 0.58, 0.10, 0.06),
    ],
    hip=(0.36, 0.02, 0.58),
    seats=[("seat_driver", 0.36, 0.02), ("seat_front_left", -0.36, 0.02), ("seat_rear_right", 0.38, -0.82), ("seat_rear_left", -0.38, -0.82)],
    seat_z=0.48, cargo=(0, -1.45, 0.52), boot=False, rim="light_grey",
    paints=INDIAN_PAINTS,
    physics=dict(engineForce=5600, maxSpeed=23, maxSteer=0.6, brakeForce=95, drift=0.55, gears=5),
    ride=0.72,
)

SEDAN = dict(
    name="sedan", label="Compact sedan", mass=1020,
    wheelbase=2.45, track=0.74, tyre=0.295, tyre_w=0.175, arch_x=0.84,
    belt=0.90, b_pillar=0.0, roof_z=1.50, glass_top=1.42,
    doors=[("door_fr", 1, 1.06, 0.03, 65), ("door_fl", -1, 1.06, 0.03, -65),
           ("door_rr", 1, -0.02, -0.92, 65), ("door_rl", -1, -0.02, -0.92, -65)],
    door_z=(0.29, 1.42),
    sections=[
        (-2.02, 0.72, 0.40, 0.84, 0.88, 0.64, 0.10, 0.06),
        (-1.98, 0.80, 0.30, 0.90, 0.95, 0.74, 0.09, 0.06),
        (-1.78, 0.84, 0.27, 0.93, 0.99, 0.76, 0.08, 0.07),
        (-1.45, 0.85, 0.25, 0.93, 1.03, 0.74, 0.08, 0.08),
        (-1.20, 0.86, 0.24, 0.92, 1.25, 0.68, 0.08, 0.10),
        (-0.80, 0.86, 0.24, 0.91, 1.45, 0.66, 0.08, 0.12),
        (-0.30, 0.86, 0.24, 0.91, 1.50, 0.66, 0.08, 0.12),
        (0.35, 0.86, 0.24, 0.90, 1.49, 0.67, 0.08, 0.12),
        (0.70, 0.86, 0.24, 0.89, 1.36, 0.70, 0.08, 0.10),
        (1.08, 0.85, 0.24, 0.87, 1.03, 0.78, 0.08, 0.08),
        (1.50, 0.84, 0.25, 0.83, 0.92, 0.78, 0.08, 0.08),
        (1.80, 0.80, 0.28, 0.76, 0.83, 0.72, 0.09, 0.08),
        (1.93, 0.70, 0.36, 0.68, 0.73, 0.60, 0.10, 0.06),
    ],
    hip=(0.38, -0.02, 0.56),
    seats=[("seat_driver", 0.38, -0.02), ("seat_front_left", -0.38, -0.02), ("seat_rear_right", 0.4, -0.88), ("seat_rear_left", -0.4, -0.88)],
    seat_z=0.46, cargo=(0, -1.62, 0.55), boot=True, rim="alloy",
    paints=INDIAN_PAINTS,
    physics=dict(engineForce=6200, maxSpeed=27, maxSteer=0.58, brakeForce=105, drift=0.5, gears=5),
    ride=0.72,
)

TAXI = dict(SEDAN, name="taxi", label="Chennai taxi (compact sedan)", rim="light_grey", taxi=True,
            paints=[("pearl white", (0.8, 0.8, 0.78)), ("taxi yellow", (0.78, 0.55, 0.02)), ("silky silver", (0.45, 0.46, 0.47))],
            physics=dict(engineForce=6000, maxSpeed=26, maxSteer=0.58, brakeForce=105, drift=0.5, gears=5))


def fittings(d, shell):
    parts = []
    sec = d["sections"]
    front, rear = sec[-1][0], sec[0][0]
    belt = d["belt"]
    wl = sec[len(sec) // 2][1]
    commercial = d.get("taxi", False)
    # Headlamps: swept-back clusters on the front corners (a reflector bowl and an amber
    # indicator strip in a dark housing), placed by rays on the shell.
    lamp_z = sec[-2][3] - 0.08
    for sx in (1, -1):
        hit = K.surface((sx * (wl - 0.22), front + 2, lamp_z), (0, -1, 0), only=shell)
        if not hit:
            continue
        p, nrm = hit
        h = K.box("lamp_house", (0.36, 0.05, 0.14), p + nrm * 0.006, role("dark_grey"), bevel=0.02)
        h.rotation_euler = (0, 0, sx * 0.35)
        parts.append(h)
        b = K.box("headlamp", (0.2, 0.05, 0.1), p + nrm * 0.022 + Vector((-sx * 0.04, 0, 0.005)), role("headlamp"), bevel=0.015)
        b.rotation_euler = (0, 0, sx * 0.35)
        parts.append(b)
        i = K.box("indicator", (0.08, 0.05, 0.05), p + nrm * 0.018 + Vector((sx * 0.11, -0.04, -0.02)), role("indicator"))
        i.rotation_euler = (0, 0, sx * 0.35)
        parts.append(i)
    # Grille: a slim slot between the lamps with one body-colour bar, and a wider black intake in
    # the bumper below (no make's shape); fog lamp recesses on the sedan.
    hit = K.surface((0, front + 2, lamp_z - 0.02), (0, -1, 0), only=shell)
    if hit:
        parts.append(K.box("grille", (2 * wl - 0.75, 0.05, 0.07), hit[0] + hit[1] * 0.008, role("black"), bevel=0.015))
        parts.append(K.box("grille_bar", (2 * wl - 0.8, 0.05, 0.012), hit[0] + hit[1] * 0.02, role("chrome" if d["boot"] else "dark_alloy")))
    hit = K.surface((0, front + 2, 0.36), (0, -1, 0), only=shell)
    if hit:
        parts.append(K.box("intake", (0.8, 0.05, 0.12), hit[0] + hit[1] * 0.01, role("black"), bevel=0.02))
        if d["boot"]:
            for sx in (1, -1):
                parts.append(K.cylinder("fog", 0.035, 0.03, hit[0] + hit[1] * 0.02 + Vector((sx * 0.55, -0.05, 0)), role("headlamp"),
                                        rot=(math.pi / 2, 0, 0), verts=K.seg(12, 6)))
    # Plates: blank (white for private cars, yellow for the taxi).
    for yy, nrm, z in ((front + 2, -1, 0.5), (rear - 2, 1, 0.62 if not d["boot"] else 0.55)):
        hit = K.surface((0, yy, z), (0, nrm, 0), only=shell)
        if hit:
            parts.append(K.box("plate", (0.5, 0.02, 0.12), hit[0] + hit[1] * 0.012, role("yellow" if commercial else "plate")))
    # Tail lamps: tall clusters on the hatch's corners; wide wraparound ones on the sedan's boot.
    for sx in (1, -1):
        if d["boot"]:
            hit = K.surface((sx * (wl - 0.2), rear - 2, sec[2][3] - 0.08), (0, 1, 0), only=shell)
            size = (0.36, 0.05, 0.13)
        else:
            hit = K.surface((sx * (wl - 0.1), rear - 2, belt + 0.02), (0, 1, 0), only=shell)
            size = (0.13, 0.05, 0.32)
        if hit:
            parts.append(K.box("tail", size, hit[0] + hit[1] * 0.012, role("taillamp"), bevel=0.015))
            parts.append(K.box("tail_ind", (size[0] * 0.5, 0.05, size[2] * 0.3), hit[0] + hit[1] * 0.02 + Vector((0, 0, -size[2] * 0.25)),
                               role("indicator")))
    # Rear bumper strip and the hatch's spoiler lip with a stop lamp.
    hit = K.surface((0, rear - 2, 0.4), (0, 1, 0), only=shell)
    if hit:
        parts.append(K.box("bumper_strip", (1.2, 0.05, 0.08), hit[0] + hit[1] * 0.01, role("black"), bevel=0.02))
    if not d["boot"]:
        hit = K.surface((0, rear + 0.12, 3), (0, 0, -1), only=shell)
        if hit:
            parts.append(K.box("spoiler", (1.0, 0.14, 0.035), hit[0] + Vector((0, -0.07, 0.01)), K.paint_material(d["paints"][0][1]), bevel=0.012))
            parts.append(K.box("stop_lamp", (0.3, 0.02, 0.025), hit[0] + Vector((0, -0.145, 0.005)), role("taillamp")))
        if K.LOD == 0:
            parts.append(K.box("wiper_r", (0.35, 0.02, 0.015), (0, rear + 0.02, 1.18), role("black")))
    # Mirrors (body colour on the sedan, black on the hatch), door handles, wipers.
    for sx in (1, -1):
        y = d["a_line"][0][0] - 0.1
        hit = K.surface((sx * 2, y, belt + 0.07), (-sx, 0, 0), only=shell)
        if hit:
            p = hit[0]
            mat = K.paint_material(d["paints"][0][1]) if d["boot"] else role("black")
            parts.append(K.box("mirror", (0.16, 0.07, 0.1), p + Vector((sx * 0.08, 0, 0.02)), mat, bevel=0.025))
            if K.LOD == 0:
                parts.append(K.box("mirror_glass", (0.13, 0.01, 0.075), p + Vector((sx * 0.09, -0.04, 0.02)), role("chrome")))
    if K.LOD == 0:
        for _nm, sx, ya, yb, _o in d["doors"]:
            hit = K.surface((sx * 2, ya - (ya - yb) * 0.8, belt - 0.06), (-sx, 0, 0), only=shell)
            if hit:
                parts.append(K.box("handle", (0.02, 0.13, 0.03), hit[0] + hit[1] * 0.006, role("black" if not d["boot"] else "chrome")))
        ay = d["a_line"][0][0]
        for sx in (0.3, -0.25):
            w = K.box("wiper", (0.45, 0.015, 0.015), (sx, ay - 0.06, belt + 0.07), role("black"))
            w.rotation_euler = (0, 0, 0.12)
            parts.append(w)
    # Roof antenna stub and the side indicator repeaters.
    for sx in (1, -1):
        hit = K.surface((sx * 2, d["wheelbase"] / 2 + 0.25, 0.72), (-sx, 0, 0), only=shell)
        if hit:
            parts.append(K.box("repeater", (0.01, 0.06, 0.025), hit[0] + hit[1] * 0.004, role("indicator")))
    if d.get("taxi"):
        # Roof board: a plain box sign, yellow faces with a black band (no lettering).
        hit = K.surface((0, -0.15, 3), (0, 0, -1), only=shell)
        z = hit[0].z if hit else d["roof_z"]
        parts.append(K.box("roof_board_base", (0.5, 0.18, 0.04), (0, -0.15, z + 0.02), role("black")))
        parts.append(K.box("roof_board", (0.62, 0.12, 0.2), (0, -0.15, z + 0.14), role("yellow"), bevel=0.012))
        parts.append(K.box("roof_board_band", (0.63, 0.125, 0.05), (0, -0.15, z + 0.1), role("black")))
    return parts


def build(d, lod):
    K.LOD = lod
    K.reset()
    shell, doors = C.car_body(d)
    if d["boot"]:
        # Sedan: no seam groove problems; give the boot lid a dark shut line.
        pass
    parts = [shell] + fittings(d, shell) + C.interior(d)
    K.join(parts, "body")
    hinges = []
    for dr, (hx, hy), open_deg, sx in doors:
        K.set_origin(dr, (hx, hy, 0))
        hinges.append(dict(node=dr.name, hinge=K.g((hx, hy, 0)), axis=[0, 1, 0], open_deg=open_deg, side="right" if sx > 0 else "left"))
    centre = Vector(d["hip"]) + Vector((0, 0.42, 0.30))
    st, normal = C.steering_wheel(centre, 0.18, math.radians(26))
    for side in (1, -1):
        K.empty("grip_steer_" + ("r" if side > 0 else "l"), centre + Vector((side * 0.17, 0, 0)))
    axle = d["wheelbase"] / 2
    for nm, y in (("wheel_fl", axle), ("wheel_fr", axle), ("wheel_rl", -axle), ("wheel_rr", -axle)):
        sx = 1 if nm.endswith("r") else -1
        if d["rim"] == "alloy":
            K.car_wheel(nm, (sx * d["track"], y, d["tyre"]), d["tyre"], d["tyre_w"], spokes=4, rim_role="alloy", sidewall=0.4)
        else:
            T.steel_wheel(nm, (sx * d["track"], y, d["tyre"]), d["tyre"], d["tyre_w"], d["tyre"] * 0.6, rim_role="light_grey",
                          hubcap="light_grey")
    for nm, x, y in d["seats"]:
        K.empty(nm, (x, y, d["seat_z"] + 0.1))
    K.empty("cargo_boot", d["cargo"])
    sec = d["sections"]
    K.empty("marker_front", (0, sec[-1][0], 0.5))
    K.empty("exit_driver", (d["arch_x"] + 0.45, d["seats"][0][2] + 0.1, 0))
    r = T.export(d["name"], lod)
    r.update(doors=hinges, steer=dict(node="steering", hub=K.g(centre), axis=K.g_axis(normal), radius=0.18))
    return r


def manifest(d, results):
    axle = d["wheelbase"] / 2
    t, r = d["track"], d["tyre"]
    wheels = [("wheel_fl", -t, axle, r, True, True), ("wheel_fr", t, axle, r, True, True),
              ("wheel_rl", -t, -axle, r, False, False), ("wheel_rr", t, -axle, r, False, False)]
    r0 = results[0]
    m = T.base_manifest(d["name"], d["label"], "car", SOURCE, results, wheels, d["mass"], [(None, 28), (28, 300)])
    seats = []
    for nm, x, y in d["seats"]:
        seats.append(dict(node=nm, hip=K.g((x, y, d["seat_z"] + 0.1)), role="driver" if nm == "seat_driver" else "passenger",
                          door=next((dd[0] for dd in d["doors"] if (dd[1] > 0) == (x > 0) and dd[3] < y < dd[2]), None)))
    sec = d["sections"]
    belt = d["belt"]
    half_w = max(s[1] for s in sec)
    m.update(
        steering=r0["steer"], doors=r0["doors"], seats=seats,
        grips=[dict(node="grip_steer_l", hand="left"), dict(node="grip_steer_r", hand="right")],
        cargo=[dict(node="cargo_boot", what="boot floor" if d["boot"] else "luggage space behind the rear seat")],
        pose=dict(lean=-0.1, hand=[0.17, 0.3, -0.42], foot=[0.12, -0.15, -0.78]),
        entry=dict(side=1, point=K.g((d["arch_x"] + 0.45, d["seats"][0][2] + 0.1, 0)), door="hinged", style="door"),
        collision=[
            dict(shape="box", centre=K.g((0, (sec[0][0] + sec[-1][0]) / 2, (sec[5][2] + belt) / 2)),
                 half_extents=[round(half_w, 3), round((belt - sec[5][2]) / 2, 3), round((sec[-1][0] - sec[0][0]) / 2, 3)]),
            dict(shape="box", centre=K.g((0, (d["c_line"][1][0] + d["a_line"][0][0]) / 2, (belt + d["roof_z"]) / 2)),
                 half_extents=[round(sec[6][5], 3), round((d["roof_z"] - belt) / 2, 3), round((d["a_line"][0][0] - d["c_line"][1][0]) / 2, 3)])],
        paints=[dict(name=n, srgb=[round(K._srgb(c), 4) for c in rgb]) for n, rgb in d["paints"]],
        paint_surface="material named `paint`: set albedo_color = Color(srgb) (Godot colours are sRGB)",
        physics=T.physics_block(d["mass"], d["ride"], wheels, d["physics"]),
        notes=("Handling as the Three.js game's hatchback (specs.ts `car`); " if d["name"] == "hatchback" else
               "Handling estimated from the Three.js hatchback (heavier, a little faster); ") + "starting values for Phase 2 tuning.",
    )
    if d.get("taxi"):
        m["livery_family"] = "Chennai taxi: plain body colour, yellow and black roof board with no lettering, yellow commercial plates (blank)"
    T.write(d["name"], m)


# ----------------------------------------------------------------------------- van ambulance

AMB = dict(
    name="ambulance", label="Ambulance (high-roof van)", mass=2300,
    axles=(1.6, -1.55), track=0.83, tyre=0.36, tyre_w=0.195,
    y0=-2.62, y1=2.48, hw=0.98, roof=2.40, belt=1.18,
    physics=dict(engineForce=12500, maxSpeed=25, maxSteer=0.55, brakeForce=230, drift=0.45, gears=5),
    ride=0.95,
)


def amb_build(d, lod):
    K.LOD = lod
    K.reset()
    paint = K.paint_material((0.8, 0.8, 0.78), rough=0.3, metal=0.05)
    y0, y1, hw, roof, belt = d["y0"], d["y1"], d["hw"], d["roof"], d["belt"]
    n_arc = 3 if lod == 0 else 1
    # (y, half width, bottom, top, top corner radius)
    secs = [(y0, hw - 0.02, 0.42, roof - 0.04, 0.14), (y0 + 0.06, hw, 0.36, roof, 0.16), (0.9, hw, 0.36, roof, 0.16),
            (1.05, hw - 0.01, 0.36, roof - 0.02, 0.16), (1.25, hw - 0.02, 0.38, 1.98, 0.12), (1.6, hw - 0.03, 0.38, 1.6, 0.1),
            (1.88, hw - 0.04, 0.4, 1.26, 0.09), (2.25, hw - 0.06, 0.42, 1.14, 0.09), (2.42, hw - 0.1, 0.46, 1.06, 0.08),
            (y1, hw - 0.16, 0.52, 0.96, 0.07)]
    rings = [T.rounded_rect(y, w, zb, zt, 0.07, rt, n_arc) for y, w, zb, zt, rt in secs]
    shell = K.loft("shell", K.inset_ends(rings, (0.7, 0.35)), paint, caps=(True, True))
    ya, yr = d["axles"]
    K.boolean_cut(shell, [K.cutter_cyl("arch", d["tyre"] + 0.06, 0.4, (sx * hw, y, d["tyre"]), verts=K.seg(28, 14)) for y in (ya, yr) for sx in (1, -1)])
    cab = (1.18, 0.28)  # cab door front (hinge) and rear edge
    dz = (0.45, 1.98)
    rd = (0.42, 2.12)  # rear doors z
    if lod == 0:
        for y in cab:
            for e in (-0.006, 0.006):
                K.bisect(shell, (0, y + e, 0), (0, 1, 0))
        for z in dz + rd:
            for e in (-0.006, 0.006):
                K.bisect(shell, (0, 0, z + e), (0, 0, 1))
        for x in (-0.006, 0.006, -0.86, 0.86):
            K.bisect(shell, (x, 0, 0), (1, 0, 0))
    K.bisect_planes(shell, zs=(belt, belt + 0.16, 1.5, 1.95), ys=(-2.0, 0.2))
    # Glass: windscreen, cab door windows; the patient compartment's windows frosted (white).
    K.paint_faces(shell, role("glass"), lambda c, n: n.y > 0.4 and c.z > 1.28 and abs(c.x) < hw - 0.1 and c.z < 1.97)
    K.paint_faces(shell, role("glass"), lambda c, n: abs(n.x) > 0.6 and belt + 0.17 < c.z < 1.94 and 0.3 < c.y < 1.14)
    K.paint_faces(shell, role("white"), lambda c, n: abs(n.x) > 0.6 and 1.5 < c.z < 1.94 and -2.0 < c.y < 0.2)
    K.paint_faces(shell, role("white"), lambda c, n: n.y < -0.6 and 1.5 < c.z < 1.94 and 0.08 < abs(c.x) < 0.8)
    # Red waist band all round, black bumpers and arches, dark underside.
    K.paint_faces(shell, role("red"), lambda c, n: belt < c.z < belt + 0.16 and n.z < 0.6 and not (n.y > 0.4 and c.y > 2.3))
    K.paint_faces(shell, role("black"), lambda c, n: c.z < 0.62 and (c.y > y1 - 0.3 or c.y < y0 + 0.12))
    K.paint_faces(shell, role("black"), lambda c, n: any(math.hypot(c.y - y, c.z - d["tyre"]) < d["tyre"] + 0.07 for y in (ya, yr)) and abs(n.x) < 0.7)
    K.paint_faces(shell, role("underframe"), lambda c, n: n.z < -0.7)
    if lod == 0:
        def groove(c, n):
            if abs(n.x) > 0.3 and dz[0] - 0.007 < c.z < dz[1] + 0.007 and cab[1] - 0.007 < c.y < cab[0] + 0.007:
                return min(abs(c.y - cab[0]), abs(c.y - cab[1])) < 0.006 or min(abs(c.z - dz[0]), abs(c.z - dz[1])) < 0.006
            if n.y < -0.5 and rd[0] - 0.007 < c.z < rd[1] + 0.007 and abs(c.x) < 0.867:
                return abs(c.x) < 0.006 or abs(abs(c.x) - 0.86) < 0.006 or min(abs(c.z - rd[0]), abs(c.z - rd[1])) < 0.006
            return False
        K.paint_faces(shell, role("dark_grey"), groove)
    K.smooth(shell, 35)
    doors = []
    if lod == 0:
        for nm, sx, deg in (("door_cab", 1, 65), ("door_cab_l", -1, -65)):
            dr = K.separate(shell, nm, (lambda sx: lambda c, n: abs(n.x) > 0.3 and c.x * sx > 0.3 and cab[1] + 0.007 < c.y < cab[0] - 0.007
                                        and dz[0] + 0.007 < c.z < dz[1] - 0.007)(sx))
            card = K.box(nm + "_card", (0.03, cab[0] - cab[1] - 0.06, belt - dz[0] - 0.05), (sx * (hw - 0.05), (cab[0] + cab[1]) / 2, (dz[0] + belt) / 2), role("interior"))
            doors.append((K.join([dr, card], nm), (sx * hw, cab[0]), deg, sx))
        for nm, sx, deg in (("door_back_l", -1, -110), ("door_back_r", 1, 110)):
            dr = K.separate(shell, nm, (lambda sx: lambda c, n: n.y < -0.5 and c.x * sx > 0.007 and abs(c.x) < 0.853 and rd[0] + 0.007 < c.z < rd[1] - 0.007)(sx))
            inner = K.box(nm + "_card", (0.8, 0.03, rd[1] - rd[0] - 0.1), (sx * 0.43, y0 + 0.08, (rd[0] + rd[1]) / 2), role("interior"))
            doors.append((K.join([dr, inner], nm), (sx * 0.86, y0), deg, sx))
    parts = [shell]
    # Front: tall headlamp clusters, a plain grille slot, bumper, plate; the beacon bar on the cab
    # roof (red and white lamps) and amber warning lamps at the rear corners.
    for sx in (1, -1):
        hit = K.surface((sx * (hw - 0.26), y1 + 2, 0.92), (0, -1, 0), only=shell)
        if hit:
            p, nrm = hit
            parts.append(K.box("lamp_house", (0.3, 0.05, 0.2), p + nrm * 0.006, role("dark_grey"), bevel=0.02))
            parts.append(K.box("headlamp", (0.2, 0.05, 0.13), p + nrm * 0.02 + Vector((-sx * 0.03, 0, 0.02)), role("headlamp"), bevel=0.015))
            parts.append(K.box("indicator", (0.07, 0.05, 0.13), p + nrm * 0.02 + Vector((sx * 0.1, 0, 0.02)), role("indicator")))
        parts += T.mirror_on_stalk((sx * hw, 1.15, 1.25), sx, reach=0.16, up=0.12, size=(0.14, 0.04, 0.24))
    hit = K.surface((0, y1 + 2, 0.92), (0, -1, 0), only=shell)
    if hit:
        parts.append(K.box("grille", (0.8, 0.05, 0.14), hit[0] + hit[1] * 0.008, role("black"), bevel=0.02))
    parts.append(K.box("bumper", (2 * hw - 0.2, 0.12, 0.16), (0, y1 - 0.02, 0.55), role("black"), bevel=0.03))
    parts.append(K.box("plate", (0.5, 0.02, 0.12), (0, y1 + 0.045, 0.55), role("plate")))
    parts.append(K.box("beacon_base", (1.3, 0.3, 0.05), (0, 0.85, roof + 0.025), role("black")))
    for k, rl in enumerate(("nav_red", "strobe", "nav_red", "strobe", "nav_red")):
        parts.append(K.box("beacon", (0.24, 0.24, 0.12), (-0.52 + k * 0.26, 0.85, roof + 0.11), role(rl), bevel=0.02))
    for sx in (1, -1):
        parts.append(K.box("rear_beacon", (0.12, 0.1, 0.1), (sx * (hw - 0.14), y0 + 0.08, roof + 0.05), role("indicator"), bevel=0.02))
        parts.append(K.box("tail", (0.12, 0.05, 0.42), (sx * (hw - 0.06), y0 - 0.01, 0.95), role("taillamp"), bevel=0.015))
        parts.append(K.box("roof_vent", (0.4, 0.4, 0.06), (0, -0.6 + sx * 0.8, roof + 0.03), role("light_grey"), bevel=0.02))
    parts.append(K.box("bumper_rear", (2 * hw - 0.1, 0.12, 0.14), (0, y0 - 0.02, 0.42), role("black"), bevel=0.03))
    parts.append(K.box("step_rear", (1.3, 0.25, 0.04), (0, y0 - 0.1, 0.34), role("steel")))
    parts.append(K.box("plate_rear", (0.5, 0.02, 0.12), (0.45, y0 - 0.085, 0.42), role("plate")))
    # Inside: a stretcher on the left, a bench on the right, cab seats and dash (seen through the doors).
    if lod == 0:
        parts.append(K.box("cabin", (2 * hw - 0.1, 0.03, 1.75), (0, 0.22, 1.3), role("inside_dark")))
        parts.append(K.box("floor_in", (2 * hw - 0.1, 2.75, 0.03), (0, -1.2, 0.5), role("rubber")))
        parts.append(K.box("stretcher", (0.6, 1.9, 0.1), (-0.35, -1.2, 0.85), role("white"), bevel=0.03))
        parts.append(K.box("stretcher_legs", (0.5, 1.7, 0.3), (-0.35, -1.2, 0.65), role("steel")))
        parts.append(K.box("bench_in", (0.4, 1.6, 0.1), (0.6, -1.25, 0.9), role("seat_dark"), bevel=0.03))
        parts.append(K.box("dash", (2 * hw - 0.14, 0.45, 0.25), (0, 1.32, 1.08), role("interior"), bevel=0.04))
    for x in (0.45, -0.45):
        parts.append(K.box("cab_seat", (0.5, 0.5, 0.12), (x, 0.7, 0.92), role("seat_dark"), bevel=0.03))
        b = K.box("cab_seat_b", (0.48, 0.12, 0.65), (x, 0.42, 1.25), role("seat_dark"), bevel=0.03)
        b.rotation_euler = (0.2, 0, 0)
        parts.append(b)
    K.join(parts, "body")
    hinges = []
    for dr, (hx, hy), deg, sx in doors:
        K.set_origin(dr, (hx, hy, 0))
        hinges.append(dict(node=dr.name, hinge=K.g((hx, hy, 0)), axis=[0, 1, 0], open_deg=deg, side="right" if sx > 0 else "left"))
    centre = Vector((0.45, 1.12, 1.4))
    st, normal = C.steering_wheel(centre, 0.19, math.radians(35))
    for side in (1, -1):
        K.empty("grip_steer_" + ("r" if side > 0 else "l"), centre + Vector((side * 0.18, 0, 0)))
    for nm, x, y in (("wheel_fl", -d["track"], ya), ("wheel_fr", d["track"], ya), ("wheel_rl", -d["track"], yr), ("wheel_rr", d["track"], yr)):
        T.steel_wheel(nm, (x, y, d["tyre"]), d["tyre"], d["tyre_w"], 0.2, rim_role="light_grey", studs=6)
    K.empty("seat_driver", (0.45, 0.7, 1.08))
    K.empty("seat_cab_left", (-0.45, 0.7, 1.08))
    K.empty("seat_attendant", (0.6, -1.25, 1.02))
    K.empty("cargo_stretcher", (-0.35, -1.2, 0.9))
    K.empty("exit_driver", (hw + 0.5, 0.7, 0))
    K.empty("exit_rear", (0, y0 - 0.9, 0))
    K.empty("marker_front", (0, y1, 0.7))
    r = T.export(d["name"], lod)
    r.update(doors=hinges, steer=dict(node="steering", hub=K.g(centre), axis=K.g_axis(normal), radius=0.19))
    return r


def amb_manifest(d, results):
    ya, yr = d["axles"]
    t, r = d["track"], d["tyre"]
    wheels = [("wheel_fl", -t, ya, r, True, True), ("wheel_fr", t, ya, r, True, True),
              ("wheel_rl", -t, yr, r, False, False), ("wheel_rr", t, yr, r, False, False)]
    r0 = results[0]
    m = T.base_manifest(d["name"], d["label"], "ambulance", SOURCE, results, wheels, d["mass"], [(None, 28), (28, 300)])
    m["frame"] = "metres; +Y up, front faces -Z, +X right; ground at y = 0; origin at the Three.js chassis centre (axles at -1.6 and +1.55)"
    m.update(
        steering=r0["steer"], doors=r0["doors"],
        seats=[dict(node="seat_driver", hip=K.g((0.45, 0.7, 1.08)), role="driver", door="door_cab"),
               dict(node="seat_cab_left", hip=K.g((-0.45, 0.7, 1.08)), role="passenger", door="door_cab_l"),
               dict(node="seat_attendant", hip=K.g((0.6, -1.25, 1.02)), role="passenger", door="door_back_r")],
        grips=[dict(node="grip_steer_l", hand="left"), dict(node="grip_steer_r", hand="right")],
        cargo=[dict(node="cargo_stretcher", what="stretcher (patient)")],
        cargo_clear=dict(min=K.g((-0.68, -2.45, 0.52)), max=K.g((0.0, 0.1, 2.2))),
        anchors=[dict(node="exit_driver", what="driver steps out (right)"), dict(node="exit_rear", what="stretcher in and out at the back")],
        pose=dict(lean=-0.05, hand=[0.17, 0.3, -0.42], foot=[0.12, -0.38, -0.7]),
        entry=dict(side=1, point=K.g((d["hw"] + 0.5, 0.7, 0)), door="hinged", style="door"),
        collision=[dict(shape="box", centre=K.g((0, -0.1, 1.38)), half_extents=[d["hw"], 1.0, 2.5])],
        livery_family="plain white with a red waist band, red and white beacons, amber rear warning lamps; no service name, "
                      "number, cross or star emblem (both are protected or registered marks)",
        siren=True,
        physics=T.physics_block(d["mass"], d["ride"], wheels, d["physics"]),
        notes="Wheel positions, mass and handling as the Three.js game's ambulance (specs.ts); starting values.",
    )
    T.write(d["name"], m)


if __name__ == "__main__":
    for d in (HATCH, SEDAN, TAXI):
        if not K.ONLY or d["name"] in K.ONLY:
            manifest(d, [build(d, 0), build(d, 1)])
    if not K.ONLY or "ambulance" in K.ONLY:
        amb_manifest(AMB, [amb_build(AMB, 0), amb_build(AMB, 1)])
    K.save_palette(os.path.join(K.ROOT, "assets", "vehicles", "shared"))
