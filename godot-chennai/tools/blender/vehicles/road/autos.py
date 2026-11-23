"""
Chennai three-wheelers and the mini goods carrier, by script in Blender 5.2 LTS.

    blender -b --factory-startup --python godot-chennai/tools/blender/vehicles/road/autos.py -- [--only auto_rickshaw,share_auto,goods_carrier]

Writes `assets/vehicles/<name>.glb`, `<name>_lod1.glb` and `<name>.json` for:

* `auto_rickshaw`: the Chennai auto (redesign of the Three.js game's model, same wheel positions,
  hip points and handling): yellow tub, black canvas hood, the front cowl with one round headlamp
  and two indicator pods, handlebar steering, fare meter on the dash, rear bench for three, side
  grab rails, yellow commercial plates (blank).
* `share_auto`: the larger six-seat share auto (the Ape-style passenger carrier of Chennai's share
  routes): a full-width cab with a windscreen, twin headlamps, two facing benches in the back
  under a canvas hood, a rear step.
* `goods_carrier`: a mini four-wheel goods carrier (the Ace-style "chhota" truck): cab over the
  front axle, two hinged doors, a steering wheel on the right, a drop-side deck.

Original designs at the real proportions of the class: no maker's badge, name, grille or
styling copied (see `tnkit.py`). India drives on the left: drivers sit on the right in the goods
carrier; the autos have central handlebars and passengers get in from the left.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tnkit as T  # noqa: E402
from tnkit import K, Vector, role  # noqa: E402

SOURCE = "tools/blender/vehicles/road/autos.py"

# ----------------------------------------------------------------------------- auto-rickshaw

AUTO = dict(
    name="auto_rickshaw", label="Auto-rickshaw (Chennai)", mass=420,
    front=(0.0, 1.0), rear_y=-0.8, rear_track=0.58, tyre=0.215, tyre_w=0.11, rim=0.11,
    # Tub sections: (y, half width, bottom z, top z). The sides drop to a sill at the doorless
    # openings; the cowl rises round the front wheel.
    tub=[(-1.20, 0.56, 0.32, 0.86), (-1.12, 0.63, 0.27, 0.93), (-0.98, 0.65, 0.25, 0.96), (-0.70, 0.65, 0.25, 0.96),
         (-0.55, 0.65, 0.25, 0.80), (-0.44, 0.645, 0.25, 0.55), (0.30, 0.62, 0.27, 0.53), (0.60, 0.58, 0.29, 0.60),
         (0.74, 0.55, 0.30, 0.84), (0.84, 0.52, 0.47, 1.00), (1.05, 0.48, 0.48, 1.06), (1.24, 0.43, 0.49, 1.07),
         (1.36, 0.37, 0.51, 1.03), (1.42, 0.30, 0.57, 0.96)],
    # Inside of the tub: (y, half width, floor z) for the cavity cut from the top.
    floor=[(-0.97, 0.60, 0.42), (-0.55, 0.61, 0.42), (-0.44, 0.60, 0.40), (0.60, 0.53, 0.36), (0.76, 0.50, 0.36),
           (0.86, 0.47, 0.60), (1.10, 0.43, 0.62), (1.24, 0.38, 0.64)],
    hood_top=1.71, hood_hw=0.66, hood_front=0.98, hood_rear=-1.17, hood_low=1.47,
    driver_hip=(0.0, 0.40, 0.90), bench_y=-0.80, bench_hip_z=0.85, bench_x=0.36,
    handlebar=(0.0, 0.80, 1.10), grip_x=0.335, grip=(0.78, 1.15),
    paints=[("auto yellow", (0.78, 0.52, 0.01)), ("sun-faded yellow", (0.72, 0.56, 0.12)),
            ("green and yellow (gas autos)", (0.05, 0.25, 0.06))],
    physics=dict(halfExtents=[0.66, 0.45, 1.3], engineForce=1900, maxSpeed=14, maxSteer=0.75, brakeForce=50, drift=0.9, gears=4),
    ride=0.7,
)


def tub_shell(d, paint, n_arc):
    rings = [T.rounded_rect(y, hw, zb, zt, 0.07, 0.06, n_arc) for y, hw, zb, zt in d["tub"]]
    shell = K.loft("tub", K.inset_ends(rings, (0.7, 0.35)), paint, caps=(True, True))
    # Cavity: the inside of the tub, open at the top (floors, footwell, the cowl's back).
    crings = [T.rounded_rect(y, hw, fz, 2.4, 0.05, 0.05, 1) for y, hw, fz in d["floor"]]
    cav = K.loft("cavity", crings, role("black"), caps=(True, True))
    cuts = [cav]
    for sx in (1, -1):
        cuts.append(K.cutter_cyl("arch", d["tyre"] + 0.045, 0.34, (sx * (d["rear_track"] + 0.12), d["rear_y"], d["tyre"]), verts=K.seg(24, 12)))
    K.boolean_cut(shell, cuts)
    return shell


def auto_hood(d, n_arc, mat):
    """The canvas hood: an inverted U lofted along the car, low at the rear quarters (the canvas
    closes the sides behind the bench), closed at the back with a small rear window."""
    top, hw = d["hood_top"], d["hood_hw"]
    k = n_arc + 2

    def section(y, low, w, t):
        pts = []
        # From the left lower edge up over the roof to the right lower edge.
        pts.append(Vector((-w, y, low)))
        for i in range(k + 1):
            a = math.pi - math.pi * i / k
            pts.append(Vector((w * math.cos(a) * (0.86 + 0.14 * abs(math.cos(a))), y, t - 0.16 + 0.16 * math.sin(a) + (0.0 if abs(math.cos(a)) < 0.99 else -0.07))))
        pts.append(Vector((w, y, low)))
        return pts

    secs = [(d["hood_front"], d["hood_low"] + 0.05, hw - 0.04, top - 0.08), (d["hood_front"] - 0.12, d["hood_low"], hw, top - 0.02),
            (0.3, d["hood_low"], hw, top), (-0.42, d["hood_low"], hw, top), (-0.58, 0.97, hw, top - 0.005),
            (-1.05, 0.93, hw - 0.01, top - 0.03), (d["hood_rear"], 0.90, hw - 0.05, top - 0.09)]
    rings = [section(*s) for s in secs]
    hood = K.loft("hood", rings, mat, closed=False)
    K.solidify(hood, 0.018)
    # Rear panel: canvas fan closing the back, with a small dark window.
    last = rings[-1]
    c = sum(last, Vector()) / len(last)
    rear = K.mesh_object("hood_rear", list(last) + [c], [(i, i + 1, len(last)) for i in range(len(last) - 1)] + [(len(last) - 1, 0, len(last))], mat)
    for p in rear.data.polygons:
        if p.normal.y > 0:
            p.flip()
    win = K.box("rear_window", (0.5, 0.012, 0.16), (0, d["hood_rear"] - 0.006, top - 0.33), role("glass"))
    return [hood, rear, win]


def auto_build(d, lod):
    K.LOD = lod
    K.reset()
    paint = K.paint_material(d["paints"][0][1], rough=0.32, metal=0.0)
    n_arc = 3 if lod == 0 else 1
    shell = tub_shell(d, paint, n_arc)
    # Black lower skirt and the cavity's floor; the underside dark.
    K.paint_faces(shell, role("black"), lambda c, n: c.z < 0.33 and n.z < 0.6)
    K.paint_faces(shell, role("underframe"), lambda c, n: n.z < -0.7)
    K.smooth(shell, 40)
    parts = [shell]
    hood_mat = role("rubber")
    parts += auto_hood(d, n_arc, hood_mat)
    # Hood frame: windscreen pillars, the rear-quarter pillars (also grab handles) and a roof bow.
    fy, top = d["hood_front"], d["hood_top"]
    for sx in (1, -1):
        parts.append(K.tube("a_pillar", (sx * 0.47, 1.12, 1.05), (sx * 0.58, fy - 0.03, d["hood_low"] + 0.08), 0.016, role("black"), verts=K.seg(8, 5)))
        parts.append(K.tube("q_pillar", (sx * 0.64, -0.50, 0.80), (sx * 0.64, -0.50, d["hood_low"] + 0.02), 0.014, role("chrome"), verts=K.seg(8, 5)))
    # Windscreen with its black frame and a wiper.
    ws = [Vector((-0.46, 1.13, 1.06)), Vector((0.46, 1.13, 1.06)), Vector((0.54, fy, d["hood_low"] + 0.06)), Vector((-0.54, fy, d["hood_low"] + 0.06))]
    glass = K.mesh_object("windscreen", ws, [(0, 1, 2, 3)], role("glass"), recalc=False)
    if glass.data.polygons[0].normal.y < 0:
        glass.data.polygons[0].flip()
    parts.append(glass)
    parts.append(K.box("ws_header", (1.1, 0.05, 0.06), (0, fy, d["hood_low"] + 0.08), role("black")))
    parts.append(K.box("ws_sill", (0.95, 0.06, 0.04), (0, 1.13, 1.06), role("black")))
    if lod == 0:
        w = K.box("wiper", (0.42, 0.012, 0.012), (0.05, 1.10, 1.14), role("black"))
        w.rotation_euler = (0, 0.35, 0)
        parts.append(w)
    # Front: one round headlamp on the cowl, a dark slot under it, two indicator pods on the
    # cowl's top corners, the front plate (yellow, blank) and the front mudguard (on the steering).
    parts += T.lamp_disc((0, 1.425, 0.83), 0.085, (0, 1, -0.15), depth=0.05)
    parts.append(K.box("cowl_vent", (0.3, 0.03, 0.035), (0, 1.43, 0.70), role("black"), bevel=0.01))
    parts.append(T.plate((0, 1.44, 0.63), 1, width=0.26, height=0.09))
    for sx in (1, -1):
        parts.append(K.tube("pod_stalk", (sx * 0.30, 1.30, 1.04), (sx * 0.40, 1.36, 1.08), 0.01, role("black"), verts=5))
        parts.append(K.sphere("indicator_pod", 0.035, (sx * 0.41, 1.37, 1.085), role("indicator"), scale=(1.2, 1.0, 0.85),
                              segments=K.seg(12, 6), rings=K.seg(6, 4)))
        # Mirrors on stalks from the windscreen frame.
        parts += T.mirror_on_stalk((sx * 0.55, 1.0, 1.32), sx, reach=0.14, up=0.1, size=(0.12, 0.025, 0.08))
    # Rear: tail lamps, plate, the engine and silencer under the tub.
    rear = d["tub"][0][0]
    for sx in (1, -1):
        parts.append(K.box("tail", (0.13, 0.03, 0.07), (sx * 0.42, rear - 0.005, 0.74), role("taillamp"), bevel=0.01))
        parts.append(K.box("tail_ind", (0.06, 0.03, 0.07), (sx * 0.28, rear - 0.005, 0.74), role("indicator"), bevel=0.01))
    parts.append(T.plate((0, rear - 0.01, 0.55), -1, width=0.30, height=0.11))
    parts.append(K.box("engine", (0.7, 0.55, 0.2), (0.0, -0.95, 0.2), role("underframe"), bevel=0.03))
    parts.append(K.cylinder("silencer", 0.045, 0.45, (0.42, -1.02, 0.17), role("dark_alloy"), rot=(math.pi / 2, 0, 0), verts=K.seg(10, 6)))
    # Floor mat, driver's seat on its pedestal, the passengers' bench and backrest.
    hip = Vector(d["driver_hip"])
    parts.append(K.box("seat_base", (0.36, 0.32, 0.36), (0, hip.y - 0.02, 0.58), role("black")))
    parts.append(K.box("seat_driver_c", (0.48, 0.36, 0.1), (0, hip.y, hip.z - 0.14), role("seat_dark"), bevel=0.035))
    parts.append(K.box("seat_driver_b", (0.5, 0.07, 0.2), (0, hip.y - 0.2, hip.z + 0.02), role("seat_dark"), bevel=0.03))
    by, bz = d["bench_y"], d["bench_hip_z"]
    parts.append(K.box("bench_base", (1.12, 0.40, bz - 0.5), (0, by + 0.02, (bz - 0.12 + 0.42) / 2), role("black")))
    parts.append(K.box("bench_c", (1.14, 0.44, 0.1), (0, by, bz - 0.09), role("seat_dark"), bevel=0.035))
    back = K.box("bench_back", (1.16, 0.09, 0.44), (0, by - 0.25, bz + 0.2), role("seat_dark"), bevel=0.035)
    back.rotation_euler = (0.18, 0, 0)
    parts.append(back)
    # Grab rails: the bar across the back of the driver's seat (for the passengers), the right-side
    # safety bar across the opening (traffic side), and the bar over the cowl's back.
    parts.append(K.path_tube("rail_seatback", [(-0.27, hip.y - 0.24, 0.80), (-0.27, hip.y - 0.26, 1.08), (0.27, hip.y - 0.26, 1.08),
                                              (0.27, hip.y - 0.24, 0.80)], 0.014, role("chrome"), verts=K.seg(8, 5)))
    parts.append(K.tube("rail_side_r", (0.63, -0.48, 0.92), (0.61, 0.28, 0.92), 0.014, role("chrome"), verts=K.seg(8, 5)))
    for y in (-0.48, 0.28):
        parts.append(K.tube("rail_post", (0.62, y, 0.52), (0.62, y, 0.92), 0.013, role("chrome"), verts=K.seg(8, 5)))
    # Dash: the fare meter on the left of the handlebar (digital, red figures), a small shelf.
    parts.append(K.box("dash", (0.7, 0.16, 0.05), (0, 1.02, 1.04), role("black")))
    parts.append(K.box("meter", (0.15, 0.07, 0.11), (-0.3, 1.0, 1.12), role("black"), bevel=0.012))
    parts.append(K.box("meter_digits", (0.11, 0.01, 0.03), (-0.3, 0.963, 1.135), role("taillamp")))
    if lod == 0:
        parts.append(K.box("mat", (0.9, 1.25, 0.01), (0, 0.05, 0.405), role("rubber")))
    body = K.join(parts, "body")
    # Steering: handlebar, column, fork and front mudguard turn together about the column.
    hb = Vector(d["handlebar"])
    fw = Vector((0, d["front"][1], d["tyre"]))
    axis = (hb - fw).normalized()
    sp = []
    gy, gz = d["grip"]
    gx = d["grip_x"]
    sp.append(K.path_tube("handlebar", [(-gx - 0.06, gy, gz), (-gx + 0.03, gy + 0.01, gz - 0.01), (-0.12, hb.y + 0.02, hb.z + 0.02),
                                        (0.12, hb.y + 0.02, hb.z + 0.02), (gx - 0.03, gy + 0.01, gz - 0.01), (gx + 0.06, gy, gz)],
                          0.013, role("chrome"), verts=K.seg(8, 5)))
    for sx in (1, -1):
        sp.append(K.tube("grip", (sx * (gx - 0.06), gy, gz), (sx * (gx + 0.07), gy, gz), 0.019, role("rubber"), verts=K.seg(10, 6)))
        if lod == 0:
            sp.append(K.tube("lever", (sx * (gx - 0.05), gy + 0.03, gz + 0.01), (sx * (gx + 0.06), gy + 0.06, gz - 0.02), 0.006, role("alloy"), verts=4))
    sp.append(K.tube("column", hb, hb - axis * 0.45, 0.022, role("black"), verts=K.seg(8, 5)))
    for sx in (1, -1):
        sp.append(K.tube("fork", fw + Vector((sx * 0.085, 0, 0)), fw + axis * 0.4 + Vector((sx * 0.07, 0, 0)), 0.02, role("black"), verts=K.seg(8, 5)))
    # Mudguard: a curved strip over the front wheel.
    pts = []
    k = K.seg(10, 5)
    for i in range(k + 1):
        a = math.radians(-35 + 170 * i / k)
        pts.append((0, fw.y + math.cos(a) * (d["tyre"] + 0.05), fw.z + math.sin(a) * (d["tyre"] + 0.05)))
    guard = K.path_tube("mudguard", pts, 0.07, role("black"), verts=K.seg(8, 4))
    guard.scale = (1.0, 1.0, 1.0)
    sp.append(guard)
    steer = K.join(sp, "steering")
    K.set_origin(steer, hb)
    # Wheels: drum-braked steel rims, 4.00-8 tyres.
    fx, fy_ = d["front"]
    T.steel_wheel("wheel_front", (0, fy_, d["tyre"]), d["tyre"], d["tyre_w"], d["rim"], rim_role="steel", face_sign=1)
    for nm, sx in (("wheel_rear_left", -1), ("wheel_rear_right", 1)):
        T.steel_wheel(nm, (sx * d["rear_track"], d["rear_y"], d["tyre"]), d["tyre"], d["tyre_w"], d["rim"], rim_role="steel")
    # Anchors.
    K.empty("seat_driver", hip)
    for sx, nm in ((-1, "seat_rear_left"), (0, "seat_rear_middle"), (1, "seat_rear_right")):
        K.empty(nm, (sx * d["bench_x"], by, bz))
    K.empty("grip_l", (-gx, gy, gz))
    K.empty("grip_r", (gx, gy, gz))
    K.empty("grip_seatback", (0, hip.y - 0.26, 1.08))
    K.empty("grip_side_r", (0.62, -0.1, 0.92))
    K.empty("foot_l", (-0.16, 0.64, 0.37))
    K.empty("foot_r", (0.16, 0.64, 0.37))
    K.empty("cargo_bench", (0, by, bz - 0.04))
    K.empty("cargo_rear_shelf", (0, -1.07, 0.96))
    K.empty("exit_driver", (-0.95, 0.40, 0.0))
    K.empty("marker_front", (0, 1.45, 0.5))
    r = T.export(d["name"], lod)
    r["axis"] = axis
    return r


def auto_manifest(d, results):
    wheels = [("wheel_front", 0.0, d["front"][1], d["tyre"], True, False),
              ("wheel_rear_left", -d["rear_track"], d["rear_y"], d["tyre"], False, True),
              ("wheel_rear_right", d["rear_track"], d["rear_y"], d["tyre"], False, True)]
    m = T.base_manifest(d["name"], d["label"], "auto", SOURCE, results, wheels, d["mass"], [(None, 28), (28, 300)])
    hb = Vector(d["handlebar"])
    m.update(
        steering=dict(node="steering", hub=K.g(hb), axis=K.g_axis(results[0]["axis"]), kind="handlebar",
                      notes="handlebar, column, fork and front mudguard turn together about `axis`; also turn wheel_front about Y"),
        doors=[],
        seats=[dict(node="seat_driver", hip=K.g(d["driver_hip"]), role="driver", door=None)] +
              [dict(node=n, hip=K.g((x, d["bench_y"], d["bench_hip_z"])), role="passenger", door=None, enter_from="left",
                    stand=K.g((-0.95, d["bench_y"] + 0.35 * 0, 0)))
               for n, x in (("seat_rear_left", -d["bench_x"]), ("seat_rear_middle", 0.0), ("seat_rear_right", d["bench_x"]))],
        grips=[dict(node="grip_l", hand="left"), dict(node="grip_r", hand="right"),
               dict(node="grip_seatback", hand="either", what="passengers' bar on the back of the driver's seat"),
               dict(node="grip_side_r", hand="right", what="safety bar across the right-hand opening")],
        anchors=[dict(node="foot_l", what="driver's left foot"), dict(node="foot_r", what="driver's right foot"),
                 dict(node="exit_driver", what="where the driver steps out (left)")],
        cargo=[dict(node="cargo_bench", what="passengers' bench"), dict(node="cargo_rear_shelf", what="luggage shelf behind the bench")],
        pose=dict(lean=0.45, hand=[0.335, 0.25, -0.38], foot=[0.16, -0.37, -0.24]),
        entry=dict(side=-1, point=K.g((-0.95, 0.40, 0)), door="none", style="step"),
        collision=[dict(shape="box", centre=K.g((0, 0.05, 0.62)), half_extents=[0.66, 0.38, 1.3]),
                   dict(shape="box", centre=K.g((0, -0.1, 1.3)), half_extents=[0.66, 0.42, 1.05])],
        paints=[dict(name=n, srgb=[round(K._srgb(c), 4) for c in rgb]) for n, rgb in d["paints"]],
        paint_surface="material named `paint`: set albedo_color = Color(srgb) (Godot colours are sRGB); hood, skirt and trim are atlas cells",
        livery_family="Chennai autos: yellow body, black canvas hood (the gas autos green and yellow); plates yellow (commercial), blank",
        physics=T.physics_block(d["mass"], d["ride"], wheels, d["physics"]),
        open_seat=True,
        notes="Wheel positions, hip points, pose and handling as the Three.js game's auto (specs.ts), so riding and "
              "physics carry over; the handling numbers are starting values for Phase 2 tuning.",
    )
    T.write(d["name"], m)


# ----------------------------------------------------------------------------- share auto

SHARE = dict(
    name="share_auto", label="Share auto (six-seater)", mass=690,
    front_y=1.22, rear_y=-0.98, rear_track=0.62, tyre=0.245, tyre_w=0.125, rim=0.13,
    length=(-1.58, 1.62), hw=0.72, roof=1.93, floor=0.52,
    paints=[("share-auto yellow", (0.78, 0.55, 0.02)), ("leaf green", (0.06, 0.22, 0.06)), ("sky blue", (0.12, 0.3, 0.55)),
            ("white", (0.78, 0.78, 0.76))],
    physics=dict(halfExtents=[0.72, 0.5, 1.6], engineForce=2600, maxSpeed=13, maxSteer=0.7, brakeForce=70, drift=0.85, gears=4),
    ride=0.75,
)


def share_build(d, lod):
    K.LOD = lod
    K.reset()
    paint = K.paint_material(d["paints"][0][1], rough=0.34, metal=0.0)
    n_arc = 3 if lod == 0 else 1
    y0, y1 = d["length"]
    hw = d["hw"]
    # Cab: a full-width steel cab over the front wheel with a sloped windscreen (front of the
    # body), then the rear tub to the waist; one loft, the cavity and the openings cut out.
    secs = [(y0, hw - 0.04, 0.36, 0.98), (y0 + 0.08, hw, 0.33, 1.02), (0.30, hw, 0.33, 1.02), (0.42, hw - 0.02, 0.36, 1.02),
            (0.62, hw - 0.04, 0.40, 1.08), (1.10, hw - 0.08, 0.48, 1.12), (1.40, hw - 0.12, 0.52, 1.12), (1.56, hw - 0.17, 0.56, 1.06),
            (y1, hw - 0.24, 0.62, 0.98)]
    rings = [T.rounded_rect(y, w, zb, zt, 0.07, 0.07, n_arc) for y, w, zb, zt in secs]
    shell = K.loft("body_shell", K.inset_ends(rings, (0.7, 0.35)), paint, caps=(True, True))
    cav = [T.rounded_rect(y, w, fz, 2.6, 0.04, 0.04, 1) for y, w, fz in
           ((y0 + 0.06, hw - 0.04, d["floor"]), (0.32, hw - 0.04, d["floor"]), (0.40, hw - 0.07, 0.42), (0.95, hw - 0.12, 0.42),
            (1.02, hw - 0.13, 0.74), (1.38, hw - 0.17, 0.78))]
    cuts = [K.loft("cavity", cav, role("black"), caps=(True, True))]
    for sx in (1, -1):
        cuts.append(K.cutter_cyl("arch", d["tyre"] + 0.05, 0.34, (sx * (d["rear_track"] + 0.13), d["rear_y"], d["tyre"]), verts=K.seg(24, 12)))
    # Rear opening (the step-in at the back).
    cuts.append(K.cutter_box("rear_door", (0.9, 0.4, 0.7), (0, y0, d["floor"] + 0.4)))
    K.boolean_cut(shell, cuts)
    K.paint_faces(shell, role("black"), lambda c, n: c.z < 0.4 and n.z < 0.6)
    K.paint_faces(shell, role("underframe"), lambda c, n: n.z < -0.7)
    K.smooth(shell, 40)
    parts = [shell]
    # Cab upper: pillars, roof panel (steel, painted) and the windscreen; the cab is open at the
    # sides (doorless) like the real ones.
    ws_b, ws_t = (1.50, 1.10), (1.22, 1.80)
    ws = [Vector((-hw + 0.2, ws_b[0], ws_b[1])), Vector((hw - 0.2, ws_b[0], ws_b[1])), Vector((hw - 0.1, ws_t[0], ws_t[1])), Vector((-hw + 0.1, ws_t[0], ws_t[1]))]
    g = K.mesh_object("windscreen", ws, [(0, 1, 2, 3)], role("glass"), recalc=False)
    if g.data.polygons[0].normal.y < 0:
        g.data.polygons[0].flip()
    parts.append(g)
    for sx in (1, -1):
        parts.append(K.box("a_pillar", (0.06, 0.07, 0.74), (sx * (hw - 0.12), 1.36, 1.45), paint, rot=(-0.38, 0, 0)))
        parts.append(K.box("b_pillar", (0.05, 0.06, 0.82), (sx * (hw - 0.05), 0.40, 1.43), paint))
    parts.append(K.box("cab_roof", (2 * hw - 0.02, 1.0, 0.07), (0, 0.85, d["roof"] - 0.08), paint, bevel=0.03))
    parts.append(K.box("visor", (2 * hw - 0.1, 0.18, 0.03), (0, 1.36, 1.84), paint, rot=(0.25, 0, 0)))
    # Canvas hood over the passengers, on bows, with roll-down side curtains rolled up.
    top = d["roof"]
    k = n_arc + 2

    def hsec(y, low, w):
        pts = [Vector((-w, y, low))]
        for i in range(k + 1):
            a = math.pi - math.pi * i / k
            pts.append(Vector((w * math.cos(a) * 0.97, y, top - 0.12 + 0.12 * math.sin(a))))
        pts.append(Vector((w, y, low)))
        return pts

    hr = [hsec(y, low, hw + 0.01) for y, low in ((0.36, 1.62), (-0.2, 1.62), (-1.0, 1.62), (y0 + 0.02, 1.62))]
    hood = K.loft("hood", hr, role("rubber"), closed=False)
    K.solidify(hood, 0.018)
    parts.append(hood)
    for y in (0.34, -0.6, y0 + 0.04):
        for sx in (1, -1):
            parts.append(K.tube("hood_post", (sx * (hw - 0.02), y, 1.0), (sx * (hw - 0.02), y, 1.64), 0.014, role("chrome"), verts=K.seg(8, 5)))
    for sx in (1, -1):
        parts.append(K.cylinder("curtain_roll", 0.045, 1.9, (sx * (hw + 0.02), -0.62, 1.58), role("dark_grey"), rot=(math.pi / 2, 0, 0), verts=K.seg(8, 5)))
    # Front: twin round headlamps on the cab front, indicators, a dark vent, plate, bumper.
    for sx in (1, -1):
        parts += T.lamp_disc((sx * 0.3, y1 - 0.05, 0.86), 0.075, (0, 1, 0), depth=0.05)
        parts.append(K.box("indicator", (0.08, 0.03, 0.05), (sx * 0.45, y1 - 0.09, 0.98), role("indicator"), bevel=0.01))
        parts += T.mirror_on_stalk((sx * (hw - 0.1), 1.30, 1.4), sx, reach=0.16, up=0.1, size=(0.13, 0.025, 0.09))
    parts.append(K.box("vent", (0.34, 0.03, 0.05), (0, y1 - 0.02, 0.86), role("black"), bevel=0.012))
    parts.append(T.plate((0, y1 + 0.005, 0.70), 1, width=0.3, height=0.1))
    parts.append(K.box("bumper", (0.9, 0.08, 0.06), (0, y1 + 0.02, 0.6), role("black"), bevel=0.02))
    # Rear: tail lamps, plate, step and the grab handles either side of the opening.
    for sx in (1, -1):
        parts.append(K.box("tail", (0.12, 0.03, 0.12), (sx * (hw - 0.12), y0 - 0.005, 0.85), role("taillamp"), bevel=0.01))
        parts.append(K.tube("rear_handle", (sx * 0.47, y0 - 0.03, 0.95), (sx * 0.47, y0 - 0.03, 1.55), 0.014, role("chrome"), verts=K.seg(8, 5)))
    parts.append(K.box("step", (0.9, 0.22, 0.04), (0, y0 - 0.06, 0.32), role("steel")))
    parts.append(T.plate((0.45, y0 - 0.01, 0.55), -1, width=0.26, height=0.1))
    parts.append(K.box("engine", (0.8, 0.6, 0.22), (0, -0.95, 0.22), role("underframe")))
    # Seats: driver's single seat, two facing side benches (three a side) with backrests on the walls.
    parts.append(K.box("seat_driver_c", (0.5, 0.36, 0.1), (0, 0.72, 0.86), role("seat_dark"), bevel=0.03))
    parts.append(K.box("seat_driver_b", (0.52, 0.07, 0.3), (0, 0.5, 1.04), role("seat_dark"), bevel=0.03))
    parts.append(K.box("seat_driver_base", (0.4, 0.3, 0.42), (0, 0.72, 0.62), role("black")))
    for sx in (1, -1):
        parts.append(K.box("bench", (0.36, 1.45, 0.1), (sx * (hw - 0.24), -0.62, 0.92), role("seat_dark"), bevel=0.03))
        parts.append(K.box("bench_base", (0.3, 1.4, 0.38), (sx * (hw - 0.22), -0.62, 0.7), role("black")))
        parts.append(K.box("bench_back", (0.07, 1.45, 0.34), (sx * (hw - 0.07), -0.62, 1.18), role("seat_dark"), bevel=0.025))
        parts.append(K.tube("roof_rail", (sx * (hw - 0.12), 0.3, 1.66), (sx * (hw - 0.12), y0 + 0.1, 1.66), 0.012, role("chrome"), verts=K.seg(8, 5)))
    parts.append(K.box("meter", (0.14, 0.07, 0.1), (-0.32, 1.22, 1.17), role("black"), bevel=0.012))
    parts.append(K.box("meter_digits", (0.1, 0.01, 0.03), (-0.32, 1.183, 1.19), role("taillamp")))
    parts.append(K.box("dash", (2 * hw - 0.3, 0.2, 0.06), (0, 1.25, 1.1), role("black")))
    body = K.join(parts, "body")
    # Steering: handlebar on a column through the cab floor to the front fork.
    hb = Vector((0, 1.02, 1.22))
    fw = Vector((0, d["front_y"], d["tyre"]))
    axis = (hb - fw).normalized()
    gy, gz, gx = 1.0, 1.26, 0.34
    sp = [K.path_tube("handlebar", [(-gx - 0.06, gy, gz), (-0.12, hb.y + 0.02, hb.z + 0.03), (0.12, hb.y + 0.02, hb.z + 0.03), (gx + 0.06, gy, gz)],
                      0.013, role("chrome"), verts=K.seg(8, 5)),
          K.tube("column", hb, hb - axis * 0.4, 0.022, role("black"), verts=K.seg(8, 5))]
    for sx in (1, -1):
        sp.append(K.tube("grip", (sx * (gx - 0.06), gy, gz), (sx * (gx + 0.07), gy, gz), 0.019, role("rubber"), verts=K.seg(10, 6)))
        sp.append(K.tube("fork", fw + Vector((sx * 0.09, 0, 0)), fw + axis * 0.32 + Vector((sx * 0.08, 0, 0)), 0.022, role("black"), verts=K.seg(8, 5)))
    steer = K.join(sp, "steering")
    K.set_origin(steer, hb)
    T.steel_wheel("wheel_front", (0, d["front_y"], d["tyre"]), d["tyre"], d["tyre_w"], d["rim"], face_sign=1)
    for nm, sx in (("wheel_rear_left", -1), ("wheel_rear_right", 1)):
        T.steel_wheel(nm, (sx * d["rear_track"], d["rear_y"], d["tyre"]), d["tyre"], d["tyre_w"], d["rim"])
    K.empty("seat_driver", (0, 0.72, 0.98))
    seats = []
    for sx in (-1, 1):
        for i, y in enumerate((-0.15, -0.62, -1.09)):
            nm = f"seat_{'left' if sx < 0 else 'right'}_{i + 1}"
            K.empty(nm, (sx * (hw - 0.26), y, 1.04))
            seats.append((nm, (sx * (hw - 0.26), y, 1.04)))
    K.empty("grip_l", (-gx, gy, gz))
    K.empty("grip_r", (gx, gy, gz))
    K.empty("grip_roof_l", (-(hw - 0.12), -0.6, 1.66))
    K.empty("grip_roof_r", (hw - 0.12, -0.6, 1.66))
    K.empty("grip_rear_l", (-0.47, y0 - 0.03, 1.25))
    K.empty("grip_rear_r", (0.47, y0 - 0.03, 1.25))
    K.empty("cargo_floor", (0, -0.62, d["floor"]))
    K.empty("exit_driver", (-1.1, 0.72, 0))
    K.empty("exit_rear", (0, y0 - 0.6, 0))
    K.empty("marker_front", (0, y1, 0.7))
    r = T.export(d["name"], lod)
    r.update(axis=axis, hub=hb, seats=seats, grip=(gx, gy, gz))
    return r


def share_manifest(d, results):
    wheels = [("wheel_front", 0.0, d["front_y"], d["tyre"], True, False),
              ("wheel_rear_left", -d["rear_track"], d["rear_y"], d["tyre"], False, True),
              ("wheel_rear_right", d["rear_track"], d["rear_y"], d["tyre"], False, True)]
    r0 = results[0]
    m = T.base_manifest(d["name"], d["label"], "auto", SOURCE, results, wheels, d["mass"], [(None, 28), (28, 300)])
    y0 = d["length"][0]
    m.update(
        steering=dict(node="steering", hub=K.g(r0["hub"]), axis=K.g_axis(r0["axis"]), kind="handlebar"),
        doors=[],
        seats=[dict(node="seat_driver", hip=K.g((0, 0.72, 0.98)), role="driver", door=None)] +
              [dict(node=n, hip=K.g(p), role="passenger", door=None, enter_from="rear", facing="inwards") for n, p in r0["seats"]],
        grips=[dict(node="grip_l", hand="left"), dict(node="grip_r", hand="right"),
               dict(node="grip_roof_l", hand="either", what="roof rail"), dict(node="grip_roof_r", hand="either", what="roof rail"),
               dict(node="grip_rear_l", hand="left", what="handle at the rear step"), dict(node="grip_rear_r", hand="right", what="handle at the rear step")],
        anchors=[dict(node="exit_driver", what="driver steps out (left)"), dict(node="exit_rear", what="passengers get on and off at the back")],
        cargo=[dict(node="cargo_floor", what="floor between the benches")],
        pose=dict(lean=0.4, hand=[0.34, 0.28, -0.3], foot=[0.16, -0.42, -0.2]),
        entry=dict(side=-1, point=K.g((-1.1, 0.72, 0)), door="none", style="step"),
        collision=[dict(shape="box", centre=K.g((0, 0.02, 0.98)), half_extents=[0.72, 0.66, 1.6])],
        paints=[dict(name=n, srgb=[round(K._srgb(c), 4) for c in rgb]) for n, rgb in d["paints"]],
        paint_surface="material named `paint`: set albedo_color = Color(srgb)",
        livery_family="Chennai share autos: yellow (most), green or blue cabs, black or dark canvas; plates yellow, blank",
        physics=T.physics_block(d["mass"], d["ride"], wheels, d["physics"]),
        open_seat=True,
        notes="New kind of vehicle (no Three.js counterpart): handling estimated from the auto (heavier, slower); starting values.",
    )
    T.write(d["name"], m)


# ----------------------------------------------------------------------------- goods carrier

GOODS = dict(
    name="goods_carrier", label="Mini goods carrier", mass=1150,
    axle=1.05, track=0.64, tyre=0.275, tyre_w=0.145, rim=0.15,
    cab=(0.52, 1.78), hw=0.75, roof=1.86, deck=(-1.86, 0.44), deck_z=0.78, side_h=0.34,
    paints=[("white", (0.8, 0.8, 0.78)), ("pale blue", (0.25, 0.42, 0.6)), ("leaf green", (0.08, 0.3, 0.1)),
            ("cream yellow", (0.75, 0.6, 0.2)), ("silver", (0.42, 0.43, 0.44))],
    physics=dict(halfExtents=[0.76, 0.6, 1.85], engineForce=4200, maxSpeed=19, maxSteer=0.6, brakeForce=90, drift=0.7, gears=4),
    ride=0.8,
)


def goods_build(d, lod):
    K.LOD = lod
    K.reset()
    paint = K.paint_material(d["paints"][0][1], rough=0.3, metal=0.1)
    n_arc = 3 if lod == 0 else 1
    c0, c1 = d["cab"]
    hw, roof = d["hw"], d["roof"]
    secs = [(c0, hw, 0.45, roof - 0.04), (c0 + 0.08, hw, 0.42, roof), (1.25, hw, 0.42, roof), (1.48, hw - 0.01, 0.42, roof - 0.02),
            (1.62, hw - 0.03, 0.44, 1.32), (1.72, hw - 0.05, 0.46, 1.0), (c1, hw - 0.08, 0.5, 0.88)]
    rings = [T.rounded_rect(y, w, zb, zt, 0.06, 0.12 if zt > 1.5 else 0.08, n_arc) for y, w, zb, zt in secs]
    cab = K.loft("cab", K.inset_ends(rings, (0.7, 0.35)), paint, caps=(True, True))
    ax = d["axle"]
    K.boolean_cut(cab, [K.cutter_cyl(f"arch{sx}", d["tyre"] + 0.06, 0.4, (sx * hw, ax, d["tyre"]), verts=K.seg(28, 14)) for sx in (1, -1)])
    belt = 1.12
    dz = (0.5, 1.72)
    dy = (1.42, 0.62)  # door front (hinge) and rear edge
    if lod == 0:
        for y in dy:
            for e in (-0.006, 0.006):
                K.bisect(cab, (0, y + e, 0), (0, 1, 0))
        for z in dz:
            for e in (-0.006, 0.006):
                K.bisect(cab, (0, 0, z + e), (0, 0, 1))
    K.bisect(cab, (0, 0, belt), (0, 0, 1))
    K.bisect(cab, (0, 1.56, 0), (0, 1, 0))
    # Glass: windscreen (front faces above the belt), door windows, small rear window.
    K.paint_faces(cab, role("glass"), lambda c, n: n.y > 0.35 and c.z > belt + 0.03 and abs(c.x) < hw - 0.1 and c.z < roof - 0.08)
    K.paint_faces(cab, role("glass"), lambda c, n: abs(n.x) > 0.6 and belt + 0.03 < c.z < roof - 0.12 and 0.66 < c.y < 1.5)
    K.paint_faces(cab, role("glass"), lambda c, n: n.y < -0.6 and belt + 0.12 < c.z < roof - 0.15 and abs(c.x) < 0.45)
    K.paint_faces(cab, role("black"), lambda c, n: c.z < 0.62 and n.y > 0.4)  # bumper band
    K.paint_faces(cab, role("underframe"), lambda c, n: n.z < -0.7)
    K.paint_faces(cab, role("black"), lambda c, n: math.hypot(c.y - ax, c.z - d["tyre"]) < d["tyre"] + 0.07 and abs(n.x) < 0.7)
    if lod == 0:
        K.paint_faces(cab, role("dark_grey"), lambda c, n: abs(n.x) > 0.3 and dz[0] - 0.007 < c.z < dz[1] + 0.007 and dy[1] - 0.007 < c.y < dy[0] + 0.007
                      and (min(abs(c.y - dy[0]), abs(c.y - dy[1])) < 0.006 or min(abs(c.z - dz[0]), abs(c.z - dz[1])) < 0.006))
    K.smooth(cab, 35)
    doors = []
    if lod == 0:
        for nm, sx, deg in (("door_r", 1, 70), ("door_l", -1, -70)):
            dr = K.separate(cab, nm, (lambda sx: lambda c, n: abs(n.x) > 0.3 and c.x * sx > 0.3 and dy[1] + 0.007 < c.y < dy[0] - 0.007
                                       and dz[0] + 0.007 < c.z < dz[1] - 0.007)(sx))
            card = K.box(nm + "_card", (0.03, dy[0] - dy[1] - 0.06, belt - dz[0] - 0.05), (sx * (hw - 0.05), (dy[0] + dy[1]) / 2, (dz[0] + belt) / 2), role("interior"))
            dro = K.join([dr, card], nm)
            doors.append((dro, sx, deg))
    parts = [cab]
    # Front: rectangular headlamps at the lower corners, a plain dark intake slot, plate, bumper.
    for sx in (1, -1):
        hit = K.surface((sx * (hw - 0.22), c1 + 2, 0.82), (0, -1, 0), only=cab)
        if hit:
            p, nrm = hit
            parts.append(K.box("lamp_frame", (0.26, 0.04, 0.15), p + nrm * 0.006, role("black"), bevel=0.012))
            parts.append(K.box("headlamp", (0.22, 0.04, 0.11), p + nrm * 0.02, role("headlamp"), bevel=0.01))
            parts.append(K.box("indicator", (0.05, 0.04, 0.11), p + nrm * 0.02 + Vector((sx * 0.15, 0, 0)), role("indicator")))
        parts += T.mirror_on_stalk((sx * hw, 1.46, 1.28), sx, reach=0.14, up=0.08, size=(0.12, 0.03, 0.17))
    hit = K.surface((0, c1 + 2, 0.82), (0, -1, 0), only=cab)
    if hit:
        parts.append(K.box("intake", (0.5, 0.04, 0.07), hit[0] + hit[1] * 0.01, role("black"), bevel=0.012))
    parts.append(K.box("bumper", (2 * hw - 0.1, 0.1, 0.12), (0, c1 + 0.02, 0.52), role("black"), bevel=0.03))
    parts.append(T.plate((0, c1 + 0.075, 0.52), 1, width=0.34, height=0.1))
    # Chassis rails and the deck: floor, drop sides, tailgate, headboard with a guard.
    d0, d1 = d["deck"]
    dzf = d["deck_z"]
    for sx in (1, -1):
        parts.append(K.box("rail", (0.08, d1 - d0 + 0.6, 0.14), (sx * 0.42, (d0 + d1) / 2 + 0.3, dzf - 0.2), role("underframe")))
    parts.append(K.box("deck", (2 * hw, d1 - d0, 0.06), (0, (d0 + d1) / 2, dzf - 0.03), role("steel")))
    sh = d["side_h"]
    for sx in (1, -1):
        parts.append(K.box("drop_side", (0.035, d1 - d0, sh), (sx * (hw - 0.018), (d0 + d1) / 2, dzf + sh / 2), paint, bevel=0.01))
        if lod == 0:
            for k in range(3):
                parts.append(K.box("rib", (0.045, 0.04, sh - 0.04), (sx * (hw - 0.012), d0 + 0.3 + k * 0.85, dzf + sh / 2), role("steel")))
    parts.append(K.box("tailgate", (2 * hw, 0.035, sh), (0, d0 + 0.018, dzf + sh / 2), paint, bevel=0.01))
    parts.append(K.box("headboard", (2 * hw, 0.04, 0.75), (0, d1 - 0.02, dzf + 0.37), paint))
    if lod == 0:
        for k in range(5):
            parts.append(K.box("guard_bar", (0.025, 0.03, 0.4), (-0.5 + k * 0.25, d1 - 0.02, dzf + 0.95), role("steel")))
    parts.append(K.box("guard_top", (2 * hw - 0.2, 0.03, 0.03), (0, d1 - 0.02, dzf + 1.15), role("steel")))
    for sx in (1, -1):
        parts.append(K.box("tail", (0.08, 0.05, 0.16), (sx * (hw - 0.08), d0 - 0.03, dzf - 0.12), role("taillamp"), bevel=0.01))
        parts.append(K.box("mudflap", (0.25, 0.01, 0.25), (sx * d["track"], -ax - 0.38, 0.28), role("rubber")))
        parts.append(K.box("rear_guard", (0.3, 0.6, 0.04), (sx * d["track"], -ax, d["tyre"] * 2 + 0.07), role("black")))
    parts.append(T.plate((0, d0 - 0.03, dzf - 0.14), -1, width=0.34, height=0.12))
    parts.append(K.box("bumper_rear", (1.2, 0.06, 0.08), (0, d0 - 0.01, dzf - 0.3), role("black")))
    parts.append(K.box("fuel_tank", (0.3, 0.5, 0.25), (-0.45, -0.25, 0.48), role("underframe")))
    # Cab inside: bench for driver and one, dash, the gear lever area.
    if lod == 0:
        parts.append(K.box("cabin_back", (2 * hw - 0.08, 0.03, 1.3), (0, c0 + 0.06, 1.15), role("inside_dark")))
        parts.append(K.box("dash", (2 * hw - 0.12, 0.3, 0.2), (0, 1.5, 1.0), role("interior"), bevel=0.03))
    parts.append(K.box("seat", (2 * hw - 0.2, 0.42, 0.12), (0, 0.85, 0.86), role("seat_dark"), bevel=0.03))
    parts.append(K.box("seat_back", (2 * hw - 0.2, 0.1, 0.55), (0, 0.66, 1.18), role("seat_dark"), bevel=0.03))
    body = K.join(parts, "body")
    for dro, sx, deg in doors:
        K.set_origin(dro, (sx * hw, dy[0], 0))
    import cars as C  # the premium cars' steering wheel (vkit-based, brand-free)
    centre = Vector((0.38, 1.25, 1.25))
    st, normal = C.steering_wheel(centre, 0.19, math.radians(40))
    for nm, x, y in (("wheel_fl", -d["track"], ax), ("wheel_fr", d["track"], ax), ("wheel_rl", -d["track"], -ax), ("wheel_rr", d["track"], -ax)):
        T.steel_wheel(nm, (x, y, d["tyre"]), d["tyre"], d["tyre_w"], d["rim"], rim_role="light_grey")
    K.empty("grip_steer_l", centre + Vector((-0.17, 0, 0)))
    K.empty("grip_steer_r", centre + Vector((0.17, 0, 0)))
    K.empty("seat_driver", (0.38, 0.85, 1.02))
    K.empty("seat_passenger", (-0.38, 0.85, 1.02))
    K.empty("cargo_deck", (0, (d0 + d1) / 2, dzf))
    K.empty("exit_driver", (hw + 0.45, 0.95, 0))
    K.empty("marker_front", (0, c1, 0.7))
    r = T.export(d["name"], lod)
    r.update(doors=[dict(node=dro.name, hinge=K.g((sx * hw, dy[0], 0)), axis=[0, 1, 0], open_deg=deg, side="right" if sx > 0 else "left")
                    for dro, sx, deg in doors],
             steer=dict(node="steering", hub=K.g(centre), axis=K.g_axis(normal), radius=0.19))
    return r


def goods_manifest(d, results):
    ax, t, r = d["axle"], d["track"], d["tyre"]
    wheels = [("wheel_fl", -t, ax, r, True, False), ("wheel_fr", t, ax, r, True, False),
              ("wheel_rl", -t, -ax, r, False, True), ("wheel_rr", t, -ax, r, False, True)]
    r0 = results[0]
    d0, d1 = d["deck"]
    m = T.base_manifest(d["name"], d["label"], "car", SOURCE, results, wheels, d["mass"], [(None, 28), (28, 300)])
    m.update(
        steering=r0["steer"], doors=r0["doors"],
        seats=[dict(node="seat_driver", hip=K.g((0.38, 0.85, 1.02)), role="driver", door="door_r"),
               dict(node="seat_passenger", hip=K.g((-0.38, 0.85, 1.02)), role="passenger", door="door_l")],
        grips=[dict(node="grip_steer_l", hand="left"), dict(node="grip_steer_r", hand="right")],
        cargo=[dict(node="cargo_deck", what="open deck with drop sides", size_m=[round(2 * d["hw"] - 0.08, 2), d["side_h"], round(d1 - d0 - 0.06, 2)])],
        anchors=[dict(node="exit_driver", what="driver steps out (right)")],
        pose=dict(lean=-0.05, hand=[0.17, 0.3, -0.42], foot=[0.12, -0.42, -0.6]),
        entry=dict(side=1, point=K.g((d["hw"] + 0.45, 0.95, 0)), door="hinged", style="door"),
        collision=[dict(shape="box", centre=K.g((0, (d["cab"][0] + d["cab"][1]) / 2, 1.13)), half_extents=[d["hw"], 0.72, round((d["cab"][1] - d["cab"][0]) / 2, 3)]),
                   dict(shape="box", centre=K.g((0, (d0 + d1) / 2, 0.72)), half_extents=[d["hw"], 0.36, round((d1 - d0) / 2, 3)])],
        paints=[dict(name=n, srgb=[round(K._srgb(c), 4) for c in rgb]) for n, rgb in d["paints"]],
        paint_surface="material named `paint`: set albedo_color = Color(srgb)",
        physics=T.physics_block(d["mass"], d["ride"], wheels, d["physics"]),
        notes="New vehicle (no Three.js counterpart): handling estimated between the auto and the hatchback; starting values.",
    )
    T.write(d["name"], m)


def run(d, build, manifest, lods=2):
    results = [build(d, lod) for lod in range(lods)]
    manifest(d, results)


if __name__ == "__main__":
    for d, b, m in ((AUTO, auto_build, auto_manifest), (SHARE, share_build, share_manifest), (GOODS, goods_build, goods_manifest)):
        if not K.ONLY or d["name"] in K.ONLY:
            run(d, b, m)
    K.save_palette(os.path.join(K.ROOT, "assets", "vehicles", "shared"))
