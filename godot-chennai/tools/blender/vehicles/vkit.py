"""
Shared kit for the Godot game's vehicle, aircraft and train models (Blender 5.2 LTS, by script).

Every model in `godot-chennai/assets/{vehicles,aircraft,trains}/` is the output of a script in
this folder; the scripts are the source (rebuild with `build_all.sh`). Nothing is copied from a
real vehicle: no make, badge, grille, airline or railway livery, logo or real number (TD-18 of
the Three.js game; brief §11).

Frames
------
Blender: Z up, the front faces +Y, ground (or rail top) at z = 0, x to the right when facing
forward. The glTF exporter writes +Y up, so in Godot the front faces -Z, +X is right, +Y up and
the ground is y = 0 (TD-2: game x = Blender x, game z = -Blender y, game y = Blender z).
Metres throughout. `g(v)` converts a Blender point to the Godot frame for the manifests.

Materials (one draw call each per mesh node)
--------------------------------------------
* `atlas`: every fixed colour (trim, glass, rubber, chrome, lamps...) is a cell of one shared
  512 x 512 palette texture (`shared/vehicle_palette*.png`: albedo, metallic-roughness and
  emission). A face of role R gets all its UVs at the centre of R's cell. No vertex colours.
* `paint`: the body colour, a plain material; the game sets `albedo_color` from the manifest's
  `paints` list (4-6 per car), so one mesh serves every colour.
* `livery_<type>`: trains and the airliner: a painted texture (512 px, 1024 for the airliner)
  with real UVs (windows, bands, doors are in the texture, not geometry).
"""
import json
import math
import os
import sys

import bpy  # first: with the bpy module, bmesh and mathutils load through it
import bmesh
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))  # godot-chennai/
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
RENDER = argv[argv.index("--render") + 1] if "--render" in argv else None

# Current level of detail: 0 is the most detailed.
LOD = 0


def seg(n, lod1=None, lod2=None):
    """Segment count for round parts at the current level of detail."""
    if LOD == 0:
        return n
    if LOD == 1:
        return lod1 if lod1 is not None else max(6, int(n * 0.5))
    return lod2 if lod2 is not None else max(4, int(n * 0.25))


# ----------------------------------------------------------------------------- palette atlas

CELLS = 8  # 8 x 8 cells of 64 px in a 512 px texture
ATLAS_PX = 512
# role: (albedo rgb (linear), roughness, metallic, emission rgb or None)
ROLES = {
    "black": ((0.025, 0.025, 0.028), 0.55, 0.0, None),
    "rubber": ((0.022, 0.022, 0.024), 0.92, 0.0, None),
    "tyre_wall": ((0.035, 0.035, 0.038), 0.85, 0.0, None),
    "chrome": ((0.82, 0.82, 0.84), 0.12, 1.0, None),
    "alloy": ((0.62, 0.63, 0.65), 0.28, 1.0, None),
    "dark_alloy": ((0.12, 0.12, 0.13), 0.32, 1.0, None),
    "steel": ((0.42, 0.42, 0.43), 0.45, 1.0, None),
    "glass": ((0.012, 0.018, 0.024), 0.08, 0.0, None),
    "glass_cockpit": ((0.06, 0.09, 0.11), 0.05, 0.3, None),
    "headlamp": ((0.85, 0.87, 0.9), 0.15, 0.0, (0.9, 0.88, 0.82)),
    "taillamp": ((0.45, 0.02, 0.02), 0.2, 0.0, (1.0, 0.05, 0.03)),
    "indicator": ((0.9, 0.42, 0.02), 0.2, 0.0, (1.0, 0.45, 0.02)),
    "interior": ((0.06, 0.058, 0.055), 0.8, 0.0, None),
    "seat_dark": ((0.05, 0.045, 0.04), 0.65, 0.0, None),
    "seat_tan": ((0.36, 0.2, 0.1), 0.55, 0.0, None),
    "carbon": ((0.04, 0.04, 0.045), 0.3, 0.2, None),
    "plate": ((0.85, 0.85, 0.82), 0.4, 0.0, None),
    "caliper": ((0.55, 0.06, 0.03), 0.35, 0.0, None),
    "brake": ((0.3, 0.3, 0.3), 0.45, 0.9, None),
    "white": ((0.82, 0.83, 0.82), 0.35, 0.0, None),
    "light_grey": ((0.5, 0.51, 0.52), 0.45, 0.0, None),
    "mid_grey": ((0.22, 0.225, 0.23), 0.5, 0.0, None),
    "dark_grey": ((0.075, 0.078, 0.08), 0.6, 0.0, None),
    "underframe": ((0.05, 0.048, 0.045), 0.8, 0.2, None),
    "bogie": ((0.07, 0.068, 0.065), 0.7, 0.4, None),
    "roof_grey": ((0.3, 0.3, 0.29), 0.7, 0.2, None),
    "pantograph": ((0.45, 0.45, 0.44), 0.45, 0.8, None),
    "insulator": ((0.55, 0.12, 0.06), 0.3, 0.0, None),
    "engine": ((0.5, 0.5, 0.52), 0.35, 0.9, None),
    "fan": ((0.18, 0.18, 0.2), 0.35, 0.9, None),
    "blade": ((0.07, 0.07, 0.075), 0.5, 0.2, None),
    "blade_tip": ((0.8, 0.45, 0.02), 0.4, 0.0, None),
    "skid": ((0.45, 0.46, 0.47), 0.5, 0.7, None),
    "teal": ((0.02, 0.2, 0.2), 0.4, 0.0, None),
    "amber": ((1.0, 0.45, 0.0), 0.4, 0.0, None),
    "red": ((0.42, 0.02, 0.02), 0.4, 0.0, None),
    "navy": ((0.01, 0.03, 0.1), 0.4, 0.0, None),
    "mint": ((0.2, 0.5, 0.38), 0.45, 0.0, None),
    "nav_red": ((0.6, 0.02, 0.02), 0.2, 0.0, (1.0, 0.02, 0.02)),
    "nav_green": ((0.02, 0.5, 0.05), 0.2, 0.0, (0.02, 1.0, 0.1)),
    "strobe": ((0.9, 0.9, 0.9), 0.2, 0.0, (1.0, 1.0, 1.0)),
    "wood": ((0.2, 0.1, 0.04), 0.7, 0.0, None),
    "screen": ((0.01, 0.015, 0.02), 0.1, 0.0, (0.05, 0.12, 0.1)),
    "yellow": ((0.75, 0.55, 0.02), 0.4, 0.0, None),
    "cream": ((0.7, 0.6, 0.4), 0.45, 0.0, None),
    "saffron": ((0.85, 0.25, 0.02), 0.4, 0.0, None),
    "brown": ((0.12, 0.05, 0.02), 0.5, 0.0, None),
    "inside_dark": ((0.012, 0.012, 0.014), 0.9, 0.0, None),
}
ROLE_CELL = {name: i for i, name in enumerate(ROLES)}
assert len(ROLES) <= CELLS * CELLS


def cell_uv(role):
    i = ROLE_CELL[role]
    cx, cy = i % CELLS, i // CELLS
    # v up in Blender UVs; row 0 at the top of the image.
    return ((cx + 0.5) / CELLS, 1.0 - (cy + 0.5) / CELLS)


def _srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def palette_images():
    """The palette atlas as three Blender images (albedo sRGB, metallic-roughness, emission)."""
    imgs = {}
    for key in ("albedo", "mr", "emit"):
        name = f"vehicle_palette_{key}"
        img = bpy.data.images.get(name)
        if img is None:
            img = bpy.data.images.new(name, ATLAS_PX, ATLAS_PX, alpha=False)
            px = [0.0] * (ATLAS_PX * ATLAS_PX * 4)
            cell = ATLAS_PX // CELLS
            for role, (rgb, rough, metal, emit) in ROLES.items():
                i = ROLE_CELL[role]
                cx, cy = i % CELLS, i // CELLS
                if key == "albedo":
                    col = tuple(_srgb(c) for c in rgb)
                elif key == "mr":
                    col = (0.0, rough, metal)
                else:
                    col = tuple(_srgb(c) for c in emit) if emit else (0.0, 0.0, 0.0)
                y0 = ATLAS_PX - (cy + 1) * cell  # Blender image rows start at the bottom
                for y in range(y0, y0 + cell):
                    base = (y * ATLAS_PX + cx * cell) * 4
                    for x in range(cell):
                        j = base + x * 4
                        px[j], px[j + 1], px[j + 2], px[j + 3] = col[0], col[1], col[2], 1.0
            # Colour space first: changing it on a generated image regenerates (blanks) the pixels.
            img.colorspace_settings.name = "sRGB" if key != "mr" else "Non-Color"
            img.pixels.foreach_set(px)
            img.update()
            img.pack()
        imgs[key] = img
    return imgs


def save_palette(directory):
    """Write the atlas PNGs (the shared copy the docs and a Godot material can point at)."""
    os.makedirs(directory, exist_ok=True)
    for key, img in palette_images().items():
        path = os.path.join(directory, f"vehicle_palette_{key}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()


def _principled(m):
    m.use_nodes = True
    m.use_backface_culling = True
    return m.node_tree.nodes["Principled BSDF"]


def atlas_material():
    m = bpy.data.materials.get("atlas")
    if m:
        return m
    m = bpy.data.materials.new("atlas")
    b = _principled(m)
    nt = m.node_tree
    imgs = palette_images()
    t_alb = nt.nodes.new("ShaderNodeTexImage")
    t_alb.image = imgs["albedo"]
    t_alb.interpolation = "Closest"
    nt.links.new(t_alb.outputs["Color"], b.inputs["Base Color"])
    t_mr = nt.nodes.new("ShaderNodeTexImage")
    t_mr.image = imgs["mr"]
    t_mr.interpolation = "Closest"
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_mr.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    t_em = nt.nodes.new("ShaderNodeTexImage")
    t_em.image = imgs["emit"]
    t_em.interpolation = "Closest"
    nt.links.new(t_em.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.0
    return m


def paint_material(rgb, rough=0.28, metal=0.35):
    m = bpy.data.materials.get("paint") or bpy.data.materials.new("paint")
    b = _principled(m)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def livery_material(name, image, rough=0.42, metal=0.15):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    b = _principled(m)
    t = m.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = image
    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def role(name):
    """A marker material for a role; `to_atlas` turns it into atlas UVs at export."""
    assert name in ROLES, name
    key = "r_" + name
    m = bpy.data.materials.get(key)
    if m is None:
        m = bpy.data.materials.new(key)
        rgb, rough, metal, emit = ROLES[name]
        b = _principled(m)
        b.inputs["Base Color"].default_value = (*rgb, 1)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
    return m


class Painter:
    """Image painter for liveries: rectangles and discs in pixel space, v up from the bottom."""

    def __init__(self, name, w, h, base):
        self.name, self.w, self.h = name, w, h
        self.px = [0.0] * (w * h * 4)
        self.rect(0, 0, w, h, base)

    def rect(self, x0, y0, x1, y1, rgb):
        c = [_srgb(v) for v in rgb]
        x0, x1 = max(0, int(round(x0))), min(self.w, int(round(x1)))
        y0, y1 = max(0, int(round(y0))), min(self.h, int(round(y1)))
        for y in range(y0, y1):
            row = y * self.w
            for x in range(x0, x1):
                j = (row + x) * 4
                self.px[j:j + 4] = (c[0], c[1], c[2], 1.0)

    def disc(self, cx, cy, r, rgb):
        c = [_srgb(v) for v in rgb]
        for y in range(max(0, int(cy - r)), min(self.h, int(cy + r) + 1)):
            for x in range(max(0, int(cx - r)), min(self.w, int(cx + r) + 1)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    j = (y * self.w + x) * 4
                    self.px[j:j + 4] = (c[0], c[1], c[2], 1.0)

    def poly(self, pts, rgb):
        """Fill a convex or concave polygon (even-odd) given in pixels."""
        c = [_srgb(v) for v in rgb]
        ys = [p[1] for p in pts]
        for y in range(max(0, int(min(ys))), min(self.h, int(max(ys)) + 1)):
            xs = []
            for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
                if (ay <= y + 0.5 < by) or (by <= y + 0.5 < ay):
                    xs.append(ax + (y + 0.5 - ay) * (bx - ax) / (by - ay))
            xs.sort()
            for a, b in zip(xs[0::2], xs[1::2]):
                for x in range(max(0, int(a)), min(self.w, int(b) + 1)):
                    j = (y * self.w + x) * 4
                    self.px[j:j + 4] = (c[0], c[1], c[2], 1.0)

    def image(self):
        img = bpy.data.images.new(self.name, self.w, self.h, alpha=False)
        img.pixels.foreach_set(self.px)
        img.update()
        img.pack()
        return img


# ----------------------------------------------------------------------------- mesh helpers


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, verts, faces, mat, uvs=None, recalc=True):
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
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    return obj


def loft(name, rings, mat, closed=True, caps=(False, False)):
    n = len(rings[0])
    verts = [v for r in rings for v in r]
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
    """Close a body's ends with rings shrinking to the centre: quads that subdivide cleanly."""
    def shrunk(r, k):
        c = sum(r, Vector()) / len(r)
        return [c + (v - c) * k for v in r]
    head = [shrunk(rings[0], k) for k in reversed(steps)]
    tail = [shrunk(rings[-1], k) for k in steps]
    return head + list(rings) + tail


def lathe(name, profile, mat, segments, axis="X"):
    """Revolve [(radius, along)] round an axis. Open ends where radius > 0."""
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
    verts = [v for r in rings for v in r]
    faces = []
    for i in range(segments):
        for j in range(n - 1):
            a, b = i * n + j, ((i + 1) % segments) * n + j
            faces.append((a, b, b + 1, a + 1))
    return mesh_object(name, verts, faces, mat)


def subsurf(obj, levels):
    if levels > 0:
        mod = obj.modifiers.new("subsurf", "SUBSURF")
        mod.levels = levels
        mod.render_levels = levels


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def boolean_cut(target, tools):
    for tool in tools:
        mod = target.modifiers.new("cut_" + tool.name, "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = tool
    apply_all(target)
    for t in tools:
        bpy.data.objects.remove(t)


def box(name, size, centre, mat, bevel=0.0, rot=(0, 0, 0), segments=1):
    """A box, rounded edges only at LOD0 (and big ones at LOD1)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel >= 0.01 and (LOD == 0 or (LOD == 1 and bevel >= 0.04)):
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments if LOD == 0 else 1
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, centre, mat, rot=(0, 0, 0), verts=24, caps=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=max(3, verts), radius=radius, depth=depth, location=centre, rotation=rot,
                                        end_fill_type="NGON" if caps else "NOTHING")
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def tube(name, a, b, radius, mat, verts=8, r2=None):
    """A straight tube (or cone with r2) from a to b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=max(3, verts), radius1=radius, radius2=radius if r2 is None else r2, depth=d.length,
                                    location=(a + b) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    obj.data.materials.append(mat)
    return obj


def path_tube(name, points, radius, mat, verts=8):
    pts = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        q = Vector((0, 0, 1)).rotation_difference(d)
        rings.append([p + q @ Vector((radius * math.cos(2 * math.pi * k / verts), radius * math.sin(2 * math.pi * k / verts), 0)) for k in range(verts)])
    return loft(name, rings, mat, caps=(True, True))


def sphere(name, radius, centre, mat, scale=(1, 1, 1), segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=max(4, segments), ring_count=max(3, rings), radius=radius, location=centre)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def cutter_cyl(name, radius, depth, centre, rot=(0, math.pi / 2, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=centre, rotation=rot)
    o = bpy.context.object
    o.name = name
    return o


def cutter_box(name, size, centre):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return o


def extrude_profile(name, profile2d, x0, x1, mat, axis="X"):
    """Extrude a closed 2D profile [(a, b)] along an axis from x0 to x1 (wings, fins, plates).
    axis X: profile is (y, z); axis Y: profile is (x, z); axis Z: profile is (x, y)."""
    def p3(a, b, t):
        if axis == "X":
            return Vector((t, a, b))
        if axis == "Y":
            return Vector((a, t, b))
        return Vector((a, b, t))
    rings = [[p3(a, b, x0) for a, b in profile2d], [p3(a, b, x1) for a, b in profile2d]]
    return loft(name, rings, mat, caps=(True, True))


def wing(name, root, tip, mat, root_chord, tip_chord, root_thick, tip_thick, sweep_le=0.0, n=10, dihedral=0.0, flat=False):
    """
    A wing panel from `root` (x, y_le, z) along +x (or -x) to span `tip` x. Airfoil sections,
    leading edge at y_le (front is +y, the trailing edge is behind). `flat` makes a flat plate.
    """
    def section(x, y_le, z, chord, thick):
        pts = []
        k = n if LOD == 0 else (6 if LOD == 1 else 4)
        top, bot = [], []
        for i in range(k + 1):
            t = i / k
            # NACA-like thickness, leading edge rounded.
            th = 5 * thick * (0.2969 * math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4)
            if flat:
                th = thick / 2
            yy = y_le - t * chord
            top.append(Vector((x, yy, z + th * chord * 0 + th)))
            bot.append(Vector((x, yy, z - th)))
        pts = top + list(reversed(bot[1:-1]))
        return pts
    rx, ry, rz = root
    tx = tip
    span = tx - rx
    rings = [
        section(rx, ry, rz, root_chord, root_thick * root_chord),
        section(tx, ry - sweep_le, rz + abs(span) * math.tan(dihedral), tip_chord, tip_thick * tip_chord),
    ]
    return loft(name, rings, mat, caps=(True, True))


def smooth(obj, angle=40.0):
    """Smooth shading with edges sharper than `angle` kept crisp."""
    me = obj.data
    me.shade_smooth()
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError:
        bm = bmesh.new()
        bm.from_mesh(me)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle):
                e.smooth = False
        bm.to_mesh(me)
        bm.free()


def flat(obj):
    obj.data.shade_flat()
    return obj


def join(objs, name):
    objs = [o for o in objs if o is not None]
    for o in objs:
        if o.modifiers:
            apply_all(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def set_origin(obj, point):
    """Move the object's origin to `point` without moving its mesh (hinges, axles, pivots)."""
    p = Vector(point)
    obj.data.transform(Matrix.Translation(obj.location - p))
    obj.location = p
    return obj


def mat_index(obj, mat):
    for i, m in enumerate(obj.data.materials):
        if m == mat:
            return i
    obj.data.materials.append(mat)
    return len(obj.data.materials) - 1


def bisect(obj, plane_co, plane_no):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane_co, plane_no=plane_no)
    bm.to_mesh(obj.data)
    bm.free()


def bisect_planes(obj, xs=(), ys=(), zs=()):
    for x in xs:
        bisect(obj, (x, 0, 0), (1, 0, 0))
    for y in ys:
        bisect(obj, (0, y, 0), (0, 1, 0))
    for z in zs:
        bisect(obj, (0, 0, z), (0, 0, 1))


def paint_faces(obj, mat, test):
    """Give `mat` to every face whose (centre, normal) passes `test` (object space)."""
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
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not test(f.calc_center_median(), f.normal)], context="FACES")
    bmesh.ops.delete(keep, geom=[f for f in keep.faces if test(f.calc_center_median(), f.normal)], context="FACES")
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


def solidify(obj, thickness):
    mod = obj.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = -1
    apply_all(obj)


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


def empty(name, location, parent=None):
    """An anchor node (seat, grip, cargo, marker): exported as a glTF node with no mesh."""
    e = link(bpy.data.objects.new(name, None))
    e.empty_display_size = 0.1
    e.location = Vector(location)
    if parent is not None:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e


def parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def decimate(obj, target_tris):
    """Collapse-decimate a mesh to about `target_tris` (keeps materials and UV islands)."""
    t = triangles([obj])
    if t <= target_tris:
        return obj
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = max(0.01, target_tris / t)
    mod.use_collapse_triangulate = True
    apply_all(obj)
    return obj


# ----------------------------------------------------------------------------- wheels


def tyre(radius, width, mat, sidewall=0.36, segments=24):
    hw = width / 2
    rim_r = radius * (1 - sidewall)
    if LOD == 0:
        prof = [
            (rim_r, -hw * 0.86), (rim_r + (radius - rim_r) * 0.45, -hw), (radius - 0.02, -hw * 0.97),
            (radius, -hw * 0.55), (radius, hw * 0.55), (radius - 0.02, hw * 0.97),
            (rim_r + (radius - rim_r) * 0.45, hw), (rim_r, hw * 0.86),
        ]
        return lathe("tyre", prof, mat, segments)
    prof = [(rim_r, -hw * 0.9), (radius - 0.02, -hw), (radius, 0.0), (radius - 0.02, hw), (rim_r, hw * 0.9)]
    return lathe("tyre", prof, mat, max(10, segments // 2))


def car_wheel(name, location, radius, width, spokes=5, rim_role="alloy", face_sign=None, caliper=None, sidewall=0.36):
    """Tyre, rim with spokes (LOD0), brake disc; the rim face on the outside (+x on the right)."""
    hw = width / 2
    rim_r = radius * (1 - sidewall)
    sx = face_sign if face_sign is not None else (1 if location[0] >= 0 else -1)
    face = hw * 0.78
    parts = [tyre(radius, width, role("rubber"), sidewall=sidewall, segments=seg(28, 16))]
    if LOD > 0:
        parts.append(lathe("rim", [(rim_r + 0.01, face), (rim_r * 0.35, face - 0.012), (0.0001, face - 0.005)], role(rim_role), seg(16, 10)))
    else:
        parts.append(lathe("rim", [(rim_r + 0.012, face), (rim_r, face - 0.012), (rim_r - 0.008, -hw * 0.8)], role(rim_role), 24))
        parts.append(lathe("hub", [(rim_r * 0.24, face - 0.03), (rim_r * 0.2, face + 0.003), (0.0001, face + 0.006)], role(rim_role), 10))
        parts.append(cylinder("dark", rim_r - 0.004, 0.004, (face - 0.05, 0, 0), role("dark_alloy"), rot=(0, math.pi / 2, 0), verts=16))
        for i in range(spokes):
            a = 2 * math.pi * i / spokes
            for off in (-0.11, 0.11):
                aa = a + off * 0.5
                mid = rim_r * 0.58
                s = box("spoke", (0.026, rim_r * 0.82, 0.032), (face - 0.016, math.cos(aa) * mid, math.sin(aa) * mid), role(rim_role))
                s.rotation_euler = (aa, 0, 0)
                parts.append(s)
        parts.append(cylinder("brake", rim_r * 0.8, 0.025, (-hw * 0.05, 0, 0), role("brake"), rot=(0, math.pi / 2, 0), verts=16))
        if caliper:
            parts.append(box("caliper", (0.05, 0.09, 0.14), (face - 0.08, -rim_r * 0.55, rim_r * 0.2), role(caliper), bevel=0.012))
    w = join(parts, name)
    if sx < 0:
        w.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        w.data.flip_normals()
    for p in w.data.polygons:
        p.use_smooth = True
    w.location = location
    return w


# ----------------------------------------------------------------------------- car bodies


def ring(y, wl, zb, zbelt, zt, wt, rb=0.08, rt=0.12, flare=0.0):
    """One cross-section of a car body at y (hatchback method of the Three.js game's script)."""
    mid = zb + (zbelt - zb) * 0.55
    sh = max(zbelt + 0.012, min(zt - rt * 1.2, zbelt + 0.04))
    gl = zbelt + (zt - rt - zbelt) * 0.5
    half = [
        (0.0, zb), (wl - rb, zb), (wl - rb * 0.2, zb + rb * 0.25), (wl, mid), (wl + flare, zbelt - 0.06),
        (wl - 0.006, zbelt), (wl - 0.03, sh), (wt + (wl - 0.03 - wt) * 0.45, max(sh + 0.005, gl)),
        (wt, max(sh + 0.01, zt - rt)), (wt - rt * 0.35, zt - rt * 0.3), (wt - rt, zt), (0.0, zt),
    ]
    pts = half + [(-x, z) for x, z in reversed(half[1:-1])]
    return [Vector((x, y, z)) for x, z in pts]


def lerp_sections(sections, y, k):
    for a, b in zip(sections, sections[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return a[k] + (b[k] - a[k]) * t
    return sections[0][k] if y < sections[0][0] else sections[-1][k]


def car_shell(name, sections, mat, axles, arch_r, axle_z, arch_x, levels):
    shell = loft(name, inset_ends([ring(*s) for s in sections]), mat, caps=(True, True))
    subsurf(shell, levels)
    apply_all(shell)
    cuts = [cutter_cyl(f"arch{sx}{y}", arch_r, 0.5, (sx * arch_x, y, axle_z), verts=seg(36, 20)) for y in axles for sx in (1, -1)]
    boolean_cut(shell, cuts)
    return shell


# ----------------------------------------------------------------------------- atlas pass and export


def triangles(objs=None):
    total = 0
    for o in objs if objs is not None else bpy.context.scene.objects:
        if o.type == "MESH":
            total += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return total


def to_atlas(obj):
    """Role materials -> the shared atlas: each face's UVs at its role's cell centre."""
    me = obj.data
    if len(me.uv_layers) == 0:
        me.uv_layers.new(name="UVMap")
    while len(me.uv_layers) > 1:  # one UV set only (joins can bring several)
        me.uv_layers.remove(me.uv_layers[-1])
    me.uv_layers.active_index = 0
    uv = me.uv_layers[0].data
    atlas = atlas_material()
    keep = {}
    new_mats = []

    def slot_for(m):
        if m.name not in keep:
            keep[m.name] = len(new_mats)
            new_mats.append(m)
        return keep[m.name]

    remap = {}
    for i, m in enumerate(me.materials):
        if m is None:  # faces added by a boolean cutter (arch liners, cut edges): dark trim
            remap[i] = (slot_for(atlas), cell_uv("black"))
        elif m.name.startswith("r_"):
            remap[i] = (slot_for(atlas), cell_uv(m.name[2:]))
        else:
            remap[i] = (slot_for(m), None)
    slots = []
    for p in me.polygons:
        slot, cuv = remap.get(p.material_index, (0, None))
        if cuv is not None:
            for li in p.loop_indices:
                uv[li].uv = cuv
        slots.append(slot)
    me.materials.clear()  # (this resets every face's material index)
    for m in new_mats:
        me.materials.append(m)
    for p, slot in zip(me.polygons, slots):
        p.material_index = slot
    return obj


def merge_by_distance(obj, dist=0.0005):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(obj.data)
    bm.free()


def export_glb(path):
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            if o.modifiers:
                apply_all(o)
            to_atlas(o)
    bpy.ops.object.select_all(action="SELECT")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_extras=False,
              export_animations=False, export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False,
              export_image_format="AUTO", export_tangents=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    nodes = {o.name: triangles([o]) for o in bpy.context.scene.objects if o.type == "MESH"}
    print(f"MODEL {os.path.relpath(path, ROOT)}: {triangles()} triangles; " + ", ".join(f"{k} {v}" for k, v in sorted(nodes.items())))
    return triangles()


def g(v):
    """Blender point -> Godot/glTF frame (+Y up, -Z forward), rounded to mm."""
    v = Vector(v)
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def g_axis(v):
    v = Vector(v)
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def scene_bounds(objs=None):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs if objs is not None else bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def size_godot(lo, hi):
    """Width (x), height (y), length (z) in the Godot frame."""
    return [round(hi.x - lo.x, 3), round(hi.z - lo.z, 3), round(hi.y - lo.y, 3)]


LICENCE = ("Original work for this project, generated by the script named in `source` with Blender 5.2 LTS. "
           "No real make, badge, logo, livery, airline, railway mark or registration; reference photos, if any, "
           "were used only for proportions, never as textures.")


def write_manifest(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")
    print("MANIFEST", os.path.relpath(path, ROOT))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def workbench_render(path, eye, target, res=(1280, 720)):
    """A quick Workbench preview (the review screenshots are taken in Godot)."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x, scene.render.resolution_y = res
    cam = bpy.data.objects.get("preview_cam") or link(bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam")))
    cam.location = Vector(eye)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y")
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
