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
import random
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
    # Street-life props (realistic set): measured-looking proportions, muted real-world colours.
    "paint": (0.8, 0.8, 0.8),  # recoloured per copy by the game (bike paint, chair plastic)
    "rubber": (0.05, 0.05, 0.05),
    "chrome": (0.62, 0.63, 0.64),
    "seat": (0.07, 0.07, 0.07),
    "engine": (0.2, 0.2, 0.21),
    "lamp": (0.92, 0.9, 0.82),
    "tail": (0.55, 0.06, 0.05),
    "plate": (0.9, 0.9, 0.88),
    "cabinet": (0.16, 0.33, 0.42),  # faded blue-green enamel paint of a petty-shop counter
    "tin": (0.5, 0.52, 0.5),
    "glass": (0.62, 0.7, 0.68),
    "lid_red": (0.62, 0.1, 0.08),
    "lid_blue": (0.1, 0.22, 0.5),
    "biscuit": (0.72, 0.48, 0.22),
    "rusk": (0.82, 0.6, 0.3),
    "sweets": (0.85, 0.42, 0.3),
    "foil_red": (0.75, 0.12, 0.1),
    "foil_yellow": (0.92, 0.72, 0.1),
    "foil_green": (0.15, 0.5, 0.25),
    "foil_blue": (0.12, 0.3, 0.65),
    "foil_silver": (0.7, 0.7, 0.72),
    "jasmine": (0.93, 0.93, 0.88),
    "marigold": (0.93, 0.45, 0.04),
    "marigold_y": (0.95, 0.68, 0.05),
    "rose": (0.65, 0.05, 0.12),
    "banana_leaf": (0.2, 0.42, 0.12),
    "basket": (0.55, 0.4, 0.2),
    "bamboo": (0.6, 0.5, 0.3),
    "orange": (0.9, 0.5, 0.08),
    "apple": (0.6, 0.08, 0.08),
    "grape": (0.42, 0.6, 0.2),
    "onion": (0.62, 0.25, 0.3),
    "umbrella_a": (0.12, 0.3, 0.6),
    "umbrella_b": (0.85, 0.82, 0.75),
}

# Wear: every vertex of every prop gets a colour (exported as COLOR_0 and multiplied into the
# base colour by the game): a little darker towards the ground (dust and grime), plus a small
# random variation, so flat paint reads as used rather than new.
_wear = random.Random(7)


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


def wear():
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        attr = mesh.color_attributes.new("wear", "BYTE_COLOR", "POINT")
        world = obj.matrix_world
        for v in mesh.vertices:
            z = (world @ v.co).z
            grime = 0.78 + 0.22 * min(1.0, max(0.0, z / 0.6))
            k = grime * (0.95 + 0.05 * _wear.random())
            attr.data[v.index].color = (k, k, k, 1.0)
        mesh.color_attributes.active_color = attr


def export(name):
    path = os.path.join(OUT, name + ".glb")
    wear()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_yup=True,
        export_extras=False,
        export_vertex_color="ACTIVE",
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
    """A 0.6 m DTH dish on a short mast. The bowl opens towards -Y (the model's front) and up at
    70 degrees, about the elevation of the Indian DTH satellites seen from Chennai; the game
    turns the front to the south-east."""
    elevation = math.radians(70)
    opening = Vector((0, -math.cos(elevation), math.sin(elevation)))
    centre = Vector((0, -0.08, 0.95))
    # The cone's narrow end (+Z) is the back of the bowl: turn +Z to point away from `opening`.
    tilt = math.atan2(opening.y, -opening.z)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.32, radius2=0.06, depth=0.1, location=centre, rotation=(tilt, 0, 0))
    dish = finish(bpy.context.active_object, "white", "dish")
    arm_tilt = math.atan2(-opening.y, opening.z)
    arm = box("arm", (0.025, 0.025, 0.42), centre + opening * 0.2 + Vector((0, 0, -0.12)), "steel")
    arm.rotation_euler = (arm_tilt, 0, 0)
    lnb = box("lnb", (0.05, 0.05, 0.09), centre + opening * 0.4, "iron")
    lnb.rotation_euler = (arm_tilt, 0, 0)
    mast = cylinder("mast", 0.025, 0.9, (0, -0.05, 0.45), "steel", 8)
    join([dish, arm, lnb, mast], "dish_antenna")
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


# --- Street-life props (realistic set) -----------------------------------------------------
# Proportions from typical Chennai street items (estimated, not measured on any one object).
# Wall-backed stalls (tea_stall, flower_stall) have their back edge on the wall line, y = 0,
# like the wall-mounted props, and stand out towards -Y (the street).


def rbox(name, size, at, mat, rot=(0, 0, 0), bevel=0.0):
    """A box turned by `rot` (Euler XYZ, radians) about its centre."""
    obj = box(name, size, at, mat, bevel)
    obj.rotation_euler = rot
    return obj


def bake(obj):
    """Apply an object's location, rotation and scale to its mesh."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def spoked_wheel(name, radius, width, spokes, sides=16, tyre="rubber", rim="chrome"):
    """A wheel at the origin standing in the YZ plane (axle along X): a tyre ring with a flat
    tread, wire spokes and a hub."""
    ring = bpy.data.meshes.new(name + "_tyre")
    verts, faces = [], []
    inner = radius - 0.045
    for k in range(sides):
        a = 2 * math.pi * k / sides
        c, s_ = math.cos(a), math.sin(a)
        for r, x in ((radius, -width / 2), (radius, width / 2), (inner, width / 2), (inner, -width / 2)):
            verts.append((x, r * c, r * s_))
    for k in range(sides):
        a = k * 4
        b = ((k + 1) % sides) * 4
        for e in range(4):
            faces.append((a + e, b + e, b + (e + 1) % 4, a + (e + 1) % 4))
    ring.from_pydata(verts, [], faces)
    ring.update()
    tyre_obj = bpy.data.objects.new(name + "_tyre", ring)
    bpy.context.collection.objects.link(tyre_obj)
    tyre_obj.data.materials.append(material(tyre))
    parts = [tyre_obj, cylinder(name + "_hub", 0.045, width + 0.04, (0, 0, 0), "iron", 8, rotation=(0, math.pi / 2, 0))]
    for k in range(spokes):
        parts.append(bake(rbox(f"{name}_spoke{k}", (0.008, 2 * inner, 0.008), (0, 0, 0), rim, rot=(math.pi * k / spokes, 0, 0))))
    return join(parts, name)


def place_wheel(wheel, at, base, name):
    """Move a wheel made by `spoked_wheel` to `at` and join it into `base`."""
    wheel.location = at
    bake(wheel)
    return join([base, wheel], name)


def tea_stall():
    """A petty shop / tea stall counter: a painted wooden counter with a steel top, glass jars of
    biscuits and rusks with coloured lids, a steel tea boiler with a tap on a stove, strips of
    snack sachets hanging from a frame under a tin sheet, and a wooden bench beside it."""
    w, d, h = 1.5, 0.62, 0.95
    cx = -0.65
    parts = [box("counter", (w, d, h - 0.04), (cx, -d / 2, (h - 0.04) / 2), "cabinet", 0.01)]
    parts.append(box("top", (w + 0.04, d + 0.04, 0.04), (cx, -d / 2, h - 0.02), "steel"))
    parts.append(box("plinth", (w + 0.02, d + 0.02, 0.08), (cx, -d / 2, 0.04), "wood"))
    # Glass jars along the front edge: glass shell, contents showing through, lid.
    fill = ["biscuit", "rusk", "sweets", "biscuit", "rusk"]
    for i in range(5):
        x = cx - w / 2 + 0.18 + i * 0.2
        y = -d + 0.14
        parts.append(cylinder(f"jar{i}", 0.085, 0.26, (x, y, h + 0.13), "glass", 10))
        parts.append(cylinder(f"fill{i}", 0.087, 0.16, (x, y, h + 0.09), fill[i], 10))
        parts.append(cylinder(f"lid{i}", 0.07, 0.05, (x, y, h + 0.285), "lid_red" if i % 2 else "lid_blue", 10))
    # Tea boiler: a tall steel urn with a domed lid and a tap, on a squat stove; a kettle beside it.
    bx, by = cx + w / 2 - 0.22, -0.2
    parts.append(box("stove", (0.32, 0.32, 0.16), (bx, by, h + 0.08), "iron"))
    urn = lathe("boiler", [(0.0, 0.0), (0.15, 0.0), (0.16, 0.05), (0.16, 0.42), (0.13, 0.47), (0.05, 0.52), (0.0, 0.53)], "steel", 12)
    urn.location = (bx, by, h + 0.16)
    parts.append(urn)
    parts.append(cylinder("tap", 0.015, 0.1, (bx, by - 0.2, h + 0.24), "rusk", 6, rotation=(math.pi / 2, 0, 0)))
    parts.append(cylinder("kettle", 0.08, 0.16, (bx - 0.3, by, h + 0.08), "steel", 10))
    # Frame: posts at the corners, a bar for the sachet strips, a tin sheet on top.
    for i, x in enumerate((cx - w / 2 - 0.02, cx + w / 2 + 0.02)):
        parts.append(box(f"post{i}", (0.04, 0.04, 2.1), (x, -d - 0.05, 1.05), "iron"))
        parts.append(box(f"backpost{i}", (0.04, 0.04, 2.25), (x, -0.03, 1.125), "iron"))
    parts.append(box("bar", (w + 0.1, 0.03, 0.03), (cx, -d - 0.05, 1.85), "iron"))
    parts.append(rbox("sheet", (w + 0.4, d + 0.5, 0.02), (cx, -d / 2 - 0.15, 2.17), "tin", rot=(math.radians(-10), 0, 0)))
    foils = ["foil_red", "foil_yellow", "foil_green", "foil_blue", "foil_silver", "foil_red", "foil_yellow", "foil_blue", "foil_green"]
    for i, mat in enumerate(foils):
        x = cx - w / 2 + 0.1 + i * (w - 0.2) / (len(foils) - 1)
        length = 0.55 + 0.15 * ((i * 7) % 3) / 2
        parts.append(box(f"strip{i}", (0.08, 0.008, length), (x, -d - 0.05, 1.84 - length / 2), mat))
    # A wooden bench beside the counter, along the wall.
    bxs = 0.75
    parts.append(box("bench", (1.2, 0.3, 0.05), (bxs, -0.3, 0.44), "wood", 0.005))
    for i, x in enumerate((bxs - 0.5, bxs + 0.5)):
        parts.append(box(f"benchleg{i}", (0.05, 0.26, 0.42), (x, -0.3, 0.21), "wood"))
    join(parts, "tea_stall")
    export("tea_stall")


def flower_stall():
    """A flower seller's stall: a low wooden platform covered with banana leaf, heaps of orange
    and yellow marigold and red roses, a basket and coils of jasmine, and strings of jasmine
    hanging from a bamboo pole at the back."""
    w, d, h = 1.4, 0.8, 0.55
    parts = [box("platform", (w, d, 0.06), (0, -d / 2, h - 0.03), "wood_light", 0.01)]
    for i, (x, y) in enumerate(((-w / 2 + 0.05, -0.05), (w / 2 - 0.05, -0.05), (-w / 2 + 0.05, -d + 0.05), (w / 2 - 0.05, -d + 0.05))):
        parts.append(box(f"leg{i}", (0.05, 0.05, h - 0.06), (x, y, (h - 0.06) / 2), "iron"))
    parts.append(box("leaf", (w - 0.1, d - 0.1, 0.01), (0, -d / 2, h + 0.005), "banana_leaf"))
    for i, (x, y, r, mat) in enumerate(((-0.42, -0.5, 0.2, "marigold"), (-0.05, -0.55, 0.17, "marigold_y"), (0.3, -0.5, 0.15, "rose"))):
        parts.append(sphere(f"heap{i}", r, (x, y, h + 0.02), mat, 0.45))
    basket = lathe("basket", [(0.0, 0.0), (0.16, 0.0), (0.2, 0.12), (0.21, 0.14), (0.0, 0.14)], "basket", 10)
    basket.location = (0.45, -0.22, h)
    parts.append(basket)
    parts.append(sphere("jasmine_heap", 0.17, (0.45, -0.22, h + 0.12), "jasmine", 0.35))
    for i, x in enumerate((-0.4, -0.05)):
        parts.append(cylinder(f"coil{i}", 0.12, 0.05, (x, -0.2, h + 0.03), "jasmine", 10))
    # Bamboo pole on two posts at the back, with jasmine strings hanging from it.
    for i, x in enumerate((-w / 2 + 0.03, w / 2 - 0.03)):
        parts.append(box(f"pole{i}", (0.04, 0.04, 1.75), (x, -0.04, 0.875), "bamboo"))
    parts.append(cylinder("bar", 0.02, w, (0, -0.06, 1.7), "bamboo", 6, rotation=(0, math.pi / 2, 0)))
    for i in range(11):
        x = -w / 2 + 0.12 + i * (w - 0.24) / 10
        length = 0.7 + 0.25 * ((i * 5) % 4) / 3
        parts.append(box(f"string{i}", (0.035, 0.03, length), (x, -0.08, 1.7 - length / 2), "jasmine"))
        if i % 3 == 0:
            parts.append(box(f"tie{i}", (0.04, 0.035, 0.05), (x, -0.08, 1.7 - length * 0.55), "marigold"))
    join(parts, "flower_stall")
    export("flower_stall")


def pushcart():
    """A fruit and vegetable pushcart (thallu vandi): a wooden tray on a steel frame with four
    spoked wheels, a stepped display of fruit heaps, a push bar and a big umbrella. Length along
    Y, push bar at +Y."""
    L, W, top = 1.8, 0.95, 0.82
    parts = [box("bed", (W, L, 0.05), (0, 0, top), "wood_light", 0.01)]
    for i, x in enumerate((-W / 2, W / 2)):
        parts.append(box(f"rimside{i}", (0.03, L, 0.1), (x, 0, top + 0.05), "wood"))
    for i, y in enumerate((-L / 2, L / 2)):
        parts.append(box(f"rimend{i}", (W, 0.03, 0.1), (0, y, top + 0.05), "wood"))
    parts.append(box("step", (W * 0.45, L * 0.8, 0.14), (0, 0, top + 0.09), "wood_light"))
    for i, x in enumerate((-W / 2 + 0.06, W / 2 - 0.06)):
        parts.append(box(f"frame{i}", (0.04, L * 0.95, 0.04), (x, 0, top - 0.06), "iron"))
    for i, y in enumerate((-0.55, 0.55)):
        parts.append(cylinder(f"axle{i}", 0.02, W + 0.1, (0, y, 0.26), "iron", 6, rotation=(0, math.pi / 2, 0)))
        for k, x in enumerate((-W / 2 + 0.1, W / 2 - 0.1)):
            parts.append(box(f"strut{i}{k}", (0.03, 0.03, top - 0.3), (x, y, (top + 0.26) / 2 - 0.04), "iron"))
    for i, x in enumerate((-W / 2 + 0.05, W / 2 - 0.05)):
        parts.append(rbox(f"handle{i}", (0.03, 0.45, 0.03), (x, L / 2 + 0.2, top + 0.1), "iron", rot=(math.radians(20), 0, 0)))
    parts.append(cylinder("pushbar", 0.02, W, (0, L / 2 + 0.41, top + 0.18), "iron", 6, rotation=(0, math.pi / 2, 0)))
    heaps = [(-0.3, -0.6, "orange"), (0.3, -0.6, "apple"), (-0.3, 0.0, "onion"), (0.3, 0.05, "tomato"), (-0.3, 0.6, "lime"), (0.3, 0.6, "grape")]
    for i, (x, y, mat) in enumerate(heaps):
        parts.append(sphere(f"heap{i}", 0.2, (x, y, top + 0.06), mat, 0.5))
    for i, y in enumerate((-0.45, -0.15, 0.15, 0.45)):
        parts.append(rbox(f"banana{i}", (0.3, 0.12, 0.07), (0, y, top + 0.2), "banana", rot=(0, math.radians(15), 0), bevel=0.02))
    # Umbrella on a pole at the front corner.
    ux, uy = W / 2 - 0.06, -L / 2 + 0.06
    parts.append(cylinder("upole", 0.015, 1.5, (ux, uy, top + 0.75), "iron", 6))
    for k in range(8):
        a0 = 2 * math.pi * k / 8
        a1 = 2 * math.pi * (k + 1) / 8
        mesh = bpy.data.meshes.new(f"canopy{k}")
        cz, R = top + 1.55, 0.95
        mesh.from_pydata([(ux, uy, cz), (ux + R * math.cos(a0), uy + R * math.sin(a0), cz - 0.35), (ux + R * math.cos(a1), uy + R * math.sin(a1), cz - 0.35)], [], [(0, 1, 2)])
        mesh.update()
        o = bpy.data.objects.new(f"canopy{k}", mesh)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(material("umbrella_a" if k % 2 else "umbrella_b"))
        parts.append(o)
    cart = join(parts, "pushcart")
    for i, y in enumerate((-0.55, 0.55)):
        for k, x in enumerate((-W / 2 - 0.03, W / 2 + 0.03)):
            cart = place_wheel(spoked_wheel(f"wheel{i}{k}", 0.26, 0.04, 4, sides=10), (x, y, 0.26), cart, "pushcart")
    export("pushcart")


def chair_stack():
    """A stack of six moulded plastic chairs (the plain kind every eatery and function hall
    has), recoloured per copy by the game (material `paint`)."""
    parts = []
    for k in range(6):
        z0 = k * 0.075
        y0 = k * 0.025
        seat_h = 0.44 + z0
        parts.append(rbox(f"seat{k}", (0.46, 0.44, 0.03), (0, y0 - 0.02, seat_h), "paint", rot=(math.radians(-3), 0, 0)))
        parts.append(rbox(f"back{k}", (0.44, 0.03, 0.42), (0, y0 + 0.21, seat_h + 0.25), "paint", rot=(math.radians(-12), 0, 0)))
        for i, x in enumerate((-0.25, 0.25)):
            parts.append(box(f"arm{k}{i}", (0.04, 0.4, 0.03), (x, y0, seat_h + 0.2), "paint"))
        if k == 0:
            for i, (x, y) in enumerate(((-0.22, -0.2), (0.22, -0.2), (-0.22, 0.2), (0.22, 0.2))):
                parts.append(rbox(f"leg{i}", (0.035, 0.035, 0.46), (x * 1.08, y * 1.08, 0.22), "paint", rot=(math.copysign(0.1, y), math.copysign(0.1, -x), 0)))
        else:
            # Only the outer edge of each upper chair's legs shows round the one below.
            for i, x in enumerate((-0.25, 0.25)):
                parts.append(box(f"legs{k}{i}", (0.035, 0.44, 0.06), (x * 1.05, y0 - 0.02, seat_h - 0.06), "paint"))
    join(parts, "chair_stack")
    export("chair_stack")


def two_wheeler():
    """A generic commuter motorcycle on its side stand (no brand, no badge): spoked wheels,
    painted tank and side panels (material `paint`, recoloured per copy), black seat, engine,
    silencer, headlamp and a blank number plate. Front towards -Y; it leans 8 degrees onto the
    stand on its left, as bikes park in India."""
    wb, r = 1.25, 0.3
    fy, ry = -wb / 2, wb / 2
    parts = [box("frame", (0.08, 0.9, 0.08), (0, 0.0, 0.62), "iron")]
    parts.append(rbox("tank", (0.26, 0.42, 0.18), (0, -0.25, 0.8), "paint", rot=(math.radians(6), 0, 0), bevel=0.04))
    parts.append(box("seat", (0.26, 0.6, 0.08), (0, 0.22, 0.79), "seat", 0.025))
    parts.append(box("panel", (0.28, 0.26, 0.16), (0, 0.18, 0.66), "paint", 0.02))
    parts.append(box("engine", (0.24, 0.36, 0.26), (0, -0.08, 0.36), "engine", 0.03))
    parts.append(rbox("silencer", (0.08, 0.6, 0.08), (0.17, 0.32, 0.36), "chrome", rot=(math.radians(-8), 0, 0)))
    parts.append(rbox("guard_r", (0.13, 0.45, 0.02), (0, ry - 0.05, r + 0.33), "paint", rot=(math.radians(-20), 0, 0)))
    parts.append(box("tail", (0.12, 0.05, 0.06), (0, ry + 0.2, 0.74), "tail"))
    parts.append(box("plate", (0.2, 0.01, 0.12), (0, ry + 0.24, 0.62), "plate"))
    parts.append(rbox("swingarm", (0.04, 0.5, 0.04), (0.08, ry / 2 + 0.05, 0.33), "iron", rot=(math.radians(8), 0, 0)))
    # Front fork raked back 25 degrees (its foot at the front axle), handlebar, headlamp.
    rake = math.radians(25)
    fork = 0.62
    for i, x in enumerate((-0.07, 0.07)):
        parts.append(rbox(f"fork{i}", (0.035, 0.035, fork), (x, fy + math.sin(rake) * fork / 2, r + math.cos(rake) * fork / 2), "chrome", rot=(-rake, 0, 0)))
    ty, tz = fy + math.sin(rake) * fork, r + math.cos(rake) * fork
    parts.append(box("bar", (0.7, 0.03, 0.03), (0, ty + 0.05, tz + 0.12), "iron"))
    for i, x in enumerate((-0.34, 0.34)):
        parts.append(box(f"grip{i}", (0.1, 0.04, 0.04), (x, ty + 0.05, tz + 0.12), "rubber"))
    parts.append(cylinder("headlamp", 0.08, 0.1, (0, ty - 0.1, tz), "lamp", 10, rotation=(math.pi / 2, 0, 0)))
    parts.append(box("cowl", (0.2, 0.12, 0.16), (0, ty - 0.02, tz + 0.02), "paint", 0.02))
    parts.append(rbox("guard_f", (0.11, 0.35, 0.02), (0, fy, r + 0.08), "paint", rot=(math.radians(8), 0, 0)))
    # Side stand on the left (-X), down to the ground.
    parts.append(rbox("stand", (0.025, 0.025, 0.36), (-0.16, 0.0, 0.17), "iron", rot=(0, math.radians(-25), 0)))
    bike = join(parts, "two_wheeler")
    for name, y in (("front", fy), ("rear", ry)):
        bike = place_wheel(spoked_wheel(f"wheel_{name}", r, 0.09, 5, sides=12), (0, y, r), bike, "two_wheeler")
    # Lean onto the stand: turn about the line where the tyres touch the ground.
    bike.rotation_euler = (0, math.radians(-8), 0)
    bake(bike)
    export("two_wheeler")


BUILDERS = [barrel, crates, clay_pots, ac_unit, dish_antenna, awning, shop_shutter, handcart, tea_stall, flower_stall, pushcart, chair_stack, two_wheeler]

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
