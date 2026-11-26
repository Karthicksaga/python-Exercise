"""Blender 5.x shard_3 builder: 20 Commercial & Mixed-Use Chennai buildings.

Generates LOD0 / LOD1 / LOD2 + COL_* meshes with linear vertex colours (Col)
and exports all 20 GLBs into godot-chennai/assets/buildings/pack_100/<id>.glb,
plus summary metadata godot-chennai/tools/blender/buildings/shard_3_meta.json.

Usage:
    /opt/homebrew/bin/blender -b --factory-startup --python godot-chennai/tools/blender/buildings/shard_3.py
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Sequence, Tuple

import bpy

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from chennai_kit import (
    PAL,
    MeshAcc,
    add_balcony,
    add_compound_fence,
    add_parapet_with_jaali,
    add_rooftop_props,
    add_shop_row,
    add_window,
    export_glb_scene,
    hex_lin,
    make_vertex_material,
)

ROOT = THIS_DIR.parents[2]
PACK_DIR = ROOT / "assets" / "buildings" / "pack_100"
META_PATH = THIS_DIR / "shard_3_meta.json"

# Extra accent shades derived cleanly via hex_lin (strictly no brand references)
EXTRA_PAL = {
    "sandstone": hex_lin("#D8BC8E"),
    "granite_dark": hex_lin("#23272D"),
    "granite_mid": hex_lin("#3C424B"),
    "steel_rib": hex_lin("#6A7784"),
    "marquee_rim": hex_lin("#B83228"),
    "awning_cream": hex_lin("#EFE6CE"),
    "cloth_teal": hex_lin("#3B8D96"),
    "cloth_gold": hex_lin("#DDA43A"),
    "brass": hex_lin("#C89B3C"),
    "plaza_stone": hex_lin("#B9B4A6"),
}


# ---------------------------------------------------------------------------
# Reusable Architectural Helpers
# ---------------------------------------------------------------------------

def add_potted_plant(acc: MeshAcc, px: float, py: float, pz: float, scale: float = 1.0, lod: int = 0) -> None:
    if lod >= 2:
        return
    acc.cyl((px, py, pz + 0.18 * scale), 0.13 * scale, 0.19 * scale, 0.36 * scale, PAL["pot"], segs=8 if lod == 0 else 6)
    acc.sphere((px, py, pz + 0.50 * scale), 0.24 * scale, PAL["foliage"], subdiv=1)
    if lod == 0:
        acc.sphere((px + 0.08 * scale, py - 0.06 * scale, pz + 0.44 * scale), 0.16 * scale, PAL["foliage_hi"], subdiv=1)


def add_ac_unit(
    acc: MeshAcc,
    cx: float,
    cy: float,
    cz: float,
    face_dir: Tuple[float, float],
    lod: int = 0,
) -> None:
    if lod >= 2:
        return
    nx, ny = face_dir
    if abs(ny) > abs(nx):
        acc.box((cx, cy + ny * 0.16, cz), (0.76, 0.30, 0.52), PAL["copper_ac"])
        if lod == 0:
            acc.cyl((cx - 0.14, cy + ny * 0.31, cz), 0.18, 0.18, 0.04, PAL["charcoal"], segs=8, rot_x=math.pi * 0.5)
            acc.box((cx + 0.20, cy + ny * 0.31, cz), (0.20, 0.03, 0.34), PAL["slate"])
    else:
        acc.box((cx + nx * 0.16, cy, cz), (0.30, 0.76, 0.52), PAL["copper_ac"])
        if lod == 0:
            acc.cyl((cx + nx * 0.31, cy - 0.14, cz), 0.18, 0.18, 0.04, PAL["charcoal"], segs=8, rot_y=math.pi * 0.5)
            acc.box((cx + nx * 0.31, cy + 0.20, cz), (0.03, 0.20, 0.34), PAL["slate"])


def add_window_grid(
    acc: MeshAcc,
    xs: Sequence[float],
    y_wall: float,
    zs: Sequence[float],
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
    if lod >= 2:
        return
    if lod == 1:
        nx, ny = face_dir
        xs_l1 = xs[::2] if len(xs) >= 4 else xs
        zs_l1 = zs[::2] if len(zs) >= 3 else zs
        for z in zs_l1:
            for x in xs_l1:
                if abs(ny) > abs(nx):
                    acc.box((x, y_wall + ny * 0.04, z), (ww, 0.06, wh), pane_col)
                    if with_chajja:
                        acc.box((x, y_wall + ny * 0.24, z + 0.5 * wh + 0.08), (ww + 0.24, 0.46, 0.08), trim_col, rot_x=ny * 0.22)
                else:
                    acc.box((y_wall + nx * 0.04, x, z), (0.06, ww, wh), pane_col)
                    if with_chajja:
                        acc.box((y_wall + nx * 0.24, x, z + 0.5 * wh + 0.08), (0.46, ww + 0.24, 0.08), trim_col, rot_y=-nx * 0.22)
        return
    for z in zs:
        for x in xs:
            add_window(
                acc, x, y_wall, z, ww, wh, face_dir,
                frame_col, pane_col, trim_col,
                with_chajja=with_chajja, with_grille=with_grille, arched=arched, lod=lod,
            )


def add_striped_awning(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    z_top: float,
    aw: float,
    ad: float,
    col_a: Tuple[float, float, float, float],
    col_b: Tuple[float, float, float, float],
    face_dir: Tuple[float, float] = (0.0, -1.0),
    slope: float = 0.34,
    lod: int = 0,
) -> None:
    if lod >= 2:
        return
    nx, ny = face_dir
    dz = ad * math.sin(slope)
    if abs(ny) > abs(nx):
        yc = y_wall + ny * (0.5 * ad)
        zc = z_top - 0.5 * dz
        if lod == 0:
            n_strips = max(6, min(14, int(aw / 0.35)))
            sw = aw / n_strips
            for si in range(n_strips):
                sx = cx - 0.5 * aw + (si + 0.5) * sw
                acc.box((sx, yc, zc), (sw * 0.96, ad, 0.06), col_a if si % 2 == 0 else col_b, rot_x=-ny * slope)
            # Valance drop & side brackets
            acc.box((cx, y_wall + ny * ad, z_top - dz - 0.08), (aw, 0.04, 0.16), col_a)
            for sgn in (-1, 1):
                acc.box((cx + sgn * (0.48 * aw), y_wall + ny * (0.45 * ad), z_top - 0.36), (0.04, ad * 0.85, 0.04), PAL["iron"], rot_x=ny * 0.25)
        else:
            acc.box((cx, yc, zc), (aw, ad, 0.07), col_a, rot_x=-ny * slope)
    else:
        xc = y_wall + nx * (0.5 * ad)
        zc = z_top - 0.5 * dz
        if lod == 0:
            n_strips = max(6, min(14, int(aw / 0.35)))
            sw = aw / n_strips
            for si in range(n_strips):
                sy = cx - 0.5 * aw + (si + 0.5) * sw
                acc.box((xc, sy, zc), (ad, sw * 0.96, 0.06), col_a if si % 2 == 0 else col_b, rot_y=nx * slope)
            acc.box((y_wall + nx * ad, cx, z_top - dz - 0.08), (0.04, aw, 0.16), col_a)
        else:
            acc.box((xc, cx, zc), (ad, aw, 0.07), col_a, rot_y=nx * slope)


def add_shop_bay(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    z_base: float,
    bay_w: float,
    bay_h: float,
    sign_col: Tuple[float, float, float, float],
    awning_col: Tuple[float, float, float, float],
    is_open: bool = True,
    with_awning: bool = True,
    face_dir: Tuple[float, float] = (0.0, -1.0),
    lod: int = 0,
) -> None:
    """Single commercial bay oriented along -Y or +X/-X with pilasters, shutter/open interior, generic fascia & awning."""
    nx, ny = face_dir
    sw = max(1.2, bay_w - 0.34)
    if abs(ny) > abs(nx):
        for sgn in (-1, 1):
            acc.box((cx + sgn * (0.5 * bay_w - 0.09), y_wall + ny * 0.06, z_base + 0.5 * bay_h), (0.18, 0.14, bay_h), PAL["cream_trim"])
        if is_open:
            acc.box((cx, y_wall + ny * 0.03, z_base + 1.15), (sw, 0.08, 2.30), PAL["lit_warm"])
            acc.box((cx, y_wall + ny * 0.08, z_base + 2.40), (sw + 0.04, 0.15, 0.28), PAL["shutter"])
            if lod == 0:
                acc.box((cx, y_wall + ny * 0.15, z_base + 0.44), (sw * 0.84, 0.28, 0.72), PAL["teak_brown"])
                acc.box((cx, y_wall + ny * 0.15, z_base + 0.82), (sw * 0.88, 0.34, 0.06), PAL["concrete"])
        else:
            acc.box((cx, y_wall + ny * 0.04, z_base + 1.24), (sw, 0.08, 2.48), PAL["shutter"])
            if lod == 0:
                for rz in (0.35, 0.72, 1.09, 1.46, 1.83, 2.20):
                    acc.box((cx, y_wall + ny * 0.09, z_base + rz), (sw - 0.06, 0.03, 0.04), PAL["slate"])
        acc.box((cx, y_wall + ny * 0.11, z_base + bay_h - 0.28), (sw + 0.08, 0.16, 0.54), sign_col)
        if lod < 2:
            acc.box((cx, y_wall + ny * 0.20, z_base + bay_h - 0.28), (sw * 0.76, 0.03, 0.22), PAL["cream_trim"])
        if with_awning and lod < 2:
            add_striped_awning(acc, cx, y_wall + ny * 0.12, z_base + 2.45, sw + 0.08, 0.92, awning_col, EXTRA_PAL["awning_cream"], face_dir=face_dir, lod=lod)
    else:
        for sgn in (-1, 1):
            acc.box((y_wall + nx * 0.06, cx + sgn * (0.5 * bay_w - 0.09), z_base + 0.5 * bay_h), (0.14, 0.18, bay_h), PAL["cream_trim"])
        if is_open:
            acc.box((y_wall + nx * 0.03, cx, z_base + 1.15), (0.08, sw, 2.30), PAL["lit_warm"])
            acc.box((y_wall + nx * 0.08, cx, z_base + 2.40), (0.15, sw + 0.04, 0.28), PAL["shutter"])
            if lod == 0:
                acc.box((y_wall + nx * 0.15, cx, z_base + 0.44), (0.28, sw * 0.84, 0.72), PAL["teak_brown"])
        else:
            acc.box((y_wall + nx * 0.04, cx, z_base + 1.24), (0.08, sw, 2.48), PAL["shutter"])
            if lod == 0:
                for rz in (0.40, 0.85, 1.30, 1.75, 2.20):
                    acc.box((y_wall + nx * 0.09, cx, z_base + rz), (0.03, sw - 0.06, 0.04), PAL["slate"])
        acc.box((y_wall + nx * 0.11, cx, z_base + bay_h - 0.28), (0.16, sw + 0.08, 0.54), sign_col)
        if lod < 2:
            acc.box((y_wall + nx * 0.20, cx, z_base + bay_h - 0.28), (0.03, sw * 0.76, 0.22), PAL["cream_trim"])
        if with_awning and lod < 2:
            add_striped_awning(acc, cx, y_wall + nx * 0.12, z_base + 2.45, sw + 0.08, 0.92, awning_col, EXTRA_PAL["awning_cream"], face_dir=face_dir, lod=lod)


def add_dogleg_stair_bay(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    z_base: float,
    floors: int,
    floor_h: float,
    wall_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Projecting exterior concrete dog-leg staircase bay on front (-Y) with landings & jaali slots."""
    bay_w = 2.8
    proj = 1.65
    total_h = floors * floor_h + 1.1
    yc = y_wall - 0.5 * proj
    # Side cheeks framing the open stairwell
    for sgn in (-1, 1):
        acc.box((cx + sgn * (0.5 * bay_w - 0.12), yc, z_base + 0.5 * total_h), (0.24, proj, total_h), wall_col)
    # Staircase head canopy
    acc.box((cx, yc - 0.08, z_base + total_h + 0.08), (bay_w + 0.30, proj + 0.28, 0.16), trim_col)
    if lod >= 2:
        acc.box((cx, y_wall - proj + 0.08, z_base + 0.5 * total_h), (bay_w - 0.3, 0.14, total_h - 0.2), PAL["recess"])
        return
    # Mid-landings + floor landings + sloped stair stringers + parapet rail
    y_front = y_wall - proj + 0.10
    for fl in range(floors):
        zf = z_base + fl * floor_h
        # Mid-landing slab visible at front
        acc.box((cx, y_front + 0.30, zf + 0.5 * floor_h), (bay_w - 0.44, 0.62, 0.14), trim_col)
        acc.box((cx, y_front, zf + 0.5 * floor_h + 0.42), (bay_w - 0.44, 0.10, 0.72), wall_col)
        if lod == 0:
            # Diagonal stair flight silhouette + handrail
            acc.box((cx - 0.55, yc, zf + 0.28 * floor_h), (0.95, proj * 0.85, 0.14), PAL["concrete"], rot_x=0.52)
            acc.box((cx + 0.55, yc, zf + 0.74 * floor_h), (0.95, proj * 0.85, 0.14), PAL["concrete"], rot_x=-0.52)
            acc.box((cx, y_front, zf + 0.5 * floor_h + 0.88), (bay_w - 0.40, 0.04, 0.04), PAL["iron"])
            # Perforated jaali blocks above landing
            for jx in (-0.75, -0.25, 0.25, 0.75):
                acc.box((cx + jx, y_front, zf + 0.5 * floor_h + 1.05), (0.14, 0.08, 0.30), trim_col)


def add_curtain_wall(
    acc: MeshAcc,
    span_a: float,
    span_b: float,
    wall_pos: float,
    z0: float,
    z1: float,
    face_dir: Tuple[float, float],
    n_cols: int,
    n_floors: int,
    glass_col: Tuple[float, float, float, float],
    mullion_col: Tuple[float, float, float, float],
    spandrel_col: Tuple[float, float, float, float],
    lod: int = 0,
    with_fins: bool = False,
) -> None:
    """Efficient large-scale glass curtain wall with spandrels & mullions (low tri budget)."""
    nx, ny = face_dir
    span = span_b - span_a
    mid_s = 0.5 * (span_a + span_b)
    h = z1 - z0
    fh = h / max(1, n_floors)
    # Main recessed glass sheet
    if abs(ny) > abs(nx):
        acc.box((mid_s, wall_pos + ny * 0.03, z0 + 0.5 * h), (span - 0.2, 0.06, h - 0.1), glass_col)
    else:
        acc.box((wall_pos + nx * 0.03, mid_s, z0 + 0.5 * h), (0.06, span - 0.2, h - 0.1), glass_col)
    if lod >= 2:
        return
    # Horizontal spandrel bands
    step_f = 1 if lod == 0 else 2
    for fi in range(0, n_floors + 1, step_f):
        zf = z0 + fi * fh
        if abs(ny) > abs(nx):
            acc.box((mid_s, wall_pos + ny * 0.09, zf), (span + 0.04, 0.14, 0.42 if fi < n_floors else 0.30), spandrel_col)
        else:
            acc.box((wall_pos + nx * 0.09, mid_s, zf), (0.14, span + 0.04, 0.42 if fi < n_floors else 0.30), spandrel_col)
    # Vertical mullions / sun-shatter fins
    cols = n_cols if lod == 0 else max(2, n_cols // 3)
    fin_d = 0.42 if (with_fins and lod == 0) else 0.12
    fin_w = 0.10 if with_fins else 0.08
    for ci in range(cols + 1):
        s_pos = span_a + ci * (span / cols)
        if abs(ny) > abs(nx):
            acc.box((s_pos, wall_pos + ny * (0.08 + 0.5 * fin_d), z0 + 0.5 * h), (fin_w, fin_d, h), mullion_col)
        else:
            acc.box((wall_pos + nx * (0.08 + 0.5 * fin_d), s_pos, z0 + 0.5 * h), (fin_d, fin_w, h), mullion_col)


def add_porte_cochere(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    z_base: float,
    pw: float,
    pd: float,
    ph: float,
    canopy_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    pillar_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Grand drop-off porte-cochere canopy with twin/quad piers & lit soffit."""
    yc = y_wall - 0.5 * pd
    acc.box((cx, yc, z_base + ph), (pw, pd, 0.42), canopy_col)
    if lod < 2:
        acc.box((cx, yc, z_base + ph + 0.24), (pw + 0.16, pd + 0.16, 0.12), trim_col)
        acc.box((cx, yc, z_base + ph - 0.22), (pw - 0.4, pd - 0.4, 0.05), PAL["lit_warm"])
    # Outer supporting columns
    for sx in (-1, 1):
        px = cx + sx * (0.5 * pw - 0.45)
        py = y_wall - pd + 0.45
        acc.box((px, py, z_base + 0.5 * ph), (0.55, 0.55, ph), pillar_col)
        if lod == 0:
            acc.box((px, py, z_base + 0.25), (0.72, 0.72, 0.50), PAL["plinth"])


def add_rooftop_chiller_plant(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z_roof: float,
    pw: float,
    pd: float,
    lod: int = 0,
) -> None:
    """IT / Commercial rooftop HVAC chiller screen & cooling towers."""
    if lod >= 2:
        acc.box((cx, cy, z_roof + 1.0), (pw, pd, 2.0), PAL["slate"])
        return
    acc.box((cx, cy, z_roof + 1.10), (pw, pd, 2.20), PAL["slate"])
    if lod == 0:
        # Louvered side ribs & two cooling tower cylinders
        for sx in (-0.30, 0.30):
            acc.cyl((cx + sx * pw, cy, z_roof + 2.35), min(1.2, 0.14 * pw), min(1.0, 0.12 * pw), 0.9, PAL["steel_light"], segs=10)
        acc.box((cx, cy, z_roof + 2.24), (pw + 0.2, pd + 0.2, 0.10), PAL["concrete"])


def add_arch_portal(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    z_base: float,
    pw: float,
    rect_h: float,
    face_dir: Tuple[float, float],
    frame_col: Tuple[float, float, float, float],
    recess_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Neoclassical semi-circular arched doorway/window portal."""
    nx, ny = face_dir
    rad = 0.5 * pw
    if abs(ny) > abs(nx):
        acc.box((cx, y_wall + ny * 0.04, z_base + 0.5 * rect_h), (pw, 0.14, rect_h), recess_col)
        acc.arch_slab(cx, y_wall + ny * 0.04, z_base + rect_h, 0.14, rad, 10 if lod == 0 else 6, recess_col)
        if lod == 0:
            for sgn in (-1, 1):
                acc.box((cx + sgn * (rad + 0.14), y_wall + ny * 0.10, z_base + 0.5 * rect_h), (0.28, 0.22, rect_h), frame_col)
            acc.arch_slab(cx, y_wall + ny * 0.10, z_base + rect_h, 0.16, rad + 0.14, 10, frame_col)
            # Keystone
            acc.box((cx, y_wall + ny * 0.16, z_base + rect_h + rad + 0.06), (0.26, 0.20, 0.32), PAL["cream_trim"])
    else:
        acc.box((y_wall + nx * 0.04, cx, z_base + 0.5 * rect_h), (0.14, pw, rect_h), recess_col)
        if lod == 0:
            for sgn in (-1, 1):
                acc.box((y_wall + nx * 0.10, cx + sgn * (rad + 0.14), z_base + 0.5 * rect_h), (0.22, 0.28, rect_h), frame_col)


def add_crate_stack(acc: MeshAcc, cx: float, cy: float, pz: float, lod: int = 0) -> None:
    if lod >= 1:
        return
    acc.box((cx, cy, pz + 0.25), (0.70, 0.55, 0.50), PAL["teak_brown"])
    acc.box((cx + 0.06, cy - 0.04, pz + 0.68), (0.52, 0.44, 0.36), PAL["ochre"])
    acc.box((cx + 0.65, cy + 0.08, pz + 0.20), (0.48, 0.48, 0.40), PAL["terracotta"])


# ---------------------------------------------------------------------------
# Building Builders (20 exact buildings in shard 3)
# ---------------------------------------------------------------------------

def build_chn_051_walkup_apt(lod: int) -> MeshAcc:
    """CHN_051: Walk-up Apartment (10x20m, 3F) - Yellow ochre, exterior dog-leg stair bay, recessed corridors."""
    acc = MeshAcc(f"LOD{lod}")
    w, d, h = 10.0, 16.5, 10.2
    hw, hd = 0.5 * w, 0.5 * d
    yc = 1.4  # shifted back to leave front compound yard (-8.6 to -10.0)
    y_front, y_back = yc - hd, yc + hd

    # Compound yard & fence (10x20m overall envelope: y in [-10, +9.65])
    acc.box((0.0, -0.2, 0.05), (w, 19.6, 0.10), PAL["pavement"])
    add_compound_fence(acc, w, -9.8, y_front, PAL["ochre"], PAL["cream_trim"], modern_wood_gate=False, lod=lod)

    # Plinth + main 3F yellow ochre volume
    acc.box((0.0, yc, 0.25), (w + 0.16, d + 0.16, 0.50), PAL["plinth"])
    if lod >= 2:
        acc.box((0.0, yc, 0.5 + 0.5 * 9.3), (w, d, 9.3), PAL["ochre"])
        add_dogleg_stair_bay(acc, -2.0, y_front, 0.5, 3, 3.1, PAL["ochre"], PAL["cream_trim"], lod=lod)
        add_parapet_with_jaali(acc, w, d, 9.8, 0.85, PAL["ochre"], PAL["cream_trim"], PAL["cream_shade"], pediment=False, lod=lod)
        return acc

    acc.box((0.0, yc, 0.5 + 0.5 * 9.3), (w, d, 9.3), PAL["ochre"])
    # Recessed corridor bands on right-front (+0.8..+4.2) for F1 & F2
    for fl in range(3):
        zf = 0.5 + fl * 3.1
        acc.box((0.0, yc, zf), (w + 0.16, d + 0.12, 0.12), PAL["cream_trim"])
        if fl >= 1:
            # Recessed open corridor pocket on front-right
            acc.box((2.1, y_front - 0.02, zf + 1.4), (4.6, 0.14, 2.5), PAL["recess"])
            acc.box((2.1, y_front - 0.22, zf + 0.45), (4.8, 0.45, 0.90), PAL["ochre"])
            acc.box((2.1, y_front - 0.42, zf + 0.94), (4.8, 0.10, 0.08), PAL["cream_trim"])
            if lod == 0:
                acc.box((0.8, y_front - 0.38, zf + 1.55), (0.20, 0.20, 2.2), PAL["cream_trim"])
                acc.box((4.3, y_front - 0.38, zf + 1.55), (0.20, 0.20, 2.2), PAL["cream_trim"])
                acc.box((2.1, y_front - 0.42, zf + 1.15), (4.5, 0.04, 0.04), PAL["iron"])
        else:
            # Ground-floor entrance door & window on front-right
            acc.box((2.2, y_front - 0.03, zf + 1.1), (1.15, 0.08, 2.2), PAL["teak_brown"])
            add_window(acc, 3.8, y_front, zf + 1.55, 1.15, 1.25, (0, -1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)

    # Prominent exterior dog-leg staircase bay on front-left
    add_dogleg_stair_bay(acc, -2.1, y_front, 0.5, 3, 3.1, PAL["ochre"], PAL["cream_trim"], lod=lod)

    # Side and rear windows
    zs = (2.05, 5.15, 8.25)
    ys_side = (yc - 5.2, yc - 1.6, yc + 2.0, yc + 5.6)
    add_window_grid(acc, ys_side, -hw, zs, 1.20, 1.25, (-1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window_grid(acc, ys_side, +hw, zs, 1.20, 1.25, (+1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window_grid(acc, (-3.0, 0.0, 3.0), y_back, zs, 1.25, 1.25, (0, +1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)

    if lod == 0:
        for z in (4.5, 7.6):
            add_ac_unit(acc, +hw, yc - 3.4, z, (+1, 0), lod=lod)
            add_ac_unit(acc, -hw, yc + 0.2, z, (-1, 0), lod=lod)
        add_potted_plant(acc, 0.6, y_front - 0.35, 0.1, 1.0, lod)

    z_par_top = add_parapet_with_jaali(acc, w, d, 9.8, 0.90, PAL["ochre"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    # Offset rooftop props to yc
    acc.box((-2.2, yc + 3.5, 9.8 + 0.30), (1.4, 1.4, 0.60), PAL["red_brick"])
    acc.cyl((-2.2, yc + 3.5, 9.8 + 1.25), 0.58, 0.58, 1.30, PAL["tank"], segs=10 if lod == 0 else 6)
    acc.cyl((+2.2, yc + 3.5, 9.8 + 1.05), 0.52, 0.52, 1.15, PAL["tank"], segs=10 if lod == 0 else 6)
    acc.box((+2.2, yc + 3.5, 9.8 + 0.24), (1.2, 1.2, 0.48), PAL["concrete"])
    return acc


def build_chn_052_builder_floor(lod: int) -> MeshAcc:
    """CHN_052: Builder Floor Apartment (14x22m, 4F) - Stilt parking ground + 3 uniform glass-balcony levels."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 14.0, 22.0
    hw, hd = 0.5 * w, 0.5 * d
    stilt_h = 3.2
    fl_h = 3.2
    z_eaves = stilt_h + 3 * fl_h  # 12.8m

    acc.box((0.0, 0.0, 0.06), (w, d, 0.12), PAL["pavement"])
    # Low perimeter stilt compound wall & modern wood gate on front
    add_compound_fence(acc, w, -hd + 0.25, -hd + 3.2, PAL["slate"], PAL["white"], modern_wood_gate=True, lod=lod)

    if lod >= 2:
        # Stilt core + upper 3F block
        acc.box((0.0, +1.0, 0.5 * stilt_h), (w - 3.0, d - 5.0, stilt_h), PAL["concrete"])
        acc.box((0.0, 0.0, stilt_h + 0.5 * (3 * fl_h)), (w, d, 3 * fl_h), PAL["cream"])
        acc.box((0.0, 0.0, z_eaves + 0.5), (w + 0.2, d + 0.2, 1.0), PAL["slate"])
        return acc

    # Stilt parking floor: rear lobby core + 3x5 column grid
    acc.box((0.0, +3.5, 0.5 * stilt_h), (6.4, 8.0, stilt_h), PAL["concrete"])
    acc.box((0.0, -0.52, 1.3), (1.6, 0.08, 2.4), PAL["teak_dark"])  # lobby door
    col_xs = (-hw + 0.45, -2.3, +2.3, +hw - 0.45) if lod == 0 else (-hw + 0.45, +hw - 0.45)
    col_ys = (-hd + 2.8, -4.0, +0.5, +5.0, +hd - 0.5) if lod == 0 else (-hd + 2.8, +hd - 0.5)
    for cx in col_xs:
        for cy in col_ys:
            acc.box((cx, cy, 0.5 * stilt_h), (0.48, 0.48, stilt_h), PAL["slate"])

    # Upper 3 builder-floor apartments: cream wall + vertical grey frame ribs
    acc.box((0.0, 0.0, stilt_h + 0.5 * (3 * fl_h)), (w - 0.1, d - 1.6, 3 * fl_h), PAL["cream"])
    for sx in (-1, 1):
        acc.box((sx * (hw - 0.28), -0.4, stilt_h + 0.5 * (3 * fl_h) + 0.4), (0.56, d - 1.2, 3 * fl_h + 0.8), PAL["slate"])
    acc.box((0.0, -0.4, stilt_h + 0.5 * (3 * fl_h) + 0.4), (0.60, d - 1.2, 3 * fl_h + 0.8), PAL["slate"])

    # 3 uniform builder-floor balcony levels on front (-Y)
    for fi in range(3):
        zf = stilt_h + fi * fl_h
        acc.box((0.0, -0.2, zf), (w + 0.16, d - 1.2, 0.18), PAL["white"])
        add_balcony(acc, -3.5, -hd + 0.8, zf, 5.4, 1.35, PAL["white"], glass_rail=True, lod=lod)
        add_balcony(acc, +3.5, -hd + 0.8, zf, 5.4, 1.35, PAL["white"], glass_rail=True, lod=lod)

    # Side & rear windows
    zs = (stilt_h + 1.6, stilt_h + fl_h + 1.6, stilt_h + 2 * fl_h + 1.6)
    side_ys = (-6.0, -1.5, +3.0, +7.2)
    add_window_grid(acc, side_ys, -hw + 0.04, zs, 1.45, 1.35, (-1, 0), PAL["charcoal"], PAL["glass_blue"], PAL["white"], lod=lod)
    add_window_grid(acc, side_ys, +hw - 0.04, zs, 1.45, 1.35, (+1, 0), PAL["charcoal"], PAL["glass_blue"], PAL["white"], lod=lod)
    add_window_grid(acc, (-4.2, 0.0, +4.2), +hd - 0.8, zs, 1.50, 1.35, (0, +1), PAL["charcoal"], PAL["glass_blue"], PAL["white"], lod=lod)

    if lod == 0:
        for z in (stilt_h + 2.2, stilt_h + fl_h + 2.2, stilt_h + 2 * fl_h + 2.2):
            add_ac_unit(acc, -hw, +1.0, z, (-1, 0), lod=lod)
            add_ac_unit(acc, +hw, +1.0, z, (+1, 0), lod=lod)

    add_parapet_with_jaali(acc, w, d - 1.4, z_eaves, 1.0, PAL["white"], PAL["slate"], PAL["concrete"], pediment=False, lod=lod)
    add_rooftop_props(acc, w, d - 1.4, z_eaves + 0.16, lod=lod, add_tank=True)
    return acc


def build_chn_058_apt_with_shops(lod: int) -> MeshAcc:
    """CHN_058: Apartment with Shops (G+3) (18x28m, 4F) - 4 ground shops + 3 residential balcony floors."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 28.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 3.6, 3.2
    z_eaves = g_h + 3 * fl_h  # 13.2m

    acc.box((0.0, 0.0, 0.08), (w + 0.3, d + 0.3, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * g_h), (w, d, g_h), PAL["concrete"])
        acc.box((0.0, 0.0, g_h + 0.5 * (3 * fl_h)), (w, d - 0.6, 3 * fl_h), PAL["salmon"])
        acc.box((0.0, 0.0, z_eaves + 0.5), (w + 0.2, d, 1.0), PAL["cream_trim"])
        return acc

    # Ground commercial block + 4 distinct front shop bays + side residential lobby
    acc.box((0.0, 0.0, 0.5 * g_h), (w, d - 0.8, g_h), PAL["cream_shade"])
    shop_w = 14.4
    bay_w = shop_w / 4.0
    sign_cols = (PAL["sign_green"], PAL["sign_red"], PAL["sign_blue"], PAL["sign_yellow"])
    awn_cols = (PAL["terracotta"], PAL["steel_blue"], PAL["sign_green"], PAL["mustard"])
    for bi in range(4):
        bx = -hw + 0.3 + (bi + 0.5) * bay_w
        add_shop_bay(acc, bx, -hd + 0.4, 0.16, bay_w, 3.35, sign_cols[bi], awn_cols[bi], is_open=(bi % 2 == 0), with_awning=True, lod=lod)

    # Residential entrance vestibule on front-right (+X)
    acc.box((+hw - 1.55, -hd + 0.4, 1.85), (2.5, 0.16, 3.35), PAL["cream_trim"])
    acc.box((+hw - 1.55, -hd + 0.34, 1.25), (1.3, 0.08, 2.3), PAL["teak_brown"])
    if lod == 0:
        add_potted_plant(acc, +hw - 2.6, -hd - 0.1, 0.16, 1.0, lod)
        add_potted_plant(acc, +hw - 0.5, -hd - 0.1, 0.16, 1.0, lod)

    # Upper 3 residential floors (salmon & cream trim)
    acc.box((0.0, 0.2, g_h + 0.5 * (3 * fl_h)), (w, d - 1.2, 3 * fl_h), PAL["salmon"])
    for fi in range(3):
        zf = g_h + fi * fl_h
        acc.box((0.0, 0.2, zf), (w + 0.2, d - 1.0, 0.16), PAL["cream_trim"])
        for bx in (-6.0, 0.0, +6.0):
            add_balcony(acc, bx, -hd + 0.4, zf, 4.2, 1.15, PAL["cream_trim"], glass_rail=True, lod=lod)

    zs = (g_h + 1.65, g_h + fl_h + 1.65, g_h + 2 * fl_h + 1.65)
    side_ys = (-7.0, +7.0)
    add_window_grid(acc, side_ys, -hw, zs, 1.45, 1.30, (-1, 0), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], with_grille=False, lod=lod)
    add_window_grid(acc, side_ys, +hw, zs, 1.45, 1.30, (+1, 0), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], with_grille=False, lod=lod)
    add_window_grid(acc, (-5.0, +5.0), +hd - 0.4, zs, 1.50, 1.30, (0, +1), PAL["teak_dark"], PAL["glass_blue"], PAL["cream_trim"], with_grille=False, lod=lod)

    if lod == 0:
        for z in (g_h + 2.2, g_h + fl_h + 2.2, g_h + 2 * fl_h + 2.2):
            add_ac_unit(acc, -hw, -5.5, z, (-1, 0), lod)
            add_ac_unit(acc, +hw, +5.0, z, (+1, 0), lod)

    add_parapet_with_jaali(acc, w, d - 1.2, z_eaves, 1.0, PAL["salmon"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    add_rooftop_props(acc, w, d - 1.2, z_eaves + 0.16, lod=lod, add_tank=True)
    return acc


def build_chn_059_studio_apt(lod: int) -> MeshAcc:
    """CHN_059: Service Apartment / Studio Block (16x24m, 5F) - Charcoal & white vertical grid, glazed French windows."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 16.0, 24.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 3.5, 3.1
    z_eaves = g_h + 4 * fl_h  # 15.9m

    acc.box((0.0, 0.0, 0.08), (w + 0.2, d + 0.2, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * z_eaves), (w, d, z_eaves), PAL["charcoal"])
        acc.box((0.0, -hd + 0.2, 0.5 * z_eaves + 0.4), (w * 0.7, 0.3, z_eaves), PAL["white"])
        return acc

    # Main 5F charcoal/white core
    acc.box((0.0, 0.0, 0.5 * z_eaves), (w - 0.3, d - 0.6, z_eaves), PAL["charcoal"])
    # Ground lobby portico
    acc.box((0.0, -hd + 0.8, g_h), (w - 1.2, 1.8, 0.24), PAL["white"])
    acc.box((0.0, -hd + 0.35, 1.65), (6.5, 0.12, 3.1), PAL["glass_aqua"])
    for sx in (-1, 1):
        acc.box((sx * 4.2, -hd + 0.2, 0.5 * g_h), (0.55, 0.55, g_h), PAL["white"])
        if lod == 0:
            add_potted_plant(acc, sx * 5.2, -hd - 0.2, 0.16, 1.2, lod)

    # Vertical white structural frame fins on front (-Y) creating 4 studio bays
    fin_xs = (-hw + 0.3, -4.0, 0.0, +4.0, +hw - 0.3)
    for fx in fin_xs:
        acc.box((fx, -hd + 0.1, 0.5 * z_eaves + 0.4), (0.48, 1.15, z_eaves + 0.8), PAL["white"])

    # Upper 4 floors: vertical grid of glazed French windows + slim recessed balconies
    bay_xs = (-5.9, -2.0, +2.0, +5.9)
    for fi in range(1, 5):
        zf = g_h + (fi - 1) * fl_h
        acc.box((0.0, -hd + 0.3, zf), (w + 0.1, 1.0, 0.16), PAL["white"])
        for bx in bay_xs:
            # Slim recessed studio balcony + tall French window
            acc.box((bx, -hd + 0.36, zf + 1.55), (3.1, 0.08, 2.55), PAL["glass_blue"] if (fi + int(bx)) % 2 == 0 else PAL["lit_warm"])
            if lod == 0:
                acc.box((bx, -hd + 0.32, zf + 1.55), (0.08, 0.10, 2.55), PAL["charcoal"])
                acc.box((bx, -hd - 0.18, zf + 0.52), (3.2, 0.06, 0.88), PAL["glass_rail"])
                acc.box((bx, -hd - 0.18, zf + 0.98), (3.25, 0.09, 0.06), PAL["steel_light"])
            else:
                acc.box((bx, -hd - 0.16, zf + 0.48), (3.2, 0.08, 0.82), PAL["glass_rail"])

    # Side & rear crisp modern window grid
    zs = tuple(g_h + (i - 0.5) * fl_h for i in range(1, 5))
    add_window_grid(acc, (-7.5, -2.5, +2.5, +7.5), -hw + 0.15, zs, 1.65, 2.0, (-1, 0), PAL["white"], PAL["glass_blue"], PAL["slate"], with_chajja=False, with_grille=False, lod=lod)
    add_window_grid(acc, (-7.5, -2.5, +2.5, +7.5), +hw - 0.15, zs, 1.65, 2.0, (+1, 0), PAL["white"], PAL["glass_blue"], PAL["slate"], with_chajja=False, with_grille=False, lod=lod)
    add_window_grid(acc, (-5.0, 0.0, +5.0), +hd - 0.3, zs, 1.80, 2.0, (0, +1), PAL["white"], PAL["glass_blue"], PAL["slate"], with_chajja=False, with_grille=False, lod=lod)

    # Rooftop pergola & tank/plant
    acc.box((0.0, 0.0, z_eaves + 0.55), (w, d - 0.4, 0.95), PAL["white"])
    if lod == 0:
        for px in range(-5, 6, 2):
            acc.box((float(px), -3.0, z_eaves + 2.4), (0.20, 6.0, 0.22), PAL["charcoal"])
    add_rooftop_props(acc, w, d - 0.6, z_eaves + 0.12, lod=lod, add_tank=True)
    return acc


def build_b09_house_with_shop(lod: int) -> MeshAcc:
    """B09: Individual House with Shop (8x12m, 2F) - Weathered yellow house, single open shop bay, striped canopy, upper green shutters."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 8.0, 12.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, f1_h = 3.4, 3.1
    z_eaves = g_h + f1_h  # 6.5m

    acc.box((0.0, 0.0, 0.08), (w, d, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.4, 0.5 * z_eaves), (w, d - 1.2, z_eaves), PAL["ochre"])
        acc.box((0.0, 0.4, z_eaves + 0.45), (w + 0.16, d - 1.0, 0.9), PAL["cream_trim"])
        return acc

    # Main 2F weathered yellow house block
    acc.box((0.0, 0.5, 0.5 * z_eaves + 0.08), (w, d - 1.4, z_eaves), PAL["ochre"])
    y_front = -hd + 1.2

    # Ground floor right: open provision/tea shop bay + striped canopy + counter + signboard
    add_shop_bay(acc, +1.55, y_front, 0.16, 4.4, 3.15, PAL["sign_red"], PAL["sign_yellow"], is_open=True, with_awning=True, lod=lod)
    if lod == 0:
        add_crate_stack(acc, +3.2, y_front - 0.55, 0.16, lod=lod)

    # Ground floor left: house porch entry + teak door + compound gate pier
    acc.box((-2.25, y_front - 0.04, 1.35), (1.15, 0.08, 2.30), PAL["teak_brown"])
    add_window(acc, -0.95, y_front, 1.65, 0.90, 1.15, (0, -1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    acc.box((-3.75, -hd + 0.25, 0.85), (0.38, 0.38, 1.55), PAL["ochre"])
    acc.box((-0.75, -hd + 0.25, 0.85), (0.38, 0.38, 1.55), PAL["ochre"])
    if lod == 0:
        acc.box((-2.25, -hd + 0.25, 0.72), (2.6, 0.06, 1.15), PAL["iron"])
        add_potted_plant(acc, -3.3, -hd - 0.15, 0.16, 0.9, lod)

    # Upper floor: green-shuttered windows + small balcony
    acc.box((0.0, 0.5, g_h + 0.12), (w + 0.18, d - 1.2, 0.14), PAL["cream_trim"])
    add_balcony(acc, -1.8, y_front, g_h + 0.16, 3.2, 0.95, PAL["cream_trim"], glass_rail=False, lod=lod)
    add_window(acc, +1.1, y_front, g_h + 1.75, 1.20, 1.25, (0, -1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window(acc, +2.8, y_front, g_h + 1.75, 1.20, 1.25, (0, -1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)

    # Sides & rear windows
    for zs in (1.75, g_h + 1.75):
        for sy in (-2.0, +2.5):
            add_window(acc, sy, -hw, zs, 1.1, 1.15, (-1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
            add_window(acc, sy, +hw, zs, 1.1, 1.15, (+1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
        add_window(acc, -1.8, +hd - 0.2, zs, 1.1, 1.15, (0, +1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
        add_window(acc, +1.8, +hd - 0.2, zs, 1.1, 1.15, (0, +1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)

    if lod == 0:
        add_ac_unit(acc, +hw, +0.2, g_h + 2.1, (+1, 0), lod)

    add_parapet_with_jaali(acc, w, d - 1.4, z_eaves + 0.08, 0.85, PAL["ochre"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    add_rooftop_props(acc, w, d - 1.4, z_eaves + 0.24, lod=lod, add_tank=True)
    return acc


def build_b11_street_shop(lod: int) -> MeshAcc:
    """B11: Street Shop (Local Market) (6x12m, 2F) - Narrow 6m shop, deep striped canvas awning, showcase display, cornice parapet."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 12.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, f1_h = 3.5, 2.9
    z_eaves = g_h + f1_h  # 6.4m

    acc.box((0.0, 0.0, 0.08), (w, d, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.5, 0.5 * z_eaves), (w, d - 1.4, z_eaves), PAL["cream"])
        acc.box((0.0, -hd + 0.9, 2.5), (w, 1.3, 0.3), PAL["terracotta"])
        return acc

    acc.box((0.0, 0.6, 0.5 * z_eaves + 0.08), (w, d - 1.6, z_eaves), PAL["cream"])
    y_front = -hd + 1.4

    # Ground shop bay: full 5.4m lit showcase display + deep striped canvas awning + bold generic board
    add_shop_bay(acc, 0.0, y_front, 0.16, 5.4, 3.25, PAL["sign_yellow"], PAL["sign_red"], is_open=True, with_awning=False, lod=lod)
    add_striped_awning(acc, 0.0, y_front - 0.10, 2.65, 5.8, 1.45, PAL["crimson"], EXTRA_PAL["awning_cream"], face_dir=(0, -1), slope=0.32, lod=lod)
    if lod == 0:
        # Sidewalk display shelves & crates + upper fascia frame brackets
        acc.box((-1.9, y_front - 0.55, 0.58), (1.3, 0.55, 0.85), PAL["teak_brown"])
        acc.box((+1.9, y_front - 0.55, 0.58), (1.3, 0.55, 0.85), PAL["teak_brown"])
        add_crate_stack(acc, 0.0, y_front - 0.50, 0.16, lod)
        add_potted_plant(acc, -2.65, -hd + 0.1, 0.16, 0.85, lod)

    # Upper shuttered storeroom windows + moulded cornice
    acc.box((0.0, 0.6, g_h + 0.12), (w + 0.24, d - 1.4, 0.18), PAL["mustard"])
    for wx in (-1.45, +1.45):
        add_window(acc, wx, y_front, g_h + 1.55, 1.25, 1.35, (0, -1), PAL["teak_brown"], PAL["teak_dark"], PAL["cream_trim"], lod=lod)
    for sy in (-2.0, +2.6):
        add_window(acc, sy, -hw, g_h + 1.55, 1.1, 1.2, (-1, 0), PAL["teak_brown"], PAL["recess"], PAL["cream_trim"], lod=lod)
        add_window(acc, sy, +hw, g_h + 1.55, 1.1, 1.2, (+1, 0), PAL["teak_brown"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window(acc, 0.0, +hd - 0.2, g_h + 1.55, 1.3, 1.2, (0, +1), PAL["teak_brown"], PAL["recess"], PAL["cream_trim"], lod=lod)

    # Decorative old cornice parapet + corner finials
    z_top = add_parapet_with_jaali(acc, w, d - 1.6, z_eaves + 0.08, 0.90, PAL["cream"], PAL["mustard"], PAL["cream_shade"], pediment=True, lod=lod)
    if lod == 0:
        for sx in (-1, 1):
            acc.cyl((sx * (hw - 0.22), y_front + 0.15, z_eaves + 1.22), 0.12, 0.06, 0.34, PAL["mustard"], segs=8)
        # Rear roof water tank
        acc.box((0.0, +3.5, z_eaves + 0.34), (1.2, 1.2, 0.45), PAL["red_brick"])
        acc.cyl((0.0, +3.5, z_eaves + 1.10), 0.50, 0.50, 1.10, PAL["tank"], segs=10)
    return acc


def build_b12_mixed_use_shop(lod: int) -> MeshAcc:
    """B12: Mixed-Use Building (Shops+Res) (10x15m, 3F) - Corner wrap-around shops on BOTH -Y and +X + upper colonnaded verandah."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 15.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 3.6, 3.2
    z_eaves = g_h + 2 * fl_h  # 10.0m

    acc.box((0.0, 0.0, 0.08), (w + 0.3, d + 0.3, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * z_eaves), (w, d, z_eaves), PAL["ochre"])
        acc.box((0.0, 0.0, z_eaves + 0.45), (w + 0.2, d + 0.2, 0.9), PAL["cream_trim"])
        return acc

    # Ground floor core
    acc.box((0.0, 0.0, 0.5 * g_h + 0.08), (w - 0.4, d - 0.4, g_h), PAL["ochre"])
    # Wrap-around shops on BOTH -Y (front: 2 bays) AND +X (east corner: 3 bays)
    add_shop_bay(acc, -2.4, -hd + 0.2, 0.16, 4.4, 3.35, PAL["sign_green"], PAL["terracotta"], is_open=True, with_awning=True, face_dir=(0, -1), lod=lod)
    add_shop_bay(acc, +2.3, -hd + 0.2, 0.16, 4.4, 3.35, PAL["sign_blue"], PAL["steel_blue"], is_open=False, with_awning=True, face_dir=(0, -1), lod=lod)
    # +X side wrap-around shops
    for bi, by in enumerate((-4.4, 0.0, +4.4)):
        add_shop_bay(
            acc, by, +hw - 0.2, 0.16, 4.1, 3.35,
            (PAL["sign_red"], PAL["sign_yellow"], PAL["sign_green"])[bi],
            (PAL["mustard"], PAL["terracotta"], PAL["steel_blue"])[bi],
            is_open=(bi != 1), with_awning=True, face_dir=(+1, 0), lod=lod,
        )

    # Upper 2 floors: recessed colonnaded verandah galleries on -Y and +X
    acc.box((-0.4, +0.4, g_h + 0.5 * (2 * fl_h)), (w - 1.4, d - 1.4, 2 * fl_h), PAL["ochre"])
    for fi in range(2):
        zf = g_h + fi * fl_h + 0.16
        # Floor slab extending out to perimeter colonnade
        acc.box((0.0, 0.0, zf), (w + 0.16, d + 0.16, 0.18), PAL["cream_trim"])
        # Corner & intermediate colonnade pillars on -Y and +X
        for px in (-hw + 0.28, -1.6, +1.6, +hw - 0.28):
            acc.box((px, -hd + 0.28, zf + 1.6), (0.36, 0.36, 3.0), PAL["cream_trim"])
        for py in (-4.4, 0.0, +4.4, +hd - 0.28):
            acc.box((+hw - 0.28, py, zf + 1.6), (0.36, 0.36, 3.0), PAL["cream_trim"])
        # Verandah parapet rail
        acc.box((0.0, -hd + 0.28, zf + 0.45), (w - 0.3, 0.18, 0.85), PAL["ochre"])
        acc.box((+hw - 0.28, 0.0, zf + 0.45), (0.18, d - 0.3, 0.85), PAL["ochre"])
        # Windows recessed behind verandah
        if lod == 0:
            add_window(acc, -2.5, -hd + 1.0, zf + 1.7, 1.25, 1.35, (0, -1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, lod=lod)
            add_window(acc, +2.0, -hd + 1.0, zf + 1.7, 1.25, 1.35, (0, -1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, lod=lod)
            for py in (-2.5, +2.5):
                add_window(acc, py, +hw - 1.0, zf + 1.7, 1.25, 1.35, (+1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, lod=lod)

    # -X & +Y side/rear windows + AC units
    zs = (g_h + 1.7, g_h + fl_h + 1.7)
    add_window_grid(acc, (-4.0, 0.0, +4.0), -hw + 0.3, zs, 1.2, 1.25, (-1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window_grid(acc, (-2.5, +2.0), +hd - 0.3, zs, 1.2, 1.25, (0, +1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    if lod == 0:
        add_ac_unit(acc, -hw + 0.3, -1.5, g_h + 2.2, (-1, 0), lod)
        add_ac_unit(acc, +hw - 0.2, -2.0, g_h + fl_h + 2.1, (+1, 0), lod)

    add_parapet_with_jaali(acc, w, d, z_eaves + 0.16, 0.90, PAL["ochre"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    add_rooftop_props(acc, w, d, z_eaves + 0.32, lod=lod, add_tank=True)
    return acc


def build_b13_showroom_auto(lod: int) -> MeshAcc:
    """B13: Vehicle Showroom (18x30m, 2F) - Double-height ACP facade, deep recessed frameless glass showroom + interior floor/pillars."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 30.0
    hw, hd = 0.5 * w, 0.5 * d
    h = 7.4

    acc.box((0.0, 0.0, 0.08), (w + 0.4, d + 0.4, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * h), (w, d, h), PAL["slate"])
        acc.box((0.0, -hd - 0.6, h - 0.5), (w + 0.6, 2.2, 1.0), PAL["steel_blue"])
        return acc

    # Rear/side showroom enclosure + interior showroom floor, mezzanine & back lit wall
    acc.box((0.0, +3.0, 0.5 * h + 0.08), (w, d - 6.0, h), PAL["slate"])
    acc.box((0.0, -hd + 3.2, 0.20), (w - 0.4, 6.4, 0.24), PAL["white"])  # bright showroom floor
    acc.box((0.0, -hd + 6.0, 3.6), (w - 1.2, 0.20, 6.2), PAL["lit_warm"])  # lit interior back wall
    acc.box((0.0, -hd + 4.8, 3.8), (w - 2.4, 2.4, 0.22), PAL["concrete"])  # interior mezzanine gallery
    acc.box((0.0, -hd + 3.65, 4.35), (w - 2.4, 0.08, 0.90), PAL["glass_rail"])

    # Side ACP walls flanking the deep recessed glass bay + ACP vertical ribs
    for sx in (-1, 1):
        acc.box((sx * (hw - 0.55), -hd + 3.0, 0.5 * h), (1.1, 6.0, h), EXTRA_PAL["granite_mid"])
        acc.box((sx * (hw - 0.55), -hd - 0.1, 0.5 * h), (0.85, 0.35, h), PAL["steel_light"])
    # Bold overhanging portal canopy + soffit light panels
    acc.box((0.0, -hd + 0.8, h - 0.45), (w + 0.6, 4.4, 1.15), PAL["charcoal"])
    acc.box((0.0, -hd - 1.38, h - 0.45), (w + 0.64, 0.14, 0.42), PAL["steel_blue"])  # generic accent band
    acc.box((0.0, -hd - 1.44, h - 0.45), (6.4, 0.06, 0.55), PAL["steel_light"])  # blank sign plinth
    for lx in (-5.5, 0.0, +5.5):
        acc.box((lx, -hd + 0.6, h - 1.04), (3.6, 2.4, 0.05), PAL["lit_warm"])

    # Deep recessed 2-storey frameless glass curtain bay (y = -hd + 2.4)
    y_gl = -hd + 2.4
    acc.box((0.0, y_gl, 3.5), (w - 2.3, 0.08, 6.4), PAL["glass_aqua"])
    # Horizontal transoms & vertical mullions
    for tz in (2.6, 4.8):
        acc.box((0.0, y_gl - 0.05, tz), (w - 2.3, 0.12, 0.10), PAL["steel_light"])
    for mx in (-6.2, -3.1, 0.0, +3.1, +6.2):
        acc.box((mx, y_gl - 0.06, 3.5), (0.08, 0.22, 6.4), PAL["steel_light"])
    # Interior showroom pillars & display podiums visible behind glass
    for px in (-4.8, 0.0, +4.8):
        acc.cyl((px, -hd + 4.0, 3.4), 0.34, 0.34, 6.4, PAL["white"], segs=10 if lod == 0 else 6)
    # Entrance portal & 2 stylized display vehicle silhouettes inside showroom
    acc.box((0.0, y_gl - 0.12, 1.4), (3.4, 0.20, 2.7), PAL["charcoal"])
    for vx, vcol in ((-3.8, PAL["crimson"]), (+3.8, PAL["steel_blue"])):
        acc.box((vx, -hd + 3.8, 0.42), (3.4, 2.2, 0.22), PAL["concrete"])
        if lod == 0:
            acc.box((vx, -hd + 3.8, 0.85), (2.7, 1.45, 0.52), vcol)
            acc.box((vx - 0.15, -hd + 3.8, 1.28), (1.45, 1.25, 0.40), PAL["glass_blue"])
            for wx in (-0.85, +0.85):
                for wy in (-0.70, +0.70):
                    acc.cyl((vx + wx, -hd + 3.8 + wy, 0.68), 0.24, 0.24, 0.16, PAL["charcoal"], segs=8, rot_x=math.pi * 0.5)

    # Side ACP cladding panels, upper office windows, service bay shutter & showroom totem pylon
    for sx in (-1, 1):
        for sy in (-6.0, 0.0, +6.0, +11.0):
            acc.box((sx * (hw + 0.03), sy, 3.8), (0.08, 0.08, 6.8), PAL["charcoal"])
    add_window_grid(acc, (-6.0, 0.0, +6.0), -hw, (5.2,), 2.4, 1.6, (-1, 0), PAL["charcoal"], PAL["glass_blue"], PAL["steel_light"], with_grille=False, lod=lod)
    acc.box((+hw + 0.04, +8.0, 1.8), (0.10, 4.4, 3.4), PAL["shutter"])
    # Generic showroom totem pylon at front-left
    acc.box((-hw + 0.6, -hd - 1.2, 2.6), (1.1, 0.45, 5.2), PAL["charcoal"])
    acc.box((-hw + 0.6, -hd - 1.44, 3.6), (0.75, 0.06, 2.2), PAL["steel_blue"])
    if lod == 0:
        for bx in (-6.0, -3.0, +3.0, +6.0):
            acc.cyl((bx, -hd - 1.0, 0.52), 0.09, 0.09, 0.72, PAL["steel_light"], segs=6)
        add_potted_plant(acc, -7.8, -hd - 0.6, 0.16, 1.2, lod)
        add_potted_plant(acc, +7.8, -hd - 0.6, 0.16, 1.2, lod)

    add_rooftop_chiller_plant(acc, 0.0, +6.0, h, 8.0, 5.0, lod=lod)
    return acc


def build_b14_shopping_complex(lod: int) -> MeshAcc:
    """B14: Shopping Complex (Retail) (24x36m, 4F) - Cream stone retail complex, triple-height glass atrium, grand portico."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 24.0, 36.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 3.8, 3.2
    z_eaves = g_h + 3 * fl_h  # 13.4m

    acc.box((0.0, 0.0, 0.08), (w + 0.5, d + 0.5, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * z_eaves), (w, d, z_eaves), PAL["cream"])
        acc.box((0.0, -hd - 0.5, 0.5 * g_h + 1.0), (10.0, 2.4, g_h + 1.5), PAL["cream_trim"])
        return acc

    # Left & right stone-clad retail wings
    acc.box((0.0, +1.0, 0.5 * z_eaves), (w, d - 2.0, z_eaves), PAL["cream"])
    # Flanking retail ground shop rows on left & right of central grand portico
    add_shop_bay(acc, -8.8, -hd + 1.0, 0.16, 5.6, 3.4, PAL["sign_red"], PAL["terracotta"], is_open=True, lod=lod)
    add_shop_bay(acc, +8.8, -hd + 1.0, 0.16, 5.6, 3.4, PAL["sign_blue"], PAL["steel_blue"], is_open=True, lod=lod)

    # Central triple-height mullioned glass atrium (X in [-5.6, +5.6], Z from 3.5 to 13.2)
    add_curtain_wall(acc, -5.4, +5.4, -hd + 0.8, 3.6, z_eaves - 0.2, (0, -1), 6, 3, PAL["glass_aqua"], PAL["steel_light"], PAL["cream_trim"], lod=lod)
    # Monumental grand portico projecting in front
    add_porte_cochere(acc, 0.0, -hd + 1.0, 0.16, 10.6, 3.2, 4.6, PAL["cream_trim"], PAL["terracotta"], PAL["cream"], lod=lod)
    acc.box((0.0, -hd + 0.9, 1.9), (6.0, 0.12, 3.4), PAL["glass_blue"])

    # Upper wing windows + horizontal stone string courses
    for fi in range(1, 4):
        zf = g_h + (fi - 1) * fl_h
        acc.box((0.0, 0.8, zf), (w + 0.2, d - 1.6, 0.18), PAL["cream_trim"])
        if lod == 0 or fi % 2 == 1:
            for wx in (-9.6, -7.2, +7.2, +9.6):
                add_window(acc, wx, -hd + 1.0, zf + 1.6, 1.5, 1.6, (0, -1), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], with_grille=False, lod=lod)

    # Side & rear windows
    zs = (g_h + 1.6, g_h + fl_h + 1.6, g_h + 2 * fl_h + 1.6)
    side_ys = (-11.0, -5.5, 0.0, +5.5, +11.0)
    add_window_grid(acc, side_ys, -hw, zs, 1.6, 1.5, (-1, 0), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], with_grille=False, lod=lod)
    add_window_grid(acc, side_ys, +hw, zs, 1.6, 1.5, (+1, 0), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], with_grille=False, lod=lod)
    add_window_grid(acc, (-7.5, -2.5, +2.5, +7.5), +hd, zs, 1.6, 1.5, (0, +1), PAL["charcoal"], PAL["glass_blue"], PAL["cream_trim"], with_grille=False, lod=lod)

    # Generic top fascia header crown
    acc.box((0.0, -hd + 0.9, z_eaves + 0.9), (13.6, 0.36, 1.6), PAL["sign_red"])
    acc.box((0.0, -hd + 0.7, z_eaves + 0.9), (10.8, 0.08, 0.75), PAL["cream_trim"])
    add_parapet_with_jaali(acc, w, d - 2.0, z_eaves, 1.0, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=False, lod=lod)
    add_rooftop_chiller_plant(acc, 0.0, +7.0, z_eaves + 0.16, 7.5, 5.0, lod=lod)
    return acc


def build_b15_it_office(lod: int) -> MeshAcc:
    """B15: IT Office Building (30x40m, 6F) - Granite-framed blue reflective glass tower, deep lobby canopy, rooftop chiller."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 30.0, 40.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 4.2, 3.25
    z_eaves = g_h + 5 * fl_h  # 20.45m

    acc.box((0.0, 0.0, 0.10), (w + 0.6, d + 0.6, 0.20), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * z_eaves), (w, d, z_eaves), PAL["glass_blue"])
        acc.box((0.0, 0.0, z_eaves + 1.0), (10.0, 8.0, 2.0), PAL["slate"])
        return acc

    # Granite core corners & structural frame
    acc.box((0.0, 0.0, 0.5 * z_eaves), (w - 0.6, d - 0.6, z_eaves), EXTRA_PAL["granite_dark"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            acc.box((sx * (hw - 0.7), sy * (hd - 0.7), 0.5 * z_eaves + 0.4), (1.4, 1.4, z_eaves + 0.8), EXTRA_PAL["granite_mid"])

    # Blue reflective glass curtain walls on all 4 facades
    add_curtain_wall(acc, -hw + 1.4, +hw - 1.4, -hd + 0.3, g_h, z_eaves, (0, -1), 10, 5, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)
    add_curtain_wall(acc, -hw + 1.4, +hw - 1.4, +hd - 0.3, g_h, z_eaves, (0, +1), 10, 5, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)
    add_curtain_wall(acc, -hd + 1.4, +hd - 1.4, -hw + 0.3, g_h, z_eaves, (-1, 0), 12, 5, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)
    add_curtain_wall(acc, -hd + 1.4, +hd - 1.4, +hw - 0.3, g_h, z_eaves, (+1, 0), 12, 5, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)

    # Ground floor granite arcade + glazed lobby + deep cantilevered canopy
    acc.box((0.0, -hd + 0.35, 0.5 * g_h), (w - 3.0, 0.14, g_h), PAL["glass_aqua"])
    add_porte_cochere(acc, 0.0, -hd + 0.3, 0.20, 12.0, 4.2, 4.2, PAL["steel_light"], PAL["charcoal"], EXTRA_PAL["granite_mid"], lod=lod)
    if lod == 0:
        for bx in (-4.5, -1.5, +1.5, +4.5):
            acc.cyl((bx, -hd - 4.1, 0.55), 0.10, 0.10, 0.80, PAL["steel_light"], segs=6)
        add_potted_plant(acc, -7.2, -hd - 1.2, 0.20, 1.3, lod)
        add_potted_plant(acc, +7.2, -hd - 1.2, 0.20, 1.3, lod)

    # Crown cornice & rooftop chiller plant enclosure
    acc.box((0.0, 0.0, z_eaves + 0.35), (w + 0.3, d + 0.3, 0.70), EXTRA_PAL["granite_mid"])
    add_rooftop_chiller_plant(acc, 0.0, +4.0, z_eaves + 0.70, 11.0, 8.0, lod=lod)
    return acc


def build_b16_bank_heritage(lod: int) -> MeshAcc:
    """B16: Bank Building (Heritage Style) (18x28m, 2F) - Neoclassical cream/yellow corner building, arched portals, dentil cornice."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 28.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, f1_h = 4.2, 3.8
    z_eaves = g_h + f1_h  # 8.0m

    acc.box((0.0, 0.0, 0.15), (w + 0.4, d + 0.4, 0.30), PAL["plinth"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.3 + 0.5 * z_eaves), (w, d, z_eaves), PAL["cream"])
        acc.box((0.0, 0.0, 0.3 + z_eaves + 0.5), (w + 0.3, d + 0.3, 1.0), PAL["cream_trim"])
        return acc

    acc.box((0.0, 0.0, 0.3 + 0.5 * z_eaves), (w, d, z_eaves), PAL["cream"])
    # Ochre rusticated ground band
    acc.box((0.0, 0.0, 0.3 + 0.5 * g_h), (w + 0.12, d + 0.12, g_h), PAL["ochre"])

    # Grand semi-circular arched ground portals on front (-Y) and +X side
    for ax in (-5.5, 0.0, +5.5):
        add_arch_portal(acc, ax, -hd, 0.30, 2.4, 2.4, (0, -1), PAL["cream_trim"], PAL["teak_dark"], lod=lod)
    for ay in (-9.0, -3.0, +3.0, +9.0):
        add_arch_portal(acc, ay, +hw, 0.30, 2.2, 2.3, (+1, 0), PAL["cream_trim"], PAL["teak_dark"], lod=lod)

    # Upper arched windows on all 4 facades
    z_u = 0.3 + g_h + 1.85
    add_window_grid(acc, (-5.5, -2.75, 0.0, +2.75, +5.5), -hd, (z_u,), 1.35, 1.75, (0, -1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, arched=True, lod=lod)
    add_window_grid(acc, (-9.0, -4.5, 0.0, +4.5, +9.0), +hw, (z_u,), 1.35, 1.75, (+1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, arched=False, lod=lod)
    add_window_grid(acc, (-9.0, -4.5, 0.0, +4.5, +9.0), -hw, (z_u,), 1.35, 1.75, (-1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, arched=False, lod=lod)
    add_window_grid(acc, (-5.0, 0.0, +5.0), +hd, (z_u,), 1.35, 1.75, (0, +1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], with_chajja=False, arched=False, lod=lod)

    # String course + dentil cornice
    acc.box((0.0, 0.0, 0.3 + g_h), (w + 0.28, d + 0.28, 0.20), PAL["cream_trim"])
    acc.box((0.0, 0.0, 0.3 + z_eaves + 0.10), (w + 0.44, d + 0.44, 0.24), PAL["cream_trim"])
    if lod == 0:
        for dx in range(-8, 9):
            acc.box((dx * 1.0, -hd - 0.14, 0.3 + z_eaves - 0.08), (0.32, 0.18, 0.18), PAL["cream_trim"])

    # Balustrade parapet + stately generic civic header board (zero brand names)
    add_parapet_with_jaali(acc, w, d, 0.3 + z_eaves + 0.12, 1.05, PAL["cream"], PAL["cream_trim"], PAL["cream_shade"], pediment=True, lod=lod)
    acc.box((0.0, -hd - 0.16, 0.3 + g_h + 0.15), (7.6, 0.18, 0.72), PAL["charcoal"])
    acc.box((0.0, -hd - 0.26, 0.3 + g_h + 0.15), (6.4, 0.04, 0.32), EXTRA_PAL["brass"])
    return acc


def build_b19_wholesale_market(lod: int) -> MeshAcc:
    """B19: Wholesale Market Hall (50x80m, 1F) - Wide arched barrel-truss hall, huge open arch entrance, flanking pitched wings, loading dock."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 50.0, 80.0
    hw, hd = 0.5 * w, 0.5 * d
    dock_h = 1.1
    wall_h = 6.2
    nave_w = 24.0

    # Raised concrete loading platform around market hall
    acc.box((0.0, 0.0, 0.5 * dock_h), (w, d, dock_h), PAL["plinth"])
    if lod >= 2:
        acc.box((0.0, 0.0, dock_h + 0.5 * wall_h), (w - 2.0, d - 3.0, wall_h), PAL["cream"])
        acc.pitched_roof(-0.5 * nave_w, +0.5 * nave_w, -hd + 1.5, +hd - 1.5, dock_h + wall_h, 4.8, PAL["steel_blue"], PAL["cream_trim"], barrel=True)
        return acc

    # Main hall & flanking wings
    acc.box((0.0, +0.5, dock_h + 0.5 * wall_h), (w - 2.4, d - 3.4, wall_h), PAL["cream"])
    # Central barrel-truss nave roof + flanking pitched wing roofs
    acc.pitched_roof(-0.5 * nave_w, +0.5 * nave_w, -hd + 1.2, +hd - 1.2, dock_h + wall_h, 4.8, PAL["steel_blue"], PAL["cream_trim"], barrel=True)
    acc.pitched_roof(-hw + 1.2, -0.5 * nave_w, -hd + 1.2, +hd - 1.2, dock_h + wall_h - 0.8, 2.2, PAL["terracotta"], PAL["cream"], hip=False)
    acc.pitched_roof(+0.5 * nave_w, +hw - 1.2, -hd + 1.2, +hd - 1.2, dock_h + wall_h - 0.8, 2.2, PAL["terracotta"], PAL["cream"], hip=False)

    # Huge open central archway market entrance on front (-Y) & rear (+Y)
    for y_end, s_dir in ((-hd + 1.2, -1), (+hd - 1.2, +1)):
        acc.box((0.0, y_end + s_dir * 0.12, dock_h + 2.1), (11.0, 0.30, 4.2), PAL["recess"])
        acc.arch_slab(0.0, y_end + s_dir * 0.12, dock_h + 4.2, 0.32, 5.5, 10 if lod == 0 else 6, PAL["recess"])
        acc.arch_slab(0.0, y_end + s_dir * 0.25, dock_h + 4.2, 0.24, 6.0, 10 if lod == 0 else 6, PAL["cream_trim"])

    # Generic produce market archway fascia
    acc.box((0.0, -hd + 0.85, dock_h + 4.8), (16.0, 0.26, 1.3), PAL["sign_green"])
    acc.box((0.0, -hd + 0.70, dock_h + 4.8), (12.0, 0.06, 0.58), PAL["sign_yellow"])

    # Flanking front & side loading bays + shutters + crate stacks
    for bx in (-17.5, -13.0, +13.0, +17.5):
        acc.box((bx, -hd + 1.2, dock_h + 1.8), (3.4, 0.14, 3.4), PAL["shutter"])
    for sy in (-28.0, -14.0, 0.0, +14.0, +28.0):
        acc.box((-hw + 1.2, sy, dock_h + 1.8), (0.14, 4.0, 3.4), PAL["shutter"])
        acc.box((+hw - 1.2, sy, dock_h + 1.8), (0.14, 4.0, 3.4), PAL["shutter"])
        if lod == 0:
            # Exterior truss buttresses & loading dock bollards/crates
            acc.box((-hw + 1.0, sy + 5.0, dock_h + 3.0), (0.55, 0.55, 6.0), PAL["cream_shade"])
            acc.box((+hw - 1.0, sy + 5.0, dock_h + 3.0), (0.55, 0.55, 6.0), PAL["cream_shade"])
            add_crate_stack(acc, -hw + 0.5, sy, dock_h, lod)
            add_crate_stack(acc, +hw - 0.5, sy, dock_h, lod)

    if lod == 0:
        for sx in (-19.0, -14.0, +14.0, +19.0):
            add_crate_stack(acc, sx, -hd + 0.5, dock_h, lod)
        # Entry steps at front loading dock
        for si in range(3):
            acc.box((0.0, -hd - 0.3 * si, 0.18 + si * 0.30), (12.0, 0.6, 0.36), PAL["concrete"])
    return acc


def build_b20_multiplex(lod: int) -> MeshAcc:
    """B20: Multiplex / Cinema (36x50m, 4F) - Dark charcoal slate + warm sandstone, 3 poster lightboxes, glowing marquee."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 36.0, 50.0
    hw, hd = 0.5 * w, 0.5 * d
    foyer_h = 4.6
    main_h = 13.0

    acc.box((0.0, 0.0, 0.10), (w + 0.4, d + 0.4, 0.20), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * main_h), (w, d, main_h), PAL["charcoal"])
        acc.box((0.0, -hd - 1.2, foyer_h), (18.0, 3.0, 1.1), EXTRA_PAL["marquee_rim"])
        return acc

    # Rear auditorium mass (windowless dark slate) + front warm sandstone foyer upper facade
    acc.box((0.0, +5.0, 0.5 * main_h + 0.1), (w, d - 10.0, main_h), PAL["slate"])
    acc.box((0.0, -hd + 5.2, foyer_h + 0.5 * (main_h - foyer_h)), (w - 0.8, 10.4, main_h - foyer_h), EXTRA_PAL["sandstone"])
    for sx in (-1, 1):
        acc.box((sx * (hw - 1.2), -hd + 5.2, 0.5 * main_h), (2.4, 10.6, main_h), PAL["charcoal"])
    # Crown parapet & generic top cinema header board
    acc.box((0.0, -hd + 0.3, main_h + 0.65), (22.0, 0.55, 1.4), PAL["charcoal"])
    acc.box((0.0, -hd + 0.02, main_h + 0.65), (17.0, 0.08, 0.75), EXTRA_PAL["marquee_rim"])

    # Glazed ticket foyer + mullioned curtain glass + cantilevered glowing steel marquee
    acc.box((0.0, -hd + 0.8, 0.5 * foyer_h), (w - 5.2, 1.4, foyer_h), PAL["charcoal"])
    acc.box((0.0, -hd + 0.1, 0.5 * foyer_h), (18.0, 0.14, foyer_h - 0.4), PAL["glass_aqua"])
    for mx in (-7.2, -3.6, 0.0, +3.6, +7.2):
        acc.box((mx, -hd + 0.02, 0.5 * foyer_h), (0.14, 0.18, foyer_h - 0.3), PAL["steel_light"])
    # Ticket counter & entry portals inside foyer
    acc.box((-5.2, -hd + 1.1, 0.7), (3.8, 0.5, 1.1), PAL["lit_warm"])
    acc.box((+5.2, -hd + 1.1, 0.7), (3.8, 0.5, 1.1), PAL["lit_warm"])
    # Marquee canopy + glowing soffit strips
    acc.box((0.0, -hd - 1.6, foyer_h + 0.3), (18.4, 3.8, 1.05), PAL["charcoal"])
    acc.box((0.0, -hd - 3.45, foyer_h + 0.3), (18.5, 0.14, 0.65), EXTRA_PAL["marquee_rim"])
    acc.box((0.0, -hd - 1.6, foyer_h - 0.25), (17.6, 3.3, 0.08), PAL["lit_warm"])
    for sx in (-1, 1):
        acc.box((sx * 7.5, -hd - 3.1, 0.5 * foyer_h), (0.65, 0.65, foyer_h), PAL["charcoal"])

    # 3 recessed poster lightbox frames on upper front sandstone wall + vertical sandstone fins
    poster_cols = (PAL["lit_warm"], PAL["glass_aqua"], PAL["crimson"])
    for i, px in enumerate((-7.5, 0.0, +7.5)):
        acc.box((px, -hd + 0.1, 9.2), (4.6, 0.45, 5.2), PAL["charcoal"])
        acc.box((px, -hd - 0.08, 9.2), (3.8, 0.08, 4.4), poster_cols[i])
        acc.box((px, -hd - 0.28, 11.95), (4.2, 0.45, 0.14), PAL["steel_light"])
        if lod == 0:
            for lx in (-1.4, 0.0, +1.4):
                acc.cyl((px + lx, -hd - 0.42, 11.82), 0.08, 0.10, 0.22, PAL["charcoal"], segs=6)
    for fx in (-12.5, -11.0, +11.0, +12.5):
        acc.box((fx, -hd - 0.08, 9.2), (0.35, 0.45, 6.2), PAL["charcoal"])

    # Side fire-exit stair volumes, exit shutters & auditorium ribs
    for sx in (-1, 1):
        acc.box((sx * (hw + 0.3), +6.0, 4.5), (0.8, 5.2, 9.0), PAL["charcoal"])
        acc.box((sx * (hw + 0.06), -6.0, 1.6), (0.14, 3.2, 3.0), PAL["shutter"])
        for ry in (-12.0, -4.0, +4.0, +14.0, +21.0):
            acc.box((sx * (hw + 0.15), ry, 0.5 * main_h), (0.35, 0.65, main_h), PAL["charcoal"])
    if lod == 0:
        for bx in (-6.0, -2.0, +2.0, +6.0):
            acc.cyl((bx, -hd - 4.0, 0.55), 0.10, 0.10, 0.80, PAL["steel_light"], segs=6)
        add_potted_plant(acc, -11.0, -hd - 0.6, 0.20, 1.2, lod)
        add_potted_plant(acc, +11.0, -hd - 0.6, 0.20, 1.2, lod)

    add_rooftop_chiller_plant(acc, 0.0, +10.0, main_h + 0.1, 14.0, 10.0, lod=lod)
    return acc


def build_b41_it_park_omr(lod: int) -> MeshAcc:
    """B41: IT Park / Corporate Office (80x120m, 8F) - Dual-wing glazed blue curtain-wall, glass atrium bridge, front plaza & gate piers."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 80.0, 120.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 4.4, 3.2
    z_eaves = g_h + 7 * fl_h  # 26.8m

    # Landscaped front entry plaza & perimeter pavement
    acc.box((0.0, 0.0, 0.10), (w, d, 0.20), EXTRA_PAL["plaza_stone"])
    if lod >= 2:
        acc.box((-24.0, +4.0, 0.5 * z_eaves), (26.0, 96.0, z_eaves), PAL["glass_blue"])
        acc.box((+24.0, +4.0, 0.5 * z_eaves), (26.0, 96.0, z_eaves), PAL["glass_blue"])
        acc.box((0.0, +4.0, 15.0), (24.0, 26.0, 16.0), PAL["glass_aqua"])
        return acc

    # Twin 8F wings (each 26m x 96m, centered at X=+-24, Y=+4)
    wing_w, wing_d = 26.0, 96.0
    yc_w = +4.0
    yw_f, yw_b = yc_w - 0.5 * wing_d, yc_w + 0.5 * wing_d
    for sx in (-1, 1):
        wx = sx * 24.0
        acc.box((wx, yc_w, 0.5 * z_eaves + 0.1), (wing_w - 0.8, wing_d - 0.8, z_eaves), EXTRA_PAL["granite_dark"])
        add_curtain_wall(acc, wx - 0.5 * wing_w + 0.5, wx + 0.5 * wing_w - 0.5, yw_f, g_h, z_eaves, (0, -1), 8, 7, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)
        add_curtain_wall(acc, wx - 0.5 * wing_w + 0.5, wx + 0.5 * wing_w - 0.5, yw_b, g_h, z_eaves, (0, +1), 8, 7, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)
        add_curtain_wall(acc, yw_f + 0.5, yw_b - 0.5, wx - 0.5 * wing_w, g_h, z_eaves, (-1, 0), 14, 7, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)
        add_curtain_wall(acc, yw_f + 0.5, yw_b - 0.5, wx + 0.5 * wing_w, g_h, z_eaves, (+1, 0), 14, 7, PAL["glass_blue"], PAL["steel_light"], EXTRA_PAL["granite_mid"], lod=lod)
        # Ground colonnade + roof cornice
        acc.box((wx, yw_f, 0.5 * g_h), (wing_w - 2.0, 0.2, g_h), PAL["glass_aqua"])
        acc.box((wx, yc_w, z_eaves + 0.35), (wing_w + 0.4, wing_d + 0.4, 0.7), EXTRA_PAL["granite_mid"])

    # Central recessed glass atrium bridge (spanning X in [-11.5, +11.5], Y in [-18, +18], Z from 5.0 to z_eaves)
    acc.box((0.0, 0.0, 0.5 * (z_eaves + 5.0)), (23.0, 34.0, z_eaves - 5.0), PAL["glass_aqua"])
    add_curtain_wall(acc, -11.2, +11.2, -17.0, 5.2, z_eaves, (0, -1), 6, 6, PAL["glass_aqua"], PAL["steel_light"], PAL["white"], lod=lod)
    add_porte_cochere(acc, 0.0, -17.0, 0.20, 16.0, 6.0, 4.8, PAL["steel_light"], PAL["charcoal"], EXTRA_PAL["granite_mid"], lod=lod)

    # Front entry plaza planters & perimeter stone gate piers
    for px in (-36.0, -14.0, +14.0, +36.0):
        acc.box((px, -hd + 1.2, 1.5), (1.8, 1.8, 3.0), EXTRA_PAL["granite_mid"])
        acc.box((px, -hd + 1.2, 3.15), (2.2, 2.2, 0.30), PAL["cream_trim"])
    if lod == 0:
        for sx in (-1, 1):
            acc.box((sx * 24.0, -hd + 8.0, 0.45), (14.0, 4.0, 0.70), PAL["plinth"])
            for tx in (-4.0, 0.0, +4.0):
                add_potted_plant(acc, sx * 24.0 + tx, -hd + 8.0, 0.80, 1.6, lod)

    add_rooftop_chiller_plant(acc, -24.0, +18.0, z_eaves + 0.7, 12.0, 10.0, lod=lod)
    add_rooftop_chiller_plant(acc, +24.0, +18.0, z_eaves + 0.7, 12.0, 10.0, lod=lod)
    return acc


def build_b43_shopping_mall(lod: int) -> MeshAcc:
    """B43: Large Shopping Mall (80x110m, 4F) - Sweeping curved glass rotunda, stone retail wings, grand porte-cochere, plain anchor banners."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 80.0, 110.0
    hw, hd = 0.5 * w, 0.5 * d
    h = 16.8

    acc.box((0.0, 0.0, 0.12), (w, d, 0.24), EXTRA_PAL["plaza_stone"])
    if lod >= 2:
        acc.box((0.0, +6.0, 0.5 * h), (w - 2.0, d - 16.0, h), EXTRA_PAL["sandstone"])
        acc.cyl((0.0, -hd + 14.0, 0.5 * h + 0.8), 16.0, 16.0, h + 1.6, PAL["glass_aqua"], segs=12)
        return acc

    # Massive stone retail wings (main rear & flanking wings)
    acc.box((0.0, +8.0, 0.5 * h + 0.12), (w - 2.0, d - 20.0, h), EXTRA_PAL["sandstone"])
    for sx in (-1, 1):
        acc.box((sx * 27.0, -hd + 14.0, 0.5 * h + 0.12), (24.0, 22.0, h), PAL["cream"])
        # Horizontal facade stone cornice bands
        for zf in (4.5, 8.8, 13.0, h):
            acc.box((sx * 27.0, -hd + 2.8, zf), (24.4, 0.5, 0.35), PAL["cream_trim"])
        # Plain color-band anchor banners (strictly NO brand names/logos)
        banner_cols = (PAL["crimson"], PAL["sign_blue"], PAL["sign_yellow"], PAL["teal_wall"])
        for bi in range(2):
            bx = sx * (21.5 + bi * 11.0)
            bcol = banner_cols[(0 if sx < 0 else 2) + bi]
            acc.box((bx, -hd + 2.6, 10.0), (4.6, 0.28, 9.2), bcol)

    # Sweeping curved central glass rotunda entrance + skylight dome
    rot_y = -hd + 11.0
    rot_r = 15.5
    acc.cyl((0.0, rot_y, 0.5 * h + 0.5), rot_r, rot_r, h + 1.0, PAL["glass_aqua"], segs=16 if lod == 0 else 10)
    acc.dome(0.0, rot_y, h + 1.0, rot_r * 0.96, 3.6, PAL["glass_blue"], segs=14 if lod == 0 else 8, rings=3)
    if lod == 0:
        for ri in (4.5, 9.0, 13.5, h + 0.8):
            acc.cyl((0.0, rot_y, ri), rot_r + 0.25, rot_r + 0.25, 0.32, PAL["steel_light"], segs=16)

    # Grand cantilevered porte-cochere canopy
    add_porte_cochere(acc, 0.0, rot_y - rot_r + 2.0, 0.24, 24.0, 7.5, 5.2, PAL["charcoal"], PAL["gold"], PAL["cream_trim"], lod=lod)
    if lod == 0:
        for px in (-18.0, -14.0, +14.0, +18.0):
            add_potted_plant(acc, px, -hd + 2.0, 0.24, 1.5, lod)

    # Side & rear loading/service bays & rooftop HVAC plant
    for sy in (-12.0, +8.0, +28.0):
        acc.box((-hw + 1.0, sy, 2.2), (0.2, 5.5, 4.0), PAL["shutter"])
        acc.box((+hw - 1.0, sy, 2.2), (0.2, 5.5, 4.0), PAL["shutter"])
    add_rooftop_chiller_plant(acc, 0.0, +26.0, h + 0.12, 18.0, 12.0, lod=lod)
    return acc


def build_b44_sez_tech_office(lod: int) -> MeshAcc:
    """B44: SEZ / Tech Office Building (60x90m, 7F) - Twin concrete + vertical sun-shatter fin towers, central glass bridge & drop-off porch."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 60.0, 90.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 4.2, 3.25
    z_eaves = g_h + 6 * fl_h  # 23.7m

    acc.box((0.0, 0.0, 0.12), (w, d, 0.24), PAL["pavement"])
    if lod >= 2:
        acc.box((-19.0, 0.0, 0.5 * z_eaves), (20.0, d - 6.0, z_eaves), PAL["concrete"])
        acc.box((+19.0, 0.0, 0.5 * z_eaves), (20.0, d - 6.0, z_eaves), PAL["concrete"])
        acc.box((0.0, 0.0, 15.0), (18.0, 22.0, 14.0), PAL["glass_aqua"])
        return acc

    # Twin 7F architectural concrete + vertical sun-shatter fin towers
    tw, td = 20.0, d - 8.0
    for sx in (-1, 1):
        tx = sx * 19.0
        acc.box((tx, 0.0, 0.5 * z_eaves + 0.12), (tw - 0.6, td - 0.6, z_eaves), PAL["concrete"])
        add_curtain_wall(acc, tx - 0.5 * tw + 0.5, tx + 0.5 * tw - 0.5, -0.5 * td, g_h, z_eaves, (0, -1), 7, 6, PAL["glass_blue"], PAL["white"], PAL["concrete"], lod=lod, with_fins=True)
        add_curtain_wall(acc, tx - 0.5 * tw + 0.5, tx + 0.5 * tw - 0.5, +0.5 * td, g_h, z_eaves, (0, +1), 7, 6, PAL["glass_blue"], PAL["white"], PAL["concrete"], lod=lod, with_fins=True)
        add_curtain_wall(acc, -0.5 * td + 0.5, +0.5 * td - 0.5, tx - 0.5 * tw, g_h, z_eaves, (-1, 0), 12, 6, PAL["glass_blue"], PAL["white"], PAL["concrete"], lod=lod, with_fins=True)
        add_curtain_wall(acc, -0.5 * td + 0.5, +0.5 * td - 0.5, tx + 0.5 * tw, g_h, z_eaves, (+1, 0), 12, 6, PAL["glass_blue"], PAL["white"], PAL["concrete"], lod=lod, with_fins=True)
        acc.box((tx, 0.0, z_eaves + 0.35), (tw + 0.3, td + 0.3, 0.7), PAL["white"])

    # Central glass sky-bridge (levels 3..7) + covered drop-off porch below
    acc.box((0.0, -2.0, 0.5 * (z_eaves + 7.5)), (18.0, 24.0, z_eaves - 7.5), PAL["glass_aqua"])
    add_curtain_wall(acc, -9.0, +9.0, -14.0, 7.5, z_eaves, (0, -1), 5, 5, PAL["glass_aqua"], PAL["steel_light"], PAL["white"], lod=lod)
    add_porte_cochere(acc, 0.0, -14.0, 0.24, 17.0, 10.0, 4.6, PAL["concrete"], PAL["white"], PAL["charcoal"], lod=lod)
    if lod == 0:
        add_potted_plant(acc, -11.0, -25.0, 0.24, 1.5, lod)
        add_potted_plant(acc, +11.0, -25.0, 0.24, 1.5, lod)

    add_rooftop_chiller_plant(acc, -19.0, +14.0, z_eaves + 0.7, 9.0, 9.0, lod=lod)
    add_rooftop_chiller_plant(acc, +19.0, +14.0, z_eaves + 0.7, 9.0, 9.0, lod=lod)
    return acc


def build_b48_business_hotel(lod: int) -> MeshAcc:
    """B48: Business Hotel (City) (34x62m, 7F) - Dark granite podium + cream rhythmic window-grid tower, grand porte-cochere."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 34.0, 62.0
    hw, hd = 0.5 * w, 0.5 * d
    pod_h = 7.4
    fl_h = 3.25
    z_eaves = pod_h + 5 * fl_h  # 23.65m

    acc.box((0.0, 0.0, 0.12), (w + 0.5, d + 0.5, 0.24), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.0, 0.5 * pod_h), (w, d - 4.0, pod_h), EXTRA_PAL["granite_dark"])
        acc.box((0.0, +1.0, pod_h + 0.5 * (5 * fl_h)), (w - 4.0, d - 12.0, 5 * fl_h), PAL["cream"])
        acc.box((0.0, -hd + 1.0, 4.5), (14.0, 5.0, 1.0), PAL["gold"])
        return acc

    # 2F Dark granite podium
    acc.box((0.0, +1.0, 0.5 * pod_h + 0.12), (w, d - 6.0, pod_h), EXTRA_PAL["granite_dark"])
    acc.box((0.0, -hd + 4.0, 2.2), (10.0, 0.14, 4.0), PAL["lit_warm"])  # glowing hotel lobby entrance
    # Grand projecting illuminated drop-off porte-cochere canopy
    add_porte_cochere(acc, 0.0, -hd + 4.0, 0.24, 15.0, 5.5, 4.8, EXTRA_PAL["granite_dark"], PAL["gold"], PAL["cream_trim"], lod=lod)
    if lod == 0:
        for sx in (-1, 1):
            add_potted_plant(acc, sx * 8.2, -hd + 1.0, 0.24, 1.4, lod)

    # Upper 5F cream tower with rhythmic window-grid + stone vertical piers
    tw, td = w - 3.6, d - 10.0
    thw, thd = 0.5 * tw, 0.5 * td
    tyc = +2.0
    acc.box((0.0, tyc, pod_h + 0.5 * (5 * fl_h)), (tw, td, 5 * fl_h), PAL["cream"])

    # Use rhythmic recessed window bands + vertical cream piers so LOD0 stays ~2,200 tris
    add_curtain_wall(acc, -thw + 1.2, +thw - 1.2, tyc - thd, pod_h, z_eaves, (0, -1), 9, 5, PAL["glass_blue"], PAL["cream_trim"], PAL["cream"], lod=lod, with_fins=True)
    add_curtain_wall(acc, -thw + 1.2, +thw - 1.2, tyc + thd, pod_h, z_eaves, (0, +1), 9, 5, PAL["glass_blue"], PAL["cream_trim"], PAL["cream"], lod=lod, with_fins=True)
    add_curtain_wall(acc, tyc - thd + 1.2, tyc + thd - 1.2, -thw, pod_h, z_eaves, (-1, 0), 14, 5, PAL["glass_blue"], PAL["cream_trim"], PAL["cream"], lod=lod, with_fins=True)
    add_curtain_wall(acc, tyc - thd + 1.2, tyc + thd - 1.2, +thw, pod_h, z_eaves, (+1, 0), 14, 5, PAL["glass_blue"], PAL["cream_trim"], PAL["cream"], lod=lod, with_fins=True)

    # Crown cornice & rooftop pool deck pergola / chiller
    acc.box((0.0, tyc, z_eaves + 0.4), (tw + 0.6, td + 0.6, 0.8), PAL["cream_trim"])
    add_rooftop_chiller_plant(acc, 0.0, tyc + 10.0, z_eaves + 0.8, 10.0, 8.0, lod=lod)
    return acc


def build_k05_metal_market_shop(lod: int) -> MeshAcc:
    """K05: Mixed-Use Market Hardware Shop (8x14m, 2F) - Double-wide hardware depot bay, side stacked pipes/crates, residence above."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 8.0, 14.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, f1_h = 3.5, 3.1
    z_eaves = g_h + f1_h  # 6.6m

    acc.box((0.0, 0.0, 0.08), (w, d, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.4, 0.5 * z_eaves), (w, d - 1.2, z_eaves), PAL["cream_shade"])
        acc.box((0.0, 0.4, z_eaves + 0.45), (w + 0.16, d - 1.0, 0.9), PAL["cream_trim"])
        return acc

    acc.box((0.0, 0.5, 0.5 * z_eaves + 0.08), (w, d - 1.4, z_eaves), PAL["cream_shade"])
    y_front = -hd + 1.2

    # Open double-wide hardware depot bay on ground floor + raised shutter box + wide fascia signboard
    add_shop_bay(acc, 0.0, y_front, 0.16, 7.2, 3.30, PAL["sign_blue"], PAL["steel_blue"], is_open=True, with_awning=True, lod=lod)
    if lod == 0:
        # Stacked steel pipes & crates beside entrance
        for pi in range(3):
            for pj in range(2):
                acc.cyl((-2.9, y_front - 0.55 + pj * 0.14, 0.30 + pi * 0.14), 0.06, 0.06, 1.8, PAL["steel_light"], segs=8, rot_y=math.pi * 0.5)
        add_crate_stack(acc, +2.6, y_front - 0.55, 0.16, lod)
        # Hardware shelving silhouette inside bay
        acc.box((0.0, y_front + 0.25, 1.4), (5.2, 0.20, 2.0), PAL["slate"])

    # Upper weathered balcony residence
    acc.box((0.0, 0.5, g_h + 0.12), (w + 0.2, d - 1.2, 0.14), PAL["cream_trim"])
    add_balcony(acc, 0.0, y_front, g_h + 0.16, 6.4, 1.05, PAL["cream_trim"], glass_rail=False, lod=lod)
    for sy in (-2.5, +2.5):
        add_window(acc, sy, -hw, g_h + 1.75, 1.15, 1.20, (-1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
        add_window(acc, sy, +hw, g_h + 1.75, 1.15, 1.20, (+1, 0), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window(acc, -1.8, +hd - 0.2, g_h + 1.75, 1.15, 1.20, (0, +1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window(acc, +1.8, +hd - 0.2, g_h + 1.75, 1.15, 1.20, (0, +1), PAL["teak_green"], PAL["recess"], PAL["cream_trim"], lod=lod)

    add_parapet_with_jaali(acc, w, d - 1.4, z_eaves + 0.08, 0.85, PAL["cream_shade"], PAL["cream_trim"], PAL["concrete"], pediment=False, lod=lod)
    add_rooftop_props(acc, w, d - 1.4, z_eaves + 0.24, lod=lod, add_tank=True)
    return acc


def build_k09_bazaar_block(lod: int) -> MeshAcc:
    """K09: Busy Market Bazaar Strip (10x18m, 2F) - 4-bay bazaar block, continuous sloped corrugated shop canopy, shuttered warehouse windows."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 18.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, f1_h = 3.4, 3.0
    z_eaves = g_h + f1_h  # 6.4m

    acc.box((0.0, 0.0, 0.08), (w, d, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((0.0, 0.4, 0.5 * z_eaves), (w, d - 1.4, z_eaves), PAL["mustard"])
        acc.box((0.0, -hd + 0.6, 2.5), (w + 0.2, 1.4, 0.2), PAL["steel_blue"])
        return acc

    acc.box((0.0, 0.6, 0.5 * z_eaves + 0.08), (w, d - 1.6, z_eaves), PAL["mustard"])
    y_front = -hd + 1.4

    # Continuous 4-bay bazaar commercial front (4 bays across 9.6m)
    bay_w = 2.4
    sign_cols = (PAL["sign_red"], PAL["sign_green"], PAL["sign_yellow"], PAL["sign_blue"])
    flap_cols = (PAL["terracotta"], PAL["crimson"], PAL["sign_green"], PAL["mustard"])
    for bi in range(4):
        bx = -4.8 + (bi + 0.5) * bay_w
        add_shop_bay(acc, bx, y_front, 0.16, bay_w, 3.15, sign_cols[bi], flap_cols[bi], is_open=(bi != 2), with_awning=False, lod=lod)
        if lod < 2:
            # Colorful awning edge flaps beneath the continuous corrugated canopy
            acc.box((bx, y_front - 1.15, 2.22), (bay_w - 0.10, 0.06, 0.28), flap_cols[bi])

    # Continuous sloped corrugated metal canopy across all 4 bays
    if lod < 2:
        acc.box((0.0, y_front - 0.58, 2.48), (w - 0.1, 1.32, 0.08), PAL["steel_blue"], rot_x=0.30)
        if lod == 0:
            for ri in range(18):
                rx = -hw + 0.35 + ri * ((w - 0.7) / 17.0)
                acc.cyl((rx, y_front - 0.58, 2.54), 0.04, 0.04, 1.32, EXTRA_PAL["steel_rib"], segs=6, rot_x=math.pi * 0.5 + 0.30)

    # Upper shuttered warehouse windows
    acc.box((0.0, 0.6, g_h + 0.12), (w + 0.18, d - 1.4, 0.14), PAL["cream_trim"])
    for wx in (-3.2, -1.1, +1.1, +3.2):
        add_window(acc, wx, y_front, g_h + 1.55, 1.15, 1.30, (0, -1), PAL["teak_brown"], PAL["teak_dark"], PAL["cream_trim"], lod=lod)
    for sy in (-4.0, 0.0, +4.0):
        add_window(acc, sy, -hw, g_h + 1.55, 1.2, 1.2, (-1, 0), PAL["teak_brown"], PAL["recess"], PAL["cream_trim"], lod=lod)
        add_window(acc, sy, +hw, g_h + 1.55, 1.2, 1.2, (+1, 0), PAL["teak_brown"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window(acc, -2.5, +hd - 0.2, g_h + 1.55, 1.2, 1.2, (0, +1), PAL["teak_brown"], PAL["recess"], PAL["cream_trim"], lod=lod)
    add_window(acc, +2.5, +hd - 0.2, g_h + 1.55, 1.2, 1.2, (0, +1), PAL["teak_brown"], PAL["recess"], PAL["cream_trim"], lod=lod)

    add_parapet_with_jaali(acc, w, d - 1.6, z_eaves + 0.08, 0.85, PAL["mustard"], PAL["cream_trim"], PAL["cream_shade"], pediment=False, lod=lod)
    add_rooftop_props(acc, w, d - 1.6, z_eaves + 0.24, lod=lod, add_tank=True)
    return acc


def build_k11_canal_mixed_row(lod: int) -> MeshAcc:
    """K11: Canal Road Mixed Row Block (10x18m, 3F) - Bright pastel pink & teal 3F street-row, ground shops, clothes-line balconies & AC units."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 18.0
    hw, hd = 0.5 * w, 0.5 * d
    g_h, fl_h = 3.4, 3.1
    z_eaves = g_h + 2 * fl_h  # 9.6m

    acc.box((0.0, 0.0, 0.08), (w, d, 0.16), PAL["pavement"])
    if lod >= 2:
        acc.box((-2.5, 0.4, 0.5 * z_eaves), (5.0, d - 1.2, z_eaves), PAL["pink"])
        acc.box((+2.5, 0.4, 0.5 * z_eaves), (5.0, d - 1.2, z_eaves), PAL["teal_wall"])
        return acc

    # Twin alternating pastel pink & teal row bays
    acc.box((-2.5, 0.5, 0.5 * z_eaves + 0.08), (5.0, d - 1.4, z_eaves), PAL["pink"])
    acc.box((+2.5, 0.5, 0.5 * z_eaves + 0.08), (5.0, d - 1.4, z_eaves), PAL["teal_wall"])
    y_front = -hd + 1.2

    # Ground shops (3 bays across 10m)
    bay_w = 3.2
    for bi in range(3):
        bx = -3.2 + bi * bay_w
        add_shop_bay(
            acc, bx, y_front, 0.16, bay_w, 3.15,
            (PAL["sign_green"], PAL["sign_red"], PAL["sign_blue"])[bi],
            (PAL["terracotta"], PAL["steel_blue"], PAL["mustard"])[bi],
            is_open=(bi != 1), with_awning=True, lod=lod,
        )

    # Upper 2 floors: clothes-line style recessed balconies & AC units
    for fi in range(2):
        zf = g_h + fi * fl_h + 0.16
        acc.box((0.0, 0.5, zf), (w + 0.16, d - 1.2, 0.14), PAL["pink_trim"])
        for bx, trim_c in ((-2.5, PAL["pink_trim"]), (+2.5, PAL["white"])):
            add_balcony(acc, bx, y_front, zf, 4.0, 1.05, trim_c, glass_rail=False, lod=lod)
            if lod == 0:
                # Clothes-line bar + hanging colorful laundry panels
                acc.cyl((bx, y_front - 0.85, zf + 1.95), 0.015, 0.015, 3.6, PAL["iron"], segs=6, rot_y=math.pi * 0.5)
                acc.box((bx - 0.9, y_front - 0.85, zf + 1.65), (0.48, 0.04, 0.56), EXTRA_PAL["cloth_gold"])
                acc.box((bx + 0.1, y_front - 0.85, zf + 1.62), (0.52, 0.04, 0.60), EXTRA_PAL["cloth_teal"])
                acc.box((bx + 1.0, y_front - 0.85, zf + 1.68), (0.44, 0.04, 0.50), PAL["pink_trim"])

    # Side & rear windows + AC units
    zs = (g_h + 1.65, g_h + fl_h + 1.65)
    add_window_grid(acc, (-4.0, +0.5, +4.5), -hw, zs, 1.15, 1.20, (-1, 0), PAL["teak_dark"], PAL["recess"], PAL["pink_trim"], lod=lod)
    add_window_grid(acc, (-4.0, +0.5, +4.5), +hw, zs, 1.15, 1.20, (+1, 0), PAL["teak_dark"], PAL["recess"], PAL["white"], lod=lod)
    add_window_grid(acc, (-2.5, +2.5), +hd - 0.2, zs, 1.15, 1.20, (0, +1), PAL["teak_dark"], PAL["recess"], PAL["white"], lod=lod)
    if lod == 0:
        add_ac_unit(acc, -hw, -1.8, g_h + 2.1, (-1, 0), lod)
        add_ac_unit(acc, +hw, -1.8, g_h + fl_h + 2.1, (+1, 0), lod)

    add_parapet_with_jaali(acc, w, d - 1.4, z_eaves + 0.08, 0.85, PAL["pink"], PAL["pink_trim"], PAL["white"], pediment=False, lod=lod)
    add_rooftop_props(acc, w, d - 1.4, z_eaves + 0.24, lod=lod, add_tank=True)
    return acc


# ---------------------------------------------------------------------------
# Building Registry & Runner
# ---------------------------------------------------------------------------

BUILDINGS: List[Dict[str, Any]] = [
    {
        "id": "CHN_051_walkup_apt",
        "title": "Walk-up Apartment",
        "source_card": "CHN_051",
        "category": "residential",
        "substyle": "walkup_apt",
        "preferred_localities": ["Kodambakkam", "Ashok Nagar"],
        "dimensions_m": {"width": 10.0, "depth": 20.0, "height": 11.45},
        "floors": 3,
        "shop_ground": False,
        "builder": build_chn_051_walkup_apt,
        "colliders": [
            ("COL_Main", (0.0, 1.4, 5.5), (10.0, 16.5, 11.0)),
            ("COL_Compound", (0.0, -9.8, 0.78), (10.0, 0.5, 1.56)),
        ],
    },
    {
        "id": "CHN_052_builder_floor",
        "title": "Builder Floor Apartment",
        "source_card": "CHN_052",
        "category": "residential",
        "substyle": "builder_floor",
        "preferred_localities": ["Anna Nagar", "T. Nagar", "Adyar"],
        "dimensions_m": {"width": 14.0, "depth": 22.0, "height": 14.5},
        "floors": 4,
        "shop_ground": False,
        "builder": build_chn_052_builder_floor,
        "colliders": [
            ("COL_Main", (0.0, -0.4, 7.0), (14.0, 20.6, 14.0)),
            ("COL_Compound", (0.0, -10.75, 0.78), (14.0, 0.5, 1.56)),
        ],
    },
    {
        "id": "CHN_058_apt_with_shops",
        "title": "Apartment with Shops (G+3)",
        "source_card": "CHN_058",
        "category": "mixed_use",
        "substyle": "apt_shops_4f",
        "preferred_localities": ["Anna Nagar", "T. Nagar", "Velachery"],
        "dimensions_m": {"width": 18.0, "depth": 28.0, "height": 14.8},
        "floors": 4,
        "shop_ground": True,
        "builder": build_chn_058_apt_with_shops,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 7.2), (18.0, 27.6, 14.4)),
        ],
    },
    {
        "id": "CHN_059_studio_apt",
        "title": "Service Apartment / Studio Block",
        "source_card": "CHN_059",
        "category": "residential",
        "substyle": "studio_5f",
        "preferred_localities": ["Nungambakkam", "T. Nagar", "OMR"],
        "dimensions_m": {"width": 16.0, "depth": 24.0, "height": 17.55},
        "floors": 5,
        "shop_ground": False,
        "builder": build_chn_059_studio_apt,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 8.75), (16.0, 23.6, 17.5)),
        ],
    },
    {
        "id": "B09_house_with_shop",
        "title": "Individual House with Shop",
        "source_card": "09",
        "category": "mixed_use",
        "substyle": "house_shop",
        "preferred_localities": ["Mylapore", "Anna Nagar", "Kodambakkam"],
        "dimensions_m": {"width": 8.0, "depth": 12.0, "height": 8.7},
        "floors": 2,
        "shop_ground": True,
        "builder": build_b09_house_with_shop,
        "colliders": [
            ("COL_Main", (0.0, 0.5, 4.1), (8.0, 10.6, 8.2)),
        ],
    },
    {
        "id": "B11_street_shop",
        "title": "Street Shop (Local Market)",
        "source_card": "11",
        "category": "commercial",
        "substyle": "street_shop",
        "preferred_localities": ["T. Nagar", "George Town", "Mylapore"],
        "dimensions_m": {"width": 6.0, "depth": 12.0, "height": 7.4},
        "floors": 2,
        "shop_ground": True,
        "builder": build_b11_street_shop,
        "colliders": [
            ("COL_Main", (0.0, 0.6, 3.7), (6.0, 10.4, 7.4)),
        ],
    },
    {
        "id": "B12_mixed_use_shop",
        "title": "Mixed-Use Building (Shops+Res)",
        "source_card": "12",
        "category": "mixed_use",
        "substyle": "mixed_3f",
        "preferred_localities": ["T. Nagar", "Parrys Corner", "Anna Nagar"],
        "dimensions_m": {"width": 10.0, "depth": 15.0, "height": 11.75},
        "floors": 3,
        "shop_ground": True,
        "builder": build_b12_mixed_use_shop,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 5.8), (10.0, 15.0, 11.6)),
        ],
    },
    {
        "id": "B13_showroom_auto",
        "title": "Vehicle Showroom",
        "source_card": "13",
        "category": "commercial",
        "substyle": "showroom",
        "preferred_localities": ["Anna Salai", "Guindy", "Nungambakkam"],
        "dimensions_m": {"width": 18.0, "depth": 30.0, "height": 7.4},
        "floors": 2,
        "shop_ground": False,
        "builder": build_b13_showroom_auto,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 3.7), (18.0, 30.0, 7.4)),
        ],
    },
    {
        "id": "B14_shopping_complex",
        "title": "Shopping Complex (Retail)",
        "source_card": "14",
        "category": "commercial",
        "substyle": "shopping_complex",
        "preferred_localities": ["T. Nagar", "Anna Nagar", "Velachery"],
        "dimensions_m": {"width": 24.0, "depth": 36.0, "height": 14.5},
        "floors": 4,
        "shop_ground": True,
        "builder": build_b14_shopping_complex,
        "colliders": [
            ("COL_Main", (0.0, 1.0, 7.25), (24.0, 34.0, 14.5)),
            ("COL_Verandah", (0.0, -18.6, 2.4), (10.6, 3.2, 4.8)),
        ],
    },
    {
        "id": "B15_it_office",
        "title": "IT Office Building",
        "source_card": "15",
        "category": "commercial",
        "substyle": "it_office",
        "preferred_localities": ["Taramani", "Guindy", "OMR"],
        "dimensions_m": {"width": 30.0, "depth": 40.0, "height": 21.15},
        "floors": 6,
        "shop_ground": False,
        "builder": build_b15_it_office,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 10.5), (30.0, 40.0, 21.0)),
            ("COL_Verandah", (0.0, -21.8, 2.2), (12.0, 4.2, 4.4)),
        ],
    },
    {
        "id": "B16_bank_heritage",
        "title": "Bank Building (Heritage Style)",
        "source_card": "16",
        "category": "commercial",
        "substyle": "heritage_bank",
        "preferred_localities": ["Parrys Corner", "George Town", "Anna Salai"],
        "dimensions_m": {"width": 18.0, "depth": 28.0, "height": 9.8},
        "floors": 2,
        "shop_ground": False,
        "builder": build_b16_bank_heritage,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 4.9), (18.0, 28.0, 9.8)),
        ],
    },
    {
        "id": "B19_wholesale_market",
        "title": "Wholesale Market Hall",
        "source_card": "19",
        "category": "commercial",
        "substyle": "market_hall",
        "preferred_localities": ["Koyambedu", "Parrys Corner"],
        "dimensions_m": {"width": 50.0, "depth": 80.0, "height": 12.1},
        "floors": 1,
        "shop_ground": True,
        "builder": build_b19_wholesale_market,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 6.0), (50.0, 80.0, 12.0)),
        ],
    },
    {
        "id": "B20_multiplex",
        "title": "Multiplex / Cinema",
        "source_card": "20",
        "category": "commercial",
        "substyle": "multiplex",
        "preferred_localities": ["T. Nagar", "Vadapalani", "Anna Nagar"],
        "dimensions_m": {"width": 36.0, "depth": 50.0, "height": 13.2},
        "floors": 4,
        "shop_ground": False,
        "builder": build_b20_multiplex,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 6.6), (36.0, 50.0, 13.2)),
            ("COL_Verandah", (0.0, -26.6, 2.4), (18.4, 3.8, 4.8)),
        ],
    },
    {
        "id": "B41_it_park_omr",
        "title": "IT Park / Corporate Office",
        "source_card": "41",
        "category": "commercial",
        "substyle": "it_campus",
        "preferred_localities": ["OMR", "Taramani", "Guindy"],
        "dimensions_m": {"width": 80.0, "depth": 120.0, "height": 27.5},
        "floors": 8,
        "shop_ground": False,
        "builder": build_b41_it_park_omr,
        "colliders": [
            ("COL_Main", (0.0, 4.0, 13.75), (74.0, 96.0, 27.5)),
            ("COL_Compound", (0.0, -58.8, 1.5), (74.0, 2.0, 3.0)),
        ],
    },
    {
        "id": "B43_shopping_mall",
        "title": "Large Shopping Mall",
        "source_card": "43",
        "category": "commercial",
        "substyle": "mega_mall",
        "preferred_localities": ["Velachery", "Vadapalani", "Anna Nagar"],
        "dimensions_m": {"width": 80.0, "depth": 110.0, "height": 20.6},
        "floors": 4,
        "shop_ground": True,
        "builder": build_b43_shopping_mall,
        "colliders": [
            ("COL_Main", (0.0, 4.0, 8.8), (78.0, 96.0, 17.6)),
            ("COL_Verandah", (0.0, -59.5, 2.7), (24.0, 7.5, 5.4)),
        ],
    },
    {
        "id": "B44_sez_tech_office",
        "title": "SEZ / Tech Office Building",
        "source_card": "44",
        "category": "commercial",
        "substyle": "sez_office",
        "preferred_localities": ["Taramani", "Guindy", "OMR"],
        "dimensions_m": {"width": 60.0, "depth": 90.0, "height": 24.4},
        "floors": 7,
        "shop_ground": False,
        "builder": build_b44_sez_tech_office,
        "colliders": [
            ("COL_Main", (0.0, 0.0, 12.2), (58.0, 82.0, 24.4)),
            ("COL_Verandah", (0.0, -19.0, 2.4), (17.0, 10.0, 4.8)),
        ],
    },
    {
        "id": "B48_business_hotel",
        "title": "Business Hotel (City)",
        "source_card": "48",
        "category": "commercial",
        "substyle": "hotel_tower",
        "preferred_localities": ["Anna Salai", "Nungambakkam", "Guindy"],
        "dimensions_m": {"width": 34.0, "depth": 62.0, "height": 24.4},
        "floors": 7,
        "shop_ground": False,
        "builder": build_b48_business_hotel,
        "colliders": [
            ("COL_Main", (0.0, 1.0, 12.2), (34.0, 56.0, 24.4)),
            ("COL_Verandah", (0.0, -29.8, 2.5), (15.0, 5.5, 5.0)),
        ],
    },
    {
        "id": "K05_metal_market_shop",
        "title": "Mixed-Use Market Hardware Shop",
        "source_card": "K05",
        "category": "mixed_use",
        "substyle": "hardware_shop",
        "preferred_localities": ["Parrys Corner", "George Town", "Chintadripet"],
        "dimensions_m": {"width": 8.0, "depth": 14.0, "height": 8.7},
        "floors": 2,
        "shop_ground": True,
        "builder": build_k05_metal_market_shop,
        "colliders": [
            ("COL_Main", (0.0, 0.5, 4.1), (8.0, 12.6, 8.2)),
        ],
    },
    {
        "id": "K09_bazaar_block",
        "title": "Busy Market Bazaar Strip",
        "source_card": "K09",
        "category": "commercial",
        "substyle": "bazaar_strip",
        "preferred_localities": ["T. Nagar", "George Town", "Mylapore"],
        "dimensions_m": {"width": 10.0, "depth": 18.0, "height": 7.4},
        "floors": 2,
        "shop_ground": True,
        "builder": build_k09_bazaar_block,
        "colliders": [
            ("COL_Main", (0.0, 0.6, 3.7), (10.0, 16.4, 7.4)),
        ],
    },
    {
        "id": "K11_canal_mixed_row",
        "title": "Canal Road Mixed Row Block",
        "source_card": "K11",
        "category": "mixed_use",
        "substyle": "canal_row",
        "preferred_localities": ["Perambur", "Korattur", "Chintadripet"],
        "dimensions_m": {"width": 10.0, "depth": 18.0, "height": 11.75},
        "floors": 3,
        "shop_ground": True,
        "builder": build_k11_canal_mixed_row,
        "colliders": [
            ("COL_Main", (0.0, 0.5, 5.4), (10.0, 16.6, 10.8)),
        ],
    },
]


def verify_glb(glb_path: Path) -> Tuple[bool, str]:
    """Check GLB header magic ('glTF'), chunk structure, and presence of COLOR_0 vertex colors."""
    raw = glb_path.read_bytes()
    if len(raw) < 28 or raw[:4] != b"glTF":
        return False, "Invalid GLB header magic"
    version, total_len = struct.unpack_from("<II", raw, 4)
    if version != 2 or total_len != len(raw):
        return False, f"Unexpected version/length: v={version}, len={total_len}!={len(raw)}"
    json_len, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        return False, "Missing JSON chunk"
    gltf = json.loads(raw[20 : 20 + json_len].decode("utf-8"))
    nodes = {n.get("name") for n in gltf.get("nodes", [])}
    for req in ("LOD0", "LOD1", "LOD2", "COL_Main"):
        if req not in nodes:
            return False, f"Missing required node {req}"
    # Verify COLOR_0 attribute on LOD0..2 meshes
    meshes = gltf.get("meshes", [])
    lod_has_col = all(
        any("COLOR_0" in p.get("attributes", {}) for p in m.get("primitives", []))
        for m in meshes[:3]
    )
    if not lod_has_col:
        return False, "Missing COLOR_0 vertex color attribute"
    return True, "OK"


def main() -> None:
    models_meta: List[Dict[str, Any]] = []
    for spec in BUILDINGS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mat = make_vertex_material("ChennaiMat")
        builder: Callable[[int], MeshAcc] = spec["builder"]
        accs = (builder(0), builder(1), builder(2))
        out_glb = PACK_DIR / f"{spec['id']}.glb"
        export_glb_scene(out_glb, mat, accs, spec["colliders"])

        # Collect exact verts & tris for LOD0..2 and COL_*
        lod_stats: Dict[str, Dict[str, int]] = {}
        for ob in bpy.data.objects:
            if ob.type == "MESH":
                verts = len(ob.data.vertices)
                tris = sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons)
                lod_stats[ob.name] = {"verts": verts, "tris": tris}

        ok, msg = verify_glb(out_glb)
        if not ok:
            raise RuntimeError(f"{spec['id']} verification failed: {msg}")

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
            "glb_bytes": out_glb.stat().st_size,
            "lod_stats": lod_stats,
        }
        models_meta.append(entry)
        print(
            f"BUILT {spec['id']}: bytes={entry['glb_bytes']} "
            f"LOD0={lod_stats['LOD0']['tris']}t "
            f"LOD1={lod_stats['LOD1']['tris']}t "
            f"LOD2={lod_stats['LOD2']['tris']}t"
        )

    META_PATH.write_text(json.dumps({"shard": 3, "count": len(models_meta), "models": models_meta}, indent=2), encoding="utf-8")
    print(f"SHARD_3_DONE: {len(models_meta)} GLBs -> {META_PATH}")


if __name__ == "__main__":
    main()
