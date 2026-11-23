"""
Preview of the street props' animations: a shop front (wall, awning, rolling shutter) opens for
the day while a vegetable handcart rolls past. Renders PNG frames with Cycles on the CPU.

    blender -b --factory-startup --python tools/blender/preview_animation.py -- <props dir> <frames dir>

Then e.g. `ffmpeg -framerate 24 -i <frames dir>/%04d.png preview.mp4`. Only for looking at the
props; the game plays the same clips (ShutterOpen, Roll) from the exported GLBs.
"""
import math
import os
import sys

import addon_utils
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
PROPS, FRAMES = (os.path.abspath(a) for a in argv[:2])
os.makedirs(FRAMES, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
scene = bpy.context.scene
fps = scene.render.fps
scene.frame_start, scene.frame_end = 1, 3 * fps


def flat(name, rgb):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def place(name, location, rotation_z=0.0):
    bpy.ops.import_scene.gltf(filepath=os.path.join(PROPS, name + ".glb"))
    roots = [o for o in bpy.context.selected_objects if o.parent is None]
    for r in roots:
        r.location = location
        r.rotation_euler[2] = rotation_z
    return roots


# The shop: a plastered wall with the shutter, an awning over it and an AC unit above.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.15, 2.2))
wall = bpy.context.active_object
wall.scale = (6, 0.3, 4.4)
wall.data.materials.append(flat("plaster", (0.85, 0.66, 0.45)))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.3, 3.6))
sign = bpy.context.active_object
sign.scale = (2.6, 0.06, 0.55)
sign.data.materials.append(flat("signboard", (0.93, 0.7, 0.12)))
shutter = place("shop_shutter", (0, 0, 0))
place("awning", (0, 0, 0.7))
place("ac_unit", (2.0, 0, 3.0))
place("barrel", (-2.3, -0.6, 0))
place("clay_pots", (2.0, -0.7, 0))
cart = place("handcart", (-7, -3.2, 0))

# Shutter rolls up from 0.5 s; the cart moves 1 m a second along the street, wheels rolling.
for obj in bpy.data.objects:
    if obj.animation_data and obj.animation_data.action:
        name = obj.animation_data.action.name
        # ShutterOpen holds its last key (rolled up) after 2 s: keys extrapolate constantly.
        if name.startswith("Roll"):
            track = obj.animation_data.nla_tracks.new()
            strip = track.strips.new("Roll", 1, obj.animation_data.action)
            strip.repeat = 3 * fps / max(1, strip.action_frame_end - strip.action_frame_start)
            obj.animation_data.action = None
for root in cart:
    root.keyframe_insert(data_path="location", frame=1)
    root.location.x += 3.0 * 2.2
    root.keyframe_insert(data_path="location", frame=3 * fps)

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, -6, 0))
bpy.context.active_object.data.materials.append(flat("road", (0.72, 0.6, 0.45)))
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(55), math.radians(15), math.radians(-30)))
bpy.context.active_object.data.energy = 3
bpy.ops.object.camera_add(location=(4.5, -11, 2.6), rotation=(math.radians(84), 0, math.radians(20)))
scene.camera = bpy.context.active_object
scene.camera.data.lens = 28
scene.world = scene.world or bpy.data.worlds.new("World")
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.5, 0.7, 0.95, 1)

addon_utils.enable("cycles", default_set=True)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x, scene.render.resolution_y = 720, 405
scene.render.filepath = os.path.join(FRAMES, "")
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(animation=True)
print("FRAMES", FRAMES, scene.frame_end)
