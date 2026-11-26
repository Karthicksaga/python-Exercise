"""
Shared kit for the landmark models (Blender 5.2 LTS, by script; decisions G-183, G-184).

Every model in `godot-chennai/assets/landmarks/<id>/` is built from its spec
(`assets/landmarks/<id>/spec.json`) by the kit script named in the spec (`recipe.kit`). The scripts
are the source; the GLB is output. Same spec, same Blender version -> the same GLB bytes
(no random numbers, no timestamps, no set iteration; `build.json` records the hashes).

Frames
------
Spec and game: world metres, +X east, +Z south (TD-2). The GLB's origin is the spec's `origin`
and its axes are the world's (the model is built in world orientation, so the game places it
with a translation only). Blender: x = game x, y = -game z (north), z up; the glTF exporter
writes +Y up, which gives back the game frame.

Geometry is collected in plain Python lists (`Acc`) and turned into one Blender mesh per level
of detail, flat shaded, with a linear vertex colour per face corner (the game draws every
landmark with one shared vertex-coloured material: one draw call per visible LOD).

Nodes in the GLB
----------------
`LOD0`, `LOD1`, `LOD2`: the model at three levels of detail (the game sets visibility ranges).
`COL_<n>`: boxes (8 vertices, any yaw) that the game turns into Jolt box shapes and removes.
"""
import hashlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

from atlas import Tile  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))  # godot-chennai/
SPECS = os.path.join(ROOT, "assets", "landmarks")


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def hex_to_linear(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def game_to_blender(x, z):
    return (x, -z)


class Acc:
    """Triangles and quads with one colour per face, in Blender coordinates."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.colours = []

    def face(self, pts, colour):
        base = len(self.verts)
        for p in pts:
            self.verts.append((round(p[0], 4), round(p[1], 4), round(p[2], 4)))
        self.faces.append(tuple(range(base, base + len(pts))))
        self.colours.append(colour)

    def triangles(self):
        return sum(len(f) - 2 for f in self.faces)

    def strip(self, a, b, z0a, z1a, z0b, z1b, tile, piece, out=None, flip=False):
        """A wall-like strip from point a to b (Blender xy) with bottom/top heights at each end,
        cut into pieces of `piece` metres so a pattern painted for that length repeats true: the
        last piece shows only the matching part of the tile. `out` pushes it along its normal."""
        a, b = Vector(a), Vector(b)
        d = b - a
        L = d.length
        if L < 1e-6:
            return
        u = d / L
        n = Vector((u.y, -u.x)) * (-1.0 if flip else 1.0)
        off = n * out if out else Vector((0.0, 0.0))
        k = max(1, math.ceil(L / piece - 1e-9))
        for i in range(k):
            t0 = i * piece / L
            t1 = min(1.0, (i + 1) * piece / L)
            p0, p1 = a + d * t0 + off, a + d * t1 + off
            za0, zb0 = z0a + (z0b - z0a) * t0, z1a + (z1b - z1a) * t0
            za1, zb1 = z0a + (z0b - z0a) * t1, z1a + (z1b - z1a) * t1
            fu = (t1 - t0) * L / piece
            tl = Tile(tile.name, tile.tint, (tile.u[0], tile.u[0] + (tile.u[1] - tile.u[0]) * fu), tile.v)
            pts = [(p0.x, p0.y, za0), (p1.x, p1.y, za1), (p1.x, p1.y, zb1), (p0.x, p0.y, zb0)]
            self.face(pts[::-1] if flip else pts, tl)

    # ------------------------------------------------------------------ primitives

    def box(self, c, size, colour, yaw=0.0, top=None, bottom=False, top_offset=(0.0, 0.0)):
        """Box (or frustum when `top` = (sx, sy) at the top) standing on c.z, centred on c.xy,
        turned by yaw (radians, anticlockwise seen from above)."""
        sx, sy, sz = size
        tx, ty = top if top is not None else (sx, sy)
        cs, sn = math.cos(yaw), math.sin(yaw)

        def p(u, v, w):
            return (c[0] + u * cs - v * sn, c[1] + u * sn + v * cs, c[2] + w)

        ox, oy = top_offset
        lo = [p(-sx / 2, -sy / 2, 0), p(sx / 2, -sy / 2, 0), p(sx / 2, sy / 2, 0), p(-sx / 2, sy / 2, 0)]
        hi = [p(ox - tx / 2, oy - ty / 2, sz), p(ox + tx / 2, oy - ty / 2, sz), p(ox + tx / 2, oy + ty / 2, sz), p(ox - tx / 2, oy + ty / 2, sz)]
        for i in range(4):
            j = (i + 1) % 4
            self.face([lo[i], lo[j], hi[j], hi[i]], colour)
        if tx > 1e-4 and ty > 1e-4:
            self.face(hi, colour)
        if bottom:
            self.face(list(reversed(lo)), colour)

    def cylinder(self, c, r0, r1, height, colour, sides=12, top=True, phase=0.0):
        ring0 = [(c[0] + math.cos(phase + 2 * math.pi * i / sides) * r0, c[1] + math.sin(phase + 2 * math.pi * i / sides) * r0, c[2]) for i in range(sides)]
        ring1 = [(c[0] + math.cos(phase + 2 * math.pi * i / sides) * r1, c[1] + math.sin(phase + 2 * math.pi * i / sides) * r1, c[2] + height) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            if r1 > 1e-4:
                self.face([ring0[i], ring0[j], ring1[j], ring1[i]], colour)
            else:
                self.face([ring0[i], ring0[j], ring1[i]], colour)
        if top and r1 > 1e-4:
            self.face(ring1, colour)

    def lathe(self, c, profile, colour, sides=12, phase=0.0, colours=None):
        """Surface of revolution through (radius, height) points, bottom to top."""
        for k in range(len(profile) - 1):
            (r0, h0), (r1, h1) = profile[k], profile[k + 1]
            col = colours[k] if colours else colour
            self.cylinder((c[0], c[1], c[2] + h0), r0, r1, h1 - h0, col, sides, top=False, phase=phase)
        r, h = profile[-1]
        if r > 1e-4:
            self.face([(c[0] + math.cos(phase + 2 * math.pi * i / sides) * r, c[1] + math.sin(phase + 2 * math.pi * i / sides) * r, c[2] + h) for i in range(sides)], colours[-1] if colours else colour)

    def dome(self, c, radius, height, colour, sides=12, rings=4, onion=0.0, tip=0.0):
        """Hemispherical dome (onion > 0 swells it out, tip lengthens the point)."""
        prof = []
        for k in range(rings + 1):
            a = (math.pi / 2) * k / rings
            r = radius * math.cos(a) * (1 + onion * math.sin(2 * a))
            prof.append((r, height * math.sin(a)))
        prof[-1] = (0.0, height + tip)
        self.lathe(c, prof, colour, sides)

    def prism(self, ring, z0, z1, colour, top_colour=None, top=True):
        """Extruded polygon (Blender xy ring, any winding)."""
        ring = _ccw(ring)
        n = len(ring)
        for i in range(n):
            a, b = ring[i], ring[(i + 1) % n]
            self.face([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], colour)
        if top:
            self.cap(ring, z1, top_colour or colour)

    def cap(self, ring, z, colour, down=False):
        ring = _ccw(ring)
        tris = tessellate_polygon([[Vector((p[0], p[1], z)) for p in ring]])
        for t in tris:
            pts = [(ring[i][0], ring[i][1], z) for i in t]
            # tessellate_polygon's winding is not guaranteed: face up (or down).
            nz = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0])
            if (nz < 0) != down:
                pts.reverse()
            self.face(pts, colour)

    def band(self, ring, z0, z1, out, colour):
        """A band (cornice, plinth) around a ring, `out` metres proud of it, with a top lip."""
        outer = offset(ring, out)
        self.prism(outer, z0, z1, colour, top=False)
        n = len(outer)
        r = _ccw(ring)
        o = _ccw(outer)
        for i in range(n):
            j = (i + 1) % n
            self.face([(r[i][0], r[i][1], z1), (r[j][0], r[j][1], z1), (o[j][0], o[j][1], z1), (o[i][0], o[i][1], z1)][::-1], colour)


def _area(ring):
    return sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring))) / 2


def _ccw(ring):
    return list(ring) if _area(ring) > 0 else list(reversed(ring))


def offset(ring, d):
    """Miter offset of a simple polygon: d > 0 outwards, d < 0 inwards (miters capped)."""
    r = _ccw(ring)
    n = len(r)
    out = []
    for i in range(n):
        p0, p1, p2 = r[i - 1], r[i], r[(i + 1) % n]
        e0 = Vector((p1[0] - p0[0], p1[1] - p0[1])).normalized()
        e1 = Vector((p2[0] - p1[0], p2[1] - p1[1])).normalized()
        n0 = Vector((e0.y, -e0.x))
        n1 = Vector((e1.y, -e1.x))
        m = n0 + n1
        if m.length < 1e-6:
            m = n0
        m.normalize()
        k = d / max(0.35, m.dot(n1))
        out.append((p1[0] + m.x * k, p1[1] + m.y * k))
    return out


def edges(ring):
    """(start, end, length, direction, outward normal) of each edge of a ccw ring."""
    r = _ccw(ring)
    out = []
    for i in range(len(r)):
        a, b = Vector(r[i]), Vector(r[(i + 1) % len(r)])
        d = b - a
        L = d.length
        u = d / L if L > 0 else Vector((1, 0))
        out.append((a, b, L, u, Vector((u.y, -u.x))))
    return out


class Frame:
    """Local frame of a landmark part: u along `yaw` (radians, anticlockwise from east, seen from
    above), v to its left, origin at `centre` (Blender xy)."""

    def __init__(self, centre, yaw):
        self.c = Vector(centre)
        self.u = Vector((math.cos(yaw), math.sin(yaw)))
        self.v = Vector((-math.sin(yaw), math.cos(yaw)))
        self.yaw = yaw

    def p(self, u, v, z=0.0):
        q = self.c + self.u * u + self.v * v
        return (q.x, q.y, z)


# ---------------------------------------------------------------------------- spec helpers

def load_spec(lid):
    path = os.path.join(SPECS, lid, "spec.json")
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    return json.loads(raw), hashlib.sha256(raw.encode("utf-8")).hexdigest()


def part_ring(spec, name):
    """A part's footprint relative to the spec origin, in Blender xy."""
    ox, oz = spec["origin"]
    return [game_to_blender(x - ox, z - oz) for x, z in spec["osm"]["parts"][name]["footprint"]]


def part_outline(spec, name):
    """The ring a part is built on: its minimum rectangle when its role is `model_rect` (OSM's
    outline is not the building's own), else its OSM footprint."""
    part = spec["osm"]["parts"][name]
    if part.get("role") == "model_rect":
        ox, oz = spec["origin"]
        return [game_to_blender(x - ox, z - oz) for x, z in part["rect"]["corners"]]
    return part_ring(spec, name)


def part_centre(spec, name):
    ox, oz = spec["origin"]
    x, z = spec["osm"]["parts"][name]["centroid"]
    return game_to_blender(x - ox, z - oz)


def part_yaw(spec, name):
    """Blender yaw (radians) of a part's longer side; the spec's yaw is from +X towards -Z,
    which is anticlockwise seen from above in Blender's frame too."""
    return math.radians(spec["osm"]["parts"][name]["rect"]["yaw_deg"])


def part_rect(spec, name):
    r = spec["osm"]["parts"][name]["rect"]
    return r["long"], r["short"]


def colours(spec):
    return {k: hex_to_linear(v) for k, v in spec["colours"].items()}


# ---------------------------------------------------------------------------- Blender output

def _reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _material():
    m = bpy.data.materials.new("landmark_vertex_colour")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return m


def _plane_uv(pts, tile, sheet):
    """UVs for one face: the face is laid flat on its own plane (walls: u along the wall to the
    right seen from outside, v up; flat faces: along their first edge) and its bounding box is
    stretched over the tile's part of the region (G-390)."""
    P = [Vector(p) for p in pts]
    n = Vector((0.0, 0.0, 0.0))
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    if n.length < 1e-9:
        n = Vector((0.0, 0.0, 1.0))
    n.normalize()
    up = Vector((0.0, 0.0, 1.0))
    if abs(n.z) < 0.85:
        u = up.cross(n)
        u.normalize()
        v = n.cross(u)
    else:
        e = P[1] - P[0]
        e = e - n * e.dot(n)
        u = e.normalized() if e.length > 1e-9 else Vector((1.0, 0.0, 0.0))
        v = n.cross(u)
    us = [p.dot(u) for p in P]
    vs = [p.dot(v) for p in P]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    du = max(u1 - u0, 1e-6)
    dv = max(v1 - v0, 1e-6)
    out = []
    for a, b in zip(us, vs):
        fu = tile.u[0] + (a - u0) / du * (tile.u[1] - tile.u[0])
        fv = tile.v[0] + (b - v0) / dv * (tile.v[1] - tile.v[0])
        out.append(sheet.uv(tile.name, fu, fv))
    return out


def _object(name, acc, mat, sheet=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(acc.verts, [], acc.faces)
    me.update()
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    data = []
    for poly, col in zip(me.polygons, acc.colours):
        tint = col.tint if isinstance(col, Tile) else col
        for _ in poly.loop_indices:
            data.extend(tint)
    attr.data.foreach_set("color", data)
    me.color_attributes.active_color = attr
    if sheet is not None:
        uvl = me.uv_layers.new(name="UVMap")
        flat = []
        for poly, col in zip(me.polygons, acc.colours):
            tile = col if isinstance(col, Tile) else Tile("white")
            pts = [acc.verts[i] for i in acc.faces[poly.index]]
            for uv in _plane_uv(pts, tile, sheet):
                flat.extend(uv)
        uvl.data.foreach_set("uv", flat)
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export(spec, spec_sha, lods, collision, script, sheet=None, atlas_info=None):
    """lods: [Acc, Acc, Acc]; collision: [(centre xyz, size xyz, yaw)]. Writes the GLB and
    build.json next to the spec; returns the triangle counts."""
    _reset()
    mat = _material()
    for i, acc in enumerate(lods):
        _object(f"LOD{i}", acc, mat, sheet)
    for i, (c, s, yaw) in enumerate(collision):
        # An axis-aligned box mesh round the node's origin; position and yaw on the node, so
        # the game reads the box from the mesh's bounds and the node's transform.
        a = Acc()
        a.box((0.0, 0.0, -s[2] / 2), s, (1, 1, 1, 1), 0.0, bottom=True)
        ob = _object(f"COL_{i:02d}", a, mat)
        ob.location = (round(c[0], 4), round(c[1], 4), round(c[2], 4))
        ob.rotation_euler = (0.0, 0.0, round(yaw, 6))
    lid = spec["id"]
    path = os.path.join(SPECS, lid, f"{lid}.glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_extras=False, export_animations=False, export_texcoords=sheet is not None, export_normals=True,
                              export_cameras=False, export_lights=False, export_tangents=False, export_materials="EXPORT",
                              export_vertex_color="ACTIVE")
    with open(path, "rb") as f:
        glb_sha = hashlib.sha256(f.read()).hexdigest()
    tris = [a.triangles() for a in lods]
    build = {
        "id": lid, "kit": spec["recipe"]["kit"], "script": f"tools/blender/landmarks/{script}",
        "blender": bpy.app.version_string, "spec_sha256": spec_sha, "glb_sha256": glb_sha,
        "triangles": {"lod0": tris[0], "lod1": tris[1], "lod2": tris[2]}, "collision_boxes": len(collision),
    }
    if atlas_info:
        build["atlas"] = atlas_info
    with open(os.path.join(SPECS, lid, "build.json"), "w", encoding="utf-8") as f:
        json.dump(build, f, indent=1)
        f.write("\n")
    print(f"MODEL {lid}: LOD0 {tris[0]}, LOD1 {tris[1]}, LOD2 {tris[2]} triangles; {len(collision)} collision boxes; sha {glb_sha[:12]}")
    return tris


def _atlas_import(path, res):
    """The import settings of an atlas: VRAM compressed with mipmaps (Godot fills in the rest)."""
    text = (
        '[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n\n[deps]\n\n'
        f'source_file="{res}"\n\n[params]\n\ncompress/mode=2\ncompress/high_quality=false\ncompress/lossy_quality=0.7\n'
        'compress/uastc_level=0\ncompress/rdo_quality_loss=0.0\ncompress/hdr_compression=1\ncompress/normal_map=0\n'
        'compress/channel_pack=0\nmipmaps/generate=true\nmipmaps/limit=-1\nroughness/mode=0\nroughness/src_normal=""\n'
        'process/channel_remap/red=0\nprocess/channel_remap/green=1\nprocess/channel_remap/blue=2\nprocess/channel_remap/alpha=3\n'
        'process/fix_alpha_border=true\nprocess/premult_alpha=false\nprocess/normal_map_invert_y=false\n'
        'process/hdr_as_srgb=false\nprocess/hdr_clamp_exposure=false\nprocess/size_limit=0\ndetect_3d/compress_to=0\n')
    if not os.path.exists(path + ".import"):
        with open(path + ".import", "w", encoding="utf-8") as f:
            f.write(text)


def run(kit_build, script, atlas=None):
    """Entry point of a kit script: builds every spec whose recipe names this kit, or the ids
    given after `--`."""
    ids = args()
    kit = os.path.splitext(script)[0]
    done = 0
    for lid in sorted(os.listdir(SPECS)):
        if not os.path.isfile(os.path.join(SPECS, lid, "spec.json")) or (ids and lid not in ids):
            continue
        spec, sha = load_spec(lid)
        if spec["recipe"]["kit"] != kit:
            continue
        sheet = None
        atlas_info = None
        if atlas is not None and spec.get("atlas"):
            from atlas import Sheet  # noqa: PLC0415
            layout_fn, paint_fn = atlas
            sheet = Sheet(layout_fn(spec))
            paint_fn(spec, sheet)
            apath = os.path.join(SPECS, lid, spec["atlas"]["file"])
            size = sheet.save(apath)
            _atlas_import(apath, f"res://assets/landmarks/{lid}/{spec['atlas']['file']}")
            with open(apath, "rb") as f:
                atlas_info = {"file": spec["atlas"]["file"], "png_bytes": size, "sha256": hashlib.sha256(f.read()).hexdigest()}
        lods = []
        collision = []
        for lod in range(3):
            acc = Acc()
            col = []
            kit_build(spec, acc, col, lod)
            lods.append(acc)
            if lod == 0:
                collision = col
        export(spec, sha, lods, collision, script, sheet, atlas_info)
        done += 1
    print(f"KIT {kit}: {done} landmark(s)")


# ---------------------------------------------------------------------------- facade helpers

def vface(acc, a, u, z0, w, h, out, colour, arch=0, normal=None):
    """A vertical panel on a wall: from point a (Blender xy on the wall line) along unit u,
    width w, from z0 up h, pushed `out` metres along the wall's outward normal; with `arch`
    segments a round top (semicircle of the panel's width)."""
    n = normal if normal is not None else Vector((u.y, -u.x))
    base = Vector(a) + n * out
    p0 = base
    p1 = base + u * w
    acc.face([(p0.x, p0.y, z0), (p1.x, p1.y, z0), (p1.x, p1.y, z0 + h), (p0.x, p0.y, z0 + h)], colour)
    if arch:
        mid = base + u * (w / 2)
        r = w / 2
        pts = [(mid.x, mid.y, z0 + h)]
        for k in range(arch + 1):
            ang = math.pi * k / arch
            q = mid + u * (r * math.cos(ang))
            pts.append((q.x, q.y, z0 + h + r * math.sin(ang)))
        acc.face(pts, colour)


def wall_collision(col, ring, height, thickness=0.8):
    """Thin boxes along every edge of a ring (inside it): the building is closed, cheaply."""
    for a, b, L, u, n in edges(ring):
        m = (a + b) / 2 - n * (thickness / 2)
        col.append(((m.x, m.y, height / 2), (L + thickness, thickness, height), math.atan2(u.y, u.x)))


def pyramid_cap(acc, c, size, z, height, colour, yaw, overhang=0.4):
    acc.box((c[0], c[1], z), (size + overhang, size + overhang, height), colour, yaw, top=(0.0, 0.0))


def clock_faces(acc, f, half, z, diameter, cols, lod, faces=4):
    """Round clock faces with hands on the four sides of a square stage (frame f, half size)."""
    sides = 16 if lod == 0 else 8
    r = diameter / 2
    for k in range(faces):
        ang = k * math.pi / 2
        out = Vector((math.cos(ang), math.sin(ang)))
        out_w = f.u * out.x + f.v * out.y
        along = Vector((out_w.y, -out_w.x)) * -1
        centre = f.c + out_w * (half + 0.06)
        pts = []
        for i in range(sides):
            t = 2 * math.pi * i / sides
            q = centre + along * (r * math.cos(t))
            pts.append((q.x, q.y, z + r * math.sin(t)))
        acc.face(pts, cols["clock"])
        if lod < 2:
            c2 = centre + out_w * 0.03
            for (lx, lz, wd) in ((0.0, r * 0.7, 0.12), (r * 0.5, -r * 0.15, 0.1)):
                hand_end = c2 + along * lx
                p0 = c2 - along * (wd / 2)
                p1 = c2 + along * (wd / 2)
                acc.face([(p0.x, p0.y, z), (p1.x, p1.y, z), (hand_end.x + along.x * wd / 2, hand_end.y + along.y * wd / 2, z + lz), (hand_end.x - along.x * wd / 2, hand_end.y - along.y * wd / 2, z + lz)], cols["hands"])


def front_edges(ring, front_normal, min_len=4.0):
    """Edges of the ring whose outward normal points along front_normal (Blender xy)."""
    return [e for e in edges(ring) if e[2] >= min_len and e[4].dot(front_normal) > 0.7]


def arch_frieze(acc, ring, z, spacing, height, colour, min_len=6.0):
    """A row of small round-headed blind arches (corbel table) along every long wall."""
    for a, b, L, u, n in edges(ring):
        if L < min_len:
            continue
        k = max(1, int(L / spacing))
        w = L / k
        for i in range(k):
            vface(acc, a + u * (w * i + w * 0.1), u, z, w * 0.8, height * 0.4, 0.08, colour, arch=2)
