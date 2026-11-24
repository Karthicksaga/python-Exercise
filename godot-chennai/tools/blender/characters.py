"""
Chennai people: the player and the pedestrian cast, built by script with MPFB (MakeHuman for
Blender) in Blender 5.2 LTS. The script is the source: re-running it rebuilds the same files.

Run headless (MPFB, the MakeHuman system assets and the community packs listed in
docs/characters.md must be installed, see that file):
    blender -b --factory-startup --python tools/blender/characters.py -- <models dir> [--only id,id] [--preview <dir>] [--no-lod]
or `npm run blender:characters` (finds Blender through the BLENDER environment variable).

Every figure is an MPFB human (MakeHuman base mesh and targets, CC0) with South Indian
proportions and brown skin, dressed in MakeHuman clothes (CC0, a few CC-BY, see
docs/characters.md) and, for what MakeHuman lacks, in garments modelled here: veshti, lungi,
saree (pleated skirt, pallu over the left shoulder, blouse), kurta, leggings, dupatta, towel,
head cloth, caps, hard hat, belt, ID tag and sandals.

How the garments made here are built:
- Tubes (veshti, lungi, saree skirt, kurta skirt): rings fitted round the hips and legs at each
  height, weighted to the hips at the top and to the thighs (and a little to the shins) lower
  down, split left/right across the middle.
- Skin-tight pieces (blouse, banian vest, leggings, kurta top, pinafore, pallu, dupatta, towel,
  head cloth): the body's own faces in a region (chosen by the bone that moves them and cut
  with planes), pushed out along the normals. They bend exactly like the body; the skin under
  them is deleted.
- Hard pieces (caps, hard hat, ID tag): small meshes weighted to one bone.

What the game needs, and how this script gets there:
- Shape keys (MakeHuman targets) are baked into the mesh: no blend shapes ship.
- Helper geometry and skin hidden under clothes are removed.
- Every part is joined into one skinned mesh `Body` with two materials, so a figure is two
  draw calls: `Skin` (opaque) and `Outfit` (an atlas of clothes, shoes, hair, eyebrows,
  eyelashes, eyes and flat colours; alpha-tested for the hair cards).
- MPFB's "mixamo" skeleton (bones `mixamorig:Hips` ...); the game strips the prefix.
- Triangle budgets: the player at most 30,000 (1024 px textures), pedestrians at most 10,000
  (512 px), and an LOD1 of each pedestrian (`<file>_lod1.glb`) at most 3,500, same skeleton.
- The figure stands at the origin facing -Y (glTF +Z), feet on the ground, in MakeHuman's
  rest pose (arms down, A-pose), in metres.
- `people/people.json` lists every pedestrian with its sex, age group, role tags, height and
  triangle counts (the game reads it to pick people for each job).
"""
import faulthandler
import json
import math
import os
import sys
import tempfile

import bpy  # noqa: I001  (bpy before bmesh)
import addon_utils
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

faulthandler.enable()
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv and not argv[0].startswith("--") else os.path.join(HERE, "..", "..", "assets", "people"))
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
SET = argv[argv.index("--set") + 1] if "--set" in argv else None  # phase1 | phase2 (default: all)
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None
NO_ANIM = "--no-anim" in argv
# Blender's own export (PNG textures) goes here; tools/blender/optimize_people.py writes the game files.
RAW = os.path.abspath(argv[argv.index("--raw") + 1]) if "--raw" in argv else os.path.join(tempfile.gettempdir(), "chennai-people-raw")
LOCOMOTION = os.path.abspath(os.path.join(HERE, "..", "..", "..", "chennai-open-world", "assets", "animations", "locomotion.glb"))

MPFB = "bl_ext.user_default.mpfb"
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)
LOD1_BUDGET = 3500
from cast_people import *  # noqa: E402,F401,F403  (the cast and its garment helpers)
import cast_animation  # noqa: E402


# ----------------------------------------------------------------------------------------------
# Face: small, seeded differences on a South Indian base (no exaggeration).
# ----------------------------------------------------------------------------------------------
FACE_BASE = {
    "nose-flaring-incr": 0.25,
    "nose-scale-horiz-incr": 0.12,
    "nose-point-width-incr": 0.15,
    "mouth-lowerlip-volume-incr": 0.2,
    "mouth-upperlip-volume-incr": 0.1,
    "l-eye-scale-incr": 0.08,
    "r-eye-scale-incr": 0.08,
    "head-oval": 0.25,
}
FACE_JITTER = [("nose-hump-incr",), ("nose-volume-incr",), ("nose-scale-vert-incr",), ("mouth-scale-horiz-incr",), ("chin-width-incr",),
               ("chin-prominent-incr",), ("l-cheek-bones-incr", "r-cheek-bones-incr"), ("head-square",), ("head-round",),
               ("eyebrows-trans-up",), ("l-eye-push1-out", "r-eye-push1-out"), ("chin-jaw-drop-incr",), ("l-cheek-volume-incr", "r-cheek-volume-incr")]


def face_targets(spec):
    rng = np.random.default_rng(spec["face"])
    targets = dict(FACE_BASE)
    for pick in rng.choice(len(FACE_JITTER), size=5, replace=False):
        value = round(float(rng.uniform(0.05, 0.35)), 3)
        for name in FACE_JITTER[pick]:
            targets[name] = value
    targets.update(spec["targets"])
    return [{"target": k, "value": v} for k, v in targets.items()]


# ----------------------------------------------------------------------------------------------
# MPFB
# ----------------------------------------------------------------------------------------------
def load_mpfb():
    addon_utils.enable(MPFB, default_set=True)
    if sys.modules.get(MPFB) is None:
        sys.exit("MPFB is not installed: install the MPFB 2 extension into Blender (see docs/characters.md).")
    from bl_ext.user_default.mpfb.services.assetservice import AssetService
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    if not AssetService.system_assets_pack_is_installed():
        sys.exit("The MakeHuman system assets (makehuman_system_assets_cc0.zip) are not installed in MPFB's user data folder.")
    return HumanService


def mpfb_info(obj):
    from bl_ext.user_default.mpfb.entities.objectproperties import GeneralObjectProperties
    from bl_ext.user_default.mpfb.services.objectservice import ObjectService
    return ObjectService.get_object_type(obj), str(GeneralObjectProperties.get_value("asset_source", entity_reference=obj) or "")


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.node_groups, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


SKIN_AGE = {"child": "young", "teen": "young", "young": "young", "middle": "middleage", "elderly": "old"}


def skin_sources(spec):
    """Two CC0 skin textures (same UV layout) blended to the person's tone."""
    age = SKIN_AGE[spec["age"]]
    sex = "male" if spec["sex"] == "male" else "female"
    return f"{age}_african_{sex}", f"{age}_caucasian_{sex}"


def hair_asset(spec):
    name = spec["hair"][0]
    # "bun": worn pulled back; braid01 (CC0) with its fringe cut reads better than the bun assets.
    return {"bun": "braid01"}.get(name, name)


def make_human(spec, human_service):
    t = spec["tone"]
    african = 0.32 + 0.3 * t
    phenotype = {"gender": 1.0 if spec["sex"] == "male" else 0.0, "age": age_macro(spec["years"]), "cupsize": 0.5, "firmness": 0.5,
                 "race": {"african": african, "caucasian": 0.95 - african, "asian": 0.05}}
    phenotype.update(spec["body"])
    clothes = [f"{item['asset']}/{item['asset']}.mhclo" for item in spec["clothes"]]
    if spec["shoes"] not in ("sandals", "barefoot"):
        clothes.append(f"{spec['shoes']}/{spec['shoes']}.mhclo")
    hair = hair_asset(spec)
    info = {
        "name": spec["id"],
        "phenotype": phenotype,
        "rig": "mixamo",
        "eyes": "low-poly/low-poly.mhclo",
        "eyebrows": f"{spec['eyebrows']}/{spec['eyebrows']}.mhclo",
        "eyelashes": "eyelashes01/eyelashes01.mhclo" if spec["eyelashes"] else "",
        "hair": f"{hair}/{hair}.mhclo",
        "tongue": "",
        "teeth": "",
        "proxy": f"{spec['proxy']}/{spec['proxy']}.proxy" if spec["proxy"] else "",
        "clothes": clothes,
        "skin_mhmat": f"{skin_sources(spec)[0]}/{skin_sources(spec)[0]}.mhmat",
        "skin_material_type": "GAMEENGINE",
        "eyes_material_type": "MAKESKIN",
        "clothes_material_type": "MAKESKIN",
        "targets": face_targets(spec),
    }
    settings = human_service.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    basemesh = human_service.deserialize_from_dict(info, settings)
    rig = basemesh.parent
    assert rig and rig.type == "ARMATURE", "MPFB did not add the rig"
    return basemesh, rig


def colour_texture_path(obj):
    """The colour texture MPFB put on an object's material (the node MPFB names diffuseTexture)."""
    images = [n for m in obj.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    for node in images:
        if node.name.lower() == "diffusetexture":
            return bpy.path.abspath(node.image.filepath)
    for node in images:
        name = os.path.basename(node.image.filepath).lower()
        if not any(k in name for k in ("normal", "nrm", "_ao", "bump", "spec", "height", "rough")):
            return bpy.path.abspath(node.image.filepath)
    raise RuntimeError(f"No colour texture on {obj.name}")


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


def resized(pixels, n):
    if pixels.shape[0] == n:
        return pixels
    img = bpy.data.images.new("resize", pixels.shape[1], pixels.shape[0], alpha=True, float_buffer=True)
    img.pixels.foreach_set(pixels.astype(np.float32).ravel())
    img.scale(n, n)
    out = np.empty(n * n * 4, np.float32)
    img.pixels.foreach_get(out)
    bpy.data.images.remove(img)
    return out.reshape(n, n, 4)


def blur(a, radius):
    """Box blur over the first two axes (cumulative sums), edges clamped."""
    out = a.astype(np.float32)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (radius + 1, radius)
        cs = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis)
        n = out.shape[axis]
        out = (np.take(cs, range(2 * radius + 1, 2 * radius + 1 + n), axis=axis) - np.take(cs, range(0, n), axis=axis)) / (2 * radius + 1)
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


def raster(obj, size, faces=None, values=None):
    """Rasterise faces into UV space. Without `values`: a coverage mask. With `values` (one per
    vertex): the value interpolated across each face (max where faces overlap)."""
    mask = np.zeros((size, size), bool) if values is None else np.zeros((size, size), np.float32)
    uv_layer = obj.data.uv_layers.active.data
    polys = obj.data.polygons if faces is None else [obj.data.polygons[i] for i in faces]
    for poly in polys:
        loops = list(poly.loop_indices)
        uvs = [np.array(uv_layer[i].uv) * size for i in loops]
        vals = [values[obj.data.loops[i].vertex_index] for i in loops] if values is not None else None
        if vals is not None and max(vals) <= 0:
            continue
        for k in range(1, len(uvs) - 1):
            a, b, cc = uvs[0], uvs[k], uvs[k + 1]
            x0, x1 = int(max(0, min(a[0], b[0], cc[0]))), int(min(size - 1, max(a[0], b[0], cc[0]) + 1))
            y0, y1 = int(max(0, min(a[1], b[1], cc[1]))), int(min(size - 1, max(a[1], b[1], cc[1]) + 1))
            if x1 < x0 or y1 < y0:
                continue
            ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
            px, py = xs + 0.5, ys + 0.5
            d = (b[1] - cc[1]) * (a[0] - cc[0]) + (cc[0] - b[0]) * (a[1] - cc[1])
            if abs(d) < 1e-9:
                continue
            l1 = ((b[1] - cc[1]) * (px - cc[0]) + (cc[0] - b[0]) * (py - cc[1])) / d
            l2 = ((cc[1] - a[1]) * (px - cc[0]) + (a[0] - cc[0]) * (py - cc[1])) / d
            l3 = 1 - l1 - l2
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            if vals is None:
                mask[y0:y1 + 1, x0:x1 + 1] |= inside
            else:
                v = np.clip(l1, 0, 1) * vals[0] + np.clip(l2, 0, 1) * vals[k] + np.clip(l3, 0, 1) * vals[k + 1]
                region = mask[y0:y1 + 1, x0:x1 + 1]
                np.maximum(region, np.where(inside, v, 0), out=region)
    return dilate(mask, 2) if values is None else mask


def uv_mask(obj, size, keep):
    """Pixels covered by the faces for which keep(world_centre, uv_centre) is true."""
    uv_layer = obj.data.uv_layers.active.data
    world = obj.matrix_world
    faces = []
    for poly in obj.data.polygons:
        uvs = [Vector(uv_layer[i].uv) for i in poly.loop_indices]
        if keep(world @ poly.center, sum(uvs, Vector((0, 0))) / len(uvs)):
            faces.append(poly.index)
    return raster(obj, size, faces)


def recolour(pixels, mask, colour):
    """Dye a garment: keep the fabric's light and shade (folds, weave), change its colour."""
    if not mask.any():
        return
    lum = pixels[..., :3] @ LUMA
    middle = float(np.median(lum[mask]))
    shade = np.clip(lum / max(middle, 1e-3), 0.3, 1.3)
    pixels[mask, :3] = np.array(colour, np.float32)[None, :] * shade[mask, None]


def paint_out_prints(pixels, mask, threshold=0.22):
    """Remove printed logos and trims: pixels far from the fabric's own colour are filled from
    the surrounding cloth."""
    if not mask.any():
        return
    colour = np.median(pixels[mask, :3], axis=0)
    off = (np.linalg.norm(pixels[..., :3] - colour, axis=2) > threshold) & mask
    off = dilate(off, 3)
    good = (mask & ~off).astype(np.float32)
    fill = blur(pixels[..., :3] * good[..., None], 10) / np.maximum(blur(good, 10), 1e-4)[..., None]
    still = off & (blur(good, 10) < 1e-3)
    pixels[off, :3] = fill[off]
    pixels[still, :3] = colour


def pattern_layer(size, pattern):
    """A woven pattern as a multiplier/overlay over a recoloured garment: (colour, weight) maps."""
    kind, colour, repeat = pattern
    coords = (np.arange(size) + 0.5) / size
    phase = (coords * repeat) % 1.0
    weight = np.zeros((size, size), np.float32)
    if kind == "stripe":
        weight[:] = ((phase > 0.0) & (phase < 0.22))[None, :]
    elif kind == "check":
        band = ((phase > 0.0) & (phase < 0.25)).astype(np.float32)
        weight = np.maximum(band[None, :], band[:, None]) * 0.75
    elif kind == "dots":
        y, x = np.meshgrid(phase, phase, indexing="ij")
        offset = (np.floor(coords * repeat)[:, None] % 2) * 0.5
        x = (x + offset) % 1.0
        weight = (((x - 0.5) ** 2 + (y - 0.5) ** 2) < 0.045).astype(np.float32)
    elif kind == "pleat":
        weight = (0.5 + 0.5 * np.cos(phase * 2 * math.pi))[None, :].repeat(size, 0) * 0.35
        return np.zeros(3, np.float32), weight  # darkening only
    return np.array(colour, np.float32), weight


def apply_pattern(pixels, mask, pattern):
    if not pattern:
        return
    if pattern[0] == "plaid":
        # A woven plaid: wide bands of one colour both ways, thin lines of a second.
        _, (wide, thin), repeat = pattern
        size = pixels.shape[0]
        phase = ((np.arange(size) + 0.5) / size * repeat) % 1.0
        for (lo, hi), colour, strength in (((0.0, 0.3), wide, 0.55), ((0.55, 0.62), thin, 0.8)):
            band = ((phase > lo) & (phase < hi)).astype(np.float32)
            w = np.maximum(band[None, :], band[:, None]) * strength * mask
            pixels[..., :3] = pixels[..., :3] * (1 - w[..., None]) + np.array(colour, np.float32) * w[..., None]
        return
    colour, weight = pattern_layer(pixels.shape[0], pattern)
    w = (weight * mask)[..., None]
    if pattern[0] == "pleat":
        pixels[..., :3] *= 1 - w
    else:
        pixels[..., :3] = pixels[..., :3] * (1 - w) + colour * w


def weave(size, colour, seed=3, strength=0.07):
    """Plain cotton: a flat colour with a faint weave and slub."""
    rng = np.random.default_rng(seed)
    noise = blur(rng.random((size, size)).astype(np.float32), 1)
    rows = blur(rng.random((size, 1)).astype(np.float32).repeat(size, 1), 1)
    shade = 1 - strength + strength * (0.6 * noise + 0.4 * rows) * 2
    pixels = np.ones((size, size, 4), np.float32)
    pixels[..., :3] = np.array(colour, np.float32) * np.clip(shade, 0.8, 1.1)[..., None]
    return pixels


# ----------------------------------------------------------------------------------------------
# Procedural fabric textures, each for a tile with UV (u across/around, v up)
# ----------------------------------------------------------------------------------------------
def fabric(spec_tex, size):
    kind = spec_tex[0]
    coords = (np.arange(size) + 0.5) / size
    if kind == "plain":
        _, colour, pattern = spec_tex
        pixels = weave(size, colour)
        apply_pattern(pixels, np.ones((size, size), np.float32), pattern)
        return pixels
    if kind == "check":
        # An original madras-style check: ground colour, wide and thin stripes both ways.
        _, ground, stripes = spec_tex
        pixels = weave(size, ground, strength=0.05)
        phase = (coords * 9) % 1.0
        for (lo, hi), colour in zip(((0.08, 0.3), (0.55, 0.6)), stripes):
            band = ((phase > lo) & (phase < hi)).astype(np.float32)
            for w in (band[None, :, None], band[:, None, None]):
                pixels[..., :3] = pixels[..., :3] * (1 - 0.5 * w) + np.array(colour, np.float32) * 0.5 * w
        return pixels
    if kind == "veshti":
        # Off-white cotton with a thin coloured border along the hem and the front edge.
        _, base, border = spec_tex
        pixels = weave(size, base, strength=0.05)
        v = coords[:, None].repeat(size, 1)
        u = coords[None, :].repeat(size, 0)
        band = ((v > 0.03) & (v < 0.075)) | ((u > 0.012) & (u < 0.03)) | ((u > 0.97) & (u < 0.988))
        line = (v > 0.09) & (v < 0.1)
        pixels[band, :3] = np.array(border, np.float32)
        pixels[line, :3] = np.array(border, np.float32) * 0.9 + 0.1
        return pixels
    if kind == "saree":
        # Body colour with small woven motifs, a broad border at the hem and a thin zari line.
        _, base, border, motif = spec_tex
        pixels = weave(size, base, strength=0.06)
        # Small woven motifs, sparse enough to survive a 512 px atlas (u runs round the body).
        u = (coords[None, :] * 44) % 1.0
        row = np.floor(coords[:, None] * 18)
        v = (coords[:, None] * 18) % 1.0
        u = (u + 0.5 * (row % 2)) % 1.0
        dots = (((u - 0.5) * 1.0) ** 2 + ((v - 0.5) * 0.6) ** 2) < 0.014
        pixels[dots, :3] = pixels[dots, :3] * 0.65 + np.array(motif, np.float32) * 0.35
        v = coords[:, None].repeat(size, 1)
        pixels[(v < 0.11), :3] = np.array(border, np.float32)
        pixels[(v > 0.115) & (v < 0.125), :3] = np.array(motif, np.float32)
        pixels[(v > 0.02) & (v < 0.03), :3] = np.array(motif, np.float32)
        # Front pleats (u = 0 is the front): folds shaded light and dark below the tuck.
        u = coords[None, :].repeat(size, 0)
        front = np.minimum(u, 1 - u)
        folds = (front < 0.075) & (v < 0.9)
        shade = 0.82 + 0.3 * np.cos(front * 2 * math.pi / 0.0125) ** 2
        pixels[..., :3] = np.where(folds[..., None], pixels[..., :3] * shade[..., None].clip(0.75, 1.1), pixels[..., :3])
        return pixels
    if kind == "pallu":
        # The end of the saree that goes over the shoulder: borders along both long edges.
        _, base, border, motif = spec_tex
        pixels = weave(size, base, strength=0.06)
        apply_pattern(pixels, np.ones((size, size), np.float32), ("dots", motif, 14))
        u = coords[None, :].repeat(size, 0)
        edge = (u < 0.07) | (u > 0.93)
        pixels[edge, :3] = np.array(border, np.float32)
        pixels[((u > 0.075) & (u < 0.09)) | ((u > 0.91) & (u < 0.925)), :3] = np.array(motif, np.float32)
        return pixels
    if kind == "dupatta":
        _, base, border = spec_tex
        pixels = weave(size, base, strength=0.04)
        u = coords[None, :].repeat(size, 0)
        pixels[(u < 0.06) | (u > 0.94), :3] = np.array(border, np.float32)
        return pixels
    if kind == "towel":
        # A thin cotton towel (thundu): off-white with a coloured stripe near each end.
        _, base, stripe = spec_tex
        pixels = weave(size, base, strength=0.08)
        v = coords[:, None].repeat(size, 1)
        pixels[((v > 0.04) & (v < 0.07)) | ((v > 0.93) & (v < 0.96)), :3] = np.array(stripe, np.float32)
        return pixels
    if kind == "hivis":
        # Safety vest: one plain colour, two reflective bands round the body (no lettering).
        _, base, band = spec_tex
        pixels = weave(size, base, strength=0.05)
        v = coords[:, None].repeat(size, 1)
        for lo in (0.2, 0.52):
            pixels[(v > lo) & (v < lo + 0.09), :3] = np.array(band, np.float32)
        return pixels
    if kind == "stripes":
        # Vertical stripes (u runs round the body).
        _, base, stripe = spec_tex
        pixels = weave(size, base, strength=0.05)
        u = coords[None, :].repeat(size, 0)
        pixels[((u * 40) % 1.0) < 0.28, :3] = np.array(stripe, np.float32)
        return pixels
    raise ValueError(kind)


# ----------------------------------------------------------------------------------------------
# Skin: blend, tone, facial hair, bindi
# ----------------------------------------------------------------------------------------------
def skin_texture(spec, body, size, landmarks):
    from bl_ext.user_default.mpfb.services.assetservice import AssetService
    paths = []
    for skin in skin_sources(spec):
        mhmat = AssetService.find_asset_absolute_path(f"{skin}/{skin}.mhmat", "skins")
        folder = os.path.dirname(mhmat)
        texture = next(f for f in sorted(os.listdir(folder)) if f.endswith(".png") and "diffuse" in f)
        paths.append(os.path.join(folder, texture))
    a, b = read_image(paths[0], size), read_image(paths[1], size)
    t = spec["tone"]
    # Light-medium (t = 0) to dark brown (t = 1): more of the darker texture, warmer and deeper.
    mix = 0.42 + 0.4 * t
    pixels = a * mix + b * (1 - mix)
    pixels[..., :3] *= np.array((1.0, 0.94, 0.86), np.float32) * (1.0 - 0.1 * t)
    pixels[..., 3] = 1
    colour = spec["facial_colour"]
    if "stubble" in spec["facial"] or "beard" in spec["facial"]:
        paint_beard(pixels, body, size, landmarks, colour, full="beard" in spec["facial"])
    if "moustache" in spec["facial"]:
        paint_moustache(pixels, body, size, colour)
    if spec["bindi"]:
        paint_bindi(pixels, body, size, landmarks, spec["bindi"])
    return pixels


def face_frame(body):
    """Mouth landmarks from MakeHuman's "lips" vertex group: corners and the front of the lips."""
    lips = body.vertex_groups.get("lips")
    if lips is None:
        return None
    world = body.matrix_world
    ids = [v.index for v in body.data.vertices if any(g.group == lips.index and g.weight > 0.5 for g in v.groups)]
    pos = {i: world @ body.data.vertices[i].co for i in ids}
    front = min(p.y for p in pos.values())
    ids = [i for i in ids if pos[i].y < front + 0.022]
    left = max(ids, key=lambda i: pos[i].x)
    right = min(ids, key=lambda i: pos[i].x)
    return {"ids": ids, "pos": pos, "left": left, "right": right, "front": front}


def paint_moustache(pixels, body, size, colour):
    """A trimmed moustache painted on the skin above the upper lip, drawn in the texture around
    the mouth corners and the middle of the upper lip, so it follows the face whatever the
    proportions."""
    frame = face_frame(body)
    if frame is None:
        print("No lips vertex group on", body.name, "- moustache skipped")
        return
    ids, pos, left, right = frame["ids"], frame["pos"], frame["left"], frame["right"]
    uv_layer = body.data.uv_layers.active.data
    loops_of = {}
    for loop in body.data.loops:
        if loop.vertex_index in pos:
            loops_of.setdefault(loop.vertex_index, []).append(np.array(uv_layer[loop.index].uv) * size)
    lp, rp = loops_of[left][0], loops_of[right][0]
    mid = (lp + rp) / 2
    reach = 3 * np.linalg.norm(lp - rp)
    rows_a, rows_b = [], []
    for i in ids:
        uv = min(loops_of[i], key=lambda q: np.linalg.norm(q - mid))
        if np.linalg.norm(uv - mid) < reach:
            rows_a.append((pos[i].x, pos[i].z, 1.0))
            rows_b.append(uv)
    fit, *_ = np.linalg.lstsq(np.array(rows_a), np.array(rows_b), rcond=None)
    to_face = np.linalg.inv(fit[:2].T)
    corner_x = (pos[left].x - pos[right].x) / 2
    corner_z = (pos[left].z + pos[right].z) / 2
    middle_z = max(pos[i].z for i in ids if abs(pos[i].x) < corner_x * 0.15)
    middle_z = min(middle_z, corner_z + 0.005)
    rows, cols = np.mgrid[0:size, 0:size]
    rel = np.stack((cols + 0.5, rows + 0.5), axis=-1) - fit[2]
    face = rel @ to_face.T
    s = face[..., 0] / (corner_x * 1.12)
    z = face[..., 1]
    lower = corner_z + (middle_z - corner_z) * np.clip(1 - s * s, 0, 1) - 0.0015
    upper = lower + 0.0095 * (1 - 0.3 * s * s)
    edge = max(0.0012, 1.5 * corner_x / max(1.0, np.linalg.norm(lp - rp)))
    inside = np.clip((z - lower) / edge, 0, 1) * np.clip((upper - z) / edge, 0, 1) * np.clip((1.05 - np.abs(s)) / 0.12, 0, 1)
    rng = np.random.default_rng(7)
    strands = blur(rng.random((size, size)).astype(np.float32), 1)
    strands = (strands - strands.mean()) / (strands.std() + 1e-6)
    alpha = np.clip(inside * (0.82 + 0.12 * strands), 0, 0.95)[..., None]
    pixels[..., :3] = pixels[..., :3] * (1 - alpha) + np.array(colour, np.float32) * alpha


def paint_beard(pixels, body, size, landmarks, colour, full):
    """Stubble or a short trimmed beard: a value per head vertex (jaw, chin, cheeks below the
    cheekbone, in front of the ears; not the lips) interpolated across the skin texture."""
    frame = face_frame(body)
    if frame is None:
        return
    pos = frame["pos"]
    mouth = (pos[frame["left"]] + pos[frame["right"]]) / 2
    half = (pos[frame["left"]].x - pos[frame["right"]].x) / 2
    world = body.matrix_world
    values = np.zeros(len(body.data.vertices), np.float32)
    for v in body.data.vertices:
        p = world @ v.co
        if p.z < landmarks["Neck"].z - 0.01 or p.z > mouth.z + 0.06 or p.y > landmarks["Head"].y + 0.01:
            continue
        side = abs(p.x - mouth.x)
        # Upper edge rises from the moustache line towards the sideburns.
        top = mouth.z + 0.012 + 0.03 * min(1.0, side / 0.07)
        under = (mouth.z - 0.03) - p.z  # below the chin line: fades down the throat
        value = min(1.0, (top - p.z) / 0.01)
        if under > 0:
            value *= max(0.0, 1 - under / 0.035)
        lips = ((p.x - mouth.x) / (half * 1.15)) ** 2 + ((p.z - mouth.z) / 0.011) ** 2
        if lips < 1:
            value = 0
        if side > 0.055:
            value *= max(0.0, 1 - (side - 0.055) / 0.02)
        values[v.index] = max(0.0, value)
    field = raster(body, size, None, values)
    field = blur(field, 2)
    rng = np.random.default_rng(5)
    grain = blur(rng.random((size, size)).astype(np.float32), 1)
    alpha = np.clip(field * ((0.78 if full else 0.32) + (0.15 if full else 0.2) * (grain - 0.5) * 2), 0, 0.9)[..., None]
    pixels[..., :3] = pixels[..., :3] * (1 - alpha) + np.array(colour, np.float32) * alpha


def uv_at(obj, point, direction=Vector((0, 1, 0))):
    """The UV coordinate of the surface point hit by a ray (world space), or None."""
    tree = body_bvh(obj)
    hit, _, index, _ = tree.ray_cast(point, direction)
    if hit is None:
        return None
    world = obj.matrix_world
    poly = obj.data.polygons[index]
    uv_layer = obj.data.uv_layers.active.data
    corners = [(world @ obj.data.vertices[obj.data.loops[li].vertex_index].co, np.array(uv_layer[li].uv)) for li in poly.loop_indices]
    weights = np.array([1 / max(1e-5, (p - hit).length) ** 2 for p, _ in corners])
    weights /= weights.sum()
    return sum(w * uv for w, (_, uv) in zip(weights, corners))


def paint_bindi(pixels, body, size, landmarks, colour):
    """A small dot between the eyebrows."""
    uv = uv_at(body, Vector((0, -1.0, landmarks["brow_z"] - 0.004)))
    if uv is None:
        return
    rows, cols = np.mgrid[0:size, 0:size]
    r = np.hypot(cols + 0.5 - uv[0] * size, rows + 0.5 - uv[1] * size)
    radius = max(1.2, size / 512 * 1.5)
    alpha = np.clip((radius - r) / 0.8, 0, 1)[..., None] * 0.95
    pixels[..., :3] = pixels[..., :3] * (1 - alpha) + np.array(colour, np.float32) * alpha


# ----------------------------------------------------------------------------------------------
# Body geometry helpers
# ----------------------------------------------------------------------------------------------
def bone_head(rig, name):
    return rig.matrix_world @ rig.data.bones["mixamorig:" + name].head_local


def bone_tail(rig, name):
    return rig.matrix_world @ rig.data.bones["mixamorig:" + name].tail_local


ARM_BONES = {"LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand"}


def dominant_bones(obj):
    """For every vertex, the bone (without the mixamorig: prefix) with the largest weight."""
    names = {g.index: g.name.split(":")[-1] for g in obj.vertex_groups if g.name.startswith("mixamorig:")}
    out = []
    for v in obj.data.vertices:
        best, weight = "", 0.0
        for g in v.groups:
            if g.group in names and g.weight > weight:
                best, weight = names[g.group], g.weight
        if "Hand" in best and best not in ("LeftHand", "RightHand"):
            best = "LeftHand" if best.startswith("Left") else "RightHand"
        out.append(best)
    return out


def measure_landmarks(rig, body, eyes):
    lm = {name: bone_head(rig, name) for name in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder",
                                                  "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
                                                  "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase")}
    world = body.matrix_world
    bones = dominant_bones(body)
    pts = [world @ v.co for v in body.data.vertices]
    head = [p for p, b in zip(pts, bones) if b == "Head"]
    lm["top"] = max(p.z for p in pts)
    lm["head"] = Vector((0, min(p.y for p in head), lm["Head"].z))  # y: the front of the face
    lm["head_back"] = max(p.y for p in head)
    lm["head_half"] = max(abs(p.x) for p in head)
    # Eyebrows sit a little above the eyes.
    lm["brow_z"] = sum((eyes.matrix_world @ v.co).z for v in eyes.data.vertices) / len(eyes.data.vertices) + 0.022
    torso = [p for p, b in zip(pts, bones) if b in ("Spine", "Spine1", "Spine2", "Hips")]
    lm["waist"] = (lm["Spine"].z + lm["Hips"].z) / 2 + 0.04
    # The chest may be hidden under a MakeHuman top (its skin is deleted): then use the nearest
    # body points that are left, or the rig.
    chest = [p.y for p in torso if abs(p.z - lm["Spine2"].z) < 0.06] or [p.y for p in torso] or [lm["Spine2"].y - 0.11]
    lm["chest_front"] = min(chest)
    lm["height"] = lm["top"]
    return lm


def body_bvh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def new_object(name, mesh, rig, collection):
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    return obj


def weights_from_body(obj, body, mapping="POLYINTERP_NEAREST"):
    """Give a garment the body's skin weights at the nearest point of the body surface."""
    for group in body.vertex_groups:
        if group.name.startswith("mixamorig:") and not obj.vertex_groups.get(group.name):
            obj.vertex_groups.new(name=group.name)
    transfer = obj.modifiers.new("weights", "DATA_TRANSFER")
    transfer.object = body
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = mapping
    transfer.layers_vgroup_select_src = "ALL"
    transfer.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = obj
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_move_to_index(modifier=transfer.name, index=0)
        bpy.ops.object.modifier_apply(modifier=transfer.name)


def set_weights(obj, weights):
    for vi, w in enumerate(weights):
        for bone, value in w.items():
            if value <= 1e-4:
                continue
            group = obj.vertex_groups.get("mixamorig:" + bone) or obj.vertex_groups.new(name="mixamorig:" + bone)
            group.add([vi], value, "REPLACE")


# ----------------------------------------------------------------------------------------------
# GARMENT BUILDERS
# ----------------------------------------------------------------------------------------------
OVER_CLOTHES = {"towel", "vest", "straps", "apron_bib", "dupatta"}
TUBE_TOPS = {"navel": lambda lm: lm["Hips"].z + 0.075, "waist": lambda lm: lm["Hips"].z + 0.06, "hip": lambda lm: lm["Hips"].z - 0.02}


def tube_bottom(lm, name):
    knee = lm["LeftLeg"].z
    ankle = lm["LeftFoot"].z
    return {
        "thigh": knee + 0.18,
        "knee": knee - 0.05,
        "calf": knee - 0.25 * (knee - ankle),
        "ankle": ankle + 0.03,
        "floor": 0.025,
    }[name]


def make_tube(rig, body, collection, lm, g, name, extra=()):
    """A cloth tube from the waist down: lungi, veshti, saree skirt, kurta skirt, pinafore skirt.
    Rings are fitted round the hips and legs at each height (never narrower than the ring above:
    cloth hangs). Weighted to the hips at the top, to each thigh lower down (left/right split
    across the middle) and partly to the shins below the knee, so it follows the legs."""
    top = TUBE_TOPS[g.get("top", "waist")](lm)
    bottom = tube_bottom(lm, g["bottom"])
    knee = lm["LeftLeg"].z
    hips_z = lm["Hips"].z
    world = body.matrix_world
    bones = dominant_bones(body)
    verts = [world @ v.co for v, b in zip(body.data.vertices, bones) if b not in ARM_BONES]
    # Garments worn under it (salwar, trousers): only where their skin is gone (a fallback, so
    # a kurta does not balloon round a loose salwar).
    under = []
    for obj in extra:
        ob = dominant_bones(obj)
        under += [obj.matrix_world @ v.co for v, b in zip(obj.data.vertices, ob) if b not in ARM_BONES]
    rings = max(4, int((top - bottom) / 0.07) + 2)
    segments = 32
    long = bottom < knee - 0.1
    mesh_verts, uvs, weights = [], [], []
    pleats = g.get("pleats", False)
    # Pass 1: an ellipse round the body at each height.
    fits = []
    for r in range(rings):
        z = top + (bottom - top) * r / (rings - 1)
        zs = max(z, 0.06)
        near = [p for p in verts if abs(p.z - zs) < 0.025] or [p for p in verts if abs(p.z - zs) < 0.07] \
            or [p for p in under if abs(p.z - zs) < 0.025]
        if not near and fits:
            fits.append((z,) + fits[-1][1:])
            continue
        xs = [p.x for p in near]
        ys = [p.y for p in near]
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        a0, b0 = max(0.04, (max(xs) - min(xs)) / 2), max(0.04, (max(ys) - min(ys)) / 2)
        reach = max(math.sqrt(((p.x - cx) / a0) ** 2 + ((p.y - cy) / b0) ** 2) for p in near)
        fits.append((z, cx, cy, a0 * reach + 0.008, b0 * reach + 0.008))
    # Pass 2: the cloth never narrows over the hips; below the widest ring it falls in a straight
    # line to the hem (a little flared), widening only where a leg would poke through.
    crotch = lm["LeftUpLeg"].z - 0.08
    upper = [i for i, f in enumerate(fits) if f[0] >= crotch] or [0]
    h = max(upper, key=lambda i: fits[i][3])
    flare = g.get("flare", 0.04)
    end = fits[-1]
    hem_a = max(end[3] + flare, fits[h][3] * 0.82)
    hem_b = max(end[4] + flare * 0.8, fits[h][4] * 0.85)
    profile = []
    if g.get("straight"):
        # A kurta or tunic falls straight from the hips: no flare, never narrower than the hips.
        hem_a, hem_b = fits[h][3] + flare, fits[h][4] + flare * 0.8
    for i, (z, cx, cy, a, b) in enumerate(fits):
        if i <= h:
            if profile:
                a, b = max(a, profile[-1][3]), max(b, profile[-1][4])
            profile.append((z, cx, cy, a, b))
            continue
        k = (i - h) / max(1, len(fits) - 1 - h)
        hz, hcx, hcy, ha, hb = profile[h]
        la, lb = ha + (hem_a - ha) * k, hb + (hem_b - hb) * k
        if g.get("straight"):
            profile.append((z, hcx + (end[1] - hcx) * k, hcy + (end[2] - hcy) * k, la, lb))
        else:
            profile.append((z, hcx + (end[1] - hcx) * k, hcy + (end[2] - hcy) * k, max(la, a + 0.004), max(lb, b + 0.004)))
    for r, (z, cx, cy, a, b) in enumerate(profile):
        t = r / (rings - 1)
        for s in range(segments + 1):
            # u = 0 at the front (-Y), going round to the figure's left.
            angle = -math.pi / 2 + 2 * math.pi * s / segments
            radius = 1.0
            if pleats:
                # Front pleats tucked at the navel: a fan of folds just left of centre.
                front = math.cos(angle + math.pi / 2 - 0.25)
                if front > 0.55:
                    radius += 0.045 * t * abs(math.sin(s * math.pi / 2))
            x = cx + a * radius * math.cos(angle)
            y = cy + b * radius * math.sin(angle)
            grow = g.get("grow", 0.0)
            x += grow * math.cos(angle)
            y += grow * math.sin(angle)
            mesh_verts.append((x, y, z))
            uvs.append((s / segments, 1 - t))
            hip_share = max(0.0, min(1.0, (z - (hips_z - 0.14)) / max(0.02, top - (hips_z - 0.14))))
            side = max(0.0, min(1.0, 0.5 + 0.5 * (x - cx) / (a * 0.35)))
            below = max(0.0, min(1.0, (knee + 0.08 - z) / max(0.05, knee + 0.08 - lm["LeftFoot"].z))) if long else 0.0
            # Long hems follow the shins only partly and keep some of the hips' motion, so a
            # veshti or saree does not swing out like a bell when running.
            shin = 0.55 * below ** 0.8
            hip_share = max(hip_share, 0.3 * below)
            leg = 1 - hip_share
            weights.append({"Hips": hip_share, "LeftUpLeg": leg * side * (1 - shin), "RightUpLeg": leg * (1 - side) * (1 - shin),
                            "LeftLeg": leg * side * shin, "RightLeg": leg * (1 - side) * shin})
    faces = []
    slit_from = (knee + hips_z) / 2 if g.get("straight") else hips_z - 0.12
    for r in range(rings - 1):
        z_low = top + (bottom - top) * (r + 1) / (rings - 1)
        for s in range(segments):
            if g.get("slits") and z_low < slit_from:
                mid_angle = -math.pi / 2 + 2 * math.pi * (s + 0.5) / segments
                if abs(math.cos(mid_angle)) > 0.985:  # side slits of a kurta
                    continue
            if g.get("front"):
                mid_angle = -math.pi / 2 + 2 * math.pi * (s + 0.5) / segments
                if -math.sin(mid_angle) < 0.45:  # an apron covers the front only
                    continue
            i = r * (segments + 1) + s
            j = i + segments + 1
            faces.append((i, i + 1, j + 1, j))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(mesh_verts, [], faces)
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[mesh.loops[li].vertex_index]
    obj = new_object(name, mesh, rig, collection)
    set_weights(obj, weights)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    # Hidden skin: hips and thighs inside the tube (shins stay: the hem lifts when walking).
    inside = []
    if g.get("front"):
        return obj, inside
    for poly, in_tube in zip(body.data.polygons, face_bones(body, bones)):
        if in_tube not in ("Hips", "LeftUpLeg", "RightUpLeg"):
            continue
        zs = [(world @ body.data.vertices[i].co).z for i in poly.vertices]
        if min(zs) > max(bottom + 0.12, knee + 0.06) and max(zs) < top - 0.03:
            inside.append(poly.index)
    return obj, inside


def face_bones(obj, bones):
    """The bone that moves most of each face's vertices."""
    out = []
    for poly in obj.data.polygons:
        counts = {}
        for i in poly.vertices:
            counts[bones[i]] = counts.get(bones[i], 0) + 1
        out.append(max(counts, key=counts.get))
    return out


def region_parts(lm, rig, g):
    """Each skin-tight garment as parts: (bones whose faces it covers, cutting planes keeping the
    side the normal points to). Planes are (point, normal) in world space."""
    up, down = Vector((0, 0, 1)), Vector((0, 0, -1))
    torso = {"Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck"}
    neck_base = lm["Neck"].z + 0.01
    under_bust = lm["Spine1"].z + 0.02
    region = g["region"]

    def sleeve(side, fraction):
        arm = bone_head(rig, side + "Arm")
        elbow = bone_head(rig, side + "ForeArm")
        wrist = bone_head(rig, side + "Hand")
        bones_ = {side + "Arm"}
        if fraction > 1:
            bones_.add(side + "ForeArm")
            point = elbow + (wrist - elbow) * (fraction - 1)
            direction = (wrist - elbow).normalized()
        else:
            point = arm + (elbow - arm) * fraction
            direction = (elbow - arm).normalized()
        return (bones_, [(point, -direction)])

    def scoop(depth):
        # A neckline lower at the front than at the back.
        return (Vector((0, lm["chest_front"], neck_base - depth)), Vector((0, 0.55, -1)).normalized())

    if region == "blouse":
        return [(torso, [(Vector((0, 0, under_bust + 0.03)), up), scoop(0.07)]), sleeve("Left", 0.32), sleeve("Right", 0.32)]
    if region == "blouse_child":
        return [(torso, [(Vector((0, 0, lm["Hips"].z + 0.04)), up), scoop(0.04)]), sleeve("Left", 0.4), sleeve("Right", 0.4)]
    if region == "school_shirt":
        return [(torso, [(Vector((0, 0, lm["Hips"].z - 0.02)), up), scoop(0.02)]), sleeve("Left", 0.45), sleeve("Right", 0.45)]
    if region == "kurta_top":
        f = g.get("sleeves", 0.75)
        fraction = 1 + (f - 0.5) * 2 if f > 0.5 else f * 2 * 0.9
        return [(torso, [(Vector((0, 0, lm["Hips"].z - 0.06)), up), scoop(0.05)]), sleeve("Left", fraction), sleeve("Right", fraction)]
    if region == "pinafore":
        shoulder_x = (lm["LeftArm"].x - lm["Neck"].x) * 0.45
        return [(torso, [(Vector((0, 0, lm["Hips"].z + 0.03)), up), (Vector((0, 0, lm["Spine2"].z + 0.06)), down),
                         ]), (torso, [(Vector((0, 0, lm["Spine2"].z + 0.06)), up), (Vector((shoulder_x + 0.025, 0, 0)), Vector((-1, 0, 0))),
                                      (Vector((shoulder_x - 0.025, 0, 0)), Vector((1, 0, 0)))]),
                (torso, [(Vector((0, 0, lm["Spine2"].z + 0.06)), up), (Vector((-shoulder_x - 0.025, 0, 0)), Vector((1, 0, 0))),
                         (Vector((-shoulder_x + 0.025, 0, 0)), Vector((-1, 0, 0)))])]
    if region == "leggings":
        legs = {"LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "Hips"}
        return [(legs, [(Vector((0, 0, lm["LeftFoot"].z + 0.035)), up), (Vector((0, 0, lm["Hips"].z + 0.03)), down)])]
    if region == "headcloth":
        brow = lm["brow_z"] + 0.012
        return [({"Head"}, [(Vector((0, 0, brow)), up), (Vector((0, 0, brow + 0.07)), down)])]
    if region in ("towel", "dupatta"):
        side = "Left"
        x = (lm[side + "Arm"].x + lm["Neck"].x) / 2 + (0.01 if region == "towel" else 0.0)
        half = 0.055
        low = lm["Spine1"].z - 0.02 if region == "towel" else lm["Hips"].z - 0.04
        return [(torso | {"LeftArm"}, [(Vector((x - half, 0, 0)), Vector((1, 0, 0))), (Vector((x + half, 0, 0)), Vector((-1, 0, 0))),
                                       (Vector((0, 0, low)), up)])]
    if region == "vest":
        # Safety vest: the torso from the hips to the shoulders, deep V at the front, no sleeves.
        return [(torso - {"Neck"}, [(Vector((0, 0, lm["Hips"].z - 0.03)), up), scoop(0.16)])]
    if region == "apron_bib":
        # The apron's bib: front of the chest and belly only, between the armpits.
        half = 0.13
        return [(torso - {"Neck"}, [(Vector((0, 0, lm["Hips"].z + 0.06)), up), (Vector((0, 0, lm["Spine2"].z + 0.05)), down),
                                    (Vector((0, lm["Spine1"].y - 0.02, 0)), Vector((0, -1, 0))),
                                    (Vector((-half, 0, 0)), Vector((1, 0, 0))), (Vector((half, 0, 0)), Vector((-1, 0, 0)))])]
    if region == "socks":
        legs = {"LeftLeg", "RightLeg", "LeftFoot", "RightFoot"}
        return [(legs, [(Vector((0, 0, lm["LeftFoot"].z + 0.14)), down), (Vector((0, 0, 0.03)), up)])]
    if region == "straps":
        # Backpack straps: a band over each shoulder, front and back, down to the chest.
        parts = []
        for side in ("Left", "Right"):
            x = (lm[side + "Arm"].x + lm["Neck"].x) / 2
            half = 0.016
            parts.append((torso | {side + "Arm"}, [(Vector((x - half, 0, 0)), Vector((1, 0, 0))), (Vector((x + half, 0, 0)), Vector((-1, 0, 0))),
                                                   (Vector((0, 0, lm["Spine1"].z - 0.04)), up)]))
        return parts
    if region == "pallu":
        # A diagonal band from the right hip to over the left shoulder, front and back.
        a = Vector((-0.12, 0, lm["Hips"].z + 0.02))
        b = Vector((lm["LeftArm"].x * 0.6, 0, lm["LeftShoulder"].z + 0.06))
        along = (b - a).normalized()
        normal = Vector((along.z, 0, -along.x)).normalized()  # in the frontal plane, across the band
        half = 0.13
        mid = (a + b) / 2
        return [((torso - {"Neck"}) | {"LeftArm"}, [(mid - normal * half, normal), (mid + normal * half, -normal), (Vector((0, 0, lm["Hips"].z - 0.02)), up)])]
    raise ValueError(region)


def make_region(rig, body, collection, lm, g, name):
    """A skin-tight garment: the body's faces in a region, cut cleanly with planes and pushed out."""
    world = body.matrix_world
    inv = world.inverted()
    bones = dominant_bones(body)
    fbones = face_bones(body, bones)
    parts = region_parts(lm, rig, g)
    meshes = []
    inside = set()
    for bone_set, cuts in parts:
        bm = bmesh.new()
        bm.from_mesh(body.data)
        bm.faces.ensure_lookup_table()
        drop = [f for f in bm.faces if fbones[f.index] not in bone_set]
        bmesh.ops.delete(bm, geom=drop, context="FACES")
        for point, normal in cuts:
            co = inv @ point
            no = (world.to_3x3().transposed() @ normal).normalized()
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no, clear_inner=True)
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        mesh = bpy.data.meshes.new(name + "_part")
        bm.to_mesh(mesh)
        bm.free()
        meshes.append(mesh)
        for poly, fb in zip(body.data.polygons, fbones):
            if fb not in bone_set:
                continue
            pts = [world @ body.data.vertices[i].co for i in poly.vertices]
            if all(all((p - point).dot(normal) > 0.012 for p in pts) for point, normal in cuts):
                inside.add(poly.index)
    # Join the parts and weld their shared edges.
    bm = bmesh.new()
    for mesh in meshes:
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update()
    offset = g.get("offset", 0.006)
    for v in bm.verts:
        v.co += v.normal * offset
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh, rig, collection)
    obj.matrix_world = world
    for group in body.vertex_groups:  # same order as the body: the copied weights keep their meaning
        obj.vertex_groups.new(name=group.name)
    for poly in mesh.polygons:
        poly.use_smooth = True
    if g["region"] in ("pallu", "towel", "dupatta"):
        band_uvs(obj, g, lm)
    elif g["region"] in ("vest", "apron_bib"):
        cylinder_uvs(obj, lm)
    return obj, sorted(inside)


def cylinder_uvs(obj, lm):
    """UVs from position: u round the body (0 at the front), v up from the hips to the neck."""
    world = obj.matrix_world
    uv = obj.data.uv_layers.active.data
    z0, z1 = lm["Hips"].z - 0.05, lm["Neck"].z + 0.02
    for loop in obj.data.loops:
        p = world @ obj.data.vertices[loop.vertex_index].co
        ang = (math.atan2(p.x, p.y - lm["Spine1"].y) / (2 * math.pi)) % 1.0  # front = 0.5, seam at the back
        uv[loop.index].uv = (ang, min(1, max(0, (p.z - z0) / (z1 - z0))))


def band_uvs(obj, g, lm):
    """UVs for draped bands: u across the band (its borders), v along it."""
    world = obj.matrix_world
    uv = obj.data.uv_layers.active.data
    pts = {v.index: world @ v.co for v in obj.data.vertices}
    if g["region"] == "pallu":
        a = Vector((-0.12, 0, lm["Hips"].z + 0.02))
        b = Vector((lm["LeftArm"].x * 0.6, 0, lm["LeftShoulder"].z + 0.06))
        along = (b - a).normalized()
        across = Vector((along.z, 0, -along.x)).normalized()
        mid = (a + b) / 2
        half = 0.13
        for loop in obj.data.loops:
            p = pts[loop.vertex_index]
            u = 0.5 + (p - mid).dot(across) / (2 * half)
            ang = math.atan2(p.y, (p - mid).dot(along))
            uv[loop.index].uv = (min(1, max(0, u)), (ang / math.pi + 1) / 2)
    else:
        x0 = min(p.x for p in pts.values())
        x1 = max(p.x for p in pts.values())
        z0 = min(p.z for p in pts.values())
        top = max(p.z for p in pts.values())
        for loop in obj.data.loops:
            p = pts[loop.vertex_index]
            u = (p.x - x0) / max(1e-3, x1 - x0)
            # v runs down the front, over the shoulder and down the back.
            length = (top - p.z) / max(1e-3, top - z0)
            v = 0.5 - 0.5 * length if p.y < lm["Spine2"].y else 0.5 + 0.5 * length
            uv[loop.index].uv = (u, v)


def make_belt(rig, body, collection, lm, clothes_objs, name):
    """A plain belt round the trousers' waistband."""
    world = body.matrix_world
    z = lm["Hips"].z + 0.045
    pts = []
    for obj in clothes_objs:
        pts += [obj.matrix_world @ v.co for v in obj.data.vertices if abs((obj.matrix_world @ v.co).z - z) < 0.02]
    if not pts:
        pts = [world @ v.co for v in body.data.vertices if abs((world @ v.co).z - z) < 0.02]
    pts = [p for p in pts if abs(p.x) < 0.22]
    xs, ys = [p.x for p in pts], [p.y for p in pts]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    a0, b0 = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    reach = max(math.sqrt(((p.x - cx) / a0) ** 2 + ((p.y - cy) / b0) ** 2) for p in pts)
    a, b = a0 * reach + 0.004, b0 * reach + 0.004
    segments = 28
    verts, faces = [], []
    for zz in (z - 0.018, z + 0.018):
        for s in range(segments):
            ang = 2 * math.pi * s / segments
            verts.append((cx + a * math.cos(ang), cy + b * math.sin(ang), zz))
    for s in range(segments):
        faces.append((s, (s + 1) % segments, segments + (s + 1) % segments, segments + s))
    # Buckle: a small plate at the front.
    k = len(verts)
    fy = cy - b - 0.004
    for dx, dz in ((-0.025, -0.02), (0.025, -0.02), (0.025, 0.02), (-0.025, 0.02)):
        verts.append((cx + dx, fy, z + dz))
    faces.append((k, k + 1, k + 2, k + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.uv_layers.new(name="UVMap")
    obj = new_object(name, mesh, rig, collection)
    set_weights(obj, [{"Hips": 1.0}] * len(verts))
    return obj, [k, k + 1, k + 2, k + 3]


def make_idtag(rig, body, collection, lm, name):
    """An ID card on a lanyard (plain, no text)."""
    tree = body_bvh(body)
    z = lm["Spine1"].z + 0.03
    hit = tree.ray_cast(Vector((0.0, -1.0, z)), Vector((0, 1, 0)))
    front = (hit[0].y if hit[0] else lm["chest_front"]) - 0.042  # clear of shirts and kurtas
    w, h = 0.055, 0.085
    verts = [(-w / 2, front, z - h / 2), (w / 2, front, z - h / 2), (w / 2, front, z + h / 2), (-w / 2, front, z + h / 2)]
    faces = [(0, 1, 2, 3)]
    # Lanyard: two thin strips from the sides of the neck down to the card.
    neck_z = lm["Neck"].z + 0.02
    for side in (-1, 1):
        nx = side * 0.055
        hit = tree.ray_cast(Vector((nx, -1.0, neck_z - 0.02)), Vector((0, 1, 0)))
        ny = (hit[0].y if hit[0] else lm["chest_front"] + 0.04) - 0.012
        k = len(verts)
        bx = side * 0.012
        verts += [(nx - 0.006, ny, neck_z - 0.02), (nx + 0.006, ny, neck_z - 0.02), (bx + 0.006, front + 0.002, z + h / 2), (bx - 0.006, front + 0.002, z + h / 2)]
        faces.append((k, k + 1, k + 2, k + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.uv_layers.new(name="UVMap")
    obj = new_object(name, mesh, rig, collection)
    set_weights(obj, [{"Spine2": 1.0}] * len(verts))
    return obj


def make_pockets(rig, body, collection, lm, name):
    """Two chest pockets with flaps on a uniform shirt (plain, no badge): quads just outside
    the shirt, weighted to the chest."""
    tree = body_bvh(body)
    z = lm["Spine2"].z - 0.035
    verts, faces = [], []
    for x in (-0.075, 0.075):
        hit = tree.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        y = (hit[0].y if hit[0] else lm["chest_front"]) - 0.03
        k = len(verts)
        verts += [(x - 0.045, y, z - 0.06), (x + 0.045, y, z - 0.06), (x + 0.045, y, z + 0.03), (x - 0.045, y, z + 0.03)]
        faces.append((k, k + 1, k + 2, k + 3))
        k = len(verts)
        verts += [(x - 0.047, y - 0.003, z + 0.005), (x + 0.047, y - 0.003, z + 0.005), (x + 0.047, y - 0.003, z + 0.035), (x - 0.047, y - 0.003, z + 0.035)]
        faces.append((k, k + 1, k + 2, k + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.uv_layers.new(name="UVMap")
    obj = new_object(name, mesh, rig, collection)
    set_weights(obj, [{"Spine2": 1.0}] * len(verts))
    return obj


def make_pallu_tail(rig, body, collection, lm, name):
    """The end of the saree hanging down the back from the left shoulder to the thighs."""
    tree = body_bvh(body)
    x0 = lm["LeftArm"].x * 0.55
    top = lm["LeftShoulder"].z + 0.03
    bottom = lm["LeftUpLeg"].z - 0.18
    rows, cols, width = 8, 4, 0.3
    verts, uvs, weights = [], [], []
    for r in range(rows):
        t = r / (rows - 1)
        z = top + (bottom - top) * t
        for cidx in range(cols):
            u = cidx / (cols - 1)
            x = x0 - width * u * (0.35 + 0.65 * t)
            hit = tree.ray_cast(Vector((x, 1.0, z)), Vector((0, -1, 0)))
            y = (hit[0].y if hit[0] else lm["head_back"]) + 0.03 + 0.03 * t
            verts.append((x, y, z))
            uvs.append((u, 1 - t))
            spine = max(0.0, 1 - t * 1.6)
            weights.append({"Spine2": spine * 0.7, "LeftShoulder": spine * 0.3, "Spine1": (1 - spine) * 0.5, "Hips": (1 - spine) * 0.5})
    faces = [(r * cols + cc, r * cols + cc + 1, (r + 1) * cols + cc + 1, (r + 1) * cols + cc) for r in range(rows - 1) for cc in range(cols - 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[mesh.loops[li].vertex_index]
    obj = new_object(name, mesh, rig, collection)
    set_weights(obj, weights)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def make_headgear(rig, body, hair, collection, lm, g, name):
    """Caps and hard hats, made round the head (and hair) they sit on."""
    world = body.matrix_world
    bones = dominant_bones(body)
    pts = [world @ v.co for v, b in zip(body.data.vertices, bones) if b == "Head"]
    if hair is not None:
        pts += [hair.matrix_world @ v.co for v in hair.data.vertices]
    top = max(p.z for p in pts)
    brow = lm["brow_z"] + 0.02
    ring = [p for p in pts if abs(p.z - (brow + 0.03)) < 0.02]
    xs, ys = [p.x for p in ring], [p.y for p in ring]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    a, b = (max(xs) - min(xs)) / 2 + 0.008, (max(ys) - min(ys)) / 2 + 0.008
    style = g.get("style", "hardhat") if g["kind"] == "cap" else "hardhat"
    bm = bmesh.new()
    seg = 24
    if style == "hardhat":
        # A dome over the head, a slight peak at the front and a narrow brim.
        rings = 7
        height = top - brow + 0.035
        layers = []
        for r in range(rings):
            t = r / (rings - 1)
            ang = t * math.pi / 2
            layer = []
            for s in range(seg):
                th = 2 * math.pi * s / seg
                x = cx + (a + 0.012) * math.cos(ang) * math.cos(th)
                y = cy + (b + 0.012) * math.cos(ang) * math.sin(th)
                layer.append(bm.verts.new((x, y, brow + height * math.sin(ang))))
            layers.append(layer)
        for r in range(rings - 1):
            for s in range(seg):
                bm.faces.new((layers[r][s], layers[r][(s + 1) % seg], layers[r + 1][(s + 1) % seg], layers[r + 1][s]))
        bm.faces.new(list(reversed(layers[-1])))
        brim = []
        for s in range(seg):
            th = 2 * math.pi * s / seg
            peak = 0.03 if math.sin(th) < -0.7 else 0.012
            brim.append(bm.verts.new((cx + (a + 0.012 + peak) * math.cos(th), cy + (b + 0.012 + peak) * math.sin(th), brow - 0.004)))
        for s in range(seg):
            bm.faces.new((brim[s], brim[(s + 1) % seg], layers[0][(s + 1) % seg], layers[0][s]))
    elif style == "chef":
        # A plain white chef's cap: a band, then a taller, wider soft crown.
        rows = [(brow - 0.004, 1.0), (brow + 0.05, 1.02), (brow + 0.09, 1.18), (brow + 0.15, 1.22), (brow + 0.17, 1.05)]
        layers = [[bm.verts.new((cx + a * k * math.cos(2 * math.pi * s / seg), cy + b * k * math.sin(2 * math.pi * s / seg), zz)) for s in range(seg)] for zz, k in rows]
        for r in range(len(layers) - 1):
            for s in range(seg):
                bm.faces.new((layers[r][s], layers[r][(s + 1) % seg], layers[r + 1][(s + 1) % seg], layers[r + 1][s]))
        bm.faces.new(list(reversed(layers[-1])))
    elif style == "peaked":
        # A peaked cap: band, a crown wider than the band, a dark visor.
        z0, z1, z2 = brow - 0.005, brow + 0.03, brow + 0.058
        rows = [(z0, 1.0), (z1, 1.03), (z2, 1.12)]
        layers = []
        for zz, k in rows:
            layers.append([bm.verts.new((cx + a * k * math.cos(2 * math.pi * s / seg), cy + b * k * math.sin(2 * math.pi * s / seg) + (0.012 if zz == z2 else 0), zz)) for s in range(seg)])
        for r in range(len(layers) - 1):
            for s in range(seg):
                bm.faces.new((layers[r][s], layers[r][(s + 1) % seg], layers[r + 1][(s + 1) % seg], layers[r + 1][s]))
        centre = bm.verts.new((cx, cy + 0.012, z2 + 0.004))
        for s in range(seg):
            bm.faces.new((layers[-1][s], layers[-1][(s + 1) % seg], centre))
        visor = []
        for s in range(seg):
            th = 2 * math.pi * s / seg
            if math.sin(th) < -0.55:
                visor.append(s)
        vfaces = []
        for s in visor:
            if (s + 1) % seg not in visor:
                continue
            p0, p1 = layers[0][s], layers[0][(s + 1) % seg]
            o0 = bm.verts.new(p0.co + Vector((math.cos(2 * math.pi * s / seg) * 0.01, -0.055, -0.012)))
            o1 = bm.verts.new(p1.co + Vector((math.cos(2 * math.pi * ((s + 1) % seg) / seg) * 0.01, -0.055, -0.012)))
            vfaces.append(bm.faces.new((p0, p1, o1, o0)))
        g["_visor"] = True
    else:  # beret: a soft flattened dome tipped to the right
        rings = 6
        layers = []
        for r in range(rings):
            t = r / (rings - 1)
            ang = t * math.pi / 2
            k = 1.0 + 0.25 * math.sin(t * math.pi)
            layer = []
            for s in range(seg):
                th = 2 * math.pi * s / seg
                x = cx + a * k * math.cos(ang) * math.cos(th) - 0.02 * t
                y = cy + b * k * math.cos(ang) * math.sin(th)
                layer.append(bm.verts.new((x, y, brow + 0.01 + (top - brow + 0.01) * math.sin(ang) * 0.75 + 0.03 * t * (-x + cx) / max(a, 1e-3))))
            layers.append(layer)
        for r in range(rings - 1):
            for s in range(seg):
                bm.faces.new((layers[r][s], layers[r][(s + 1) % seg], layers[r + 1][(s + 1) % seg], layers[r + 1][s]))
        bm.faces.new(list(reversed(layers[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.uv_layers.new(name="UVMap")
    obj = new_object(name, mesh, rig, collection)
    set_weights(obj, [{"Head": 1.0}] * len(mesh.vertices))
    for poly in mesh.polygons:
        poly.use_smooth = style != "peaked"
    return obj


def make_backpack(rig, body, collection, lm, name):
    """A plain backpack on the back (no logo): a rounded box from the lower to the upper back,
    weighted to the spine."""
    world = body.matrix_world
    bones = dominant_bones(body)
    pts = [world @ v.co for v, b in zip(body.data.vertices, bones) if b in ("Spine", "Spine1", "Spine2")]
    z0, z1 = lm["Spine"].z - 0.02, lm["Spine2"].z + 0.1
    band = [p for p in pts if z0 < p.z < z1] or pts
    back = max(p.y for p in band)
    half_w = max(0.09, min(0.17, 0.72 * max(abs(p.x) for p in band)))
    depth = 0.1 if lm["top"] > 1.4 else 0.08
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 2 * half_w, back + 0.012 + (v.co.y + 0.5) * depth, z0 + (v.co.z + 0.5) * (z1 - z0)))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.02, segments=2, affect="EDGES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.uv_layers.new(name="UVMap")
    obj = new_object(name, mesh, rig, collection)
    mid = (z0 + z1) / 2
    set_weights(obj, [{"Spine2": 0.7, "Spine1": 0.3} if v.co.z > mid else {"Spine1": 0.6, "Spine": 0.4} for v in mesh.vertices])
    for poly in mesh.polygons:
        poly.use_smooth = True
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
    for group in body.vertex_groups:  # same order as the body: the copied weights keep their meaning
        obj.vertex_groups.new(name=group.name)
    obj.parent = body.parent
    obj.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    obj.modifiers.new("Armature", "ARMATURE").object = body.parent
    return obj


def make_sandals(rig, body):
    """Flat leather sandals (chappals): a sole under each foot and a strap over the forefoot,
    made from the body's own foot faces, so they bend with the foot."""
    parts = []
    for side, sign in (("Left", 1), ("Right", -1)):
        toe = bone_head(rig, side + "ToeBase")

        def sole(centre, normal, sign=sign):
            return centre.z < 0.03 and normal.z < -0.3 and centre.x * sign > 0.0

        obj = copy_faces(body, sole, f"sandal_sole_{side}", 0.0)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        centre = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
        for v in bm.verts:
            flat = Vector((v.co.x, v.co.y, 0))
            v.co = Vector((centre.x, centre.y, 0)) + (flat - Vector((centre.x, centre.y, 0))) * 1.08
            v.co.z = 0.0
        result = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        for v in [e for e in result["geom"] if isinstance(e, bmesh.types.BMVert)]:
            v.co.z = 0.012
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        bm.free()
        parts.append(("sole", obj))
        ball = toe.y + 0.015

        def strap(centre, normal, sign=sign, ball=ball):
            return 0.012 < centre.z < 0.09 and abs(centre.y - ball) < 0.02 and centre.x * sign > 0.0 and normal.z > -0.2

        parts.append(("strap", copy_faces(body, strap, f"sandal_strap_{side}", 0.003)))
    for _, obj in parts:
        weights_from_body(obj, body, "NEAREST")
        obj.data.uv_layers.new(name="UVMap")
    return parts


def lift_feet(body, sole_height):
    """With sandals on, the feet stand on the soles."""
    world = body.matrix_world
    inv = world.inverted()
    for v in body.data.vertices:
        p = world @ v.co
        if p.z < 0.12:
            v.co = inv @ (p + Vector((0, 0, sole_height * max(0.0, 1 - p.z / 0.12))))


# ----------------------------------------------------------------------------------------------
# Atlas
# ----------------------------------------------------------------------------------------------
def allocate(requests):
    """Square tiles of power-of-two fractions of the atlas, packed buddy-style. Requests that do
    not fit are halved until they do. Returns {name: (u, v, size)}."""
    free = [(0.0, 0.0, 1.0)]
    out = {}
    for name, size in sorted(requests, key=lambda r: -r[1]):
        while True:
            fits = sorted([f for f in free if f[2] >= size - 1e-9], key=lambda f: f[2])
            if fits:
                break
            size /= 2
            if size < 1 / 64:
                raise RuntimeError("atlas full")
        u, v, s = fits[0]
        free.remove(fits[0])
        while s > size + 1e-9:
            s /= 2
            free += [(u + s, v, s), (u, v + s, s), (u + s, v + s, s)]
        out[name] = (u, v, s)
    return out


def place_uvs(obj, tile, bbox=False):
    u0, v0, s = tile
    data = obj.data.uv_layers.active.data
    if bbox and len(data):
        us = [l.uv[0] for l in data]
        vs = [l.uv[1] for l in data]
        lo_u, lo_v = min(us), min(vs)
        span = max(max(us) - lo_u, max(vs) - lo_v, 1e-4)
        for loop in data:
            loop.uv = ((loop.uv[0] - lo_u) / span, (loop.uv[1] - lo_v) / span)
    pad = 0.5 / 512
    for loop in data:
        loop.uv = (u0 + pad + min(1, max(0, loop.uv[0])) * (s - 2 * pad), v0 + pad + min(1, max(0, loop.uv[1])) * (s - 2 * pad))


def flat_uvs(obj, tile, faces=None):
    u0, v0, s = tile
    data = obj.data.uv_layers.active.data
    polys = obj.data.polygons if faces is None else [p for p in obj.data.polygons if p.index in faces]
    for poly in polys:
        for li in poly.loop_indices:
            data[li].uv = (u0 + s / 2, v0 + s / 2)


# ----------------------------------------------------------------------------------------------
# Assembly
# ----------------------------------------------------------------------------------------------
def slim_sleeves(obj, rig, amount=0.14):
    """MakeHuman's shirt sleeves stand well off the arm in the A-pose (bulky shoulders and upper
    arms): pull the sleeve vertices a little towards the arm bone."""
    bones = dominant_bones(obj)
    world = obj.matrix_world
    inv = world.inverted()
    segs = {}
    for side in ("Left", "Right"):
        segs[side + "Arm"] = (bone_head(rig, side + "Arm"), bone_head(rig, side + "ForeArm"))
        segs[side + "ForeArm"] = (bone_head(rig, side + "ForeArm"), bone_head(rig, side + "Hand"))
    for v, b in zip(obj.data.vertices, bones):
        if b not in segs:
            continue
        a, c = segs[b]
        p = world @ v.co
        t = max(0.0, min(1.0, (p - a).dot(c - a) / max(1e-6, (c - a).length_squared)))
        q = a + (c - a) * t
        d = (p - q).length
        if d < 1e-6:
            continue
        # Only the cloth standing well off the arm moves (never into the skin).
        new = d - amount * max(0.0, d - 0.045) * 2.5
        v.co = inv @ (q + (p - q) * (max(new, min(d, 0.045)) / d))


def keep_skin(body, asset, keep, remember=None, keep_ids=None):
    """Undo MPFB's skin deletion under part of a garment we cut away (keep(world_pos) true).
    With `remember`, the kept vertices also go into that vertex group (to delete them later)."""
    group = body.vertex_groups.get("Delete." + asset)
    if group is None:
        return
    world = body.matrix_world
    ids = [v.index for v in body.data.vertices if (keep_ids is not None and v.index in keep_ids) or keep(world @ v.co)]
    if remember:
        in_group = {v.index for v in body.data.vertices if any(g.group == group.index for g in v.groups)}
        mark = body.vertex_groups.get(remember) or body.vertex_groups.new(name=remember)
        mark.add([i for i in ids if i in in_group], 1.0, "REPLACE")
    group.remove(ids)


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def decimate(obj, ratio):
    if ratio >= 0.999:
        return
    modifier = obj.modifiers.new("decimate", "DECIMATE")
    modifier.ratio = max(0.02, ratio)
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
    mat.use_backface_culling = not alpha
    if alpha:
        # Rounding the alpha makes the glTF exporter write alphaMode MASK (cut-out hair cards).
        cut = tree.nodes.new("ShaderNodeMath")
        cut.operation = "ROUND"
        tree.links.new(tex.outputs["Alpha"], cut.inputs[0])
        tree.links.new(cut.outputs[0], bsdf.inputs["Alpha"])
    return mat


def delete_faces(obj, indices):
    if not indices:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in sorted(set(indices))], context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def join(rig, body, parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = name
    body.data.name = name
    # Zero-area faces (decimation leaves a few): Godot's importer drops them, so the counts
    # in the manifest would not match the game's.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    bm.to_mesh(body.data)
    bm.free()
    bones = {b.name for b in rig.data.bones}
    for group in list(body.vertex_groups):
        if group.name not in bones:
            body.vertex_groups.remove(group)
    # At most four bones per vertex, weights summing to one (done here: Blender's own operators
    # crashed on the full base mesh).
    groups = body.vertex_groups
    for v in body.data.vertices:
        ws = sorted(((g.group, g.weight) for g in v.groups if g.weight > 1e-4), key=lambda gw: -gw[1])
        for gi, _ in ws[4:]:
            groups[gi].remove([v.index])
        total = sum(w for _, w in ws[:4])
        if total > 0:
            for gi, w in ws[:4]:
                groups[gi].add([v.index], w / total, "REPLACE")
    for modifier in list(body.modifiers):
        if modifier.type == "ARMATURE" and modifier.object != rig:
            body.modifiers.remove(modifier)
    if not any(m.type == "ARMATURE" for m in body.modifiers):
        body.modifiers.new("Armature", "ARMATURE").object = rig
    return body


def fit_budget(objs, heavy, budget, cap=0.3, spare=()):
    """Decimate the heavy parts so the whole figure fits the triangle budget. First no single
    part may take more than `cap` of the budget (some community clothes are very dense), then
    everything heavy is shaved by the same ratio; `spare` parts (the body) only if needed."""
    for obj in heavy:
        if triangles(obj) > cap * budget:
            decimate(obj, cap * budget / triangles(obj))
    total = sum(triangles(o) for o in objs)
    if total > budget and spare:
        rest = [o for o in heavy if o not in spare]
        rest_tris = sum(triangles(o) for o in rest)
        need = total - budget * 0.97
        if rest_tris and need < rest_tris * 0.5:
            heavy = rest
    total = sum(triangles(o) for o in objs)
    if total <= budget:
        return
    heavy_tris = sum(triangles(o) for o in heavy)
    ratio = (budget * 0.97 - (total - heavy_tris)) / heavy_tris
    for obj in heavy:
        decimate(obj, ratio)
    total = sum(triangles(o) for o in objs)
    if total > budget:  # collapse overshoots a little on small parts: once more, harder
        heavy_tris = sum(triangles(o) for o in heavy)
        ratio = (budget * 0.95 - (total - heavy_tris)) / heavy_tris
        for obj in heavy:
            decimate(obj, ratio)


def duplicate(obj):
    copy = obj.copy()
    copy.data = obj.data.copy()
    for col in obj.users_collection:
        col.objects.link(copy)
    return copy


def build(spec, human_service, workdir):
    clear()
    basemesh, rig = make_human(spec, human_service)
    collection = basemesh.users_collection[0]
    children = [o for o in rig.children if o.type == "MESH"]
    proxy = next((o for o in children if mpfb_info(o)[0] == "Proxymeshes"), None)
    body = proxy or basemesh
    kinds = {}  # role -> object
    clothes_objs = []
    for obj in children:
        kind, source = mpfb_info(obj)
        if obj in (basemesh, proxy):
            continue
        if kind == "Clothes":
            asset = source.split("/")[0]
            item = next((i for i in spec["clothes"] if i["asset"] == asset), None)
            if item is None:
                kinds["shoes"] = obj
            else:
                clothes_objs.append((item, obj))
        elif kind == "Hair":
            kinds["hair"] = obj
        elif kind == "Eyebrows":
            kinds["eyebrows"] = obj
        elif kind == "Eyelashes":
            kinds["eyelashes"] = obj
        elif kind == "Eyes":
            kinds["eyes"] = obj
    hips_z = bone_head(rig, "Hips").z
    sleeve_planes = []
    for side in ("Left", "Right"):
        arm, elbow = bone_head(rig, side + "Arm"), bone_head(rig, side + "ForeArm")
        sleeve_planes.append((arm + (elbow - arm) * 0.62, (elbow - arm).normalized(), 1 if side == "Left" else -1))

    def beyond_sleeve(p, bone, planes=sleeve_planes):
        """On the forearm or hand, or on the upper arm past the half-sleeve's hem."""
        if bone in ("LeftForeArm", "RightForeArm", "LeftHand", "RightHand"):
            return True
        if bone not in ("LeftArm", "RightArm"):
            return False
        return any(p.x * sign > 0 and (p - point).dot(normal) > 0 for point, normal, sign in planes)

    if any(item.get("sleeves") == "short" for item, _ in clothes_objs):
        body_bones = dominant_bones(body)
        world = body.matrix_world
        arm_skin = {v.index for v, b in zip(body.data.vertices, body_bones) if beyond_sleeve(world @ v.co, b)}
        for item, obj in clothes_objs:
            if item.get("sleeves") == "short":
                keep_skin(body, item["asset"], lambda p, ids=arm_skin: False, keep_ids=arm_skin)
    for item, obj in clothes_objs:
        if item.get("drop") == "lower":
            keep_skin(body, item["asset"], lambda p: p.z < hips_z + 0.02)
        elif item.get("drop") == "upper":
            keep_skin(body, item["asset"], lambda p: p.z > hips_z + 0.06)
    if any(g.get("region") in OVER_CLOTHES for g in spec["garments"]):
        # Towels, vests and straps are cut from the body's own surface: keep the skin under a
        # shirt there so they have something to be made from (they sit outside the shirt).
        for item, obj in clothes_objs:
            keep_skin(body, item["asset"], lambda p: p.z > hips_z - 0.05, remember="KeptUnderClothes")
    for obj in children:
        bake(obj)
    if proxy:
        bpy.data.objects.remove(basemesh, do_unlink=True)
    lm = measure_landmarks(rig, body, kinds["eyes"])

    size = spec["texture"]
    # --- Garments made here (they read the body before its hidden skin is removed)
    made = []  # (name, obj, texture spec or colour, uv mode)
    hidden = set()
    for i, g in enumerate(spec["garments"]):
        name = f"g{i}_{g['kind']}"
        if g["kind"] == "tube":
            obj, inside = make_tube(rig, body, collection, lm, g, name, [o for _, o in clothes_objs])
            made.append((name, obj, ("fabric", g["texture"]), "uv"))
            hidden.update(inside)
        elif g["kind"] == "region":
            obj, inside = make_region(rig, body, collection, lm, g, name)
            if "texture" in g:
                made.append((name, obj, ("fabric", g["texture"]), "uv"))
            else:
                made.append((name, obj, ("fabric", ("plain", g["colour"], g.get("pattern"))), "bbox"))
            hidden.update(inside)
        elif g["kind"] == "belt":
            obj, buckle = make_belt(rig, body, collection, lm, [o for _, o in clothes_objs], name)
            made.append((name, obj, ("flat", g.get("colour", c("#2a2018"))), "flat"))
            made.append((name + "_buckle", obj, ("flat", c("#9a968c")), ("faces", {len(obj.data.polygons) - 1})))
        elif g["kind"] == "idtag":
            obj = make_idtag(rig, body, collection, lm, name)
            made.append((name, obj, ("flat", g["colour"]), ("faces", {1, 2})))
            made.append((name + "_card", obj, ("flat", c("#f2f2ee")), ("faces", {0})))
        elif g["kind"] == "pockets":
            obj = make_pockets(rig, body, collection, lm, name)
            made.append((name, obj, ("flat", g["colour"]), "flat"))
        elif g["kind"] == "pallu_tail":
            obj = make_pallu_tail(rig, body, collection, lm, name)
            made.append((name, obj, ("fabric", g["texture"]), "uv"))
        elif g["kind"] == "backpack":
            obj = make_backpack(rig, body, collection, lm, name)
            made.append((name, obj, ("flat", g["colour"]), "flat"))
        elif g["kind"] in ("cap", "hardhat"):
            obj = make_headgear(rig, body, kinds.get("hair"), collection, lm, g, name)
            made.append((name, obj, ("flat", g["colour"]), "flat"))
            if g.get("band"):
                band_faces = {p.index for p in obj.data.polygons if (obj.matrix_world @ p.center).z < lm["brow_z"] + 0.035}
                made.append((name + "_band", obj, ("flat", g["band"]), ("faces", band_faces)))
    if spec["shoes"] == "sandals":
        lift_feet(body, 0.012)
        for part, obj in make_sandals(rig, body):
            colour = spec["sandal_colours"][0 if part == "sole" else 1]
            made.append((f"sandal_{part}_{obj.name}", obj, ("flat", colour), "flat"))
    headwear = any(g["kind"] in ("cap", "hardhat") or g.get("region") == "headcloth" for g in spec["garments"])

    # --- Skin
    skin_pixels = skin_texture(spec, body, size, lm)
    skin_image = write_image(skin_pixels, os.path.join(workdir, f"{spec['id']}_skin.png"), f"{spec['id']}_skin")
    kept = body.vertex_groups.get("KeptUnderClothes")
    if kept is not None:
        # Skin kept only to cut towels, vests and straps from: delete it again under the shirt.
        marked = {v.index for v in body.data.vertices if any(g.group == kept.index and g.weight > 0.5 for g in v.groups)}
        hidden.update(p.index for p in body.data.polygons if any(i in marked for i in p.vertices))
    delete_faces(body, hidden)

    # --- Outfit atlas
    requests = []
    for idx, (item, obj) in enumerate(clothes_objs):
        requests.append((f"clothes{idx}", 0.5 if idx == 0 else 0.25))
    requests.append(("hair", 0.5 if spec["sex"] == "female" or size > 512 else 0.25))
    requests += [("eyes", 0.125), ("eyebrows", 0.125)]
    if "eyelashes" in kinds:
        requests.append(("eyelashes", 0.125))
    if "shoes" in kinds:
        requests.append(("shoes", 0.25))
    for name, obj, tex, mode in made:
        if tex[0] == "fabric" and tex[1][0] in ("saree", "check", "veshti"):
            requests.append((name, 0.5))  # wrapped cloth is large: more pixels (halved if the atlas is full)
        elif tex[0] == "fabric":
            requests.append((name, 0.25))
        else:
            requests.append((name, 1 / 32))
    tiles = allocate(requests)
    atlas = np.zeros((size, size, 4), np.float32)
    atlas[..., 3] = 1

    def put(name, pixels):
        u0, v0, s = tiles[name]
        n = int(round(s * size))
        atlas[int(v0 * size):int(v0 * size) + n, int(u0 * size):int(u0 * size) + n] = resized(pixels, n)

    for idx, (item, obj) in enumerate(clothes_objs):
        garment = read_image(colour_texture_path(obj), size)
        split = item.get("split")
        if split:
            split_z = hips_z + 0.03

            # The MakeHuman suits put the top in the upper half of the texture and the trousers
            # below; the trousers' waistband reaches a little above the middle.
            split_v = item.get("split_v", 0.585)

            boxes = item.get("lower_boxes")

            def is_upper(centre, uv, split=split, split_z=split_z, split_v=split_v, boxes=boxes):
                if boxes:
                    if centre.z < split_z - 0.08 and abs(centre.x) < 0.18:
                        return False  # on the legs, whatever the UV island (stray trouser pieces)
                    return not any(u0 <= uv.x <= u1 and v0 <= uv.y <= v1 for u0, v0, u1, v1 in boxes)
                return uv.y > split_v if split == "uv" else centre.z > split_z

            upper = uv_mask(obj, size, is_upper)
            lower = uv_mask(obj, size, lambda cc, uv, f=is_upper: not f(cc, uv)) & ~upper
        else:
            upper = uv_mask(obj, size, lambda cc, uv: True)
            lower = np.zeros_like(upper)
        if item.get("prints"):
            paint_out_prints(garment, upper)
            paint_out_prints(garment, lower)
        if split == "uv":
            # The jeans' waistband faces reach the plain grey margin of the texture: denim there too.
            rgb = garment[..., :3]
            grey = lower & (rgb.max(axis=2) - rgb.min(axis=2) < 0.08) & (rgb @ LUMA > 0.6)
            if (lower & ~grey).any():
                garment[grey, :3] = np.median(rgb[lower & ~grey], axis=0)
        if "colour" in item:
            # Plain cloth: flatten any print, keep the large folds of the texture's shading.
            soft = blur(garment[..., :3], max(2, size // 96))
            lum = garment[..., :3] @ LUMA
            soft_lum = soft @ LUMA
            garment[upper, :3] = (soft * (0.6 + 0.4 * (lum / np.maximum(soft_lum, 1e-3)))[..., None])[upper]
            recolour(garment, upper, item["colour"])
        if item.get("flatten"):
            # Striped or printed source cloth worn plain: keep only the large folds.
            soft = blur(garment[..., :3], max(2, size // 96))
            for m in (upper, lower):
                if m.any():
                    garment[m, :3] = soft[m] * 0.85 + garment[m, :3] * 0.15
        if "upper" in item:
            recolour(garment, upper, item["upper"])
        if "lower" in item:
            recolour(garment, lower, item["lower"])
        if item.get("pattern"):
            apply_pattern(garment, upper.astype(np.float32), item["pattern"])
        if item.get("border"):
            # A contrasting band along the bottom of the garment (a pavadai's border).
            zs = [(obj.matrix_world @ p.center).z for p in obj.data.polygons]
            low = min(zs) + 0.06
            band = uv_mask(obj, size, lambda cc, uv, low=low: cc.z < low)
            recolour(garment, band, item["border"])
        if item.get("drop") == "lower":
            cut_faces(obj, lambda cc, uv, f=is_upper: not f(cc, uv))
        elif item.get("drop") == "upper":
            cut_faces(obj, lambda cc, uv, f=is_upper: f(cc, uv))
        if item.get("sleeves") == "short":
            # Half sleeves: the shirt ends a little above the elbow (most Chennai shirts and
            # every uniform shirt on the boards); the forearm skin under it was kept.
            cut_faces_by_bone(obj, beyond_sleeve)
        if item.get("slim", item["asset"] == "male_casualsuit01"):
            slim_sleeves(obj, rig)
        put(f"clothes{idx}", garment)
        place_uvs(obj, tiles[f"clothes{idx}"])

    hair = kinds.get("hair")
    hair_pixels = read_image(colour_texture_path(hair), size)
    recolour(hair_pixels, hair_pixels[..., 3] > 0.05, spec["hair"][1])
    put("hair", hair_pixels)
    eyes = read_image(colour_texture_path(kinds["eyes"]), size)
    grey = (eyes[..., :3] @ LUMA)[..., None]
    eyes[..., :3] = grey + (eyes[..., :3] - grey) * 0.55
    put("eyes", eyes)
    brows = read_image(colour_texture_path(kinds["eyebrows"]), size)
    recolour(brows, brows[..., 3] > 0.05, tuple(0.85 * x for x in (spec["hair"][1] if spec["age"] != "elderly" else spec["facial_colour"])))
    put("eyebrows", brows)
    if "eyelashes" in kinds:
        put("eyelashes", read_image(colour_texture_path(kinds["eyelashes"]), size))
    if "shoes" in kinds:
        put("shoes", read_image(colour_texture_path(kinds["shoes"]), size))
    for name, obj, tex, mode in made:
        if tex[0] == "fabric":
            put(name, fabric(tex[1], int(tiles[name][2] * size)))
        else:
            n = int(tiles[name][2] * size)
            put(name, np.concatenate([np.ones((n, n, 3), np.float32) * np.array(tex[1], np.float32), np.ones((n, n, 1), np.float32)], axis=2))
    outfit_image = write_image(atlas, os.path.join(workdir, f"{spec['id']}_outfit.png"), f"{spec['id']}_outfit")

    skin_mat = material("Skin", skin_image, alpha=False)
    outfit_mat = material("Outfit", outfit_image, alpha=True)

    parts = []
    for kind in ("hair", "eyes", "eyebrows", "eyelashes", "shoes"):
        if kind in kinds:
            place_uvs(kinds[kind], tiles[kind])
            parts.append(kinds[kind])
    if "braid" in hair_asset(spec):
        # The plait assets come with a side fringe over one eye; hair here is worn pulled back.
        cut_faces(hair, lambda cc, uv: cc.y < lm["head"].y + 0.045 and cc.z < lm["brow_z"] + 0.06)
    if headwear and hair is not None and spec["hair"][0].startswith("short"):
        # Short hair would poke through caps and head cloths: keep only what shows below them.
        cut_faces(hair, lambda cc, uv: cc.z > lm["brow_z"] + 0.025)
    parts += [obj for _, obj in clothes_objs]
    for name, obj, tex, mode in made:
        if mode == "uv":
            place_uvs(obj, tiles[name])
        elif mode == "bbox":
            place_uvs(obj, tiles[name], bbox=True)
        elif mode == "flat":
            flat_uvs(obj, tiles[name])
        else:
            flat_uvs(obj, tiles[name], mode[1])
        if obj not in parts:
            parts.append(obj)
    parts = [p for p in parts if len(p.data.polygons)]
    for obj in parts:
        obj.data.materials.clear()
        obj.data.materials.append(outfit_mat)
    body.data.materials.clear()
    body.data.materials.append(skin_mat)

    # --- LOD1: copies of the parts, without eyelashes, decimated hard
    lod1 = None
    if spec["budget"] <= 10000:
        lod_body = duplicate(body)
        lod_parts = [duplicate(p) for p in parts if p is not kinds.get("eyelashes")]
        small = [p for p in lod_parts if triangles(p) < 60]
        fit_budget([lod_body] + lod_parts, [lod_body] + [p for p in lod_parts if p not in small], LOD1_BUDGET, cap=0.5)
        lod1 = join(rig, lod_body, lod_parts, "Body_LOD1")

    # --- Triangle budget: shave the heavy parts, never the small ones
    heavy = [body] + [o for _, o in clothes_objs] + [o for o in (hair, kinds.get("shoes")) if o is not None]
    heavy += [o for name, o, tex, mode in made if triangles(o) > 400]
    fit_budget([body] + parts, list(dict.fromkeys(heavy)), spec["budget"], cap=0.3 if spec["proxy"] else 0.9, spare=[body])
    body = join(rig, body, parts, "Body")
    rig.name = "Armature"
    tris = triangles(body)
    print(f"{spec['id']}: {tris} triangles{f', LOD1 {triangles(lod1)}' if lod1 else ''}, {len(body.data.materials)} materials, {len(rig.data.bones)} bones")
    assert tris <= spec["budget"], f"{spec['id']} is over budget: {tris}"
    if lod1:
        assert triangles(lod1) <= LOD1_BUDGET, f"{spec['id']} LOD1 is over budget: {triangles(lod1)}"
    height = max((body.matrix_world @ v.co).z for v in body.data.vertices)
    return rig, body, lod1, {"triangles": tris, "lod1Triangles": triangles(lod1) if lod1 else None, "heightM": round(lm["top"], 3), "topM": round(height, 3)}


def cut_faces_by_bone(obj, drop):
    """Delete the faces for which drop(world centre, bone moving most of the face) is true."""
    fb = face_bones(obj, dominant_bones(obj))
    world = obj.matrix_world
    doomed = {p.index for p, b in zip(obj.data.polygons, fb) if drop(world @ p.center, b)}
    delete_faces(obj, doomed)


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
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def export(rig, meshes, path):
    """One GLB per person: the skeleton, both LOD meshes bound to it, and the five clips (one
    glTF animation per NLA track). No vertex colours (MPFB's black colour channel must never
    reach a material), no blend shapes."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in meshes:
        obj.hide_set(False)
        obj.select_set(True)
        for attr in list(obj.data.color_attributes):
            obj.data.color_attributes.remove(attr)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_morph=False,
        export_animations=not NO_ANIM,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_frame_range=False,
        export_vertex_color="NONE",
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_extras=False,
    )


def preview(rig, body, path, others=()):
    """Cycles renders: front, three-quarter, back and a face close-up (Eevee needs a GPU
    context that headless builds lack)."""
    for other in others:
        other.hide_render = True
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 20
    scene.render.resolution_x, scene.render.resolution_y = 400, 640
    world = scene.world or bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.7, 0.74, 0.8, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    if not bpy.data.objects.get("sun"):
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        sun.data.energy = 3.2
        sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(-30))
        scene.collection.objects.link(sun)
        bpy.ops.mesh.primitive_plane_add(size=6)
        ground = bpy.context.active_object
        ground.name = "ground"
        mat = bpy.data.materials.new("ground")
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.33, 0.3, 1)
        ground.data.materials.append(mat)
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    scene.camera = cam
    shots = []
    top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
    for i, (angle, zoom) in enumerate(((0, False), (35, False), (180, False), (15, True))):
        a = math.radians(angle)
        if zoom:
            target, dist, lens = Vector((0, 0, top - 0.12)), 0.9, 70
        else:
            target, dist, lens = Vector((0, 0, 0.88)), 4.2, 50
        cam.data.lens = lens
        cam.location = target + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        shot = f"{path}_{i}.png"
        scene.render.filepath = shot
        bpy.ops.render.render(write_still=True)
        shots.append(shot)
    return shots


def manifest_entry(spec, stats):
    return {
        "id": spec["id"],
        "file": spec["file"],
        "sex": spec["sex"],
        "age": spec["age"],
        "years": spec["years"],
        "child": spec["age"] == "child",
        "roles": spec["roles"],
        "clothing": spec["clothing"],
        "outfit": spec["outfit"],
        "board": BOARDS[spec["board"]],
        "figure": spec["figure"],
        "figureLabel": spec["label"],
        "alsoFigures": [{"board": BOARDS[b], "figure": f, "figureLabel": lab} for b, f, lab in spec["also"]],
        "note": spec["note"],
        "heightM": stats["heightM"],
        "seatHeightM": stats.get("seatHeightM"),
        "lods": [
            {"mesh": "Body", "triangles": stats["triangles"], "until": 30.0},
            {"mesh": "Body_LOD1", "triangles": stats["lod1Triangles"], "from": 30.0},
        ],
        "texture": spec["texture"],
        "animations": list(cast_animation.CLIPS),
        "licence": LICENCE_NOTE,
        "assets": stats["assets"],
    }


LICENCE_NOTE = ("Original character made by tools/blender/characters.py from MakeHuman/MPFB CC0 assets; "
                "see assets/LICENSES.md (MakeHuman CC0, CC-BY rows credited there; idle/walk/run from Mixamo via locomotion.glb)")


def used_assets(spec):
    """MakeHuman assets this person is made from (for the licence table)."""
    out = [f"skins/{s}" for s in skin_sources(spec)] + [f"proxymeshes/{spec['proxy']}" if spec["proxy"] else "base mesh",
                                                         f"hair/{hair_asset(spec)}", f"eyebrows/{spec['eyebrows']}", "eyes/low-poly"]
    if spec["eyelashes"]:
        out.append("eyelashes/eyelashes01")
    out += [f"clothes/{i['asset']}" for i in spec["clothes"]]
    if spec["shoes"] not in ("sandals", "barefoot"):
        out.append(f"clothes/{spec['shoes']}")
    return out


def selected_cast():
    people = [s for s in CAST if (SET is None or s["board"] == SET) and (not ONLY or s["id"] in ONLY)]
    if ONLY:
        missing = ONLY - {s["id"] for s in people}
        assert not missing, f"unknown ids: {missing}"
    return people


def main():
    human_service = load_mpfb()
    manifest_path = os.path.join(OUT, "people.json")
    entries = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            entries = {e["id"]: e for e in json.load(f)["people"]}
    src = cast_animation.SourceClips(LOCOMOTION)
    raw_dir = RAW
    with tempfile.TemporaryDirectory() as workdir:
        for spec in selected_cast():
            rig, body, lod1, stats = build(spec, human_service, workdir)
            tgt = cast_animation.TargetRig(rig)
            if not NO_ANIM:
                clips = cast_animation.make_clips(src, tgt, body)
                cast_animation.bake_to_rig(rig, tgt, clips)
                stats["seatHeightM"] = round(cast_animation.seat_height(tgt, clips) - 0.1, 3)
            stats["assets"] = used_assets(spec)
            export(rig, [body, lod1], os.path.join(raw_dir, spec["file"]))
            entries[spec["id"]] = manifest_entry(spec, stats)
            write_manifest(manifest_path, entries)  # after each person: a crash keeps the rest
            if PREVIEW:
                os.makedirs(PREVIEW, exist_ok=True)
                preview(rig, body, os.path.join(PREVIEW, spec["id"]), [lod1])


def write_manifest(path, entries):
    order = [s["id"] for s in CAST]
    people = [entries[i] for i in order if i in entries]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({"version": 1, "skeleton": "MPFB mixamo, 52 bones (Godot names mixamorig_<Bone>)",
                   "people": people}, f, indent=2)
        f.write("\n")


main()
