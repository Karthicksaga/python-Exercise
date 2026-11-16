"""
Chennai people: the player and the pedestrian variants, built by script with MPFB (MakeHuman
for Blender) in Blender 5.2 LTS. The script is the source: re-running it rebuilds the same files.

Run headless (MPFB and the MakeHuman system assets must be installed, see assets/README.md):
    blender -b --factory-startup --python tools/blender/characters.py -- <models dir> [--only <name>] [--preview <dir>]
or `npm run blender:characters` (finds Blender through the BLENDER environment variable).

Every figure is an MPFB human (MakeHuman base mesh and targets, CC0) with South Indian adult
proportions and a medium-to-dark brown skin, dressed in MakeHuman system clothes (CC0) and,
where nothing suitable exists, in simple garments modelled here (a knee-length lungi, sandals).
Each figure gets MPFB's built-in "mixamo" skeleton (bones `mixamorig:Hips`, `mixamorig:LeftArm`
...), which the game's retargeting reads after stripping the prefix (retarget.ts).

What the game needs, and how this script gets there:
- Shape keys (MakeHuman targets, expressions) are baked into the mesh: no blend shapes ship.
- Helper geometry and the skin hidden under clothes (MPFB delete groups) are removed.
- Every part is joined into one skinned mesh `Body` with two materials, so a figure is two draw
  calls: `Skin` (the skin texture, opaque) and `Outfit` (one atlas holding clothes, shoes,
  hair, eyebrows, eyelashes and eyes; alpha-tested for the hair cards).
- Textures are built here from the CC0 sources: skins blended to a South Indian tone, a painted
  moustache, clothes recoloured, printed logos painted out, the lungi's check woven in code.
- Triangle budgets: the player at most 30,000, pedestrians at most 10,000 (Decimate where the
  MakeHuman parts are heavier). The figure stands at the origin facing -Y (glTF +Z), feet on
  the ground, in MakeHuman's rest pose (arms down, A-pose).
"""
import math
import os
import sys
import tempfile

import addon_utils
import bmesh
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv and not argv[0].startswith("--") else "assets/models")
ONLY = argv[argv.index("--only") + 1] if "--only" in argv else None
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

MPFB = "bl_ext.user_default.mpfb"
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)

# ----------------------------------------------------------------------------------------------
# The cast. Phenotype values are MakeHuman's macro sliders (0..1): age 0.5 = 25 years, 1 = 90;
# race mixes MakeHuman's three reference shapes. Skins blend two CC0 skin textures (same UV
# layout) and then multiply by `tone`. Clothes are MakeHuman system assets ("name/name.mhclo").
# ----------------------------------------------------------------------------------------------
BASE_PHENOTYPE = {"gender": 1.0, "age": 0.55, "muscle": 0.55, "weight": 0.5, "proportions": 0.5, "height": 0.45, "cupsize": 0.5, "firmness": 0.5}

CHARACTERS = [
    {
        # A Chennai man in his early thirties: light cotton shirt, dark trousers, sandals.
        "name": "player",
        "file": "player.glb",
        "texture": 1024,
        "budget": 30000,
        "phenotype": {"age": 0.56, "muscle": 0.55, "weight": 0.52, "race": {"african": 0.4, "caucasian": 0.55, "asian": 0.05}},
        "skin": ("young_african_male", "young_caucasian_male", 0.72, (1.0, 0.95, 0.9)),
        "proxy": None,
        "hair": ("short02", (0.03, 0.025, 0.022)),
        "eyebrows": "eyebrow001",
        "eyelashes": True,
        "moustache": (0.025, 0.02, 0.018),
        "clothes": "male_casualsuit01",
        "garments": {"upper": (0.62, 0.72, 0.84), "lower": (0.2, 0.19, 0.18)},
        "split": "z",  # shirt and trousers told apart by height on this suit
        "shoes": "sandals",
    },
    {
        # Older man: white shirt, grey trousers, grey hair and moustache, sandals.
        "name": "elder",
        "file": "people/elder.glb",
        "texture": 512,
        "budget": 10000,
        "phenotype": {"age": 0.86, "muscle": 0.4, "weight": 0.55, "height": 0.38, "race": {"african": 0.5, "caucasian": 0.45, "asian": 0.05}},
        "skin": ("old_african_male", "old_caucasian_male", 0.75, (1.0, 0.95, 0.9)),
        "proxy": "male1591",
        "hair": ("short04", (0.55, 0.55, 0.53)),
        "eyebrows": "eyebrow001",
        "eyelashes": False,
        "moustache": (0.6, 0.6, 0.58),
        "clothes": "male_casualsuit01",
        "garments": {"upper": (0.9, 0.9, 0.87), "lower": (0.42, 0.41, 0.38)},
        "split": "z",
        "shoes": "sandals",
    },
    {
        # Half-sleeve top and a checked lungi folded to the knee: the street-corner look.
        "name": "lungi",
        "file": "people/lungi.glb",
        "texture": 512,
        "budget": 10000,
        "phenotype": {"age": 0.66, "muscle": 0.6, "weight": 0.45, "height": 0.42, "race": {"african": 0.6, "caucasian": 0.38, "asian": 0.02}},
        "skin": ("middleage_african_male", "middleage_caucasian_male", 0.85, (0.97, 0.92, 0.88)),
        "proxy": "male1591",
        "hair": ("short04", (0.03, 0.025, 0.022)),
        "eyebrows": "eyebrow001",
        "eyelashes": False,
        "moustache": (0.02, 0.018, 0.016),
        "clothes": "male_casualsuit04",
        "garments": {"upper": (0.86, 0.8, 0.6)},
        "split": "uv",  # T-shirt in the top half of this suit's texture, jeans in the bottom half
        "prints": True,  # paint out the printed logo and trims
        "drop": "lower",  # the jeans are cut away; the lungi takes their place
        "lungi": True,
        "shoes": "sandals",
    },
    {
        # Young man in a T-shirt and jeans with trainers.
        "name": "tshirt",
        "file": "people/tshirt.glb",
        "texture": 512,
        "budget": 10000,
        "phenotype": {"age": 0.5, "muscle": 0.5, "weight": 0.48, "height": 0.5, "race": {"african": 0.35, "caucasian": 0.6, "asian": 0.05}},
        "skin": ("young_african_male", "young_caucasian_male", 0.65, (1.0, 0.96, 0.9)),
        "proxy": "male1591",
        "hair": ("short02", (0.03, 0.025, 0.022)),
        "eyebrows": "eyebrow001",
        "eyelashes": False,
        "moustache": None,
        "clothes": "male_casualsuit06",
        "garments": {"upper": (0.45, 0.1, 0.12)},
        "split": "uv",
        "prints": True,
        "shoes": "shoes06",
    },
    {
        # Working man: striped long-sleeve shirt, jeans, sandals.
        "name": "worker",
        "file": "people/worker.glb",
        "texture": 512,
        "budget": 10000,
        "phenotype": {"age": 0.6, "muscle": 0.65, "weight": 0.42, "height": 0.47, "race": {"african": 0.55, "caucasian": 0.43, "asian": 0.02}},
        "skin": ("young_african_male", "middleage_caucasian_male", 0.82, (0.97, 0.92, 0.88)),
        "proxy": "male1591",
        "hair": ("short04", (0.03, 0.025, 0.022)),
        "eyebrows": "eyebrow001",
        "eyelashes": False,
        "moustache": (0.025, 0.02, 0.018),
        "clothes": "male_casualsuit03",
        "garments": {},
        "split": "uv",
        "shoes": "sandals",
    },
]

# Outfit atlas layout, in UV space (origin bottom-left): (u, v, size) of each square tile.
TILES = {
    "clothes": (0.0, 0.5, 0.5),
    "hair": (0.5, 0.5, 0.5),
    "shoes": (0.0, 0.25, 0.25),
    "eyes": (0.25, 0.375, 0.125),
    "eyebrows": (0.375, 0.375, 0.125),
    "eyelashes": (0.25, 0.25, 0.125),
    "lungi": (0.5, 0.0, 0.5),
}
# Flat colours for the modelled sandals, as tiny swatches inside the free corner of the atlas.
SWATCHES = {"sole": ((0.375, 0.25), (0.11, 0.075, 0.05)), "strap": ((0.4375, 0.25), (0.3, 0.17, 0.09))}
SWATCH_SIZE = 0.0625


# ----------------------------------------------------------------------------------------------
# MPFB
# ----------------------------------------------------------------------------------------------
def load_mpfb():
    addon_utils.enable(MPFB, default_set=True)
    module = sys.modules.get(MPFB)
    if module is None:
        sys.exit("MPFB is not installed: install the MPFB 2 extension into Blender (see assets/README.md).")
    from bl_ext.user_default.mpfb.services.assetservice import AssetService
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    if not AssetService.system_assets_pack_is_installed():
        sys.exit("The MakeHuman system assets (makehuman_system_assets_cc0.zip) are not installed in MPFB's user data folder.")
    return HumanService


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.node_groups):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def make_human(spec, human_service):
    phenotype = dict(BASE_PHENOTYPE)
    phenotype.update({k: v for k, v in spec["phenotype"].items() if k != "race"})
    phenotype["race"] = spec["phenotype"]["race"]
    clothes = [f"{spec['clothes']}/{spec['clothes']}.mhclo"]
    if spec["shoes"] != "sandals":
        clothes.append(f"{spec['shoes']}/{spec['shoes']}.mhclo")
    info = {
        "name": spec["name"],
        "phenotype": phenotype,
        "rig": "mixamo",
        "eyes": "low-poly/low-poly.mhclo",
        "eyebrows": f"{spec['eyebrows']}/{spec['eyebrows']}.mhclo",
        "eyelashes": "eyelashes01/eyelashes01.mhclo" if spec["eyelashes"] else "",
        "hair": f"{spec['hair'][0]}/{spec['hair'][0]}.mhclo",
        "tongue": "",
        "teeth": "",
        "proxy": f"{spec['proxy']}/{spec['proxy']}.proxy" if spec["proxy"] else "",
        "clothes": clothes,
        "skin_mhmat": f"{spec['skin'][0]}/{spec['skin'][0]}.mhmat",
        "skin_material_type": "GAMEENGINE",
        "eyes_material_type": "MAKESKIN",
        "clothes_material_type": "MAKESKIN",
    }
    settings = human_service.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    basemesh = human_service.deserialize_from_dict(info, settings)
    rig = basemesh.parent
    assert rig and rig.type == "ARMATURE", "MPFB did not add the rig"
    return basemesh, rig


def image_path(obj, contains="diffuse"):
    """The colour texture MPFB put on an object's material."""
    paths = [n.image.filepath for m in obj.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    for path in paths:
        name = os.path.basename(path).lower()
        if contains in name or not any(k in name for k in ("normal", "_ao", "bump", "spec")):
            return bpy.path.abspath(path)
    raise RuntimeError(f"No colour texture on {obj.name}: {paths}")


def bake(obj):
    """Apply shape keys (targets) and mask modifiers; keep only the armature modifier."""
    bpy.context.view_layer.objects.active = obj
    if obj.data.shape_keys:
        obj.shape_key_add(name="baked", from_mix=True)
        for key in list(obj.data.shape_keys.key_blocks):
            obj.shape_key_remove(key)
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            continue
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=modifier.name)


# ----------------------------------------------------------------------------------------------
# Images, kept as float arrays of shape (rows, cols, 4) with row 0 at the bottom (= UV v 0).
# ----------------------------------------------------------------------------------------------
def read_image(path, size):
    img = bpy.data.images.load(path, check_existing=False)
    if tuple(img.size) != (size, size):
        img.scale(size, size)
    pixels = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(pixels)
    bpy.data.images.remove(img)
    return pixels.reshape(size, size, 4)


def write_image(pixels, path, name):
    rows, cols = pixels.shape[:2]
    img = bpy.data.images.new(name, cols, rows, alpha=True)
    img.pixels.foreach_set(np.clip(pixels, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.reload()
    return img


def blur(a, radius):
    """Box blur over the first two axes (cumulative sums), edges clamped."""
    out = a.astype(np.float32)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (radius + 1, radius)
        c = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis)
        n = out.shape[axis]
        out = (np.take(c, range(2 * radius + 1, 2 * radius + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * radius + 1)
    return out


def dilate(mask, steps):
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def uv_mask(obj, size, keep):
    """Pixels covered by the faces for which keep(world_centre, uv_centre) is true."""
    mask = np.zeros((size, size), bool)
    uv_layer = obj.data.uv_layers.active.data
    world = obj.matrix_world
    for poly in obj.data.polygons:
        uvs = [Vector(uv_layer[i].uv) for i in poly.loop_indices]
        if not keep(world @ poly.center, sum(uvs, Vector((0, 0))) / len(uvs)):
            continue
        pts = [np.array((uv.x * size, uv.y * size)) for uv in uvs]
        for k in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            x0, x1 = int(max(0, min(a[0], b[0], c[0]))), int(min(size - 1, max(a[0], b[0], c[0]) + 1))
            y0, y1 = int(max(0, min(a[1], b[1], c[1]))), int(min(size - 1, max(a[1], b[1], c[1]) + 1))
            if x1 < x0 or y1 < y0:
                continue
            ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
            px, py = xs + 0.5, ys + 0.5
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d
            l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
            mask[y0:y1 + 1, x0:x1 + 1] |= inside
    return dilate(mask, 2)


def recolour(pixels, mask, colour):
    """Dye a garment: keep the fabric's light and shade (folds, weave), change its colour."""
    lum = pixels[..., :3] @ LUMA
    middle = float(np.median(lum[mask]))
    shade = np.clip(lum / max(middle, 1e-3), 0.25, 1.35)
    pixels[mask, :3] = np.array(colour, np.float32)[None, :] * shade[mask, None]


def paint_out_prints(pixels, mask, threshold=0.22):
    """Remove printed logos and trims from a garment: pixels far from the fabric's own colour
    are filled from the surrounding cloth."""
    colour = np.median(pixels[mask, :3], axis=0)
    off = (np.linalg.norm(pixels[..., :3] - colour, axis=2) > threshold) & mask
    off = dilate(off, 3)
    good = (mask & ~off).astype(np.float32)
    fill = blur(pixels[..., :3] * good[..., None], 10) / np.maximum(blur(good, 10), 1e-4)[..., None]
    still = off & (blur(good, 10) < 1e-3)
    pixels[off, :3] = fill[off]
    pixels[still, :3] = colour


def skin_texture(spec, body, size):
    first, second, mix, tone = spec["skin"]
    from bl_ext.user_default.mpfb.services.assetservice import AssetService
    paths = []
    for skin in (first, second):
        mhmat = AssetService.find_asset_absolute_path(f"{skin}/{skin}.mhmat", "skins")
        folder = os.path.dirname(mhmat)
        texture = next(f for f in sorted(os.listdir(folder)) if f.endswith(".png") and "diffuse" in f)
        paths.append(os.path.join(folder, texture))
    a, b = read_image(paths[0], size), read_image(paths[1], size)
    pixels = a * mix + b * (1 - mix)
    pixels[..., :3] *= np.array(tone, np.float32)
    pixels[..., 3] = 1
    if spec["moustache"]:
        paint_moustache(pixels, body, size, spec["moustache"])
    return pixels


def paint_moustache(pixels, body, size, colour):
    """A trimmed moustache painted on the skin above the upper lip. The shape is drawn in the
    texture around three landmarks of MakeHuman's "lips" vertex group (the middle of the upper
    lip and the two mouth corners), so it follows the face whatever the proportions."""
    lips = body.vertex_groups.get("lips")
    if lips is None:
        print("No lips vertex group on", body.name, "- moustache skipped")
        return
    world = body.matrix_world
    ids = [v.index for v in body.data.vertices if any(g.group == lips.index and g.weight > 0.5 for g in v.groups)]
    pos = {i: world @ body.data.vertices[i].co for i in ids}
    uv_of = {}
    uv_layer = body.data.uv_layers.active.data
    for loop in body.data.loops:
        if loop.vertex_index in pos:
            uv_of.setdefault(loop.vertex_index, np.array(uv_layer[loop.index].uv) * size)
    middle = max(ids, key=lambda i: pos[i].z - 3 * abs(pos[i].x))
    left = max(ids, key=lambda i: pos[i].x)
    right = min(ids, key=lambda i: pos[i].x)
    centroid = np.mean([uv_of[i] for i in ids], axis=0)
    c, l, r = uv_of[middle], uv_of[left], uv_of[right]
    across = (l - r) / np.linalg.norm(l - r)
    half = np.linalg.norm(l - r) / 2 * 1.02
    up = c - centroid
    up = up - across * np.dot(up, across)
    up /= np.linalg.norm(up)
    rows, cols = np.mgrid[0:size, 0:size]
    rel = np.stack((cols + 0.5, rows + 0.5), axis=-1) - c
    s = rel @ across / half
    t = rel @ up / half
    # Lower edge follows the lip line and droops at the ends; the top edge tapers in.
    lower = -0.04 + 0.22 * s * s
    upper = 0.3 - 0.2 * s * s
    edge = 0.05
    inside = np.clip((t - lower) / edge, 0, 1) * np.clip((upper - t) / edge, 0, 1) * np.clip((1 - np.abs(s)) / 0.12, 0, 1)
    rng = np.random.default_rng(7)
    strands = blur(rng.random((size, size)).astype(np.float32), 1)
    strands = (strands - strands.mean()) / (strands.std() + 1e-6)
    alpha = np.clip(inside * (0.82 + 0.12 * strands), 0, 0.95)[..., None]
    pixels[..., :3] = pixels[..., :3] * (1 - alpha) + np.array(colour, np.float32) * alpha


def lungi_texture(size):
    """An original madras-style check: indigo ground, green and white stripes, both ways."""
    ground = np.array((0.09, 0.14, 0.33), np.float32)
    green = np.array((0.12, 0.42, 0.28), np.float32)
    white = np.array((0.85, 0.85, 0.8), np.float32)
    coords = np.arange(size) / size
    repeat = 8
    phase = (coords * repeat) % 1.0

    def stripes(p):
        band = np.zeros(p.shape + (3,), np.float32)
        weight = np.zeros(p.shape, np.float32)
        wide = (p > 0.1) & (p < 0.28)
        thin = ((p > 0.55) & (p < 0.58)) | ((p > 0.62) & (p < 0.65))
        band[wide] = green
        weight[wide] = 1
        band[thin] = white
        weight[thin] = 1
        return band, weight

    bu, wu = stripes(phase)
    pixels = np.empty((size, size, 4), np.float32)
    pixels[..., :3] = ground
    # Crossing threads mix where the stripes meet.
    for band, weight, axis in ((bu, wu, 1), (bu, wu, 0)):
        b = band[None, :, :] if axis == 1 else band[:, None, :]
        w = weight[None, :] if axis == 1 else weight[:, None]
        pixels[..., :3] = pixels[..., :3] * (1 - 0.5 * w[..., None]) + b * 0.5 * w[..., None]
    rng = np.random.default_rng(11)
    pixels[..., :3] *= (0.92 + 0.08 * rng.random((size, size)))[..., None]
    pixels[..., 3] = 1
    return pixels


# ----------------------------------------------------------------------------------------------
# Garments modelled here
# ----------------------------------------------------------------------------------------------
def bone_head(rig, name):
    return rig.matrix_world @ rig.data.bones["mixamorig:" + name].head_local


def make_lungi(rig, body, collection):
    """A cloth tube wrapped from the waist to just below the knee, weighted to the hips and thighs."""
    hips = bone_head(rig, "Hips")
    knee = bone_head(rig, "LeftLeg")
    top, bottom = hips.z + 0.06, knee.z - 0.06
    world = body.matrix_world
    # Legs and hips only: the hands hang beside the thighs in the rest pose.
    verts = [p for p in (world @ v.co for v in body.data.vertices) if abs(p.x) < 0.25]
    rings, segments = 9, 28
    mesh_verts, uvs_by_vert, weights = [], [], []
    widest = (0.0, 0.0)
    for r in range(rings):
        t = r / (rings - 1)
        z = top + (bottom - top) * t
        near = [p for p in verts if abs(p.z - z) < 0.025] or [p for p in verts if abs(p.z - z) < 0.06]
        xs = [p.x for p in near]
        ys = [p.y for p in near]
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        a0, b0 = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
        # Grow the ellipse until every body point of this slice is inside it.
        reach = max(math.sqrt(((p.x - cx) / a0) ** 2 + ((p.y - cy) / b0) ** 2) for p in near)
        margin = 0.015 + 0.035 * t
        a = max(a0 * reach + margin, widest[0])
        b = max(b0 * reach + margin, widest[1])
        if r > 0:  # the cloth hangs: never narrower than above it
            widest = (a, b)
        elif r == 0:
            widest = (a * 0.98, b * 0.98)
        for s in range(segments + 1):
            angle = 2 * math.pi * s / segments
            x = cx + a * math.cos(angle)
            y = cy + b * math.sin(angle)
            mesh_verts.append((x, y, z))
            uvs_by_vert.append((s / segments, 1 - t))
            # Top of the wrap moves with the hips, the hem with the thighs (split by side).
            hip_share = max(0.0, min(1.0, (z - (hips.z - 0.12)) / (top - (hips.z - 0.12))))
            side = max(0.0, min(1.0, 0.5 + 0.5 * (x - cx) / (a * 0.55)))
            leg = 1 - hip_share
            weights.append({"Hips": hip_share, "LeftUpLeg": leg * side, "RightUpLeg": leg * (1 - side)})
    faces = []
    for r in range(rings - 1):
        for s in range(segments):
            i = r * (segments + 1) + s
            j = i + segments + 1
            faces.append((i, i + 1, j + 1, j))
    mesh = bpy.data.meshes.new("lungi")
    mesh.from_pydata(mesh_verts, [], faces)
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs_by_vert[mesh.loops[li].vertex_index]
    obj = bpy.data.objects.new("lungi", mesh)
    collection.objects.link(obj)
    for vi, w in enumerate(weights):
        for bone, value in w.items():
            if value <= 0:
                continue
            group = obj.vertex_groups.get("mixamorig:" + bone) or obj.vertex_groups.new(name="mixamorig:" + bone)
            group.add([vi], value, "REPLACE")
    # Faces point outwards; a thin inside wall so the hem is not see-through from below.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    solid = obj.modifiers.new("thickness", "SOLIDIFY")
    solid.thickness = 0.006
    solid.offset = -1
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier=solid.name)
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    return obj


def copy_faces(body, keep, name, offset):
    """New object from the body faces for which keep(world_centre, normal) is true, pushed out
    along the normals by `offset` metres. Keeps the body's skin weights."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    world = body.matrix_world
    rotation = world.to_3x3()
    drop = [f for f in bm.faces if not keep(world @ f.calc_center_median(), (rotation @ f.normal).normalized())]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    for v in bm.verts:
        v.co += v.normal * offset
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    body.users_collection[0].objects.link(obj)
    obj.matrix_world = body.matrix_world
    for group in body.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    obj.parent = body.parent
    obj.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    obj.modifiers.new("Armature", "ARMATURE").object = body.parent
    return obj


def make_sandals(rig, body):
    """Flat leather sandals: a sole under each foot and a strap over the forefoot. Both are
    made from the body's own foot faces, so they bend with the foot."""
    parts = []
    for side, sign in (("Left", 1), ("Right", -1)):
        toe = bone_head(rig, side + "ToeBase")
        foot = bone_head(rig, side + "Foot")

        def sole(centre, normal, sign=sign):
            return centre.z < 0.03 and normal.z < -0.3 and centre.x * sign > 0.02

        obj = copy_faces(body, sole, f"sandal_sole_{side}", 0.0)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        centre = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
        for v in bm.verts:
            flat = Vector((v.co.x, v.co.y, 0))
            v.co = Vector((centre.x, centre.y, 0)) + (flat - Vector((centre.x, centre.y, 0))) * 1.08
            v.co.z = -0.01
        result = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        for v in [e for e in result["geom"] if isinstance(e, bmesh.types.BMVert)]:
            v.co.z = 0.008
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        bm.free()
        parts.append(("sole", obj))

        ball = toe.y + 0.015  # strap just behind the ball of the foot

        def strap(centre, normal, sign=sign, ball=ball):
            return 0.012 < centre.z < 0.09 and abs(centre.y - ball) < 0.02 and centre.x * sign > 0.02 and normal.z > -0.2

        parts.append(("strap", copy_faces(body, strap, f"sandal_strap_{side}", 0.003)))
    # Weights: copy_faces created empty groups; take the body's weights by nearest vertex.
    for _, obj in parts:
        transfer = obj.modifiers.new("weights", "DATA_TRANSFER")
        transfer.object = body
        transfer.use_vert_data = True
        transfer.data_types_verts = {"VGROUP_WEIGHTS"}
        transfer.vert_mapping = "NEAREST"
        transfer.layers_vgroup_select_src = "ALL"
        transfer.layers_vgroup_select_dst = "NAME"
        bpy.context.view_layer.objects.active = obj
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_move_to_index(modifier=transfer.name, index=0)
            bpy.ops.object.modifier_apply(modifier=transfer.name)
        obj.data.uv_layers.new(name="UVMap")
    return parts


# ----------------------------------------------------------------------------------------------
# Assembly
# ----------------------------------------------------------------------------------------------
def keep_legs(body, clothes, below):
    group = body.vertex_groups.get("Delete." + clothes)
    if group is None:
        return
    world = body.matrix_world
    group.remove([v.index for v in body.data.vertices if (world @ v.co).z < below])


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def place_uvs(obj, tile):
    u0, v0, s = tile
    for loop in obj.data.uv_layers.active.data:
        loop.uv = (u0 + loop.uv[0] * s, v0 + loop.uv[1] * s)


def flat_uvs(obj, swatch):
    (u0, v0) = swatch
    for loop in obj.data.uv_layers.active.data:
        loop.uv = (u0 + SWATCH_SIZE / 2, v0 + SWATCH_SIZE / 2)


def decimate(obj, ratio):
    if ratio >= 0.999:
        return
    modifier = obj.modifiers.new("decimate", "DECIMATE")
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def material(name, image, alpha):
    mat = bpy.data.materials.new(name)
    tree = mat.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.62 if name == "Skin" else 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    if alpha:
        # Rounding the alpha makes the glTF exporter write alphaMode MASK (cut-out hair cards).
        cut = tree.nodes.new("ShaderNodeMath")
        cut.operation = "ROUND"
        tree.links.new(tex.outputs["Alpha"], cut.inputs[0])
        tree.links.new(cut.outputs[0], bsdf.inputs["Alpha"])
    return mat


def build(spec, human_service, workdir):
    clear()
    basemesh, rig = make_human(spec, human_service)
    collection = basemesh.users_collection[0]
    children = [o for o in rig.children if o.type == "MESH"]
    proxy = next((o for o in children if spec["proxy"] and spec["proxy"] in o.name), None)
    body = proxy or basemesh
    if spec.get("drop") == "lower":
        # Keep the skin of the legs that MPFB would hide under the jeans; only the top stays covered.
        keep_legs(body, spec["clothes"], bone_head(rig, "Hips").z + 0.02)
    for obj in children:
        bake(obj)
    # MPFB adds the delete-group masks; the lungi figure keeps its legs (only the jeans go).
    by_kind = {"body": body}
    for obj in children:
        if obj in (basemesh, proxy):
            continue
        for kind in ("eyebrow", "eyelashes", "low-poly", spec["hair"][0], spec["clothes"], spec["shoes"]):
            if kind in obj.name:
                by_kind[{"eyebrow": "eyebrows", "low-poly": "eyes", spec["hair"][0]: "hair", spec["clothes"]: "clothes", spec["shoes"]: "shoes"}.get(kind, kind)] = obj
    if proxy:
        bpy.data.objects.remove(basemesh, do_unlink=True)

    size = spec["texture"]
    # --- Skin
    skin_pixels = skin_texture(spec, body, size)
    skin_image = write_image(skin_pixels, os.path.join(workdir, f"{spec['name']}_skin.png"), f"{spec['name']}_skin")

    # --- Outfit atlas
    atlas = np.zeros((size, size, 4), np.float32)
    atlas[..., 3] = 1

    def put(name, pixels):
        u0, v0, s = TILES[name]
        n = int(round(s * size))
        tile = pixels if pixels.shape[0] == n else read_resized(pixels, n)
        atlas[int(v0 * size):int(v0 * size) + n, int(u0 * size):int(u0 * size) + n] = tile

    clothes = by_kind["clothes"]
    garment = read_image(image_path(clothes), size)
    split_z = bone_head(rig, "Hips").z + 0.03

    def is_upper(centre, uv):
        return uv.y > 0.5 if spec["split"] == "uv" else centre.z > split_z

    upper = uv_mask(clothes, size, is_upper)
    lower = uv_mask(clothes, size, lambda c, uv: not is_upper(c, uv))
    if spec.get("prints"):
        paint_out_prints(garment, upper)
    if "upper" in spec["garments"]:
        recolour(garment, upper & ~lower, spec["garments"]["upper"])
    if "lower" in spec["garments"]:
        recolour(garment, lower & ~upper, spec["garments"]["lower"])
    if spec.get("drop") == "lower":
        cut_faces(clothes, lambda c, uv: not is_upper(c, uv))
    put("clothes", garment)

    hair_pixels = read_image(image_path(by_kind["hair"]), size)
    recolour(hair_pixels, hair_pixels[..., 3] > 0.05, spec["hair"][1])
    put("hair", hair_pixels)
    put("eyes", read_image(image_path(by_kind["eyes"]), size))
    brows = read_image(image_path(by_kind["eyebrows"]), size)
    recolour(brows, brows[..., 3] > 0.05, tuple(0.85 * c for c in spec["hair"][1]))
    put("eyebrows", brows)
    if "eyelashes" in by_kind:
        put("eyelashes", read_image(image_path(by_kind["eyelashes"]), size))
    if "shoes" in by_kind:
        put("shoes", read_image(image_path(by_kind["shoes"]), size))
    for (u0, v0), colour in SWATCHES.values():
        n = int(SWATCH_SIZE * size)
        atlas[int(v0 * size):int(v0 * size) + n, int(u0 * size):int(u0 * size) + n, :3] = colour
    if spec.get("lungi"):
        put("lungi", lungi_texture(int(TILES["lungi"][2] * size)))
    outfit_image = write_image(atlas, os.path.join(workdir, f"{spec['name']}_outfit.png"), f"{spec['name']}_outfit")

    skin_mat = material("Skin", skin_image, alpha=False)
    outfit_mat = material("Outfit", outfit_image, alpha=True)

    parts = []
    for kind, obj in by_kind.items():
        if kind == "body":
            continue
        place_uvs(obj, TILES[kind])
        parts.append(obj)
    if spec.get("lungi"):
        lungi = make_lungi(rig, body, collection)
        place_uvs(lungi, TILES["lungi"])
        parts.append(lungi)
    if spec["shoes"] == "sandals":
        for part, obj in make_sandals(rig, body):
            flat_uvs(obj, SWATCHES[part][0])
            parts.append(obj)
    for obj in parts:
        obj.data.materials.clear()
        obj.data.materials.append(outfit_mat)
    body.data.materials.clear()
    body.data.materials.append(skin_mat)

    # --- Triangle budget: shave the heavy parts (body, clothes, hair), never the small ones.
    total = triangles(body) + sum(triangles(o) for o in parts)
    heavy = [body] + [by_kind[k] for k in ("clothes", "hair", "shoes") if k in by_kind]
    if total > spec["budget"]:
        heavy_tris = sum(triangles(o) for o in heavy)
        ratio = (spec["budget"] * 0.97 - (total - heavy_tris)) / heavy_tris
        for obj in heavy:
            decimate(obj, ratio)

    # --- One skinned mesh, two materials
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "Body"
    body.data.name = "Body"
    with bpy.context.temp_override(object=body, active_object=body):
        bpy.ops.object.vertex_group_limit_total(group_select_mode="BONE_DEFORM", limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="BONE_DEFORM", lock_active=False)
    bones = {b.name for b in rig.data.bones}
    for group in list(body.vertex_groups):
        if group.name not in bones:
            body.vertex_groups.remove(group)
    for modifier in list(body.modifiers):
        if modifier.type == "ARMATURE" and modifier.object != rig:
            body.modifiers.remove(modifier)
    if not any(m.type == "ARMATURE" for m in body.modifiers):
        body.modifiers.new("Armature", "ARMATURE").object = rig
    rig.name = "Armature"
    tris = triangles(body)
    print(f"{spec['name']}: {tris} triangles, {len(body.data.materials)} materials, {len(rig.data.bones)} bones")
    assert tris <= spec["budget"], f"{spec['name']} is over budget: {tris}"
    return rig, body, tris


def read_resized(pixels, n):
    img = bpy.data.images.new("resize", pixels.shape[1], pixels.shape[0], alpha=True, float_buffer=True)
    img.pixels.foreach_set(pixels.astype(np.float32).ravel())
    img.scale(n, n)
    out = np.empty(n * n * 4, np.float32)
    img.pixels.foreach_get(out)
    bpy.data.images.remove(img)
    return out.reshape(n, n, 4)


def cut_faces(obj, drop):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv_layer = bm.loops.layers.uv.active
    world = obj.matrix_world
    doomed = []
    for face in bm.faces:
        uv = sum((Vector(l[uv_layer].uv) for l in face.loops), Vector((0, 0))) / len(face.loops)
        if drop(world @ face.calc_center_median(), uv):
            doomed.append(face)
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()


def export(rig, body, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_morph=False,
        export_animations=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_extras=False,
    )


def preview(rig, body, path):
    """Front and three-quarter Cycles renders (Eevee needs a GPU context headless builds lack)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 480, 720
    world = bpy.data.worlds.new("sky") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.78, 0.82, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(-30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = []
    for i, (angle, zoom) in enumerate(((0, False), (35, False), (0, True))):
        a = math.radians(angle)
        if zoom:
            target, dist, lens = Vector((0, 0, 1.6)), 0.9, 70
        else:
            target, dist, lens = Vector((0, 0, 0.9)), 4.2, 50
        cam.data.lens = lens
        cam.location = target + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        shot = f"{path}_{i}.png"
        scene.render.filepath = shot
        bpy.ops.render.render(write_still=True)
        shots.append(shot)
    return shots


def main():
    human_service = load_mpfb()
    with tempfile.TemporaryDirectory() as workdir:
        for spec in CHARACTERS:
            if ONLY and spec["name"] != ONLY:
                continue
            rig, body, _ = build(spec, human_service, workdir)
            export(rig, body, os.path.join(OUT, spec["file"]))
            if PREVIEW:
                os.makedirs(PREVIEW, exist_ok=True)
                preview(rig, body, os.path.join(PREVIEW, spec["name"]))


main()
