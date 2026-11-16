"""
Chennai auto-rickshaw, modelled by script in Blender 5.2 LTS. The script is the source of the
model: running it again rebuilds the same files.

Run headless (Blender, or the `bpy` Python module):
    blender -b --factory-startup --python tools/blender/auto_rickshaw.py -- <out dir> [--render <dir>]
    python tools/blender/auto_rickshaw.py -- <out dir> [--render <dir>]

Outputs:
    auto_rickshaw.glb       detailed (body subdivided twice), for the player's auto and close views
    auto_rickshaw_lod1.glb  lighter (subdivided once), for traffic
    --render <dir>          Cycles renders (front three-quarter, side, rear three-quarter) for review

Design: an original three-wheeler at real Chennai proportions (body 2.63 m long, 1.30 m wide,
1.71 m tall to the canopy, 2.0 m wheelbase, 4.00-8 tyres). No maker's badge, grille or styling
is copied. Modelled the way a car is: one smooth shell lofted through cross-sections, with the
cabin, the open sides and the wheel arches cut out of it (so panels have real thickness), then
lamps, plates and mirrors placed on the surface by ray casting.

Frame (Blender): Z up, the front faces +Y, ground at z = 0, centred between the axles in x.
Exported with +Y up, so the front faces -Z as the game expects. Wheels are separate nodes,
"wheel_front", "wheel_rear_left" and "wheel_rear_right", with their origins on the axle, so the
game can spin and steer them.
"""
import math
import os
import sys

import bpy  # first: with the bpy module, bmesh and mathutils load through it
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv and not argv[0].startswith("--") else "assets/models/vehicles")
RENDER = argv[argv.index("--render") + 1] if "--render" in argv else None
os.makedirs(OUT, exist_ok=True)

FRONT_AXLE = 1.0
REAR_AXLE = -0.8
REAR_TRACK = 0.58  # half the rear track
TYRE_R = 0.215  # 4.00-8 tyre, 0.43 m across

# ----------------------------------------------------------------------------- materials


def material(name, colour, rough, metal=0.0, coat=0.0, emit=None, alpha=None, transmission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.06
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[0], 1)
        b.inputs["Emission Strength"].default_value = emit[1]
    if alpha is not None:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m


def materials(paint):
    return {
        "paint": material("auto_paint", paint, 0.32, 0.0, coat=1.0),
        "band": material("auto_band", (0.03, 0.30, 0.10), 0.35, coat=0.6),
        "canopy": material("auto_canopy", (0.018, 0.018, 0.02), 0.9),
        "vinyl": material("auto_vinyl", (0.025, 0.025, 0.028), 0.42),
        "black": material("auto_black", (0.02, 0.02, 0.022), 0.55),
        "floor": material("auto_floor", (0.05, 0.05, 0.05), 0.75, 0.3),
        "chrome": material("auto_chrome", (0.9, 0.9, 0.9), 0.1, 1.0),
        "steel": material("auto_steel", (0.45, 0.46, 0.47), 0.35, 0.9),
        "rubber": material("auto_rubber", (0.02, 0.02, 0.02), 0.88),
        "glass": material("auto_glass", (0.75, 0.82, 0.85), 0.03, alpha=0.25, transmission=1.0),
        "lamp": material("auto_lamp", (0.95, 0.95, 0.9), 0.05, emit=((1.0, 0.95, 0.8), 0.6)),
        "tail": material("auto_tail", (0.5, 0.02, 0.02), 0.15, emit=((0.6, 0.0, 0.0), 0.5)),
        "amber": material("auto_amber", (0.9, 0.38, 0.0), 0.15, emit=((0.6, 0.25, 0.0), 0.2)),
        "plate": material("auto_plate", (0.85, 0.62, 0.0), 0.45),
    }


# ----------------------------------------------------------------------------- mesh helpers


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    obj = link(bpy.data.objects.new(name, me))
    obj.data.materials.append(mat)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return obj


def ring_rrect(y, w, zb, zt, r):
    """A rounded-rectangle cross-section at y (16 points, anticlockwise seen from the front)."""
    m = (zb + zt) / 2
    k = 0.3
    half = [(0.0, zb), (w - r, zb), (w - r * k, zb + r * k), (w, zb + r), (w, m), (w, zt - r), (w - r * k, zt - r * k), (w - r, zt), (0.0, zt)]
    pts = half + [(-x, z) for x, z in reversed(half[1:-1])]
    return [Vector((x, y, z)) for x, z in pts]


def loft(name, rings, mat, closed=True, caps=(False, False)):
    n = len(rings[0])
    verts = [v for ring in rings for v in ring]
    faces = []
    for i in range(len(rings) - 1):
        for j in range(n if closed else n - 1):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    if caps[0]:
        faces.append(tuple(reversed(range(n))))
    if caps[1]:
        last = (len(rings) - 1) * n
        faces.append(tuple(range(last, last + n)))
    return mesh_object(name, verts, faces, mat)


def subsurf(obj, levels):
    mod = obj.modifiers.new("subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    return mod


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def cutter(name, size, centre, bevel=0.0, cylinder=None):
    if cylinder:
        radius, depth = cylinder
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=depth, location=centre, rotation=(0, math.pi / 2, 0))
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
        bpy.context.object.scale = size
        bpy.ops.object.transform_apply(scale=True)
    obj = bpy.context.object
    obj.name = name
    if bevel:
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 4
        apply_all(obj)
    obj.hide_render = True
    return obj


def boolean(target, tool):
    mod = target.modifiers.new("cut_" + tool.name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = tool


def box(name, size, centre, mat, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, centre, mat, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=centre, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def tube(name, a, b, radius, mat, verts=10):
    a, b = Vector(a), Vector(b)
    d = b - a
    obj = cylinder(name, radius, d.length, (a + b) / 2, mat, verts=verts)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return obj


def smooth(obj, sharp_angle=40.0):
    """Smooth shading, with edges sharper than `sharp_angle` kept crisp (cut panel edges)."""
    me = obj.data
    me.shade_smooth()
    bm = bmesh.new()
    bm.from_mesh(me)
    limit = math.radians(sharp_angle)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > limit:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()


def surface(origin, direction):
    """First hit on the body along a ray: (location, normal) or None."""
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, normal, _i, _o, _m = bpy.context.scene.ray_cast(dg, Vector(origin), Vector(direction).normalized())
    return (loc, normal) if hit else None


def facing(obj, normal):
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(normal)


# ----------------------------------------------------------------------------- the auto


def body(mats, levels):
    # Cross-sections from the rounded back to the nose: (y, half width, bottom, top, corner).
    sections = [
        (-1.335, 0.50, 0.40, 1.00, 0.10),
        (-1.31, 0.60, 0.35, 1.09, 0.10),
        (-1.25, 0.63, 0.33, 1.12, 0.09),
        (-0.62, 0.635, 0.33, 1.12, 0.08),
        (0.20, 0.635, 0.33, 1.10, 0.08),
        (0.70, 0.63, 0.34, 1.06, 0.08),
        (0.86, 0.625, 0.47, 1.06, 0.08),
        (1.00, 0.61, 0.52, 1.05, 0.10),
        (1.12, 0.58, 0.52, 1.00, 0.12),
        (1.22, 0.53, 0.54, 0.93, 0.12),
        (1.29, 0.46, 0.57, 0.84, 0.11),
        (1.32, 0.36, 0.62, 0.76, 0.08),
    ]
    shell = loft("body_shell", [ring_rrect(*s) for s in sections], mats["paint"], caps=(True, True))
    subsurf(shell, levels)
    # Cabin hollowed out above the bench base, leaving 3 cm walls; the driver's footwell lower;
    # the open sides; and the rear wheel arches.
    cuts = [
        cutter("cabin", (1.2, 1.98, 1.0), (0, -0.19, 1.12), bevel=0.04),
        cutter("footwell", (1.2, 1.47, 1.0), (0, 0.115, 0.88), bevel=0.04),
        cutter("sides", (2.0, 1.24, 1.0), (0, 0.0, 1.16), bevel=0.09),
    ]
    for side in (1, -1):
        cuts.append(cutter(f"arch{side}", None, (side * 0.62, REAR_AXLE, TYRE_R), cylinder=(0.265, 0.42)))
    for c in cuts:
        boolean(shell, c)
    apply_all(shell)
    for c in cuts:
        bpy.data.objects.remove(c)
    # Waist band: cut the panels at two heights and paint the side faces between them.
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    for z in (0.50, 0.565):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    shell.data.materials.clear()
    shell.data.materials.append(mats["paint"])
    shell.data.materials.append(mats["band"])
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = 1 if (0.50 < c.z < 0.565 and abs(f.normal.x) > 0.6 and c.y < 0.75) else 0
    bm.to_mesh(shell.data)
    bm.free()
    smooth(shell)
    return shell


def canopy(mats):
    hw, base, top, r = 0.665, 1.24, 1.71, 0.2
    def arch(y, sag=0.0):
        pts = [(hw, base), (hw, top - r), (hw - r * 0.3, top - r * 0.3), (hw - r, top), (0.0, top + sag)]
        pts = pts + [(-x, z) for x, z in reversed(pts[:-1])]
        return [Vector((x, y, z)) for x, z in pts]
    ys = [-1.31, -0.9, -0.4, 0.1, 0.55, 0.9]
    roof = loft("canopy", [arch(y, 0.012 if -1.0 < y < 0.8 else 0.0) for y in ys], mats["canopy"], closed=False)
    s = roof.modifiers.new("solidify", "SOLIDIFY")
    s.thickness = 0.014
    subsurf(roof, 1)
    parts = [roof]
    # Rear panel: an arch down to the rear wall with a small window.
    outer = [(hw, 1.08), (hw, top - r), (hw - r * 0.3, top - r * 0.3), (hw - r, top), (0.0, top)]
    outer = outer + [(-x, z) for x, z in reversed(outer[:-1])] + [(0.0, 1.08)]
    inner = [(0.33, 1.33), (0.33, 1.44), (0.33, 1.55), (0.25, 1.56), (0.0, 1.56), (-0.25, 1.56), (-0.33, 1.55), (-0.33, 1.44), (-0.33, 1.33), (0.0, 1.32)]
    # Match the inner loop to the outer one point for point (outer has 10 points).
    y = -1.312
    verts = [Vector((x, y, z)) for x, z in outer] + [Vector((x, y, z)) for x, z in inner]
    n = len(outer)
    faces = [(j, (j + 1) % n, n + (j + 1) % n, n + j) for j in range(n)]
    back = mesh_object("canopy_back", verts, faces, mats["canopy"])
    s = back.modifiers.new("solidify", "SOLIDIFY")
    s.thickness = 0.012
    parts.append(back)
    glass = mesh_object("rear_window", [Vector((x, y + 0.004, z)) for x, z in inner], [tuple(range(len(inner)))], mats["glass"])
    parts.append(glass)
    # Rolled front edge, hoops and pillars.
    parts.append(cylinder("canopy_roll", 0.03, 1.33, (0, 0.9, 1.69), mats["canopy"], rot=(0, math.pi / 2, 0), verts=14))
    for side in (1, -1):
        parts.append(tube("pillar_mid", (side * 0.61, 0.30, 0.66), (side * 0.63, 0.28, 1.5), 0.017, mats["black"]))
        parts.append(tube("pillar_rear", (side * 0.615, -1.24, 1.1), (side * 0.63, -1.24, 1.5), 0.017, mats["black"]))
        parts.append(tube("grab_rail", (side * 0.63, -0.6, 1.14), (side * 0.63, 0.28, 1.14), 0.013, mats["chrome"]))
    for y in (-0.4, 0.3):
        parts.append(tube("hoop", (0.5, y, 1.66), (-0.5, y, 1.66), 0.01, mats["black"]))
    return parts


def windscreen(mats):
    parts = []
    bottom, top = Vector((0, 0.95, 1.05)), Vector((0, 0.80, 1.62))
    up = (top - bottom).normalized()
    w = 0.6
    corners = [bottom + Vector((w, 0, 0)), bottom + Vector((-w, 0, 0)), top + Vector((-w + 0.03, 0, 0)), top + Vector((w - 0.03, 0, 0))]
    parts.append(mesh_object("windscreen", corners, [(0, 1, 2, 3)], mats["glass"]))
    for side in (1, -1):
        parts.append(tube("screen_post", bottom + Vector((side * w, 0, -0.02)), top + Vector((side * (w - 0.03), 0, 0.02)), 0.02, mats["black"]))
    parts.append(tube("screen_top", top + Vector((-w, 0, 0)), top + Vector((w, 0, 0)), 0.02, mats["black"]))
    wiper = tube("wiper", bottom + Vector((0.05, 0.01, 0.03)), bottom + up * 0.42 + Vector((0.2, 0.01, 0)), 0.006, mats["black"], verts=6)
    parts.append(wiper)
    return parts


def cockpit(mats):
    parts = []
    # Driver's saddle on a pedestal, backrest; three-seat bench and its backrest.
    parts.append(box("driver_seat", (0.4, 0.46, 0.1), (0, 0.46, 0.84), mats["vinyl"], bevel=0.035))
    parts.append(box("driver_pedestal", (0.26, 0.3, 0.42), (0, 0.46, 0.58), mats["black"], bevel=0.02))
    parts.append(box("driver_back", (0.34, 0.08, 0.34), (0, 0.24, 1.05), mats["vinyl"], bevel=0.03, rot=(-0.12, 0, 0)))
    parts.append(box("bench", (1.12, 0.5, 0.11), (0, -0.88, 0.69), mats["vinyl"], bevel=0.04))
    parts.append(box("bench_back", (1.12, 0.1, 0.42), (0, -1.15, 0.95), mats["vinyl"], bevel=0.04, rot=(0.16, 0, 0)))
    parts.append(box("floor_mat", (1.15, 1.3, 0.012), (0, 0.06, 0.385), mats["floor"]))
    # Handlebar, column, grips, meter, mirrors.
    parts.append(tube("handlebar", (-0.34, 0.78, 1.15), (0.34, 0.78, 1.15), 0.013, mats["chrome"], verts=12))
    parts.append(tube("column", (0, 0.88, 0.92), (0, 0.79, 1.15), 0.028, mats["black"]))
    for side in (1, -1):
        parts.append(tube("grip", (side * 0.29, 0.78, 1.15), (side * 0.38, 0.78, 1.15), 0.02, mats["rubber"], verts=12))
        parts.append(tube("lever", (side * 0.3, 0.80, 1.16), (side * 0.37, 0.86, 1.15), 0.005, mats["steel"], verts=6))
    meter = cylinder("meter", 0.065, 0.05, (0, 0.85, 1.14), mats["black"], rot=(1.1, 0, 0), verts=24)
    parts.append(meter)
    parts.append(cylinder("meter_face", 0.055, 0.004, (0, 0.833, 1.15), mats["glass"], rot=(1.1, 0, 0), verts=24))
    return parts


def fittings(mats):
    """Lamps, indicators, plates and mirrors, placed on the body surface."""
    parts = []
    for side in (1, -1):
        hit = surface((side * 0.26, 3.0, 0.79), (0, -1, 0))
        if hit:
            loc, n = hit
            bezel = bpy.ops.mesh.primitive_torus_add(major_radius=0.075, minor_radius=0.013, major_segments=28, minor_segments=8, location=loc + n * 0.012)
            bezel = bpy.context.object
            bezel.name = "headlamp_bezel"
            facing(bezel, n)
            bezel.data.materials.append(mats["chrome"])
            lens = bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=8, radius=0.072, location=loc)
            lens = bpy.context.object
            lens.name = "headlamp"
            lens.scale = (1, 1, 0.35)
            facing(lens, n)
            lens.data.materials.append(mats["lamp"])
            parts += [bezel, lens]
        hit = surface((side * 0.44, 3.0, 0.92), (0, -1, 0))
        if hit:
            ind = box("indicator", (0.08, 0.05, 0.035), hit[0] + hit[1] * 0.01, mats["amber"], bevel=0.012)
            facing(ind, hit[1])
            parts.append(ind)
        hit = surface((side * 0.46, -3.0, 0.72), (0, 1, 0))
        if hit:
            tail = box("tail_lamp", (0.09, 0.07, 0.04), hit[0] - Vector((0, 0.01, 0)), mats["tail"], bevel=0.015)
            facing(tail, hit[1])
            parts.append(tail)
        # Mirrors on stalks from the cowl sides.
        base = Vector((side * 0.6, 0.93, 1.07))
        head = Vector((side * 0.74, 0.98, 1.28))
        parts.append(tube("mirror_stalk", base, head, 0.007, mats["chrome"], verts=6))
        mirror = cylinder("mirror", 0.06, 0.018, head + Vector((side * 0.02, 0, 0.03)), mats["black"], rot=(math.pi / 2, 0, 0), verts=20)
        parts.append(mirror)
        parts.append(cylinder("mirror_glass", 0.052, 0.002, head + Vector((side * 0.02, -0.011, 0.03)), mats["chrome"], rot=(math.pi / 2, 0, 0), verts=20))
    for y, z, size, d in ((3.0, 0.645, (0.34, 0.02, 0.08), -1), (-3.0, 0.52, (0.38, 0.02, 0.09), 1)):
        hit = surface((0, y, z), (0, d, 0))
        if hit:
            plate = box("plate", size, hit[0] + hit[1] * 0.012, mats["plate"], bevel=0.004)
            facing(plate, hit[1])
            plate.rotation_quaternion = plate.rotation_quaternion @ Vector((0, 0, 1)).rotation_difference(Vector((0, -1, 0))).inverted()
            parts.append(plate)
    # Bumpers: a steel guard at the front, a black bar at the back.
    parts.append(tube("front_bumper", (-0.48, 1.27, 0.42), (0.48, 1.27, 0.42), 0.018, mats["steel"], verts=12))
    for side in (1, -1):
        parts.append(tube("front_bumper_leg", (side * 0.4, 1.27, 0.42), (side * 0.36, 1.12, 0.54), 0.014, mats["steel"]))
    parts.append(box("rear_bumper", (1.1, 0.05, 0.05), (0, -1.36, 0.37), mats["black"], bevel=0.01))
    # Exhaust under the back, right side.
    parts.append(tube("exhaust", (0.28, -0.9, 0.24), (0.32, -1.42, 0.25), 0.028, mats["steel"], verts=12))
    return parts


def running_gear(mats):
    """Fork, shock absorbers, front mudguard, rear mudguards (static); wheels (separate)."""
    parts = []
    for side in (1, -1):
        parts.append(tube("fork", (side * 0.075, FRONT_AXLE, TYRE_R), (side * 0.06, 0.9, 0.62), 0.02, mats["steel"]))
        parts.append(tube("shock", (side * 0.075, FRONT_AXLE - 0.02, TYRE_R + 0.05), (side * 0.07, 0.94, 0.5), 0.03, mats["black"]))
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.255, depth=0.14, location=(0, FRONT_AXLE, TYRE_R), rotation=(0, math.pi / 2, 0))
    guard = bpy.context.object
    guard.name = "front_mudguard"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bm = bmesh.new()
    bm.from_mesh(guard.data)
    # Keep only the curved side over the top of the wheel and a little down its front (mesh centred on the axle).
    doomed = [f for f in bm.faces if abs(f.normal.x) > 0.5]
    for f in bm.faces:
        c = f.calc_center_median()
        if f not in doomed and (c.z < 0.06 or c.y < -0.15):
            doomed.append(f)
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(guard.data)
    bm.free()
    guard.data.materials.append(mats["paint"])
    s = guard.modifiers.new("solidify", "SOLIDIFY")
    s.thickness = 0.008
    parts.append(guard)
    return parts


def wheel(name, location, mats, mirror=1):
    bpy.ops.mesh.primitive_torus_add(major_radius=TYRE_R - 0.055, minor_radius=0.055, major_segments=36, minor_segments=12, location=(0, 0, 0))
    tyre = bpy.context.object
    tyre.data.materials.append(mats["rubber"])
    tyre.scale = (1, 1, 1.05)
    tyre.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    rim = cylinder("rim", 0.112, 0.1, (0, 0, 0), mats["steel"], rot=(0, math.pi / 2, 0), verts=28)
    dish = cylinder("dish", 0.08, 0.112, (0, 0, 0), mats["steel"], rot=(0, math.pi / 2, 0), verts=28)
    hub = cylinder("hub", 0.042, 0.125, (0, 0, 0), mats["chrome"], rot=(0, math.pi / 2, 0), verts=16)
    nuts = [cylinder("nut", 0.009, 0.135, (0, math.cos(a) * 0.062, math.sin(a) * 0.062), mats["chrome"], rot=(0, math.pi / 2, 0), verts=6) for a in [i * math.pi / 2 for i in range(4)]]
    objs = [tyre, rim, dish, hub, *nuts]
    obj = join(objs, name)
    obj.location = location
    return obj


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        if o.modifiers:
            apply_all(o)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    return obj


def build(paint, levels):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = materials(paint)
    shell = body(mats, levels)
    static = [shell]
    static += canopy(mats)
    static += windscreen(mats)
    static += cockpit(mats)
    static += fittings(mats)  # needs the shell in the scene for ray casts
    static += running_gear(mats)
    for o in static:
        if o is not shell and o.type == "MESH" and o.name.split(".")[0] not in ("windscreen", "rear_window", "meter_face", "mirror_glass"):
            o.data.shade_smooth() if o.name.startswith(("headlamp", "grab", "pillar", "tube", "fork", "shock", "handlebar", "column", "grip", "exhaust", "front_bumper", "canopy", "hoop", "mirror")) else None
    body_obj = join(static, "auto_body")
    wheels = [
        wheel("wheel_front", (0, FRONT_AXLE, TYRE_R), mats),
        wheel("wheel_rear_left", (-REAR_TRACK, REAR_AXLE, TYRE_R), mats),
        wheel("wheel_rear_right", (REAR_TRACK, REAR_AXLE, TYRE_R), mats),
    ]
    for w in wheels:
        w.data.shade_smooth()
    return body_obj, wheels


def triangles():
    total = 0
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            total += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return total


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_extras=False, export_animations=False)
    print(f"AUTO {os.path.basename(path)}: {triangles()} triangles")


# ----------------------------------------------------------------------------- review renders


def render_views(directory):
    os.makedirs(directory, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("haze")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.74, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")))
    sun.data.energy = 4.2
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(52), 0, math.radians(35))
    # Worn asphalt with a kerb, for scale and contact shadows.
    bpy.ops.mesh.primitive_plane_add(size=40)
    ground = bpy.context.object
    m = bpy.data.materials.new("asphalt")
    m.use_nodes = True
    nt = m.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 180
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.05, 0.05, 0.052, 1)
    ramp.color_ramp.elements[1].color = (0.16, 0.16, 0.16, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    bsdf = nt.nodes["Principled BSDF"]
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    ground.data.materials.append(m)
    kerb = box("kerb", (40, 0.22, 0.16), (-2.3, 0, 0.08), material("kerb", (0.7, 0.62, 0.2), 0.8), rot=(0, 0, math.pi / 2))
    kerb.hide_select = True
    cam = link(bpy.data.objects.new("camera", bpy.data.cameras.new("camera")))
    cam.data.lens = 50
    scene.camera = cam
    views = {
        "front_three_quarter": (Vector((3.6, 4.6, 1.55)), Vector((0, 0.1, 0.8))),
        "side": (Vector((5.6, 0.1, 1.05)), Vector((0, 0.1, 0.8))),
        "rear_three_quarter": (Vector((-3.4, -4.5, 1.7)), Vector((0, -0.1, 0.85))),
    }
    for name, (eye, target) in views.items():
        cam.location = eye
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (target - eye).to_track_quat("-Z", "Y")
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 88
        scene.render.filepath = os.path.join(directory, f"auto_{name}.jpg")
        bpy.ops.render.render(write_still=True)
        print("RENDER", scene.render.filepath)


YELLOW = (0.95, 0.6, 0.0)

build(YELLOW, 2)
export(os.path.join(OUT, "auto_rickshaw.glb"))
if RENDER:
    render_views(RENDER)
build(YELLOW, 1)
export(os.path.join(OUT, "auto_rickshaw_lod1.glb"))
