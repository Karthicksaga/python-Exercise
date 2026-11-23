"""
Chennai street props, built by script in Blender (toolchain audit: world production pipeline).

Run headless:
    blender -b --factory-startup --python tools/blender/street_props.py -- <out dir> [--preview <png>]
or `npm run blender:props` (finds Blender through the BLENDER environment variable).

Every prop is original, low-poly and stylised (warm painted colours, chunky shapes), modelled
from simple shapes so the script is the source: re-running it rebuilds the same files. One GLB
per prop, metres, +Y up, origin on the ground at the prop's footprint centre, front facing +Z
(the street side). In Blender that is: Z up, front towards -Y; wall-mounted props have the
wall at y = 0 and stick out towards -Y. Two props carry animations the game can play:
    shop_shutter.glb  action "ShutterOpen": the rolling shutter rolls up into its box (2 s)
    handcart.glb      action "Roll": the two wheels turn once (one metre of travel, 1 s)
Triangle budget: under 1,500 per prop; a few flat materials each (base colour only).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "assets/models/props")
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None
os.makedirs(OUT, exist_ok=True)

# Palette: sun-faded paint, wood, rust and terracotta, as on a Chennai market street.
COLOURS = {
    "wood": (0.42, 0.26, 0.14),
    "wood_light": (0.62, 0.43, 0.24),
    "iron": (0.16, 0.16, 0.17),
    "steel": (0.55, 0.57, 0.6),
    "rust": (0.45, 0.22, 0.12),
    "blue": (0.12, 0.33, 0.62),
    "teal": (0.1, 0.48, 0.47),
    "yellow": (0.93, 0.7, 0.12),
    "red": (0.7, 0.16, 0.12),
    "green": (0.2, 0.5, 0.2),
    "white": (0.88, 0.87, 0.82),
    "terracotta": (0.66, 0.31, 0.17),
    "aubergine": (0.35, 0.12, 0.38),
    "tomato": (0.78, 0.15, 0.1),
    "banana": (0.9, 0.78, 0.2),
    "lime": (0.45, 0.65, 0.18),
    "canvas_a": (0.86, 0.33, 0.12),
    "canvas_b": (0.95, 0.88, 0.7),
}


def material(name):
    mat = bpy.data.materials.get("prop_" + name)
    if mat:
        return mat
    mat = bpy.data.materials.new("prop_" + name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    r, g, b = COLOURS[name]
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Roughness"].default_value = 0.85 if name not in ("steel",) else 0.45
    bsdf.inputs["Metallic"].default_value = 0.6 if name in ("steel", "iron") else 0.0
    return mat


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.actions):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def finish(obj, mat, name):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material(mat))
    return obj


def box(name, size, at, mat, bevel=0.0):
    """A box `size` (x, y, z) in metres, with its centre at `at` (Blender Z up)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.active_object
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, mat, name)


def cylinder(name, radius, depth, at, mat, vertices=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotation)
    return finish(bpy.context.active_object, mat, name)


def sphere(name, radius, at, mat, squash=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=radius, location=at)
    obj = bpy.context.active_object
    obj.scale = (1, 1, squash)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_flat()
    return finish(obj, mat, name)


def lathe(name, profile, mat, sides=12):
    """A round pot or barrel from a (radius, height) profile, bottom to top."""
    mesh = bpy.data.meshes.new(name)
    verts, faces = [], []
    for r, z in profile:
        for s in range(sides):
            a = 2 * math.pi * s / sides
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for ring in range(len(profile) - 1):
        for s in range(sides):
            a = ring * sides + s
            b = ring * sides + (s + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(sides - 1, -1, -1)))  # bottom
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material(mat))
    return obj


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


def fcurves(action):
    """F-curves of an action: directly (older Blender) or in its layers (Blender 4.4+ slotted actions)."""
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


def linear(obj):
    for fc in fcurves(obj.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def parent(child, to):
    child.parent = to
    child.matrix_parent_inverse = to.matrix_world.inverted()


def export(name):
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_yup=True,
        export_extras=False,
    )
    tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == "MESH" for p in o.data.polygons)
    print(f"PROP {name}: {tris} triangles -> {path}")


# --- Props -------------------------------------------------------------------------------


def barrel():
    profile = [(0.0, 0.0), (0.27, 0.0), (0.3, 0.12), (0.32, 0.4), (0.3, 0.68), (0.27, 0.8), (0.0, 0.8)]
    body = lathe("barrel", profile, "blue")
    hoops = [cylinder(f"hoop{i}", 0.325, 0.04, (0, 0, z), "rust", 14) for i, z in enumerate((0.16, 0.64))]
    join([body, *hoops], "barrel")
    export("barrel")


def crates():
    parts = []
    for i, (x, y, z, turn) in enumerate([(0, 0, 0.17, 0), (0.48, 0.04, 0.17, 0.08), (0.22, 0.02, 0.51, -0.12)]):
        c = box(f"crate{i}", (0.44, 0.34, 0.32), (x, y, z), "wood_light", 0.01)
        c.rotation_euler[2] = turn
        parts.append(c)
        for k, dz in enumerate((-0.09, 0.09)):
            slat = box(f"slat{i}{k}", (0.45, 0.35, 0.03), (x, y, z + dz), "wood")
            slat.rotation_euler[2] = turn
            parts.append(slat)
    obj = join(parts, "crates")
    obj.location.x -= 0.24
    export("crates")


def clay_pots():
    parts = []
    for i, (x, y, s) in enumerate([(0, 0, 1.0), (0.42, 0.1, 0.8), (0.2, -0.36, 0.9)]):
        profile = [(0.0, 0.0), (0.12 * s, 0.0), (0.22 * s, 0.12 * s), (0.25 * s, 0.24 * s), (0.2 * s, 0.36 * s), (0.11 * s, 0.42 * s), (0.13 * s, 0.46 * s), (0.0, 0.46 * s)]
        pot = lathe(f"pot{i}", profile, "terracotta", 10)
        pot.location = (x, y, 0)
        parts.append(pot)
    obj = join(parts, "clay_pots")
    obj.location.x -= 0.2
    export("clay_pots")


def ac_unit():
    body = box("ac", (0.8, 0.3, 0.55), (0, -0.15, 0.275), "white", 0.02)
    grille = cylinder("fan", 0.2, 0.02, (0.13, -0.305, 0.275), "iron", 16, rotation=(math.pi / 2, 0, 0))
    bracket = [box(f"bracket{i}", (0.04, 0.34, 0.04), (x, -0.17, -0.02), "iron") for i, x in enumerate((-0.3, 0.3))]
    join([body, grille, *bracket], "ac_unit")
    export("ac_unit")


def dish_antenna():
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.34, radius2=0.06, depth=0.12, location=(0, -0.08, 0.95), rotation=(math.radians(-60), 0, 0))
    dish = finish(bpy.context.active_object, "white", "dish")
    arm = box("arm", (0.03, 0.03, 0.4), (0, -0.2, 0.82), "steel")
    arm.rotation_euler = (math.radians(35), 0, 0)
    mast = cylinder("mast", 0.025, 0.9, (0, -0.05, 0.45), "steel", 8)
    join([dish, arm, mast], "dish_antenna")
    export("dish_antenna")


def awning():
    """A striped canvas awning 2.4 m wide: fixed to the wall 2.6 m up, sloping out 0.9 m towards
    the street, with a scalloped valance and two struts back to the wall."""
    top, depth, drop = 2.6, 0.9, 0.36
    slope = math.atan2(drop, depth)
    length = math.hypot(depth, drop)
    stripes = 8
    w = 2.4 / stripes
    parts = []
    for i in range(stripes):
        mat = "canvas_a" if i % 2 == 0 else "canvas_b"
        s = box(f"stripe{i}", (w, length, 0.03), (-1.2 + w * (i + 0.5), -depth / 2, top - drop / 2), mat)
        # Positive turn about X lowers the street-side (-Y) edge.
        s.rotation_euler = (slope, 0, 0)
        parts.append(s)
        parts.append(box(f"val{i}", (w, 0.03, 0.18), (-1.2 + w * (i + 0.5), -depth, top - drop - 0.09), mat))
    # Struts from the wall, 0.5 m below the front edge's height, up to the front edge.
    rise = 0.5
    for i, x in enumerate((-1.15, 1.15)):
        strut = box(f"strut{i}", (0.03, 0.03, math.hypot(depth, rise)), (x, -depth / 2, top - drop - rise / 2), "iron")
        # The box's long axis (Z) turned about X by phi points along (0, -sin phi, cos phi).
        strut.rotation_euler = (math.atan2(depth, rise), 0, 0)
        parts.append(strut)
    join(parts, "awning")
    export("awning")


def shop_shutter():
    """Rolling shutter, 2.4 m wide and 2.6 m tall, with its box; ShutterOpen rolls it up."""
    width, height = 2.4, 2.6
    frame = [
        box("box", (width + 0.1, 0.3, 0.32), (0, -0.15, height + 0.16), "steel", 0.02),
        box("guideL", (0.06, 0.08, height), (-width / 2 - 0.03, -0.04, height / 2), "iron"),
        box("guideR", (0.06, 0.08, height), (width / 2 + 0.03, -0.04, height / 2), "iron"),
    ]
    frame_obj = join(frame, "frame")
    slats = []
    count = 18
    for i in range(count):
        z = height * (i + 0.5) / count
        slats.append(box(f"slat{i}", (width, 0.03, height / count * 0.92), (0, -0.06, z), "steel" if i % 2 else "teal"))
    curtain = join(slats, "curtain")
    # Origin at the top, so scaling the curtain's height rolls it up into the box.
    bpy.context.scene.cursor.location = (0, -0.06, height)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    handle = box("handle", (0.3, 0.06, 0.05), (0, -0.1, 0.1), "iron")
    parent(handle, curtain)
    parent(curtain, frame_obj)
    fps = bpy.context.scene.render.fps
    curtain.animation_data_create()
    action = bpy.data.actions.new("ShutterOpen")
    curtain.animation_data.action = action
    curtain.scale = (1, 1, 1)
    curtain.keyframe_insert(data_path="scale", frame=1)
    curtain.scale = (1, 1, 0.04)
    curtain.keyframe_insert(data_path="scale", frame=1 + 2 * fps)
    export("shop_shutter")


def handcart():
    """A vegetable handcart: wooden bed on two cart wheels, with heaps of produce; Roll turns the wheels."""
    bed = box("bed", (1.6, 0.9, 0.08), (0, 0, 0.8), "wood_light", 0.01)
    rails = [box(f"rail{i}", (1.6, 0.04, 0.12), (0, y, 0.88), "wood") for i, y in enumerate((-0.45, 0.45))]
    handles = [box(f"handle{i}", (0.7, 0.05, 0.05), (1.1, y, 0.82), "wood") for i, y in enumerate((-0.38, 0.38))]
    leg = box("leg", (0.05, 0.6, 0.6), (-0.7, 0, 0.5), "wood")
    axle = cylinder("axle", 0.03, 1.1, (0.1, 0, 0.45), "iron", 8, rotation=(math.pi / 2, 0, 0))
    produce = []
    for i, (x, y, mat) in enumerate([(-0.45, -0.18, "tomato"), (-0.45, 0.2, "aubergine"), (0.05, -0.18, "lime"), (0.05, 0.2, "banana"), (0.5, 0.0, "tomato")]):
        produce.append(sphere(f"heap{i}", 0.22, (x, y, 0.9), mat, 0.45))
    cart = join([bed, *rails, *handles, leg, axle, *produce], "cart")
    wheels = []
    for side, y in (("L", -0.55), ("R", 0.55)):
        rim = bpy.data.objects.new(f"wheel{side}", None)
        bpy.context.collection.objects.link(rim)
        rim.location = (0.1, y, 0.45)
        tyre = cylinder(f"tyre{side}", 0.45, 0.06, (0.1, y, 0.45), "iron", 16, rotation=(math.pi / 2, 0, 0))
        spokes = [box(f"spoke{side}{k}", (0.86, 0.03, 0.04), (0.1, y, 0.45), "wood") for k in range(3)]
        for k, s in enumerate(spokes):
            s.rotation_euler = (0, math.radians(60 * k), 0)
        ring = join([tyre, *spokes], f"wheel{side}_mesh")
        # Bake the tyre's quarter turn into the mesh, so the Roll keys start from upright.
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bpy.context.scene.cursor.location = (0.1, y, 0.45)
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        wheels.append(ring)
        bpy.data.objects.remove(rim)
    # Both wheels hang on one axle node, so a single "Roll" clip turns them together.
    axle_node = bpy.data.objects.new("axle", None)
    bpy.context.collection.objects.link(axle_node)
    axle_node.location = (0.1, 0, 0.45)
    parent(axle_node, cart)
    for w in wheels:
        parent(w, axle_node)
    fps = bpy.context.scene.render.fps
    # One metre of travel turns a 0.45 m wheel by 1 / 0.45 radians.
    axle_node.animation_data_create()
    axle_node.animation_data.action = bpy.data.actions.new("Roll")
    axle_node.rotation_euler = (0, 0, 0)
    axle_node.keyframe_insert(data_path="rotation_euler", frame=1)
    axle_node.rotation_euler = (0, 1 / 0.45, 0)
    axle_node.keyframe_insert(data_path="rotation_euler", frame=1 + fps)
    linear(axle_node)
    export("handcart")


BUILDERS = [barrel, crates, clay_pots, ac_unit, dish_antenna, awning, shop_shutter, handcart]

for build in BUILDERS:
    clear()
    build()

if PREVIEW:
    # A contact sheet: every prop in a row on warm ground under a low sun.
    clear()
    from bpy import context  # noqa: F401

    x = 0.0
    for build in BUILDERS:
        path = os.path.join(OUT, build.__name__ + ".glb")
        bpy.ops.import_scene.gltf(filepath=path)
        imported = [o for o in bpy.context.selected_objects]
        roots = [o for o in imported if o.parent is None]
        for r in roots:
            r.location.x += x
        x += 3.0
    bpy.ops.mesh.primitive_plane_add(size=60, location=(x / 2 - 1.5, 0, 0))
    ground = bpy.context.active_object
    ground.data.materials.append(material("wood_light"))
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10), rotation=(math.radians(50), math.radians(10), math.radians(-35)))
    bpy.context.active_object.data.energy = 2.5
    bpy.ops.object.camera_add(location=(x / 2 - 1.5, -17, 4.5), rotation=(math.radians(80), 0, 0))
    cam = bpy.context.active_object
    cam.data.lens = 24
    scene = bpy.context.scene
    scene.camera = cam
    scene.world = scene.world or bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.72, 0.95, 1)
    # Cycles on the CPU: Eevee needs a GPU display (EGL), which build machines often lack.
    import addon_utils

    addon_utils.enable("cycles", default_set=True)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 600
    scene.render.filepath = os.path.abspath(PREVIEW)
    bpy.ops.render.render(write_still=True)
    print("PREVIEW", scene.render.filepath)
