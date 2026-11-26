#!/usr/bin/env python3
"""Blender 5.x shard_1 builder: 20 Traditional Chennai House archetypes into pack_100.

Usage:
    /opt/homebrew/bin/blender -b --factory-startup --python godot-chennai/tools/blender/buildings/shard_1.py
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path
from typing import Callable, Dict, List, Sequence, Tuple

import bmesh
import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parents[2]
OUT_DIR = ROOT_DIR / "assets" / "buildings" / "pack_100"
META_PATH = SCRIPT_DIR / "shard_1_meta.json"

sys.path.insert(0, str(SCRIPT_DIR))
from chennai_kit import (  # noqa: E402
    MeshAcc,
    PAL,
    add_clay_tile_canopy,
    add_compound_fence,
    add_parapet_with_jaali,
    add_rooftop_props,
    add_window,
    export_glb_scene,
    make_vertex_material,
)


# ---------------------------------------------------------------------------
# Reusable Architectural Helpers for Shard 1
# ---------------------------------------------------------------------------

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
    with_hood: bool = False,
) -> None:
    """Place a recessed/framed double-leaf timber door with lintel and optional canopy hood."""
    nx, ny = face_dir
    if abs(ny) >= abs(nx):
        s = ny
        acc.box((cx, y_wall + s * 0.02, z_base + 0.5 * dh), (dw + 0.14, 0.10, dh + 0.08), frame_col)
        acc.box((cx - 0.24 * dw, y_wall + s * 0.055, z_base + 0.48 * dh), (0.44 * dw, 0.04, dh - 0.10), leaf_col)
        acc.box((cx + 0.24 * dw, y_wall + s * 0.055, z_base + 0.48 * dh), (0.44 * dw, 0.04, dh - 0.10), leaf_col)
        acc.box((cx, y_wall + s * 0.09, z_base + dh + 0.08), (dw + 0.28, 0.18, 0.10), trim_col)
        if lod == 0:
            acc.box((cx, y_wall + s * 0.08, z_base + 0.48 * dh), (0.06, 0.04, dh - 0.06), frame_col)
            acc.box((cx, y_wall + s * 0.07, z_base + dh - 0.14), (dw - 0.12, 0.04, 0.16), PAL["recess"])
            for lx in (cx - 0.24 * dw, cx + 0.24 * dw):
                acc.box((lx, y_wall + s * 0.08, z_base + 0.34 * dh), (0.28 * dw, 0.02, 0.42 * dh), frame_col)
        if with_hood and lod < 2:
            acc.box((cx, y_wall + s * 0.34, z_base + dh + 0.18), (dw + 0.45, 0.68, 0.09), PAL["tile_red"], rot_x=s * 0.26)
    else:
        s = nx
        acc.box((y_wall + s * 0.02, cx, z_base + 0.5 * dh), (0.10, dw + 0.14, dh + 0.08), frame_col)
        acc.box((y_wall + s * 0.055, cx - 0.24 * dw, z_base + 0.48 * dh), (0.04, 0.44 * dw, dh - 0.10), leaf_col)
        acc.box((y_wall + s * 0.055, cx + 0.24 * dw, z_base + 0.48 * dh), (0.04, 0.44 * dw, dh - 0.10), leaf_col)
        acc.box((y_wall + s * 0.09, cx, z_base + dh + 0.08), (0.18, dw + 0.28, 0.10), trim_col)


def add_side_window(
    acc: MeshAcc,
    x_wall: float,
    cy: float,
    cz: float,
    ww: float,
    wh: float,
    sgn_x: float,
    frame_col: Tuple[float, float, float, float],
    pane_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
    with_grille: bool = True,
) -> None:
    """Place a sculpted window on +X (sgn_x=+1) or -X (sgn_x=-1) wall."""
    add_window(acc, cy, x_wall, cz, ww, wh, (sgn_x, 0.0), frame_col, pane_col, trim_col, with_chajja=(lod == 0), with_grille=with_grille, lod=lod)
    if lod == 0:
        acc.box((x_wall + sgn_x * 0.07, cy, cz), (0.04, 0.06, wh - 0.06), frame_col)
        if with_grille:
            for frac in (-0.25, 0.0, 0.25):
                acc.box((x_wall + sgn_x * 0.075, cy, cz + frac * wh), (0.025, ww - 0.12, 0.025), PAL["iron"])


def add_pot_plant(acc: MeshAcc, px: float, py: float, pz: float = 0.0, scale: float = 1.0, lod: int = 0) -> None:
    if lod >= 2:
        return
    acc.cyl((px, py, pz + 0.18 * scale), 0.13 * scale, 0.19 * scale, 0.36 * scale, PAL["pot"], segs=8 if lod == 0 else 6)
    acc.sphere((px, py, pz + 0.48 * scale), 0.22 * scale, PAL["foliage"], subdiv=1)
    if lod == 0:
        acc.sphere((px - 0.08 * scale, py - 0.04 * scale, pz + 0.43 * scale), 0.15 * scale, PAL["foliage_hi"], subdiv=1)
        acc.sphere((px + 0.08 * scale, py + 0.05 * scale, pz + 0.45 * scale), 0.14 * scale, PAL["foliage"], subdiv=1)


def add_teak_pillar(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z_base: float,
    h: float,
    r: float,
    base_col: Tuple[float, float, float, float],
    shaft_col: Tuple[float, float, float, float],
    cap_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Turned Chettinad/Agraharam wooden column with masonry pedestal and bracket capital."""
    ped_h = min(0.42, 0.18 * h)
    cap_h = min(0.24, 0.10 * h)
    shaft_h = max(0.2, h - ped_h - cap_h)
    if lod == 0:
        acc.box((cx, cy, z_base + 0.5 * ped_h), (2.5 * r, 2.5 * r, ped_h), base_col)
        acc.cyl((cx, cy, z_base + ped_h + 0.5 * shaft_h), r * 1.08, r * 0.86, shaft_h, shaft_col, segs=6)
        acc.box((cx, cy, z_base + ped_h + shaft_h + 0.5 * cap_h), (3.1 * r, 2.3 * r, cap_h), cap_col)
        acc.box((cx, cy, z_base + ped_h + 0.06), (2.7 * r, 2.7 * r, 0.08), cap_col)
    else:
        acc.box((cx, cy, z_base + 0.5 * h), (1.9 * r, 1.9 * r, h), shaft_col)
        acc.box((cx, cy, z_base + h - 0.5 * cap_h), (2.8 * r, 2.1 * r, cap_h), cap_col)


def add_arch_spandrel_xz(
    acc: MeshAcc,
    cx: float,
    y_mid: float,
    z_spring: float,
    z_top: float,
    radius: float,
    thick_y: float,
    segs: int,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Extruded spandrel block above a semicircular arch opening in XZ plane (facing -Y)."""
    hy = 0.5 * thick_y
    half_s = segs // 2
    segs = max(4, half_s * 2)

    def _build_side(x_sign: int, i_start: int, i_end: int) -> None:
        corner_x = cx + x_sign * radius
        pts_f = [acc.bm.verts.new((corner_x, y_mid - hy, z_top))]
        pts_b = [acc.bm.verts.new((corner_x, y_mid + hy, z_top))]
        if x_sign > 0:
            pts_f.append(acc.bm.verts.new((cx, y_mid - hy, z_top)))
            pts_b.append(acc.bm.verts.new((cx, y_mid + hy, z_top)))
        for i in range(i_start, i_end + 1):
            ang = math.pi * i / segs
            vx = cx + radius * math.cos(ang)
            vz = z_spring + radius * math.sin(ang)
            pts_f.append(acc.bm.verts.new((vx, y_mid - hy, vz)))
            pts_b.append(acc.bm.verts.new((vx, y_mid + hy, vz)))
        if x_sign < 0:
            pts_f.append(acc.bm.verts.new((cx, y_mid - hy, z_top)))
            pts_b.append(acc.bm.verts.new((cx, y_mid + hy, z_top)))
        faces = [acc.bm.faces.new(pts_f), acc.bm.faces.new(list(reversed(pts_b)))]
        n = len(pts_f)
        for i in range(n):
            j = (i + 1) % n
            faces.append(acc.bm.faces.new([pts_f[j], pts_f[i], pts_b[i], pts_b[j]]))
        bmesh.ops.recalc_face_normals(acc.bm, faces=faces)
        acc._paint(faces, wall_col)

    _build_side(+1, 0, segs // 2)
    _build_side(-1, segs // 2, segs)
    if lod == 0:
        # Proud voussoir trim blocks along arch ring
        for i in range(1, segs):
            ang = math.pi * i / segs
            vx = cx + (radius + 0.04) * math.cos(ang)
            vz = z_spring + (radius + 0.04) * math.sin(ang)
            acc.box((vx, y_mid - hy - 0.02, vz), (0.11, 0.06, 0.11), trim_col, rot_y=ang - 0.5 * math.pi)


def add_arch_colonnade(
    acc: MeshAcc,
    pier_xs: Sequence[float],
    y_mid: float,
    z_base: float,
    pier_h: float,
    top_h: float,
    pier_w: float,
    thick_y: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Create a row of masonry piers connected by real open semicircular arches."""
    for px in pier_xs:
        acc.box((px, y_mid, z_base + 0.5 * (pier_h + top_h)), (pier_w, thick_y, pier_h + top_h), wall_col)
        if lod < 2:
            acc.box((px, y_mid, z_base + 0.14), (pier_w + 0.08, thick_y + 0.08, 0.28), trim_col)
            acc.box((px, y_mid, z_base + pier_h), (pier_w + 0.10, thick_y + 0.10, 0.10), trim_col)
    for i in range(len(pier_xs) - 1):
        x0 = pier_xs[i] + 0.5 * pier_w
        x1 = pier_xs[i + 1] - 0.5 * pier_w
        cx = 0.5 * (x0 + x1)
        rad = 0.5 * (x1 - x0)
        z_spring = z_base + pier_h - rad
        z_top = z_base + pier_h + top_h
        if lod < 2:
            add_arch_spandrel_xz(acc, cx, y_mid, z_spring, z_top, rad, thick_y, 8 if lod == 0 else 4, wall_col, trim_col, lod=lod)
        else:
            acc.box((cx, y_mid, z_base + pier_h + 0.5 * top_h), (2.0 * rad, thick_y, top_h), wall_col)


def add_tiled_hip_roof(
    acc: MeshAcc,
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    z0: float,
    ridge_h: float,
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
    tile_step: float = 0.34,
) -> None:
    """Hipped Mangalore clay-tile roof with ridge cap, fascia eaves, and 3D barrel-tile ribs on LOD0."""
    w, d = x1 - x0, y1 - y0
    acc.pitched_roof(x0, x1, y0, y1, z0, ridge_h, PAL["tile_red"], PAL["tile_dark"], hip=True)
    ins = min(w, d) * 0.30
    zt = z0 + ridge_h
    if lod < 2:
        # Eaves fascia + ridge cap
        acc.box((0.5 * (x0 + x1), y0 + 0.05, z0 - 0.03), (w + 0.06, 0.10, 0.12), PAL["teak_dark"])
        acc.box((0.5 * (x0 + x1), y1 - 0.05, z0 - 0.03), (w + 0.06, 0.10, 0.12), PAL["teak_dark"])
        acc.box((0.5 * (x0 + x1), 0.5 * (y0 + y1), zt + 0.06), (max(0.4, w - 2 * ins + 0.16), max(0.4, d - 2 * ins + 0.16), 0.12), PAL["tile_ridge"])
    if lod == 0:
        # 3D barrel tile ribs on the front (-Y) and rear (+Y) hip slopes
        span_y = ins
        pitch = math.atan2(ridge_h, span_y)
        rlen = math.hypot(span_y, ridge_h)
        nx = max(6, min(36, int((w - 2 * ins) / tile_step)))
        dx = (w - 2 * ins) / max(1, nx)
        for i in range(nx):
            tx = x0 + ins + (i + 0.5) * dx
            acc.cyl((tx, y0 + 0.5 * span_y, z0 + 0.5 * ridge_h + 0.04), 0.065, 0.065, rlen, PAL["tile_ridge"], segs=5, rot_x=math.pi * 0.5 + pitch)
            acc.cyl((tx, y1 - 0.5 * span_y, z0 + 0.5 * ridge_h + 0.04), 0.065, 0.065, rlen, PAL["tile_ridge"], segs=5, rot_x=math.pi * 0.5 - pitch)
        # Hip corner ridge tiles
        for sx in (-1, 1):
            for sy in (-1, 1):
                hx0 = x0 if sx < 0 else x1
                hx1 = x0 + ins if sx < 0 else x1 - ins
                hy0 = y0 if sy < 0 else y1
                hy1 = y0 + ins if sy < 0 else y1 - ins
                hcx, hcy = 0.5 * (hx0 + hx1), 0.5 * (hy0 + hy1)
                acc.box((hcx, hcy, z0 + 0.5 * ridge_h + 0.06), (0.14, 0.14, 0.14), PAL["tile_ridge"])


def add_tiled_gable_roof(
    acc: MeshAcc,
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    z0: float,
    ridge_h: float,
    gable_col: Tuple[float, float, float, float],
    lod: int = 0,
    tile_step: float = 0.34,
) -> None:
    """Pitched gable Mangalore clay-tile roof with ridge cap and 3D barrel ribs on LOD0."""
    w, d = x1 - x0, y1 - y0
    acc.pitched_roof(x0, x1, y0, y1, z0, ridge_h, PAL["tile_red"], gable_col, hip=False)
    cx, cy = 0.5 * (x0 + x1), 0.5 * (y0 + y1)
    if lod < 2:
        if d >= w:
            acc.box((cx, cy, z0 + ridge_h + 0.05), (0.16, d + 0.10, 0.12), PAL["tile_ridge"])
            acc.box((x0 + 0.04, cy, z0 - 0.04), (0.08, d + 0.06, 0.12), PAL["teak_dark"])
            acc.box((x1 - 0.04, cy, z0 - 0.04), (0.08, d + 0.06, 0.12), PAL["teak_dark"])
        else:
            acc.box((cx, cy, z0 + ridge_h + 0.05), (w + 0.10, 0.16, 0.12), PAL["tile_ridge"])
            acc.box((cx, y0 + 0.04, z0 - 0.04), (w + 0.06, 0.08, 0.12), PAL["teak_dark"])
            acc.box((cx, y1 - 0.04, z0 - 0.04), (w + 0.06, 0.08, 0.12), PAL["teak_dark"])
    if lod == 0:
        if d >= w:
            pitch = math.atan2(ridge_h, 0.5 * w)
            rlen = math.hypot(0.5 * w, ridge_h)
            ny = max(6, min(28, int(d / tile_step)))
            dy = (d - 0.16) / ny
            for i in range(ny):
                ty = y0 + 0.08 + (i + 0.5) * dy
                acc.cyl((x0 + 0.25 * w, ty, z0 + 0.5 * ridge_h + 0.04), 0.065, 0.065, rlen, PAL["tile_ridge"], segs=5, rot_y=0.5 * math.pi - pitch)
                acc.cyl((x1 - 0.25 * w, ty, z0 + 0.5 * ridge_h + 0.04), 0.065, 0.065, rlen, PAL["tile_ridge"], segs=5, rot_y=0.5 * math.pi + pitch)
        else:
            pitch = math.atan2(ridge_h, 0.5 * d)
            rlen = math.hypot(0.5 * d, ridge_h)
            nx = max(6, min(28, int(w / tile_step)))
            dx = (w - 0.16) / nx
            for i in range(nx):
                tx = x0 + 0.08 + (i + 0.5) * dx
                acc.cyl((tx, y0 + 0.25 * d, z0 + 0.5 * ridge_h + 0.04), 0.065, 0.065, rlen, PAL["tile_ridge"], segs=5, rot_x=0.5 * math.pi + pitch)
                acc.cyl((tx, y1 - 0.25 * d, z0 + 0.5 * ridge_h + 0.04), 0.065, 0.065, rlen, PAL["tile_ridge"], segs=5, rot_x=0.5 * math.pi - pitch)


def add_stepped_crest(
    acc: MeshAcc,
    cx: float,
    y_par: float,
    z_top: float,
    crest_w: float,
    rad: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    accent_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> float:
    """Ornate Chennai stepped arched crest with medallion & finials."""
    acc.box((cx, y_par, z_top + 0.12), (crest_w, 0.26, 0.24), wall_col)
    if lod < 2:
        acc.box((cx - 0.38 * crest_w, y_par, z_top + 0.30), (0.24 * crest_w, 0.28, 0.16), trim_col)
        acc.box((cx + 0.38 * crest_w, y_par, z_top + 0.30), (0.24 * crest_w, 0.28, 0.16), trim_col)
    acc.arch_slab(cx, y_par, z_top + 0.22, 0.28, rad, 12 if lod == 0 else (6 if lod == 1 else 4), wall_col)
    if lod < 2:
        acc.arch_slab(cx, y_par - 0.04, z_top + 0.22, 0.12, rad + 0.08, 12 if lod == 0 else 6, trim_col)
        acc.cyl((cx, y_par, z_top + 0.22 + rad + 0.14), 0.06, 0.02, 0.22, trim_col, segs=6)
    if lod == 0:
        acc.cyl((cx, y_par - 0.16, z_top + 0.32), rad * 0.42, rad * 0.42, 0.06, accent_col, segs=12, rot_x=0.5 * math.pi)
        acc.cyl((cx, y_par - 0.19, z_top + 0.32), rad * 0.26, rad * 0.26, 0.05, trim_col, segs=12, rot_x=0.5 * math.pi)
    return z_top + 0.22 + rad + 0.25


def add_corner_quoins(
    acc: MeshAcc,
    x_corner: float,
    y_corner: float,
    sx: float,
    sy: float,
    z0: float,
    z1: float,
    col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    if lod >= 1:
        return
    step = 0.44
    n = max(3, int((z1 - z0) / step))
    dz = (z1 - z0) / n
    for i in range(n):
        qz = z0 + (i + 0.5) * dz
        long_x = (i % 2 == 0)
        qx_len = 0.52 if long_x else 0.30
        qy_len = 0.30 if long_x else 0.52
        acc.box((x_corner - sx * 0.5 * (qx_len - 0.08), y_corner - sy * 0.5 * (qy_len - 0.08), qz), (qx_len, qy_len, dz * 0.86), col)


def add_jaali_wing(
    acc: MeshAcc,
    x0: float,
    x1: float,
    y_p: float,
    z_base: float,
    par_h: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    shade_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    w = x1 - x0
    cx = 0.5 * (x0 + x1)
    acc.box((cx, y_p, z_base + par_h + 0.05), (w + 0.08, 0.26, 0.10), trim_col)
    if lod == 0:
        nb = max(3, int(w / 0.36))
        dx = w / nb
        for bi in range(nb):
            bx = x0 + (bi + 0.5) * dx
            acc.box((bx, y_p, z_base + 0.48 * par_h), (0.14, 0.18, par_h * 0.86), wall_col)
            acc.box((bx, y_p, z_base + 0.10), (0.20, 0.22, 0.12), shade_col)
    elif lod == 1:
        acc.box((cx, y_p, z_base + 0.5 * par_h), (w, 0.18, par_h * 0.88), shade_col)
    else:
        acc.box((cx, y_p, z_base + 0.5 * par_h), (w, 0.20, par_h), wall_col)


def add_ground_windows_row(
    acc: MeshAcc,
    xs: Sequence[float],
    y_wall: float,
    cz: float,
    ww: float,
    wh: float,
    face_dir: Tuple[float, float],
    frame_col: Tuple[float, float, float, float],
    pane_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
    arched: bool = False,
    with_chajja: bool = True,
) -> None:
    for wx in xs:
        add_window(acc, wx, y_wall, cz, ww, wh, face_dir, frame_col, pane_col, trim_col, with_chajja=(with_chajja and lod < 2), with_grille=(lod == 0), arched=arched, lod=lod)
        if lod == 0:
            s = face_dir[1]
            acc.box((wx - 0.25 * ww, y_wall + s * 0.06, cz), (0.42 * ww, 0.03, wh - 0.16), pane_col)
            acc.box((wx + 0.25 * ww, y_wall + s * 0.06, cz), (0.42 * ww, 0.03, wh - 0.16), pane_col)


# ---------------------------------------------------------------------------
# 20 Individual Building Builders
# ---------------------------------------------------------------------------

def _fix_parapet_at_y(
    acc: MeshAcc,
    w: float,
    y0: float,
    y1: float,
    z_eaves: float,
    parapet_h: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    shade_col: Tuple[float, float, float, float],
    pediment: bool = False,
    lod: int = 0,
    jaali_front: bool = True,
) -> float:
    """Perimeter cornice, surkhi roof slab, side/rear parapets, front jaali & optional arched crest at exact [y0, y1]."""
    d = y1 - y0
    yc = 0.5 * (y0 + y1)
    hw = 0.5 * w
    acc.box((0.0, yc, z_eaves + 0.08), (w + 0.24, d + 0.24, 0.16), trim_col)
    acc.box((0.0, yc, z_eaves + 0.05), (max(1.0, w - 0.5), max(1.0, d - 0.5), 0.08), PAL["surkhi"])
    acc.box((-hw + 0.12, yc, z_eaves + 0.16 + 0.5 * parapet_h), (0.22, d, parapet_h), wall_col)
    acc.box((+hw - 0.12, yc, z_eaves + 0.16 + 0.5 * parapet_h), (0.22, d, parapet_h), wall_col)
    acc.box((0.0, y1 - 0.12, z_eaves + 0.16 + 0.5 * parapet_h), (w, 0.22, parapet_h), wall_col)

    y_p = y0 + 0.12
    z_top = z_eaves + 0.16 + parapet_h
    if pediment and w >= 5.5:
        ped_hw = min(1.35, hw * 0.34)
        wing_w = max(0.5, hw - ped_hw - 0.18)
        for sx in (-1, 1):
            wx = sx * (ped_hw + 0.5 * wing_w)
            acc.box((sx * (hw - 0.15), y_p, z_eaves + 0.16 + 0.5 * parapet_h + 0.04), (0.30, 0.26, parapet_h + 0.08), wall_col)
            if jaali_front:
                add_jaali_wing(acc, wx - 0.5 * wing_w + 0.10, wx + 0.5 * wing_w - 0.10, y_p, z_eaves + 0.16, parapet_h, wall_col, trim_col, shade_col, lod=lod)
            else:
                acc.box((wx, y_p, z_eaves + 0.16 + 0.5 * parapet_h), (wing_w, 0.22, parapet_h), wall_col)
                acc.box((wx, y_p, z_top + 0.04), (wing_w + 0.08, 0.26, 0.10), trim_col)
        return add_stepped_crest(acc, 0.0, y_p, z_eaves + 0.16 + 0.5 * parapet_h, 2.0 * ped_hw, ped_hw * 0.65, wall_col, trim_col, shade_col, lod=lod)
    elif jaali_front and lod < 2:
        add_jaali_wing(acc, -hw + 0.24, hw - 0.24, y_p, z_eaves + 0.16, parapet_h, wall_col, trim_col, shade_col, lod=lod)
        return z_top + 0.10
    else:
        acc.box((0.0, y_p, z_eaves + 0.16 + 0.5 * parapet_h), (w, 0.22, parapet_h), wall_col)
        acc.box((0.0, y_p, z_top + 0.04), (w + 0.10, 0.26, 0.10), trim_col)
        return z_top + 0.10


# Re-implement build_B01_trad_house using _fix_parapet_at_y so parapet aligns perfectly with main block!
def build_B01_trad_house(lod: int) -> MeshAcc:
    """B01_trad_house: 8x12m 1F Traditional Chennai House."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 8.0, 12.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.16), (w, d, 0.32), PAL["plinth"])
        acc.box((0.0, 2.0, 1.95), (7.76, 7.1, 3.60), PAL["cream"])
        acc.box((0.0, -2.4, 1.35), (7.70, 2.0, 2.20), PAL["cream_shade"])
        acc.box((0.0, -2.4, 2.75), (7.86, 2.1, 0.24), PAL["tile_red"], rot_x=0.35)
        acc.box((0.0, 2.0, 3.76), (7.96, 7.3, 0.20), PAL["cream_trim"])
        acc.box((0.0, -1.46, 4.18), (7.76, 0.26, 0.72), PAL["cream"])
        acc.arch_slab(0.0, -1.46, 4.50, 0.28, 0.88, 6, PAL["cream"])
        return acc

    acc.box((0.0, 0.0, 0.06), (w, d, 0.12), PAL["plinth"])
    acc.box((0.0, -3.5, 0.12), (7.6, 3.8, 0.08), PAL["pavement"])
    acc.box((0.0, -2.25, 0.22), (7.70, 1.80, 0.44), PAL["plinth"])
    acc.box((0.0, -3.32, 0.14), (1.80, 0.36, 0.28), PAL["plinth"])
    acc.box((0.0, -3.62, 0.08), (1.80, 0.30, 0.16), PAL["plinth"])
    add_compound_fence(acc, w, -5.60, -1.45, PAL["cream"], PAL["cream_trim"], lod=lod)
    if lod == 0:
        for px in (-1.22, 1.22):
            acc.box((px, -5.60, 1.76), (0.14, 0.14, 0.16), PAL["iron"])
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 1.48, -3.45, 0.16, 0.92, lod=0)

    y_ver = -3.05
    for sx in (-1, 1):
        acc.box((sx * 2.42, y_ver, 0.66), (2.75, 0.18, 0.44), PAL["cream"])
        if lod == 0:
            acc.box((sx * 2.42, y_ver, 1.18), (2.70, 0.04, 0.04), PAL["iron"])
            for bi in range(7):
                acc.cyl((sx * 2.42 - 1.2 + bi * 0.40, y_ver, 1.03), 0.015, 0.015, 0.30, PAL["iron"], segs=6)
    for cx in (-3.68, -1.05, 1.05, 3.68):
        acc.box((cx, y_ver, 1.48), (0.28, 0.28, 2.10), PAL["cream"])
        acc.box((cx, y_ver, 2.50), (0.34, 0.34, 0.10), PAL["cream_trim"])

    acc.box((0.0, 2.15, 1.84), (7.76, 6.80, 3.68), PAL["cream"])
    y_fac = -1.39
    for px, pw in ((-3.42, 0.94), (-1.14, 1.04), (1.14, 1.04), (3.42, 0.94)):
        acc.box((px, y_fac, 2.06), (pw, 0.28, 3.24), PAL["cream"])
    for wx in (-2.30, 2.30):
        acc.box((wx, y_fac, 0.77), (1.32, 0.28, 0.66), PAL["cream"])
        acc.box((wx, y_fac, 3.08), (1.32, 0.28, 1.20), PAL["cream"])
    acc.box((0.0, y_fac, 3.12), (1.26, 0.28, 1.12), PAL["cream"])

    add_door(acc, 0.0, -1.30, 0.44, 1.12, 2.04, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_ground_windows_row(acc, (-2.30, 2.30), -1.32, 1.79, 1.20, 1.28, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (0.6, 3.2):
            add_side_window(acc, sgn * 3.88, wy, 1.82, 1.18, 1.26, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_door(acc, -1.6, 5.55, 0.44, 1.0, 1.98, (0.0, 1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_window(acc, 1.8, 5.55, 1.80, 1.20, 1.22, (0.0, 1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    add_clay_tile_canopy(acc, 7.86, -3.38, -1.45, 2.38, 3.22, PAL["cream_trim"], lod=lod)
    _fix_parapet_at_y(acc, 7.84, -1.55, 5.56, 3.68, 0.72, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    if lod == 0:
        acc.box((-2.2, 4.5, 4.18), (1.75, 1.85, 0.92), PAL["cream"])
        acc.box((-2.2, 4.5, 4.68), (1.92, 2.02, 0.10), PAL["tile_red"])
        acc.cyl((2.1, 4.6, 4.10), 0.46, 0.46, 0.72, PAL["tank"], segs=10)
    return acc


def build_B02_old_residential(lod: int) -> MeshAcc:
    """B02_old_residential: 10x14m 2F Old Chennai Residential with arched upper bay window & moulded brackets."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 14.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.20), (w, d, 0.40), PAL["plinth"])
        acc.box((0.0, 0.6, 3.40), (9.4, 11.8, 6.20), PAL["cream_shade"])
        acc.box((0.0, -5.6, 4.70), (2.6, 1.0, 2.20), PAL["cream"])
        acc.box((0.0, 0.6, 6.60), (9.8, 12.2, 0.24), PAL["cream_trim"])
        acc.box((0.0, 0.6, 7.05), (9.5, 11.9, 0.72), PAL["cream_shade"])
        return acc

    y0, y1 = -5.2, 6.6
    yc = 0.5 * (y0 + y1)
    bd = y1 - y0
    acc.box((0.0, 0.0, 0.14), (w - 0.1, d - 0.2, 0.28), PAL["plinth"])
    acc.box((0.0, -5.75, 0.16), (2.4, 1.2, 0.32), PAL["plinth"])
    acc.box((0.0, -6.45, 0.08), (2.4, 0.45, 0.16), PAL["plinth"])

    # Main 2F block
    acc.box((0.0, yc, 3.48), (9.4, bd, 6.40), PAL["cream_shade"])
    # Corner pilasters + weathered string-course bands
    for sx in (-1, 1):
        acc.box((sx * 4.62, y0 - 0.04, 3.48), (0.36, 0.16, 6.40), PAL["cream"])
        acc.box((sx * 1.65, y0 - 0.04, 1.90), (0.28, 0.14, 3.10), PAL["cream"])
    acc.box((0.0, yc, 3.55), (9.76, bd + 0.28, 0.22), PAL["cream_trim"])
    acc.box((0.0, y0 - 0.08, 3.40), (9.80, 0.22, 0.12), PAL["plinth"])

    # Ground floor timber paneled door + flanking barred windows
    add_door(acc, 0.0, y0, 0.28, 1.32, 2.28, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod, with_hood=True)
    add_ground_windows_row(acc, (-3.15, 3.15), y0, 1.82, 1.34, 1.42, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)

    # Upper projecting arched bay window supported on moulded brackets
    bay_y = y0 - 0.48
    acc.box((0.0, bay_y, 3.72), (2.72, 1.04, 0.20), PAL["cream_trim"])
    for bx in (-1.05, 0.0, 1.05):
        acc.box((bx, y0 - 0.36, 3.46), (0.22, 0.68, 0.38), PAL["cream"])
        if lod == 0:
            acc.box((bx, y0 - 0.46, 3.30), (0.16, 0.42, 0.22), PAL["cream_shade"])
    # Bay walls & 3 windows with arch + grille bars
    acc.box((0.0, bay_y, 4.92), (2.60, 0.96, 2.20), PAL["cream"])
    add_window(acc, 0.0, bay_y - 0.48, 4.96, 1.38, 1.34, (0.0, -1.0), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=False, with_grille=(lod == 0), arched=True, lod=lod)
    for sx in (-1.0, 1.0):
        add_side_window(acc, sx * 1.30, bay_y, 4.96, 0.66, 1.24, sx, PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
    acc.arch_slab(0.0, bay_y - 0.04, 5.95, 1.04, 1.36, 10 if lod == 0 else 6, PAL["cream_trim"])

    # Flanking 2F windows
    add_ground_windows_row(acc, (-3.15, 3.15), y0, 4.96, 1.32, 1.42, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (-2.5, 0.8, 4.0):
            add_side_window(acc, sgn * 4.70, wy, 1.82, 1.18, 1.32, sgn, PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
            add_side_window(acc, sgn * 4.70, wy, 4.96, 1.18, 1.32, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Weathered cornice parapet + brackets + rooftop props
    _fix_parapet_at_y(acc, 9.48, y0, y1, 6.68, 0.82, PAL["cream_shade"], PAL["cream_trim"], PAL["plinth"], pediment=False, lod=lod, jaali_front=True)
    if lod == 0:
        for dx in range(-4, 5):
            acc.box((dx * 1.05, y0 - 0.14, 6.62), (0.14, 0.22, 0.18), PAL["cream"])
        acc.box((-2.2, 4.6, 7.36), (1.9, 2.0, 1.2), PAL["cream_shade"])
        acc.box((-2.2, 4.6, 8.00), (2.1, 2.2, 0.12), PAL["tile_red"])
        acc.cyl((2.2, 4.6, 7.45), 0.55, 0.55, 1.05, PAL["tank"], segs=10)
    return acc


def build_B36_chettinad_house(lod: int) -> MeshAcc:
    """B36_chettinad_house: 15x25m 2F Traditional Tamil House (Chettinad)."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 15.0, 25.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.22), (w - 0.4, d - 0.6, 0.44), PAL["red_dark"])
        acc.box((0.0, 2.0, 2.0), (14.2, 18.0, 3.4), PAL["cream"])
        acc.box((0.0, -8.2, 1.9), (14.4, 2.6, 3.0), PAL["cream_shade"])
        acc.box((0.0, 2.4, 5.2), (13.6, 16.0, 3.1), PAL["cream"])
        add_tiled_hip_roof(acc, -7.2, 7.2, -5.8, 10.6, 6.75, 1.75, PAL["cream_trim"], lod=2)
        acc.arch_slab(0.0, -7.2, 7.2, 0.35, 1.4, 6, PAL["crimson"])
        return acc

    # Plinth, Athangudi red/white steps & compound gate piers
    acc.box((0.0, 0.0, 0.12), (w - 0.2, d - 0.4, 0.24), PAL["plinth"])
    acc.box((0.0, 1.5, 0.36), (14.4, 20.6, 0.48), PAL["surkhi"])
    # Solid Chettinad masonry compound walls with grand gate piers & wrought-iron gate
    if lod < 2:
        for sx in (-1, 1):
            acc.box((sx * 4.45, -12.0, 0.62), (5.8, 0.26, 1.24), PAL["white"])
            acc.box((sx * 4.45, -12.0, 1.28), (5.9, 0.32, 0.08), PAL["crimson"])
            acc.box((sx * 7.38, -9.6, 0.65), (0.24, 4.8, 1.30), PAL["white"])
        for px in (-7.32, -1.52, 1.52, 7.32):
            ph = 1.82 if abs(px) < 3.0 else 1.56
            acc.box((px, -12.0, 0.5 * ph), (0.46, 0.46, ph), PAL["white"])
            acc.box((px, -12.0, ph + 0.05), (0.56, 0.56, 0.10), PAL["crimson"])
        if lod == 0:
            acc.box((0.0, -12.0, 1.46), (2.75, 0.05, 0.05), PAL["iron"])
            acc.box((0.0, -12.0, 0.28), (2.75, 0.05, 0.05), PAL["iron"])
            for gi in range(11):
                gx = -1.25 + gi * 0.25
                bh = 1.20 + 0.16 * max(0.0, 1.0 - (gx / 1.35) ** 2)
                acc.cyl((gx, -12.0, 0.28 + 0.5 * bh), 0.018, 0.018, bh, PAL["iron"], segs=5)
            for px in (-1.52, 1.52):
                acc.sphere((px, -12.0, 2.02), 0.16, PAL["crimson"], subdiv=1)
            for sx in (-1, 1):
                add_pot_plant(acc, sx * 2.2, -9.2, 0.24, 1.1, lod=0)

    # Red/white Athangudi verandah steps
    for si, sy in enumerate((-9.15, -9.52, -9.89)):
        sh = 0.44 - si * 0.12
        col = PAL["crimson"] if si % 2 == 0 else PAL["white"]
        acc.box((0.0, sy, 0.24 + 0.5 * sh), (3.4 + si * 0.35, 0.38, sh), col)
    if lod == 0:
        # Athangudi chequered verandah floor inlays
        for ix in range(-6, 7):
            col = PAL["crimson"] if ix % 2 == 0 else PAL["white"]
            acc.box((ix * 1.05, -7.9, 0.61), (0.98, 2.2, 0.04), col)

    # Sculpted teak verandah pillars
    for px in (-6.5, -2.2, 2.2, 6.5):
        add_teak_pillar(acc, px, -8.8, 0.60, 2.85, 0.16, PAL["plinth"], PAL["teak_brown"], PAL["teak_dark"], lod=lod)

    # Ground main block
    acc.box((0.0, 2.0, 2.25), (14.2, 17.6, 3.60), PAL["cream"])
    add_door(acc, 0.0, -6.8, 0.60, 1.85, 2.55, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["gold"], lod=lod)
    add_ground_windows_row(acc, (-5.2, -3.1, 3.1, 5.2), -6.8, 2.15, 1.25, 1.45, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["white"], lod=lod, with_chajja=False)

    # Lower clay-tile verandah canopy
    add_clay_tile_canopy(acc, 14.5, -9.25, -6.80, 3.32, 4.15, PAL["white"], lod=lod)

    # Ornate 2F block + teak upper loggia
    acc.box((0.0, 2.8, 5.45), (13.4, 15.2, 2.95), PAL["cream"])
    acc.box((0.0, -5.9, 4.12), (13.8, 2.2, 0.24), PAL["cream_trim"])
    for px in (-6.2, -2.0, 2.0, 6.2):
        add_teak_pillar(acc, px, -6.8, 4.24, 2.45, 0.13, PAL["teak_dark"], PAL["teak_brown"], PAL["gold"], lod=lod)
    # Teak upper loggia balustrade
    acc.box((0.0, -6.8, 4.66), (12.8, 0.16, 0.72), PAL["teak_brown"] if lod > 0 else PAL["teak_dark"])
    if lod == 0:
        for bi in range(-10, 11):
            acc.box((bi * 0.58, -6.82, 4.72), (0.12, 0.18, 0.56), PAL["teak_brown"])
    add_door(acc, 0.0, -4.8, 4.24, 1.50, 2.25, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["white"], lod=lod)
    add_ground_windows_row(acc, (-4.4, -2.4, 2.4, 4.4), -4.8, 5.45, 1.15, 1.32, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod, with_chajja=False)

    # Side windows on both floors
    side_y_1 = (-2.0, 5.2)
    side_y_2 = (0.0, 5.5)
    for sgn in (-1.0, 1.0):
        for wy in side_y_1:
            add_side_window(acc, sgn * 7.1, wy, 2.15, 1.20, 1.36, sgn, PAL["teak_dark"], PAL["teak_brown"], PAL["white"], lod=lod, with_grille=False)
        for wy in side_y_2:
            add_side_window(acc, sgn * 6.7, wy, 5.45, 1.15, 1.30, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod, with_grille=False)

    # Upper tier hipped Mangalore clay-tile roof + red/white parapet crest
    add_tiled_hip_roof(acc, -7.1, 7.1, -7.2, 10.7, 6.85, 1.70, PAL["white"], lod=lod, tile_step=0.95)
    # Front red/white parapet crest rising in front of upper roof eaves
    acc.box((0.0, -6.95, 7.18), (13.6, 0.24, 0.62), PAL["white"])
    if lod == 0:
        for si in range(-12, 13):
            col = PAL["crimson"] if si % 2 == 0 else PAL["white"]
            acc.box((si * 0.52, -7.08, 7.18), (0.24, 0.06, 0.52), col)
    add_stepped_crest(acc, 0.0, -6.95, 7.45, 3.4, 1.25, PAL["white"], PAL["crimson"], PAL["gold"], lod=lod)
    return acc


def build_CHN_001_agraharam(lod: int) -> MeshAcc:
    """CHN_001_agraharam: 9x18m 1F Agraharam House with red-white striped thinnai plinth & hipped tiled roof."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 9.0, 18.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.36), (w, d - 0.4, 0.72), PAL["plinth"])
        acc.box((0.0, -7.2, 0.42), (w - 0.1, 2.8, 0.84), PAL["crimson"])
        acc.box((0.0, 1.4, 2.2), (8.6, 14.2, 3.2), PAL["cream"])
        add_tiled_hip_roof(acc, -4.6, 4.6, -8.6, 8.6, 3.70, 1.65, PAL["white"], lod=2)
        return acc

    # Raised plinth + red-and-white vertical striped thinnai sitting ledges
    acc.box((0.0, 0.8, 0.38), (w - 0.1, 16.0, 0.76), PAL["plinth"])
    acc.box((0.0, -7.5, 0.38), (w - 0.1, 2.6, 0.76), PAL["white"])
    for sx in (-1, 1):
        acc.box((sx * 2.85, -7.7, 0.92), (3.1, 1.8, 0.36), PAL["white"])
        if lod < 2:
            n_st = 10 if lod == 0 else 5
            sw = 3.0 / n_st
            for i in range(n_st):
                col = PAL["crimson"] if i % 2 == 0 else PAL["white"]
                acc.box((sx * 2.85 - 1.5 + (i + 0.5) * sw, -8.62, 0.42), (sw * 0.94, 0.06, 0.80), col)
    # Central granite steps
    for si, sy in enumerate((-8.4, -8.75)):
        acc.box((0.0, sy, 0.38 - si * 0.16), (2.4, 0.36, 0.76 - si * 0.32), PAL["plinth"])

    # Teak pillars along thinnai verandah
    for px in (-4.1, -1.45, 1.45, 4.1):
        add_teak_pillar(acc, px, -8.45, 0.76, 2.35, 0.13, PAL["plinth"], PAL["teak_brown"], PAL["teak_dark"], lod=lod)

    # Main Agraharam house block
    acc.box((0.0, 1.2, 2.36), (8.6, 14.8, 3.20), PAL["cream"])
    acc.box((0.0, 1.2, 0.78), (8.7, 14.9, 0.12), PAL["white"])
    add_door(acc, 0.0, -6.2, 0.76, 1.35, 2.15, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    add_ground_windows_row(acc, (-2.65, 2.65), -6.2, 2.05, 1.20, 1.30, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["white"], lod=lod)
    if lod == 0:
        for wx in (-2.65, 2.65):
            for lz in range(5):
                acc.box((wx, -6.28, 1.56 + lz * 0.24), (1.06, 0.04, 0.05), PAL["teak_green"])

    for sgn in (-1.0, 1.0):
        for wy in (-3.2, 0.8, 4.8):
            add_side_window(acc, sgn * 4.3, wy, 2.05, 1.15, 1.24, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    add_door(acc, 0.0, 8.6, 0.76, 1.15, 2.05, (0.0, 1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)

    # Front verandah clay-tile canopy + pitched hipped tiled main roof
    add_clay_tile_canopy(acc, 8.9, -8.85, -6.15, 2.95, 3.85, PAL["white"], lod=lod)
    add_tiled_hip_roof(acc, -4.55, 4.55, -6.30, 8.85, 3.92, 1.65, PAL["white"], lod=lod, tile_step=0.38)
    return acc


def build_CHN_002_mylapore_trad(lod: int) -> MeshAcc:
    """CHN_002_mylapore_trad: 10x16m 1F Mylapore Traditional House in mustard-ochre + white fluted pilasters."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 16.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.18), (w, d, 0.36), PAL["plinth"])
        acc.box((0.0, 1.6, 2.05), (9.4, 11.4, 3.7), PAL["mustard"])
        acc.box((0.0, 1.6, 3.96), (9.8, 11.8, 0.22), PAL["white"])
        acc.box((0.0, -4.1, 4.42), (9.4, 0.26, 0.75), PAL["mustard"])
        acc.arch_slab(0.0, -4.1, 4.82, 0.28, 1.0, 6, PAL["white"])
        return acc

    acc.box((0.0, 0.0, 0.10), (w, d, 0.20), PAL["plinth"])
    acc.box((0.0, -4.2, 0.24), (9.4, 2.0, 0.48), PAL["plinth"])
    acc.box((0.0, -5.3, 0.14), (2.1, 0.40, 0.28), PAL["plinth"])
    add_compound_fence(acc, w, -7.6, -4.1, PAL["mustard"], PAL["white"], lod=lod)
    if lod == 0:
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 1.85, -5.35, 0.20, 0.95, lod=0)

    # Main mustard-ochre house block
    y0, y1 = -4.1, 7.6
    yc = 0.5 * (y0 + y1)
    bd = y1 - y0
    acc.box((0.0, yc, 2.15), (9.4, bd, 3.80), PAL["mustard"])
    # White fluted pilasters across front facade
    for px in (-4.48, -1.65, 1.65, 4.48):
        acc.box((px, y0 - 0.05, 2.15), (0.38, 0.16, 3.76), PAL["white"])
        acc.box((px, y0 - 0.08, 3.88), (0.48, 0.22, 0.16), PAL["white_shade"])
        acc.box((px, y0 - 0.08, 0.56), (0.46, 0.22, 0.20), PAL["white_shade"])
        if lod == 0:
            for fx in (-0.10, 0.0, 0.10):
                acc.box((px + fx, y0 - 0.14, 2.15), (0.04, 0.03, 3.10), PAL["white_shade"])

    add_door(acc, 0.0, y0, 0.48, 1.32, 2.25, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod, with_hood=True)
    add_ground_windows_row(acc, (-3.05, 3.05), y0, 2.02, 1.36, 1.42, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (-1.4, 2.0, 5.2):
            add_side_window(acc, sgn * 4.7, wy, 2.02, 1.24, 1.34, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    add_door(acc, -2.0, y1, 0.48, 1.1, 2.0, (0.0, 1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)

    # Perforated parapet + ornate stepped arched crest
    _fix_parapet_at_y(acc, 9.48, y0, y1, 4.05, 0.78, PAL["mustard"], PAL["white"], PAL["ochre"], pediment=True, lod=lod)
    if lod == 0:
        acc.box((-2.6, 6.2, 4.65), (2.0, 2.1, 1.05), PAL["mustard"])
        acc.box((-2.6, 6.2, 5.22), (2.2, 2.3, 0.12), PAL["tile_red"])
        acc.cyl((2.4, 6.3, 4.62), 0.50, 0.50, 0.90, PAL["tank"], segs=10)
    return acc


def build_CHN_003_courtyard_old(lod: int) -> MeshAcc:
    """CHN_003_courtyard_old: 12x20m 2F Old Chennai Courtyard House (O-shape sky-well perimeter)."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 20.0
    if lod == 2:
        # O-shape perimeter wings around open central sky-well
        acc.box((0.0, 0.0, 0.18), (w, d, 0.36), PAL["plinth"])
        acc.box((0.0, -6.5, 3.45), (11.6, 6.0, 6.2), PAL["cream_shade"])
        acc.box((0.0, 6.5, 3.45), (11.6, 6.0, 6.2), PAL["cream_shade"])
        acc.box((-4.1, 0.0, 3.45), (3.4, 7.2, 6.2), PAL["cream_shade"])
        acc.box((+4.1, 0.0, 3.45), (3.4, 7.2, 6.2), PAL["cream_shade"])
        acc.arch_slab(0.0, -9.4, 7.2, 0.30, 1.2, 6, PAL["cream_trim"])
        return acc

    acc.box((0.0, 0.0, 0.18), (w - 0.1, d - 0.2, 0.36), PAL["plinth"])
    # Central courtyard paving visible in sky-well
    acc.box((0.0, 0.0, 0.40), (4.8, 7.4, 0.08), PAL["surkhi"])
    # 4 wings forming O-ring around x in [-2.4, 2.4], y in [-3.7, 3.7]
    h_wall = 6.30
    z_mid = 0.36 + 0.5 * h_wall
    acc.box((0.0, -6.6, z_mid), (11.6, 5.8, h_wall), PAL["cream_shade"])
    acc.box((0.0, +6.6, z_mid), (11.6, 5.8, h_wall), PAL["cream_shade"])
    acc.box((-4.1, 0.0, z_mid), (3.4, 7.6, h_wall), PAL["cream_shade"])
    acc.box((+4.1, 0.0, z_mid), (3.4, 7.6, h_wall), PAL["cream_shade"])

    # Inner courtyard verandah pillars & parapet ledges
    if lod == 0:
        for px in (-2.2, 0.0, 2.2):
            for py in (-3.55, 3.55):
                add_teak_pillar(acc, px, py, 0.40, 2.85, 0.11, PAL["plinth"], PAL["teak_brown"], PAL["teak_dark"], lod=0)
        add_pot_plant(acc, 0.0, 0.0, 0.44, 1.2, lod=0)
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 1.4, -2.1, 0.44, 0.85, lod=0)

    y_f = -9.5
    # Ornate front facade pilasters, string-course & steps
    acc.box((0.0, -9.85, 0.18), (2.4, 0.7, 0.36), PAL["plinth"])
    for px in (-5.55, -2.0, 2.0, 5.55):
        acc.box((px, y_f - 0.04, z_mid), (0.36, 0.16, h_wall), PAL["cream"])
    acc.box((0.0, y_f - 0.06, 3.55), (11.8, 0.20, 0.22), PAL["cream_trim"])
    add_door(acc, 0.0, y_f, 0.36, 1.42, 2.35, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod, with_hood=True)
    add_ground_windows_row(acc, (-3.8, 3.8), y_f, 1.92, 1.38, 1.42, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
    add_ground_windows_row(acc, (-3.8, 0.0, 3.8), y_f, 5.05, 1.34, 1.42, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod, arched=True)
    side_ys = (-6.0, -2.0, 2.0, 6.0) if lod == 0 else (-4.5, 4.5)
    for sgn in (-1.0, 1.0):
        for wy in side_ys:
            add_side_window(acc, sgn * 5.8, wy, 1.92, 1.18, 1.28, sgn, PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
            add_side_window(acc, sgn * 5.8, wy, 5.05, 1.18, 1.28, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Roof slabs around sky-well + weathered parapet piers + carved arched cornice crest
    ze = 6.66
    acc.box((0.0, -6.6, ze + 0.08), (11.84, 6.04, 0.16), PAL["cream_trim"])
    acc.box((0.0, +6.6, ze + 0.08), (11.84, 6.04, 0.16), PAL["cream_trim"])
    acc.box((-4.1, 0.0, ze + 0.08), (3.64, 7.6, 0.16), PAL["cream_trim"])
    acc.box((+4.1, 0.0, ze + 0.08), (3.64, 7.6, 0.16), PAL["cream_trim"])
    # Inner courtyard parapet rim
    acc.box((0.0, -3.65, ze + 0.42), (4.8, 0.18, 0.56), PAL["cream_shade"])
    acc.box((0.0, +3.65, ze + 0.42), (4.8, 0.18, 0.56), PAL["cream_shade"])
    acc.box((-2.4, 0.0, ze + 0.42), (0.18, 7.4, 0.56), PAL["cream_shade"])
    acc.box((+2.4, 0.0, ze + 0.42), (0.18, 7.4, 0.56), PAL["cream_shade"])
    # Outer weathered parapet + piers + arched crest
    acc.box((-5.7, 0.0, ze + 0.52), (0.22, 19.0, 0.72), PAL["cream_shade"])
    acc.box((+5.7, 0.0, ze + 0.52), (0.22, 19.0, 0.72), PAL["cream_shade"])
    acc.box((0.0, 9.4, ze + 0.52), (11.6, 0.22, 0.72), PAL["cream_shade"])
    for px in (-5.65, -2.0, 2.0, 5.65):
        acc.box((px, y_f + 0.12, ze + 0.62), (0.36, 0.28, 0.92), PAL["cream"])
        acc.box((px, y_f + 0.12, ze + 1.12), (0.44, 0.34, 0.10), PAL["cream_trim"])
    add_jaali_wing(acc, -5.45, -2.2, y_f + 0.12, ze + 0.16, 0.72, PAL["cream_shade"], PAL["cream_trim"], PAL["plinth"], lod=lod)
    add_jaali_wing(acc, 2.2, 5.45, y_f + 0.12, ze + 0.16, 0.72, PAL["cream_shade"], PAL["cream_trim"], PAL["plinth"], lod=lod)
    add_stepped_crest(acc, 0.0, y_f + 0.12, ze + 0.58, 3.6, 1.15, PAL["cream_shade"], PAL["cream_trim"], PAL["plinth"], lod=lod)
    return acc


def build_CHN_005_tiled_city(lod: int) -> MeshAcc:
    """CHN_005_tiled_city: 6x12m 1F Tiled Roof City House with brick plinth, front canopy & 2nd-bay hip roof."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 12.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.25), (w - 0.1, d - 0.2, 0.50), PAL["red_brick"])
        acc.box((0.0, 1.4, 2.0), (5.7, 8.6, 3.0), PAL["cream"])
        acc.box((0.0, -3.9, 2.65), (5.8, 2.1, 0.20), PAL["tile_red"], rot_x=0.35)
        add_tiled_hip_roof(acc, -3.0, 3.0, -3.1, 5.9, 3.55, 1.45, PAL["cream_trim"], lod=2)
        return acc

    # Exposed red brick plinth + steps
    acc.box((0.0, 0.4, 0.28), (w - 0.15, 10.8, 0.56), PAL["red_brick"])
    acc.box((0.0, -5.2, 0.16), (1.8, 0.7, 0.32), PAL["red_brick"])
    acc.box((0.0, -5.65, 0.08), (1.8, 0.40, 0.16), PAL["plinth"])
    if lod == 0:
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 1.45, -5.25, 0.0, 0.85, lod=0)

    # Narrow front verandah posts
    for px in (-2.75, -0.95, 2.75):
        add_teak_pillar(acc, px, -4.85, 0.56, 2.08, 0.10, PAL["red_brick"], PAL["teak_brown"], PAL["teak_dark"], lod=lod)

    # Front bay & taller 2nd bay behind
    acc.box((0.0, -1.6, 2.05), (5.6, 3.2, 3.0), PAL["cream"])
    acc.box((0.0, 2.8, 2.25), (5.7, 5.8, 3.4), PAL["cream"])
    acc.box((0.0, 0.4, 0.58), (5.8, 10.9, 0.10), PAL["red_dark"])

    add_door(acc, -1.35, -3.2, 0.56, 1.10, 2.02, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    # Carved wood lattice window
    add_window(acc, 1.25, -3.2, 1.85, 1.36, 1.32, (0.0, -1.0), PAL["teak_dark"], PAL["recess"], PAL["cream_trim"], with_chajja=False, with_grille=False, lod=lod)
    if lod == 0:
        for gx in (-0.38, 0.0, 0.38):
            acc.box((1.25 + gx, -3.26, 1.85), (0.05, 0.04, 1.18), PAL["teak_brown"])
        for gz in (-0.36, 0.0, 0.36):
            acc.box((1.25, -3.26, 1.85 + gz), (1.20, 0.04, 0.05), PAL["teak_brown"])

    for sgn in (-1.0, 1.0):
        for wy in (-1.2, 2.2, 4.4):
            add_side_window(acc, sgn * 2.85, wy, 1.92, 1.05, 1.16, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    add_clay_tile_canopy(acc, 5.9, -5.05, -3.15, 2.48, 3.25, PAL["cream_trim"], lod=lod)
    add_tiled_hip_roof(acc, -3.05, 3.05, -3.2, 5.85, 3.60, 1.55, PAL["cream_trim"], lod=lod, tile_step=0.32)
    if lod == 0:
        acc.box((0.0, -1.6, 3.55), (5.7, 3.2, 0.12), PAL["surkhi"])
    return acc


def build_CHN_006_verandah_house(lod: int) -> MeshAcc:
    """CHN_006_verandah_house: 8x18m 1F Verandah House with triple wide neoclassical arches."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 8.0, 18.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.22), (w, d, 0.44), PAL["plinth"])
        acc.box((0.0, 2.2, 2.2), (7.7, 11.4, 3.6), PAL["cream"])
        acc.box((0.0, -4.8, 2.2), (7.7, 2.8, 3.6), PAL["cream_shade"])
        acc.box((0.0, 0.6, 4.10), (8.0, 14.4, 0.22), PAL["cream_trim"])
        acc.box((0.0, -6.2, 4.55), (7.8, 0.26, 0.70), PAL["cream"])
        return acc

    acc.box((0.0, 0.0, 0.10), (w, d, 0.20), PAL["plinth"])
    acc.box((0.0, 0.7, 0.28), (7.7, 14.4, 0.56), PAL["plinth"])
    acc.box((0.0, -6.75, 0.14), (2.2, 0.55, 0.28), PAL["plinth"])
    add_compound_fence(acc, w, -8.6, -6.3, PAL["cream"], PAL["cream_trim"], lod=lod)

    # Main block set back behind 2.8m deep arched verandah
    y_inner = -3.6
    acc.box((0.0, 2.2, 2.36), (7.65, 11.6, 3.60), PAL["cream"])
    add_door(acc, 0.0, y_inner, 0.56, 1.32, 2.25, (0.0, -1.0), PAL["teak_dark"], PAL["teak_dark"], PAL["cream_trim"], lod=lod)
    add_ground_windows_row(acc, (-2.35, 2.35), y_inner, 2.02, 1.24, 1.36, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (-1.4, 2.0, 5.4):
            add_side_window(acc, sgn * 3.82, wy, 2.02, 1.18, 1.28, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Triple wide neoclassical arches across front verandah (y = -6.35)
    y_col = -6.35
    add_arch_colonnade(acc, (-3.62, -1.21, 1.21, 3.62), y_col, 0.56, 2.95, 0.65, 0.42, 0.38, PAL["cream"], PAL["cream_trim"], lod=lod)
    # Side return verandah beams & parapet
    for sx in (-3.68, 3.68):
        acc.box((sx, -5.0, 3.80), (0.34, 2.8, 0.65), PAL["cream"])
    acc.box((0.0, -5.0, 4.10), (7.7, 2.9, 0.16), PAL["cream_trim"])
    if lod == 0:
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 1.6, -6.8, 0.20, 0.95, lod=0)

    _fix_parapet_at_y(acc, 7.75, -6.48, 8.0, 4.12, 0.72, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    if lod == 0:
        acc.box((-2.1, 6.4, 4.70), (1.8, 1.9, 1.0), PAL["cream"])
        acc.box((-2.1, 6.4, 5.25), (2.0, 2.1, 0.10), PAL["tile_red"])
        acc.cyl((2.1, 6.5, 4.70), 0.48, 0.48, 0.85, PAL["tank"], segs=10)
    return acc


def build_CHN_007_colonial_res(lod: int) -> MeshAcc:
    """CHN_007_colonial_res: 14x20m 2F Colonial Residence with double-storey colonnaded arched verandah."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 14.0, 20.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.22), (w - 0.2, d - 0.4, 0.44), PAL["plinth"])
        acc.box((0.0, 2.0, 3.7), (13.4, 14.0, 6.6), PAL["white"])
        acc.box((0.0, -6.5, 3.7), (13.4, 3.2, 6.6), PAL["cream"])
        acc.box((0.0, 0.5, 7.1), (13.8, 17.6, 0.28), PAL["white"])
        acc.box((0.0, 0.5, 7.6), (13.5, 17.3, 0.82), PAL["cream"])
        return acc

    acc.box((0.0, 0.0, 0.12), (w - 0.1, d - 0.2, 0.24), PAL["plinth"])
    acc.box((0.0, 0.5, 0.34), (13.4, 17.4, 0.48), PAL["plinth"])
    acc.box((0.0, -8.55, 0.22), (3.4, 0.9, 0.44), PAL["plinth"])
    acc.box((0.0, -9.15, 0.12), (3.4, 0.45, 0.24), PAL["plinth"])

    # Main 2F inner body
    acc.box((0.0, 2.2, 3.85), (13.3, 13.8, 6.60), PAL["white"])
    y_in = -4.7
    col_front_xs = (-4.2, -2.2, 2.2, 4.2) if lod == 0 else (-3.2, 3.2)
    add_door(acc, 0.0, y_in, 0.58, 1.65, 2.50, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    add_ground_windows_row(acc, col_front_xs, y_in, 2.05, 1.18, 1.65, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod, with_chajja=False)
    add_door(acc, 0.0, y_in, 3.92, 1.55, 2.35, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    add_ground_windows_row(acc, col_front_xs, y_in, 5.25, 1.18, 1.58, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod, with_chajja=False)

    # Side windows
    col_side_ys = (-2.0, 1.8, 5.6) if lod == 0 else (1.8,)
    for sgn in (-1.0, 1.0):
        for wy in col_side_ys:
            add_side_window(acc, sgn * 6.65, wy, 2.05, 1.24, 1.55, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
            add_side_window(acc, sgn * 6.65, wy, 5.25, 1.24, 1.55, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)

    # Double-storey colonnaded arched verandah (3 arches ground + 3 arches upper loggia)
    pier_xs = (-6.35, -2.15, 2.15, 6.35)
    y_col = -7.95
    add_arch_colonnade(acc, pier_xs, y_col, 0.58, 2.85, 0.55, 0.52, 0.44, PAL["cream"], PAL["white"], lod=lod)
    # Upper loggia floor slab & side arches
    acc.box((0.0, -6.35, 3.88), (13.4, 3.4, 0.22), PAL["white"])
    for sx in (-6.42, 6.42):
        acc.box((sx, -6.35, 2.35), (0.38, 3.2, 3.2), PAL["cream"])
        acc.box((sx, -6.35, 5.55), (0.38, 3.2, 3.2), PAL["cream"])
    add_arch_colonnade(acc, pier_xs, y_col, 3.98, 2.65, 0.55, 0.50, 0.42, PAL["cream"], PAL["white"], lod=lod)
    # Balustrades inside upper loggia openings
    for bx in (-4.25, 0.0, 4.25):
        if lod == 0:
            acc.box((bx, y_col, 4.80), (3.72, 0.14, 0.10), PAL["white"])
            for bi in range(9):
                acc.cyl((bx - 1.6 + bi * 0.40, y_col, 4.38), 0.05, 0.06, 0.76, PAL["white"], segs=6)
        else:
            acc.box((bx, y_col, 4.42), (3.72, 0.16, 0.78), PAL["cream_shade"])

    # Deep cream cornice + balustrade parapet
    _fix_parapet_at_y(acc, 13.4, -8.15, 9.1, 7.12, 0.85, PAL["cream"], PAL["white"], PAL["cream_shade"], pediment=True, lod=lod)
    if lod == 0:
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 2.1, -8.55, 0.48, 1.1, lod=0)
        acc.box((-3.2, 7.0, 7.80), (2.2, 2.3, 1.2), PAL["cream"])
        acc.box((-3.2, 7.0, 8.45), (2.4, 2.5, 0.12), PAL["tile_red"])
        acc.cyl((3.2, 7.0, 7.75), 0.60, 0.60, 1.0, PAL["tank"], segs=10)
    return acc


def build_CHN_008_inner_row(lod: int) -> MeshAcc:
    """CHN_008_inner_row: 6x14m 2F Inner City Row House in salmon-pink plaster with Juliette balcony."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 14.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.18), (w, d, 0.36), PAL["plinth"])
        acc.box((0.0, 0.3, 3.45), (5.88, 12.8, 6.2), PAL["salmon"])
        acc.box((0.0, -6.3, 4.15), (2.4, 0.5, 0.85), PAL["cream_trim"])
        acc.box((0.0, 0.3, 6.62), (6.05, 13.1, 0.22), PAL["cream_trim"])
        acc.box((0.0, 0.3, 7.05), (5.88, 12.8, 0.68), PAL["salmon"])
        return acc

    acc.box((0.0, 0.0, 0.12), (w, d, 0.24), PAL["plinth"])
    acc.box((-1.3, -6.55, 0.18), (1.7, 0.7, 0.36), PAL["plinth"])
    acc.box((0.0, 0.35, 3.48), (5.84, 12.6, 6.40), PAL["salmon"])
    y_f = -5.95
    # Moulded cornice bands & side pilasters
    for sx in (-1, 1):
        acc.box((sx * 2.78, y_f - 0.04, 3.48), (0.28, 0.12, 6.40), PAL["pink_trim"])
    acc.box((0.0, y_f - 0.06, 3.55), (6.04, 0.18, 0.20), PAL["cream_trim"])

    add_door(acc, -1.25, y_f, 0.24, 1.15, 2.15, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod, with_hood=True)
    add_window(acc, 1.35, y_f, 1.85, 1.25, 1.32, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Upper iron Juliette balcony + shuttered doors + flanking window
    acc.box((-1.15, y_f - 0.28, 3.74), (2.25, 0.56, 0.14), PAL["cream_trim"])
    add_door(acc, -1.15, y_f, 3.80, 1.30, 2.05, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    if lod == 0:
        acc.box((-1.15, y_f - 0.52, 4.68), (2.22, 0.04, 0.04), PAL["iron"])
        acc.box((-1.15, y_f - 0.52, 3.92), (2.22, 0.04, 0.04), PAL["iron"])
        for bi in range(9):
            acc.cyl((-2.2 + bi * 0.26, y_f - 0.52, 4.30), 0.015, 0.015, 0.78, PAL["iron"], segs=6)
    elif lod == 1:
        acc.box((-1.15, y_f - 0.52, 4.25), (2.22, 0.05, 0.80), PAL["iron"])
    add_window(acc, 1.50, y_f, 4.95, 1.15, 1.32, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_window(acc, 0.0, 6.65, 4.95, 1.25, 1.25, (0.0, 1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    _fix_parapet_at_y(acc, 5.88, -6.0, 6.65, 6.65, 0.72, PAL["salmon"], PAL["cream_trim"], PAL["pink"], pediment=True, lod=lod)
    if lod < 2:
        acc.cyl((1.5, 5.2, 7.42), 0.46, 0.46, 0.90, PAL["tank"], segs=10 if lod == 0 else 8)
    return acc


def build_CHN_009_trad_terrace(lod: int) -> MeshAcc:
    """CHN_009_trad_terrace: 10x18m 2F Traditional House with open upper roof terrace & shed awning."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 18.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.22), (w, d, 0.44), PAL["plinth"])
        acc.box((0.0, 1.2, 2.1), (9.4, 13.0, 3.4), PAL["cream"])
        acc.box((0.0, 4.5, 5.3), (9.4, 6.4, 3.0), PAL["cream"])
        acc.box((0.0, -1.8, 5.2), (9.2, 5.0, 0.16), PAL["steel_blue"], rot_x=0.18)
        return acc

    acc.box((0.0, 0.0, 0.12), (w, d, 0.24), PAL["plinth"])
    acc.box((0.0, 1.0, 0.34), (9.4, 13.6, 0.44), PAL["plinth"])
    acc.box((0.0, -6.0, 0.20), (2.2, 0.7, 0.40), PAL["plinth"])
    add_compound_fence(acc, w, -8.5, -5.3, PAL["cream"], PAL["cream_trim"], lod=lod)

    # Ground floor main block
    y0, y1 = -5.3, 7.8
    acc.box((0.0, 1.25, 2.25), (9.4, 13.1, 3.40), PAL["cream"])
    add_door(acc, 0.0, y0, 0.56, 1.32, 2.20, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_ground_windows_row(acc, (-3.0, 3.0), y0, 1.98, 1.35, 1.34, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    # Tiled chajja lintel across ground facade
    add_clay_tile_canopy(acc, 9.6, -6.10, -5.25, 2.85, 3.35, PAL["cream_trim"], lod=lod)

    # Open 2F terrace deck on front half (y in [-5.3, 1.2]) + enclosed 2F rear block (y in [1.2, 7.8])
    acc.box((0.0, 1.25, 4.02), (9.6, 13.3, 0.16), PAL["cream_trim"])
    acc.box((0.0, -2.0, 4.08), (9.0, 6.2, 0.08), PAL["surkhi"])
    acc.box((0.0, 4.5, 5.55), (9.4, 6.6, 2.95), PAL["cream"])
    add_door(acc, -2.0, 1.2, 4.10, 1.15, 2.10, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_window(acc, 2.0, 1.2, 5.45, 1.40, 1.32, (0.0, -1.0), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)

    # Front open terrace jaali parapet
    for sx in (-4.58, 4.58):
        acc.box((sx, -2.0, 4.55), (0.22, 6.6, 0.90), PAL["cream"])
    add_jaali_wing(acc, -4.45, 4.45, y0 + 0.12, 4.10, 0.88, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], lod=lod)

    # Lightweight sloped shed awning over front/mid terrace
    for px in (-4.2, 0.0, 4.2):
        acc.cyl((px, -3.5, 5.35), 0.05, 0.05, 2.45, PAL["iron"], segs=6)
    acc.box((0.0, -1.2, 6.65), (9.2, 5.2, 0.08), PAL["steel_blue"], rot_x=0.18)
    if lod == 0:
        for ri in range(-4, 5):
            acc.box((ri * 1.05, -1.2, 6.70), (0.06, 5.2, 0.04), PAL["steel_light"], rot_x=0.18)

    for sgn in (-1.0, 1.0):
        for wy in (-2.5, 1.2, 4.8):
            add_side_window(acc, sgn * 4.7, wy, 1.98, 1.20, 1.28, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
        add_side_window(acc, sgn * 4.7, 4.6, 5.45, 1.20, 1.28, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    _fix_parapet_at_y(acc, 9.48, 1.2, 7.8, 7.02, 0.68, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=False, lod=lod)
    if lod == 0:
        acc.cyl((2.2, 6.2, 7.75), 0.50, 0.50, 0.95, PAL["tank"], segs=10)
    return acc


def build_CHN_011_narrow_lane(lod: int) -> MeshAcc:
    """CHN_011_narrow_lane: 5x12m 2F Narrow Lane House in ochre with blue teak shutters & rooftop pipe/tank."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 5.0, 12.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.18), (w, d, 0.36), PAL["plinth"])
        acc.box((0.0, 0.2, 3.3), (4.85, 11.2, 5.9), PAL["ochre"])
        acc.box((0.0, -5.65, 2.75), (2.2, 0.9, 0.20), PAL["tile_red"], rot_x=0.32)
        acc.box((0.0, 0.2, 6.35), (5.05, 11.4, 0.20), PAL["cream_trim"])
        acc.box((0.0, 0.2, 6.75), (4.85, 11.2, 0.65), PAL["ochre"])
        return acc

    acc.box((0.0, 0.0, 0.12), (w, d, 0.24), PAL["plinth"])
    acc.box((-0.9, -5.6, 0.16), (1.7, 0.7, 0.32), PAL["plinth"])
    acc.box((0.0, 0.25, 3.25), (4.85, 11.0, 6.0), PAL["ochre"])
    y_f = -5.25
    acc.box((0.0, y_f - 0.06, 3.30), (5.05, 0.16, 0.18), PAL["cream_trim"])

    # Blue teak shutters on door & windows + sloped clay-tile porch hood
    add_door(acc, -0.95, y_f, 0.24, 1.05, 2.08, (0.0, -1.0), PAL["teak_dark"], PAL["steel_blue"], PAL["cream_trim"], lod=lod)
    add_clay_tile_canopy(acc, 4.75, -6.05, -5.20, 2.42, 2.95, PAL["cream_trim"], lod=lod)
    add_window(acc, 1.20, y_f, 1.72, 1.10, 1.24, (0.0, -1.0), PAL["teak_dark"], PAL["steel_blue"], PAL["cream_trim"], with_chajja=False, lod=lod)
    add_ground_windows_row(acc, (-1.15, 1.15), y_f, 4.65, 1.12, 1.32, (0.0, -1.0), PAL["teak_dark"], PAL["steel_blue"], PAL["cream_trim"], lod=lod)
    if lod == 0:
        for wx in (-1.15, 1.15):
            for sz in (-0.32, 0.0, 0.32):
                acc.box((wx, y_f - 0.08, 4.65 + sz), (0.98, 0.03, 0.05), PAL["sky_blue"])
    add_window(acc, 0.0, 5.75, 4.65, 1.15, 1.20, (0.0, 1.0), PAL["teak_dark"], PAL["steel_blue"], PAL["cream_trim"], lod=lod)

    _fix_parapet_at_y(acc, 4.90, -5.28, 5.75, 6.25, 0.65, PAL["ochre"], PAL["cream_trim"], PAL["mustard"], pediment=False, lod=lod)
    # Rooftop pipe & tank
    if lod < 2:
        acc.box((-1.3, 4.2, 7.18), (1.1, 1.1, 0.40), PAL["red_brick"])
        acc.cyl((-1.3, 4.2, 7.82), 0.44, 0.44, 0.92, PAL["tank"], segs=10 if lod == 0 else 8)
        acc.cyl((-2.48, 4.2, 3.65), 0.045, 0.045, 6.8, PAL["steel_light"], segs=6)
        if lod == 0:
            acc.box((-1.90, 4.2, 7.05), (1.2, 0.07, 0.07), PAL["steel_light"])
            acc.box((-2.48, 3.0, 3.65), (0.09, 0.09, 6.6), PAL["steel_light"])
    return acc


def build_CHN_012_madras_terrace(lod: int) -> MeshAcc:
    """CHN_012_madras_terrace: 8x16m 2F Madras Terrace Brick House with exposed red brick & cream quoins."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 8.0, 16.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.20), (w, d, 0.40), PAL["plinth"])
        acc.box((0.0, 0.8, 3.55), (7.6, 12.2, 6.3), PAL["red_brick"])
        acc.box((0.0, 0.8, 6.82), (8.0, 12.6, 0.28), PAL["cream_trim"])
        acc.box((0.0, 0.8, 7.30), (7.7, 12.3, 0.72), PAL["red_brick"])
        return acc

    acc.box((0.0, 0.0, 0.12), (w, d, 0.24), PAL["plinth"])
    acc.box((0.0, 0.8, 0.34), (7.6, 12.2, 0.44), PAL["plinth"])
    acc.box((0.0, -5.8, 0.20), (2.2, 0.9, 0.40), PAL["plinth"])
    add_compound_fence(acc, w, -7.6, -5.3, PAL["red_brick"], PAL["cream_trim"], lod=lod)

    y0, y1 = -5.3, 6.9
    acc.box((0.0, 0.8, 3.55), (7.6, 12.2, 6.30), PAL["red_brick"])
    # Cream plaster corner quoins
    for sx in (-1, 1):
        add_corner_quoins(acc, sx * 3.80, y0, sx, -1.0, 0.56, 6.68, PAL["cream_trim"], lod=lod)
        add_corner_quoins(acc, sx * 3.80, y1, sx, 1.0, 0.56, 6.68, PAL["cream_trim"], lod=lod)
    acc.box((0.0, 0.8, 3.65), (7.86, 12.46, 0.20), PAL["cream_trim"])

    add_door(acc, 0.0, y0, 0.56, 1.30, 2.25, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
    acc.arch_slab(0.0, y0 - 0.02, 2.75, 0.16, 0.78, 10 if lod == 0 else 6, PAL["cream_trim"])
    add_ground_windows_row(acc, (-2.25, 2.25), y0, 2.02, 1.15, 1.38, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod, arched=True)
    add_ground_windows_row(acc, (-2.25, 0.0, 2.25), y0, 5.10, 1.15, 1.38, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod, arched=True)
    mt_side_ys = (-2.5, 1.0, 4.5) if lod == 0 else (-1.5, 3.5)
    for sgn in (-1.0, 1.0):
        for wy in mt_side_ys:
            add_side_window(acc, sgn * 3.80, wy, 2.02, 1.10, 1.30, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
            add_side_window(acc, sgn * 3.80, wy, 5.10, 1.10, 1.30, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Madras terrace stepped cornice + parapet
    acc.box((0.0, 0.8, 6.72), (7.92, 12.52, 0.14), PAL["cream"])
    _fix_parapet_at_y(acc, 7.68, y0, y1, 6.78, 0.72, PAL["red_brick"], PAL["cream_trim"], PAL["red_dark"], pediment=True, lod=lod)
    if lod == 0:
        acc.box((-1.8, 5.2, 7.42), (1.7, 1.8, 1.0), PAL["red_brick"])
        acc.box((-1.8, 5.2, 7.98), (1.9, 2.0, 0.12), PAL["cream_trim"])
        acc.cyl((1.8, 5.2, 7.40), 0.48, 0.48, 0.90, PAL["tank"], segs=10)
    return acc


def build_CHN_013_twin_house(lod: int) -> MeshAcc:
    """CHN_013_twin_house: 12x14m 1F Twin House (Shared Wall) with mirrored twin doors & twin-medallion crest."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 14.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.18), (w, d, 0.36), PAL["plinth"])
        acc.box((0.0, 1.6, 2.05), (11.6, 9.2, 3.6), PAL["cream"])
        acc.box((0.0, -4.0, 2.7), (11.7, 2.2, 0.22), PAL["tile_red"], rot_x=0.35)
        acc.box((0.0, 1.6, 3.92), (11.9, 9.5, 0.22), PAL["cream_trim"])
        acc.arch_slab(-1.1, -3.0, 4.4, 0.28, 0.8, 6, PAL["cream"])
        acc.arch_slab(+1.1, -3.0, 4.4, 0.28, 0.8, 6, PAL["cream"])
        return acc

    acc.box((0.0, 0.0, 0.10), (w, d, 0.20), PAL["plinth"])
    acc.box((0.0, -3.9, 0.22), (11.6, 2.0, 0.44), PAL["plinth"])
    for sx in (-1, 1):
        acc.box((sx * 2.5, -5.05, 0.14), (1.7, 0.45, 0.28), PAL["plinth"])
    add_compound_fence(acc, w, -6.6, -3.0, PAL["cream"], PAL["cream_trim"], lod=lod)

    # Verandah columns + central party divider
    for px in (-5.6, -3.7, -1.2, 0.0, 1.2, 3.7, 5.6):
        acc.box((px, -4.75, 1.50), (0.28, 0.28, 2.15), PAL["cream"])
        acc.box((px, -4.75, 2.52), (0.34, 0.34, 0.10), PAL["cream_trim"])
    acc.box((0.0, -3.85, 1.05), (0.22, 1.9, 1.20), PAL["cream_shade"])

    # Main block + proud party pilaster at x=0
    y0, y1 = -3.0, 6.5
    acc.box((0.0, 1.75, 2.12), (11.6, 9.5, 3.68), PAL["cream"])
    acc.box((0.0, y0 - 0.06, 2.12), (0.42, 0.18, 3.68), PAL["cream_trim"])

    for sx in (-1, 1):
        add_door(acc, sx * 2.45, y0, 0.44, 1.15, 2.08, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
        add_ground_windows_row(acc, (sx * 4.45, sx * 0.95), y0, 1.88, 1.10, 1.24, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (-0.4, 3.2):
            add_side_window(acc, sgn * 5.8, wy, 1.88, 1.15, 1.24, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    add_clay_tile_canopy(acc, 11.7, -5.05, -2.95, 2.42, 3.25, PAL["cream_trim"], lod=lod)
    _fix_parapet_at_y(acc, 11.68, y0, y1, 3.96, 0.70, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=False, lod=lod)
    # Central twin-medallion parapet crest straddling the shared party wall
    add_stepped_crest(acc, -1.15, y0 + 0.12, 4.45, 2.1, 0.78, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], lod=lod)
    add_stepped_crest(acc, +1.15, y0 + 0.12, 4.45, 2.1, 0.78, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], lod=lod)
    if lod == 0:
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 1.4, -5.1, 0.20, 0.90, lod=0)
            acc.cyl((sx * 2.8, 5.0, 4.55), 0.45, 0.45, 0.80, PAL["tank"], segs=10)
    return acc


def build_CHN_014_corner_trad(lod: int) -> MeshAcc:
    """CHN_014_corner_trad: 14x18m 2F Corner Traditional House with wrap two-street facade & chamfered corner crest."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 14.0, 18.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.22), (w - 0.2, d - 0.2, 0.44), PAL["plinth"])
        acc.box((-0.6, 0.4, 3.55), (12.0, 15.6, 6.3), PAL["cream"])
        acc.box((4.4, -7.8, 2.2), (3.4, 2.0, 3.6), PAL["cream_shade"])
        acc.box((-0.6, 0.4, 6.82), (12.6, 16.0, 0.24), PAL["cream_trim"])
        acc.arch_slab(5.0, -7.4, 7.2, 0.30, 1.0, 6, PAL["cream"], )
        return acc

    acc.box((0.0, 0.0, 0.12), (w - 0.1, d - 0.1, 0.24), PAL["plinth"])
    acc.box((-0.4, 0.2, 0.34), (12.8, 16.4, 0.44), PAL["plinth"])

    # Main 2F block (-6.6..+4.8 in X, -7.2..+8.2 in Y) leaving articulated +X side verandah & -Y entry porch
    acc.box((-0.9, 0.5, 3.58), (11.4, 15.4, 6.30), PAL["cream"])
    # Chamfered SE corner bay rotated 45 deg at (+4.6, -7.0)
    acc.box((4.5, -6.9, 3.58), (2.6, 2.6, 6.30), PAL["cream"], rot_z=0.25 * math.pi)

    # Wrap string-courses across -Y, chamfer, and +X
    acc.box((-0.8, 0.5, 3.55), (12.0, 15.8, 0.20), PAL["cream_trim"])
    acc.box((4.5, -6.9, 3.55), (2.8, 2.8, 0.20), PAL["cream_trim"], rot_z=0.25 * math.pi)

    # -Y main entrance porch
    acc.box((-1.0, -7.9, 0.36), (3.6, 1.8, 0.48), PAL["plinth"])
    acc.box((-1.0, -8.9, 0.16), (2.6, 0.45, 0.32), PAL["plinth"])
    for px in (-2.5, 0.5):
        acc.box((px, -8.5, 2.0), (0.32, 0.32, 3.0), PAL["cream"])
    acc.box((-1.0, -7.9, 3.60), (3.8, 1.9, 0.22), PAL["cream_trim"])
    add_door(acc, -1.0, -7.2, 0.56, 1.35, 2.25, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_ground_windows_row(acc, (-4.2,), -7.2, 2.0, 1.32, 1.34, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    add_ground_windows_row(acc, (-4.2, -1.0, 2.0), -7.2, 5.15, 1.30, 1.38, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Articulated +X side street verandah & windows
    for py in (-4.4, -1.2, 2.0, 5.2):
        acc.box((6.2, py, 2.0), (0.30, 0.30, 3.0), PAL["cream"])
    acc.box((5.6, 0.4, 3.60), (1.7, 11.4, 0.22), PAL["cream_trim"])
    for wy in (-2.8, 0.4, 3.6):
        add_side_window(acc, 4.8, wy, 2.0, 1.25, 1.34, 1.0, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
        add_side_window(acc, 4.8, wy, 5.15, 1.25, 1.34, 1.0, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    # Side street compound fence along -Y left of porch
    add_compound_fence(acc, 6.2, -8.5, -7.2, PAL["cream"], PAL["cream_trim"], lod=lod)

    # Wrap cornice + parapet + curved corner parapet crest on chamfered bay
    acc.box((-0.7, 0.5, 6.82), (12.2, 16.0, 0.20), PAL["cream_trim"])
    acc.box((4.5, -6.9, 6.82), (2.9, 2.9, 0.20), PAL["cream_trim"], rot_z=0.25 * math.pi)
    _fix_parapet_at_y(acc, 11.5, -7.25, 8.2, 6.82, 0.72, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=False, lod=lod)
    # Curved corner parapet crest over chamfered SE corner
    if lod < 2:
        acc.box((4.5, -6.9, 7.28), (2.5, 2.5, 0.74), PAL["cream"], rot_z=0.25 * math.pi)
        acc.cyl((4.95, -7.35, 7.72), 0.85, 0.85, 0.28, PAL["cream_trim"], segs=12 if lod == 0 else 8, rot_x=0.5 * math.pi, rot_z=0.25 * math.pi)
    if lod == 0:
        add_pot_plant(acc, 1.1, -8.5, 0.24, 0.95, lod=0)
        add_pot_plant(acc, -3.1, -8.5, 0.24, 0.95, lod=0)
        acc.cyl((-3.5, 6.4, 7.40), 0.52, 0.52, 0.92, PAL["tank"], segs=10)
    return acc


def build_CHN_015_nalukettu(lod: int) -> MeshAcc:
    """CHN_015_nalukettu: 18x24m 1F Courtyard House (Nalukettu) with 4 inward-sloped tiled roofs & inner teak verandah."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 24.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.24), (w - 0.4, d - 0.4, 0.48), PAL["plinth"])
        # 4 wings around open central courtyard
        acc.box((0.0, -7.6, 2.0), (17.2, 6.6, 3.0), PAL["cream"])
        acc.box((0.0, +7.6, 2.0), (17.2, 6.6, 3.0), PAL["cream"])
        acc.box((-5.8, 0.0, 2.0), (5.6, 8.6, 3.0), PAL["cream"])
        acc.box((+5.8, 0.0, 2.0), (5.6, 8.6, 3.0), PAL["cream"])
        acc.box((0.0, -7.6, 4.1), (17.6, 6.8, 1.2), PAL["tile_red"])
        acc.box((0.0, +7.6, 4.1), (17.6, 6.8, 1.2), PAL["tile_red"])
        acc.box((-5.8, 0.0, 4.1), (5.8, 8.8, 1.2), PAL["tile_red"])
        acc.box((+5.8, 0.0, 4.1), (5.8, 8.8, 1.2), PAL["tile_red"])
        return acc

    # Plinth & inner sunken courtyard
    acc.box((0.0, 0.0, 0.14), (w - 0.2, d - 0.2, 0.28), PAL["plinth"])
    acc.box((0.0, 0.0, 0.34), (17.2, 22.0, 0.20), PAL["surkhi"])
    acc.box((0.0, -11.3, 0.18), (3.2, 0.9, 0.36), PAL["plinth"])

    # 4 perimeter wings leaving central sky-well x in [-3.4, 3.4], y in [-4.8, 4.8]
    acc.box((0.0, -7.8, 1.95), (17.0, 6.0, 3.10), PAL["cream"])
    acc.box((0.0, +7.8, 1.95), (17.0, 6.0, 3.10), PAL["cream"])
    acc.box((-6.0, 0.0, 1.95), (5.0, 9.6, 3.10), PAL["cream"])
    acc.box((+6.0, 0.0, 1.95), (5.0, 9.6, 3.10), PAL["cream"])

    # Front entrance porch & doors
    for px in (-2.4, 2.4):
        add_teak_pillar(acc, px, -11.4, 0.44, 2.45, 0.14, PAL["plinth"], PAL["teak_brown"], PAL["teak_dark"], lod=lod)
    add_door(acc, 0.0, -10.8, 0.44, 1.65, 2.30, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["white"], lod=lod)
    add_ground_windows_row(acc, (-6.2, -3.8, 3.8, 6.2), -10.8, 1.88, 1.25, 1.32, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (-7.2, -2.4, 2.4, 7.2):
            add_side_window(acc, sgn * 8.5, wy, 1.88, 1.20, 1.28, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)

    # Inner pillared teak verandah facing courtyard
    for px in (-2.8, 0.0, 2.8):
        for py in (-4.4, 4.4):
            add_teak_pillar(acc, px, py, 0.44, 2.35, 0.11, PAL["plinth"], PAL["teak_brown"], PAL["teak_dark"], lod=lod)
    for py in (-1.6, 1.6):
        for px in (-3.1, 3.1):
            add_teak_pillar(acc, px, py, 0.44, 2.35, 0.11, PAL["plinth"], PAL["teak_brown"], PAL["teak_dark"], lod=lod)

    # Lush courtyard pots & central tulsi pedestal
    if lod == 0:
        acc.box((0.0, 0.0, 0.68), (0.9, 0.9, 0.50), PAL["cream_trim"])
        acc.sphere((0.0, 0.0, 1.10), 0.34, PAL["foliage_hi"], subdiv=1)
        for px, py in ((-2.0, -3.2), (2.0, -3.2), (-2.0, 3.2), (2.0, 3.2), (-2.9, -11.5), (2.9, -11.5)):
            add_pot_plant(acc, px, py, 0.44, 1.0, lod=0)

    # 4 pitched Mangalore tiled inward roofs (each wing roof sloped ridge-to-eaves)
    add_tiled_gable_roof(acc, -8.8, 8.8, -11.2, -4.2, 3.45, 1.45, PAL["cream"], lod=lod, tile_step=0.68)
    add_tiled_gable_roof(acc, -8.8, 8.8, 4.2, 11.2, 3.45, 1.45, PAL["cream"], lod=lod, tile_step=0.68)
    add_tiled_gable_roof(acc, -8.8, -2.9, -4.4, 4.4, 3.45, 1.45, PAL["cream"], lod=lod, tile_step=0.68)
    add_tiled_gable_roof(acc, 2.9, 8.8, -4.4, 4.4, 3.45, 1.45, PAL["cream"], lod=lod, tile_step=0.68)
    return acc


def build_CHN_016_worker_house(lod: int) -> MeshAcc:
    """CHN_016_worker_house: 5x10m 1F Worker's Traditional House in sky-blue with pitched clay-tile roof overhang."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 5.0, 10.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.14), (w - 0.1, d - 0.2, 0.28), PAL["plinth"])
        acc.box((0.0, 0.3, 1.55), (4.6, 8.4, 2.6), PAL["sky_blue"])
        add_tiled_gable_roof(acc, -2.55, 2.55, -4.8, 4.8, 2.85, 1.25, PAL["sky_blue"], lod=2)
        return acc

    acc.box((0.0, 0.0, 0.10), (w - 0.1, d - 0.2, 0.20), PAL["plinth"])
    acc.box((0.0, 0.3, 0.24), (4.65, 8.6, 0.28), PAL["plinth"])
    # Stone doorstep
    acc.box((-0.95, -4.35, 0.16), (1.45, 0.65, 0.32), PAL["concrete"])
    acc.box((-0.95, -4.78, 0.08), (1.45, 0.36, 0.16), PAL["plinth"])

    # Sky-blue lime-washed walls + white corner/plinth band
    acc.box((0.0, 0.3, 1.68), (4.60, 8.40, 2.60), PAL["sky_blue"])
    acc.box((0.0, 0.3, 0.44), (4.66, 8.46, 0.14), PAL["white"])
    acc.box((0.0, -3.90, 2.94), (4.70, 0.14, 0.12), PAL["white"])

    # Single green teak door + small barred window + side windows
    add_door(acc, -0.95, -3.90, 0.38, 1.02, 1.98, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    add_window(acc, 1.15, -3.90, 1.72, 1.02, 1.06, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (-1.6, 1.8):
            add_side_window(acc, sgn * 2.30, wy, 1.72, 0.96, 1.02, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)
    add_window(acc, 0.0, 4.50, 1.72, 1.02, 1.02, (0.0, 1.0), PAL["teak_dark"], PAL["teak_green"], PAL["white"], lod=lod)

    # Deep overhanging pitched Mangalore clay-tile roof with rafters
    add_tiled_gable_roof(acc, -2.52, 2.52, -4.85, 4.85, 2.95, 1.35, PAL["sky_blue"], lod=lod, tile_step=0.25)
    if lod == 0:
        for sx in (-1, 1):
            for ry in (-4.2, -2.2, -0.2, 1.8, 3.8):
                acc.box((sx * 2.38, ry, 2.86), (0.36, 0.08, 0.10), PAL["teak_brown"])
        add_pot_plant(acc, 1.65, -4.35, 0.20, 0.85, lod=0)
    return acc


def build_CHN_017_thatch_house(lod: int) -> MeshAcc:
    """CHN_017_thatch_house: 4x8m 1F Rustic Thatched Roof House with multi-tiered palm-thatch roof & bamboo porch."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 4.0, 8.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.15), (w - 0.1, d - 0.2, 0.30), PAL["surkhi"])
        acc.box((0.0, 0.5, 1.35), (3.5, 5.6, 2.1), PAL["cream_shade"])
        acc.pitched_roof(-2.05, 2.05, -3.9, 3.9, 2.35, 1.55, PAL["thatch"], PAL["thatch_dark"], hip=True)
        return acc

    # Earth/mud plinth + front bamboo porch deck
    acc.box((0.0, 0.0, 0.12), (w - 0.1, d - 0.2, 0.24), PAL["surkhi"])
    acc.box((0.0, 0.4, 0.26), (3.7, 6.8, 0.28), PAL["surkhi"])
    acc.box((0.0, -3.2, 0.16), (1.4, 0.6, 0.24), PAL["plinth"])

    # Mud/lime walls
    acc.box((0.0, 0.8, 1.40), (3.5, 5.4, 2.04), PAL["cream_shade"])
    acc.box((0.0, 0.8, 2.15), (3.54, 5.44, 0.50), PAL["white_shade"])
    add_door(acc, -0.65, -1.9, 0.40, 0.92, 1.82, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["thatch_dark"], lod=lod)
    add_window(acc, 0.95, -1.9, 1.50, 0.78, 0.82, (0.0, -1.0), PAL["teak_dark"], PAL["recess"], PAL["teak_brown"], with_chajja=False, lod=lod)
    for sgn in (-1.0, 1.0):
        add_side_window(acc, sgn * 1.75, 0.8, 1.50, 0.78, 0.82, sgn, PAL["teak_dark"], PAL["recess"], PAL["teak_brown"], lod=lod)

    # Open bamboo/wooden porch posts & bench
    for px in (-1.65, 1.65):
        acc.cyl((px, -3.25, 1.38), 0.07, 0.065, 1.98, PAL["teak_brown"], segs=8 if lod == 0 else 6)
    acc.box((0.95, -2.55, 0.56), (1.25, 0.60, 0.34), PAL["thatch_dark"])
    if lod == 0:
        acc.cyl((0.0, -3.25, 2.32), 0.05, 0.05, 3.55, PAL["thatch_dark"], segs=6, rot_y=0.5 * math.pi)
        for bi in range(4):
            acc.cyl((0.40 + bi * 0.35, -3.25, 0.65), 0.025, 0.025, 0.65, PAL["thatch"], segs=5)
        add_pot_plant(acc, -1.55, -3.55, 0.24, 0.8, lod=0)

    # Multi-tiered hipped golden-brown palm-thatch roof with ridge cap & thatch ribs
    acc.pitched_roof(-2.05, 2.05, -3.90, 3.70, 2.24, 0.82, PAL["thatch_dark"], PAL["thatch_dark"], hip=True)
    acc.pitched_roof(-1.82, 1.82, -3.45, 3.30, 2.75, 1.15, PAL["thatch"], PAL["thatch_dark"], hip=True)
    acc.box((0.0, -0.05, 3.92), (0.30, 2.40, 0.16), PAL["thatch_dark"])
    if lod == 0:
        # Organic thatch bundle ribs along roof slopes
        for ti in range(13):
            tx = -1.65 + ti * 0.275
            acc.cyl((tx, -2.9, 2.70), 0.07, 0.05, 1.25, PAL["thatch"], segs=5, rot_x=0.5 * math.pi + 0.55)
            acc.cyl((tx, +2.8, 2.70), 0.07, 0.05, 1.25, PAL["thatch"], segs=5, rot_x=0.5 * math.pi - 0.55)
        for ty in range(18):
            ry = -3.1 + ty * 0.36
            acc.cyl((-1.35, ry, 2.85), 0.065, 0.05, 1.15, PAL["thatch"], segs=5, rot_y=0.5 * math.pi - 0.62)
            acc.cyl((+1.35, ry, 2.85), 0.065, 0.05, 1.15, PAL["thatch"], segs=5, rot_y=0.5 * math.pi + 0.62)
    return acc


def build_CHN_022_deep_verandah(lod: int) -> MeshAcc:
    """CHN_022_deep_verandah: 10x20m 1F Deep Verandah House with 2.8m portico, heavy wooden pillars & hipped main roof."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 20.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.28), (w - 0.2, d - 0.4, 0.56), PAL["red_dark"])
        acc.box((0.0, 1.8, 2.15), (9.4, 14.2, 3.2), PAL["cream"])
        acc.box((0.0, -7.2, 2.8), (9.6, 3.2, 0.24), PAL["tile_red"], rot_x=0.28)
        add_tiled_hip_roof(acc, -4.9, 4.9, -5.6, 9.2, 3.75, 1.75, PAL["cream_trim"], lod=2)
        return acc

    # Raised red-stone plinth + wide front stone steps
    acc.box((0.0, 0.0, 0.14), (w - 0.1, d - 0.2, 0.28), PAL["plinth"])
    acc.box((0.0, 0.5, 0.42), (9.6, 17.4, 0.56), PAL["red_dark"])
    for si, sy in enumerate((-8.55, -9.00, -9.45)):
        sh = 0.64 - si * 0.18
        acc.box((0.0, sy, 0.28 + 0.5 * sh), (3.4 + si * 0.4, 0.46, sh), PAL["surkhi"])

    # Extra-deep 2.8m shaded front portico (y in [-8.3, -5.4]) with heavy wooden pillars
    for px in (-4.4, -1.65, 1.65, 4.4):
        add_teak_pillar(acc, px, -8.1, 0.70, 2.45, 0.18, PAL["surkhi"], PAL["teak_brown"], PAL["teak_dark"], lod=lod)
        if lod == 0:
            acc.box((px, -6.7, 3.10), (0.24, 2.8, 0.22), PAL["teak_dark"])

    # Main block
    acc.box((0.0, 1.9, 2.35), (9.4, 14.6, 3.30), PAL["cream"])
    acc.box((0.0, 1.9, 0.76), (9.5, 14.7, 0.14), PAL["red_dark"])
    add_door(acc, 0.0, -5.4, 0.70, 1.48, 2.25, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
    add_ground_windows_row(acc, (-3.1, 3.1), -5.4, 2.02, 1.32, 1.38, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
    for sgn in (-1.0, 1.0):
        for wy in (-3.0, 0.8, 4.6, 7.6):
            add_side_window(acc, sgn * 4.7, wy, 2.02, 1.24, 1.32, sgn, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Sweeping clay-tile pitched overhang + hipped main roof behind
    add_clay_tile_canopy(acc, 9.7, -8.55, -5.35, 2.95, 3.92, PAL["cream_trim"], lod=lod)
    add_tiled_hip_roof(acc, -4.95, 4.95, -5.50, 9.35, 3.98, 1.75, PAL["cream_trim"], lod=lod, tile_step=0.40)
    if lod == 0:
        for sx in (-1, 1):
            add_pot_plant(acc, sx * 2.4, -8.55, 0.28, 1.0, lod=0)
    return acc


def build_CHN_023_madras_patio(lod: int) -> MeshAcc:
    """CHN_023_madras_patio: 12x18m 1F Madras Patio House with open front U-shaped courtyard & twin tiled side wings."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 12.0, 18.0
    if lod == 2:
        acc.box((0.0, 0.0, 0.18), (w, d, 0.36), PAL["plinth"])
        acc.box((0.0, 4.0, 2.0), (11.6, 8.8, 3.1), PAL["cream"])
        acc.box((-4.0, -3.8, 2.0), (3.6, 7.6, 3.1), PAL["cream"])
        acc.box((+4.0, -3.8, 2.0), (3.6, 7.6, 3.1), PAL["cream"])
        add_tiled_gable_roof(acc, -5.9, -2.1, -7.8, 0.4, 3.55, 1.25, PAL["cream"], lod=2)
        add_tiled_gable_roof(acc, 2.1, 5.9, -7.8, 0.4, 3.55, 1.25, PAL["cream"], lod=2)
        add_tiled_hip_roof(acc, -5.9, 5.9, -0.4, 8.6, 3.55, 1.45, PAL["cream_trim"], lod=2)
        return acc

    acc.box((0.0, 0.0, 0.12), (w, d, 0.24), PAL["plinth"])
    # Open central front U-patio floor + low front compound wall & gate
    acc.box((0.0, -3.6, 0.28), (4.6, 7.8, 0.20), PAL["surkhi"])
    add_compound_fence(acc, w, -8.5, -7.6, PAL["cream"], PAL["cream_trim"], lod=lod)

    # Rear hall block + twin projecting side wings
    acc.box((0.0, 4.1, 2.05), (11.6, 8.6, 3.30), PAL["cream"])
    for sx in (-1, 1):
        acc.box((sx * 4.0, -3.8, 2.05), (3.5, 7.6, 3.30), PAL["cream"])
        # Front windows on twin wings
        add_window(acc, sx * 4.0, -7.6, 1.92, 1.32, 1.34, (0.0, -1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
        # Side outer windows
        for wy in (-4.8, -1.2, 2.8, 6.2):
            add_side_window(acc, sx * 5.75, wy, 1.92, 1.18, 1.26, sx, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)
        # Colonnaded inner walkway pillars facing patio
        for py in (-6.8, -4.4, -2.0):
            add_teak_pillar(acc, sx * 2.05, py, 0.38, 2.65, 0.12, PAL["plinth"], PAL["cream_trim"], PAL["cream"], lod=lod)
        add_side_window(acc, sx * 2.25, -4.2, 1.92, 1.18, 1.26, -sx, PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Recessed hall door & flanking windows at back of U-patio (y = -0.2)
    acc.box((0.0, -0.6, 0.32), (4.2, 1.4, 0.26), PAL["plinth"])
    add_door(acc, 0.0, -0.2, 0.44, 1.42, 2.22, (0.0, -1.0), PAL["teak_dark"], PAL["teak_brown"], PAL["cream_trim"], lod=lod)
    add_window(acc, 0.0, 8.4, 1.92, 1.4, 1.3, (0.0, 1.0), PAL["teak_dark"], PAL["teak_green"], PAL["cream_trim"], lod=lod)

    # Pitched clay-tile roofs on twin wings + hipped roof on rear hall
    add_tiled_gable_roof(acc, -5.95, -1.75, -7.85, 0.25, 3.65, 1.30, PAL["cream"], lod=lod, tile_step=0.52)
    add_tiled_gable_roof(acc, 1.75, 5.95, -7.85, 0.25, 3.65, 1.30, PAL["cream"], lod=lod, tile_step=0.52)
    add_tiled_hip_roof(acc, -5.95, 5.95, -0.45, 8.65, 3.65, 1.55, PAL["cream_trim"], lod=lod, tile_step=0.54)
    if lod == 0:
        for px, py in ((-1.3, -6.5), (1.3, -6.5), (-1.4, -1.5), (1.4, -1.5)):
            add_pot_plant(acc, px, py, 0.38, 0.95, lod=0)
    return acc


# ---------------------------------------------------------------------------
# Shard 1 Specification Table (Exact 20 Traditional Chennai Houses)
# ---------------------------------------------------------------------------

SPECS: List[Dict] = [
    {
        "id": "B01_trad_house", "title": "Traditional Chennai House", "source_card": "01",
        "category": "residential", "substyle": "traditional_house",
        "preferred_localities": ["Mylapore", "Triplicane", "George Town"],
        "w": 8.0, "d": 12.0, "floors": 1, "shop_ground": False, "builder": build_B01_trad_house,
        "colliders": [("COL_Main", (0.0, 2.0, 2.15), (7.8, 7.0, 4.3)), ("COL_Verandah", (0.0, -2.35, 1.65), (7.8, 2.0, 3.3)), ("COL_Compound", (0.0, -5.6, 0.8), (7.9, 0.45, 1.6))],
    },
    {
        "id": "B02_old_residential", "title": "Old Chennai Residential", "source_card": "02",
        "category": "residential", "substyle": "old_urban",
        "preferred_localities": ["George Town", "Triplicane", "Mylapore"],
        "w": 10.0, "d": 14.0, "floors": 2, "shop_ground": False, "builder": build_B02_old_residential,
        "colliders": [("COL_Main", (0.0, 0.6, 3.75), (9.6, 12.0, 7.5))],
    },
    {
        "id": "B36_chettinad_house", "title": "Traditional Tamil House (Chettinad)", "source_card": "36",
        "category": "heritage", "substyle": "chettinad",
        "preferred_localities": ["Mylapore", "Adyar", "Besant Nagar"],
        "w": 15.0, "d": 25.0, "floors": 2, "shop_ground": False, "builder": build_B36_chettinad_house,
        "colliders": [("COL_Main", (0.0, 2.0, 4.2), (14.4, 18.0, 8.4)), ("COL_Verandah", (0.0, -8.1, 2.1), (14.5, 2.8, 4.2)), ("COL_Compound", (0.0, -12.0, 0.85), (14.8, 0.5, 1.7))],
    },
    {
        "id": "CHN_001_agraharam", "title": "Agraharam House", "source_card": "CHN_001",
        "category": "residential", "substyle": "agraharam",
        "preferred_localities": ["Mylapore", "Triplicane"],
        "w": 9.0, "d": 18.0, "floors": 1, "shop_ground": False, "builder": build_CHN_001_agraharam,
        "colliders": [("COL_Main", (0.0, 1.2, 2.75), (8.8, 15.0, 5.5)), ("COL_Verandah", (0.0, -7.5, 1.9), (8.9, 2.8, 3.8))],
    },
    {
        "id": "CHN_002_mylapore_trad", "title": "Mylapore Traditional House", "source_card": "CHN_002",
        "category": "residential", "substyle": "mylapore_trad",
        "preferred_localities": ["Mylapore", "Mandaveli"],
        "w": 10.0, "d": 16.0, "floors": 1, "shop_ground": False, "builder": build_CHN_002_mylapore_trad,
        "colliders": [("COL_Main", (0.0, 1.7, 2.45), (9.5, 11.8, 4.9)), ("COL_Compound", (0.0, -7.6, 0.85), (9.9, 0.45, 1.7))],
    },
    {
        "id": "CHN_003_courtyard_old", "title": "Old Chennai Courtyard House", "source_card": "CHN_003",
        "category": "residential", "substyle": "courtyard_old",
        "preferred_localities": ["George Town", "Mylapore"],
        "w": 12.0, "d": 20.0, "floors": 2, "shop_ground": False, "builder": build_CHN_003_courtyard_old,
        "colliders": [("COL_Main", (0.0, 0.0, 3.75), (11.7, 19.0, 7.5))],
    },
    {
        "id": "CHN_005_tiled_city", "title": "Tiled Roof City House", "source_card": "CHN_005",
        "category": "residential", "substyle": "tiled_city",
        "preferred_localities": ["Triplicane", "Mylapore"],
        "w": 6.0, "d": 12.0, "floors": 1, "shop_ground": False, "builder": build_CHN_005_tiled_city,
        "colliders": [("COL_Main", (0.0, 1.2, 2.55), (5.8, 9.0, 5.1)), ("COL_Verandah", (0.0, -4.1, 1.7), (5.8, 2.0, 3.4))],
    },
    {
        "id": "CHN_006_verandah_house", "title": "Verandah House", "source_card": "CHN_006",
        "category": "residential", "substyle": "verandah",
        "preferred_localities": ["Royapettah", "Mylapore"],
        "w": 8.0, "d": 18.0, "floors": 1, "shop_ground": False, "builder": build_CHN_006_verandah_house,
        "colliders": [("COL_Main", (0.0, 2.2, 2.45), (7.8, 11.8, 4.9)), ("COL_Verandah", (0.0, -5.0, 2.1), (7.8, 2.8, 4.2)), ("COL_Compound", (0.0, -8.6, 0.8), (7.9, 0.45, 1.6))],
    },
    {
        "id": "CHN_007_colonial_res", "title": "Colonial Residence (Local)", "source_card": "CHN_007",
        "category": "residential", "substyle": "colonial_local",
        "preferred_localities": ["Egmore", "Nungambakkam", "Kilpauk"],
        "w": 14.0, "d": 20.0, "floors": 2, "shop_ground": False, "builder": build_CHN_007_colonial_res,
        "colliders": [("COL_Main", (0.0, 2.2, 4.0), (13.4, 14.0, 8.0)), ("COL_Verandah", (0.0, -6.4, 3.8), (13.4, 3.4, 7.6))],
    },
    {
        "id": "CHN_008_inner_row", "title": "Inner City Row House", "source_card": "CHN_008",
        "category": "residential", "substyle": "inner_row",
        "preferred_localities": ["George Town", "Triplicane"],
        "w": 6.0, "d": 14.0, "floors": 2, "shop_ground": False, "builder": build_CHN_008_inner_row,
        "colliders": [("COL_Main", (0.0, 0.35, 3.7), (5.9, 12.8, 7.4))],
    },
    {
        "id": "CHN_009_trad_terrace", "title": "Traditional House with Terrace", "source_card": "CHN_009",
        "category": "residential", "substyle": "trad_terrace",
        "preferred_localities": ["Mylapore", "Anna Nagar"],
        "w": 10.0, "d": 18.0, "floors": 2, "shop_ground": False, "builder": build_CHN_009_trad_terrace,
        "colliders": [("COL_Main", (0.0, 1.25, 3.85), (9.5, 13.3, 7.7)), ("COL_Compound", (0.0, -8.5, 0.8), (9.9, 0.45, 1.6))],
    },
    {
        "id": "CHN_011_narrow_lane", "title": "Narrow Lane House", "source_card": "CHN_011",
        "category": "residential", "substyle": "narrow_lane_2f",
        "preferred_localities": ["George Town", "Royapuram"],
        "w": 5.0, "d": 12.0, "floors": 2, "shop_ground": False, "builder": build_CHN_011_narrow_lane,
        "colliders": [("COL_Main", (0.0, 0.25, 3.5), (4.9, 11.2, 7.0))],
    },
    {
        "id": "CHN_012_madras_terrace", "title": "Madras Terrace Brick House", "source_card": "CHN_012",
        "category": "residential", "substyle": "madras_terrace",
        "preferred_localities": ["Mylapore", "Egmore"],
        "w": 8.0, "d": 16.0, "floors": 2, "shop_ground": False, "builder": build_CHN_012_madras_terrace,
        "colliders": [("COL_Main", (0.0, 0.8, 3.85), (7.8, 12.4, 7.7)), ("COL_Compound", (0.0, -7.6, 0.8), (7.9, 0.45, 1.6))],
    },
    {
        "id": "CHN_013_twin_house", "title": "Twin House (Shared Wall)", "source_card": "CHN_013",
        "category": "residential", "substyle": "twin_house",
        "preferred_localities": ["West Mambalam", "Mylapore"],
        "w": 12.0, "d": 14.0, "floors": 1, "shop_ground": False, "builder": build_CHN_013_twin_house,
        "colliders": [("COL_Main", (0.0, 1.75, 2.35), (11.7, 9.6, 4.7)), ("COL_Verandah", (0.0, -3.9, 1.7), (11.7, 2.1, 3.4)), ("COL_Compound", (0.0, -6.6, 0.8), (11.9, 0.45, 1.6))],
    },
    {
        "id": "CHN_014_corner_trad", "title": "Corner Traditional House", "source_card": "CHN_014",
        "category": "residential", "substyle": "corner_trad",
        "preferred_localities": ["Mylapore", "T. Nagar"],
        "w": 14.0, "d": 18.0, "floors": 2, "shop_ground": False, "builder": build_CHN_014_corner_trad,
        "colliders": [("COL_Main", (-0.4, 0.4, 3.8), (13.0, 16.0, 7.6))],
    },
    {
        "id": "CHN_015_nalukettu", "title": "Courtyard House (Nalukettu)", "source_card": "CHN_015",
        "category": "residential", "substyle": "nalukettu",
        "preferred_localities": ["Mylapore", "Adyar"],
        "w": 18.0, "d": 24.0, "floors": 1, "shop_ground": False, "builder": build_CHN_015_nalukettu,
        "colliders": [("COL_Main", (0.0, 0.0, 2.5), (17.2, 22.0, 5.0))],
    },
    {
        "id": "CHN_016_worker_house", "title": "Worker's Traditional House", "source_card": "CHN_016",
        "category": "residential", "substyle": "worker_house",
        "preferred_localities": ["Royapuram", "Washermanpet"],
        "w": 5.0, "d": 10.0, "floors": 1, "shop_ground": False, "builder": build_CHN_016_worker_house,
        "colliders": [("COL_Main", (0.0, 0.3, 2.15), (4.8, 9.2, 4.3))],
    },
    {
        "id": "CHN_017_thatch_house", "title": "Rustic Thatched Roof House", "source_card": "CHN_017",
        "category": "residential", "substyle": "rustic_thatch",
        "preferred_localities": ["Outer Suburbs", "Kasimedu"],
        "w": 4.0, "d": 8.0, "floors": 1, "shop_ground": False, "builder": build_CHN_017_thatch_house,
        "colliders": [("COL_Main", (0.0, 0.2, 1.95), (3.8, 7.2, 3.9))],
    },
    {
        "id": "CHN_022_deep_verandah", "title": "Deep Verandah House", "source_card": "CHN_022",
        "category": "residential", "substyle": "deep_verandah",
        "preferred_localities": ["Mylapore", "Triplicane"],
        "w": 10.0, "d": 20.0, "floors": 1, "shop_ground": False, "builder": build_CHN_022_deep_verandah,
        "colliders": [("COL_Main", (0.0, 1.9, 2.85), (9.6, 14.8, 5.7)), ("COL_Verandah", (0.0, -6.9, 2.0), (9.6, 3.2, 4.0))],
    },
    {
        "id": "CHN_023_madras_patio", "title": "Madras Patio House", "source_card": "CHN_023",
        "category": "residential", "substyle": "madras_patio",
        "preferred_localities": ["Mylapore", "Adyar"],
        "w": 12.0, "d": 18.0, "floors": 1, "shop_ground": False, "builder": build_CHN_023_madras_patio,
        "colliders": [("COL_Main", (0.0, 4.1, 2.6), (11.7, 8.8, 5.2)), ("COL_Compound", (0.0, -8.5, 0.8), (11.9, 0.45, 1.6))],
    },
]


def verify_glb(glb_path: Path) -> Dict[str, object]:
    data = glb_path.read_bytes()
    if len(data) < 20:
        raise ValueError(f"{glb_path}: too small")
    magic, version, total_len = struct.unpack("<III", data[:12])
    if magic != 0x46546C67 or version != 2 or total_len != len(data):
        raise ValueError(f"{glb_path}: invalid GLB header")
    jlen, jtype = struct.unpack("<II", data[12:20])
    if jtype != 0x4E4F534A:
        raise ValueError(f"{glb_path}: missing JSON chunk")
    doc = json.loads(data[20 : 20 + jlen])
    node_names = {n.get("name", "") for n in doc.get("nodes", [])}
    for req in ("LOD0", "LOD1", "LOD2", "COL_Main"):
        if req not in node_names:
            raise ValueError(f"{glb_path}: missing node {req}")
    for m in doc.get("meshes", []):
        for prim in m.get("primitives", []):
            if "COLOR_0" not in prim.get("attributes", {}):
                raise ValueError(f"{glb_path}: mesh {m.get('name')} missing COLOR_0")
    return {"nodes": sorted(node_names)}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    models_meta: List[Dict] = []

    for sp in SPECS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mat = make_vertex_material(f"Mat_{sp['id']}")
        builder: Callable[[int], MeshAcc] = sp["builder"]
        lod0 = builder(0)
        lod1 = builder(1)
        lod2 = builder(2)

        out_glb = OUT_DIR / f"{sp['id']}.glb"
        tris = export_glb_scene(out_glb, mat, (lod0, lod1, lod2), sp["colliders"])

        # Collect height & full lod_stats from exported Blender objects
        lod0_obj = bpy.data.objects["LOD0"]
        max_z = max((v.co.z for v in lod0_obj.data.vertices), default=4.0)
        lod_stats: Dict[str, Dict[str, int]] = {}
        for ob in bpy.data.objects:
            if ob.type == "MESH":
                lod_stats[ob.name] = {
                    "verts": len(ob.data.vertices),
                    "tris": sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons),
                }

        verify_glb(out_glb)
        if not (800 <= tris["LOD0"] <= 5500):
            raise ValueError(f"{sp['id']} LOD0={tris['LOD0']} outside [800, 5500]")
        if not (250 <= tris["LOD1"] <= 1400):
            raise ValueError(f"{sp['id']} LOD1={tris['LOD1']} outside [250, 1400]")
        if not (20 <= tris["LOD2"] <= 250):
            raise ValueError(f"{sp['id']} LOD2={tris['LOD2']} outside [20, 250]")
        meta_entry = {
            "id": sp["id"],
            "title": sp["title"],
            "source_card": sp["source_card"],
            "category": sp["category"],
            "substyle": sp["substyle"],
            "preferred_localities": sp["preferred_localities"],
            "dimensions_m": {"width": sp["w"], "depth": sp["d"], "height": round(max_z, 2)},
            "floors": sp["floors"],
            "shop_ground": sp["shop_ground"],
            "glb_path": f"res://assets/buildings/pack_100/{sp['id']}.glb",
            "glb_bytes": out_glb.stat().st_size,
            "lod_stats": lod_stats,
        }
        models_meta.append(meta_entry)
        print(f"OK {sp['id']:24s} LOD0={tris['LOD0']:4d} LOD1={tris['LOD1']:4d} LOD2={tris['LOD2']:3d} bytes={out_glb.stat().st_size}")

    META_PATH.write_text(json.dumps({"shard": 1, "count": len(models_meta), "models": models_meta}, indent=2), encoding="utf-8")
    print(f"SHARD_1_DONE count={len(models_meta)} meta={META_PATH}")


if __name__ == "__main__":
    main()
