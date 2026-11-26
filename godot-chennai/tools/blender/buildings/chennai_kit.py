"""Modular Blender 5.x bmesh architectural grammar for Chennai buildings.

Produces crisp, deeply sculpted, non-Z-fighting 3D architectural geometry
with linear vertex colours (Col attribute), LOD0/LOD1/LOD2 hierarchy,
and simplified COL_* collision boxes exported via Blender's glTF 2.0 exporter.

Coordinate convention in Blender: +X east, +Y north (rear), -Y south (street front), +Z up.
`export_scene.gltf(..., export_yup=True)` converts to Godot (+X east, +Y up, +Z front).
"""

from __future__ import annotations

import math
from typing import Dict, List, Sequence, Tuple

import bmesh
import bpy
from mathutils import Matrix


def hex_lin(h: str, alpha: float = 1.0) -> Tuple[float, float, float, float]:
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (alpha,)


PAL: Dict[str, Tuple[float, float, float, float]] = {
    "cream": hex_lin("#EFE1AD"),
    "cream_trim": hex_lin("#F8EECC"),
    "cream_shade": hex_lin("#C8B680"),
    "white": hex_lin("#F2EFE8"),
    "white_shade": hex_lin("#CFCBC2"),
    "ochre": hex_lin("#D8A648"),
    "mustard": hex_lin("#CA8C24"),
    "pink": hex_lin("#E0A8B0"),
    "pink_trim": hex_lin("#F2D2D8"),
    "salmon": hex_lin("#DDA08E"),
    "sky_blue": hex_lin("#74AFC8"),
    "teal_wall": hex_lin("#589EA8"),
    "red_brick": hex_lin("#A64432"),
    "red_dark": hex_lin("#722A1E"),
    "tile_red": hex_lin("#923624"),
    "tile_ridge": hex_lin("#AD4430"),
    "tile_dark": hex_lin("#5A2218"),
    "terracotta": hex_lin("#B85C3C"),
    "surkhi": hex_lin("#9E6450"),
    "plinth": hex_lin("#807E77"),
    "pavement": hex_lin("#949188"),
    "concrete": hex_lin("#AEACA4"),
    "slate": hex_lin("#48505A"),
    "charcoal": hex_lin("#2B3038"),
    "steel_blue": hex_lin("#4E6E8A"),
    "steel_light": hex_lin("#9AA4AE"),
    "shutter": hex_lin("#858E96"),
    "glass_blue": hex_lin("#2D5F7E"),
    "glass_aqua": hex_lin("#3E859E"),
    "glass_rail": hex_lin("#4A7E94"),
    "lit_warm": hex_lin("#C4964E"),
    "recess": hex_lin("#1D2220"),
    "teak_green": hex_lin("#246848"),
    "teak_brown": hex_lin("#6B3E22"),
    "teak_dark": hex_lin("#3A2112"),
    "iron": hex_lin("#1D2025"),
    "pot": hex_lin("#B85A3A"),
    "foliage": hex_lin("#2E6A26"),
    "foliage_hi": hex_lin("#468B34"),
    "tank": hex_lin("#1B1E22"),
    "thatch": hex_lin("#A88D52"),
    "thatch_dark": hex_lin("#756032"),
    "copper_ac": hex_lin("#DDDAD0"),
    "gold": hex_lin("#D4A438"),
    "crimson": hex_lin("#9E2E2B"),
    "mosque_green": hex_lin("#247A4C"),
    "sign_green": hex_lin("#185E4E"),
    "sign_red": hex_lin("#A43824"),
    "sign_blue": hex_lin("#1E5692"),
    "sign_yellow": hex_lin("#C68A20"),
}


class MeshAcc:
    """Fast bmesh builder storing corner vertex colours cleanly."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new("Col")

    def _paint(self, faces: Sequence[bmesh.types.BMFace], colour: Tuple[float, float, float, float]) -> None:
        for f in faces:
            for loop in f.loops:
                loop[self.col] = colour

    def box(
        self,
        center: Tuple[float, float, float],
        size: Tuple[float, float, float],
        colour: Tuple[float, float, float, float],
        rot_x: float = 0.0,
        rot_y: float = 0.0,
        rot_z: float = 0.0,
    ) -> None:
        sx, sy, sz = size
        if sx <= 1e-4 or sy <= 1e-4 or sz <= 1e-4:
            return
        m = (
            Matrix.Translation(center)
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Rotation(rot_y, 4, "Y")
            @ Matrix.Rotation(rot_x, 4, "X")
            @ Matrix.Diagonal((sx, sy, sz, 1.0))
        )
        ret = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        vset = set(ret["verts"])
        self._paint([f for f in self.bm.faces if all(v in vset for v in f.verts)], colour)

    def cyl(
        self,
        center: Tuple[float, float, float],
        r1: float,
        r2: float,
        depth: float,
        colour: Tuple[float, float, float, float],
        segs: int = 10,
        rot_x: float = 0.0,
        rot_y: float = 0.0,
        rot_z: float = 0.0,
    ) -> None:
        if depth <= 1e-4 or (r1 <= 1e-4 and r2 <= 1e-4):
            return
        m = (
            Matrix.Translation(center)
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Rotation(rot_y, 4, "Y")
            @ Matrix.Rotation(rot_x, 4, "X")
        )
        ret = bmesh.ops.create_cone(
            self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth, matrix=m
        )
        vset = set(ret["verts"])
        self._paint([f for f in self.bm.faces if all(v in vset for v in f.verts)], colour)

    def sphere(
        self,
        center: Tuple[float, float, float],
        radius: float,
        colour: Tuple[float, float, float, float],
        subdiv: int = 1,
    ) -> None:
        ret = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=radius, matrix=Matrix.Translation(center))
        vset = set(ret["verts"])
        self._paint([f for f in self.bm.faces if all(v in vset for v in f.verts)], colour)

    def arch_slab(
        self,
        cx: float,
        y_mid: float,
        z_base: float,
        thick_y: float,
        radius: float,
        segs: int,
        colour: Tuple[float, float, float, float],
    ) -> None:
        hy = 0.5 * thick_y
        fv, bv = [], []
        for i in range(segs + 1):
            a = math.pi * i / segs
            vx = cx + radius * math.cos(a)
            vz = z_base + radius * math.sin(a)
            fv.append(self.bm.verts.new((vx, y_mid - hy, vz)))
            bv.append(self.bm.verts.new((vx, y_mid + hy, vz)))
        faces = [self.bm.faces.new(fv), self.bm.faces.new(list(reversed(bv)))]
        for i in range(segs + 1):
            j = (i + 1) % (segs + 1)
            faces.append(self.bm.faces.new([fv[j], fv[i], bv[i], bv[j]]))
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        self._paint(faces, colour)

    def pitched_roof(
        self,
        x0: float,
        x1: float,
        y0: float,
        y1: float,
        z0: float,
        ridge_h: float,
        colour_roof: Tuple[float, float, float, float],
        colour_gable: Tuple[float, float, float, float],
        hip: bool = False,
        barrel: bool = False,
    ) -> None:
        w, d = x1 - x0, y1 - y0
        if barrel:
            segs = 10
            along_x = w >= d
            if along_x:
                # Arch spans Y, runs along X
                my = 0.5 * (y0 + y1)
                ry = 0.5 * d
                for k in range(segs):
                    a0 = math.pi * k / segs
                    a1 = math.pi * (k + 1) / segs
                    ya, yb = my - ry * math.cos(a0), my - ry * math.cos(a1)
                    za, zb = z0 + ridge_h * math.sin(a0), z0 + ridge_h * math.sin(a1)
                    v0 = self.bm.verts.new((x0, ya, za))
                    v1 = self.bm.verts.new((x0, yb, zb))
                    v2 = self.bm.verts.new((x1, yb, zb))
                    v3 = self.bm.verts.new((x1, ya, za))
                    self._paint([self.bm.faces.new([v0, v3, v2, v1])], colour_roof)
                    if k > 0:
                        c0 = self.bm.verts.new((x0, my, z0))
                        c1 = self.bm.verts.new((x1, my, z0))
                        self._paint([
                            self.bm.faces.new([c0, self.bm.verts.new((x0, ya, za)), self.bm.verts.new((x0, yb, zb))]),
                            self.bm.faces.new([c1, self.bm.verts.new((x1, yb, zb)), self.bm.verts.new((x1, ya, za))]),
                        ], colour_gable)
            else:
                mx = 0.5 * (x0 + x1)
                rx = 0.5 * w
                for k in range(segs):
                    a0 = math.pi * k / segs
                    a1 = math.pi * (k + 1) / segs
                    xa, xb = mx - rx * math.cos(a0), mx - rx * math.cos(a1)
                    za, zb = z0 + ridge_h * math.sin(a0), z0 + ridge_h * math.sin(a1)
                    v0 = self.bm.verts.new((xa, y0, za))
                    v1 = self.bm.verts.new((xb, y0, zb))
                    v2 = self.bm.verts.new((xb, y1, zb))
                    v3 = self.bm.verts.new((xa, y1, za))
                    self._paint([self.bm.faces.new([v0, v1, v2, v3])], colour_roof)
                    c0 = self.bm.verts.new((mx, y0, z0))
                    c1 = self.bm.verts.new((mx, y1, z0))
                    self._paint([
                        self.bm.faces.new([c0, self.bm.verts.new((xb, y0, zb)), self.bm.verts.new((xa, y0, za))]),
                        self.bm.faces.new([c1, self.bm.verts.new((xa, y1, za)), self.bm.verts.new((xb, y1, zb))]),
                    ], colour_gable)
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[-segs * 3 :])
            return

        if hip:
            ins = min(w, d) * 0.30
            ix0, ix1, iy0, iy1 = x0 + ins, x1 - ins, y0 + ins, y1 - ins
            zt = z0 + ridge_h
            b = [self.bm.verts.new((x0, y0, z0)), self.bm.verts.new((x1, y0, z0)), self.bm.verts.new((x1, y1, z0)), self.bm.verts.new((x0, y1, z0))]
            t = [self.bm.verts.new((ix0, iy0, zt)), self.bm.verts.new((ix1, iy0, zt)), self.bm.verts.new((ix1, iy1, zt)), self.bm.verts.new((ix0, iy1, zt))]
            faces = [
                self.bm.faces.new([b[0], b[1], t[1], t[0]]),
                self.bm.faces.new([b[1], b[2], t[2], t[1]]),
                self.bm.faces.new([b[2], b[3], t[3], t[2]]),
                self.bm.faces.new([b[3], b[0], t[0], t[3]]),
                self.bm.faces.new([t[0], t[1], t[2], t[3]]),
                self.bm.faces.new([b[3], b[2], b[1], b[0]]),
            ]
            bmesh.ops.recalc_face_normals(self.bm, faces=faces)
            self._paint(faces, colour_roof)
            return

        # Gable roof along longest horizontal axis
        if d >= w:
            mx = 0.5 * (x0 + x1)
            b = [self.bm.verts.new((x0, y0, z0)), self.bm.verts.new((x1, y0, z0)), self.bm.verts.new((x1, y1, z0)), self.bm.verts.new((x0, y1, z0))]
            r0, r1 = self.bm.verts.new((mx, y0, z0 + ridge_h)), self.bm.verts.new((mx, y1, z0 + ridge_h))
            rf = [self.bm.faces.new([b[0], r0, r1, b[3]]), self.bm.faces.new([b[1], b[2], r1, r0])]
            gf = [self.bm.faces.new([b[0], b[1], r0]), self.bm.faces.new([b[2], b[3], r1]), self.bm.faces.new([b[3], b[2], b[1], b[0]])]
        else:
            my = 0.5 * (y0 + y1)
            b = [self.bm.verts.new((x0, y0, z0)), self.bm.verts.new((x1, y0, z0)), self.bm.verts.new((x1, y1, z0)), self.bm.verts.new((x0, y1, z0))]
            r0, r1 = self.bm.verts.new((x0, my, z0 + ridge_h)), self.bm.verts.new((x1, my, z0 + ridge_h))
            rf = [self.bm.faces.new([b[0], b[1], r1, r0]), self.bm.faces.new([b[2], b[3], r0, r1])]
            gf = [self.bm.faces.new([b[0], r0, b[3]]), self.bm.faces.new([b[1], b[2], r1]), self.bm.faces.new([b[3], b[2], b[1], b[0]])]
        bmesh.ops.recalc_face_normals(self.bm, faces=rf + gf)
        self._paint(rf, colour_roof)
        self._paint(gf, colour_gable)

    def dome(self, cx: float, cy: float, z0: float, r: float, h: float, colour: Tuple[float, float, float, float], segs: int = 12, rings: int = 4) -> None:
        prev = None
        faces = []
        for ri in range(rings + 1):
            t = ri / rings
            ang = 0.5 * math.pi * t
            cr = r * math.cos(ang)
            cz = z0 + h * math.sin(ang)
            if ri == rings:
                apex = self.bm.verts.new((cx, cy, z0 + h))
                for i in range(segs):
                    j = (i + 1) % segs
                    faces.append(self.bm.faces.new([prev[i], prev[j], apex]))
            else:
                cur = [self.bm.verts.new((cx + cr * math.cos(2 * math.pi * i / segs), cy + cr * math.sin(2 * math.pi * i / segs), cz)) for i in range(segs)]
                if prev is not None:
                    for i in range(segs):
                        j = (i + 1) % segs
                        faces.append(self.bm.faces.new([prev[i], prev[j], cur[j], cur[i]]))
                prev = cur
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        self._paint(faces, colour)

    def to_object(self, mat: bpy.types.Material, loc: Tuple[float, float, float] = (0.0, 0.0, 0.0)) -> bpy.types.Object:
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for p in me.polygons:
            p.use_smooth = False
        me.materials.append(mat)
        ob = bpy.data.objects.new(self.name, me)
        ob.location = loc
        bpy.context.scene.collection.objects.link(ob)
        return ob


# ---------------------------------------------------------------------------
# Sculpted Architectural Sub-Assemblies
# ---------------------------------------------------------------------------

def add_compound_fence(
    acc: MeshAcc,
    w: float,
    y_front: float,
    y_back: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    modern_wood_gate: bool = False,
    lod: int = 0,
) -> None:
    if lod >= 2:
        return
    hw = 0.5 * w
    gate_hw = min(1.35, hw * 0.34)
    # Front masonry base wall left & right
    wing_w = max(0.6, hw - gate_hw - 0.22)
    for sx in (-1, 1):
        cx = sx * (gate_hw + 0.22 + 0.5 * wing_w)
        acc.box((cx, y_front, 0.45), (wing_w, 0.24, 0.90), wall_col)
        acc.box((cx, y_front, 0.93), (wing_w + 0.04, 0.30, 0.06), trim_col)
        if not modern_wood_gate and lod == 0:
            # Wrought-iron top fence bars
            acc.box((cx, y_front, 1.38), (wing_w - 0.1, 0.04, 0.04), PAL["iron"])
            acc.box((cx, y_front, 1.06), (wing_w - 0.1, 0.04, 0.04), PAL["iron"])
            nb = max(3, int(wing_w / 0.28))
            for bi in range(nb + 1):
                bx = cx - 0.45 * wing_w + bi * (0.9 * wing_w / nb)
                acc.cyl((bx, y_front, 1.20), 0.015, 0.015, 0.48, PAL["iron"], segs=6)

    # Gate piers & corner piers
    pier_xs = (-hw + 0.22, -gate_hw - 0.12, gate_hw + 0.12, hw - 0.22)
    for px in pier_xs:
        ph = 1.62 if abs(px) < hw * 0.5 else 1.52
        acc.box((px, y_front, 0.5 * ph), (0.40, 0.40, ph), wall_col)
        acc.box((px, y_front, ph + 0.04), (0.48, 0.48, 0.08), trim_col)

    # Side perimeter walls back to building line
    side_len = max(0.5, y_back - y_front)
    for sx in (-1, 1):
        acc.box((sx * (hw - 0.12), 0.5 * (y_front + y_back), 0.65), (0.22, side_len, 1.30), wall_col)

    # Entrance Gate
    if lod == 0:
        if modern_wood_gate:
            for gz in (0.35, 0.62, 0.89, 1.16, 1.43):
                acc.box((0.0, y_front, gz), (gate_hw * 1.85, 0.06, 0.17), PAL["teak_brown"])
            acc.box((0.0, y_front, 0.88), (gate_hw * 1.88, 0.04, 1.32), PAL["iron"])
        else:
            acc.box((0.0, y_front, 1.38), (gate_hw * 1.82, 0.04, 0.05), PAL["iron"])
            acc.box((0.0, y_front, 0.26), (gate_hw * 1.82, 0.04, 0.05), PAL["iron"])
            nb = 10
            for bi in range(nb + 1):
                gx = -gate_hw * 0.88 + bi * (gate_hw * 1.76 / nb)
                bh = 1.15 + 0.12 * max(0.0, 1.0 - (gx / max(0.5, gate_hw)) ** 2)
                acc.cyl((gx, y_front, 0.26 + 0.5 * bh), 0.015, 0.015, bh, PAL["iron"], segs=6)

        # Potted greenery beside gate piers
        for sx in (-1, 1):
            px, py = sx * (gate_hw + 0.52), y_front - 0.34
            acc.cyl((px, py, 0.18), 0.13, 0.18, 0.36, PAL["pot"], segs=8)
            acc.sphere((px, py, 0.48), 0.22, PAL["foliage"], subdiv=1)
            acc.sphere((px + sx * 0.08, py - 0.05, 0.44), 0.15, PAL["foliage_hi"], subdiv=1)


def add_clay_tile_canopy(
    acc: MeshAcc,
    w: float,
    y_front: float,
    y_back: float,
    z_low: float,
    z_high: float,
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    span_y = y_back - y_front
    dz = z_high - z_low
    pitch = math.atan2(dz, span_y)
    yc, zc = 0.5 * (y_front + y_back), 0.5 * (z_low + z_high)
    rlen = math.hypot(span_y, dz) + 0.14
    acc.box((0.0, yc, zc), (w, rlen, 0.11), PAL["tile_dark"], rot_x=pitch)
    acc.box((0.0, y_front - 0.04, z_low - 0.04), (w + 0.06, 0.08, 0.13), PAL["teak_dark"])
    if lod == 0:
        n_tiles = max(12, min(42, int(w / 0.24)))
        dx = (w - 0.16) / n_tiles
        for ti in range(n_tiles):
            tx = -0.5 * w + 0.08 + (ti + 0.5) * dx
            acc.cyl((tx, yc, zc + 0.06), 0.088, 0.088, rlen, PAL["tile_red"], segs=6, rot_x=math.pi * 0.5 + pitch)
        for frac in (-0.32, 0.0, 0.32):
            acc.box((0.0, yc + frac * span_y, zc + frac * dz + 0.07), (w - 0.08, 0.07, 0.045), PAL["tile_ridge"], rot_x=pitch)
        for sx in (-1, 1):
            acc.box((sx * (0.5 * w - 0.02), yc, zc + 0.04), (0.09, rlen, 0.15), trim_col, rot_x=pitch)
    else:
        acc.box((0.0, yc, zc + 0.08), (w, rlen, 0.09), PAL["tile_red"], rot_x=pitch)


def add_window(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    cz: float,
    ww: float,
    wh: float,
    face_dir: Tuple[float, float],
    frame_col: Tuple[float, float, float, float],
    pane_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    with_chajja: bool = True,
    with_grille: bool = True,
    arched: bool = False,
    lod: int = 0,
) -> None:
    """Place a sculpted proud/recessed window box + mullion + sill + chajja on +Y/-Y or +X/-X wall."""
    nx, ny = face_dir
    if abs(ny) > abs(nx):
        # Front (-Y) or Back (+Y)
        s = ny
        acc.box((cx, y_wall + s * 0.02, cz), (ww, 0.08, wh), frame_col)
        acc.box((cx, y_wall + s * 0.055, cz), (ww - 0.14, 0.03, wh - 0.14), pane_col)
        acc.box((cx, y_wall + s * 0.08, cz - 0.5 * wh - 0.04), (ww + 0.16, 0.16, 0.08), trim_col)
        if lod == 0:
            acc.box((cx, y_wall + s * 0.07, cz), (0.06, 0.04, wh - 0.06), frame_col)
            if with_grille:
                for frac in (-0.25, 0.0, 0.25):
                    acc.box((cx, y_wall + s * 0.075, cz + frac * wh), (ww - 0.12, 0.025, 0.025), PAL["iron"])
        if with_chajja and lod < 2:
            acc.box((cx, y_wall + s * 0.26, cz + 0.5 * wh + 0.09), (ww + 0.28, 0.52, 0.09), trim_col, rot_x=s * 0.22)
        if arched and lod == 0:
            acc.arch_slab(cx, y_wall + s * 0.05, cz + 0.5 * wh - 0.02, 0.10, 0.5 * ww, 8, pane_col)
    else:
        s = nx
        acc.box((y_wall + s * 0.02, cx, cz), (0.08, ww, wh), frame_col)
        acc.box((y_wall + s * 0.055, cx, cz), (0.03, ww - 0.14, wh - 0.14), pane_col)
        acc.box((y_wall + s * 0.08, cx, cz - 0.5 * wh - 0.04), (0.16, ww + 0.16, 0.08), trim_col)
        if with_chajja and lod < 2:
            acc.box((y_wall + s * 0.26, cx, cz + 0.5 * wh + 0.09), (0.52, ww + 0.28, 0.09), trim_col, rot_y=-s * 0.22)


def add_balcony(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    fz: float,
    bw: float,
    depth: float,
    trim_col: Tuple[float, float, float, float],
    glass_rail: bool = True,
    lod: int = 0,
) -> None:
    """Projecting balcony slab (Y facing front -Y) with glass or wrought-iron balustrade & French doors."""
    yc = y_wall - 0.5 * depth
    acc.box((cx, yc, fz - 0.03), (bw, depth, 0.14), trim_col)
    # Recessed French glazed slider
    acc.box((cx, y_wall - 0.02, fz + 1.05), (min(bw - 0.25, 1.5), 0.08, 2.05), PAL["teak_dark"])
    acc.box((cx, y_wall - 0.045, fz + 1.05), (min(bw - 0.38, 1.32), 0.04, 1.90), PAL["lit_warm"] if int(cx + fz) % 2 == 0 else PAL["glass_blue"])
    if lod == 0:
        if glass_rail:
            acc.box((cx, y_wall - depth + 0.05, fz + 0.50), (bw - 0.08, 0.05, 0.88), PAL["glass_rail"])
            acc.box((cx, y_wall - depth + 0.05, fz + 0.96), (bw + 0.02, 0.08, 0.06), PAL["steel_light"])
            for sx in (-1, 0, 1):
                acc.box((cx + sx * (0.48 * bw - 0.04), y_wall - depth + 0.05, fz + 0.49), (0.05, 0.06, 0.92), PAL["charcoal"])
        else:
            acc.box((cx, y_wall - depth + 0.06, fz + 0.24), (bw, 0.14, 0.36), trim_col)
            acc.box((cx, y_wall - depth + 0.06, fz + 0.92), (bw, 0.05, 0.05), PAL["iron"])
            np = max(4, int(bw / 0.32))
            for pi in range(np + 1):
                px = cx - 0.46 * bw + pi * (0.92 * bw / np)
                acc.cyl((px, y_wall - depth + 0.06, fz + 0.67), 0.015, 0.015, 0.50, PAL["iron"], segs=6)
    elif lod == 1:
        acc.box((cx, y_wall - depth + 0.05, fz + 0.48), (bw, 0.08, 0.84), PAL["glass_rail"] if glass_rail else trim_col)


def add_shop_row(
    acc: MeshAcc,
    w: float,
    y_wall: float,
    z_base: float,
    lod: int = 0,
    open_bays: bool = True,
    with_awning: bool = True,
) -> None:
    """Ground-floor Chennai retail row with pilasters, shutters/open display, signboard fascia & awnings."""
    n_bays = max(1, min(6, int((w - 0.4) // 3.4)))
    bay_w = (w - 0.4) / n_bays
    sign_cols = (PAL["sign_green"], PAL["sign_red"], PAL["sign_blue"], PAL["sign_yellow"])
    for bi in range(n_bays):
        bx = -0.5 * w + 0.2 + (bi + 0.5) * bay_w
        sw = bay_w - 0.36
        # Pilasters flanking bay
        acc.box((bx - 0.5 * bay_w + 0.10, y_wall - 0.06, z_base + 1.55), (0.20, 0.14, 3.10), PAL["cream_trim"])
        acc.box((bx + 0.5 * bay_w - 0.10, y_wall - 0.06, z_base + 1.55), (0.20, 0.14, 3.10), PAL["cream_trim"])
        if open_bays and bi % 2 == 0:
            # Lit interior shop opening + half-rolled shutter box
            acc.box((bx, y_wall - 0.03, z_base + 1.10), (sw, 0.08, 2.20), PAL["lit_warm"])
            acc.box((bx, y_wall - 0.07, z_base + 2.30), (sw + 0.04, 0.14, 0.28), PAL["shutter"])
            if lod == 0:
                acc.box((bx, y_wall - 0.12, z_base + 0.45), (sw * 0.85, 0.24, 0.72), PAL["teak_brown"])
        else:
            # Ribbed corrugated steel rolling shutter
            acc.box((bx, y_wall - 0.04, z_base + 1.22), (sw, 0.08, 2.44), PAL["shutter"])
            if lod == 0:
                for rz in (0.4, 0.8, 1.2, 1.6, 2.0):
                    acc.box((bx, y_wall - 0.09, z_base + rz), (sw - 0.06, 0.03, 0.04), PAL["slate"])
        # Bilingual generic category signboard fascia frame (no brands per TD-18)
        sc = sign_cols[bi % 4]
        acc.box((bx, y_wall - 0.11, z_base + 2.82), (sw + 0.08, 0.16, 0.54), sc)
        acc.box((bx, y_wall - 0.19, z_base + 2.82), (sw * 0.78, 0.02, 0.24), PAL["cream_trim"])
        # Sloped canopy awning
        if with_awning and lod < 2:
            acc.box((bx, y_wall - 0.54, z_base + 2.42), (sw + 0.12, 0.96, 0.08), PAL["terracotta"] if bi % 2 == 0 else PAL["steel_blue"], rot_x=0.28)


def add_rooftop_props(acc: MeshAcc, w: float, d: float, z_roof: float, lod: int = 0, add_tank: bool = True) -> None:
    if lod >= 2:
        return
    if add_tank:
        tx, ty = -0.25 * w, 0.22 * d
        acc.box((tx, ty, z_roof + 0.25), (1.3, 1.3, 0.50), PAL["red_brick"])
        acc.cyl((tx, ty, z_roof + 1.15), 0.58, 0.58, 1.30, PAL["tank"], segs=12 if lod == 0 else 8)
    if lod == 0 and w >= 8.0:
        # Staircase mumty head
        mx, my = 0.22 * w, 0.24 * d
        mw, md = min(2.6, 0.26 * w), min(3.0, 0.26 * d)
        acc.box((mx, my, z_roof + 1.05), (mw, md, 2.10), PAL["cream"])
        acc.box((mx, my, z_roof + 2.15), (mw + 0.24, md + 0.24, 0.14), PAL["terracotta"])
        # AC outdoor unit
        acc.box((0.5 * w + 0.16, 0.0, z_roof - 1.2), (0.32, 0.78, 0.52), PAL["copper_ac"])
        acc.cyl((0.5 * w + 0.32, -0.10, z_roof - 1.2), 0.18, 0.18, 0.04, PAL["charcoal"], segs=10, rot_y=math.pi * 0.5)


def add_parapet_with_jaali(
    acc: MeshAcc,
    w: float,
    d: float,
    z_eaves: float,
    parapet_h: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    shade_col: Tuple[float, float, float, float],
    pediment: bool = False,
    lod: int = 0,
) -> float:
    """Perimeter cornice, surkhi terrace, side/rear parapets, front perforated jaali & optional arched crest."""
    hw, hd = 0.5 * w, 0.5 * d
    acc.box((0.0, 0.0, z_eaves + 0.08), (w + 0.24, d + 0.24, 0.16), trim_col)
    acc.box((0.0, 0.0, z_eaves + 0.05), (max(1.0, w - 0.5), max(1.0, d - 0.5), 0.08), PAL["surkhi"])
    # Side & rear parapet walls
    acc.box((-hw + 0.12, 0.0, z_eaves + 0.16 + 0.5 * parapet_h), (0.22, d, parapet_h), wall_col)
    acc.box((+hw - 0.12, 0.0, z_eaves + 0.16 + 0.5 * parapet_h), (0.22, d, parapet_h), wall_col)
    acc.box((0.0, +hd - 0.12, z_eaves + 0.16 + 0.5 * parapet_h), (w, 0.22, parapet_h), wall_col)

    y_p = -hd + 0.12
    z_top = z_eaves + 0.16 + parapet_h
    if pediment and w >= 5.5:
        ped_hw = min(1.35, hw * 0.35)
        wing_w = max(0.5, hw - ped_hw - 0.15)
        for sx in (-1, 1):
            wx = sx * (ped_hw + 0.5 * wing_w)
            acc.box((sx * (hw - 0.15), y_p, z_eaves + 0.16 + 0.5 * parapet_h + 0.05), (0.30, 0.26, parapet_h + 0.10), wall_col)
            acc.box((wx, y_p, z_top + 0.04), (wing_w + 0.10, 0.24, 0.12), trim_col)
            if lod == 0:
                nb = max(3, int(wing_w / 0.36))
                for bi in range(nb):
                    bx = (wx - 0.42 * wing_w) + bi * (0.84 * wing_w / max(1, nb - 1))
                    acc.box((bx, y_p, z_eaves + 0.16 + 0.48 * parapet_h), (0.14, 0.18, parapet_h * 0.86), wall_col)
            else:
                acc.box((wx, y_p, z_eaves + 0.16 + 0.48 * parapet_h), (wing_w - 0.1, 0.18, parapet_h * 0.84), shade_col)
        # Central arched pediment + medallion
        acc.box((0.0, y_p, z_eaves + 0.16 + 0.52 * parapet_h), (2.0 * ped_hw, 0.28, parapet_h * 1.05), wall_col)
        rad = ped_hw * 0.68
        acc.arch_slab(0.0, y_p, z_top, 0.28, rad, 12 if lod == 0 else 6, wall_col)
        if lod < 2:
            acc.arch_slab(0.0, y_p - 0.04, z_top, 0.12, rad + 0.08, 12 if lod == 0 else 6, trim_col)
        if lod == 0:
            acc.cyl((0.0, y_p - 0.18, z_top + 0.10), rad * 0.40, rad * 0.40, 0.07, shade_col, segs=12, rot_x=math.pi * 0.5)
            acc.cyl((0.0, y_p - 0.21, z_top + 0.10), rad * 0.28, rad * 0.28, 0.05, trim_col, segs=12, rot_x=math.pi * 0.5)
        return z_top + rad + 0.08
    else:
        acc.box((0.0, y_p, z_eaves + 0.16 + 0.5 * parapet_h), (w, 0.22, parapet_h), wall_col)
        acc.box((0.0, y_p, z_top + 0.04), (w + 0.10, 0.26, 0.10), trim_col)
        return z_top + 0.10


def make_vertex_material(name: str = "ChennaiMat") -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.88
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.14
    return mat


def export_glb_scene(
    out_glb: Path,
    mat: bpy.types.Material,
    lod_accs: Tuple[MeshAcc, MeshAcc, MeshAcc],
    colliders: Sequence[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]],
) -> Dict[str, int]:
    """Assemble LOD0..2 + COL_* objects cleanly in empty scene and export GLB."""
    tris = {}
    for idx, acc in enumerate(lod_accs):
        ob = acc.to_object(mat)
        tris[f"LOD{idx}"] = sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons)
    for cname, loc, sz in colliders:
        ca = MeshAcc(cname)
        ca.box((0.0, 0.0, 0.0), sz, (1.0, 1.0, 1.0, 0.35))
        ca.to_object(mat, loc=loc)
    out_glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(out_glb),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=False,
        export_animations=False,
        export_texcoords=False,
        export_normals=True,
        export_cameras=False,
        export_lights=False,
        export_tangents=False,
        export_materials="EXPORT",
    )
    return tris

