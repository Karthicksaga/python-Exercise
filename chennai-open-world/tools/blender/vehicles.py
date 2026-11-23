"""
Chennai street vehicles, modelled by script in Blender 5.2 LTS: the hatchback (also the police
car and the cab), the commuter motorbike, the ambulance van and the city bus. The script is the
source of the models: running it again rebuilds the same files. The auto-rickshaw has its own
script (`auto_rickshaw.py`).

Run headless (Blender, or the `bpy` Python module):
    blender -b --factory-startup --python tools/blender/vehicles.py -- <out dir> [--only car,bike] [--render <dir>]

Outputs, per vehicle (<name> = hatchback, motorbike, ambulance, bus):
    <name>.glb        detailed, for the player's and parked vehicles
    <name>_lod1.glb   lighter, for traffic
    --render <dir>    Cycles renders (front three-quarter, side, rear three-quarter) for review

Original designs at real proportions, no maker's badge, grille, logo or livery copied (TD-18).
Each body is modelled the way a real car is: one smooth shell lofted through cross-sections and
subdivided, with the wheel arches cut out of it and the doors separated from it along their
seams (so a door is the body's own surface, curvature and window included). Lamps, plates and
mirrors are placed on the surface by ray casting. Every size that the game's physics, riding
poses or door logic depend on (`packages/vehicles/src/specs.ts`) is taken from there: wheel
positions and radii, the driver's hip point, the hands on the grips or steering wheel, the feet,
and each door's hinge and seam.

Frame (Blender): Z up, the front faces +Y, ground at z = 0, centred between the axles in x as the
game's chassis is. Exported with +Y up, so the front faces -Z as the game expects (game
x = Blender x, game z = -Blender y, game y = Blender z + ground). Wheels are separate nodes named
`wheel_*` with their origins on the axle; doors are separate nodes named `door_*` with their
origins on the hinge line.

Materials are named `v_<role>_<what>`; the game groups parts by role (paint, trim, metal, glass,
lamp, tail, decal, board, beaconred, beaconblue) with each material's colour baked into the
vertices, so a vehicle costs one draw call per role. `v_paint_body` takes the livery colour.
`v_decal` parts carry UVs into the game's generated decal atlas (`vehicleDecalTexture`):
number plates (no real registration) and the ambulance lettering.
"""
import math
import os
import sys

import bpy  # first: with the bpy module, bmesh and mathutils load through it
import bmesh
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv and not argv[0].startswith("--") else "assets/models/vehicles")
RENDER = argv[argv.index("--render") + 1] if "--render" in argv else None
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)

# Level of detail being built: 2 detailed, 1 traffic (fewer segments, no subdivision, less interior).
LOD = 2


def seg(n):
    """Segment count for round parts at the current level of detail."""
    return n if LOD >= 2 else max(6, int(n * 0.55))


# Decal atlas cells, (u0, v0, u1, v1) with v up, matching `vehicleDecalTexture` in
# packages/vehicles/src/glbModels.ts (512 x 256 canvas, rows of 64 px from the top).
DECAL = {
    "plate_white": (0.0, 0.75, 0.5, 1.0),
    "plate_yellow": (0.5, 0.75, 1.0, 1.0),
    "ambulance": (0.0, 0.5, 1.0, 0.75),
    "ambulance_mirrored": (0.0, 0.25, 1.0, 0.5),
    "board": (0.0, 0.0, 1.0, 0.25),
}

# ----------------------------------------------------------------------------- materials


def material(name, colour, rough, metal=0.0, coat=0.0, emit=None, alpha=None, transmission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.05
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[0], 1)
        b.inputs["Emission Strength"].default_value = emit[1]
    if alpha is not None:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m


def decal_material():
    """Plates and lettering: an image of the atlas for the review renders (the game draws its own)."""
    m = bpy.data.materials.get("v_decal")
    if m:
        return m
    m = material("v_decal", (1, 1, 1), 0.45)
    img = bpy.data.images.new("decal_atlas", 512, 256)
    px = []
    for j in range(256):
        for i in range(512):
            u, v = i / 512, j / 256
            c = (0.95, 0.95, 0.93)
            if v >= 0.75 and u >= 0.5:
                c = (0.95, 0.75, 0.05)
            elif v < 0.25:
                c = (0.03, 0.03, 0.03)
            # Rough "characters": dark blocks in the plates' middle band (the game draws real text).
            if v >= 0.75 and 0.3 < (v - 0.75) * 4 < 0.7 and (int(u * 512) % 32) < 20 and 0.06 < (u % 0.5) < 0.44:
                c = (0.05, 0.05, 0.05)
            if 0.25 <= v < 0.75 and 0.3 < ((v * 4) % 1) < 0.7 and (int(u * 512) % 52) < 34 and 0.08 < u < 0.92:
                c = (0.75, 0.05, 0.05)
            px += [*c, 1.0]
    img.pixels = px
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    m.node_tree.links.new(tex.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def decal_image(on):
    """Connect (renders) or disconnect (export) the decal atlas image."""
    m = bpy.data.materials.get("v_decal")
    if not m:
        return
    nt = m.node_tree
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
    bsdf = nt.nodes["Principled BSDF"]
    for link_ in list(bsdf.inputs["Base Color"].links):
        nt.links.remove(link_)
    if on and tex:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])


def palette(livery):
    return {
        "body": material("v_paint_body", livery, 0.3, 0.0, coat=1.0),
        "white": material("v_paint_white", (0.86, 0.87, 0.85), 0.32, coat=0.8),
        "red": material("v_paint_red", (0.6, 0.03, 0.04), 0.35, coat=0.6),
        "cream": material("v_paint_cream", (0.8, 0.72, 0.5), 0.4, coat=0.4),
        "amber": material("v_paint_amber", (0.95, 0.42, 0.02), 0.2, emit=((0.6, 0.25, 0.0), 0.2)),
        "yellow": material("v_paint_yellow", (0.95, 0.62, 0.03), 0.35, coat=0.5),
        "frosted": material("v_trim_frosted", (0.72, 0.75, 0.75), 0.35),
        "frame": material("v_paint_frame", (0.02, 0.02, 0.022), 0.35, 0.3),
        "black": material("v_trim_black", (0.018, 0.018, 0.02), 0.55),
        "plastic": material("v_trim_plastic", (0.03, 0.032, 0.035), 0.7),
        "rubber": material("v_trim_rubber", (0.015, 0.015, 0.015), 0.9),
        "seat": material("v_trim_seat", (0.06, 0.055, 0.05), 0.8),
        "fabric": material("v_trim_fabric", (0.16, 0.15, 0.14), 0.95),
        "interior": material("v_trim_interior", (0.09, 0.09, 0.095), 0.85),
        "engine": material("v_trim_engine", (0.12, 0.12, 0.125), 0.5, 0.6),
        "chrome": material("v_metal_chrome", (0.9, 0.9, 0.9), 0.08, 1.0),
        "steel": material("v_metal_steel", (0.5, 0.51, 0.52), 0.32, 0.9),
        "alloy": material("v_metal_alloy", (0.62, 0.63, 0.65), 0.25, 0.85),
        "glass": material("v_glass", (0.12, 0.16, 0.18), 0.04, alpha=0.45, transmission=0.6),
        "lamp": material("v_lamp", (0.95, 0.95, 0.92), 0.05, emit=((1.0, 0.95, 0.8), 0.6)),
        "tail": material("v_tail", (0.55, 0.02, 0.02), 0.12, emit=((0.6, 0.0, 0.0), 0.5)),
        "decal": decal_material(),
        "board": material("v_board", (0.95, 0.6, 0.05), 0.4, emit=((1.0, 0.55, 0.0), 1.0)),
        "beaconred": material("v_beaconred", (0.9, 0.05, 0.05), 0.2, emit=((1.0, 0.05, 0.05), 0.4)),
        "beaconblue": material("v_beaconblue", (0.05, 0.2, 0.9), 0.2, emit=((0.05, 0.2, 1.0), 0.4)),
    }


# ----------------------------------------------------------------------------- mesh helpers


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, verts, faces, mat, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    obj = link(bpy.data.objects.new(name, me))
    obj.data.materials.append(mat)
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uvs[me.loops[li].vertex_index]
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return obj


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


def inset_ends(rings, steps=(0.62, 0.28)):
    """
    Close a body's ends with rings shrinking towards each end's centre (flat, at the end's y), so
    the end panels are quads that subdivide and shade cleanly instead of one many-sided face.
    """
    def shrunk(ring_, k):
        c = sum(ring_, Vector()) / len(ring_)
        return [c + (v - c) * k for v in ring_]
    head = [shrunk(rings[0], k) for k in reversed(steps)]
    tail = [shrunk(rings[-1], k) for k in steps]
    return head + list(rings) + tail


def lathe(name, profile, mat, segments, axis="X"):
    """Revolve [(radius, along)] round an axis (X for wheels). Open ends where radius > 0."""
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        c, s = math.cos(a), math.sin(a)
        if axis == "X":
            rings.append([Vector((t, r * c, r * s)) for r, t in profile])
        elif axis == "Y":
            rings.append([Vector((r * c, t, r * s)) for r, t in profile])
        else:
            rings.append([Vector((r * c, r * s, t)) for r, t in profile])
    n = len(profile)
    verts = [v for ring in rings for v in ring]
    faces = []
    for i in range(segments):
        for j in range(n - 1):
            a, b = i * n + j, ((i + 1) % segments) * n + j
            faces.append((a, b, b + 1, a + 1))
    return mesh_object(name, verts, faces, mat)


def subsurf(obj, levels):
    if levels <= 0:
        return None
    mod = obj.modifiers.new("subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    return mod


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def cutter(name, size, centre, cylinder=None, rot=(0, math.pi / 2, 0)):
    if cylinder:
        radius, depth = cylinder
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg(36), radius=radius, depth=depth, location=centre, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
        bpy.context.object.scale = size
        bpy.ops.object.transform_apply(scale=True)
    obj = bpy.context.object
    obj.name = name
    obj.hide_render = True
    return obj


def boolean(target, tool, op="DIFFERENCE"):
    mod = target.modifiers.new("cut_" + tool.name, "BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = tool


def box(name, size, centre, mat, bevel=0.0, rot=(0, 0, 0), segments=1):
    """A box; rounded edges (`bevel`) only where they show: small ones are dropped, and all but the
    biggest at the traffic level of detail (a bevelled box is 44 to 188 triangles, a plain one 12)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel >= 0.012 and (LOD >= 2 or bevel >= 0.03):
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments if LOD >= 2 else 1
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, centre, mat, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg(verts), radius=radius, depth=depth, location=centre, rotation=rot)
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


def path_tube(name, points, radius, mat, verts=10):
    """A bent tube through points (exhausts, frames, grab rails): one ring per point."""
    pts = [Vector(p) for p in points]
    rings = []
    n = seg(verts)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        q = Vector((0, 0, 1)).rotation_difference(d)
        rings.append([p + q @ Vector((radius * math.cos(2 * math.pi * k / n), radius * math.sin(2 * math.pi * k / n), 0)) for k in range(n)])
    return loft(name, rings, mat, caps=(True, True))


def sphere(name, radius, centre, mat, scale=(1, 1, 1), segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg(segments), ring_count=max(4, seg(rings)), radius=radius, location=centre)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def quad(name, centre, normal, width, height, mat, uv=None, up=Vector((0, 0, 1))):
    """A flat rectangle facing `normal` (a plate or lettering); `uv` is a DECAL cell."""
    n = Vector(normal).normalized()
    right = up.cross(n).normalized() if abs(n.dot(up)) < 0.95 else Vector((1, 0, 0))
    upv = n.cross(right).normalized()
    c = Vector(centre)
    hw, hh = width / 2, height / 2
    verts = [c - right * hw - upv * hh, c + right * hw - upv * hh, c + right * hw + upv * hh, c - right * hw + upv * hh]
    uvs = None
    if uv:
        u0, v0, u1, v1 = uv
        uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    obj = mesh_object(name, verts, [(0, 1, 2, 3)], mat, uvs)
    # mesh_object recalculates normals for a closed mesh only; a single quad keeps this winding.
    if obj.data.polygons[0].normal.dot(n) < 0:
        obj.data.flip_normals()
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


def surface(origin, direction, only=None):
    """First hit on the scene along a ray: (location, normal) or None."""
    dg = bpy.context.evaluated_depsgraph_get()
    o, d = Vector(origin), Vector(direction).normalized()
    for _ in range(8):
        hit, loc, normal, _i, obj, _m = bpy.context.scene.ray_cast(dg, o, d)
        if not hit:
            return None
        if only is None or obj == only:
            return (loc, normal)
        o = loc + d * 0.002
    return None


def facing(obj, normal, roll=None):
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(normal)


def fine(obj):
    """Keep a small part only at the detailed level (removed from the traffic model)."""
    if LOD >= 2 or obj is None:
        return obj
    bpy.data.objects.remove(obj)
    return None


def join(objs, name):
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    for o in objs:
        if o.modifiers:
            apply_all(o)
    if os.environ.get("VEH_DEBUG") and len(objs) > 4:
        tally = {}
        for o in objs:
            k = o.name.split(".")[0]
            tally[k] = tally.get(k, 0) + triangles([o])
        print("PARTS", name, sorted(tally.items(), key=lambda kv: -kv[1])[:25])
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    # Rotations and scales into the mesh: exported nodes carry only a translation.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def set_origin(obj, point):
    """Move the object's origin to `point` without moving its mesh (hinges, axles)."""
    p = Vector(point)
    obj.data.transform(Matrix.Translation(obj.location - p))
    obj.location = p


def mat_index(obj, mat):
    mats = obj.data.materials
    for i, m in enumerate(mats):
        if m == mat:
            return i
    mats.append(mat)
    return len(mats) - 1


def bisect(obj, plane_co, plane_no):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane_co, plane_no=plane_no)
    bm.to_mesh(obj.data)
    bm.free()


def paint_faces(obj, mat, test):
    """Give `mat` to every face whose (centre, normal) passes `test`."""
    idx = mat_index(obj, mat)
    for p in obj.data.polygons:
        if test(p.center, p.normal):
            p.material_index = idx


def separate(obj, name, test):
    """Split off the faces passing `test` into a new object (a door), returning it."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    keep = bmesh.new()
    keep.from_mesh(obj.data)
    doomed = [f for f in bm.faces if not test(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    gone = [f for f in keep.faces if test(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(keep, geom=gone, context="FACES")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    keep.to_mesh(obj.data)
    keep.free()
    for m in obj.data.materials:
        me.materials.append(m)
    part = link(bpy.data.objects.new(name, me))
    part.location = obj.location
    return part


def wheel_node(name, parts, location):
    w = join(parts, name)
    for p in w.data.polygons:
        p.use_smooth = True
    w.location = location
    return w


# ----------------------------------------------------------------------------- wheels


def tyre(radius, width, mat, sidewall=0.38, segments=24):
    """A tyre with rounded shoulders and a tread band: revolved profile, open at the rim."""
    hw = width / 2
    rim_r = radius * (1 - sidewall)
    if LOD >= 2:
        prof = [
            (rim_r, -hw * 0.86),
            (rim_r + (radius - rim_r) * 0.45, -hw),
            (radius - 0.022, -hw * 0.97),
            (radius, -hw * 0.55),
            (radius, hw * 0.55),
            (radius - 0.022, hw * 0.97),
            (rim_r + (radius - rim_r) * 0.45, hw),
            (rim_r, hw * 0.86),
        ]
        return lathe("tyre", prof, mat, segments)
    prof = [(rim_r, -hw * 0.9), (radius - 0.02, -hw), (radius, 0.0), (radius - 0.02, hw), (rim_r, hw * 0.9)]
    return lathe("tyre", prof, mat, max(10, segments // 2))


def car_wheel(name, location, radius, width, m, spokes=5, steel=False):
    """Tyre, rim (alloy spokes, or a steel disc with a hub and nuts), brake disc. Rim face on +X."""
    hw = width / 2
    rim_r = radius * 0.62
    face = hw * 0.75
    metal = m["steel"] if steel else m["alloy"]
    parts = [tyre(radius, width, m["rubber"], segments=24 if radius < 0.45 else 28)]
    if LOD < 2:
        # Traffic: the tyre and a flat wheel face (spokes or the disc suggested by a darker hub).
        parts.append(lathe("rim", [(rim_r + 0.01, face), (rim_r * 0.3, face - 0.01), (0.0001, face)], metal, 10))
        return wheel_node(name, parts, location)
    # Rim barrel and lip.
    parts.append(lathe("rim", [(rim_r + 0.012, face), (rim_r, face - 0.01), (rim_r - 0.008, -hw * 0.8)], metal, 20))
    if steel:
        # Pressed steel disc, a raised hub and wheel nuts.
        parts.append(lathe("disc", [(rim_r - 0.004, face - 0.012), (rim_r * 0.7, face - 0.03), (rim_r * 0.32, face - 0.005), (0.0001, face - 0.005)], m["steel"], 20))
        parts.append(lathe("hub", [(rim_r * 0.28, face - 0.004), (rim_r * 0.24, face + 0.035), (0.0001, face + 0.04)], m["chrome"], 12))
        nuts = 8 if radius > 0.45 else 5
        for i in range(nuts):
            a = 2 * math.pi * i / nuts
            parts.append(cylinder("nut", 0.012, 0.03, (face + 0.01, math.cos(a) * rim_r * 0.4, math.sin(a) * rim_r * 0.4), m["chrome"], rot=(0, math.pi / 2, 0), verts=6))
    else:
        # Spokes from a small hub to the rim, a centre cap with no badge, the dark barrel behind.
        parts.append(lathe("hub", [(rim_r * 0.26, face - 0.02), (rim_r * 0.22, face + 0.006), (0.0001, face + 0.01)], m["alloy"], 10))
        for i in range(spokes):
            a = 2 * math.pi * i / spokes
            mid = rim_r * 0.6
            s = box("spoke", (0.022, rim_r * 0.78, 0.05), (face - 0.008, math.cos(a) * mid, math.sin(a) * mid), m["alloy"])
            s.rotation_euler = (a, 0, 0)
            parts.append(s)
        parts.append(cylinder("dark", rim_r - 0.002, 0.004, (face - 0.035, 0, 0), m["black"], rot=(0, math.pi / 2, 0), verts=16))
        # Brake disc behind the spokes.
        parts.append(cylinder("brake", rim_r * 0.78, 0.02, (-hw * 0.1, 0, 0), m["steel"], rot=(0, math.pi / 2, 0), verts=16))
    return wheel_node(name, parts, location)


# ----------------------------------------------------------------------------- shared body work


def ring(y, wl, zb, zbelt, zt, wt, rb=0.08, rt=0.12, flare=0.0):
    """
    One cross-section of a car body at y: lower body half width `wl` from the sill `zb` to the
    shoulder `zbelt`, then the glasshouse leaning in to half width `wt` at the roof `zt`, with
    rounded corners. 22 points, anticlockwise seen from the front.
    """
    mid = zb + (zbelt - zb) * 0.55
    sh = max(zbelt + 0.012, min(zt - rt * 1.2, zbelt + 0.04))
    gl = zbelt + (zt - rt - zbelt) * 0.5
    half = [
        (0.0, zb),
        (wl - rb, zb),
        (wl - rb * 0.2, zb + rb * 0.25),
        (wl, mid),
        (wl + flare, zbelt - 0.06),
        (wl - 0.006, zbelt),
        (wl - 0.03, sh),
        (wt + (wl - 0.03 - wt) * 0.45, max(sh + 0.005, gl)),
        (wt, max(sh + 0.01, zt - rt)),
        (wt - rt * 0.35, zt - rt * 0.3),
        (wt - rt, zt),
        (0.0, zt),
    ]
    pts = half + [(-x, z) for x, z in reversed(half[1:-1])]
    return [Vector((x, y, z)) for x, z in pts]


def interior_liner(name, x, y0, y1, z0, zbelt, zroof, mat, xroof=None, yroof=None):
    """Dark inside of a closed body: floor, walls up to the waist, end walls and headliner, facing in."""
    xr = xroof if xroof is not None else x
    r0, r1 = yroof if yroof is not None else (y0, y1)
    v = [
        (-x, y0, z0), (x, y0, z0), (x, y1, z0), (-x, y1, z0),
        (-x, y0, zbelt), (x, y0, zbelt), (x, y1, zbelt), (-x, y1, zbelt),
        (-xr, r0, zroof), (xr, r0, zroof), (xr, r1, zroof), (-xr, r1, zroof),
    ]
    f = [
        (0, 3, 2, 1),  # floor, facing up
        (1, 2, 6, 5),  # right wall, facing in (-x)
        (0, 4, 7, 3),  # left wall
        (0, 1, 5, 4),  # back wall, facing forward
        (3, 7, 6, 2),  # front wall, facing back
        (8, 9, 10, 11),  # headliner, facing down
    ]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], f)
    me.update()
    obj = link(bpy.data.objects.new(name, me))
    obj.data.materials.append(mat)
    # Make every face point into the box.
    centre = Vector((0, (y0 + y1) / 2, (z0 + zroof) / 2))
    for p in me.polygons:
        if (centre - p.center).dot(p.normal) < 0:
            p.flip()
    return obj


def seat(name, x, y, z_cushion, width, m, depth=0.5, back=0.62, recline=0.22, headrest=True):
    """A car seat: cushion top at z_cushion, front edge at y + depth/2, backrest leaning back."""
    parts = [box(name + "_cushion", (width, depth, 0.13), (x, y, z_cushion - 0.065), m["seat"], bevel=0.035)]
    by = y - depth / 2 + 0.04
    b = box(name + "_back", (width * 0.96, 0.12, back), (x, by - math.sin(recline) * back / 2, z_cushion + math.cos(recline) * back / 2), m["seat"], bevel=0.035)
    b.rotation_euler = (recline, 0, 0)
    parts.append(b)
    if headrest:
        top = Vector((x, by - math.sin(recline) * back, z_cushion + math.cos(recline) * back))
        h = box(name + "_head", (width * 0.55, 0.09, 0.17), top + Vector((0, -0.03, 0.1)), m["seat"], bevel=0.03)
        h.rotation_euler = (recline, 0, 0)
        parts.append(h)
    return parts


def steering_wheel(centre, radius, tilt, m):
    """Rim, three spokes and a boss in a plane tilted `tilt` from vertical towards the driver."""
    c = Vector(centre)
    rot = (math.pi / 2 - tilt, 0, 0)  # plane normal pointing back (-y) and up
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.016, major_segments=seg(24), minor_segments=6, location=c, rotation=rot)
    rim = bpy.context.object
    rim.data.materials.append(m["plastic"])
    normal = Matrix.Rotation(rot[0], 3, "X") @ Vector((0, 0, 1))
    boss = cylinder("boss", 0.055, 0.05, c - normal * 0.01, m["plastic"], verts=20)
    boss.rotation_euler = rot
    parts = [rim, boss]
    down = Matrix.Rotation(rot[0], 3, "X") @ Vector((0, -1, 0))
    for ax in (Vector((1, 0, 0)), Vector((-1, 0, 0)), down):
        parts.append(tube("spoke", c, c + ax * radius * 0.95, 0.012, m["plastic"], verts=6))
    # Column down to the dashboard.
    parts.append(tube("column", c - normal * 0.02, c - normal * 0.32 + Vector((0, 0.05, -0.05)), 0.03, m["plastic"], verts=10))
    return parts


def make_doors(shell, doors, handles, m, z_card0, z_card1):
    """
    Cut the doors out of the body along their seams: each takes the shell's own faces (paint and
    window), plus a trim card inside (seen when it's open) and its handle from `handles`. Only at
    the detailed level: traffic never opens a door, so there they stay part of the body.
    `doors` maps a node name to (face test, hinge (x, y)).
    """
    if LOD < 2:
        return []
    out = []
    for name, (test, hinge) in doors.items():
        d = separate(shell, name, test)
        # The card lines the panel below the window (the window frame leans in above it).
        xs = [v.co.x for v in d.data.vertices if v.co.z < z_card1]
        ys = [v.co.y for v in d.data.vertices]
        sx = 1 if hinge[0] > 0 else -1
        inner = (min(xs) if sx > 0 else max(xs)) - sx * 0.012
        y0, y1 = min(ys), max(ys)
        card = box(name + "_card", (0.02, y1 - y0 - 0.06, z_card1 - z_card0 - 0.04), (inner, (y0 + y1) / 2, (z_card0 + z_card1) / 2), m["interior"])
        mine = [h for h in handles if h.location.x * sx > 0 and y0 < h.location.y < y1]
        for h in mine:
            handles.remove(h)
        out.append((join([d, card, *mine], name), hinge))
    return out


def finish_doors(door_objs):
    """Doors' origins on their hinge lines, so the game can swing them."""
    for d, hinge in door_objs:
        set_origin(d, (hinge[0], hinge[1], 0))


# ----------------------------------------------------------------------------- hatchback

# From packages/vehicles/src/specs.ts (car): wheels at x ±0.74, z ∓1.25, radius 0.32; the
# ground 0.74 m below the chassis centre (wheel y -0.12, settled suspension 0.3, radius 0.32).
CAR_GROUND = 0.74
CAR_AXLE = 1.25
CAR_TRACK = 0.74
CAR_TYRE = 0.32
# Driver's hip point (0.36, -0.03, 0.1) and hands (±0.17, 0.3, -0.42) from it: wheel rim through
# both palms. Doors: driver's hinge x 0.845, z -0.55 to the seam z 0.5; rear doors 0.5 to 1.45.
CAR_HIP = Vector((0.36, -0.1, 0.71))
CAR_WHEEL_CENTRE = Vector((0.36, 0.32, 1.01))
CAR_SEAMS = (0.55, -0.5, -1.45)  # Blender y of the front door's hinge edge, the B pillar, the rear doors' back edge
CAR_DOOR_Z = (0.30, 1.535)


def hatchback(m):
    """A tall-boy hatchback: 3.9 m long, 1.66 m wide, 1.62 m tall, 2.5 m wheelbase."""
    sections = [
        # y, lower half width, sill, shoulder, roof, roof half width, lower round, roof round
        (-1.955, 0.70, 0.36, 0.80, 0.86, 0.62, 0.10, 0.10),
        (-1.94, 0.79, 0.27, 0.93, 1.02, 0.68, 0.09, 0.10),
        (-1.90, 0.815, 0.24, 0.97, 1.33, 0.665, 0.08, 0.11),
        (-1.83, 0.825, 0.22, 0.985, 1.54, 0.655, 0.08, 0.12),
        (-1.66, 0.83, 0.215, 0.99, 1.605, 0.65, 0.08, 0.12),
        (-1.20, 0.835, 0.215, 0.99, 1.62, 0.65, 0.08, 0.12),
        (-0.40, 0.835, 0.215, 0.985, 1.625, 0.65, 0.08, 0.12),
        (0.12, 0.835, 0.215, 0.98, 1.615, 0.655, 0.08, 0.11),
        (0.42, 0.835, 0.215, 0.98, 1.47, 0.68, 0.08, 0.09),
        (0.78, 0.83, 0.22, 0.975, 1.22, 0.73, 0.08, 0.08),
        (1.06, 0.825, 0.225, 0.965, 1.02, 0.775, 0.08, 0.06),
        (1.40, 0.815, 0.23, 0.925, 0.975, 0.775, 0.08, 0.08),
        (1.70, 0.80, 0.25, 0.85, 0.91, 0.74, 0.09, 0.09),
        (1.87, 0.76, 0.28, 0.75, 0.81, 0.68, 0.10, 0.09),
        (1.945, 0.67, 0.33, 0.62, 0.69, 0.58, 0.10, 0.08),
    ]
    shell = loft("car_shell", inset_ends([ring(*s) for s in sections]), m["body"], caps=(True, True))
    subsurf(shell, 1 if LOD >= 2 else 0)
    apply_all(shell)
    # Wheel arches: a short cylinder each side at each axle (not through the floor).
    cuts = []
    for y in (CAR_AXLE, -CAR_AXLE):
        for side in (1, -1):
            cuts.append(cutter(f"arch{side}{y}", None, (side * 0.86, y, CAR_TYRE), cylinder=(0.375, 0.42)))
    for c in cuts:
        boolean(shell, c)
    apply_all(shell)
    for c in cuts:
        bpy.data.objects.remove(c)
    # Arch liners: the cutters' own faces, inside the arches.
    def in_arch(c, n):
        for y in (CAR_AXLE, -CAR_AXLE):
            if math.hypot(c.y - y, c.z - CAR_TYRE) < 0.372 and abs(c.x) < 0.81 and abs(n.x) < 0.6:
                return True
        return False
    paint_faces(shell, m["black"], in_arch)
    # Seams: cut the panels along the door edges, with a dark 12 mm groove each side.
    front, bpil, back = CAR_SEAMS
    z0, z1 = CAR_DOOR_Z
    for y in (front, bpil, back) if LOD >= 2 else ():  # traffic: no seams, the doors stay in the body
        for d in (-0.006, 0.006):
            bisect(shell, (0, y + d, 0), (0, 1, 0))
    for z in (z0, z1) if LOD >= 2 else ():
        for d in (-0.006, 0.006):
            bisect(shell, (0, 0, z + d), (0, 0, 1))
    bisect(shell, (0, 0, 0.45), (0, 0, 1))  # top edge of the black bumper lips
    side = lambda c, n: abs(n.x) > 0.3 and abs(c.x) > 0.45
    def groove(c, n):
        if not side(c, n) or not (z0 - 0.007 < c.z < z1 + 0.007) or not (back - 0.007 < c.y < front + 0.007):
            return False
        return min(abs(c.y - front), abs(c.y - bpil), abs(c.y - back)) < 0.006 or min(abs(c.z - z0), abs(c.z - z1)) < 0.006
    # Windows: the front side window behind the A pillar, the rear door's, a quarter light; the
    # windscreen and the hatch glass. Pillars stay painted; the B pillar is black.
    def roof_half(y):
        """The glasshouse's half width at y, between the sections either side."""
        for a, b in zip(sections, sections[1:]):
            if a[0] <= y <= b[0]:
                t = (y - a[0]) / (b[0] - a[0])
                return a[5] + (b[5] - a[5]) * t
        return sections[-1][5]
    def a_line(z):
        return 1.05 - (z - 1.0) * 1.55
    def glass(c, n):
        if abs(n.x) > 0.5:
            if not (1.01 < c.z < 1.50):
                return False
            if -0.46 < c.y < a_line(c.z) - 0.06:
                return True
            if -1.40 < c.y < -0.54:
                return True
            return -1.76 < c.y < -1.52 and c.z < 1.42
        if 0.16 < c.y < 1.04 and c.z > 1.0 and abs(c.x) < roof_half(c.y) - 0.085:
            return True
        return c.y < -1.84 and 1.07 < c.z < 1.5 and abs(c.x) < 0.56
    paint_faces(shell, m["glass"], glass)
    paint_faces(shell, m["black"], lambda c, n: abs(n.x) > 0.5 and 1.0 < c.z < 1.52 and -0.56 < c.y < -0.44)
    paint_faces(shell, m["black"], groove)
    # Bumpers: lower front and rear in unpainted black plastic, with a body-colour upper half.
    paint_faces(shell, m["plastic"], lambda c, n: (c.y > 1.78 or c.y < -1.9) and c.z < 0.45)
    paint_faces(shell, m["plastic"], lambda c, n: abs(n.x) > 0.5 and c.z < 0.33)  # side skirts
    smooth(shell, 35)
    # Doors: the driver's (right front) and both rear doors open in the game; the left front is
    # fixed (no seat-side passenger), but has the same seams.
    def door_test(sx, ya, yb):
        return lambda c, n: side(c, n) and c.x * sx > 0 and ya + 0.007 < c.y < yb - 0.007 and z0 + 0.007 < c.z < z1 - 0.007
    doors = {
        "door_fr": (door_test(1, bpil, front), (0.845, front)),
        "door_rl": (door_test(-1, back, bpil), (-0.845, bpil)),
        "door_rr": (door_test(1, back, bpil), (0.845, bpil)),
    }
    # Handles: one near the back edge of each side door, at the same height.
    handles = []
    for sx in (1, -1):
        for y in (front - 0.82, bpil - 0.8):
            hit = surface((sx * 2, y, 0.93), (-sx, 0, 0), only=shell)
            if hit:
                handles.append(box("handle", (0.022, 0.15, 0.03), hit[0] + hit[1] * 0.006, m["black"], bevel=0.012))
    door_objs = make_doors(shell, doors, handles, m, z0, 0.98)
    parts = [shell] + handles
    parts += car_fittings(m)
    parts += car_interior(m)
    body = join(parts, "car_body")
    finish_doors(door_objs)
    wheels = [
        car_wheel("wheel_fl", (-CAR_TRACK, CAR_AXLE, CAR_TYRE), CAR_TYRE, 0.19, m),
        car_wheel("wheel_fr", (CAR_TRACK, CAR_AXLE, CAR_TYRE), CAR_TYRE, 0.19, m),
        car_wheel("wheel_rl", (-CAR_TRACK, -CAR_AXLE, CAR_TYRE), CAR_TYRE, 0.19, m),
        car_wheel("wheel_rr", (CAR_TRACK, -CAR_AXLE, CAR_TYRE), CAR_TYRE, 0.19, m),
    ]
    return body


def car_fittings(m):
    parts = []
    body = bpy.data.objects["car_shell"]
    # Headlamps: swept-back clusters at the front corners, a chrome reflector behind a clear lens.
    for sx in (1, -1):
        hit = surface((sx * 0.55, 3, 0.80), (0, -1, 0), only=body)
        if hit:
            loc, n = hit
            yaw = -math.atan2(n.x, n.y)
            # Smoked housing, a chrome reflector band, and two lamp units (low and high beam).
            housing = box("headlamp_housing", (0.36, 0.1, 0.12), loc - n * 0.03, m["chrome"], bevel=0.035)
            housing.rotation_euler = (0, 0, yaw)
            parts.append(housing)
            ax = Vector((math.cos(yaw), math.sin(yaw), 0))
            reflector = box("headlamp_reflector", (0.33, 0.1, 0.03), loc - n * 0.022 + Vector((0, 0, -0.035)), m["chrome"], bevel=0.01)
            reflector.rotation_euler = (0, 0, yaw)
            parts.append(reflector)
            for k, off in enumerate((-0.085, 0.07)):
                u = cylinder("headlamp", 0.046 if k == 0 else 0.04, 0.03, loc - n * 0.005 + ax * off * sx * -1 + Vector((0, 0, 0.012)), m["lamp"], verts=16)
                facing(u, n)
                parts.append(u)
            ind = box("indicator", (0.07, 0.06, 0.05), loc + Vector((sx * 0.16, -0.06, -0.01)) - n * 0.01, m["amber"], bevel=0.015)
            ind.rotation_euler = (0, 0, -math.atan2(n.x, n.y))
            parts.append(ind)
        # Fog lamp in the bumper.
        hit = surface((sx * 0.58, 3, 0.42), (0, -1, 0), only=body)
        if hit:
            f = cylinder("fog", 0.035, 0.03, hit[0] - hit[1] * 0.005, m["lamp"], verts=14)
            facing(f, hit[1])
            parts.append(fine(f))
            ring_ = cylinder("fog_ring", 0.05, 0.02, hit[0] - hit[1] * 0.012, m["black"], verts=14)
            facing(ring_, hit[1])
            parts.append(fine(ring_))
        # Tail lamps: tall clusters up the sides of the hatch.
        hit = surface((sx * 0.66, -3, 1.05), (0, 1, 0), only=body)
        if hit:
            loc, n = hit
            t = box("tail_lamp", (0.15, 0.08, 0.3), loc - n * 0.02, m["tail"], bevel=0.025, segments=2)
            t.rotation_euler = (0, 0, -math.atan2(n.x, n.y) + math.pi)
            parts.append(t)
            r = box("reverse_lamp", (0.1, 0.07, 0.06), loc - n * 0.018 + Vector((0, 0, -0.17)), m["lamp"], bevel=0.015)
            r.rotation_euler = t.rotation_euler
            parts.append(fine(r))
        # Side indicator repeater on the front wing.
        hit = surface((sx * 2, 1.45, 0.84), (-sx, 0, 0), only=body)
        if hit:
            s = box("repeater", (0.01, 0.06, 0.025), hit[0], m["amber"], bevel=0.004)
            parts.append(fine(s))
        # Door mirrors at the foot of the A pillar (on the body, ahead of the door's hinge).
        base = Vector((sx * 0.83, 0.66, 1.06))
        housing = box("mirror", (0.09, 0.15, 0.11), base + Vector((sx * 0.11, 0.0, 0.02)), m["body"], bevel=0.035, segments=2)
        housing.rotation_euler = (0, 0, sx * -0.12)
        parts.append(housing)
        parts.append(box("mirror_arm", (0.1, 0.06, 0.03), base + Vector((sx * 0.04, 0.0, -0.01)), m["plastic"], bevel=0.01))
        g = box("mirror_glass", (0.08, 0.005, 0.085), base + Vector((sx * 0.115, -0.077, 0.02)), m["chrome"])
        g.rotation_euler = (0, 0, sx * -0.12)
        parts.append(fine(g))
    # Grille: a dark slatted opening between the headlamps, and a lower intake.
    hit = surface((0, 3, 0.70), (0, -1, 0), only=body)
    if hit:
        g = box("grille", (0.72, 0.06, 0.12), hit[0] - hit[1] * 0.02, m["black"], bevel=0.02)
        parts.append(g)
        for k in range(3 if LOD >= 2 else 0):
            parts.append(box("slat", (0.68, 0.02, 0.012), hit[0] + Vector((0, 0.012, -0.04 + k * 0.04)), m["chrome"] if k == 1 else m["plastic"]))
    hit = surface((0, 3, 0.40), (0, -1, 0), only=body)
    if hit:
        parts.append(box("intake", (0.9, 0.05, 0.1), hit[0] - hit[1] * 0.018, m["black"], bevel=0.015))
    # Number plates (white private plates, no real registration).
    for y, z, d in ((3, 0.56, -1), (-3, 0.78, 1)):
        hit = surface((0, y, z), (0, d, 0), only=body)
        if hit:
            parts.append(quad("plate", hit[0] + hit[1] * 0.006, hit[1], 0.42, 0.105, m["decal"], DECAL["plate_white"]))
            parts.append(box("plate_back", (0.44, 0.01, 0.12), hit[0] + hit[1] * 0.001, m["black"]))
    # Rear wiper, hatch handle, a high stop lamp.
    hit = surface((0, -3, 0.9), (0, 1, 0), only=body)
    if hit:
        parts.append(fine(box("hatch_handle", (0.2, 0.03, 0.03), hit[0] + hit[1] * 0.01, m["chrome"], bevel=0.008)))
    parts.append(box("stop_lamp", (0.3, 0.05, 0.03), (0, -1.86, 1.535), m["tail"], bevel=0.01))
    parts.append(fine(tube("rear_wiper", (0.0, -1.91, 1.12), (0.28, -1.88, 1.33), 0.007, m["black"], verts=6)))
    # Windscreen wipers at the foot of the glass.
    for x in (-0.05, 0.45):
        parts.append(tube("wiper", (x, 1.02, 1.04), (x - 0.42, 0.92, 1.12), 0.007, m["black"], verts=6))
    # Roof antenna, exhaust tip, fuel flap.
    parts.append(fine(tube("antenna", (0, -1.4, 1.62), (0, -1.6, 1.78), 0.005, m["black"], verts=6)))
    parts.append(tube("exhaust", (-0.45, -1.7, 0.25), (-0.45, -1.99, 0.25), 0.025, m["steel"], verts=12))
    hit = surface((-2, -1.62, 0.9), (1, 0, 0), only=body)
    if hit:
        f = cylinder("fuel_flap", 0.07, 0.006, hit[0], m["black"], verts=16)
        facing(f, hit[1])
        parts.append(fine(f))
    # Underside: a dark floor pan so the road doesn't show through between the sills.
    parts.append(box("underbody", (1.5, 3.4, 0.02), (0, 0, 0.22), m["black"]))
    return parts


def car_interior(m):
    """What shows through the glass and the open doors: liner, seats, dashboard, steering wheel."""
    parts = [interior_liner("cabin", 0.79, -1.86, 1.02, 0.44, 0.97, 1.585, m["interior"], xroof=0.6, yroof=(-1.7, 0.2))]
    cushion = CAR_HIP.z - 0.1
    parts += seat("driver", CAR_HIP.x, CAR_HIP.y + 0.05, cushion, 0.5, m)
    parts += seat("passenger", -CAR_HIP.x, CAR_HIP.y + 0.05, cushion, 0.5, m)
    parts += seat("bench", 0, -1.02, cushion - 0.02, 1.36, m, depth=0.48, back=0.56, recline=0.28, headrest=LOD >= 2)
    # Dashboard: a padded slab under the windscreen, an instrument hood over the wheel.
    parts.append(box("dash", (1.56, 0.42, 0.24), (0, 0.86, 0.94), m["plastic"], bevel=0.06, segments=2))
    parts.append(box("hood", (0.42, 0.18, 0.06), (CAR_HIP.x, 0.66, 1.08), m["plastic"], bevel=0.03))
    parts.append(box("console", (0.24, 0.6, 0.3), (0, 0.4, 0.62), m["plastic"], bevel=0.04))
    parts += steering_wheel(CAR_WHEEL_CENTRE, 0.175, math.radians(24), m)
    if LOD >= 2:
        parts.append(tube("gear_lever", (0, 0.3, 0.76), (0, 0.24, 0.92), 0.01, m["chrome"], verts=8))
        parts.append(sphere("gear_knob", 0.025, (0, 0.24, 0.93), m["plastic"], segments=10, rings=6))
        # Pedals where the feet rest (ankles 0.12 m either side of the hips, 0.78 m ahead).
        for x in (0.24, 0.48):
            p = box("pedal", (0.07, 0.025, 0.1), (x, 0.8, 0.5), m["rubber"], bevel=0.01)
            p.rotation_euler = (-0.5, 0, 0)
            parts.append(p)
        parts.append(box("mirror_inside", (0.22, 0.03, 0.06), (0, 0.18, 1.5), m["plastic"], bevel=0.015))
    return parts


# ----------------------------------------------------------------------------- motorbike

# From specs.ts (bike): wheels at z -0.72 and 0.68, radius 0.3; the ground 0.62 m below the
# chassis centre. Grips at (±0.33, 0.52, -0.42), footpegs at (±0.24, -0.265, 0.12) and the
# rider's hips at (0, 0.345, 0.2) in the game's frame (ridingPose.test.ts checks them).
BIKE_FRONT = 0.72
BIKE_REAR = -0.68
BIKE_TYRE = 0.3
BIKE_GRIP = Vector((0.33, 0.42, 1.14))
BIKE_PEG = Vector((0.24, -0.12, 0.355))
BIKE_HEAD = Vector((0.0, 0.5, 0.98))  # top of the steering head


def oval(y, w, zb, zt, n=12, square=0.35):
    """A rounded cross-section at y (superellipse), half width w, from zb to zt: n points."""
    zc, h = (zb + zt) / 2, (zt - zb) / 2
    pts = []
    e = 2 / (2 + square * 4)
    for k in range(n):
        a = 2 * math.pi * k / n
        c, s = math.cos(a), math.sin(a)
        pts.append(Vector((math.copysign(abs(c) ** e, c) * w, y, zc + math.copysign(abs(s) ** e, s) * h)))
    return pts


def arc_strip(name, cy, cz, r, a0, a1, half_w, mat, thick=0.012, n=14, x=0.0):
    """A curved strip round an axle (mudguards): angles from +Y towards +Z, radians."""
    rings = []
    steps = seg(n)
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        d = Vector((0, math.cos(a), math.sin(a)))
        p = Vector((x, cy, cz)) + d * r
        q = p + d * thick
        rings.append([p + Vector((-half_w, 0, 0)), p + Vector((half_w, 0, 0)), q + Vector((half_w, 0, 0)), q + Vector((-half_w, 0, 0))])
    return loft(name, rings, mat, caps=(True, True))


def spoked_wheel(name, location, radius, width, m, hub_r=0.065, spokes=36):
    """A commuter bike's wheel: tyre, steel rim, a drum hub, laced spokes. Symmetric in x."""
    hw = width / 2
    rim_r = radius - 0.07
    parts = [tyre(radius, width, m["rubber"], sidewall=0.23, segments=28)]
    if LOD < 2:
        parts.append(lathe("rim", [(rim_r + 0.006, hw * 0.7), (rim_r - 0.012, 0.0), (rim_r + 0.006, -hw * 0.7)], m["chrome"], 12))
        parts.append(lathe("hub", [(0.0001, 0.06), (hub_r, 0.05), (hub_r, -0.05), (0.0001, -0.06)], m["steel"], 8))
        # Spokes as two thin crossed discs would cost more than they show: a dark see-through look is left out.
        return wheel_node(name, parts, location)
    parts.append(lathe("rim", [(rim_r + 0.008, hw * 0.75), (rim_r - 0.004, hw * 0.5), (rim_r - 0.016, 0.0), (rim_r - 0.004, -hw * 0.5), (rim_r + 0.008, -hw * 0.75)], m["chrome"], 28))
    # Drum hub with brake plate on one side.
    parts.append(lathe("hub", [(0.012, 0.075), (0.03, 0.07), (hub_r, 0.055), (hub_r, -0.03), (0.045, -0.045), (0.045, -0.06), (0.012, -0.065)], m["steel"], 16))
    for i in range(spokes):
        a = 2 * math.pi * i / spokes
        side = 1 if i % 2 else -1
        # Tangential lacing: each spoke leaves the hub flange offset round the hub.
        b = a + side * 0.35
        p0 = Vector((side * 0.045, math.cos(b) * hub_r * 0.85, math.sin(b) * hub_r * 0.85))
        p1 = Vector((side * 0.006, math.cos(a) * (rim_r - 0.012), math.sin(a) * (rim_r - 0.012)))
        parts.append(tube("spoke", p0, p1, 0.0022, m["chrome"], verts=3))
    return wheel_node(name, parts, location)


def motorbike(m):
    """A 125 cc commuter motorbike: 2.0 m long, 0.74 m across the bars, 1.06 m tall (no mirrors)."""
    parts = []
    # Fuel tank: rounded, wide at the knees, a chrome cap. Knee pads.
    tank = loft("tank", [oval(*s) for s in [
        (-0.03, 0.10, 0.82, 0.88),
        (0.04, 0.15, 0.76, 0.95),
        (0.18, 0.17, 0.75, 1.01),
        (0.33, 0.155, 0.78, 1.025),
        (0.44, 0.115, 0.84, 1.0),
        (0.49, 0.06, 0.88, 0.97),
    ]], m["body"], caps=(True, True))
    subsurf(tank, 1 if LOD >= 2 else 0)
    parts.append(tank)
    parts.append(fine(cylinder("fuel_cap", 0.035, 0.02, (0, 0.27, 1.03), m["chrome"], verts=14)))
    for sx in (1, -1):
        k = box("knee_pad", (0.02, 0.16, 0.08), (sx * 0.16, 0.12, 0.86), m["rubber"], bevel=0.015)
        k.rotation_euler = (0, sx * 0.25, 0)
        parts.append(fine(k))
    # Seat for two, its base, the tail cowl round the rear, tail lamp, indicators, number plate.
    seat_ = loft("seat", [oval(*s, n=12, square=0.5) for s in [
        (0.02, 0.10, 0.8, 0.85),
        (-0.06, 0.14, 0.79, 0.875),
        (-0.3, 0.15, 0.79, 0.875),
        (-0.55, 0.145, 0.80, 0.9),
        (-0.74, 0.13, 0.81, 0.9),
        (-0.8, 0.09, 0.82, 0.88),
    ]], m["seat"], caps=(True, True))
    subsurf(seat_, 1 if LOD >= 2 else 0)
    parts.append(seat_)
    cowl = loft("tail_cowl", [oval(*s, n=10, square=0.45) for s in [
        (-0.4, 0.13, 0.66, 0.8),
        (-0.7, 0.12, 0.7, 0.82),
        (-0.88, 0.09, 0.73, 0.83),
        (-0.97, 0.05, 0.76, 0.82),
    ]], m["body"], caps=(True, True))
    parts.append(cowl)
    t = box("tail_lamp", (0.13, 0.05, 0.065), (0, -0.96, 0.79), m["tail"], bevel=0.015)
    t.rotation_euler = (0.25, 0, 0)
    parts.append(t)
    # Rear mudguard down to the plate, and the plate (white, no real registration).
    parts.append(arc_strip("rear_guard", BIKE_REAR, BIKE_TYRE, 0.35, math.radians(95), math.radians(185), 0.06, m["frame"], n=10))
    plate_c = Vector((0, -1.0, 0.6))
    parts.append(box("plate_bracket", (0.2, 0.012, 0.13), plate_c + Vector((0, 0.008, 0)), m["frame"]))
    parts.append(quad("plate", plate_c + Vector((0, -0.002, 0)), (0, -1, -0.08), 0.18, 0.115, m["decal"], DECAL["plate_white"]))
    for sx in (1, -1):
        parts.append(fine(tube("indicator_stalk", (sx * 0.06, -0.9, 0.72), (sx * 0.17, -0.92, 0.73), 0.008, m["frame"], verts=6)))
        parts.append(box("indicator", (0.05, 0.04, 0.035), (sx * 0.19, -0.92, 0.73), m["amber"], bevel=0.012))
        parts.append(fine(tube("indicator_stalk", (sx * 0.07, 0.56, 0.9), (sx * 0.17, 0.55, 0.9), 0.008, m["frame"], verts=6)))
        parts.append(box("indicator", (0.05, 0.04, 0.035), (sx * 0.19, 0.55, 0.9), m["amber"], bevel=0.012))
        # Side panels under the seat.
        p = box("side_panel", (0.03, 0.3, 0.2), (sx * 0.125, -0.27, 0.66), m["body"], bevel=0.02)
        p.rotation_euler = (0.15, 0, 0)
        parts.append(p)
    # Grab rail and rear carrier (the cargo anchor), pillion footrests.
    parts.append(path_tube("grab_rail", [(-0.16, -0.5, 0.86), (-0.17, -0.8, 0.88), (-0.1, -0.95, 0.89), (0.1, -0.95, 0.89), (0.17, -0.8, 0.88), (0.16, -0.5, 0.86)], 0.011, m["chrome"], verts=8))
    # The carrier's plate, where a parcel is strapped (the cargo anchor: its top 0.891 m up).
    parts.append(box("carrier_plate", (0.26, 0.2, 0.012), (0, -0.85, 0.885), m["frame"]))
    if LOD >= 2:
        for y in (-0.92, -0.78):
            parts.append(tube("carrier", (-0.13, y, 0.879), (0.13, y, 0.879), 0.006, m["chrome"], verts=6))
    for sx in (1, -1):
        parts.append(fine(tube("pillion_peg", (sx * 0.17, -0.42, 0.4), (sx * 0.27, -0.42, 0.4), 0.014, m["rubber"], verts=8)))
    # Frame: single downtube and backbone from the steering head, the rear subframe.
    parts.append(tube("head", BIKE_HEAD + Vector((0, 0.015, 0.03)), BIKE_HEAD + Vector((0, 0.07, -0.18)), 0.035, m["frame"], verts=12))
    parts.append(path_tube("backbone", [(0, 0.47, 0.92), (0, 0.25, 0.8), (0, -0.05, 0.74), (0, -0.3, 0.73)], 0.03, m["frame"], verts=10))
    parts.append(path_tube("downtube", [(0, 0.52, 0.84), (0, 0.45, 0.62), (0, 0.36, 0.42), (0, 0.24, 0.27)], 0.026, m["frame"], verts=10))
    for sx in (1, -1):
        parts.append(path_tube("subframe", [(sx * 0.1, -0.05, 0.42), (sx * 0.11, -0.3, 0.7), (sx * 0.11, -0.55, 0.77)], 0.016, m["frame"], verts=8))
    # Engine: crankcase with round covers, cylinder inclined forwards with cooling fins, carburettor.
    case = box("crankcase", (0.24, 0.42, 0.24), (0, 0.13, 0.37), m["engine"], bevel=0.06, segments=2)
    parts.append(case)
    parts.append(cylinder("clutch_cover", 0.1, 0.05, (0.13, 0.12, 0.38), m["engine"], rot=(0, math.pi / 2, 0), verts=20))
    parts.append(cylinder("magneto_cover", 0.085, 0.04, (-0.13, 0.17, 0.38), m["engine"], rot=(0, math.pi / 2, 0), verts=18))
    axis = Vector((0, 0.55, 0.83)).normalized()
    base = Vector((0, 0.28, 0.47))
    parts.append(tube("cylinder", base, base + axis * 0.2, 0.06, m["engine"], verts=14))
    for k in range(6 if LOD >= 2 else 2):
        f = box("fin", (0.17, 0.17, 0.01), base + axis * (0.03 + k * 0.03), m["engine"])
        f.rotation_mode = "QUATERNION"
        f.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis)
        parts.append(f)
    parts.append(fine(box("carburettor", (0.08, 0.1, 0.08), (0, 0.2, 0.62), m["steel"], bevel=0.015)))
    parts.append(fine(tube("intake", (0, 0.2, 0.62), (0, -0.04, 0.62), 0.025, m["rubber"], verts=8)))
    parts.append(fine(box("air_filter", (0.16, 0.16, 0.14), (0, -0.1, 0.6), m["black"], bevel=0.02)))
    # Exhaust: from the head down under the engine and back along the right side to the silencer.
    parts.append(path_tube("exhaust", [(0, 0.42, 0.55), (0.02, 0.47, 0.4), (0.06, 0.4, 0.24), (0.14, 0.15, 0.22), (0.17, -0.1, 0.27), (0.18, -0.25, 0.3)], 0.022, m["chrome"], verts=10))
    muffler = loft("silencer", [oval(*s, n=12, square=0.05) for s in [
        (-0.24, 0.035, 0.265, 0.335), (-0.3, 0.055, 0.25, 0.36), (-0.72, 0.055, 0.29, 0.4), (-0.8, 0.04, 0.315, 0.385)]], m["chrome"], caps=(True, True))
    for v in muffler.data.vertices:
        v.co.x += 0.19
    parts.append(muffler)
    parts.append(fine(box("heat_shield", (0.02, 0.3, 0.07), (0.25, -0.42, 0.36), m["black"], bevel=0.012)))
    # Swingarm, chain and its guard (left), twin rear shocks with springs.
    for sx in (1, -1):
        parts.append(tube("swingarm", (sx * 0.1, -0.02, 0.36), (sx * 0.1, BIKE_REAR, BIKE_TYRE), 0.022, m["frame"], verts=8))
        top, bottom = Vector((sx * 0.12, -0.5, 0.78)), Vector((sx * 0.12, BIKE_REAR + 0.08, BIKE_TYRE + 0.05))
        parts.append(tube("shock_body", bottom, bottom + (top - bottom) * 0.45, 0.022, m["frame"], verts=10))
        parts.append(tube("shock_spring", bottom + (top - bottom) * 0.4, top, 0.03 if LOD >= 2 else 0.026, m["chrome"], verts=12))
        if LOD >= 2:
            for k in range(6):
                parts.append(tube("coil", bottom + (top - bottom) * (0.46 + k * 0.09), bottom + (top - bottom) * (0.5 + k * 0.09) + Vector((sx * 0.0, 0.01, 0)), 0.034, m["chrome"], verts=10))
    parts.append(box("chain_guard", (0.03, 0.62, 0.07), (-0.13, -0.36, 0.37), m["frame"], bevel=0.015))
    parts.append(fine(tube("chain", (-0.11, 0.12, 0.33), (-0.11, BIKE_REAR, 0.32), 0.012, m["steel"], verts=6)))
    # Front fork: two chromed stanchions into black sliders, the axle; top yoke.
    for sx in (1, -1):
        top = Vector((sx * 0.085, 0.47, 1.0))
        bottom = Vector((sx * 0.085, BIKE_FRONT, BIKE_TYRE))
        parts.append(tube("stanchion", top, top + (bottom - top) * 0.55, 0.019, m["chrome"], verts=12))
        parts.append(tube("slider", top + (bottom - top) * 0.5, bottom + (bottom - top).normalized() * 0.02, 0.025, m["alloy"], verts=12))
        parts.append(fine(tube("gaiter", top + (bottom - top) * 0.45, top + (bottom - top) * 0.6, 0.026, m["rubber"], verts=12)))
    parts.append(box("yoke", (0.24, 0.07, 0.03), (0, 0.475, 1.0), m["frame"], bevel=0.012))
    parts.append(arc_strip("front_guard", BIKE_FRONT, BIKE_TYRE, 0.345, math.radians(25), math.radians(140), 0.06, m["body"], n=10))
    # Headlamp with chrome bezel and a small visor, the speedometer, the front number plate.
    lamp_c = Vector((0, 0.6, 0.95))
    shell_ = sphere("lamp_shell", 0.1, lamp_c + Vector((0, -0.03, 0)), m["frame"], scale=(1, 0.8, 1), segments=16, rings=8)
    parts.append(shell_)
    bezel = cylinder("bezel", 0.092, 0.025, lamp_c + Vector((0, 0.035, 0)), m["chrome"], rot=(math.pi / 2, 0, 0), verts=20)
    parts.append(bezel)
    parts.append(cylinder("headlamp", 0.08, 0.02, lamp_c + Vector((0, 0.045, 0)), m["lamp"], rot=(math.pi / 2, 0, 0), verts=20))
    v = box("visor", (0.2, 0.08, 0.1), lamp_c + Vector((0, -0.01, 0.12)), m["body"], bevel=0.03)
    v.rotation_euler = (-0.5, 0, 0)
    parts.append(v)
    parts.append(fine(quad("front_plate", lamp_c + Vector((0, 0.03, -0.13)), (0, 1, 0.15), 0.16, 0.07, m["decal"], DECAL["plate_white"])))
    meter = cylinder("speedometer", 0.055, 0.05, (0, 0.47, 1.1), m["frame"], rot=(1.0, 0, 0), verts=16)
    parts.append(meter)
    parts.append(fine(cylinder("speedo_face", 0.046, 0.004, (0, 0.452, 1.122), m["white"], rot=(1.0, 0, 0), verts=16)))
    # Handlebar from the top clamp out to the grips, grips, levers, mirrors on stalks.
    g = BIKE_GRIP
    parts.append(path_tube("handlebar", [(-g.x + 0.08, g.y, g.z), (-0.18, g.y + 0.025, g.z - 0.02), (-0.06, g.y + 0.05, g.z - 0.05), (0.06, g.y + 0.05, g.z - 0.05), (0.18, g.y + 0.025, g.z - 0.02), (g.x - 0.08, g.y, g.z)], 0.011, m["chrome"], verts=8))
    parts.append(box("bar_clamp", (0.1, 0.05, 0.04), (0, g.y + 0.05, g.z - 0.07), m["frame"]))
    for sx in (1, -1):
        parts.append(tube("grip", (sx * (g.x - 0.065), g.y, g.z), (sx * (g.x + 0.055), g.y, g.z), 0.017, m["rubber"], verts=12))
        parts.append(fine(box("switch", (0.045, 0.045, 0.04), (sx * (g.x - 0.095), g.y, g.z), m["black"], bevel=0.012)))
        parts.append(fine(tube("lever", (sx * (g.x - 0.08), g.y + 0.04, g.z + 0.005), (sx * (g.x + 0.07), g.y + 0.07, g.z - 0.005), 0.006, m["steel"], verts=6)))
        stalk_top = Vector((sx * 0.3, g.y + 0.0, g.z + 0.17))
        parts.append(tube("mirror_stalk", (sx * 0.22, g.y + 0.03, g.z), stalk_top, 0.006, m["chrome"], verts=6))
        mirror = cylinder("mirror", 0.055, 0.02, stalk_top + Vector((sx * 0.02, 0, 0.03)), m["frame"], rot=(math.pi / 2, 0, 0), verts=16)
        mirror.scale = (1.25, 1, 1)
        parts.append(mirror)
        parts.append(fine(cylinder("mirror_glass", 0.05, 0.004, stalk_top + Vector((sx * 0.02, -0.012, 0.03)), m["chrome"], rot=(math.pi / 2, 0, 0), verts=16)))
    # Footpegs (the rider's feet rest on them), brake pedal (right), gear lever (left), stands.
    p = BIKE_PEG
    for sx in (1, -1):
        parts.append(tube("footpeg", (sx * 0.16, p.y, p.z), (sx * (p.x + 0.05), p.y, p.z), 0.016, m["rubber"], verts=10))
        parts.append(fine(tube("peg_bracket", (sx * 0.1, p.y + 0.04, p.z + 0.03), (sx * 0.17, p.y, p.z), 0.012, m["frame"], verts=6)))
    parts.append(fine(tube("brake_pedal", (0.2, p.y + 0.02, p.z), (0.21, p.y + 0.24, p.z + 0.02), 0.008, m["steel"], verts=6)))
    parts.append(fine(tube("gear_lever", (-0.2, p.y + 0.06, p.z + 0.04), (-0.21, p.y + 0.24, p.z + 0.06), 0.008, m["steel"], verts=6)))
    parts.append(fine(tube("side_stand", (-0.12, -0.05, 0.3), (-0.3, -0.2, 0.02), 0.012, m["frame"], verts=6)))
    parts.append(fine(tube("centre_stand", (-0.12, -0.12, 0.26), (-0.12, -0.25, 0.1), 0.012, m["frame"], verts=6)))
    body = join(parts, "bike_body")
    smooth(body, 50)
    spoked_wheel("wheel_front", (0, BIKE_FRONT, BIKE_TYRE), BIKE_TYRE, 0.08, m)
    spoked_wheel("wheel_rear", (0, BIKE_REAR, BIKE_TYRE), BIKE_TYRE, 0.09, m)
    return body


# ----------------------------------------------------------------------------- shared: shells


def lerp_sections(sections, y, k):
    """Field k of the cross-sections, interpolated at y."""
    for a, b in zip(sections, sections[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return a[k] + (b[k] - a[k]) * t
    return sections[0][k] if y < sections[0][0] else sections[-1][k]


def shell_from(name, sections, mat, arches, arch_r, axle_z, arch_x, levels):
    """A body lofted through `sections`, subdivided, with wheel arches cut at the axles."""
    shell = loft(name, inset_ends([ring(*s) for s in sections]), mat, caps=(True, True))
    subsurf(shell, levels)
    apply_all(shell)
    cuts = []
    for y in arches:
        for sx in (1, -1):
            cuts.append(cutter(f"arch{sx}{y}", None, (sx * arch_x, y, axle_z), cylinder=(arch_r, 0.5)))
    for c in cuts:
        boolean(shell, c)
    apply_all(shell)
    for c in cuts:
        bpy.data.objects.remove(c)
    return shell


def bisect_planes(obj, xs=(), ys=(), zs=()):
    """Cut the mesh along planes, so colours given by face position end on straight lines."""
    for x in xs:
        bisect(obj, (x, 0, 0), (1, 0, 0))
    for y in ys:
        bisect(obj, (0, y, 0), (0, 1, 0))
    for z in zs:
        bisect(obj, (0, 0, z), (0, 0, 1))


def grooves(shell, m, boxes, depth_axis="x"):
    """
    Panel seams as 12 mm dark grooves round door outlines: `boxes` are (side, y0, y1, z0, z1) on
    the sides (side ±1) or, with side 0, on the back (x0, x1 in place of y0, y1).
    """
    if LOD < 2:
        return
    ys, zs, xs = set(), set(), set()
    for side, a0, a1, z0, z1 in boxes:
        (xs if side == 0 else ys).update((a0, a1))
        zs.update((z0, z1))
    for y in ys:
        for d in (-0.006, 0.006):
            bisect(shell, (0, y + d, 0), (0, 1, 0))
    for x in xs:
        for d in (-0.006, 0.006):
            bisect(shell, (x + d, 0, 0), (1, 0, 0))
    for z in zs:
        for d in (-0.006, 0.006):
            bisect(shell, (0, 0, z + d), (0, 0, 1))

    def test(c, n):
        for side, a0, a1, z0, z1 in boxes:
            if side == 0:
                if n.y > -0.5 or not (a0 - 0.007 < c.x < a1 + 0.007 and z0 - 0.007 < c.z < z1 + 0.007):
                    continue
                if min(abs(c.x - a0), abs(c.x - a1)) < 0.006 or min(abs(c.z - z0), abs(c.z - z1)) < 0.006:
                    return True
                continue
            if abs(n.x) < 0.3 or c.x * side < 0.3 or not (a0 - 0.007 < c.y < a1 + 0.007 and z0 - 0.007 < c.z < z1 + 0.007):
                continue
            if min(abs(c.y - a0), abs(c.y - a1)) < 0.006 or min(abs(c.z - z0), abs(c.z - z1)) < 0.006:
                return True
        return False
    paint_faces(shell, m["black"], test)


# ----------------------------------------------------------------------------- ambulance

# From specs.ts (ambulance): wheels at x ±0.86, z -1.6 and 1.55, radius 0.38; the ground 1.10 m
# below the chassis centre. Driver's hips (0.45, 0.15, -0.7), hands (±0.17, 0.3, -0.42) and feet
# (±0.12, -0.38, -0.7) from them. Cab door: hinge x 0.985, z -1.22 to the seam at z -0.42, from
# y -0.2 to 1.0; rear doors hinged at x ±0.7, z 2.56, 0.7 m wide, from y -0.37 to 1.0.
AMB_G = 1.10
AMB_TYRE = 0.38
AMB_HIP = Vector((0.45, 0.70, 1.25))
AMB_WHEEL = Vector((0.45, 1.12, 1.55))


def ambulance(m):
    """A van ambulance: 5.1 m long, 1.96 m wide, 2.22 m tall, short bonnet, high roof."""
    sections = [
        (-2.56, 0.93, 0.56, 1.5, 2.15, 0.9, 0.06, 0.1),
        (-2.54, 0.975, 0.5, 1.52, 2.2, 0.945, 0.06, 0.12),
        (-1.6, 0.98, 0.5, 1.52, 2.22, 0.95, 0.06, 0.12),
        (0.4, 0.98, 0.5, 1.52, 2.22, 0.95, 0.06, 0.12),
        (1.22, 0.98, 0.5, 1.52, 2.19, 0.94, 0.06, 0.1),
        (1.5, 0.98, 0.5, 1.51, 1.86, 0.93, 0.06, 0.08),
        (1.76, 0.975, 0.5, 1.47, 1.53, 0.92, 0.06, 0.06),
        (2.1, 0.97, 0.5, 1.38, 1.44, 0.91, 0.06, 0.07),
        (2.38, 0.95, 0.52, 1.26, 1.32, 0.88, 0.07, 0.08),
        (2.52, 0.9, 0.55, 1.06, 1.12, 0.82, 0.08, 0.08),
        (2.565, 0.82, 0.6, 0.86, 0.92, 0.74, 0.08, 0.06),
    ]
    shell = shell_from("amb_shell", sections, m["body"], (1.6, -1.55), 0.44, AMB_TYRE, 1.0, 1 if LOD >= 2 else 0)
    paint_faces(shell, m["black"], lambda c, n: any(math.hypot(c.y - y, c.z - AMB_TYRE) < 0.437 for y in (1.6, -1.55)) and abs(c.x) < 0.95 and abs(n.x) < 0.6)
    cab = (1, 0.42, 1.22, 0.9, 2.1)
    backs = [(0, -0.7, 0.0, 0.73, 2.1), (0, 0.0, 0.7, 0.73, 2.1)]
    grooves(shell, m, [cab, (-1, 0.42, 1.22, 0.9, 2.1), (-1, -1.25, 0.25, 0.62, 2.1)] + backs)
    bisect_planes(shell, xs=(-0.6, -0.1, 0.1, 0.6), ys=(-1.15, -0.15, 1.95), zs=(0.72, 0.78, 0.86, 1.08, 1.27, 1.58, 1.6, 2.0))
    side = lambda c, n: abs(n.x) > 0.5 and abs(c.x) > 0.6
    back = lambda c, n: n.y < -0.6 and c.y < -2.4
    # Livery: a red band and a yellow one below it along the sides and round the back.
    paint_faces(shell, m["red"], lambda c, n: (side(c, n) or back(c, n)) and 1.08 < c.z < 1.27 and c.y < 1.95)
    paint_faces(shell, m["yellow"], lambda c, n: (side(c, n) or back(c, n)) and 0.78 < c.z < 0.86 and c.y < 1.95)
    # Glass: windscreen, cab side windows (behind the A pillar), the rear doors' windows;
    # frosted windows in the patient's compartment.
    def a_line(z):
        return 1.72 - (z - 1.53) * 0.72
    paint_faces(shell, m["glass"], lambda c, n: abs(n.x) < 0.5 and 1.24 < c.y < 1.76 and c.z > 1.55 and abs(c.x) < 0.86)
    paint_faces(shell, m["glass"], lambda c, n: side(c, n) and 1.58 < c.z < 2.05 and 0.5 < c.y < a_line(c.z) - 0.07)
    paint_faces(shell, m["frosted"], lambda c, n: side(c, n) and 1.6 < c.z < 2.0 and -1.15 < c.y < -0.15)
    paint_faces(shell, m["glass"], lambda c, n: back(c, n) and 1.58 < c.z < 2.0 and 0.1 < abs(c.x) < 0.6)
    paint_faces(shell, m["plastic"], lambda c, n: (c.y > 2.4 or c.y < -2.5) and c.z < 0.72)
    smooth(shell, 35)
    # Doors: the cab door (right) and the two rear doors.
    def cab_test(c, n):
        return side(c, n) and c.x > 0 and 0.427 < c.y < 1.213 and 0.907 < c.z < 2.093
    def rear_test(sx):
        return lambda c, n: back(c, n) and 0.007 < c.x * sx < 0.693 and 0.737 < c.z < 2.093
    handles = []
    hit = surface((2, 0.6, 1.4), (-1, 0, 0), only=shell)
    if hit:
        handles.append(box("handle", (0.022, 0.16, 0.035), hit[0] + hit[1] * 0.006, m["black"], bevel=0.012))
    for sx in (1, -1):
        hit = surface((sx * 0.08, -3, 1.35), (0, 1, 0), only=shell)
        if hit:
            h = box("handle", (0.03, 0.022, 0.16), hit[0] + hit[1] * 0.006, m["black"], bevel=0.012)
            h.location.x = sx * 0.06
            handles.append(h)
    door_objs = []
    if LOD >= 2:
        d = separate(shell, "door_cab", cab_test)
        card = box("door_cab_card", (0.02, 0.72, 0.62), (0.95, 0.82, 1.24), m["interior"])
        mine = [h for h in handles if h.location.x > 0.5]
        for h in mine:
            handles.remove(h)
        door_objs.append((join([d, card, *mine], "door_cab"), (0.985, 1.22)))
        for sx, name in ((-1, "door_back_l"), (1, "door_back_r")):
            d = separate(shell, name, rear_test(sx))
            card = box(name + "_card", (0.62, 0.02, 1.2), (sx * 0.35, -2.52, 1.4), m["interior"])
            mine = [h for h in handles if h.location.x * sx > 0 and h.location.y < -2]
            for h in mine:
                handles.remove(h)
            door_objs.append((join([d, card, *mine], name), (sx * 0.7, -2.56)))
    parts = [shell] + handles
    parts += amb_fittings(m)
    parts += amb_interior(m)
    join(parts, "amb_body")
    finish_doors(door_objs)
    for name, x, y in (("wheel_fl", -0.86, 1.6), ("wheel_fr", 0.86, 1.6), ("wheel_rl", -0.86, -1.55), ("wheel_rr", 0.86, -1.55)):
        car_wheel(name, (x, y, AMB_TYRE), AMB_TYRE, 0.21, m, steel=True)


def amb_fittings(m):
    parts = []
    body = bpy.data.objects["amb_shell"]
    for sx in (1, -1):
        # Headlamps: tall clusters at the front corners; indicators beside them.
        hit = surface((sx * 0.68, 4, 1.06), (0, -1, 0), only=body)
        if hit:
            loc, n = hit
            yaw = -math.atan2(n.x, n.y)
            h = box("headlamp_housing", (0.34, 0.08, 0.18), loc - n * 0.02, m["chrome"], bevel=0.03)
            h.rotation_euler = (0, 0, yaw)
            parts.append(h)
            u = cylinder("headlamp", 0.06, 0.03, loc - n * 0.0 + Vector((sx * -0.05, 0, 0.01)), m["lamp"], verts=16)
            facing(u, n)
            parts.append(u)
            i = box("indicator", (0.08, 0.05, 0.07), loc + Vector((sx * 0.14, -0.02, 0.0)), m["amber"], bevel=0.012)
            i.rotation_euler = (0, 0, yaw)
            parts.append(i)
        # Tail lamps up the rear corners, reflectors low.
        parts.append(box("tail_lamp", (0.14, 0.05, 0.42), (sx * 0.82, -2.565, 1.32), m["tail"], bevel=0.02))
        parts.append(fine(box("reverse", (0.12, 0.05, 0.08), (sx * 0.82, -2.565, 1.05), m["lamp"], bevel=0.012)))
        # Big van mirrors on arms ahead of the cab doors.
        arm0 = Vector((sx * 0.98, 1.3, 1.62))
        head = Vector((sx * 1.16, 1.32, 1.78))
        parts.append(tube("mirror_arm", arm0, head, 0.012, m["black"], verts=6))
        mi = box("mirror", (0.06, 0.12, 0.24), head + Vector((sx * 0.02, 0, 0.02)), m["black"], bevel=0.02)
        parts.append(mi)
        parts.append(fine(box("mirror_glass", (0.004, 0.1, 0.22), head + Vector((sx * 0.02, -0.062, 0.02)), m["chrome"])))
        # Side marker lamps and a grab handle by the cab door.
        parts.append(fine(box("marker", (0.012, 0.06, 0.03), (sx * 0.985, 1.9, 1.05), m["amber"])))
        # "AMBULANCE" on each side of the patient's compartment.
        parts.append(quad("lettering", (sx * 0.99, -1.15, 1.42), (sx, 0, 0), 1.5, 0.19, m["decal"], DECAL["ambulance"]))
    # Light bar on the roof over the cab: a dark base, red on the left, blue on the right.
    parts.append(box("light_bar", (1.3, 0.3, 0.07), (0, 1.0, 2.255), m["black"], bevel=0.02))
    parts.append(box("beacon_red", (0.5, 0.26, 0.12), (-0.36, 1.0, 2.34), m["beaconred"], bevel=0.03))
    parts.append(box("beacon_blue", (0.5, 0.26, 0.12), (0.36, 1.0, 2.34), m["beaconblue"], bevel=0.03))
    parts.append(fine(box("siren", (0.2, 0.18, 0.1), (0, 1.0, 2.33), m["black"], bevel=0.02)))
    # Flashers at the back of the roof.
    for sx in (1, -1):
        parts.append(box("rear_beacon", (0.14, 0.1, 0.1), (sx * 0.72, -2.48, 2.27), m["beaconred" if sx < 0 else "beaconblue"], bevel=0.02))
    # Grille, bumpers with a rear step, plates, mirrored lettering above the grille.
    hit = surface((0, 4, 0.98), (0, -1, 0), only=body)
    if hit:
        parts.append(box("grille", (0.95, 0.06, 0.2), hit[0] - hit[1] * 0.02, m["black"], bevel=0.02))
        for k in range(3 if LOD >= 2 else 0):
            parts.append(box("slat", (0.9, 0.02, 0.014), hit[0] + Vector((0, 0.012, -0.06 + k * 0.06)), m["chrome"]))
    hit = surface((0, 4, 1.22), (0, -1, 0), only=body)
    if hit:
        parts.append(quad("lettering_front", hit[0] + hit[1] * 0.006, hit[1], 0.95, 0.12, m["decal"], DECAL["ambulance_mirrored"]))
    parts.append(box("front_bumper", (1.9, 0.16, 0.2), (0, 2.52, 0.62), m["plastic"], bevel=0.04))
    parts.append(box("rear_bumper", (1.9, 0.14, 0.16), (0, -2.58, 0.6), m["plastic"], bevel=0.03))
    parts.append(box("rear_step", (1.2, 0.14, 0.05), (0, -2.62, 0.46), m["steel"], bevel=0.012))
    for y, z, d, w in ((4, 0.75, -1, 0.42), (-4, 0.82, 1, 0.42)):
        hit = surface((0, y, z), (0, d, 0), only=body)
        if hit is None and d > 0:
            hit = (Vector((0, -2.66, z)), Vector((0, -1, 0)))
        if hit:
            parts.append(quad("plate", hit[0] + hit[1] * 0.012, hit[1], w, 0.1, m["decal"], DECAL["plate_white"]))
    parts.append(quad("lettering_back", (0, -2.567, 2.13), (0, -1, 0), 0.8, 0.1, m["decal"], DECAL["ambulance"]))
    # Wipers, roof vent, underside.
    for x in (-0.1, 0.45):
        parts.append(fine(tube("wiper", (x, 1.74, 1.56), (x - 0.5, 1.64, 1.7), 0.008, m["black"], verts=6)))
    parts.append(fine(box("roof_vent", (0.4, 0.4, 0.08), (0, -1.0, 2.25), m["white"], bevel=0.02)))
    parts.append(box("underbody", (1.7, 4.8, 0.02), (0, 0, 0.5), m["black"]))
    return parts


def amb_interior(m):
    """Cab (seats, dashboard, steering wheel), the partition, and the patient's compartment:
    a floor, a bench along the right wall, cabinets at the front; the stretcher's place (left of
    the middle, from the rear doors forwards) is kept clear."""
    parts = [interior_liner("cab", 0.93, 0.42, 1.74, 0.76, 1.52, 2.14, m["interior"], xroof=0.85, yroof=(0.42, 1.18))]
    parts.append(interior_liner("compartment", 0.93, -2.5, 0.4, 0.6, 1.52, 2.14, m["interior"], xroof=0.85))
    parts += seat("driver", AMB_HIP.x, AMB_HIP.y + 0.05, AMB_HIP.z - 0.1, 0.5, m, back=0.6, recline=0.18)
    parts += seat("crew", -AMB_HIP.x, AMB_HIP.y + 0.05, AMB_HIP.z - 0.1, 0.5, m, back=0.6, recline=0.18)
    for sx in (1, -1):
        parts.append(box("seat_base", (0.42, 0.42, AMB_HIP.z - 0.2 - 0.76), (sx * AMB_HIP.x, AMB_HIP.y + 0.05, (AMB_HIP.z - 0.2 + 0.76) / 2), m["plastic"]))
    parts.append(box("dash", (1.8, 0.4, 0.26), (0, 1.62, 1.42), m["plastic"], bevel=0.05))
    parts += steering_wheel(AMB_WHEEL, 0.19, math.radians(38), m)
    # Partition with a window between the cab and the compartment.
    parts.append(box("partition", (1.86, 0.03, 0.8), (0, 0.42, 1.16), m["white"]))
    parts.append(box("partition_top", (1.86, 0.03, 0.18), (0, 0.42, 2.05), m["white"]))
    # Bench along the right wall, cabinets at the front of the compartment.
    parts.append(box("bench", (0.4, 1.4, 0.42), (0.7, -1.0, 0.81), m["white"]))
    parts.append(box("bench_pad", (0.42, 1.4, 0.08), (0.7, -1.0, 1.06), m["seat"], bevel=0.02))
    parts.append(box("cabinet", (1.86, 0.36, 1.2), (0, 0.2, 1.2), m["white"]))
    if LOD >= 2:
        parts.append(box("oxygen", (0.14, 0.14, 0.6), (-0.8, 0.0, 0.9), m["steel"], bevel=0.03))
        parts.append(tube("rail", (-0.4, -2.3, 2.08), (-0.4, 0.0, 2.08), 0.012, m["steel"], verts=6))
    return parts


# ----------------------------------------------------------------------------- bus

# From specs.ts (bus): wheels at x ±1.08, z -3.3 and 2.8, radius 0.5; the ground 1.52 m below the
# chassis centre. Driver's hips (0.8, 0.3, -4.0); hands (±0.2, 0.25, -0.42) and feet (±0.12,
# -0.42, -0.62) from them. Front door on the kerb (left) side, z -4.15 to -3.05, folding leaves
# from y -0.6 to 1.3; floor about 1.17 m up (the aisle's standing points).
BUS_G = 1.52
BUS_TYRE = 0.5
BUS_HIP = Vector((0.8, 4.0, 1.82))
BUS_WHEEL = Vector((0.8, 4.42, 2.07))
BUS_FLOOR = 1.15


def bus(m):
    """A city bus: 10.1 m long, 2.5 m wide, 3.26 m tall; front door and a rear door on the kerb side."""
    sections = [
        (-5.06, 1.2, 0.46, 1.95, 3.2, 1.17, 0.08, 0.16),
        (-5.02, 1.25, 0.42, 1.98, 3.25, 1.22, 0.06, 0.2),
        (4.98, 1.25, 0.42, 1.98, 3.26, 1.22, 0.06, 0.2),
        (5.04, 1.23, 0.44, 1.96, 3.22, 1.2, 0.07, 0.18),
        (5.07, 1.18, 0.48, 1.9, 3.14, 1.15, 0.08, 0.14),
    ]
    shell = shell_from("bus_shell", sections, m["body"], (3.3, -2.8), 0.62, BUS_TYRE, 1.25, 1 if LOD >= 2 else 0)
    # Doorways on the kerb side (cut through: the front door's leaves swing; the rear's are fixed).
    cuts = [cutter("front_doorway", (0.5, 1.1, 2.3), (-1.25, 3.6, 0.55 + 1.15)), cutter("rear_doorway", (0.5, 1.1, 2.3), (-1.25, -2.0, 0.55 + 1.15))]
    for c in cuts:
        boolean(shell, c)
    apply_all(shell)
    for c in cuts:
        bpy.data.objects.remove(c)
    pillars = [-4.0 + k * 1.33 + d for k in range(-1, 8) for d in (-0.065, 0.065)]
    bisect_planes(shell, xs=(-1.12, -1.0, 1.0, 1.12), ys=[y for y in pillars if -4.75 < y < 4.75] + [-4.75, 4.75], zs=(0.62, 1.45, 1.86, 2.0, 2.08, 2.15, 2.8, 2.84, 2.85, 2.95, 3.0, 3.18))
    paint_faces(shell, m["black"], lambda c, n: any(math.hypot(c.y - y, c.z - BUS_TYRE) < 0.617 for y in (3.3, -2.8)) and abs(c.x) < 1.22 and abs(n.x) < 0.6)
    paint_faces(shell, m["interior"], lambda c, n: c.x < -1.0 and abs(n.x) < 0.6 and (3.04 < c.y < 4.16 or -2.56 < c.y < -1.44) and c.z < 2.86 and abs(c.x) < 1.24)
    side = lambda c, n: abs(n.x) > 0.6 and abs(c.x) > 1.0
    # Livery: cream roof and a cream band above the windows, cream waist stripe, dark skirt.
    paint_faces(shell, m["cream"], lambda c, n: c.z > 3.0 or (side(c, n) and 2.84 < c.z < 3.0))
    paint_faces(shell, m["cream"], lambda c, n: side(c, n) and 1.86 < c.z < 2.0)
    paint_faces(shell, m["plastic"], lambda c, n: c.z < 0.62)
    # Windows: a long band each side between pillars every 1.33 m; the windscreen; the back window.
    def window(c, n):
        if not (side(c, n) and 2.08 < c.z < 2.8 and -4.75 < c.y < 4.75):
            return False
        if c.x < 0 and (3.0 < c.y < 4.2 or -2.6 < c.y < -1.4):
            return False
        return abs(((c.y + 4.0) % 1.33) - 0.665) < 0.6
    paint_faces(shell, m["glass"], window)
    paint_faces(shell, m["glass"], lambda c, n: n.y > 0.5 and c.y > 4.9 and 1.45 < c.z < 2.95 and abs(c.x) < 1.12)
    paint_faces(shell, m["glass"], lambda c, n: n.y < -0.5 and c.y < -4.9 and 2.15 < c.z < 2.85 and abs(c.x) < 1.0)
    paint_faces(shell, m["black"], lambda c, n: n.y > 0.5 and c.y > 4.9 and 2.95 < c.z < 3.18 and abs(c.x) < 1.0)
    smooth(shell, 35)
    parts = [shell]
    parts += bus_fittings(m)
    parts += bus_interior(m)
    join(parts, "bus_body")
    # Front door: two glazed leaves, each hinged at its outer edge (y 4.15 and 3.05).
    if LOD >= 2:
        for name, hy, d in (("door_front_a", 4.15, -1), ("door_front_b", 3.05, 1)):
            leaf = [
                box("leaf_glass", (0.025, 0.53, 1.9), (-1.28, hy + d * 0.275, 0.92 + 0.95), m["glass"]),
                box("leaf_edge", (0.035, 0.04, 1.9), (-1.285, hy + d * 0.525, 0.92 + 0.95), m["black"]),
                box("leaf_edge", (0.035, 0.04, 1.9), (-1.285, hy + d * 0.02, 0.92 + 0.95), m["black"]),
                box("leaf_rail", (0.035, 0.545, 0.06), (-1.285, hy + d * 0.272, 1.75), m["black"]),
                box("leaf_rail", (0.035, 0.545, 0.05), (-1.285, hy + d * 0.272, 2.8), m["black"]),
                box("leaf_rail", (0.035, 0.545, 0.05), (-1.285, hy + d * 0.272, 0.94), m["black"]),
            ]
            j = join(leaf, name)
            set_origin(j, (-1.266, hy, 0))
    else:
        # Traffic: the leaves shut, part of the body.
        pass
    for name, x, y in (("wheel_fl", -1.08, 3.3), ("wheel_fr", 1.08, 3.3), ("wheel_rl", -1.08, -2.8), ("wheel_rr", 1.08, -2.8)):
        car_wheel(name, (x, y, BUS_TYRE), BUS_TYRE, 0.3, m, steel=True)


def bus_fittings(m):
    parts = []
    # Traffic model: the front door shut (glass) and the rear door, both fixed in the body.
    for y in ((-2.0,) if LOD >= 2 else (3.6, -2.0)):
        parts.append(box("door_glass", (0.025, 1.08, 1.9), (-1.27, y, 1.87), m["glass"]))
        parts.append(box("door_split", (0.035, 0.04, 1.9), (-1.275, y, 1.87), m["black"]))
        parts.append(box("door_rail", (0.035, 1.08, 0.06), (-1.275, y, 1.75), m["black"]))
    for sx in (1, -1):
        # Twin headlamps and an indicator low on each front corner; tail lamp clusters.
        for k, dx in enumerate((0.0, 0.2)):
            parts.append(cylinder("headlamp", 0.075, 0.04, (sx * (0.88 - dx), 5.07, 0.92), m["lamp"], rot=(math.pi / 2, 0, 0), verts=16))
            parts.append(fine(cylinder("bezel", 0.09, 0.03, (sx * (0.88 - dx), 5.06, 0.92), m["chrome"], rot=(math.pi / 2, 0, 0), verts=16)))
        parts.append(box("indicator", (0.14, 0.04, 0.08), (sx * 0.6, 5.07, 0.92), m["amber"], bevel=0.012))
        parts.append(box("tail_lamp", (0.18, 0.05, 0.5), (sx * 1.05, -5.07, 1.2), m["tail"], bevel=0.02))
        parts.append(fine(box("reverse", (0.16, 0.05, 0.08), (sx * 1.05, -5.07, 0.88), m["lamp"], bevel=0.012)))
        # Mirrors on long arms at the front corners.
        a0, a1 = Vector((sx * 1.2, 5.0, 2.6)), Vector((sx * 1.42, 5.25, 2.5))
        parts.append(path_tube("mirror_arm", [a0, a1, a1 + Vector((0, 0, -0.35))], 0.018, m["black"], verts=6))
        parts.append(box("mirror", (0.08, 0.06, 0.38), a1 + Vector((sx * 0.02, 0.0, -0.4)), m["black"], bevel=0.02))
        parts.append(fine(box("marker", (0.012, 0.08, 0.04), (sx * 1.255, 0.0, 0.85), m["amber"])))
    # Destination board over the windscreen (lettering from the decal atlas), wipers, bumpers.
    parts.append(quad("destination", (0, 5.075, 3.06), (0, 1, 0), 1.8, 0.2, m["decal"], DECAL["board"]))
    parts.append(quad("destination_side", (-1.255, 3.0, 2.95), (-1, 0, 0), 0.9, 0.1, m["decal"], DECAL["board"]))
    for x in (-0.6, 0.55):
        parts.append(fine(tube("wiper", (x, 5.08, 1.5), (x - 0.15, 5.08, 2.2), 0.01, m["black"], verts=6)))
    parts.append(box("front_bumper", (2.5, 0.16, 0.3), (0, 5.08, 0.6), m["black"], bevel=0.04))
    parts.append(box("rear_bumper", (2.5, 0.16, 0.3), (0, -5.08, 0.6), m["black"], bevel=0.04))
    parts.append(box("grille", (1.0, 0.04, 0.3), (0, 5.07, 1.15), m["black"], bevel=0.02))
    parts.append(quad("plate", (0, 5.165, 0.6), (0, 1, 0), 0.5, 0.12, m["decal"], DECAL["plate_yellow"]))
    parts.append(quad("plate", (0, -5.165, 0.62), (0, -1, 0), 0.5, 0.12, m["decal"], DECAL["plate_yellow"]))
    # Window bars (Chennai buses ride with the windows open), a roof hatch, the underside.
    if LOD >= 2:
        for sx in (1, -1):
            # Along the window band, broken at the kerb side's doorways.
            spans = [(-4.7, 4.75)] if sx > 0 else [(-4.7, -2.6), (-1.4, 3.0), (4.2, 4.75)]
            for z in (2.3, 2.5):
                for a, b in spans:
                    parts.append(tube("bar", (sx * 1.262, a, z), (sx * 1.262, b, z), 0.008, m["steel"], verts=5))
        parts.append(box("hatch", (0.6, 0.6, 0.06), (0, 0.5, 3.27), m["cream"], bevel=0.02))
    parts.append(box("underbody", (2.2, 9.6, 0.02), (0, 0, 0.42), m["black"]))
    return parts


def bus_interior(m):
    """Floor, seat rows two-and-two (the detailed model), the driver's seat and wheel, poles."""
    parts = [interior_liner("saloon", 1.2, -4.98, 4.98, BUS_FLOOR, 2.0, 3.2, m["interior"], xroof=1.12)]
    parts += seat("driver", BUS_HIP.x, BUS_HIP.y + 0.05, BUS_HIP.z - 0.1, 0.5, m, back=0.6, recline=0.15)
    parts.append(box("driver_base", (0.45, 0.45, BUS_HIP.z - 0.2 - BUS_FLOOR), (BUS_HIP.x, BUS_HIP.y + 0.05, (BUS_HIP.z - 0.2 + BUS_FLOOR) / 2), m["plastic"]))
    parts += steering_wheel(BUS_WHEEL, 0.22, math.radians(55), m)
    parts.append(box("dash", (2.3, 0.4, 0.4), (0, 4.82, 1.62), m["plastic"], bevel=0.04))
    rows = range(int((3.0 + 4.4) / 0.78)) if LOD >= 2 else range(0)
    for i in rows:
        y = 2.7 - i * 0.78
        for x in (-0.82, 0.82):
            if x < 0 and -2.6 < y < -1.4:
                continue
            parts.append(box("bench", (0.85, 0.42, 0.1), (x, y, BUS_FLOOR + 0.44), m["seat"]))
            back = box("bench_back", (0.85, 0.06, 0.5), (x, y - 0.22, BUS_FLOOR + 0.72), m["seat"])
            back.rotation_euler = (0.12, 0, 0)
            parts.append(back)
    if LOD >= 2:
        for y in (2.9, -1.2):
            parts.append(tube("pole", (-0.35, y, BUS_FLOOR), (-0.35, y, 3.2), 0.02, m["yellow"], verts=8))
        parts.append(tube("rail", (-0.35, -4.5, 2.95), (-0.35, 3.0, 2.95), 0.016, m["steel"], verts=6))
        parts.append(tube("rail", (0.35, -4.5, 2.95), (0.35, 3.0, 2.95), 0.016, m["steel"], verts=6))
    # Steps up from the doorways.
    for y in (3.6, -2.0):
        parts.append(box("step", (0.5, 1.05, 0.05), (-0.95, y, 0.7), m["steel"]))
    return parts


# ----------------------------------------------------------------------------- export and review


def triangles(objs=None):
    total = 0
    for o in objs or bpy.context.scene.objects:
        if o.type == "MESH":
            total += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return total


def export(path):
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.modifiers:
            apply_all(o)
    # The decal atlas image is only for the review renders: the game draws its own.
    decal_image(False)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_extras=False, export_animations=False, export_texcoords=True)
    mats = {s.material.name for o in bpy.context.scene.objects if o.type == "MESH" for s in o.material_slots if s.material}
    print(f"VEHICLE {os.path.basename(path)}: {triangles()} triangles, {len(mats)} materials, nodes " + ", ".join(f"{o.name} {triangles([o])}" for o in sorted(bpy.context.scene.objects, key=lambda o: o.name)))


def render_views(directory, prefix, size, only=None):
    """Cycles renders for review: `size` is the vehicle's length, to frame the camera."""
    os.makedirs(directory, exist_ok=True)
    only = only or (os.environ["VEH_VIEWS"].split(",") if os.environ.get("VEH_VIEWS") else None)
    decal_image(True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
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
    bpy.ops.mesh.primitive_plane_add(size=60)
    ground = bpy.context.object
    gm = bpy.data.materials.new("asphalt")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.09, 0.09, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    ground.data.materials.append(gm)
    cam = link(bpy.data.objects.new("camera", bpy.data.cameras.new("camera")))
    cam.data.lens = 50
    scene.camera = cam
    k = size / 2.7
    views = {
        "front_three_quarter": (Vector((3.6, 4.6, 1.55)) * k, Vector((0, 0.1, 0.8)) * k),
        "side": (Vector((5.8, 0.1, 1.05)) * k, Vector((0, 0.1, 0.75)) * k),
        "rear_three_quarter": (Vector((-3.4, -4.5, 1.9)) * k, Vector((0, -0.1, 0.8)) * k),
        "door_open": (Vector((3.2, 2.2, 2.0)) * k, Vector((0, 0, 0.6)) * k),
    }
    for name, (eye, target) in views.items():
        if only and name not in only:
            continue
        if name == "door_open":
            for o in scene.objects:
                if o.name.startswith("door_"):
                    o.rotation_euler = (0, 0, (1 if o.location.x > 0 else -1) * math.radians(65 if "back" not in o.name else 110))
        cam.location = eye
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (target - eye).to_track_quat("-Z", "Y")
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 88
        scene.render.filepath = os.path.join(directory, f"{prefix}_{name}.jpg")
        bpy.ops.render.render(write_still=True)
        print("RENDER", scene.render.filepath)


def build(kind, lod):
    global LOD
    LOD = lod
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if kind == "hatchback":
        hatchback(palette((0.55, 0.05, 0.05)))
    elif kind == "motorbike":
        motorbike(palette((0.04, 0.12, 0.45)))
    elif kind == "ambulance":
        ambulance(palette((0.9, 0.91, 0.89)))
    elif kind == "bus":
        bus(palette((0.07, 0.36, 0.38)))


SIZES = {"hatchback": 3.9, "motorbike": 2.4, "ambulance": 5.2, "bus": 10.2}

for kind in ("hatchback", "motorbike", "ambulance", "bus"):
    if ONLY and kind not in ONLY:
        continue
    build(kind, 2)
    export(os.path.join(OUT, f"{kind}.glb"))
    if RENDER:
        render_views(RENDER, kind, SIZES[kind])
    build(kind, 1)
    export(os.path.join(OUT, f"{kind}_lod1.glb"))
    if RENDER:
        render_views(RENDER, kind + "_lod1", SIZES[kind], only=("front_three_quarter",))
