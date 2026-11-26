"""Blender 5.x shard 2 builder: 20 Modern Residential & Apartment Chennai buildings.

Generates LOD0, LOD1, LOD2, and COL_* nodes with linear vertex colours (Col)
and exports all 20 GLBs into assets/buildings/pack_100/<id>.glb plus
shard_2_meta.json.

Usage:
    /opt/homebrew/bin/blender -b --factory-startup --python godot-chennai/tools/blender/buildings/shard_2.py
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Sequence, Tuple

import bmesh
import bpy

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from chennai_kit import (  # noqa: E402
    PAL,
    MeshAcc,
    add_balcony,
    add_clay_tile_canopy,
    add_compound_fence,
    add_parapet_with_jaali,
    add_rooftop_props,
    add_shop_row,
    add_window,
    export_glb_scene,
    hex_lin,
    make_vertex_material,
)

ROOT = Path(__file__).resolve().parents[3]
PACK_DIR = ROOT / "assets" / "buildings" / "pack_100"
META_PATH = THIS_DIR / "shard_2_meta.json"

EXTRA_PAL = {
    "yellow_plaster": hex_lin("#E4BA58"),
    "yellow_trim": hex_lin("#F6DCA0"),
    "rose_plaster": hex_lin("#D98C98"),
    "warm_grey": hex_lin("#9A9890"),
    "stone_dark": hex_lin("#3B4048"),
    "stone_mid": hex_lin("#585E68"),
    "cream_dark": hex_lin("#B7A572"),
    "wood_slat": hex_lin("#7A4928"),
    "tin_sheet": hex_lin("#7B8894"),
    "lawn": hex_lin("#3F7832"),
}


# ---------------------------------------------------------------------------
# Reusable Architectural Sub-Assemblies
# ---------------------------------------------------------------------------

def add_polygon_prism(
    acc: MeshAcc,
    pts_xy: Sequence[Tuple[float, float]],
    z0: float,
    z1: float,
    colour: Tuple[float, float, float, float],
) -> None:
    """Create a vertical extruded prism from a 2D CCW polygon."""
    if len(pts_xy) < 3 or z1 <= z0 + 1e-4:
        return
    bot = [acc.bm.verts.new((x, y, z0)) for x, y in pts_xy]
    top = [acc.bm.verts.new((x, y, z1)) for x, y in pts_xy]
    faces = [
        acc.bm.faces.new(list(reversed(bot))),
        acc.bm.faces.new(top),
    ]
    n = len(pts_xy)
    for i in range(n):
        j = (i + 1) % n
        faces.append(acc.bm.faces.new([bot[i], bot[j], top[j], top[i]]))
    bmesh.ops.recalc_face_normals(acc.bm, faces=faces)
    acc._paint(faces, colour)


def add_door(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    z_base: float,
    dw: float,
    dh: float,
    face_dir: Tuple[float, float],
    frame_col: Tuple[float, float, float, float],
    leaf_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
    double_leaf: bool = True,
) -> None:
    """Sculpted framed entry door with sill step, architrave & transom."""
    if lod >= 2:
        return
    nx, ny = face_dir
    if abs(ny) >= abs(nx):
        s = 1.0 if ny >= 0 else -1.0
        acc.box((cx, y_wall + s * 0.03, z_base + 0.5 * dh), (dw, 0.10, dh), frame_col)
        if double_leaf and lod == 0:
            lw = 0.5 * (dw - 0.16)
            for sx in (-1, 1):
                acc.box((cx + sx * (0.5 * lw + 0.02), y_wall + s * 0.07, z_base + 0.46 * dh), (lw, 0.04, dh - 0.16), leaf_col)
        else:
            acc.box((cx, y_wall + s * 0.07, z_base + 0.48 * dh), (dw - 0.14, 0.04, dh - 0.14), leaf_col)
        acc.box((cx, y_wall + s * 0.11, z_base + dh + 0.05), (dw + 0.24, 0.20, 0.10), trim_col)
        acc.box((cx, y_wall + s * 0.16, z_base + 0.06), (dw + 0.28, 0.28, 0.12), PAL["plinth"])
    else:
        s = 1.0 if nx >= 0 else -1.0
        acc.box((y_wall + s * 0.03, cx, z_base + 0.5 * dh), (0.10, dw, dh), frame_col)
        acc.box((y_wall + s * 0.07, cx, z_base + 0.48 * dh), (0.04, dw - 0.14, dh - 0.14), leaf_col)
        acc.box((y_wall + s * 0.11, cx, z_base + dh + 0.05), (0.20, dw + 0.24, 0.10), trim_col)


def add_louver_screen(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z0: float,
    z1: float,
    span: float,
    n_fins: int,
    colour: Tuple[float, float, float, float],
    along_x: bool = True,
    fin_thick: float = 0.045,
    fin_depth: float = 0.22,
    lod: int = 0,
) -> None:
    """Vertical louver blades for modern Chennai facades."""
    if lod >= 2:
        return
    h = z1 - z0
    zc = 0.5 * (z0 + z1)
    nf = n_fins if lod == 0 else max(3, n_fins // 2)
    for i in range(nf):
        t = (i + 0.5) / nf - 0.5
        if along_x:
            acc.box((cx + t * span, cy, zc), (fin_thick, fin_depth, h), colour)
        else:
            acc.box((cx, cy + t * span, zc), (fin_depth, fin_thick, h), colour)


def add_pergola(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z_base: float,
    pw: float,
    pd: float,
    n_beams: int,
    beam_col: Tuple[float, float, float, float],
    frame_col: Tuple[float, float, float, float],
    lod: int = 0,
    along_x: bool = True,
) -> None:
    """Rooftop or terrace slatted pergola beams with perimeter header frame."""
    if lod >= 2:
        return
    for sy in (-1, 1):
        acc.box((cx, cy + sy * (0.5 * pd - 0.08), z_base), (pw, 0.16, 0.18), frame_col)
    for sx in (-1, 1):
        acc.box((cx + sx * (0.5 * pw - 0.08), cy, z_base), (0.16, pd, 0.18), frame_col)
    nb = n_beams if lod == 0 else max(3, n_beams // 2)
    for i in range(nb):
        t = (i + 0.5) / nb - 0.5
        if along_x:
            acc.box((cx + t * (pw - 0.30), cy, z_base + 0.04), (0.09, pd - 0.12, 0.14), beam_col)
        else:
            acc.box((cx, cy + t * (pd - 0.30), z_base + 0.04), (pw - 0.12, 0.09, 0.14), beam_col)


def add_water_tank(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z_roof: float,
    lod: int = 0,
    r: float = 0.54,
    h: float = 1.25,
) -> None:
    if lod >= 2:
        return
    acc.box((cx, cy, z_roof + 0.22), (r * 2.2, r * 2.2, 0.44), PAL["red_brick"])
    acc.cyl((cx, cy, z_roof + 0.44 + 0.5 * h), r, r, h, PAL["tank"], segs=10 if lod == 0 else 6)
    if lod == 0:
        acc.cyl((cx, cy, z_roof + 0.44 + h + 0.04), r * 0.72, r * 0.72, 0.08, PAL["slate"], segs=8)


def add_ac_unit(
    acc: MeshAcc,
    cx: float,
    cy: float,
    cz: float,
    face_dir: Tuple[float, float],
    lod: int = 0,
) -> None:
    if lod >= 1:
        return
    nx, ny = face_dir
    if abs(ny) >= abs(nx):
        s = 1.0 if ny >= 0 else -1.0
        acc.box((cx, cy + s * 0.16, cz), (0.76, 0.30, 0.52), PAL["copper_ac"])
        acc.cyl((cx - 0.12, cy + s * 0.31, cz), 0.17, 0.17, 0.04, PAL["charcoal"], segs=8, rot_x=math.pi * 0.5)
    else:
        s = 1.0 if nx >= 0 else -1.0
        acc.box((cx + s * 0.16, cy, cz), (0.30, 0.76, 0.52), PAL["copper_ac"])
        acc.cyl((cx + s * 0.31, cy - 0.12, cz), 0.17, 0.17, 0.04, PAL["charcoal"], segs=8, rot_y=math.pi * 0.5)


def add_stair_mumty(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z_roof: float,
    mw: float,
    md: float,
    mh: float,
    wall_col: Tuple[float, float, float, float],
    cap_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    if lod >= 2:
        return
    acc.box((cx, cy, z_roof + 0.5 * mh), (mw, md, mh), wall_col)
    acc.box((cx, cy, z_roof + mh + 0.07), (mw + 0.24, md + 0.24, 0.14), cap_col)
    if lod == 0:
        acc.box((cx, cy - 0.5 * md - 0.02, z_roof + 0.45 * mh), (min(0.9, mw * 0.45), 0.06, mh * 0.78), PAL["teak_dark"])


def add_potted_palm(
    acc: MeshAcc,
    px: float,
    py: float,
    pz: float,
    lod: int = 0,
    scale: float = 1.0,
) -> None:
    if lod >= 2:
        return
    if lod == 1:
        acc.box((px, py, pz + 0.38 * scale), (0.38 * scale, 0.38 * scale, 0.76 * scale), PAL["foliage"])
        return
    acc.cyl((px, py, pz + 0.18 * scale), 0.14 * scale, 0.20 * scale, 0.36 * scale, PAL["pot"], segs=8)
    acc.cyl((px, py, pz + 0.48 * scale), 0.05 * scale, 0.04 * scale, 0.32 * scale, PAL["teak_brown"], segs=6)
    acc.sphere((px, py, pz + 0.70 * scale), 0.24 * scale, PAL["foliage"], subdiv=1)
    acc.sphere((px + 0.10 * scale, py - 0.06 * scale, pz + 0.64 * scale), 0.16 * scale, PAL["foliage_hi"], subdiv=1)


def add_aligned_parapet(
    acc: MeshAcc,
    w: float,
    d: float,
    yc: float,
    z_eaves: float,
    parapet_h: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    shade_col: Tuple[float, float, float, float],
    pediment: bool = False,
    jaali: bool = True,
    lod: int = 0,
) -> float:
    """Perimeter cornice, surkhi deck, side/rear parapets, front jaali & optional arched crest centered at yc."""
    if lod >= 2:
        acc.box((0.0, yc, z_eaves + 0.08 + 0.5 * parapet_h), (w + 0.16, d + 0.16, parapet_h + 0.16), wall_col)
        return z_eaves + 0.16 + parapet_h
    hw, hd = 0.5 * w, 0.5 * d
    acc.box((0.0, yc, z_eaves + 0.08), (w + 0.24, d + 0.24, 0.16), trim_col)
    acc.box((0.0, yc, z_eaves + 0.05), (max(1.0, w - 0.5), max(1.0, d - 0.5), 0.08), PAL["surkhi"])
    acc.box((-hw + 0.12, yc, z_eaves + 0.16 + 0.5 * parapet_h), (0.22, d, parapet_h), wall_col)
    acc.box((+hw - 0.12, yc, z_eaves + 0.16 + 0.5 * parapet_h), (0.22, d, parapet_h), wall_col)
    acc.box((0.0, yc + hd - 0.12, z_eaves + 0.16 + 0.5 * parapet_h), (w, 0.22, parapet_h), wall_col)

    y_p = yc - hd + 0.12
    z_top = z_eaves + 0.16 + parapet_h
    if pediment and w >= 5.5 and lod < 2:
        ped_hw = min(1.35, hw * 0.35)
        wing_w = max(0.5, hw - ped_hw - 0.15)
        for sx in (-1, 1):
            wx = sx * (ped_hw + 0.5 * wing_w)
            acc.box((sx * (hw - 0.15), y_p, z_eaves + 0.16 + 0.5 * parapet_h + 0.05), (0.30, 0.26, parapet_h + 0.10), wall_col)
            acc.box((wx, y_p, z_top + 0.04), (wing_w + 0.10, 0.24, 0.12), trim_col)
            if lod == 0 and jaali:
                nb = max(3, int(wing_w / 0.36))
                for bi in range(nb):
                    bx = (wx - 0.42 * wing_w) + bi * (0.84 * wing_w / max(1, nb - 1))
                    acc.box((bx, y_p, z_eaves + 0.16 + 0.48 * parapet_h), (0.14, 0.18, parapet_h * 0.86), wall_col)
            else:
                acc.box((wx, y_p, z_eaves + 0.16 + 0.48 * parapet_h), (wing_w - 0.1, 0.18, parapet_h * 0.84), shade_col)
        acc.box((0.0, y_p, z_eaves + 0.16 + 0.52 * parapet_h), (2.0 * ped_hw, 0.28, parapet_h * 1.05), wall_col)
        rad = ped_hw * 0.68
        acc.arch_slab(0.0, y_p, z_top, 0.28, rad, 12 if lod == 0 else 5, wall_col)
        acc.arch_slab(0.0, y_p - 0.04, z_top, 0.12, rad + 0.08, 12 if lod == 0 else 5, trim_col)
        if lod == 0:
            acc.cyl((0.0, y_p - 0.18, z_top + 0.10), rad * 0.40, rad * 0.40, 0.07, shade_col, segs=10, rot_x=math.pi * 0.5)
        return z_top + rad + 0.08
    else:
        acc.box((0.0, y_p, z_eaves + 0.16 + 0.5 * parapet_h), (w, 0.22, parapet_h), wall_col)
        acc.box((0.0, y_p, z_top + 0.04), (w + 0.10, 0.26, 0.10), trim_col)
        return z_top + 0.10


def add_stilt_ground(
    acc: MeshAcc,
    bw: float,
    bd: float,
    yc: float,
    z0: float,
    h_stilt: float,
    col_col: Tuple[float, float, float, float],
    core_col: Tuple[float, float, float, float],
    lod: int = 0,
    nx_cols: int = 4,
    ny_cols: int = 3,
) -> None:
    """Open ground-floor stilt parking colonnade with structural pillars & rear stair core."""
    acc.box((0.0, yc, z0 + 0.07), (bw + 0.20, bd + 0.20, 0.14), PAL["pavement"])
    acc.box((0.0, yc, z0 + h_stilt - 0.12), (bw + 0.12, bd + 0.12, 0.24), col_col)
    core_w = min(4.2, bw * 0.34)
    core_d = min(4.6, bd * 0.34)
    core_y = yc + 0.5 * bd - 0.5 * core_d - 0.4
    acc.box((0.0, core_y, z0 + 0.5 * h_stilt), (core_w, core_d, h_stilt), core_col)
    if lod < 2:
        add_door(acc, 0.0, core_y - 0.5 * core_d, z0 + 0.14, 1.35, 2.20, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["concrete"], lod=lod)
    col_h = h_stilt - 0.24
    col_cz = z0 + 0.14 + 0.5 * col_h
    if lod >= 2:
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.box((sx * (0.5 * bw - 0.45), yc + sy * (0.5 * bd - 0.45), col_cz), (0.45, 0.45, col_h), col_col)
        return
    for ix in range(nx_cols):
        cx = (-0.5 * bw + 0.45) + ix * ((bw - 0.90) / max(1, nx_cols - 1))
        for iy in range(ny_cols):
            cy = (yc - 0.5 * bd + 0.45) + iy * ((bd - 0.90) / max(1, ny_cols - 1))
            if abs(cx) < 0.45 * core_w and cy > core_y - 0.5 * core_d:
                continue
            acc.box((cx, cy, col_cz), (0.38, 0.38, col_h), col_col)
            if lod == 0:
                acc.box((cx, cy, z0 + 0.22), (0.46, 0.46, 0.16), PAL["plinth"])
    if lod == 0:
        for ix in range(nx_cols - 1):
            bx = (-0.5 * bw + 0.45) + (ix + 0.5) * ((bw - 0.90) / max(1, nx_cols - 1))
            acc.box((bx, yc - 0.5 * bd + 2.4, z0 + 0.19), (1.40, 0.16, 0.10), PAL["mustard"])


def add_corner_window(
    acc: MeshAcc,
    corner_x: float,
    corner_y: float,
    cz: float,
    arm_x: float,
    arm_y: float,
    wh: float,
    sx: float,
    sy: float,
    frame_col: Tuple[float, float, float, float],
    pane_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Wrap-around L-shaped corner glass window at corner (corner_x, corner_y)."""
    if lod >= 2:
        return
    cx1 = corner_x - sx * 0.5 * arm_x
    acc.box((cx1, corner_y + sy * 0.02, cz), (arm_x, 0.08, wh), frame_col)
    acc.box((cx1, corner_y + sy * 0.055, cz), (arm_x - 0.08, 0.04, wh - 0.12), pane_col)
    cy2 = corner_y - sy * 0.5 * arm_y
    acc.box((corner_x + sx * 0.02, cy2, cz), (0.08, arm_y, wh), frame_col)
    acc.box((corner_x + sx * 0.055, cy2, cz), (0.04, arm_y - 0.08, wh - 0.12), pane_col)
    acc.box((corner_x + sx * 0.04, corner_y + sy * 0.04, cz), (0.10, 0.10, wh + 0.04), frame_col)
    if lod == 0:
        acc.box((cx1, corner_y + sy * 0.18, cz + 0.5 * wh + 0.06), (arm_x + 0.16, 0.34, 0.07), PAL["white_shade"])
        acc.box((corner_x + sx * 0.18, cy2, cz + 0.5 * wh + 0.06), (0.34, arm_y + 0.16, 0.07), PAL["white_shade"])


def add_window_band(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    cz: float,
    bw: float,
    bh: float,
    face_dir: Tuple[float, float],
    frame_col: Tuple[float, float, float, float],
    pane_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    n_mullions: int = 2,
    lod: int = 0,
) -> None:
    """Multi-pane grouped window strip."""
    if lod >= 2:
        return
    nx, ny = face_dir
    if abs(ny) >= abs(nx):
        s = 1.0 if ny >= 0 else -1.0
        acc.box((cx, y_wall + s * 0.02, cz), (bw, 0.07, bh), frame_col)
        acc.box((cx, y_wall + s * 0.05, cz), (bw - 0.10, 0.03, bh - 0.10), pane_col)
        acc.box((cx, y_wall + s * 0.20, cz + 0.5 * bh + 0.06), (bw + 0.16, 0.38, 0.07), trim_col, rot_x=s * 0.18)
        if lod == 0:
            for mi in range(n_mullions):
                mx = cx - 0.5 * bw + (mi + 1) * (bw / (n_mullions + 1))
                acc.box((mx, y_wall + s * 0.065, cz), (0.05, 0.04, bh - 0.04), frame_col)
    else:
        s = 1.0 if nx >= 0 else -1.0
        acc.box((y_wall + s * 0.02, cx, cz), (0.07, bw, bh), frame_col)
        acc.box((y_wall + s * 0.05, cx, cz), (0.03, bw - 0.10, bh - 0.10), pane_col)
        acc.box((y_wall + s * 0.20, cx, cz + 0.5 * bh + 0.06), (0.38, bw + 0.16, 0.07), trim_col, rot_y=-s * 0.18)
        if lod == 0:
            for mi in range(n_mullions):
                my = cx - 0.5 * bw + (mi + 1) * (bw / (n_mullions + 1))
                acc.box((y_wall + s * 0.065, my, cz), (0.04, 0.05, bh - 0.04), frame_col)


def add_side_windows(
    acc: MeshAcc,
    x_left: float,
    x_right: float,
    y_positions: Sequence[float],
    z_floors: Sequence[float],
    ww: float,
    wh: float,
    frame_col: Tuple[float, float, float, float],
    pane_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    if lod >= 2:
        return
    for zf in z_floors:
        for wy in y_positions:
            add_window(acc, wy, x_left, zf, ww, wh, (-1.0, 0.0), frame_col, pane_col, trim_col, lod=lod)
            add_window(acc, wy, x_right, zf, ww, wh, (+1.0, 0.0), frame_col, pane_col, trim_col, lod=lod)


def add_glass_parapet(
    acc: MeshAcc,
    bw: float,
    bd: float,
    yc: float,
    z_roof: float,
    frame_col: Tuple[float, float, float, float],
    lod: int = 0,
    glass_front: bool = True,
) -> None:
    """Modern terrace perimeter parapet with front glass balustrade + solid side/rear masonry."""
    hw, hd = 0.5 * bw, 0.5 * bd
    acc.box((0.0, yc, z_roof + 0.06), (bw + 0.20, bd + 0.20, 0.12), frame_col)
    acc.box((0.0, yc, z_roof + 0.03), (bw - 0.4, bd - 0.4, 0.08), PAL["surkhi"])
    acc.box((-hw + 0.11, yc, z_roof + 0.55), (0.20, bd, 0.90), frame_col)
    acc.box((+hw - 0.11, yc, z_roof + 0.55), (0.20, bd, 0.90), frame_col)
    acc.box((0.0, yc + hd - 0.11, z_roof + 0.55), (bw, 0.20, 0.90), frame_col)
    yf = yc - hd + 0.10
    if glass_front and lod < 2:
        acc.box((0.0, yf, z_roof + 0.22), (bw, 0.22, 0.24), frame_col)
        acc.box((0.0, yf, z_roof + 0.68), (bw - 0.30, 0.05, 0.68), PAL["glass_rail"])
        acc.box((0.0, yf, z_roof + 1.04), (bw, 0.09, 0.06), PAL["steel_light"])
        if lod == 0:
            for sx in (-1, -0.5, 0.0, 0.5, 1):
                acc.box((sx * (hw - 0.12), yf, z_roof + 0.68), (0.06, 0.08, 0.72), PAL["charcoal"])
    else:
        acc.box((0.0, yf, z_roof + 0.55), (bw, 0.22, 0.90), frame_col)


# ---------------------------------------------------------------------------
# 20 Distinct Building Builders
# ---------------------------------------------------------------------------

def build_chn_026_angled_corner(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_026_angled_corner: 12x18m, 2F yellow plaster corner house facing -Y and +X."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 18.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -8.7, 0.08), (w, 0.6, 0.12), PAL["pavement"])
    acc.box((5.7, 0.0, 0.08), (0.6, d - 0.6, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 10.6, -8.45, -4.6, EXTRA_PAL["yellow_plaster"], PAL["cream_trim"], modern_wood_gate=False, lod=lod)
        acc.box((5.45, 0.9, 0.55), (0.24, 15.0, 1.10), EXTRA_PAL["yellow_plaster"])
        acc.box((5.45, 0.9, 1.13), (0.30, 15.1, 0.06), PAL["cream_trim"])
        if lod == 0:
            for py in (-6.5, -1.5, 3.5, 8.3):
                acc.box((5.45, py, 0.72), (0.36, 0.36, 1.44), EXTRA_PAL["yellow_plaster"])
                acc.box((5.45, py, 1.48), (0.44, 0.44, 0.08), PAL["cream_trim"])

    # Main 2F chamfered body
    pts = [(-5.1, -4.8), (1.4, -4.8), (4.4, -1.8), (4.4, 8.2), (-5.1, 8.2)]
    add_polygon_prism(acc, pts, 0.10, 6.70, EXTRA_PAL["yellow_plaster"])
    add_polygon_prism(acc, [(-5.16, -4.86), (1.44, -4.86), (4.46, -1.84), (4.46, 8.26), (-5.16, 8.26)], 0.10, 0.55, PAL["plinth"])
    add_polygon_prism(acc, [(-5.18, -4.88), (1.46, -4.88), (4.48, -1.86), (4.48, 8.28), (-5.18, 8.28)], 3.30, 3.46, PAL["cream_trim"])

    ang_45 = math.pi * 0.25
    acc.box((2.9, -3.3, 0.28), (3.8, 1.2, 0.36), PAL["plinth"], rot_z=ang_45)
    acc.box((3.1, -3.5, 3.38), (4.0, 1.35, 0.18), PAL["cream_trim"], rot_z=ang_45)
    if lod < 2:
        acc.box((3.45, -3.85, 3.88), (3.7, 0.14, 0.86), EXTRA_PAL["yellow_trim"], rot_z=ang_45)
        if lod == 0:
            acc.box((3.45, -3.85, 4.35), (3.8, 0.18, 0.08), PAL["iron"], rot_z=ang_45)
        acc.box((2.82, -3.22, 1.65), (1.45, 0.14, 2.15), PAL["teak_dark"], rot_z=ang_45)
        acc.box((2.85, -3.25, 1.65), (1.25, 0.16, 1.98), PAL["teak_green"], rot_z=ang_45)
        acc.box((2.82, -3.22, 4.65), (1.45, 0.14, 2.05), PAL["teak_dark"], rot_z=ang_45)
        acc.box((2.85, -3.25, 4.65), (1.25, 0.16, 1.88), PAL["glass_blue"], rot_z=ang_45)
        acc.box((3.15, -3.55, 6.15), (4.1, 1.1, 0.12), PAL["cream_trim"], rot_z=ang_45)

    add_door(acc, -3.2, -4.8, 0.50, 1.30, 2.15, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    if lod < 2:
        add_window(acc, -0.8, -4.8, 1.85, 1.50, 1.35, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
        add_balcony(acc, -2.0, -4.8, 3.45, 3.6, 1.15, PAL["cream_trim"], glass_rail=False, lod=lod)
        add_window(acc, -3.7, -4.8, 4.95, 1.15, 1.30, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
        for wy in (0.4, 3.6, 6.4):
            add_window(acc, wy, 4.4, 1.85, 1.40, 1.35, (+1.0, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
            add_window(acc, wy, 4.4, 4.95, 1.40, 1.30, (+1.0, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
        acc.box((4.95, 2.0, 3.38), (1.10, 4.4, 0.16), PAL["cream_trim"])
        acc.box((5.44, 2.0, 3.88), (0.12, 4.3, 0.84), EXTRA_PAL["yellow_trim"] if lod == 1 else PAL["iron"])
        if lod == 0:
            add_side_windows(acc, -5.1, 4.4, (0.5, 4.8), (1.85, 4.95), 1.25, 1.25, PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
            add_window(acc, -1.2, 8.2, 4.95, 1.40, 1.25, (0.0, +1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)

    # Rounded/stepped cornice & roof parapet following chamfer
    add_polygon_prism(acc, [(-5.25, -4.95), (1.50, -4.95), (4.55, -1.90), (4.55, 8.35), (-5.25, 8.35)], 6.68, 6.90, PAL["cream_trim"])
    add_polygon_prism(acc, [(-5.05, -4.75), (1.35, -4.75), (4.35, -1.75), (4.35, 8.15), (-5.05, 8.15)], 6.90, 7.65, EXTRA_PAL["yellow_plaster"])
    add_polygon_prism(acc, [(-4.75, -4.45), (1.20, -4.45), (4.05, -1.60), (4.05, 7.85), (-4.75, 7.85)], 6.72, 6.95, PAL["surkhi"])
    if lod < 2:
        acc.arch_slab(-2.0, -4.75, 7.65, 0.24, 0.82, 10 if lod == 0 else 5, PAL["cream_trim"])
        if lod == 0:
            for bi in range(6):
                acc.box((-4.5 + bi * 0.42, -4.75, 7.35), (0.16, 0.22, 0.65), PAL["cream_trim"])
            for bi in range(8):
                acc.box((4.35, -0.8 + bi * 1.05, 7.35), (0.22, 0.26, 0.65), PAL["cream_trim"])
    add_stair_mumty(acc, -2.5, 5.2, 6.95, 2.4, 2.8, 2.0, EXTRA_PAL["yellow_plaster"], PAL["terracotta"], lod=lod)
    add_water_tank(acc, 1.8, 5.6, 6.95, lod=lod)
    add_ac_unit(acc, -5.1, -1.5, 4.6, (-1.0, 0.0), lod=lod)

    cols = [
        ("COL_Main", (-0.35, 1.7, 3.85), (9.6, 13.1, 7.7)),
        ("COL_Compound", (0.0, -8.45, 0.8), (11.2, 0.5, 1.6)),
    ]
    return acc, cols


def build_chn_029_colonial_bungalow(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_029_colonial_bungalow: 18x28m, 2F grand white neoclassical bungalow with porte-cochere."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 28.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -6.5, 0.09), (4.6, 14.5, 0.08), PAL["pavement"])
    for sx in (-1, 1):
        acc.box((sx * 5.6, -9.8, 0.08), (5.8, 7.2, 0.06), EXTRA_PAL["lawn"])

    if lod < 2:
        add_compound_fence(acc, 17.6, -13.5, -2.5, PAL["white"], PAL["white_shade"], modern_wood_gate=False, lod=lod)
        if lod == 0:
            for sx in (-1, 1):
                acc.sphere((sx * 2.15, -13.5, 1.92), 0.16, PAL["cream_trim"], subdiv=1)
                add_potted_palm(acc, sx * 3.2, -12.6, 0.10, lod=lod, scale=1.2)
                add_potted_palm(acc, sx * 4.2, -6.2, 0.10, lod=lod, scale=1.1)

    bw, bd, yc = 14.6, 13.8, 4.7
    if lod < 2:
        acc.box((0.0, yc, 0.34), (bw + 0.30, bd + 0.30, 0.48), PAL["plinth"])
    acc.box((0.0, yc, 4.00), (bw, bd, 6.90), PAL["white"])
    if lod < 2:
        acc.box((0.0, yc, 3.86), (bw + 0.24, bd + 0.24, 0.18), PAL["white_shade"])
        acc.box((0.0, yc, 7.48), (bw + 0.40, bd + 0.40, 0.22), PAL["cream_trim"])

    # Double-height Colonnaded Front Verandah
    if lod < 2:
        acc.box((0.0, -3.5, 0.32), (bw + 0.2, 2.7, 0.44), PAL["plinth"])
        acc.box((0.0, -3.5, 3.84), (bw + 0.15, 2.7, 0.18), PAL["white_shade"])
    acc.box((0.0, -3.5, 7.45), (bw + 0.30, 2.9, 0.20), PAL["cream_trim"])
    if lod < 2:
        for cx in (-7.0, -4.4, -2.1, +2.1, +4.4, +7.0):
            acc.box((cx, -4.65, 2.10), (0.44, 0.44, 3.20), PAL["white"])
            acc.box((cx, -4.65, 5.65), (0.42, 0.42, 3.40), PAL["white"])
            if lod == 0:
                acc.box((cx, -4.65, 3.65), (0.56, 0.56, 0.14), PAL["cream_trim"])
                acc.box((cx, -4.65, 7.28), (0.56, 0.56, 0.14), PAL["cream_trim"])
        for bx in (-5.7, -3.25, 3.25, 5.7):
            if lod == 0:
                acc.arch_slab(bx, -4.65, 2.75, 0.32, 0.95, 8, PAL["white"])
                acc.arch_slab(bx, -4.65, 6.30, 0.32, 0.95, 8, PAL["white"])
            acc.box((bx, -4.65, 4.35), (2.05, 0.14, 0.82), PAL["white_shade"])

    # Projecting Arched Entrance Porte-Cochere
    acc.box((0.0, -6.4, 3.84), (4.6, 3.6, 0.22), PAL["white"])
    if lod < 2:
        for sx in (-1, 1):
            acc.box((sx * 2.05, -7.95, 2.00), (0.56, 0.56, 3.80), PAL["white"])
            acc.box((sx * 2.05, -7.95, 0.30), (0.72, 0.72, 0.42), PAL["plinth"])
            acc.box((sx * 2.05, -7.95, 3.68), (0.68, 0.68, 0.16), PAL["cream_trim"])
            acc.box((sx * 2.05, -6.30, 3.45), (0.36, 3.0, 0.55), PAL["white"])
        acc.box((0.0, -7.95, 3.45), (3.8, 0.42, 0.65), PAL["white"])
        acc.arch_slab(0.0, -7.95, 2.45, 0.42, 1.35, 10 if lod == 0 else 5, PAL["white"])
        acc.box((0.0, -8.05, 4.38), (4.5, 0.18, 0.84), PAL["white_shade"])
        for sx in (-1, 1):
            acc.box((sx * 2.15, -6.30, 4.38), (0.18, 3.4, 0.84), PAL["white_shade"])
            acc.box((sx * 2.15, -8.05, 4.45), (0.36, 0.36, 0.98), PAL["white"])
    else:
        acc.box((0.0, -6.4, 1.90), (4.5, 3.5, 3.80), PAL["white"])

    add_door(acc, 0.0, -2.2, 0.54, 1.70, 2.65, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_door(acc, 0.0, -2.2, 3.94, 1.65, 2.50, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    if lod < 2:
        for wx in (-5.7, -3.25, +3.25, +5.7):
            add_window(acc, wx, -2.2, 2.05, 1.25, 1.85, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=False, arched=True, lod=lod)
            add_window(acc, wx, -2.2, 5.65, 1.25, 1.80, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=False, arched=True, lod=lod)
        if lod == 0:
            add_side_windows(acc, -7.3, +7.3, (0.2, 4.2, 8.2), (2.05, 5.65), 1.35, 1.75, PAL["teak_green"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
            for wx in (-4.2, 0.0, +4.2):
                add_window(acc, wx, 11.6, 5.65, 1.30, 1.65, (0.0, +1.0), PAL["teak_green"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    par_h = 0.95
    if lod < 2:
        acc.box((-7.15, yc, 7.56 + 0.5 * par_h), (0.26, bd, par_h), PAL["white"])
        acc.box((+7.15, yc, 7.56 + 0.5 * par_h), (0.26, bd, par_h), PAL["white"])
        acc.box((0.0, 11.45, 7.56 + 0.5 * par_h), (bw, 0.26, par_h), PAL["white"])
        acc.box((0.0, yc, 7.52), (bw - 0.6, bd - 0.6, 0.10), PAL["surkhi"])
        acc.box((0.0, -4.65, 8.48), (bw + 0.1, 0.26, 0.14), PAL["cream_trim"])
    if lod == 0:
        for bi in range(22):
            bx = -6.8 + bi * (13.6 / 21)
            if abs(bx) > 1.8:
                acc.box((bx, -4.65, 8.02), (0.14, 0.18, 0.80), PAL["white"])
    elif lod == 1:
        acc.box((0.0, -4.65, 8.02), (bw - 0.4, 0.18, 0.80), PAL["white_shade"])
    acc.box((0.0, -4.65, 8.25), (3.4, 0.34, 1.25), PAL["white"])
    if lod < 2:
        acc.arch_slab(0.0, -4.65, 8.85, 0.32, 1.25, 12 if lod == 0 else 5, PAL["white"])
    add_stair_mumty(acc, -4.2, 8.6, 7.56, 2.8, 3.2, 2.1, PAL["white"], PAL["terracotta"], lod=lod)
    add_water_tank(acc, 4.4, 9.0, 7.56, lod=lod)

    cols = [
        ("COL_Main", (0.0, 4.7, 4.2), (14.8, 14.0, 8.4)),
        ("COL_Verandah", (0.0, -4.6, 3.8), (14.8, 4.8, 7.6)),
        ("COL_Compound", (0.0, -13.5, 0.85), (17.6, 0.5, 1.7)),
    ]
    return acc, cols


def build_chn_030_thinnai_house(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_030_thinnai_house: 9x16m, 1F Mylapore house with raised left/right thinnai benches."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 9.0, 16.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -7.6, 0.08), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 8.8, -7.2, -4.8, PAL["cream"], PAL["cream_trim"], modern_wood_gate=False, lod=lod)

    # Raised verandah plinth & central entry steps
    acc.box((0.0, -3.45, 0.31), (8.6, 2.9, 0.62), PAL["plinth"])
    acc.box((0.0, -5.05, 0.22), (2.1, 0.40, 0.44), PAL["plinth"])
    acc.box((0.0, -5.42, 0.11), (2.1, 0.38, 0.22), PAL["plinth"])

    # Left & Right masonry raised thinnai seating benches
    for sx in (-1, 1):
        tx = sx * 2.55
        acc.box((tx, -3.55, 0.83), (3.10, 2.10, 0.42), PAL["cream"])
        acc.box((tx, -3.55, 1.07), (3.16, 2.16, 0.06), PAL["red_dark"])
        acc.box((sx * 4.02, -3.55, 1.30), (0.24, 2.10, 0.52), PAL["cream_trim"])
        if lod == 0:
            acc.cyl((sx * 3.72, -3.45, 1.22), 0.12, 0.12, 1.4, PAL["terracotta"], segs=8, rot_x=math.pi * 0.5)

    # Verandah pillars
    if lod < 2:
        for cx in (-4.02, -1.05, +1.05, +4.02):
            z_bot = 1.08 if abs(cx) > 2.0 else 0.62
            ch = 2.68 - z_bot
            acc.box((cx, -4.65, z_bot + 0.5 * ch), (0.28, 0.28, ch), PAL["cream"])
            acc.box((cx, -4.65, 2.66), (0.36, 0.36, 0.10), PAL["teak_brown"])

    # Main House Block behind verandah
    acc.box((0.0, 2.6, 2.05), (8.6, 9.2, 3.90), PAL["cream"])
    acc.box((0.0, 2.6, 0.36), (8.72, 9.32, 0.52), PAL["plinth"])
    add_door(acc, 0.0, -2.0, 0.62, 1.45, 2.25, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
    if lod < 2:
        for wx in (-2.65, +2.65):
            add_window(acc, wx, -2.0, 2.05, 1.30, 1.35, (0.0, -1.0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, lod=lod)
        add_side_windows(acc, -4.3, +4.3, (0.6, 4.4), (2.05,), 1.25, 1.30, PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
        add_door(acc, -1.5, 7.2, 0.40, 1.10, 2.05, (0.0, +1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
        add_window(acc, +1.8, 7.2, 2.05, 1.25, 1.25, (0.0, +1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)

    # Sloped Mangalore clay-tile verandah canopy
    add_clay_tile_canopy(acc, 8.8, -5.10, -2.00, 2.62, 3.52, PAL["cream_trim"], lod=lod)
    # Aligned ornate Madras parapet + central pediment
    add_aligned_parapet(acc, 8.6, 9.2, 2.6, 4.00, 0.78, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    add_stair_mumty(acc, -2.2, 5.4, 4.08, 2.1, 2.3, 1.6, PAL["cream"], PAL["tile_red"], lod=lod)
    add_water_tank(acc, 2.2, 5.6, 4.08, lod=lod)

    cols = [
        ("COL_Main", (0.0, 2.6, 2.3), (8.7, 9.3, 4.6)),
        ("COL_Verandah", (0.0, -3.5, 1.7), (8.7, 3.0, 3.4)),
        ("COL_Compound", (0.0, -7.2, 0.8), (8.8, 0.45, 1.6)),
    ]
    return acc, cols


def build_chn_036_tenement_1f(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_036_tenement_1f: 5x12m, 1F North Chennai row-house with tin lean-to porch."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 5.0, 12.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -5.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    # Raised cement front stoop & step
    acc.box((0.0, -3.9, 0.19), (4.6, 1.8, 0.28), PAL["concrete"])
    acc.box((-0.9, -4.95, 0.11), (1.3, 0.36, 0.14), PAL["concrete"])

    # Main 1F weathered white + sky-blue lime-washed house block (Y in [-3.0, +5.4], Z=0.1..3.5)
    acc.box((0.0, 1.2, 1.80), (4.8, 8.4, 3.40), PAL["white"])
    # Sky-blue lower dado & accent front strip
    acc.box((0.0, 1.2, 0.55), (4.86, 8.46, 0.90), PAL["sky_blue"])
    acc.box((0.0, -3.02, 2.25), (4.82, 0.08, 2.50), PAL["sky_blue"])

    # Steel security door + small wooden shuttered front window + concrete chajja
    add_door(acc, -1.05, -3.06, 0.33, 1.05, 2.05, (0.0, -1.0), PAL["charcoal"], PAL["steel_blue"], PAL["white_shade"], lod=lod, double_leaf=False)
    if lod < 2:
        add_window(acc, +1.15, -3.06, 1.85, 1.15, 1.15, (0.0, -1.0), PAL["teak_brown"], PAL["recess"], PAL["concrete"], lod=lod)
        add_window(acc, 0.0, 5.4, 1.85, 1.10, 1.10, (0.0, +1.0), PAL["teak_brown"], PAL["recess"], PAL["concrete"], lod=lod)
        # Side party wall boundary stubs & front low parapet piers
        for sx in (-1, 1):
            acc.box((sx * 2.38, -4.6, 0.45), (0.22, 2.8, 0.80), PAL["white_shade"])
            acc.box((sx * 2.38, -5.6, 0.62), (0.30, 0.30, 1.14), PAL["sky_blue"])

    # Corrugated tin lean-to front porch canopy on slender steel posts
    pitch = math.atan2(2.85 - 2.25, 1.95)
    len_y = math.hypot(1.95, 0.60) + 0.12
    acc.box((0.0, -4.05, 2.55), (4.85, len_y, 0.08), EXTRA_PAL["tin_sheet"], rot_x=pitch)
    if lod < 2:
        for sx in (-1, 1):
            acc.cyl((sx * 2.18, -4.85, 1.28), 0.04, 0.04, 1.96, PAL["iron"], segs=6)
        acc.cyl((0.35, -4.85, 1.28), 0.04, 0.04, 1.96, PAL["iron"], segs=6)
        n_ribs = 12 if lod == 0 else 5
        for ri in range(n_ribs):
            rx = -2.2 + ri * (4.4 / max(1, n_ribs - 1))
            acc.box((rx, -4.05, 2.60), (0.08, len_y, 0.05), PAL["steel_light"], rot_x=pitch)

    # Flat terrace parapet + overhead black tank & vent pipe
    add_aligned_parapet(acc, 4.8, 8.4, 1.2, 3.50, 0.62, PAL["white"], PAL["concrete"], PAL["white_shade"], pediment=False, lod=lod)
    add_water_tank(acc, 1.1, 3.6, 3.55, lod=lod, r=0.45, h=1.00)
    if lod < 2:
        acc.box((-1.3, 4.1, 3.92), (1.3, 1.4, 0.72), PAL["red_brick"])
        if lod == 0:
            acc.cyl((-1.8, 2.0, 4.4), 0.03, 0.03, 1.6, PAL["steel_light"], segs=6)
            acc.box((-1.8, 2.0, 5.1), (0.5, 0.04, 0.04), PAL["steel_light"])
            add_potted_palm(acc, 1.95, -5.3, 0.10, lod=lod, scale=0.8)

    cols = [
        ("COL_Main", (0.0, 1.2, 2.15), (4.9, 8.5, 4.3)),
        ("COL_Verandah", (0.0, -4.05, 1.4), (4.8, 2.1, 2.8)),
    ]
    return acc, cols


def build_b03_modern_indep(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B03_modern_indep: 10x15m, 2F white cubic house + mustard L-cantilever + charcoal louvers."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 15.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -7.1, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 9.6, -6.9, -4.2, PAL["white"], PAL["charcoal"], modern_wood_gate=True, lod=lod)

    # Main white cubic 2F body (W=8.6, D=10.6, centered at Y=1.3, Z=0.1..7.0)
    bw, bd, yc = 8.6, 10.6, 1.3
    acc.box((0.0, yc, 3.55), (bw, bd, 6.90), PAL["white"])
    acc.box((0.0, yc, 0.30), (bw + 0.16, bd + 0.16, 0.40), PAL["plinth"])

    # Ground floor recessed portico & wood entry door + car bay
    add_door(acc, -2.1, -4.0, 0.50, 1.35, 2.35, (0.0, -1.0), PAL["charcoal"], PAL["teak_brown"], PAL["white_shade"], lod=lod)
    if lod < 2:
        add_window(acc, +2.0, -4.0, 1.95, 2.10, 1.50, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], lod=lod)

    # Bold projecting MUSTARD-OCHRE L-shaped cantilever box wrapping 1F glass balcony (Z=3.5..6.8)
    # L-shaped mustard cantilever frame on 1F (left X in [-3.9, +2.2], Y=-4.0..-5.3)
    acc.box((-0.85, -4.65, 3.60), (6.1, 1.35, 0.22), PAL["mustard"])
    acc.box((-0.85, -4.65, 6.78), (6.1, 1.35, 0.26), PAL["mustard"])
    acc.box((-3.78, -4.65, 5.19), (0.28, 1.35, 3.00), PAL["mustard"])
    if lod < 2:
        # 1F glass balcony inside L-frame + French doors
        add_balcony(acc, -0.7, -4.0, 3.68, 5.4, 1.20, PAL["white_shade"], glass_rail=True, lod=lod)

    # Vertical CHARCOAL LOUVERED ACCENT FIN on right front bay (X=+3.1, Z=0.5..7.0)
    acc.box((3.85, -4.25, 3.75), (0.24, 0.55, 6.50), PAL["charcoal"])
    add_louver_screen(acc, 3.05, -4.18, 0.55, 6.85, 1.35, 7, PAL["charcoal"], along_x=True, lod=lod)

    if lod < 2:
        add_side_windows(acc, -4.3, +4.3, (-0.5, 3.5), (1.95, 5.15), 1.35, 1.45, PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
        add_window(acc, 0.0, 6.6, 5.15, 1.80, 1.35, (0.0, +1.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    add_glass_parapet(acc, bw, bd, yc, 7.00, PAL["white"], lod=lod, glass_front=True)
    add_stair_mumty(acc, -2.3, 4.4, 7.05, 2.3, 2.6, 1.9, PAL["white"], PAL["charcoal"], lod=lod)
    add_water_tank(acc, 2.2, 4.8, 7.05, lod=lod)
    add_ac_unit(acc, -4.3, 1.5, 4.6, (-1.0, 0.0), lod=lod)

    cols = [
        ("COL_Main", (0.0, 1.3, 3.9), (8.8, 10.8, 7.8)),
        ("COL_Compound", (0.0, -6.9, 0.8), (9.6, 0.5, 1.6)),
    ]
    return acc, cols


def build_b04_compact_urban(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B04_compact_urban: 6x12m, 2F Chennai pink/rose plaster house with diamond motifs."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 12.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -5.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 5.8, -5.45, -3.4, EXTRA_PAL["rose_plaster"], PAL["pink_trim"], modern_wood_gate=False, lod=lod)

    # Main 2F rose/pink block (W=5.6, D=8.4, Y in [-3.2, +5.2], Z=0.1..7.0)
    bw, bd, yc = 5.6, 8.4, 1.0
    acc.box((0.0, yc, 3.55), (bw, bd, 6.90), EXTRA_PAL["rose_plaster"])
    acc.box((0.0, yc, 0.30), (bw + 0.14, bd + 0.14, 0.40), PAL["plinth"])
    acc.box((0.0, yc, 3.45), (bw + 0.18, bd + 0.18, 0.16), PAL["pink_trim"])

    add_door(acc, -1.25, -3.2, 0.50, 1.15, 2.20, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["pink_trim"], lod=lod)
    if lod < 2:
        add_window(acc, +1.35, -3.2, 1.90, 1.25, 1.30, (0.0, -1.0), PAL["teak_brown"], PAL["glass_blue"], PAL["pink_trim"], lod=lod)

    # 1F Projecting balcony with MOULDED GEOMETRIC DIAMOND MOTIFS on front parapet
    acc.box((0.0, -3.85, 3.45), (5.2, 1.30, 0.16), PAL["pink_trim"])
    acc.box((0.0, -4.42, 3.96), (5.2, 0.16, 0.88), EXTRA_PAL["rose_plaster"])
    if lod < 2:
        acc.box((0.0, -4.42, 4.44), (5.28, 0.22, 0.08), PAL["pink_trim"])
        acc.box((0.0, -4.42, 4.62), (5.16, 0.05, 0.05), PAL["iron"])
        # Diamond motifs (45-deg rotated frames along balcony wall)
        n_dia = 4 if lod == 0 else 2
        for di in range(n_dia):
            dx = -1.8 + di * (3.6 / max(1, n_dia - 1))
            acc.box((dx, -4.51, 3.96), (0.36, 0.06, 0.36), PAL["pink_trim"], rot_y=math.pi * 0.25)
            if lod == 0:
                acc.box((dx, -4.53, 3.96), (0.18, 0.06, 0.18), PAL["surkhi"], rot_y=math.pi * 0.25)
        add_door(acc, -1.1, -3.2, 3.53, 1.20, 2.15, (0.0, -1.0), PAL["teak_dark"], PAL["glass_blue"], PAL["pink_trim"], lod=lod)
        add_window(acc, +1.3, -3.2, 4.95, 1.25, 1.30, (0.0, -1.0), PAL["teak_brown"], PAL["glass_blue"], PAL["pink_trim"], lod=lod)
        add_side_windows(acc, -2.8, +2.8, (-0.4, 2.8), (1.90, 4.95), 1.15, 1.20, PAL["teak_brown"], PAL["glass_blue"], PAL["pink_trim"], lod=lod)
        add_window(acc, 0.0, 5.2, 4.95, 1.20, 1.20, (0.0, +1.0), PAL["teak_brown"], PAL["glass_blue"], PAL["pink_trim"], lod=lod)

    # Top terrace parapet + iron balcony railing on roof front
    acc.box((0.0, yc, 7.05), (bw + 0.22, bd + 0.22, 0.14), PAL["pink_trim"])
    acc.box((0.0, yc, 7.02), (bw - 0.4, bd - 0.4, 0.08), PAL["surkhi"])
    acc.box((-bw * 0.5 + 0.11, yc, 7.50), (0.20, bd, 0.80), EXTRA_PAL["rose_plaster"])
    acc.box((+bw * 0.5 - 0.11, yc, 7.50), (0.20, bd, 0.80), EXTRA_PAL["rose_plaster"])
    acc.box((0.0, yc + bd * 0.5 - 0.11, 7.50), (bw, 0.20, 0.80), EXTRA_PAL["rose_plaster"])
    if lod < 2:
        acc.box((0.0, -3.10, 7.30), (bw, 0.18, 0.36), EXTRA_PAL["rose_plaster"])
        acc.box((0.0, -3.10, 7.88), (bw, 0.05, 0.05), PAL["iron"])
        if lod == 0:
            for ri in range(11):
                acc.cyl((-2.5 + ri * 0.5, -3.10, 7.68), 0.015, 0.015, 0.40, PAL["iron"], segs=6)
    else:
        acc.box((0.0, -3.10, 7.50), (bw, 0.20, 0.80), EXTRA_PAL["rose_plaster"])

    add_stair_mumty(acc, -1.2, 3.2, 7.06, 1.9, 2.2, 1.8, EXTRA_PAL["rose_plaster"], PAL["terracotta"], lod=lod)
    add_water_tank(acc, 1.5, 3.6, 7.06, lod=lod, r=0.45, h=1.05)

    cols = [
        ("COL_Main", (0.0, 1.0, 3.9), (5.8, 8.6, 7.8)),
        ("COL_Compound", (0.0, -5.45, 0.8), (5.8, 0.45, 1.6)),
    ]
    return acc, cols


def build_b05_duplex_house(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B05_duplex_house: 12x16m, 2F wooden-cladding + cream duplex with rooftop white pergola."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 16.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -7.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 11.6, -7.45, -4.4, PAL["cream"], PAL["cream_trim"], modern_wood_gate=True, lod=lod)

    # Main 2F Cream Duplex block (W=10.4, D=11.0, Y in [-4.4, +6.6], Z=0.1..7.0)
    bw, bd, yc = 10.4, 11.0, 1.1
    acc.box((0.0, yc, 3.55), (bw, bd, 6.90), PAL["cream"])
    acc.box((0.0, yc, 0.30), (bw + 0.18, bd + 0.18, 0.40), PAL["plinth"])

    # Left wooden-cladding vertical accent bay (X in [-4.8, -1.6])
    acc.box((-3.2, -4.46, 3.60), (3.1, 0.14, 6.60), PAL["teak_brown"])
    if lod < 2:
        n_slats = 10 if lod == 0 else 4
        for si in range(n_slats):
            sx = -4.6 + si * (2.8 / max(1, n_slats - 1))
            acc.box((sx, -4.55, 3.60), (0.09, 0.06, 6.50), EXTRA_PAL["wood_slat"])

    # Covered entry portico & double-height living glazing
    add_door(acc, -0.4, -4.4, 0.50, 1.45, 2.35, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
    if lod < 2:
        add_window(acc, +2.7, -4.4, 1.95, 2.30, 1.65, (0.0, -1.0), PAL["teak_dark"], PAL["glass_aqua"], PAL["cream_trim"], lod=lod)

    # Cantilevered upper balcony on right+center (X in [-1.2, +4.8], Z=3.5)
    add_balcony(acc, +1.8, -4.4, 3.55, 6.0, 1.35, PAL["cream_trim"], glass_rail=True, lod=lod)
    if lod < 2:
        add_window(acc, -3.2, -4.55, 5.15, 1.45, 1.50, (0.0, -1.0), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
        add_side_windows(acc, -5.2, +5.2, (-1.0, 3.2), (1.95, 5.15), 1.45, 1.45, PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
        add_window(acc, 0.0, 6.6, 5.15, 1.80, 1.35, (0.0, +1.0), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)

    # Roof terrace + WHITE SLATTED TERRACE PERGOLA BEAMS on roof
    add_glass_parapet(acc, bw, bd, yc, 7.00, PAL["cream_trim"], lod=lod, glass_front=True)
    # Pergola frame & columns on front-left roof deck
    for px in (-4.8, +0.4):
        acc.box((px, -4.1, 8.20), (0.30, 0.30, 2.40), PAL["white"])
        acc.box((px, +0.2, 8.20), (0.30, 0.30, 2.40), PAL["white"])
    add_pergola(acc, -2.2, -1.95, 9.35, 5.6, 4.6, 11, PAL["white"], PAL["cream_trim"], lod=lod, along_x=True)
    add_stair_mumty(acc, 2.8, 4.0, 7.05, 2.6, 2.8, 2.0, PAL["cream"], PAL["terracotta"], lod=lod)
    add_water_tank(acc, -2.8, 4.5, 7.05, lod=lod)

    cols = [
        ("COL_Main", (0.0, 1.1, 4.0), (10.6, 11.2, 8.0)),
        ("COL_Compound", (0.0, -7.45, 0.8), (11.6, 0.5, 1.6)),
    ]
    return acc, cols


def build_b06_apt_lowrise(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B06_apt_lowrise: 15x18m, 3F ground stilt parking colonnade + 2 terracotta-pink floors."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 15.0, 18.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -8.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 14.6, -8.45, -5.8, PAL["terracotta"], PAL["cream_trim"], modern_wood_gate=False, lod=lod)

    bw, bd, yc = 13.6, 13.6, 1.2
    # Ground floor genuine OPEN STILT PARKING COLONNADE (Z=0.10..3.25)
    add_stilt_ground(acc, bw, bd, yc, 0.10, 3.15, PAL["concrete"], PAL["white_shade"], lod=lod, nx_cols=4, ny_cols=3)

    # 2 Upper Terracotta-Pink Residential Storeys (Z=3.25..9.55)
    for fi, fz in enumerate((3.25, 6.40)):
        acc.box((0.0, yc, fz + 1.55), (bw, bd, 3.10), PAL["terracotta"] if fi == 0 else PAL["pink"])
        if lod < 2:
            acc.box((0.0, yc, fz + 3.08), (bw + 0.24, bd + 0.24, 0.16), PAL["cream_trim"])
            for sx in (-1, 1):
                bx = sx * 3.6
                add_balcony(acc, bx, yc - 0.5 * bd, fz + 0.08, 4.8, 1.25, PAL["cream_trim"], glass_rail=False, lod=lod)
                add_ac_unit(acc, bx + sx * 2.8, yc - 0.5 * bd, fz + 1.6, (0.0, -1.0), lod=lod)
            add_window(acc, 0.0, yc - 0.5 * bd, fz + 1.55, 1.5, 1.4, (0.0, -1.0), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
            if lod == 0:
                add_side_windows(acc, -0.5 * bw, +0.5 * bw, (-2.8, 1.2, 5.2), (fz + 1.55,), 1.45, 1.35, PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
                for wx in (-3.8, 0.0, +3.8):
                    add_window(acc, wx, yc + 0.5 * bd, fz + 1.55, 1.45, 1.35, (0.0, +1.0), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
    if lod >= 2:
        for sx in (-1, 1):
            acc.box((sx * 3.6, yc - 0.5 * bd - 0.55, 6.4), (4.8, 1.2, 6.1), PAL["cream_trim"])

    # Roof parapet + mumty + water tank
    add_aligned_parapet(acc, bw, bd, yc, 9.55, 0.85, PAL["terracotta"], PAL["cream_trim"], PAL["pink"], pediment=False, lod=lod)
    add_stair_mumty(acc, 0.0, yc + 3.8, 9.65, 3.2, 3.4, 2.2, PAL["pink"], PAL["terracotta"], lod=lod)
    add_water_tank(acc, -4.0, yc + 4.0, 9.65, lod=lod, r=0.68, h=1.40)
    add_water_tank(acc, +4.0, yc + 4.0, 9.65, lod=lod, r=0.68, h=1.40)

    cols = [
        ("COL_Main", (0.0, yc, 5.2), (13.8, 13.8, 10.4)),
        ("COL_Compound", (0.0, -8.45, 0.8), (14.6, 0.5, 1.6)),
    ]
    return acc, cols


def build_b07_apt_midrise(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B07_apt_midrise: 18x24m, 4F white/charcoal apartment with mustard stair/balcony fin columns."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 24.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -11.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    # Compound wall + entry portico gatehouse at front -Y
    if lod < 2:
        add_compound_fence(acc, 17.6, -11.4, -7.8, PAL["white"], PAL["charcoal"], modern_wood_gate=True, lod=lod)
        # Covered pedestrian/security entry portico over gate
        acc.box((0.0, -11.4, 2.75), (4.6, 1.8, 0.22), PAL["mustard"])
        for sx in (-1, 1):
            acc.box((sx * 2.1, -11.4, 1.38), (0.38, 0.44, 2.76), PAL["charcoal"])

    bw, bd, yc = 16.0, 18.4, 1.6
    # Stilt ground floor (Z=0.10..3.35)
    add_stilt_ground(acc, bw, bd, yc, 0.10, 3.25, PAL["charcoal"], PAL["white_shade"], lod=lod, nx_cols=5, ny_cols=3)

    # 3 Upper Residential Storeys (4F total, Z=3.35..12.95)
    if lod >= 2:
        acc.box((0.0, yc, 8.15), (bw, bd, 9.60), PAL["white"])
        for sx in (-1, 1):
            acc.box((sx * 4.6, yc - 0.5 * bd - 0.6, 8.15), (5.0, 1.3, 9.4), PAL["white_shade"])
    else:
        for fz in (3.35, 6.55, 9.75):
            acc.box((0.0, yc, fz + 1.55), (bw, bd, 3.12), PAL["white"])
            acc.box((0.0, yc, fz + 3.12), (bw + 0.26, bd + 0.26, 0.16), PAL["charcoal"])
            for sx in (-1, 1):
                bx = sx * 4.6
                add_balcony(acc, bx, yc - 0.5 * bd, fz + 0.06, 5.0, 1.35, PAL["white_shade"], glass_rail=True, lod=lod)
                add_ac_unit(acc, bx + sx * 2.9, yc - 0.5 * bd, fz + 1.5, (0.0, -1.0), lod=lod)
            add_window_band(acc, 0.0, yc - 0.5 * bd, fz + 1.60, 2.2, 2.1, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], n_mullions=2, lod=lod)
            if lod == 0:
                add_side_windows(acc, -0.5 * bw, +0.5 * bw, (-4.2, 1.6, 7.4), (fz + 1.60,), 1.65, 1.45, PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
                for wx in (-4.8, 0.0, +4.8):
                    add_window_band(acc, wx, yc + 0.5 * bd, fz + 1.60, 2.2, 1.45, (0.0, +1.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
            elif fz == 6.55:
                add_window_band(acc, yc, -0.5 * bw, fz + 1.60, 8.0, 1.45, (-1.0, 0.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
                add_window_band(acc, yc, +0.5 * bw, fz + 1.60, 8.0, 1.45, (+1.0, 0.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    # Bold MUSTARD-YELLOW vertical stair/balcony fin columns full height!
    fin_xs = (-7.6, +7.6) if lod >= 2 else (-7.6, -1.45, +1.45, +7.6)
    for fx in fin_xs:
        acc.box((fx, yc - 0.5 * bd - 0.45, 7.00), (0.42, 1.25, 13.70), PAL["mustard"])
    if lod < 2:
        acc.box((0.0, yc - 0.5 * bd - 0.45, 13.85), (3.4, 1.35, 0.45), PAL["charcoal"])

    add_glass_parapet(acc, bw, bd, yc, 12.95, PAL["charcoal"], lod=lod, glass_front=True)
    add_stair_mumty(acc, 0.0, yc + 5.2, 13.05, 3.6, 3.8, 2.4, PAL["white"], PAL["charcoal"], lod=lod)
    add_water_tank(acc, -4.8, yc + 5.6, 13.05, lod=lod, r=0.72, h=1.45)
    add_water_tank(acc, +4.8, yc + 5.6, 13.05, lod=lod, r=0.72, h=1.45)

    cols = [
        ("COL_Main", (0.0, yc, 7.1), (16.2, 18.6, 14.2)),
        ("COL_Compound", (0.0, -11.4, 1.4), (17.6, 1.4, 2.8)),
    ]
    return acc, cols


def build_b08_gated_block(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B08_gated_block: 30x40m, 5F twin apartment wings + courtyard + entrance gatehouse."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 30.0, 40.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    # Central courtyard paving & landscaped lawn islands
    acc.box((0.0, -2.5, 0.09), (10.0, 32.0, 0.08), PAL["pavement"])
    for ly in (-8.5, +1.5):
        acc.box((0.0, ly, 0.13), (5.2, 6.2, 0.08), EXTRA_PAL["lawn"])
        if lod == 0:
            for sx in (-1, 1):
                add_potted_palm(acc, sx * 1.8, ly, 0.16, lod=lod, scale=1.2)

    # Perimeter compound wall + ICONIC ENTRANCE ARCHWAY GATEHOUSE at Y=-19.0
    if lod < 2:
        add_compound_fence(acc, 29.4, -19.2, -13.0, PAL["cream"], PAL["terracotta"], modern_wood_gate=True, lod=lod)
        # Side boundary walls full depth
        for sx in (-1, 1):
            acc.box((sx * 14.7, 0.0, 0.75), (0.28, 38.4, 1.40), PAL["cream"])
    # Gatehouse archway & security cabin
    acc.box((0.0, -18.8, 3.65), (9.6, 2.8, 0.45), PAL["terracotta"])
    acc.box((0.0, -18.8, 4.15), (10.0, 3.1, 0.25), PAL["cream_trim"])
    for sx in (-1, 1):
        acc.box((sx * 4.2, -18.8, 1.85), (1.1, 2.4, 3.50), PAL["cream"])
    if lod < 2:
        acc.box((0.0, -18.8, 1.35), (1.5, 1.8, 2.50), PAL["white"])  # Guard cabin island
        acc.box((0.0, -18.8, 2.65), (1.8, 2.0, 0.14), PAL["charcoal"])
        acc.arch_slab(0.0, -18.8, 3.85, 0.6, 2.1, 10 if lod == 0 else 5, PAL["cream_trim"])

    # TWIN 5-STOREY APARTMENT WINGS (West X=-9.4, East X=+9.4, Y in [-13.0, +16.0]) + Rear Clubhouse Bridge (Y in [+10.0, +16.0])
    wing_w, wing_d, wing_yc = 9.2, 29.0, 1.5
    h_floor = 3.10
    for sx in (-1, 1):
        wx = sx * 9.4
        if lod >= 2:
            acc.box((wx, wing_yc, 8.0), (wing_w, wing_d, 15.8), PAL["white"])
            acc.box((wx, wing_yc, 16.15), (wing_w, wing_d, 0.70), PAL["terracotta"])
            continue
        # Stilt/podium base (Z=0.10..3.30)
        acc.box((wx, wing_yc, 1.70), (wing_w, wing_d, 3.20), PAL["concrete"])
        # 4 upper residential storeys (Z=3.30..15.70)
        for fi in range(4):
            fz = 3.30 + fi * h_floor
            acc.box((wx, wing_yc, fz + 1.52), (wing_w, wing_d, h_floor - 0.08), PAL["white"] if fi % 2 == 0 else PAL["cream"])
            acc.box((wx, wing_yc, fz + h_floor - 0.04), (wing_w + 0.24, wing_d + 0.24, 0.16), PAL["terracotta"])
            acc.box((wx, wing_yc - 0.5 * wing_d - 0.55, fz + 0.05), (5.6, 1.15, 0.14), PAL["cream_trim"])
            acc.box((wx, wing_yc - 0.5 * wing_d - 1.05, fz + 0.52), (5.5, 0.08, 0.85), PAL["glass_rail"])
            if lod == 0:
                for by in (-7.5, -0.5, 6.5):
                    acc.box((wx - sx * (0.5 * wing_w + 0.50), by, fz + 0.05), (1.05, 4.2, 0.14), PAL["cream_trim"])
                    acc.box((wx - sx * (0.5 * wing_w + 0.98), by, fz + 0.52), (0.08, 4.1, 0.82), PAL["glass_rail"])
                    add_window_band(acc, by, wx + sx * 0.5 * wing_w, fz + 1.55, 2.4, 1.35, (sx * 1.0, 0.0), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], n_mullions=1, lod=lod)
            else:
                acc.box((wx - sx * (0.5 * wing_w + 0.50), wing_yc, fz + 0.05), (1.0, 14.0, 0.14), PAL["cream_trim"])
        # Roof parapet & water tanks per wing
        acc.box((wx, wing_yc, 16.15), (wing_w, wing_d, 0.85), PAL["cream_trim"])
        acc.box((wx, wing_yc, 15.74), (wing_w - 0.5, wing_d - 0.5, 0.08), PAL["surkhi"])
        add_stair_mumty(acc, wx, 9.5, 15.8, 3.0, 3.2, 2.1, PAL["white"], PAL["terracotta"], lod=lod)
        add_water_tank(acc, wx, -5.0, 15.8, lod=lod, r=0.75, h=1.45)

    # Rear connecting 2F clubhouse bridge (X in [-4.8, +4.8], Y in [+10.5, +16.0], Z=0.1..6.6)
    acc.box((0.0, 13.25, 3.35), (9.8, 5.5, 6.50), PAL["terracotta"])
    if lod < 2:
        add_window_band(acc, 0.0, 10.5, 4.8, 5.8, 1.7, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["cream_trim"], n_mullions=3, lod=lod)
        add_pergola(acc, 0.0, 13.25, 6.75, 8.8, 4.6, 8, PAL["white"], PAL["cream_trim"], lod=lod)

    cols = [
        ("COL_Main", (-9.4, 1.5, 8.5), (9.4, 29.2, 17.0)),
        ("COL_EastWing", (+9.4, 1.5, 8.5), (9.4, 29.2, 17.0)),
        ("COL_Compound", (0.0, -18.8, 2.1), (29.4, 3.0, 4.2)),
    ]
    return acc, cols


def build_b10_modern_townhouse(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B10_modern_townhouse: 9x14m, 3F narrow lot villa with stacked wood+slate box & cantilevered roof."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 9.0, 14.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -6.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 8.6, -6.45, -3.8, PAL["white"], PAL["slate"], modern_wood_gate=True, lod=lod)

    bw, bd, yc = 7.8, 9.6, 1.2
    # Ground floor stilt/garage + entry foyer (Z=0.10..3.30)
    acc.box((0.0, yc, 1.70), (bw, bd, 3.20), PAL["white"])
    acc.box((-1.6, -3.65, 1.35), (3.4, 0.14, 2.40), PAL["charcoal"])  # Garage shutter recess
    add_door(acc, +2.1, -3.6, 0.30, 1.20, 2.30, (0.0, -1.0), PAL["charcoal"], PAL["teak_brown"], PAL["white_shade"], lod=lod)

    # 1F & 2F Stacked SLATE STONE + WOOD cladding projecting box (Z=3.30..9.80)
    acc.box((-0.6, -0.3, 6.55), (6.4, 10.6, 6.40), PAL["slate"])
    acc.box((+2.1, yc, 6.55), (3.4, bd, 6.40), PAL["white"])
    # Wood-clad soffit & accent panel
    acc.box((-0.6, -4.4, 3.38), (6.4, 2.4, 0.18), PAL["teak_brown"])
    acc.box((-2.5, -5.62, 6.55), (2.2, 0.14, 6.20), PAL["teak_brown"])
    if lod < 2:
        # 1F & 2F glass balconies
        add_balcony(acc, +0.9, -3.6, 3.40, 4.4, 1.35, PAL["slate"], glass_rail=True, lod=lod)
        add_balcony(acc, +0.9, -3.6, 6.65, 4.4, 1.35, PAL["slate"], glass_rail=True, lod=lod)
        add_window(acc, -2.5, -5.65, 5.05, 1.3, 1.6, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], with_chajja=False, lod=lod)
        add_window(acc, -2.5, -5.65, 8.25, 1.3, 1.6, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], with_chajja=False, lod=lod)
        add_side_windows(acc, -3.9, +3.9, (-0.5, 3.2), (5.05, 8.25), 1.35, 1.45, PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    # Cantilevered bold top roof slab (Z=9.90) + parapet + black water tank
    acc.box((0.0, 0.4, 9.95), (8.6, 11.4, 0.28), PAL["white"])
    acc.box((0.0, 0.4, 9.80), (8.4, 11.2, 0.10), PAL["teak_brown"])
    add_glass_parapet(acc, bw, bd, yc, 10.10, PAL["slate"], lod=lod, glass_front=True)
    add_stair_mumty(acc, -1.8, 3.8, 10.15, 2.2, 2.4, 1.9, PAL["white"], PAL["slate"], lod=lod)
    add_water_tank(acc, +2.0, 4.2, 10.15, lod=lod)

    cols = [
        ("COL_Main", (0.0, 1.0, 5.5), (8.2, 10.8, 11.0)),
        ("COL_Compound", (0.0, -6.45, 0.8), (8.6, 0.5, 1.6)),
    ]
    return acc, cols


def build_b42_highrise_apt(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """B42_highrise_apt: 32x48m, 16F twin towers + podium + gate arch (LOD0 <= 5,200 tris)."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 32.0, 48.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -23.2, 0.09), (w, 1.4, 0.12), PAL["pavement"])

    # Iconic front entrance gate arch + perimeter low wall
    acc.box((0.0, -22.8, 3.60), (10.5, 2.6, 0.45), PAL["charcoal"])
    for sx in (-1, 1):
        acc.box((sx * 4.6, -22.8, 1.80), (1.1, 2.4, 3.60), PAL["white"])
        if lod < 2:
            acc.box((sx * 9.8, -22.8, 0.70), (8.8, 0.28, 1.30), PAL["white_shade"])
    if lod < 2:
        acc.box((0.0, -22.8, 1.25), (1.4, 1.8, 2.30), PAL["slate"])
        acc.box((0.0, -22.8, 4.05), (11.0, 2.8, 0.24), PAL["mustard"])

    # Shared 2-storey Podium linking Twin Towers (X in [-14.5, +14.5], Y in [-16.0, +19.0], Z=0.1..6.6)
    acc.box((0.0, 1.5, 3.35), (28.8, 34.0, 6.50), PAL["slate"])
    acc.box((0.0, 1.5, 6.68), (29.2, 34.4, 0.24), PAL["white_shade"])
    if lod < 2:
        # Podium lobby glazing & colonnade
        acc.box((0.0, -15.55, 2.40), (10.0, 0.24, 4.40), PAL["glass_aqua"])
        acc.box((0.0, -16.4, 4.80), (11.2, 1.8, 0.30), PAL["mustard"])
        for sx in (-1, 1):
            acc.box((sx * 5.2, -16.8, 2.40), (0.55, 0.55, 4.80), PAL["white"])

    # TWIN 16-STOREY TOWERS (North-West & South-East or West/East side-by-side: X=-7.8 and X=+7.8, Y in [-12.0, +16.0])
    # Wait: 2 towers side-by-side at X=-8.0 & X=+8.0 (each 11.2m wide x 26m deep) leaves a grand central podium plaza!
    tw, td, tyc = 11.2, 26.0, 2.0
    z_pod = 6.80
    h_fl = 2.95  # 14 floors above 2F podium = 16F total -> 6.80 + 14*2.95 = 48.10m + 4.5m MEP crown = 52.6m!
    n_upper = 14

    for sx in (-1, 1):
        tx = sx * 8.2
        # Main tower core box (LOD2 uses just this + crown!)
        tower_h = n_upper * h_fl
        acc.box((tx, tyc, z_pod + 0.5 * tower_h), (tw, td, tower_h), PAL["white"])
        # Vertical accent core fins on outer & inner faces (full height, very low tri cost)
        acc.box((tx + sx * (0.5 * tw + 0.15), tyc, z_pod + 0.5 * tower_h), (0.40, 4.2, tower_h + 1.2), PAL["mustard"])
        acc.box((tx, tyc - 0.5 * td - 0.18, z_pod + 0.5 * tower_h), (2.2, 0.45, tower_h + 0.8), PAL["charcoal"])

        if lod == 0:
            # 14 upper floors with clean low-tri repetitive recessed balcony/window bands (6 boxes/floor/tower -> 2*14*6*12 = 2016 tris)
            for fi in range(n_upper):
                fz = z_pod + fi * h_fl
                # Front (-Y) twin projecting balcony slabs + glass rail strip
                acc.box((tx - 3.1, tyc - 0.5 * td - 0.55, fz + 0.08), (3.8, 1.15, 0.16), PAL["white_shade"])
                acc.box((tx + 3.1, tyc - 0.5 * td - 0.55, fz + 0.08), (3.8, 1.15, 0.16), PAL["white_shade"])
                acc.box((tx - 3.1, tyc - 0.5 * td - 1.08, fz + 0.55), (3.7, 0.08, 0.82), PAL["glass_rail"])
                acc.box((tx + 3.1, tyc - 0.5 * td - 1.08, fz + 0.55), (3.7, 0.08, 0.82), PAL["glass_rail"])
                # Dark recessed window glazing bands on front & outer side
                acc.box((tx - 3.1, tyc - 0.5 * td - 0.03, fz + 1.45), (3.4, 0.06, 1.85), PAL["glass_blue"])
                acc.box((tx + 3.1, tyc - 0.5 * td - 0.03, fz + 1.45), (3.4, 0.06, 1.85), PAL["glass_blue"])
                acc.box((tx + sx * (0.5 * tw + 0.03), tyc - 6.5, fz + 1.45), (0.06, 6.8, 1.45), PAL["glass_blue"])
                acc.box((tx + sx * (0.5 * tw + 0.03), tyc + 6.5, fz + 1.45), (0.06, 6.8, 1.45), PAL["glass_blue"])
                # Rear (+Y) window band
                acc.box((tx, tyc + 0.5 * td + 0.03, fz + 1.45), (7.6, 0.06, 1.45), PAL["glass_blue"])
        elif lod == 1:
            # Grouped every 2 floors for medium LOD1 (~450 tris)
            for fi in range(0, n_upper, 2):
                fz = z_pod + fi * h_fl
                acc.box((tx, tyc - 0.5 * td - 0.45, fz + 0.10), (tw - 0.8, 0.95, 0.22), PAL["white_shade"])
                acc.box((tx, tyc - 0.5 * td - 0.04, fz + 1.50), (tw - 1.6, 0.08, 1.80), PAL["glass_blue"])
                acc.box((tx + sx * (0.5 * tw + 0.04), tyc, fz + 1.50), (0.08, td - 4.0, 1.60), PAL["glass_blue"])

        # Rooftop MEP Crowns (Z = 48.10..53.2)
        z_top = z_pod + tower_h
        acc.box((tx, tyc, z_top + 0.55), (tw + 0.4, td + 0.4, 1.10), PAL["charcoal"])
        acc.box((tx, tyc - 2.0, z_top + 2.50), (5.4, 7.2, 2.80), PAL["white_shade"])  # Lift machine room
        if lod < 2:
            acc.box((tx, tyc + 6.5, z_top + 2.00), (6.0, 5.2, 1.80), PAL["slate"])        # Chiller/tank enclosure
            # Crown pergola portal frame
            acc.box((tx, tyc - 0.5 * td + 1.2, z_top + 3.80), (tw, 0.45, 0.55), PAL["mustard"])
            for cx in (-4.8, 4.8):
                acc.box((tx + cx, tyc - 0.5 * td + 1.2, z_top + 2.35), (0.45, 0.45, 2.60), PAL["mustard"])

    cols = [
        ("COL_Main", (-8.2, 2.0, 26.2), (11.6, 26.4, 52.4)),
        ("COL_EastTower", (+8.2, 2.0, 26.2), (11.6, 26.4, 52.4)),
        ("COL_Podium", (0.0, 1.5, 3.4), (29.0, 34.2, 6.8)),
        ("COL_Compound", (0.0, -22.8, 2.0), (29.0, 2.8, 4.0)),
    ]
    return acc, cols


def build_k08_tnhb_block(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """K08_tnhb_block: 16x34m, 4F classic Chennai TNHB salmon-pink block with twin stairwells."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 16.0, 34.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -16.5, 0.09), (w, 1.0, 0.12), PAL["pavement"])

    bw, bd, yc = 14.0, 29.6, 0.4
    acc.box((0.0, yc, 0.35), (bw + 0.3, bd + 0.3, 0.50), PAL["plinth"])

    # 4 Storeys of classic TNHB salmon-pink masonry (Z=0.60..13.20)
    h_fl = 3.15
    if lod >= 2:
        acc.box((0.0, yc, 6.90), (bw, bd, 12.60), PAL["salmon"])
        acc.box((0.5 * bw + 0.65, yc, 6.90), (1.30, bd - 2.0, 12.20), PAL["cream_trim"])
    else:
        for fi in range(4):
            fz = 0.60 + fi * h_fl
            acc.box((0.0, yc, fz + 0.5 * h_fl), (bw, bd, h_fl), PAL["salmon"])
            acc.box((0.5 * bw + 0.65, yc, fz + 0.08), (1.30, bd - 2.0, 0.16), PAL["cream_trim"])
            acc.box((0.5 * bw + 1.22, yc, fz + 0.58), (0.16, bd - 2.1, 0.88), PAL["salmon"])
            acc.box((0.5 * bw + 1.22, yc, fz + 1.06), (0.20, bd - 2.0, 0.08), PAL["cream_trim"])
            if lod == 0 or fi % 2 == 0:
                for wx in (-4.2, +4.2):
                    add_window(acc, wx, yc - 0.5 * bd, fz + 1.60, 1.50, 1.35, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
            if lod == 0:
                for wy in (-10.0, -4.0, +2.0, +8.0, +13.0):
                    add_window(acc, wy, -0.5 * bw, fz + 1.60, 1.50, 1.35, (-1.0, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
                for wy in (-9.0, -2.0, +5.0, +11.0):
                    add_door(acc, wy, +0.5 * bw, fz + 0.16, 1.00, 2.05, (+1.0, 0.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
            elif fi % 2 == 0:
                for wy in (-10.0, 0.0, +10.0):
                    add_window(acc, wy, -0.5 * bw, fz + 1.60, 1.50, 1.35, (-1.0, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)

    # TWIN PROJECTING OPEN VERTICAL STAIRWELLS (at front-center-left/right or front + rear on -X / -Y)
    # Place twin projecting stairwell towers on the front (-Y) at X=0 and West (-X) at Y=-6.5 / +6.5 so both are prominent!
    for sy in (-7.2, +7.2):
        sx = -0.5 * bw - 1.05
        acc.box((sx, sy, 6.90), (2.10, 3.60, 12.60), PAL["salmon"])
        acc.box((sx, sy, 13.30), (2.30, 3.80, 0.22), PAL["cream_trim"])
        # Horizontal landing ventilation slots (openings/fins) at every floor & half-landing
        if lod < 2:
            n_vents = 8 if lod == 0 else 4
            for vi in range(n_vents):
                vz = 1.6 + vi * 1.45
                acc.box((sx - 1.06, sy, vz), (0.08, 2.20, 0.52), PAL["recess"])
                acc.box((sx - 1.12, sy, vz + 0.12), (0.14, 2.30, 0.08), PAL["cream_trim"])
                acc.box((sx - 1.12, sy, vz - 0.12), (0.14, 2.30, 0.08), PAL["cream_trim"])
        # Ground stairwell entrance arch
        add_door(acc, sy, -0.5 * bw - 2.10, 0.60, 1.40, 2.25, (-1.0, 0.0), PAL["charcoal"], PAL["recess"], PAL["cream_trim"], lod=lod)

    # Roof parapet + masonry overhead water tanks
    add_aligned_parapet(acc, bw, bd, yc, 13.20, 0.85, PAL["salmon"], PAL["cream_trim"], PAL["surkhi"], pediment=False, lod=lod)
    for ty in (-9.0, +9.0):
        acc.box((0.0, ty, 14.30), (3.2, 2.6, 1.40), PAL["red_brick"])
        acc.box((0.0, ty, 15.08), (3.4, 2.8, 0.16), PAL["concrete"])
    add_stair_mumty(acc, -5.0, -7.2, 13.3, 2.4, 3.4, 2.0, PAL["salmon"], PAL["cream_trim"], lod=lod)

    cols = [
        ("COL_Main", (0.0, yc, 7.1), (15.4, 30.0, 14.2)),
    ]
    return acc, cols


def build_chn_041_contemp_indep(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_041_contemp_indep: 12x18m, 2F warm timber-clad soffit cantilever + double-height foyer."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 18.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -8.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 11.4, -8.4, -4.8, PAL["white"], PAL["charcoal"], modern_wood_gate=True, lod=lod)

    bw, bd, yc = 10.4, 12.6, 1.6
    # Main white contemporary 2F block
    acc.box((0.0, yc, 3.65), (bw, bd, 7.10), PAL["white"])
    acc.box((0.0, yc, 0.30), (bw + 0.16, bd + 0.16, 0.40), PAL["plinth"])

    # Double-height glazed foyer on right half (X in [+0.8, +4.6], Z=0.5..6.9)
    acc.box((2.7, -4.72, 3.70), (3.6, 0.12, 6.20), PAL["glass_aqua"])
    acc.box((2.7, -4.78, 3.70), (3.7, 0.10, 0.14), PAL["charcoal"])
    if lod < 2:
        for mx in (0.95, 2.70, 4.45):
            acc.box((mx, -4.78, 3.70), (0.08, 0.12, 6.25), PAL["charcoal"])
        add_door(acc, 2.7, -4.75, 0.50, 1.45, 2.35, (0.0, -1.0), PAL["charcoal"], PAL["teak_brown"], PAL["white_shade"], lod=lod)

    # Left half: Ground carport/porch + 1F modern glass terrace with WARM TIMBER-CLAD SOFFIT CANTILEVER!
    acc.box((-2.4, -5.85, 3.55), (5.4, 2.4, 0.22), PAL["white"])
    acc.box((-2.4, -5.85, 3.40), (5.3, 2.3, 0.09), PAL["teak_brown"])  # Timber soffit underside
    acc.box((-2.4, -5.85, 7.10), (5.8, 2.8, 0.26), PAL["white"])
    acc.box((-2.4, -5.85, 6.92), (5.6, 2.6, 0.12), PAL["teak_brown"])  # Upper timber soffit cantilever!
    if lod < 2:
        add_balcony(acc, -2.4, -4.7, 3.62, 5.2, 2.2, PAL["white_shade"], glass_rail=True, lod=lod)
        add_window(acc, -2.4, -4.7, 1.95, 2.2, 1.5, (0.0, -1.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
        add_side_windows(acc, -5.2, +5.2, (-1.0, 3.6), (1.95, 5.25), 1.5, 1.5, PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
        add_window(acc, 0.0, 7.9, 5.25, 2.0, 1.4, (0.0, +1.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    add_glass_parapet(acc, bw, bd, yc, 7.20, PAL["charcoal"], lod=lod, glass_front=True)
    add_stair_mumty(acc, -2.8, 5.2, 7.25, 2.4, 2.6, 1.9, PAL["white"], PAL["charcoal"], lod=lod)
    add_water_tank(acc, 2.6, 5.6, 7.25, lod=lod)

    cols = [
        ("COL_Main", (0.0, 1.2, 4.0), (10.6, 13.8, 8.0)),
        ("COL_Compound", (0.0, -8.4, 0.8), (11.4, 0.5, 1.6)),
    ]
    return acc, cols


def build_chn_043_duplex_pergola(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_043_duplex_pergola: 12x16m, 2F dark slate stone wall + rooftop wood louver pergola + L-balcony."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 16.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -7.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 11.4, -7.4, -4.4, PAL["white"], PAL["slate"], modern_wood_gate=True, lod=lod)

    bw, bd, yc = 10.4, 11.2, 1.4
    acc.box((0.0, yc, 3.55), (bw, bd, 6.90), PAL["white"])
    acc.box((0.0, yc, 0.30), (bw + 0.16, bd + 0.16, 0.40), PAL["plinth"])

    # Dark SLATE STONE ACCENT WALL anchoring right front bay (X in [+1.8, +5.2], Z=0.5..7.4)
    acc.box((3.5, -4.15, 3.95), (3.4, 0.65, 6.90), PAL["slate"])
    if lod == 0:
        for sz in (1.2, 2.4, 3.6, 4.8, 6.0):
            acc.box((3.5, -4.50, sz), (3.45, 0.05, 0.10), EXTRA_PAL["stone_dark"])

    # Cantilevered L-balcony on 1F wrapping front (-Y) and left (-X)
    acc.box((-1.6, -4.85, 3.50), (7.6, 1.50, 0.18), PAL["white_shade"])
    acc.box((-5.65, -2.50, 3.50), (1.10, 6.20, 0.18), PAL["white_shade"])
    if lod < 2:
        acc.box((-1.6, -5.54, 3.98), (7.5, 0.06, 0.82), PAL["glass_rail"])
        acc.box((-6.14, -2.50, 3.98), (0.06, 6.10, 0.82), PAL["glass_rail"])
        acc.box((-1.6, -5.54, 4.42), (7.6, 0.09, 0.06), PAL["charcoal"])
        acc.box((-6.14, -2.50, 4.42), (0.09, 6.20, 0.06), PAL["charcoal"])
        add_door(acc, 0.2, -4.2, 0.50, 1.35, 2.30, (0.0, -1.0), PAL["charcoal"], PAL["teak_brown"], PAL["white_shade"], lod=lod)
        add_window(acc, -2.8, -4.2, 1.95, 2.0, 1.45, (0.0, -1.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
        add_window(acc, -2.4, -4.2, 5.15, 2.6, 1.65, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], lod=lod)
        add_side_windows(acc, -5.2, +5.2, (0.5, 4.2), (1.95, 5.15), 1.4, 1.4, PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    # Rooftop wooden louver pergola beams
    add_glass_parapet(acc, bw, bd, yc, 7.00, PAL["white"], lod=lod, glass_front=True)
    for sx in (-4.8, +1.2):
        acc.box((sx, -3.8, 8.15), (0.28, 0.28, 2.30), PAL["white"])
        acc.box((sx, +0.6, 8.15), (0.28, 0.28, 2.30), PAL["white"])
    add_pergola(acc, -1.8, -1.6, 9.25, 6.4, 4.8, 12, PAL["teak_brown"], PAL["white"], lod=lod, along_x=True)
    add_stair_mumty(acc, 3.0, 4.4, 7.05, 2.4, 2.6, 1.9, PAL["slate"], PAL["white"], lod=lod)
    add_water_tank(acc, -2.8, 4.6, 7.05, lod=lod)

    cols = [
        ("COL_Main", (0.0, 1.2, 4.0), (10.8, 11.8, 8.0)),
        ("COL_Compound", (0.0, -7.4, 0.8), (11.4, 0.5, 1.6)),
    ]
    return acc, cols


def build_chn_044_terrace_modern(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_044_terrace_modern: 10x16m, 3F asymmetric white + teal + mustard residence with corner glass."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 16.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -7.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 9.6, -7.4, -4.4, PAL["white"], PAL["teal_wall"], modern_wood_gate=True, lod=lod)

    # Asymmetric stepped 3F interlocking volumes:
    # Base GF+1F core (W=8.8, D=11.0, Y=1.1, Z=0.1..6.6)
    acc.box((0.0, 1.1, 3.35), (8.8, 11.0, 6.50), PAL["white"])
    # Left Teal cantilevered 1F block (X in [-4.7, +0.4], Y in [-5.3, +3.2], Z=3.3..6.6)
    acc.box((-2.15, -1.05, 4.95), (5.1, 8.5, 3.30), PAL["teal_wall"])
    # Right Mustard cantilevered 2F penthouse/terrace box (X in [-0.6, +4.6], Y in [-4.8, +6.6], Z=6.6..9.9)
    acc.box((+2.0, 0.9, 8.25), (5.2, 11.4, 3.30), PAL["mustard"])
    acc.box((+2.0, 0.9, 9.98), (5.6, 12.0, 0.22), PAL["white"])

    # Wrap-around corner glass windows on 1F (teal SE/SW corner) and 2F (mustard SW corner)
    add_corner_window(acc, -4.70, -5.30, 5.05, 2.4, 2.4, 1.65, -1.0, -1.0, PAL["charcoal"], PAL["glass_aqua"], lod=lod)
    add_corner_window(acc, -0.60, -4.80, 8.25, 2.2, 2.2, 1.65, -1.0, -1.0, PAL["charcoal"], PAL["glass_aqua"], lod=lod)
    add_corner_window(acc, +4.60, -4.80, 8.25, 2.0, 2.2, 1.65, +1.0, -1.0, PAL["charcoal"], PAL["glass_aqua"], lod=lod)

    # GF entry & window + 2F open front-left roof terrace
    add_door(acc, +1.8, -4.4, 0.30, 1.30, 2.25, (0.0, -1.0), PAL["charcoal"], PAL["teak_brown"], PAL["white_shade"], lod=lod)
    if lod < 2:
        add_window(acc, -2.0, -4.4, 1.85, 2.2, 1.45, (0.0, -1.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
        add_balcony(acc, +2.2, -4.4, 3.40, 3.6, 1.15, PAL["white_shade"], glass_rail=True, lod=lod)
        # 2F open terrace railing on left side (X in [-4.5, -0.6], Y=-5.2)
        acc.box((-2.55, -5.20, 7.08), (3.8, 0.06, 0.88), PAL["glass_rail"])
        acc.box((-2.55, -5.20, 7.55), (3.9, 0.09, 0.06), PAL["charcoal"])
        add_side_windows(acc, -4.4, +4.4, (-0.5, 3.5), (1.85, 5.05), 1.4, 1.4, PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    add_water_tank(acc, +2.6, 4.8, 10.1, lod=lod)
    add_stair_mumty(acc, +0.6, 4.6, 10.1, 2.0, 2.2, 1.6, PAL["white"], PAL["charcoal"], lod=lod)

    cols = [
        ("COL_Main", (0.0, 0.9, 5.1), (9.2, 11.8, 10.2)),
        ("COL_Compound", (0.0, -7.4, 0.8), (9.6, 0.5, 1.6)),
    ]
    return acc, cols


def build_chn_045_corner_modern(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_045_corner_modern: 14x20m, 2F chamfered dual-frontage modern home with wrap-around glass balconies."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 14.0, 20.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -9.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])
    acc.box((6.6, 0.0, 0.09), (0.8, d - 0.8, 0.12), PAL["pavement"])

    # Corner-wrapping modern compound wall + palm planters
    if lod < 2:
        add_compound_fence(acc, 11.4, -9.4, -5.0, PAL["white"], PAL["charcoal"], modern_wood_gate=True, lod=lod)
        acc.box((6.45, 1.0, 0.55), (0.24, 16.4, 1.10), PAL["white"])
        acc.box((6.45, 1.0, 1.13), (0.30, 16.5, 0.06), PAL["charcoal"])
        # Corner masonry palm planter bed at SE corner (+5.8, -8.8)
        acc.box((5.2, -8.2, 0.30), (2.2, 2.2, 0.44), PAL["slate"])
        add_potted_palm(acc, 5.2, -8.2, 0.52, lod=lod, scale=1.3)
        add_potted_palm(acc, -5.2, -8.4, 0.10, lod=lod, scale=1.1)

    # Chamfered modern 2F main block
    pts = [(-5.8, -5.4), (1.8, -5.4), (5.0, -2.2), (5.0, 8.8), (-5.8, 8.8)]
    add_polygon_prism(acc, pts, 0.10, 7.10, PAL["white"])
    # Wrap-around 1F cantilevered balcony slab + glass rail around -Y, chamfer, and +X!
    bal_pts = [(-5.4, -6.7), (2.3, -6.7), (6.3, -2.7), (6.3, 6.2), (5.0, 6.2), (5.0, -2.2), (1.8, -5.4), (-5.4, -5.4)]
    add_polygon_prism(acc, bal_pts, 3.55, 3.73, PAL["teak_brown"])
    if lod < 2:
        # Glass railing segments along front, 45-deg chamfer, and east side
        acc.box((-1.55, -6.64, 4.18), (7.6, 0.06, 0.88), PAL["glass_rail"])
        acc.box((4.25, -4.65, 4.18), (5.6, 0.06, 0.88), PAL["glass_rail"], rot_z=math.pi * 0.25)
        acc.box((6.24, 1.75, 4.18), (0.06, 8.8, 0.88), PAL["glass_rail"])
        # Upper cantilevered roof slab matching chamfer
        roof_pts = [(-6.1, -6.5), (2.2, -6.5), (6.1, -2.6), (6.1, 9.0), (-6.1, 9.0)]
        add_polygon_prism(acc, roof_pts, 7.08, 7.34, PAL["charcoal"])
    else:
        add_polygon_prism(acc, [(-6.1, -6.5), (2.2, -6.5), (6.1, -2.6), (6.1, 9.0), (-6.1, 9.0)], 7.08, 7.34, PAL["charcoal"])

    # Doors & glazing on both street faces + chamfer
    add_door(acc, -2.8, -5.4, 0.30, 1.45, 2.35, (0.0, -1.0), PAL["charcoal"], PAL["teak_brown"], PAL["white_shade"], lod=lod)
    if lod < 2:
        add_window(acc, -0.2, -5.4, 1.95, 2.2, 1.5, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], lod=lod)
        add_window(acc, -1.8, -5.4, 5.20, 3.4, 1.8, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], lod=lod)
        acc.box((3.42, -3.82, 5.20), (2.6, 0.10, 1.90), PAL["glass_aqua"], rot_z=math.pi * 0.25)
        for wy in (0.5, 4.8):
            add_window(acc, wy, 5.0, 1.95, 1.8, 1.5, (+1.0, 0.0), PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)
            add_window(acc, wy, 5.0, 5.20, 1.8, 1.6, (+1.0, 0.0), PAL["charcoal"], PAL["glass_aqua"], PAL["white_shade"], lod=lod)
        add_side_windows(acc, -5.8, 5.0, (-1.0, 3.8), (1.95,), 1.4, 1.4, PAL["charcoal"], PAL["glass_blue"], PAL["white_shade"], lod=lod)

    add_stair_mumty(acc, -2.8, 5.8, 7.35, 2.4, 2.8, 1.9, PAL["white"], PAL["charcoal"], lod=lod)
    add_water_tank(acc, +2.0, 6.2, 7.35, lod=lod)

    cols = [
        ("COL_Main", (-0.4, 1.7, 4.0), (11.2, 14.6, 8.0)),
        ("COL_Compound", (0.0, -9.4, 0.8), (12.4, 0.5, 1.6)),
    ]
    return acc, cols


def build_chn_046_gated_villa(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_046_gated_villa: 16x24m, 2F luxury cream neoclassical villa + Mangalore tiled pitched roof wings."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 16.0, 24.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -7.2, 0.09), (4.2, 9.6, 0.08), PAL["pavement"])
    for sx in (-1, 1):
        acc.box((sx * 4.8, -8.5, 0.08), (4.6, 5.6, 0.06), EXTRA_PAL["lawn"])

    # Grand arched compound gate at Y=-11.4
    if lod < 2:
        add_compound_fence(acc, 15.6, -11.4, -3.2, PAL["cream"], PAL["cream_trim"], modern_wood_gate=False, lod=lod)
    for sx in (-1, 1):
        acc.box((sx * 2.1, -11.4, 1.75), (0.75, 0.75, 3.40), PAL["cream"])
    acc.box((0.0, -11.4, 3.55), (5.0, 0.85, 0.45), PAL["cream_trim"])
    if lod < 2:
        acc.arch_slab(0.0, -11.4, 2.75, 0.65, 1.45, 10 if lod == 0 else 5, PAL["cream"])
        acc.pitched_roof(-2.6, +2.6, -12.0, -10.8, 3.78, 0.75, PAL["tile_red"], PAL["cream"], hip=True)

    # Central double-height cream villa core (W=7.4, D=12.8, Y=3.2, Z=0.1..7.6)
    acc.box((0.0, 3.2, 3.85), (7.4, 12.8, 7.50), PAL["cream"])
    acc.box((0.0, -3.6, 3.55), (5.2, 1.8, 0.22), PAL["cream_trim"])  # Upper portico balcony slab
    for sx in (-1, 1):
        acc.box((sx * 2.2, -4.3, 1.85), (0.45, 0.45, 3.50), PAL["cream"])
    if lod < 2:
        acc.arch_slab(0.0, -4.3, 2.55, 0.36, 1.35, 10 if lod == 0 else 5, PAL["cream"])
        add_clay_tile_canopy(acc, 5.4, -4.8, -3.2, 6.40, 7.35, PAL["cream_trim"], lod=lod)
        add_door(acc, 0.0, -3.2, 0.40, 1.55, 2.45, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
        add_window(acc, 0.0, -3.2, 5.15, 1.55, 1.75, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], arched=True, lod=lod)

    # Left & Right pitched Mangalore hipped roof wings (X in [-7.2, -3.6] and [+3.6, +7.2], Y in [-2.6, +9.2])
    for sx in (-1, 1):
        wx = sx * 5.4
        acc.box((wx, 3.3, 3.55), (3.6, 11.8, 6.90), PAL["cream"])
        acc.pitched_roof(wx - 2.1, wx + 2.1, -2.9, 9.5, 7.00, 1.65, PAL["tile_red"], PAL["cream"], hip=True)
        if lod < 2:
            add_window(acc, wx, -2.6, 1.95, 1.25, 1.65, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], arched=True, lod=lod)
            add_window(acc, wx, -2.6, 5.15, 1.25, 1.55, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], arched=True, lod=lod)
            for wy in (0.5, 5.8):
                add_window(acc, wy, sx * 7.2, 1.95, 1.3, 1.45, (sx * 1.0, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
                add_window(acc, wy, sx * 7.2, 5.15, 1.3, 1.45, (sx * 1.0, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)

    # Central roof hip & rear tank
    acc.pitched_roof(-3.9, +3.9, -3.4, 9.8, 7.60, 1.75, PAL["tile_red"], PAL["cream"], hip=True)
    add_water_tank(acc, 0.0, 8.2, 7.65, lod=lod)

    cols = [
        ("COL_Main", (0.0, 3.2, 4.5), (14.6, 13.0, 9.0)),
        ("COL_Compound", (0.0, -11.4, 1.8), (15.6, 1.2, 3.6)),
    ]
    return acc, cols


def build_chn_047_row_modern(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_047_row_modern: 6x14m, 2F modular modern duplex with projecting grey cantilever frame."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 14.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -6.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 5.8, -6.4, -3.8, PAL["white"], PAL["slate"], modern_wood_gate=True, lod=lod)

    bw, bd, yc = 5.6, 9.8, 1.1
    acc.box((0.0, yc, 3.55), (bw, bd, 6.90), PAL["white"])
    acc.box((0.0, yc, 0.30), (bw + 0.14, bd + 0.14, 0.40), PAL["plinth"])

    # GF carport bay + warm timber door
    acc.box((-1.3, -3.82, 1.35), (2.4, 0.10, 2.30), PAL["charcoal"])
    add_door(acc, +1.5, -3.8, 0.30, 1.20, 2.30, (0.0, -1.0), PAL["charcoal"], PAL["teak_brown"], PAL["white_shade"], lod=lod)

    # Projecting GREY CANTILEVER C-FRAME enclosing glazed 1F terrace (Y=-3.8..-5.0, Z=3.4..6.9)
    acc.box((0.0, -4.40, 3.48), (5.5, 1.30, 0.22), PAL["slate"])
    acc.box((0.0, -4.40, 6.90), (5.5, 1.30, 0.24), PAL["slate"])
    for sx in (-1, 1):
        acc.box((sx * 2.63, -4.40, 5.19), (0.24, 1.30, 3.20), PAL["slate"])
    if lod < 2:
        add_balcony(acc, 0.0, -3.8, 3.58, 4.9, 1.15, PAL["concrete"], glass_rail=True, lod=lod)
        add_window(acc, 0.0, -3.8, 5.20, 3.8, 2.10, (0.0, -1.0), PAL["charcoal"], PAL["glass_aqua"], PAL["concrete"], lod=lod)
        add_side_windows(acc, -2.8, +2.8, (-0.5, 3.2), (1.90, 5.15), 1.2, 1.3, PAL["charcoal"], PAL["glass_blue"], PAL["concrete"], lod=lod)
        add_window(acc, 0.0, 6.0, 5.15, 1.4, 1.3, (0.0, +1.0), PAL["charcoal"], PAL["glass_blue"], PAL["concrete"], lod=lod)

    add_glass_parapet(acc, bw, bd, yc, 7.00, PAL["slate"], lod=lod, glass_front=True)
    add_stair_mumty(acc, -1.3, 4.0, 7.05, 2.0, 2.2, 1.8, PAL["white"], PAL["slate"], lod=lod)
    add_water_tank(acc, +1.5, 4.4, 7.05, lod=lod, r=0.45, h=1.05)

    cols = [
        ("COL_Main", (0.0, 0.9, 3.9), (5.8, 10.6, 7.8)),
        ("COL_Compound", (0.0, -6.4, 0.8), (5.8, 0.45, 1.6)),
    ]
    return acc, cols


def build_chn_048_small_apt(lod: int) -> Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]:
    """CHN_048_small_apt: 12x18m, 3F 4-unit apartment with terracotta corner fin & stacked balconies."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 18.0
    acc.box((0.0, 0.0, 0.05), (w, d, 0.10), PAL["plinth"])
    acc.box((0.0, -8.6, 0.09), (w, 0.8, 0.12), PAL["pavement"])

    if lod < 2:
        add_compound_fence(acc, 11.4, -8.4, -5.2, PAL["white"], PAL["terracotta"], modern_wood_gate=True, lod=lod)

    bw, bd, yc = 10.6, 13.4, 1.4
    # Ground stilt entrance + parking bay (Z=0.10..3.25)
    add_stilt_ground(acc, bw, bd, yc, 0.10, 3.15, PAL["concrete"], PAL["white_shade"], lod=lod, nx_cols=3, ny_cols=3)

    # 2 Upper Residential Storeys (Z=3.25..9.55)
    if lod >= 2:
        acc.box((0.0, yc, 6.40), (bw, bd, 6.30), PAL["white"])
        acc.box((+2.4, yc - 0.5 * bd - 0.6, 6.40), (4.6, 1.2, 6.1), PAL["cream_trim"])
    else:
        for fz in (3.25, 6.40):
            acc.box((0.0, yc, fz + 1.55), (bw, bd, 3.10), PAL["white"])
            acc.box((0.0, yc, fz + 3.10), (bw + 0.22, bd + 0.22, 0.16), PAL["cream_trim"])
            add_balcony(acc, +2.4, yc - 0.5 * bd, fz + 0.06, 4.6, 1.25, PAL["cream_trim"], glass_rail=True, lod=lod)
            add_ac_unit(acc, -2.5, yc - 0.5 * bd, fz + 1.5, (0.0, -1.0), lod=lod)
            add_window(acc, -1.8, yc - 0.5 * bd, fz + 1.60, 2.0, 1.45, (0.0, -1.0), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
            if lod == 0:
                add_side_windows(acc, -0.5 * bw, +0.5 * bw, (-2.2, 2.0, 5.4), (fz + 1.60,), 1.45, 1.35, PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
                for wx in (-2.6, +2.6):
                    add_window(acc, wx, yc + 0.5 * bd, fz + 1.60, 1.5, 1.35, (0.0, +1.0), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
            else:
                add_side_windows(acc, -0.5 * bw, +0.5 * bw, (1.4,), (fz + 1.60,), 1.8, 1.35, PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)

    # Bold TERRACOTTA-RED CORNER FIN WALL rising full 3 storeys along front-left corner
    acc.box((-4.75, yc - 0.5 * bd - 0.35, 5.10), (1.35, 1.15, 10.00), PAL["terracotta"])
    acc.box((-5.45, yc - 0.5 * bd + 1.2, 5.10), (0.35, 2.80, 10.00), PAL["terracotta"])

    add_aligned_parapet(acc, bw, bd, yc, 9.55, 0.85, PAL["white"], PAL["cream_trim"], PAL["terracotta"], pediment=False, lod=lod)
    add_stair_mumty(acc, -2.6, 5.4, 9.65, 2.6, 2.8, 2.1, PAL["white"], PAL["terracotta"], lod=lod)
    add_water_tank(acc, +2.6, 5.6, 9.65, lod=lod, r=0.62, h=1.30)

    cols = [
        ("COL_Main", (0.0, yc, 5.2), (11.0, 13.8, 10.4)),
        ("COL_Compound", (0.0, -8.4, 0.8), (11.4, 0.5, 1.6)),
    ]
    return acc, cols


# ---------------------------------------------------------------------------
# Specification Table & Driver
# ---------------------------------------------------------------------------

SPECS: List[Dict[str, Any]] = [
    {
        "id": "CHN_026_angled_corner",
        "title": "Angled Corner Urban House",
        "source_card": "CHN_026",
        "category": "residential",
        "substyle": "angled_corner",
        "preferred_localities": ["Triplicane", "George Town"],
        "dimensions_m": {"width": 12.0, "depth": 18.0, "height": 8.4},
        "floors": 2,
        "shop_ground": False,
        "builder": build_chn_026_angled_corner,
    },
    {
        "id": "CHN_029_colonial_bungalow",
        "title": "British-Era Bungalow (Local)",
        "source_card": "CHN_029",
        "category": "residential",
        "substyle": "bungalow",
        "preferred_localities": ["Adyar", "Kilpauk", "Nungambakkam"],
        "dimensions_m": {"width": 18.0, "depth": 28.0, "height": 10.1},
        "floors": 2,
        "shop_ground": False,
        "builder": build_chn_029_colonial_bungalow,
    },
    {
        "id": "CHN_030_thinnai_house",
        "title": "Traditional House with Thinnai",
        "source_card": "CHN_030",
        "category": "residential",
        "substyle": "thinnai",
        "preferred_localities": ["Mylapore", "Triplicane"],
        "dimensions_m": {"width": 9.0, "depth": 16.0, "height": 5.8},
        "floors": 1,
        "shop_ground": False,
        "builder": build_chn_030_thinnai_house,
    },
    {
        "id": "CHN_036_tenement_1f",
        "title": "Worker's Tenement House",
        "source_card": "CHN_036",
        "category": "north_chennai",
        "substyle": "tenement_1f",
        "preferred_localities": ["Washermanpet", "Tondiarpet"],
        "dimensions_m": {"width": 5.0, "depth": 12.0, "height": 5.0},
        "floors": 1,
        "shop_ground": False,
        "builder": build_chn_036_tenement_1f,
    },
    {
        "id": "B03_modern_indep",
        "title": "Modern Independent House",
        "source_card": "03",
        "category": "residential",
        "substyle": "modern_independent",
        "preferred_localities": ["Anna Nagar", "Adyar", "Besant Nagar"],
        "dimensions_m": {"width": 10.0, "depth": 15.0, "height": 8.95},
        "floors": 2,
        "shop_ground": False,
        "builder": build_b03_modern_indep,
    },
    {
        "id": "B04_compact_urban",
        "title": "Compact Urban House",
        "source_card": "04",
        "category": "residential",
        "substyle": "compact_urban",
        "preferred_localities": ["Velachery", "Ashok Nagar", "Kodambakkam"],
        "dimensions_m": {"width": 6.0, "depth": 12.0, "height": 8.85},
        "floors": 2,
        "shop_ground": False,
        "builder": build_b04_compact_urban,
    },
    {
        "id": "B05_duplex_house",
        "title": "Duplex House (Chennai Style)",
        "source_card": "05",
        "category": "residential",
        "substyle": "duplex",
        "preferred_localities": ["Anna Nagar", "Adyar", "Thiruvanmiyur"],
        "dimensions_m": {"width": 12.0, "depth": 16.0, "height": 9.45},
        "floors": 2,
        "shop_ground": False,
        "builder": build_b05_duplex_house,
    },
    {
        "id": "B06_apt_lowrise",
        "title": "Apartment (Low-Rise)",
        "source_card": "06",
        "category": "residential",
        "substyle": "apartment_low",
        "preferred_localities": ["Velachery", "Thiruvanmiyur", "Adyar"],
        "dimensions_m": {"width": 15.0, "depth": 18.0, "height": 11.85},
        "floors": 3,
        "shop_ground": False,
        "builder": build_b06_apt_lowrise,
    },
    {
        "id": "B07_apt_midrise",
        "title": "Mid-Rise Apartment",
        "source_card": "07",
        "category": "residential",
        "substyle": "apartment_mid",
        "preferred_localities": ["Anna Nagar", "Velachery", "Adyar"],
        "dimensions_m": {"width": 18.0, "depth": 24.0, "height": 15.45},
        "floors": 4,
        "shop_ground": False,
        "builder": build_b07_apt_midrise,
    },
    {
        "id": "B08_gated_block",
        "title": "Gated Residential Block",
        "source_card": "08",
        "category": "residential",
        "substyle": "gated_apartment",
        "preferred_localities": ["OMR", "Velachery", "Anna Nagar"],
        "dimensions_m": {"width": 30.0, "depth": 40.0, "height": 17.9},
        "floors": 5,
        "shop_ground": False,
        "builder": build_b08_gated_block,
    },
    {
        "id": "B10_modern_townhouse",
        "title": "Modern Townhouse",
        "source_card": "10",
        "category": "residential",
        "substyle": "modern_townhouse",
        "preferred_localities": ["Adyar", "Besant Nagar", "Anna Nagar"],
        "dimensions_m": {"width": 9.0, "depth": 14.0, "height": 12.05},
        "floors": 3,
        "shop_ground": False,
        "builder": build_b10_modern_townhouse,
    },
    {
        "id": "B42_highrise_apt",
        "title": "Premium Apartment (High-Rise)",
        "source_card": "42",
        "category": "residential",
        "substyle": "apartment_highrise",
        "preferred_localities": ["OMR", "Anna Nagar", "Adyar"],
        "dimensions_m": {"width": 32.0, "depth": 48.0, "height": 52.0},
        "floors": 16,
        "shop_ground": False,
        "builder": build_b42_highrise_apt,
    },
    {
        "id": "K08_tnhb_block",
        "title": "Corporation Apartment (TNHB)",
        "source_card": "K08",
        "category": "residential",
        "substyle": "tnhb_block",
        "preferred_localities": ["Anna Nagar", "Ashok Nagar", "Perambur"],
        "dimensions_m": {"width": 16.0, "depth": 34.0, "height": 15.3},
        "floors": 4,
        "shop_ground": False,
        "builder": build_k08_tnhb_block,
    },
    {
        "id": "CHN_041_contemp_indep",
        "title": "Contemporary Independent House",
        "source_card": "CHN_041",
        "category": "residential",
        "substyle": "contemp_indep",
        "preferred_localities": ["Anna Nagar", "Adyar", "Besant Nagar"],
        "dimensions_m": {"width": 12.0, "depth": 18.0, "height": 9.15},
        "floors": 2,
        "shop_ground": False,
        "builder": build_chn_041_contemp_indep,
    },
    {
        "id": "CHN_043_duplex_pergola",
        "title": "Duplex House with Pergola",
        "source_card": "CHN_043",
        "category": "residential",
        "substyle": "duplex_pergola",
        "preferred_localities": ["Anna Nagar", "Thiruvanmiyur"],
        "dimensions_m": {"width": 12.0, "depth": 16.0, "height": 9.35},
        "floors": 2,
        "shop_ground": False,
        "builder": build_chn_043_duplex_pergola,
    },
    {
        "id": "CHN_044_terrace_modern",
        "title": "Terrace Modern House (3F)",
        "source_card": "CHN_044",
        "category": "residential",
        "substyle": "terrace_modern",
        "preferred_localities": ["Velachery", "Anna Nagar"],
        "dimensions_m": {"width": 10.0, "depth": 16.0, "height": 11.7},
        "floors": 3,
        "shop_ground": False,
        "builder": build_chn_044_terrace_modern,
    },
    {
        "id": "CHN_045_corner_modern",
        "title": "Corner Plot House (Modern)",
        "source_card": "CHN_045",
        "category": "residential",
        "substyle": "corner_modern",
        "preferred_localities": ["Anna Nagar", "Adyar"],
        "dimensions_m": {"width": 14.0, "depth": 20.0, "height": 9.25},
        "floors": 2,
        "shop_ground": False,
        "builder": build_chn_045_corner_modern,
    },
    {
        "id": "CHN_046_gated_villa",
        "title": "Gated Villa (Individual)",
        "source_card": "CHN_046",
        "category": "residential",
        "substyle": "villa",
        "preferred_localities": ["ECR", "Adyar", "Anna Nagar"],
        "dimensions_m": {"width": 16.0, "depth": 24.0, "height": 9.35},
        "floors": 2,
        "shop_ground": False,
        "builder": build_chn_046_gated_villa,
    },
    {
        "id": "CHN_047_row_modern",
        "title": "Row House (Modern)",
        "source_card": "CHN_047",
        "category": "residential",
        "substyle": "row_modern",
        "preferred_localities": ["Velachery", "OMR"],
        "dimensions_m": {"width": 6.0, "depth": 14.0, "height": 8.85},
        "floors": 2,
        "shop_ground": False,
        "builder": build_chn_047_row_modern,
    },
    {
        "id": "CHN_048_small_apt",
        "title": "Small Apartment (4 Units)",
        "source_card": "CHN_048",
        "category": "residential",
        "substyle": "small_apt",
        "preferred_localities": ["Ashok Nagar", "Velachery", "Adyar"],
        "dimensions_m": {"width": 12.0, "depth": 18.0, "height": 11.75},
        "floors": 3,
        "shop_ground": False,
        "builder": build_chn_048_small_apt,
    },
]


def verify_glb(glb_path: Path) -> Dict[str, Dict[str, int]]:
    """Validate GLB magic, version, COLOR_0 vertex colors, nodes, and extract lod_stats."""
    data = glb_path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError(f"{glb_path.name}: invalid GLB magic")
    version, total_len = struct.unpack_from("<II", data, 4)
    if version != 2 or total_len != len(data):
        raise ValueError(f"{glb_path.name}: invalid GLB header version={version} len={total_len}/{len(data)}")
    c0_len, c0_type = struct.unpack_from("<II", data, 12)
    if c0_type != 0x4E4F534A:
        raise ValueError(f"{glb_path.name}: missing JSON chunk")
    json_raw = data[20 : 20 + c0_len].decode("utf-8")
    gltf = json.loads(json_raw)
    accessors = gltf.get("accessors", [])
    meshes = gltf.get("meshes", [])
    nodes = gltf.get("nodes", [])

    stats: Dict[str, Dict[str, int]] = {}
    for node in nodes:
        if "mesh" not in node:
            continue
        name = node.get("name", "")
        mesh = meshes[node["mesh"]]
        v_sum = 0
        t_sum = 0
        for prim in mesh.get("primitives", []):
            attrs = prim.get("attributes", {})
            if "POSITION" not in attrs:
                raise ValueError(f"{glb_path.name}:{name}: missing POSITION")
            if name.startswith("LOD") and "COLOR_0" not in attrs:
                raise ValueError(f"{glb_path.name}:{name}: missing COLOR_0 vertex color attribute")
            v_sum += accessors[attrs["POSITION"]]["count"]
            if "indices" in prim:
                t_sum += accessors[prim["indices"]]["count"] // 3
            else:
                t_sum += accessors[attrs["POSITION"]]["count"] // 3
        stats[name] = {"verts": v_sum, "tris": t_sum}

    for req in ("LOD0", "LOD1", "LOD2", "COL_Main"):
        if req not in stats:
            raise ValueError(f"{glb_path.name}: missing required node {req} (got {list(stats.keys())})")
    return stats


def main() -> None:
    results: List[Dict[str, Any]] = []
    for spec in SPECS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mat = make_vertex_material()
        builder: Callable[[int], Tuple[MeshAcc, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]]] = spec["builder"]
        acc0, cols = builder(0)
        acc1, _ = builder(1)
        acc2, _ = builder(2)

        out_glb = PACK_DIR / f"{spec['id']}.glb"
        export_glb_scene(out_glb, mat, (acc0, acc1, acc2), cols)

        lod_stats = verify_glb(out_glb)
        glb_bytes = out_glb.stat().st_size
        entry = {
            "id": spec["id"],
            "title": spec["title"],
            "source_card": spec["source_card"],
            "category": spec["category"],
            "substyle": spec["substyle"],
            "preferred_localities": spec["preferred_localities"],
            "dimensions_m": spec["dimensions_m"],
            "floors": spec["floors"],
            "shop_ground": spec["shop_ground"],
            "glb_path": f"res://assets/buildings/pack_100/{spec['id']}.glb",
            "glb_bytes": glb_bytes,
            "lod_stats": lod_stats,
        }
        results.append(entry)
        print(
            f"[OK] {spec['id']:26s} | bytes={glb_bytes:7d} | "
            f"LOD0={lod_stats['LOD0']['tris']:4d}t | "
            f"LOD1={lod_stats['LOD1']['tris']:4d}t | "
            f"LOD2={lod_stats['LOD2']['tris']:3d}t"
        )

    META_PATH.write_text(json.dumps({"count": len(results), "models": results}, indent=2), encoding="utf-8")
    print(f"SHARD_2_DONE count={len(results)} meta={META_PATH}")


if __name__ == "__main__":
    main()
