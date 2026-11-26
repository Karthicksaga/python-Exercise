"""Blender 5.x shard 5 generator: 20 Heritage, North Chennai, Coastal & Canal buildings.

Builds the 20 assigned pack_100 GLBs into godot-chennai/assets/buildings/pack_100/<id>.glb
and writes summary metadata to godot-chennai/tools/blender/buildings/shard_5_meta.json.

Usage:
    /opt/homebrew/bin/blender -b --factory-startup --python godot-chennai/tools/blender/buildings/shard_5.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Callable, Dict, List, Sequence, Tuple

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
META_PATH = THIS_DIR / "shard_5_meta.json"

# Extended Chennai palette entries matching shard 5 archetypes
XPAL: Dict[str, Tuple[float, float, float, float]] = {
    "granite": hex_lin("#6F6D66"),
    "granite_dark": hex_lin("#4E4C46"),
    "sandstone": hex_lin("#D8BC88"),
    "sandstone_dark": hex_lin("#B59660"),
    "lime_blue": hex_lin("#85BBD0"),
    "pastel_yellow": hex_lin("#EDE09A"),
    "emerald_dark": hex_lin("#195836"),
    "sheet_metal": hex_lin("#7F8A94"),
    "sheet_rust": hex_lin("#8D5B46"),
    "wood_light": hex_lin("#9B6B3B"),
    "terracotta_hi": hex_lin("#CC6B49"),
}


# ---------------------------------------------------------------------------
# Reusable Architectural Helpers
# ---------------------------------------------------------------------------


def add_strut(
    acc: MeshAcc,
    p0: Tuple[float, float, float],
    p1: Tuple[float, float, float],
    thick_x: float,
    thick_y: float,
    colour: Tuple[float, float, float, float],
) -> None:
    """Place a rectangular beam/strut connecting 3D endpoints p0 and p1."""
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    if length <= 1e-4:
        return
    ux, uy, uz = dx / length, dy / length, dz / length
    rot_y = math.acos(max(-1.0, min(1.0, uz)))
    rot_z = math.atan2(uy, ux)
    mid = (0.5 * (p0[0] + p1[0]), 0.5 * (p0[1] + p1[1]), 0.5 * (p0[2] + p1[2]))
    acc.box(mid, (thick_x, thick_y, length), colour, rot_y=rot_y, rot_z=rot_z)


def add_steps(
    acc: MeshAcc,
    cx: float,
    y_front: float,
    y_back: float,
    z0: float,
    z1: float,
    width: float,
    n_steps: int,
    col_tread: Tuple[float, float, float, float],
    col_cheek: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Build stepped concrete/stone flight rising from (y_front, z0) up to (y_back, z1)."""
    if lod >= 2:
        return
    steps = n_steps if lod == 0 else max(2, min(3, n_steps // 2))
    dy = (y_back - y_front) / steps
    dz = (z1 - z0) / steps
    for i in range(steps):
        yc = y_front + (i + 0.5) * dy
        top_z = z0 + (i + 1) * dz
        h = top_z - z0
        acc.box((cx, yc, z0 + 0.5 * h), (width, abs(dy) + 0.04, h), col_tread)
    if lod == 0:
        for sx in (-1, 1):
            acc.box(
                (cx + sx * (0.5 * width + 0.10), 0.5 * (y_front + y_back), 0.5 * (z0 + z1) + 0.08),
                (0.20, abs(y_back - y_front) + 0.1, (z1 - z0) + 0.25),
                col_cheek,
            )


def add_simple_win(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    cz: float,
    ww: float,
    wh: float,
    face_dir: Tuple[float, float],
    pane_col: Tuple[float, float, float, float],
) -> None:
    """Lightweight single-box window pane for LOD1."""
    nx, ny = face_dir
    if abs(ny) > abs(nx):
        acc.box((cx, y_wall + ny * 0.04, cz), (ww, 0.06, wh), pane_col)
    else:
        acc.box((y_wall + nx * 0.04, cx, cz), (0.06, ww, wh), pane_col)


def add_pointed_window(
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
    lod: int = 0,
) -> None:
    """Lancet/pointed arch window on +/-Y or +/-X face."""
    nx, ny = face_dir
    if abs(ny) > abs(nx):
        s = ny
        acc.box((cx, y_wall + s * 0.03, cz), (ww, 0.10, wh), frame_col)
        acc.box((cx, y_wall + s * 0.06, cz), (ww - 0.18, 0.04, wh - 0.14), pane_col)
        acc.box((cx, y_wall + s * 0.09, cz - 0.5 * wh - 0.05), (ww + 0.20, 0.18, 0.10), trim_col)
        # Pointed lancet apex triangle built from 2 angled hood slabs
        top_z = cz + 0.5 * wh
        acc.box((cx - 0.22 * ww, y_wall + s * 0.07, top_z + 0.22 * ww), (0.58 * ww, 0.14, 0.12), trim_col, rot_y=0.68)
        acc.box((cx + 0.22 * ww, y_wall + s * 0.07, top_z + 0.22 * ww), (0.58 * ww, 0.14, 0.12), trim_col, rot_y=-0.68)
        acc.box((cx, y_wall + s * 0.055, top_z + 0.14 * ww), (ww * 0.56, 0.04, 0.28 * ww), pane_col)
        if lod == 0:
            acc.box((cx, y_wall + s * 0.08, cz + 0.06 * ww), (0.06, 0.05, wh + 0.12 * ww), frame_col)
    else:
        s = nx
        acc.box((y_wall + s * 0.03, cx, cz), (0.10, ww, wh), frame_col)
        acc.box((y_wall + s * 0.06, cx, cz), (0.04, ww - 0.18, wh - 0.14), pane_col)
        acc.box((y_wall + s * 0.09, cx, cz - 0.5 * wh - 0.05), (0.18, ww + 0.20, 0.10), trim_col)
        top_z = cz + 0.5 * wh
        acc.box((y_wall + s * 0.07, cx - 0.22 * ww, top_z + 0.22 * ww), (0.14, 0.58 * ww, 0.12), trim_col, rot_x=-0.68)
        acc.box((y_wall + s * 0.07, cx + 0.22 * ww, top_z + 0.22 * ww), (0.14, 0.58 * ww, 0.12), trim_col, rot_x=0.68)
        acc.box((y_wall + s * 0.055, cx, top_z + 0.14 * ww), (0.04, ww * 0.56, 0.28 * ww), pane_col)
        if lod == 0:
            acc.box((y_wall + s * 0.08, cx, cz + 0.06 * ww), (0.05, 0.06, wh + 0.12 * ww), frame_col)


def add_onion_dome(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z_drum_base: float,
    drum_r: float,
    drum_h: float,
    dome_r: float,
    dome_h: float,
    drum_col: Tuple[float, float, float, float],
    dome_col: Tuple[float, float, float, float],
    trim_col: Tuple[float, float, float, float],
    finial_col: Tuple[float, float, float, float],
    lod: int = 0,
) -> float:
    """Octagonal/cylindrical drum + bulging onion dome + lotus base + gold finial."""
    segs = 14 if lod == 0 else (8 if lod == 1 else 6)
    acc.cyl((cx, cy, z_drum_base + 0.5 * drum_h), drum_r, drum_r, drum_h, drum_col, segs=segs)
    if lod <= 1:
        acc.cyl((cx, cy, z_drum_base + drum_h + 0.06), drum_r * 1.07, drum_r * 1.07, 0.12, trim_col, segs=segs)

    z0 = z_drum_base + drum_h + (0.12 if lod <= 1 else 0.0)
    # Onion profile (t in 0..1)
    if lod == 0:
        profile = [(0.00, 0.88), (0.14, 1.03), (0.35, 1.05), (0.58, 0.88), (0.78, 0.58), (0.92, 0.24)]
    elif lod == 1:
        profile = [(0.00, 0.90), (0.32, 1.05), (0.68, 0.72)]
    else:
        profile = [(0.0, 0.95), (0.45, 0.98)]
    prev = None
    faces = []
    for t, r_mul in profile:
        cr = dome_r * r_mul
        cz = z0 + dome_h * t
        cur = [
            acc.bm.verts.new((cx + cr * math.cos(2 * math.pi * i / segs), cy + cr * math.sin(2 * math.pi * i / segs), cz))
            for i in range(segs)
        ]
        if prev is not None:
            for i in range(segs):
                j = (i + 1) % segs
                faces.append(acc.bm.faces.new([prev[i], prev[j], cur[j], cur[i]]))
        else:
            # Close bottom ring
            bot = acc.bm.verts.new((cx, cy, z0))
            for i in range(segs):
                j = (i + 1) % segs
                faces.append(acc.bm.faces.new([cur[j], cur[i], bot]))
        prev = cur
    apex = acc.bm.verts.new((cx, cy, z0 + dome_h))
    for i in range(segs):
        j = (i + 1) % segs
        faces.append(acc.bm.faces.new([prev[i], prev[j], apex]))
    bmesh.ops.recalc_face_normals(acc.bm, faces=faces)
    acc._paint(faces, dome_col)

    # Finial spire
    zf = z0 + dome_h
    fin_h = max(0.8, dome_h * 0.34)
    acc.cyl((cx, cy, zf + 0.15 * fin_h), dome_r * 0.16, dome_r * 0.08, 0.30 * fin_h, finial_col, segs=8)
    acc.cyl((cx, cy, zf + 0.65 * fin_h), dome_r * 0.06, 0.01, 0.70 * fin_h, finial_col, segs=6)
    if lod == 0:
        acc.sphere((cx, cy, zf + 0.36 * fin_h), dome_r * 0.11, finial_col, subdiv=1)
    return zf + fin_h


def add_clock_face(
    acc: MeshAcc,
    cx: float,
    cy: float,
    cz: float,
    radius: float,
    nx: float,
    ny: float,
    lod: int = 0,
) -> None:
    """Circular clock dial on tower face with dark rim and hands."""
    rx = math.pi * 0.5 if abs(ny) > 0 else 0.0
    ry = math.pi * 0.5 if abs(nx) > 0 else 0.0
    segs = 12 if lod == 0 else 8
    acc.cyl((cx + nx * 0.04, cy + ny * 0.04, cz), radius, radius, 0.08, PAL["iron"], segs=segs, rot_x=rx, rot_y=ry)
    acc.cyl((cx + nx * 0.06, cy + ny * 0.06, cz), radius * 0.85, radius * 0.85, 0.07, PAL["white"], segs=segs, rot_x=rx, rot_y=ry)
    if lod == 0:
        if abs(ny) > 0:
            acc.box((cx, cy + ny * 0.10, cz + 0.25 * radius), (0.06, 0.03, 0.52 * radius), PAL["iron"])
            acc.box((cx + 0.20 * radius, cy + ny * 0.10, cz), (0.42 * radius, 0.03, 0.06), PAL["iron"])
        else:
            acc.box((cx + nx * 0.10, cy, cz + 0.25 * radius), (0.03, 0.06, 0.52 * radius), PAL["iron"])
            acc.box((cx + nx * 0.10, cy + 0.20 * radius, cz), (0.03, 0.42 * radius, 0.06), PAL["iron"])


def add_pergola(
    acc: MeshAcc,
    cx: float,
    cy: float,
    z_base: float,
    w: float,
    d: float,
    h: float,
    col_post: Tuple[float, float, float, float],
    col_beam: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Open-air timber/steel pergola canopy with corner/mid posts and slatted rafters."""
    if lod >= 2:
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.box((cx + sx * (0.5 * w - 0.2), cy + sy * (0.5 * d - 0.2), z_base + 0.5 * h), (0.24, 0.24, h), col_post)
        acc.box((cx, cy, z_base + h + 0.10), (w, d, 0.14), col_beam)
        return
    nx = max(2, int(round(w / 3.4)) + 1) if lod == 0 else 2
    ny = max(2, int(round(d / 3.4)) + 1)
    for ix in range(nx):
        px = cx - 0.5 * w + 0.22 + ix * ((w - 0.44) / max(1, nx - 1))
        for iy in (0, ny - 1):
            py = cy - 0.5 * d + 0.22 + iy * ((d - 0.44) / max(1, ny - 1))
            acc.box((px, py, z_base + 0.5 * h), (0.20, 0.20, h), col_post)
    # Perimeter header beams
    acc.box((cx, cy - 0.5 * d + 0.22, z_base + h + 0.08), (w, 0.22, 0.18), col_post)
    acc.box((cx, cy + 0.5 * d - 0.22, z_base + h + 0.08), (w, 0.22, 0.18), col_post)
    acc.box((cx - 0.5 * w + 0.22, cy, z_base + h + 0.08), (0.22, d, 0.18), col_post)
    acc.box((cx + 0.5 * w - 0.22, cy, z_base + h + 0.08), (0.22, d, 0.18), col_post)
    # Cross louvers
    n_slats = max(5, int(w / 0.75)) if lod == 0 else max(3, int(w / 2.2))
    for si in range(n_slats):
        sx = cx - 0.46 * w + si * (0.92 * w / max(1, n_slats - 1))
        acc.box((sx, cy, z_base + h + 0.14), (0.10, d - 0.12, 0.14), col_beam)
    if lod == 0:
        n_pur = max(3, int(d / 1.4))
        for pi in range(n_pur):
            py = cy - 0.42 * d + pi * (0.84 * d / max(1, n_pur - 1))
            acc.box((cx, py, z_base + h + 0.22), (w - 0.16, 0.07, 0.07), col_beam)


def add_corrugated_sheet(
    acc: MeshAcc,
    cx: float,
    y_front: float,
    y_back: float,
    z_front: float,
    z_back: float,
    w: float,
    col_sheet: Tuple[float, float, float, float],
    col_rib: Tuple[float, float, float, float],
    lod: int = 0,
) -> None:
    """Sloped corrugated sheet roof with real 3D wave ribs + purlin battens + weighting bricks."""
    span_y = y_back - y_front
    dz = z_back - z_front
    pitch = math.atan2(dz, span_y)
    yc, zc = 0.5 * (y_front + y_back), 0.5 * (z_front + z_back)
    rlen = math.hypot(span_y, dz) + 0.18
    acc.box((cx, yc, zc), (w, rlen, 0.05), col_sheet, rot_x=pitch)
    if lod <= 1:
        n_ribs = max(10, int(w / 0.22)) if lod == 0 else max(6, int(w / 0.50))
        dx = (w - 0.12) / max(1, n_ribs - 1)
        for ri in range(n_ribs):
            rx = cx - 0.5 * w + 0.06 + ri * dx
            acc.cyl((rx, yc, zc + 0.035), 0.045, 0.045, rlen, col_rib, segs=5 if lod == 0 else 4, rot_x=math.pi * 0.5 + pitch)
    if lod == 0:
        # Timber rafters underneath & bricks weighting down the sheets
        for rx_off in (-0.42 * w, 0.0, 0.42 * w):
            acc.box((cx + rx_off, yc, zc - 0.06), (0.09, rlen - 0.12, 0.09), PAL["teak_brown"], rot_x=pitch)
        for bx in (-0.30 * w, 0.15 * w, 0.36 * w):
            acc.box((cx + bx, yc - 0.18 * span_y, zc - 0.18 * dz + 0.10), (0.24, 0.16, 0.10), PAL["red_brick"], rot_x=pitch)


def add_balustrade_rail(
    acc: MeshAcc,
    p0: Tuple[float, float, float],
    p1: Tuple[float, float, float],
    h: float,
    col_post: Tuple[float, float, float, float],
    col_rail: Tuple[float, float, float, float],
    glass: bool = False,
    lod: int = 0,
) -> None:
    """Spanning railing from p0 to p1 at base z=p0[2]."""
    if lod >= 2:
        return
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(dx, dy)
    if length < 0.2:
        return
    ang = math.atan2(dy, dx)
    mx, my, mz = 0.5 * (p0[0] + p1[0]), 0.5 * (p0[1] + p1[1]), p0[2]
    if glass:
        acc.box((mx, my, mz + 0.5 * h), (length, 0.04, h * 0.88), PAL["glass_rail"], rot_z=ang)
        acc.box((mx, my, mz + h), (length + 0.04, 0.07, 0.06), col_rail, rot_z=ang)
        if lod == 0:
            np = max(2, int(round(length / 1.8)) + 1)
            for i in range(np):
                t = i / max(1, np - 1)
                acc.box((p0[0] + t * dx, p0[1] + t * dy, mz + 0.5 * h), (0.06, 0.06, h + 0.04), col_post)
    else:
        acc.box((mx, my, mz + h), (length + 0.04, 0.07, 0.06), col_rail, rot_z=ang)
        acc.box((mx, my, mz + 0.52 * h), (length, 0.04, 0.04), col_rail, rot_z=ang)
        n_posts = max(2, int(round(length / 0.42)) + 1) if lod == 0 else max(2, int(round(length / 1.4)) + 1)
        for i in range(n_posts):
            t = i / max(1, n_posts - 1)
            is_end = i in (0, n_posts - 1)
            th = 0.08 if is_end else 0.035
            acc.box((p0[0] + t * dx, p0[1] + t * dy, mz + 0.5 * h), (th, th, h), col_post if is_end else col_rail)


def add_potted_plant(acc: MeshAcc, x: float, y: float, z: float, scale: float = 1.0, lod: int = 0) -> None:
    if lod >= 2:
        return
    acc.cyl((x, y, z + 0.18 * scale), 0.14 * scale, 0.19 * scale, 0.36 * scale, PAL["pot"], segs=7 if lod == 0 else 5)
    acc.sphere((x, y, z + 0.48 * scale), 0.24 * scale, PAL["foliage"], subdiv=1)
    if lod == 0:
        acc.sphere((x + 0.10 * scale, y - 0.06 * scale, z + 0.44 * scale), 0.15 * scale, PAL["foliage_hi"], subdiv=1)


# ---------------------------------------------------------------------------
# 1. B31_temple_hall (40x60m, 1F)
# ---------------------------------------------------------------------------


def build_B31_temple_hall(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 40.0, 60.0
    hw, hd = 0.5 * w, 0.5 * d

    # Courtyard paved stone base
    acc.box((0.0, 0.0, 0.15), (w, d, 0.30), XPAL["granite"])

    # Perimeter red-and-white vertical striped stone compound walls
    wall_h = 3.6
    # Front compound left & right of gopuram (gopuram sits at X in [-6.5, 6.5])
    for sx in (-1, 1):
        seg_w = hw - 6.4
        cx = sx * (6.4 + 0.5 * seg_w)
        acc.box((cx, -hd + 0.5, 0.30 + 0.5 * wall_h), (seg_w, 0.85, wall_h), PAL["white"])
        if lod <= 1:
            acc.box((cx, -hd + 0.5, 0.30 + wall_h + 0.12), (seg_w + 0.2, 1.05, 0.24), XPAL["granite_dark"])
            n_st = 7 if lod == 0 else 4
            for i in range(n_st):
                rx = cx - 0.44 * seg_w + i * (0.88 * seg_w / max(1, n_st - 1))
                acc.box((rx, -hd + 0.49, 0.30 + 0.5 * wall_h), (0.65, 0.90, wall_h - 0.16), PAL["red_brick"])

    # Rear & side perimeter walls with vertical stripes
    acc.box((0.0, hd - 0.5, 0.30 + 0.5 * wall_h), (w, 0.85, wall_h), PAL["white"])
    if lod <= 1:
        acc.box((0.0, hd - 0.5, 0.30 + wall_h + 0.12), (w + 0.2, 1.05, 0.24), XPAL["granite_dark"])
    for sx in (-1, 1):
        acc.box((sx * (hw - 0.5), 0.5, 0.30 + 0.5 * wall_h), (0.85, d - 1.2, wall_h), PAL["white"])
        if lod <= 1:
            acc.box((sx * (hw - 0.5), 0.5, 0.30 + wall_h + 0.12), (1.05, d - 1.0, 0.24), XPAL["granite_dark"])
            n_side = 16 if lod == 0 else 6
            for i in range(n_side):
                sy = -hd + 3.0 + i * ((d - 5.5) / max(1, n_side - 1))
                acc.box((sx * (hw - 0.49), sy, 0.30 + 0.5 * wall_h), (0.90, 0.72, wall_h - 0.16), PAL["red_brick"])

    # 5-tier sculpted Dravidian pyramidal gopuram at front entrance (Y = -27.5)
    gy = -hd + 2.5
    # Granite adhishthana base with central dark gateway portal
    if lod <= 1:
        acc.box((-4.1, gy, 2.2), (4.6, 6.2, 4.4), XPAL["granite"])
        acc.box((+4.1, gy, 2.2), (4.6, 6.2, 4.4), XPAL["granite"])
        acc.box((0.0, gy, 3.85), (3.8, 6.2, 1.1), XPAL["granite"])
        acc.box((0.0, gy - 0.05, 1.65), (3.4, 5.4, 3.3), PAL["recess"])
        acc.box((0.0, gy, 4.55), (13.4, 6.7, 0.34), XPAL["granite_dark"])
    else:
        acc.box((0.0, gy, 2.3), (13.0, 6.2, 4.6), XPAL["granite"])
    if lod == 0:
        for sx in (-1, 1):
            for px in (2.2, 5.6):
                acc.box((sx * px, gy - 3.18, 2.2), (0.55, 0.24, 4.1), XPAL["sandstone"])

    # 5 tapering polychrome Dravidian tiers
    tier_cols = (PAL["ochre"], PAL["terracotta"], PAL["cream"], PAL["sky_blue"], XPAL["terracotta_hi"])
    gw, gd, gz = 12.2, 5.8, 4.72
    for ti in range(5):
        th = 2.05 - ti * 0.12
        # Recessed neck (griva) + main body
        acc.box((0.0, gy, gz + 0.5 * th), (gw, gd, th), tier_cols[ti])
        # Projecting kapota cornice ledge
        if lod <= 1:
            acc.box((0.0, gy, gz + th + 0.12), (gw + 0.42, gd + 0.42, 0.24), PAL["cream_trim"])
            nk = (5 - ti // 2) if lod == 0 else 3
            for ki in range(nk):
                kx = -0.38 * gw + ki * (0.76 * gw / max(1, nk - 1))
                kw = 1.45 if ki == nk // 2 else 0.95
                for sy in (-1, 1):
                    acc.box((kx, gy + sy * (0.5 * gd + 0.14), gz + 0.52 * th), (kw, 0.30, th * 0.72), PAL["cream"])
                    if lod == 0:
                        acc.box((kx, gy + sy * (0.5 * gd + 0.18), gz + th - 0.10), (kw + 0.12, 0.36, 0.26), PAL["gold"])
            if lod == 0:
                for sx in (-1, 1):
                    for ky in (-0.28 * gd, 0.28 * gd):
                        acc.box((sx * (0.5 * gw + 0.14), gy + ky, gz + 0.52 * th), (0.30, 0.92, th * 0.72), PAL["cream"])
        gz += th + (0.24 if lod <= 1 else 0.0)
        gw -= 1.55
        gd -= 0.74

    # Barrel-vault sala roof crown + row of 7 gold kalasam finials
    if lod <= 1:
        acc.pitched_roof(-0.5 * gw - 0.2, 0.5 * gw + 0.2, gy - 0.5 * gd - 0.15, gy + 0.5 * gd + 0.15, gz, 1.85, PAL["terracotta"], PAL["ochre"], barrel=True)
    else:
        acc.box((0.0, gy, gz + 0.85), (gw + 0.2, gd + 0.2, 1.7), PAL["terracotta"])
    n_kal = 7 if lod == 0 else (3 if lod == 1 else 0)
    for ki in range(n_kal):
        kx = -0.38 * gw + ki * (0.76 * gw / max(1, n_kal - 1))
        acc.cyl((kx, gy, gz + 2.15), 0.18, 0.04, 0.72, PAL["gold"], segs=8 if lod == 0 else 5)
        if lod == 0:
            acc.sphere((kx, gy, gz + 2.02), 0.17, PAL["gold"], subdiv=1)

    # Courtyard: Dwajasthambam flag pole & Balipeetham altar
    if lod <= 1:
        acc.box((0.0, -14.0, 0.75), (1.8, 1.8, 0.90), XPAL["granite"])
        acc.cyl((0.0, -14.0, 5.2), 0.18, 0.13, 8.2, PAL["gold"], segs=8 if lod == 0 else 6)
        acc.box((0.0, -14.0, 9.1), (0.85, 0.14, 0.36), PAL["gold"])
        acc.box((0.0, -17.5, 0.70), (1.3, 1.3, 0.80), XPAL["granite_dark"])

    # Pillared stone Mandapam hall (X in [-12, 12], Y in [-8, 22])
    my0, my1 = -8.0, 22.0
    mc = 0.5 * (my0 + my1)
    acc.box((0.0, mc, 0.65), (24.0, 30.0, 0.70), XPAL["granite"])
    add_steps(acc, 0.0, my0 - 1.8, my0, 0.30, 1.00, 6.0, 4, XPAL["granite"], XPAL["granite_dark"], lod=lod)
    # Inner sanctum walls
    acc.box((0.0, 12.0, 3.1), (16.5, 18.0, 4.2), XPAL["sandstone"])
    if lod <= 1:
        acc.box((0.0, 3.0, 2.5), (3.0, 0.4, 3.0), PAL["recess"])
    # Open front mandapam pillared hall (Y in [-7.5, 3.0])
    if lod <= 1:
        pxs = (-10.5, -7.0, -3.5, 3.5, 7.0, 10.5) if lod == 0 else (-10.0, -3.5, 3.5, 10.0)
        pys = (-7.2, -3.8, -0.4, 2.8) if lod == 0 else (-7.2, -0.4)
        for px in pxs:
            for py in pys:
                acc.box((px, py, 2.95), (0.58, 0.58, 3.9), XPAL["granite"])
                if lod == 0:
                    acc.box((px, py, 4.95), (0.88, 0.88, 0.28), XPAL["granite_dark"])
    # Mandapam stone flat roof + overhanging kapota cornice
    acc.box((0.0, mc, 5.25), (24.8, 30.8, 0.42), XPAL["sandstone_dark"])
    if lod <= 1:
        acc.box((0.0, mc, 5.65), (23.6, 29.6, 0.45), PAL["cream_trim"])

    # Sanctum Vimana stepped pyramid over rear (Y = 14.5)
    vw, vz = 9.0, 5.88
    for vi in range(3 if lod <= 1 else 2):
        vh = 1.55 - vi * 0.2
        acc.box((0.0, 14.5, vz + 0.5 * vh), (vw, vw, vh), PAL["ochre"] if vi % 2 == 0 else PAL["cream"])
        if lod <= 1:
            acc.box((0.0, 14.5, vz + vh + 0.1), (vw + 0.4, vw + 0.4, 0.2), PAL["terracotta"])
        vz += vh + (0.2 if lod <= 1 else 0.0)
        vw -= 2.2
    acc.dome(0.0, 14.5, vz, 1.5, 1.4, PAL["gold"], segs=8 if lod == 0 else 6, rings=3 if lod <= 1 else 2)
    if lod <= 1:
        acc.cyl((0.0, 14.5, vz + 1.8), 0.16, 0.03, 0.9, PAL["gold"], segs=6)

    return acc


# ---------------------------------------------------------------------------
# 2. B32_church_gothic (30x50m, 2F)
# ---------------------------------------------------------------------------


def build_B32_church_gothic(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 30.0, 50.0
    hw, hd = 0.5 * w, 0.5 * d

    # Plinth & compound low perimeter fence
    acc.box((0.0, 1.5, 0.30), (26.0, 42.0, 0.60), PAL["plinth"])
    add_compound_fence(acc, w, -hd + 0.5, -hd + 6.5, PAL["white"], PAL["white_shade"], modern_wood_gate=False, lod=lod)

    # Nave (14x34m, Z=0.6..10.2) + Side aisles (24x28m, Z=0.6..6.2) + Transept (28x9m)
    acc.box((0.0, 2.0, 5.4), (14.0, 34.0, 9.6), PAL["white"])
    acc.box((0.0, 2.0, 3.4), (24.0, 28.0, 5.6), PAL["white"])
    acc.box((0.0, 8.0, 5.4), (27.6, 9.0, 9.6), PAL["white"])
    # Rear apse
    if lod <= 1:
        acc.cyl((0.0, 19.5, 4.8), 5.6, 5.6, 8.4, PAL["white"], segs=12 if lod == 0 else 6)
        acc.cyl((0.0, 19.5, 9.9), 5.9, 0.2, 2.0, PAL["tile_red"], segs=12 if lod == 0 else 6)

    # Terracotta pitched roofs over nave, transept, and aisle lean-tos
    acc.pitched_roof(-7.3, 7.3, -15.2, 19.2, 10.2, 4.2, PAL["tile_red"], PAL["white_shade"])
    acc.pitched_roof(-14.0, 14.0, 3.3, 12.7, 10.2, 3.4, PAL["tile_red"], PAL["white_shade"])
    if lod <= 1:
        for sx in (-1, 1):
            pitch = -sx * 0.28
            acc.box((sx * 9.5, 2.0, 6.8), (5.6, 28.4, 0.26), PAL["tile_red"], rot_y=pitch)

    # Stepped buttress piers along side aisles & nave flanks
    if lod <= 1:
        ys = [-10.0, -5.2, -0.4, 4.4, 13.8] if lod == 0 else [-9.0, -1.0, 13.0]
        for sx in (-1, 1):
            for by in ys:
                acc.box((sx * 12.35, by, 3.1), (0.85, 0.70, 5.0), PAL["white_shade"])
                acc.box((sx * 12.15, by, 6.2), (0.55, 0.55, 1.4), PAL["white"])
                if lod == 0:
                    acc.cyl((sx * 12.15, by, 7.35), 0.24, 0.02, 1.0, PAL["white_shade"], segs=4, rot_z=math.pi * 0.25)

    # Lancet windows on side aisles & nave clerestory
    if lod == 0:
        for sx in (-1, 1):
            for wy in (-8.0, -3.2, 1.6, 15.2):
                add_pointed_window(acc, wy, sx * 12.0, 3.6, 1.35, 2.4, (sx, 0.0), PAL["white_shade"], PAL["glass_blue"], PAL["cream_trim"], lod=lod)
                add_pointed_window(acc, wy, sx * 7.0, 8.2, 1.05, 1.6, (sx, 0.0), PAL["white_shade"], PAL["lit_warm"], PAL["cream_trim"], lod=lod)
    elif lod == 1:
        for sx in (-1, 1):
            for wy in (-6.0, 2.0, 15.0):
                add_simple_win(acc, wy, sx * 12.0, 3.6, 1.35, 2.4, (sx, 0.0), PAL["glass_blue"])

    # Projecting arched entrance porch + front steps + tall Neo-Gothic Bell Tower & Octagonal Spire
    ty = -16.8
    add_steps(acc, 0.0, -21.8, -19.2, 0.0, 0.60, 6.2, 4, PAL["plinth"], PAL["white_shade"], lod=lod)
    acc.box((0.0, -18.5, 2.9), (6.4, 3.4, 4.6), PAL["white"])
    if lod <= 1:
        acc.pitched_roof(-3.3, 3.3, -20.3, -16.7, 5.2, 2.2, PAL["tile_red"], PAL["white"])
        acc.box((0.0, -20.2, 2.4), (2.4, 0.25, 3.5), PAL["teak_brown"])
    if lod == 0:
        acc.arch_slab(0.0, -20.22, 4.1, 0.30, 1.25, 10, PAL["white_shade"])

    # Square tower rising above front bay (Z=0.6..18.8)
    acc.box((0.0, ty, 9.7), (6.8, 6.8, 18.2), PAL["white"])
    if lod <= 1:
        for tz in (6.5, 11.8, 18.8):
            acc.box((0.0, ty, tz), (7.3, 7.3, 0.32), PAL["white_shade"])
        acc.cyl((0.0, ty - 3.44, 9.6), 1.45, 1.45, 0.14, PAL["white_shade"], segs=12 if lod == 0 else 8, rot_x=math.pi * 0.5)
        acc.cyl((0.0, ty - 3.48, 9.6), 1.15, 1.15, 0.12, PAL["lit_warm"], segs=12 if lod == 0 else 8, rot_x=math.pi * 0.5)
        if lod == 0:
            add_pointed_window(acc, 0.0, ty - 3.4, 15.2, 1.6, 3.2, (0.0, -1.0), PAL["teak_dark"], PAL["recess"], PAL["white_shade"], lod=lod)
            for sx in (-1, 1):
                add_pointed_window(acc, ty, sx * 3.4, 15.2, 1.6, 3.2, (sx, 0.0), PAL["teak_dark"], PAL["recess"], PAL["white_shade"], lod=lod)
        else:
            add_simple_win(acc, 0.0, ty - 3.4, 15.2, 1.6, 3.2, (0.0, -1.0), PAL["recess"])
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.box((sx * 3.1, ty + sy * 3.1, 19.8), (0.65, 0.65, 1.8), PAL["white"])
                if lod == 0:
                    acc.cyl((sx * 3.1, ty + sy * 3.1, 21.3), 0.36, 0.02, 1.3, PAL["white_shade"], segs=4, rot_z=math.pi * 0.25)

    # Tall octagonal spire + gold cross
    acc.cyl((0.0, ty, 24.8), 2.85, 0.15, 12.0, PAL["white"], segs=8 if lod <= 1 else 6)
    if lod <= 1:
        acc.cyl((0.0, ty, 31.6), 0.08, 0.06, 1.8, PAL["gold"], segs=6)
        acc.box((0.0, ty, 32.0), (0.95, 0.10, 0.14), PAL["gold"])

    return acc


# ---------------------------------------------------------------------------
# 3. B33_mosque_urban (20x30m, 2F)
# ---------------------------------------------------------------------------


def build_B33_mosque_urban(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 20.0, 30.0
    hw, hd = 0.5 * w, 0.5 * d

    # Stepped plinth + front prayer forecourt
    acc.box((0.0, 0.5, 0.35), (w, d - 1.0, 0.70), PAL["plinth"])
    add_steps(acc, 0.0, -hd + 0.2, -hd + 2.5, 0.0, 0.70, 8.0, 4, PAL["white_shade"], PAL["mosque_green"], lod=lod)
    # Low forecourt balustrade
    if lod <= 1:
        for sx in (-1, 1):
            acc.box((sx * 7.0, -hd + 0.8, 1.25), (5.5, 0.30, 1.10), PAL["white"])
            acc.box((sx * 7.0, -hd + 0.8, 1.84), (5.6, 0.36, 0.10), PAL["mosque_green"])

    # Main 2F prayer hall mass (18x20m, Y in [-7.5, +12.5], Z=0.7..8.7)
    by0, by1 = -7.5, 12.5
    mc = 0.5 * (by0 + by1)
    acc.box((0.0, mc, 4.7), (18.0, 20.0, 8.0), PAL["white"])
    # Emerald green horizontal band courses
    if lod <= 1:
        for bz in (4.5, 8.55):
            acc.box((0.0, mc, bz), (18.3, 20.3, 0.35), PAL["mosque_green"])

    # Front cusped triple entrance arcade (Y = -9.6..-7.5)
    if lod <= 1:
        for ax in (-5.0, 0.0, 5.0):
            acc.box((ax, -8.5, 4.4), (3.8, 1.8, 0.8), PAL["mosque_green"])
            acc.arch_slab(ax, -8.5, 2.9, 1.9, 1.65, 8 if lod == 0 else 4, PAL["recess"])
            acc.box((ax, -7.55, 2.2), (2.4, 0.12, 3.0), PAL["teak_brown"])
        for px in (-7.8, -2.5, 2.5, 7.8):
            acc.box((px, -8.5, 4.7), (0.85, 2.1, 8.0), PAL["white"])
            acc.box((px, -8.5, 8.75), (0.98, 2.25, 0.25), PAL["mosque_green"])

    # Upper arched gallery windows
    if lod == 0:
        for ax in (-5.0, 0.0, 5.0):
            add_window(acc, ax, -7.5, 6.4, 1.8, 2.2, (0.0, -1.0), PAL["mosque_green"], PAL["glass_aqua"], PAL["white_shade"], with_chajja=False, with_grille=True, arched=True, lod=lod)
        for sx in (-1, 1):
            for wy in (-3.5, 1.5, 6.5, 10.5):
                add_window(acc, wy, sx * 9.0, 2.6, 1.4, 2.0, (sx, 0.0), PAL["mosque_green"], PAL["glass_aqua"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
                add_window(acc, wy, sx * 9.0, 6.4, 1.4, 2.0, (sx, 0.0), PAL["mosque_green"], PAL["lit_warm"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
    elif lod == 1:
        for ax in (-5.0, 0.0, 5.0):
            add_simple_win(acc, ax, -7.5, 6.4, 1.8, 2.2, (0.0, -1.0), PAL["glass_aqua"])
        for sx in (-1, 1):
            for wy in (-3.5, 4.5, 10.5):
                add_simple_win(acc, wy, sx * 9.0, 2.6, 1.4, 2.0, (sx, 0.0), PAL["glass_aqua"])
                add_simple_win(acc, wy, sx * 9.0, 6.4, 1.4, 2.0, (sx, 0.0), PAL["lit_warm"])

    # Scalloped parapet merlons (kangura battlements) along roof edge
    if lod == 0:
        for mi in range(14):
            mx = -8.2 + mi * (16.4 / 13)
            acc.box((mx, by0 - 0.8, 9.15), (0.65, 0.26, 0.72), PAL["white"])
            acc.cyl((mx, by0 - 0.8, 9.52), 0.32, 0.02, 0.36, PAL["mosque_green"], segs=4, rot_z=math.pi * 0.25)
        for sx in (-1, 1):
            for mi in range(12):
                my = by0 + 1.0 + mi * (18.0 / 11)
                acc.box((sx * 8.85, my, 9.15), (0.26, 0.65, 0.72), PAL["white"])
                acc.cyl((sx * 8.85, my, 9.52), 0.32, 0.02, 0.36, PAL["mosque_green"], segs=4, rot_z=math.pi * 0.25)
    elif lod == 1:
        acc.box((0.0, by0 - 0.8, 9.10), (17.2, 0.26, 0.60), PAL["mosque_green"])

    # Central ribbed white onion dome
    if lod <= 1:
        add_onion_dome(acc, 0.0, mc - 0.5, 8.7, 3.6, 1.6, 3.9, 4.4, PAL["white"], PAL["white"], PAL["mosque_green"], PAL["gold"], lod=lod)
        if lod == 0:
            for ri in range(12):
                ang = 2 * math.pi * ri / 12
                acc.box((3.7 * math.cos(ang), mc - 0.5 + 3.7 * math.sin(ang), 12.0), (0.12, 0.12, 2.6), PAL["white_shade"], rot_z=ang)
    else:
        acc.cyl((0.0, mc - 0.5, 9.5), 3.6, 3.6, 1.6, PAL["white"], segs=6)
        acc.dome(0.0, mc - 0.5, 10.3, 3.9, 4.2, PAL["white"], segs=6, rings=2)

    # 4 corner octagonal minarets with balcony rings & chhatri domes
    for sx in (-1, 1):
        for sy, my in ((-1, -8.5), (1, 12.2)):
            mx = sx * 8.6
            acc.cyl((mx, my, 7.4), 0.95, 0.80, 13.4, PAL["white"], segs=8 if lod == 0 else 6)
            if lod == 0:
                for bz in (5.0, 9.2, 13.2):
                    acc.cyl((mx, my, bz), 1.18, 1.18, 0.28, PAL["mosque_green"], segs=8)
                for ci in range(4):
                    ang = math.pi * 0.25 + 0.5 * math.pi * ci
                    acc.cyl((mx + 0.62 * math.cos(ang), my + 0.62 * math.sin(ang), 14.6), 0.10, 0.10, 1.3, PAL["white"], segs=5)
                add_onion_dome(acc, mx, my, 15.2, 0.82, 0.28, 0.90, 1.15, PAL["mosque_green"], PAL["white"], PAL["mosque_green"], PAL["gold"], lod=1)
            elif lod == 1:
                acc.cyl((mx, my, 13.2), 1.15, 1.15, 0.28, PAL["mosque_green"], segs=6)
                acc.cyl((mx, my, 14.5), 0.55, 0.55, 1.2, PAL["white"], segs=6)
                acc.cyl((mx, my, 15.8), 0.92, 0.05, 1.4, PAL["white"], segs=6)
            else:
                acc.cyl((mx, my, 14.8), 0.95, 0.05, 1.5, PAL["white"], segs=5)

    return acc


# ---------------------------------------------------------------------------
# 4. B34_colonial_heritage (40x80m, 3F)
# ---------------------------------------------------------------------------


def build_B34_colonial_heritage(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 40.0, 80.0
    hw, hd = 0.5 * w, 0.5 * d

    # Granite plinth + main 3F Indo-Saracenic mass (36x72m, Z=0.5..13.4)
    acc.box((0.0, 0.0, 0.25), (37.5, 74.0, 0.50), PAL["plinth"])
    acc.box((0.0, 0.0, 6.95), (34.0, 69.0, 12.9), PAL["red_brick"])

    # Deep outer colonnade arcade loggia shell around front & flanks (3 floors)
    floor_zs = (0.5, 4.8, 9.1)
    # White horizontal band courses
    if lod <= 1:
        for bz in (4.7, 9.0, 13.3):
            acc.box((0.0, 0.0, bz), (36.8, 72.4, 0.36), PAL["white"])

    # Side flank arcade piers + arched openings (along Y in [-33, 33])
    if lod == 0:
        for sx in (-1, 1):
            for fz in floor_zs:
                for bi in range(9):
                    py = -33.0 + bi * (66.0 / 8)
                    acc.box((sx * 17.8, py, fz + 2.05), (0.85, 0.85, 4.1), PAL["red_brick"])
                    acc.box((sx * 17.85, py, fz + 2.05), (0.90, 0.90, 0.28), PAL["white"])
                for bi in range(8):
                    ay = -33.0 + (bi + 0.5) * (66.0 / 8)
                    acc.box((sx * 17.0, ay, fz + 1.8), (0.12, 3.6, 3.1), PAL["recess"])
                    acc.box((sx * 17.8, ay, fz + 3.65), (0.72, 4.4, 0.60), PAL["white"])
    elif lod == 1:
        for sx in (-1, 1):
            for bi in range(7):
                py = -33.0 + bi * (66.0 / 6)
                acc.box((sx * 17.6, py, 6.95), (0.90, 0.95, 12.9), PAL["red_brick"])
            for fz in floor_zs:
                for bi in range(4):
                    ay = -26.0 + bi * (52.0 / 3)
                    add_simple_win(acc, ay, sx * 17.0, fz + 1.8, 3.2, 2.8, (sx, 0.0), PAL["recess"])

    # Front arcade bays (X in [-16, 16], Y = -35.8)
    if lod == 0:
        for fz in floor_zs:
            for bi in range(6):
                px = -15.5 + bi * (31.0 / 5)
                acc.box((px, -35.6, fz + 2.05), (0.95, 0.95, 4.1), PAL["red_brick"])
            for bi in range(5):
                ax = -15.5 + (bi + 0.5) * (31.0 / 5)
                acc.box((ax, -34.6, fz + 1.8), (3.8, 0.16, 3.1), PAL["recess"])
                acc.arch_slab(ax, -35.6, fz + 2.4, 0.72, 1.85, 6, PAL["white"])
    elif lod == 1:
        for bi in range(5):
            px = -15.5 + bi * (31.0 / 4)
            acc.box((px, -35.4, 6.95), (0.95, 0.95, 12.9), PAL["red_brick"])
        for fz in floor_zs:
            for ax in (-11.5, 11.5):
                add_simple_win(acc, ax, -34.6, fz + 1.8, 3.4, 2.8, (0.0, -1.0), PAL["recess"])

    # Terracotta pitched wing roofs behind red/white parapet
    if lod <= 1:
        acc.box((0.0, 0.0, 14.0), (36.8, 72.4, 1.1), PAL["red_brick"])
        acc.box((0.0, 0.0, 14.62), (37.0, 72.6, 0.20), PAL["white"])
    acc.pitched_roof(-15.5, 15.5, -33.0, 33.0, 13.5, 3.0, PAL["tile_red"], PAL["red_brick"], hip=True)

    # 4 corner octagonal turrets with white domes
    if lod <= 1:
        for sx in (-1, 1):
            for sy in (-1, 1):
                tx, ty = sx * 17.6, sy * 35.4
                acc.cyl((tx, ty, 8.2), 1.9, 1.9, 15.4, PAL["red_brick"], segs=8 if lod == 0 else 6)
                if lod == 0:
                    acc.cyl((tx, ty, 15.9), 2.1, 2.1, 0.32, PAL["white"], segs=8)
                    add_onion_dome(acc, tx, ty, 16.05, 1.65, 0.9, 1.75, 2.1, PAL["red_brick"], PAL["white"], PAL["white"], PAL["gold"], lod=1)
                else:
                    acc.cyl((tx, ty, 16.9), 1.8, 0.1, 2.0, PAL["white"], segs=6)

    # Central stepped front Clock Tower + White Dome (Y = -36.5)
    cty = -36.2
    add_steps(acc, 0.0, -39.5, -37.2, 0.0, 0.50, 8.0, 3, PAL["plinth"], PAL["white"], lod=lod)
    acc.box((0.0, cty, 10.0), (8.8, 7.6, 19.0), PAL["red_brick"])
    if lod <= 1:
        for tz in (4.7, 9.0, 13.3, 16.8, 19.6):
            acc.box((0.0, cty, tz), (9.3, 8.1, 0.36), PAL["white"])
    # Clock stage (Z=19.6..23.6)
    acc.box((0.0, cty, 21.6), (6.6, 6.6, 4.0), PAL["red_brick"])
    if lod <= 1:
        acc.box((0.0, cty, 23.75), (7.2, 7.2, 0.35), PAL["white"])
        for nx, ny in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            add_clock_face(acc, nx * 3.32, cty + ny * 3.32, 21.6, 1.15, nx, ny, lod=lod)
    if lod == 0:
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.cyl((sx * 3.1, cty + sy * 3.1, 24.8), 0.55, 0.55, 1.8, PAL["white"], segs=6)
                acc.dome(sx * 3.1, cty + sy * 3.1, 25.7, 0.65, 0.75, PAL["white"], segs=6, rings=2)
    if lod <= 1:
        add_onion_dome(acc, 0.0, cty, 23.9, 2.75, 1.4, 2.95, 3.6, PAL["white"], PAL["white"], PAL["red_brick"], PAL["gold"], lod=lod)
    else:
        acc.cyl((0.0, cty, 26.2), 2.8, 0.2, 5.2, PAL["white"], segs=6)

    return acc


# ---------------------------------------------------------------------------
# 5. B35_museum_heritage (50x60m, 2F)
# ---------------------------------------------------------------------------


def build_B35_museum_heritage(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 50.0, 60.0

    # Stepped granite plinth + central hall + flanking wings
    acc.box((0.0, 1.0, 0.35), (46.5, 52.0, 0.70), PAL["plinth"])
    acc.box((0.0, 2.0, 5.5), (44.0, 46.0, 9.6), PAL["salmon"])
    # Central projecting pavilion & rear exhibition block
    acc.box((0.0, -21.5, 5.5), (17.0, 8.0, 9.6), PAL["salmon"])
    for bz in (5.2, 10.35):
        acc.box((0.0, 2.0, bz), (44.8, 46.8, 0.36), PAL["cream_trim"])
        acc.box((0.0, -21.5, bz), (17.8, 8.6, 0.36), PAL["cream_trim"])

    # Monumental Ionic front porch colonnade + grand staircase + triangular pediment
    add_steps(acc, 0.0, -29.2, -25.4, 0.0, 0.70, 14.0, 5, PAL["plinth"], PAL["cream_trim"], lod=lod)
    acc.box((0.0, -26.2, 0.35), (15.6, 4.2, 0.70), PAL["plinth"])
    col_xs = (-6.2, -3.7, -1.2, 1.2, 3.7, 6.2) if lod <= 1 else (-6.2, -2.0, 2.0, 6.2)
    for cx in col_xs:
        acc.cyl((cx, -27.2, 5.4), 0.42, 0.36, 9.0, PAL["cream_trim"], segs=10 if lod == 0 else 6)
        if lod == 0:
            acc.box((cx, -27.2, 10.0), (1.05, 0.95, 0.35), PAL["cream_trim"])
    # Entablature + triangular pediment
    acc.box((0.0, -26.2, 10.6), (16.4, 4.6, 0.85), PAL["cream_trim"])
    acc.pitched_roof(-8.4, 8.4, -28.6, -23.8, 11.0, 3.2, PAL["terracotta"], XPAL["sandstone"])
    if lod <= 1:
        acc.box((0.0, -28.62, 11.9), (6.0, 0.25, 0.90), PAL["cream_trim"])

    # Balustrade roof wings flanking the central pediment
    if lod <= 1:
        for sx in (-1, 1):
            wx = sx * 15.2
            acc.box((wx, -21.1, 11.4), (13.0, 0.26, 0.22), PAL["cream_trim"])
            if lod == 0:
                for bi in range(12):
                    bx = wx - 5.8 + bi * (11.6 / 11)
                    acc.box((bx, -21.1, 10.9), (0.24, 0.22, 0.85), PAL["cream"])
            else:
                acc.box((wx, -21.1, 10.9), (12.4, 0.22, 0.85), PAL["cream"])

    # Arched gallery windows across 2 floors on front & sides
    if lod == 0:
        for sx in (-1, 1):
            for wx in (11.5, 15.5, 19.5):
                add_window(acc, sx * wx, -21.0, 2.8, 1.6, 2.4, (0.0, -1.0), PAL["cream_trim"], PAL["glass_blue"], PAL["cream_trim"], arched=True, lod=lod)
                add_window(acc, sx * wx, -21.0, 7.6, 1.6, 2.4, (0.0, -1.0), PAL["cream_trim"], PAL["lit_warm"], PAL["cream_trim"], arched=True, lod=lod)
            for wy in (-16.0, -9.0, -2.0, 5.0, 12.0, 19.0):
                add_window(acc, wy, sx * 22.0, 2.8, 1.6, 2.4, (sx, 0.0), PAL["cream_trim"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=True, lod=lod)
                add_window(acc, wy, sx * 22.0, 7.6, 1.6, 2.4, (sx, 0.0), PAL["cream_trim"], PAL["lit_warm"], PAL["cream_trim"], with_chajja=True, lod=lod)
    elif lod == 1:
        for sx in (-1, 1):
            for wx in (12.5, 18.0):
                add_simple_win(acc, sx * wx, -21.0, 2.8, 1.6, 2.4, (0.0, -1.0), PAL["glass_blue"])
                add_simple_win(acc, sx * wx, -21.0, 7.6, 1.6, 2.4, (0.0, -1.0), PAL["lit_warm"])
            for wy in (-14.0, 0.0, 14.0):
                add_simple_win(acc, wy, sx * 22.0, 2.8, 1.6, 2.4, (sx, 0.0), PAL["glass_blue"])
                add_simple_win(acc, wy, sx * 22.0, 7.6, 1.6, 2.4, (sx, 0.0), PAL["lit_warm"])

    # Central exhibition hall drum & terracotta dome
    d_segs = 16 if lod == 0 else (8 if lod == 1 else 6)
    acc.cyl((0.0, 3.0, 11.6), 7.6, 7.6, 2.4, PAL["cream"], segs=d_segs)
    acc.dome(0.0, 3.0, 12.8, 7.2, 4.0, PAL["terracotta"], segs=d_segs, rings=4 if lod <= 1 else 2)
    if lod <= 1:
        acc.cyl((0.0, 3.0, 17.2), 1.4, 1.4, 1.2, PAL["cream_trim"], segs=8)

    return acc


# ---------------------------------------------------------------------------
# 6. B37_rotunda_historic (20x20m, 1F)
# ---------------------------------------------------------------------------


def build_B37_rotunda_historic(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 20.0, 20.0

    # Circular plinth + stepped classical porch
    segs = 24 if lod == 0 else (12 if lod == 1 else 8)
    acc.cyl((0.0, 0.0, 0.35), 9.6, 9.6, 0.70, PAL["plinth"], segs=segs)
    add_steps(acc, 0.0, -10.0, -8.5, 0.0, 0.70, 4.8, 4, PAL["plinth"], PAL["cream_trim"], lod=lod)

    # Main cylindrical cream lime-plastered body (R=8.2, Z=0.7..6.1)
    acc.cyl((0.0, 0.0, 3.4), 8.2, 8.2, 5.4, PAL["cream"], segs=segs)
    if lod <= 1:
        acc.cyl((0.0, 0.0, 6.22), 8.65, 8.65, 0.30, PAL["cream_trim"], segs=segs)
        acc.cyl((0.0, 0.0, 6.75), 8.45, 8.45, 0.76, PAL["cream"], segs=segs)

    # Rhythmic radial pilasters & arched niches around cylinder
    if lod <= 1:
        n_bays = 12 if lod == 0 else 8
        for i in range(n_bays):
            ang = 2 * math.pi * i / n_bays
            px, py = 8.28 * math.cos(ang), 8.28 * math.sin(ang)
            acc.box((px, py, 3.4), (0.48, 0.48, 5.2), PAL["cream_trim"], rot_z=ang)
            wang = ang + math.pi / n_bays
            wx, wy = 8.22 * math.cos(wang), 8.22 * math.sin(wang)
            acc.box((wx, wy, 3.1), (0.24, 1.35, 2.8), PAL["teak_green"], rot_z=wang)
            if lod == 0:
                acc.box((wx * 1.01, wy * 1.01, 3.1), (0.26, 1.05, 2.4), PAL["glass_blue"], rot_z=wang)

    # Front classical portico porch
    acc.box((0.0, -8.8, 5.95), (5.2, 2.4, 0.55), PAL["cream_trim"])
    for px in (-2.0, 2.0):
        acc.cyl((px, -9.5, 3.2), 0.32, 0.28, 5.0, PAL["cream_trim"], segs=8 if lod == 0 else 6)
    acc.pitched_roof(-2.7, 2.7, -10.1, -7.6, 6.22, 1.25, PAL["terracotta"], PAL["cream_trim"])

    # Upper clerestory drum (R=5.4, Z=7.1..9.3) + shallow ribbed dome cap
    acc.cyl((0.0, 0.0, 8.2), 5.4, 5.4, 2.2, PAL["cream"], segs=segs)
    if lod <= 1:
        acc.cyl((0.0, 0.0, 9.4), 5.7, 5.7, 0.26, PAL["cream_trim"], segs=segs)
        for i in range(12 if lod == 0 else 8):
            ang = 2 * math.pi * i / (12 if lod == 0 else 8)
            acc.box((5.42 * math.cos(ang), 5.42 * math.sin(ang), 8.2), (0.18, 0.82, 1.15), PAL["lit_warm"], rot_z=ang)
    acc.dome(0.0, 0.0, 9.53, 5.35, 2.45, PAL["white_shade"], segs=segs, rings=4 if lod <= 1 else 2)
    if lod == 0:
        for i in range(12):
            ang = 2 * math.pi * i / 12
            add_strut(acc, (5.2 * math.cos(ang), 5.2 * math.sin(ang), 9.6), (0.4 * math.cos(ang), 0.4 * math.sin(ang), 11.95), 0.14, 0.14, PAL["cream_trim"])
    # Crown lantern cupola
    acc.cyl((0.0, 0.0, 12.35), 0.95, 0.95, 0.9, PAL["cream_trim"], segs=6)
    if lod <= 1:
        acc.dome(0.0, 0.0, 12.8, 1.0, 0.7, PAL["terracotta"], segs=8, rings=2)

    return acc


# ---------------------------------------------------------------------------
# 7. B39_market_heritage (60x80m, 2F)
# ---------------------------------------------------------------------------


def build_B39_market_heritage(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 60.0, 80.0

    # Plinth + twin market hall wings + central raised clerestory basilica hall
    acc.box((0.0, 0.0, 0.25), (57.5, 76.5, 0.50), PAL["plinth"])
    acc.box((0.0, 1.0, 4.8), (55.0, 72.0, 8.6), PAL["red_brick"])
    acc.box((0.0, 1.0, 10.6), (22.0, 68.0, 3.6), PAL["red_brick"])

    # Cream stone string courses
    if lod <= 1:
        for bz in (4.6, 9.0):
            acc.box((0.0, 1.0, bz), (55.6, 72.6, 0.34), PAL["cream_trim"])

    # Terracotta pitched roofs
    acc.pitched_roof(-11.4, 11.4, -33.2, 35.2, 12.4, 4.0, PAL["tile_red"], PAL["red_brick"])
    for sx in (-1, 1):
        acc.box((sx * 19.3, 1.0, 10.3), (17.2, 72.4, 0.28), PAL["tile_red"], rot_y=sx * 0.16)

    # Rhythmic arched market arcade bays & stall awnings along front & flanks
    if lod == 0:
        for bi in range(10):
            bx = -24.0 + bi * (48.0 / 9)
            if abs(bx) < 5.0:
                continue
            add_window(acc, bx, -35.0, 2.4, 2.8, 3.0, (0.0, -1.0), PAL["cream_trim"], PAL["lit_warm"] if bi % 2 == 0 else PAL["recess"], PAL["cream_trim"], with_chajja=False, with_grille=False, arched=True, lod=lod)
            add_window(acc, bx, -35.0, 6.8, 2.4, 2.4, (0.0, -1.0), PAL["cream_trim"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=False, with_grille=True, arched=True, lod=lod)
            acc.box((bx, -35.9, 3.85), (3.4, 1.6, 0.10), PAL["terracotta"] if bi % 2 == 0 else PAL["steel_blue"], rot_x=0.28)
        for sx in (-1, 1):
            for bi in range(10):
                by = -31.0 + bi * (64.0 / 9)
                add_window(acc, by, sx * 27.5, 2.4, 2.6, 2.8, (sx, 0.0), PAL["cream_trim"], PAL["recess"], PAL["cream_trim"], with_chajja=False, with_grille=False, lod=lod)
                add_window(acc, by, sx * 27.5, 6.8, 2.2, 2.2, (sx, 0.0), PAL["cream_trim"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=True, with_grille=True, lod=lod)
                acc.box((sx * 28.4, by, 3.85), (1.6, 3.2, 0.10), PAL["mustard"] if bi % 2 == 0 else PAL["terracotta"], rot_y=-sx * 0.28)
    elif lod == 1:
        for bi in range(8):
            bx = -24.0 + bi * (48.0 / 7)
            if abs(bx) < 5.0:
                continue
            add_simple_win(acc, bx, -35.0, 2.4, 2.8, 3.0, (0.0, -1.0), PAL["lit_warm"] if bi % 2 == 0 else PAL["recess"])
            add_simple_win(acc, bx, -35.0, 6.8, 2.4, 2.4, (0.0, -1.0), PAL["glass_blue"])
            acc.box((bx, -35.9, 3.85), (3.4, 1.6, 0.10), PAL["terracotta"] if bi % 2 == 0 else PAL["steel_blue"], rot_x=0.28)
        for sx in (-1, 1):
            for bi in range(6):
                by = -28.0 + bi * (58.0 / 5)
                add_simple_win(acc, by, sx * 27.5, 2.4, 2.6, 2.8, (sx, 0.0), PAL["recess"])
                add_simple_win(acc, by, sx * 27.5, 6.8, 2.2, 2.2, (sx, 0.0), PAL["glass_blue"])

    # Central tall red-brick clock tower at front entrance (Y = -36.0)
    cty = -35.8
    acc.box((0.0, cty, 9.8), (8.4, 7.2, 18.6), PAL["red_brick"])
    if lod <= 1:
        acc.box((0.0, cty - 3.65, 2.6), (4.2, 0.25, 4.2), PAL["recess"])
        if lod == 0:
            acc.arch_slab(0.0, cty - 3.65, 4.6, 0.35, 2.1, 10, PAL["cream_trim"])
        for tz in (4.6, 9.0, 14.5, 19.1):
            acc.box((0.0, cty, tz), (8.9, 7.7, 0.34), PAL["cream_trim"])
        for nx, ny in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            add_clock_face(acc, nx * 4.22, cty + ny * 3.62, 16.8, 1.10, nx, ny, lod=lod)
    # Pyramidal spire + finial
    acc.cyl((0.0, cty, 22.8), 4.6, 0.15, 7.0, PAL["tile_red"], segs=4, rot_z=math.pi * 0.25)
    if lod <= 1:
        acc.cyl((0.0, cty, 27.0), 0.10, 0.02, 1.8, PAL["gold"], segs=6)

    return acc


# ---------------------------------------------------------------------------
# 8. B40_public_library (40x50m, 2F)
# ---------------------------------------------------------------------------


def build_B40_public_library(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 40.0, 50.0
    hw, hd = 0.5 * w, 0.5 * d

    # Wrought-iron perimeter compound fence
    add_compound_fence(acc, w, -hd + 0.6, -hd + 6.5, XPAL["sandstone"], PAL["cream_trim"], modern_wood_gate=False, lod=lod)

    # Plinth & classical sandstone/ochre block
    acc.box((0.0, 2.0, 0.35), (36.5, 39.0, 0.70), PAL["plinth"])
    acc.box((0.0, 2.0, 5.4), (35.0, 37.0, 9.4), PAL["ochre"])
    if lod <= 1:
        for bz in (5.2, 10.1):
            acc.box((0.0, 2.0, bz), (35.6, 37.6, 0.34), PAL["cream_trim"])

    # Central pedimented portico
    add_steps(acc, 0.0, -21.2, -17.6, 0.0, 0.70, 11.0, 5, PAL["plinth"], PAL["cream_trim"], lod=lod)
    acc.box((0.0, -17.8, 5.4), (12.0, 3.8, 9.4), XPAL["sandstone"])
    for cx in (-4.8, -1.8, 1.8, 4.8):
        acc.cyl((cx, -19.5, 5.4), 0.38, 0.32, 9.0, PAL["cream_trim"], segs=8 if lod == 0 else 6)
    if lod <= 1:
        acc.box((0.0, -18.5, 2.6), (3.0, 0.25, 3.8), PAL["teak_brown"])
        acc.box((0.0, -18.2, 10.2), (12.8, 4.6, 0.65), PAL["cream_trim"])
    acc.pitched_roof(-6.5, 6.5, -20.6, -15.8, 10.55, 2.7, PAL["tile_red"], PAL["cream_trim"])

    # Twin arched flanking wings + parapet balustrade
    if lod == 0:
        for sx in (-1, 1):
            for wx in (9.5, 14.0):
                add_window(acc, sx * wx, -16.5, 2.8, 1.6, 2.4, (0.0, -1.0), PAL["cream_trim"], PAL["glass_blue"], PAL["cream_trim"], arched=True, lod=lod)
                add_window(acc, sx * wx, -16.5, 7.6, 1.6, 2.4, (0.0, -1.0), PAL["cream_trim"], PAL["lit_warm"], PAL["cream_trim"], arched=True, lod=lod)
            for wy in (-11.0, -2.5, 6.0, 14.5):
                add_window(acc, wy, sx * 17.5, 2.8, 1.5, 2.3, (sx, 0.0), PAL["cream_trim"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=True, with_grille=False, lod=lod)
                add_window(acc, wy, sx * 17.5, 7.6, 1.5, 2.3, (sx, 0.0), PAL["cream_trim"], PAL["lit_warm"], PAL["cream_trim"], with_chajja=True, with_grille=False, lod=lod)
    elif lod == 1:
        for sx in (-1, 1):
            for wx in (9.5, 14.0):
                add_simple_win(acc, sx * wx, -16.5, 2.8, 1.6, 2.4, (0.0, -1.0), PAL["glass_blue"])
                add_simple_win(acc, sx * wx, -16.5, 7.6, 1.6, 2.4, (0.0, -1.0), PAL["lit_warm"])
            for wy in (-10.0, 2.0, 14.0):
                add_simple_win(acc, wy, sx * 17.5, 2.8, 1.5, 2.3, (sx, 0.0), PAL["glass_blue"])
                add_simple_win(acc, wy, sx * 17.5, 7.6, 1.5, 2.3, (sx, 0.0), PAL["lit_warm"])

    # Roof balustrade & raised central clerestory reading lantern
    if lod <= 1:
        add_parapet_with_jaali(acc, 35.0, 37.0, 10.1, 0.95, PAL["ochre"], PAL["cream_trim"], XPAL["sandstone_dark"], pediment=False, lod=lod)
    acc.box((0.0, 3.5, 11.6), (14.0, 22.0, 2.4), XPAL["sandstone"])
    acc.pitched_roof(-7.5, 7.5, -7.8, 14.8, 12.8, 2.2, PAL["tile_red"], PAL["cream_trim"], hip=True)

    return acc


# ---------------------------------------------------------------------------
# 9. B45_beach_apartment (24x40m, 4F)
# ---------------------------------------------------------------------------


def build_B45_beach_apartment(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 24.0, 40.0
    hw, hd = 0.5 * w, 0.5 * d

    # Perimeter coastal low wall with modern wood-slat gate
    add_compound_fence(acc, w, -hd + 0.5, -hd + 4.5, PAL["white"], PAL["steel_light"], modern_wood_gate=True, lod=lod)

    # Ground lobby/stilt podium (20x32m, Z=0..3.4)
    acc.box((0.0, 1.5, 0.22), (21.5, 34.0, 0.44), PAL["plinth"])
    acc.box((0.0, 2.0, 1.9), (16.5, 28.0, 3.0), PAL["concrete"])
    if lod <= 1:
        acc.box((0.0, -12.0, 1.9), (8.0, 0.30, 2.8), PAL["glass_aqua"])
        for sx in (-1, 1):
            for py in (-13.5, -5.5, 2.5, 10.5, 17.5):
                acc.box((sx * 9.5, py, 1.9), (0.65, 0.65, 3.0), PAL["white"])

    # Floors 2..4 (Z=3.4..13.0) with stepped sea-facing wrap balconies & corner curved glass rails
    for fi in range(3):
        fz = 3.4 + fi * 3.2
        step_x = 20.6 - fi * 0.6
        step_y = 32.0 - fi * 0.6
        acc.box((0.0, 2.0, fz + 1.5), (step_x - 2.4, step_y - 2.4, 3.0), PAL["white"])
        # Wrap-around sea-facing balcony deck slab
        acc.box((0.0, 2.0, fz + 0.08), (step_x, step_y, 0.22), PAL["white_shade"])
        if lod <= 1:
            acc.box((0.0, 2.0 - 0.5 * step_y + 0.06, fz + 0.65), (step_x, 0.08, 0.95), PAL["glass_rail"])
            acc.box((0.0, 2.0 - 0.5 * step_y + 0.06, fz + 1.15), (step_x + 0.06, 0.12, 0.08), PAL["steel_light"])
            for sx in (-1, 1):
                acc.box((sx * (0.5 * step_x - 0.06), 2.0, fz + 0.65), (0.08, step_y, 0.95), PAL["glass_rail"])
                acc.box((sx * (0.5 * step_x - 0.06), 2.0, fz + 1.15), (0.12, step_y + 0.06, 0.08), PAL["steel_light"])
                if lod == 0:
                    acc.cyl((sx * (0.5 * step_x - 1.2), 2.0 - 0.5 * step_y + 1.2, fz + 0.65), 1.22, 1.22, 0.96, PAL["glass_aqua"], segs=8)
            for wx in (-5.5, 0.0, 5.5):
                acc.box((wx, 2.0 - 0.5 * (step_y - 2.4) - 0.04, fz + 1.65), (2.8, 0.08, 2.4), PAL["glass_blue"])
            if lod == 0:
                for wy in (-9.0, -2.0, 5.0, 12.0):
                    for sx in (-1, 1):
                        add_window(acc, wy, sx * (0.5 * (step_x - 2.4)), fz + 1.65, 2.4, 2.1, (sx, 0.0), PAL["charcoal"], PAL["glass_aqua"], PAL["sky_blue"], with_chajja=True, with_grille=False, lod=lod)
            else:
                for wy in (-6.0, 6.0):
                    for sx in (-1, 1):
                        add_simple_win(acc, wy, sx * (0.5 * (step_x - 2.4)), fz + 1.65, 2.4, 2.1, (sx, 0.0), PAL["glass_aqua"])

    # Rooftop terrace deck + timber pergola crown + rooftop props
    acc.box((0.0, 2.0, 13.05), (18.4, 29.8, 0.24), PAL["white_shade"])
    if lod <= 1:
        add_parapet_with_jaali(acc, 18.0, 29.4, 13.1, 0.85, PAL["white"], PAL["sky_blue"], PAL["white_shade"], pediment=False, lod=lod)
    add_pergola(acc, 0.0, -4.5, 13.2, 14.0, 12.0, 2.8, PAL["white"], PAL["teak_brown"], lod=lod)
    add_rooftop_props(acc, 16.0, 26.0, 13.2, lod=lod, add_tank=True)

    return acc


# ---------------------------------------------------------------------------
# 10. N01_georgetown_shop (10x16m, 2F, shop_ground=True)
# ---------------------------------------------------------------------------


def build_N01_georgetown_shop(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 10.0, 16.0
    hw, hd = 0.5 * w, 0.5 * d

    # Weathered ochre 2F commercial block
    acc.box((0.0, 0.0, 0.18), (w + 0.2, d + 0.2, 0.36), PAL["plinth"])
    acc.box((0.0, 0.0, 3.86), (w, d, 7.0), PAL["ochre"])
    acc.box((0.0, 0.0, 3.82), (w + 0.32, d + 0.32, 0.22), PAL["cream_trim"])

    # Ground floor shops (shutters + awnings + generic category signboard fascia)
    if lod <= 1:
        add_shop_row(acc, w, -hd, 0.36, lod=lod, open_bays=True, with_awning=True)
    else:
        acc.box((0.0, -hd - 0.4, 2.6), (w - 0.4, 0.8, 0.14), PAL["terracotta"], rot_x=0.28)

    # 2F ornate arched windows flanked by fluted pilasters + wrought-iron balcony
    if lod <= 1:
        add_balcony(acc, 0.0, -hd, 3.92, w - 0.8, 1.15, PAL["cream_trim"], glass_rail=False, lod=lod)
    else:
        acc.box((0.0, -hd - 0.5, 3.92), (w - 0.8, 1.1, 0.16), PAL["cream_trim"])
    if lod == 0:
        for wx in (-3.2, 0.0, 3.2):
            add_window(acc, wx, -hd, 5.65, 1.35, 1.75, (0.0, -1.0), PAL["teak_green"], PAL["lit_warm"], PAL["cream_trim"], with_chajja=True, with_grille=True, arched=True, lod=lod)
        for px in (-4.65, -1.65, 1.65, 4.65):
            acc.box((px, -hd - 0.08, 5.55), (0.34, 0.16, 3.2), PAL["cream_trim"])
            acc.box((px, -hd - 0.14, 5.55), (0.14, 0.08, 2.8), PAL["mustard"])
        for sx in (-1, 1):
            for wy in (-3.8, 1.2, 5.5):
                add_window(acc, wy, sx * hw, 5.65, 1.1, 1.4, (sx, 0.0), PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=True, with_grille=True, lod=lod)
    elif lod == 1:
        for wx in (-3.2, 0.0, 3.2):
            add_simple_win(acc, wx, -hd, 5.65, 1.35, 1.75, (0.0, -1.0), PAL["lit_warm"])
        for sx in (-1, 1):
            for wy in (-3.5, 3.5):
                add_simple_win(acc, wy, sx * hw, 5.65, 1.1, 1.4, (sx, 0.0), PAL["glass_blue"])

    # Ornate George Town curved pediment crest parapet + rooftop tank/AC
    add_parapet_with_jaali(acc, w, d, 7.36, 0.95, PAL["ochre"], PAL["cream_trim"], PAL["mustard"], pediment=True, lod=lod)
    add_rooftop_props(acc, w, d, 7.45, lod=lod, add_tank=True)

    return acc


# ---------------------------------------------------------------------------
# 11. N02_north_tenement (8x16m, 3F)
# ---------------------------------------------------------------------------


def build_N02_north_tenement(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 8.0, 16.0
    hw, hd = 0.5 * w, 0.5 * d

    # Plinth + twin-color contiguous facade (left turquoise/teal, right salmon-pink)
    acc.box((0.0, 0.0, 0.18), (w + 0.16, d + 0.16, 0.36), PAL["plinth"])
    acc.box((-0.25 * w, 0.0, 5.01), (0.5 * w, d, 9.3), PAL["teal_wall"])
    acc.box((+0.25 * w, 0.0, 5.01), (0.5 * w, d, 9.3), PAL["salmon"])
    # Floor band moldings
    for fz in (3.45, 6.55, 9.66):
        acc.box((-0.25 * w, 0.0, fz), (0.5 * w + 0.18, d + 0.18, 0.18), PAL["white"])
        acc.box((+0.25 * w, 0.0, fz), (0.5 * w + 0.18, d + 0.18, 0.18), PAL["pink_trim"])

    # Ground entrances + steps
    if lod <= 1:
        for sx in (-1, 1):
            cx = sx * 0.25 * w
            add_steps(acc, cx, -hd - 0.8, -hd, 0.0, 0.36, 1.5, 2, PAL["plinth"], PAL["concrete"], lod=lod)
            acc.box((cx, -hd - 0.02, 1.45), (1.15, 0.08, 2.15), PAL["teak_brown"])
            if lod == 0:
                add_window(acc, cx + sx * 1.15, -hd, 1.85, 0.95, 1.15, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
            else:
                add_simple_win(acc, cx + sx * 1.15, -hd, 1.85, 0.95, 1.15, (0.0, -1.0), PAL["glass_blue"])

    # Floors 2 & 3: recessed grille balconies + wooden shutters
    for fz in (3.45, 6.55):
        if lod <= 1:
            for sx in (-1, 1):
                cx = sx * 0.25 * w
                trim = PAL["white"] if sx < 0 else PAL["pink_trim"]
                add_balcony(acc, cx - sx * 0.4, -hd, fz, 2.2, 0.90, trim, glass_rail=False, lod=lod)
                if lod == 0:
                    add_window(acc, cx + sx * 1.1, -hd, fz + 1.55, 0.95, 1.25, (0.0, -1.0), PAL["teak_brown"], PAL["lit_warm"], trim, with_chajja=True, with_grille=True, lod=lod)
                else:
                    add_simple_win(acc, cx + sx * 1.1, -hd, fz + 1.55, 0.95, 1.25, (0.0, -1.0), PAL["lit_warm"])
            for sx in (-1, 1):
                for wy in ((-4.2, 0.2, 4.6) if lod == 0 else (-3.5, 3.5)):
                    if lod == 0:
                        add_window(acc, wy, sx * hw, fz + 1.55, 1.0, 1.2, (sx, 0.0), PAL["teak_brown"], PAL["glass_blue"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
                    else:
                        add_simple_win(acc, wy, sx * hw, fz + 1.55, 1.0, 1.2, (sx, 0.0), PAL["glass_blue"])
        else:
            acc.box((0.0, -hd - 0.4, fz + 0.4), (w - 0.8, 0.8, 0.75), PAL["white"])

    # Parapet + rooftop water tank & stair head
    add_parapet_with_jaali(acc, w, d, 9.66, 0.85, PAL["teal_wall"], PAL["white"], PAL["pink_trim"], pediment=False, lod=lod)
    add_rooftop_props(acc, w, d, 9.75, lod=lod, add_tank=True)

    return acc


# ---------------------------------------------------------------------------
# 12. N05_lighthouse_complex (16x22m, 4F)
# ---------------------------------------------------------------------------


def build_N05_lighthouse_complex(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 16.0, 22.0
    hw, hd = 0.5 * w, 0.5 * d

    # Compound wall around complex
    add_compound_fence(acc, w, -hd + 0.5, -hd + 5.0, PAL["white"], PAL["crimson"], modern_wood_gate=False, lod=lod)

    # Attached keeper's cottage at rear (+Y: Y in [-1.5, 9.5], Z=0..3.6)
    acc.box((0.0, 4.2, 0.20), (12.4, 11.4, 0.40), PAL["plinth"])
    acc.box((0.0, 4.2, 1.95), (11.6, 10.6, 3.10), PAL["cream"])
    acc.pitched_roof(-6.2, 6.2, -1.5, 9.9, 3.50, 1.85, PAL["tile_red"], PAL["cream_trim"], hip=True)
    # Cottage windows + front door
    if lod == 0:
        for sx in (-1, 1):
            add_window(acc, sx * 3.8, -1.1, 1.9, 1.2, 1.3, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=True, with_grille=True, lod=lod)
            for wy in (1.8, 6.2):
                add_window(acc, wy, sx * 5.8, 1.9, 1.2, 1.3, (sx, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], with_chajja=True, with_grille=True, lod=lod)
    elif lod == 1:
        for sx in (-1, 1):
            add_simple_win(acc, sx * 3.8, -1.1, 1.9, 1.2, 1.3, (0.0, -1.0), PAL["glass_blue"])
            add_simple_win(acc, 4.0, sx * 5.8, 1.9, 1.2, 1.3, (sx, 0.0), PAL["glass_blue"])

    # Red-and-white horizontally banded cylindrical lighthouse tower at front (Y = -4.8)
    ly = -4.8
    acc.cyl((0.0, ly, 1.1), 3.6, 3.3, 2.2, PAL["white"], segs=8 if lod <= 1 else 6)
    if lod <= 1:
        acc.box((0.0, ly - 3.35, 1.15), (1.4, 0.25, 2.1), PAL["teak_brown"])

    segs = 20 if lod == 0 else (10 if lod == 1 else 6)
    n_bands = 8 if lod <= 1 else 4
    z0, z1 = 2.2, 16.6
    r_bot, r_top = 2.95, 2.05
    bh = (z1 - z0) / n_bands
    for bi in range(n_bands):
        za = z0 + bi * bh
        zb = za + bh
        ra = r_bot + (r_top - r_bot) * (bi / n_bands)
        rb = r_bot + (r_top - r_bot) * ((bi + 1) / n_bands)
        col = PAL["crimson"] if bi % 2 == 0 else PAL["white"]
        acc.cyl((0.0, ly, 0.5 * (za + zb)), ra, rb, bh + 0.01, col, segs=segs)
        if lod == 0 and bi in (2, 5):
            acc.box((0.0, ly - ra - 0.02, 0.5 * (za + zb)), (0.55, 0.14, 0.85), PAL["iron"])
            acc.box((0.0, ly - ra - 0.06, 0.5 * (za + zb)), (0.38, 0.08, 0.65), PAL["glass_aqua"])

    # Projecting watch gallery deck + circular iron railing (Z=16.6..17.7)
    acc.cyl((0.0, ly, 16.75), 2.85, 3.05, 0.45, PAL["white_shade"], segs=segs)
    if lod <= 1:
        np = 12 if lod == 0 else 6
        for i in range(np):
            a0 = 2 * math.pi * i / np
            a1 = 2 * math.pi * ((i + 1) % np) / np
            p0 = (2.92 * math.cos(a0), ly + 2.92 * math.sin(a0), 16.95)
            p1 = (2.92 * math.cos(a1), ly + 2.92 * math.sin(a1), 16.95)
            add_balustrade_rail(acc, p0, p1, 0.95, PAL["iron"], PAL["iron"], glass=False, lod=1)

    # Glazed lantern cupola + crimson dome cap + lightning finial
    l_segs = 12 if lod == 0 else (8 if lod == 1 else 6)
    acc.cyl((0.0, ly, 18.45), 1.85, 1.85, 3.0, PAL["lit_warm"], segs=l_segs)
    if lod == 0:
        for i in range(12):
            ang = 2 * math.pi * i / 12
            acc.box((1.90 * math.cos(ang), ly + 1.90 * math.sin(ang), 18.45), (0.10, 0.10, 3.05), PAL["iron"], rot_z=ang)
    if lod <= 1:
        acc.cyl((0.0, ly, 20.0), 2.1, 2.1, 0.22, PAL["iron"], segs=l_segs)
    acc.dome(0.0, ly, 20.1, 1.95, 1.75, PAL["crimson"], segs=l_segs, rings=3 if lod <= 1 else 2)
    acc.cyl((0.0, ly, 22.8), 0.06, 0.02, 2.2, PAL["steel_light"], segs=5)

    return acc


# ---------------------------------------------------------------------------
# 13. C01_beach_stalls (6x16m, 1F, shop_ground=True)
# ---------------------------------------------------------------------------


def build_C01_beach_stalls(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 16.0
    hw, hd = 0.5 * w, 0.5 * d

    # Bright blue & yellow promenade 3-stall kiosk block
    acc.box((0.0, 0.0, 0.22), (w - 0.2, d - 0.4, 0.44), PAL["plinth"])
    add_steps(acc, 0.0, -hd + 0.1, -hd + 1.0, 0.0, 0.44, 4.2, 3, PAL["plinth"], PAL["sign_yellow"], lod=lod)
    acc.box((0.0, 0.4, 2.04), (w - 0.8, d - 1.6, 3.2), PAL["sky_blue"])
    acc.box((0.0, 0.4, 3.74), (w - 0.2, d - 0.8, 0.24), PAL["sign_yellow"])

    # 3 stalls along the long promenade flank (-X) + front counter (-Y)
    stall_ys = (-4.6, 0.2, 5.0)
    if lod <= 1:
        for idx, sy in enumerate(stall_ys):
            # Recessed lit stall counter opening & serving shelf
            acc.box((-hw + 0.40, sy, 2.0), (0.14, 3.4, 1.7), PAL["lit_warm"])
            acc.box((-hw + 0.15, sy, 0.90), (0.65, 3.6, 0.92), PAL["sign_yellow"])
            # Overhead generic snacks menu fascia (TD-18 clean colored board, no brand names)
            acc.box((-hw + 0.22, sy, 3.25), (0.18, 3.5, 0.54), PAL["sign_blue"] if idx % 2 == 0 else PAL["sign_red"])
            acc.box((-hw + 0.12, sy, 3.25), (0.04, 2.8, 0.26), PAL["cream_trim"])
            n_str = 5 if lod == 0 else 2
            sw = 3.6 / n_str
            for si in range(n_str):
                ay = sy - 1.8 + (si + 0.5) * sw
                scol = PAL["sign_yellow"] if si % 2 == 0 else PAL["steel_blue"]
                acc.box((-hw - 0.45, ay, 2.70), (1.35, sw - 0.02, 0.08), scol, rot_y=0.28)
            if lod == 0:
                # Pilaster dividers, snack jars, stools & promenade bollards
                acc.box((-hw + 0.34, sy - 1.9, 1.95), (0.28, 0.24, 3.1), PAL["white"])
                for st_y in (sy - 1.0, sy, sy + 1.0):
                    acc.cyl((-hw - 0.45, st_y, 0.30), 0.16, 0.16, 0.60, PAL["iron"], segs=6)
                    acc.cyl((-hw - 0.45, st_y, 0.62), 0.22, 0.22, 0.06, PAL["terracotta"], segs=8)
                    acc.cyl((-hw + 0.08, st_y, 1.50), 0.12, 0.12, 0.28, PAL["glass_aqua"], segs=6)

        # Front kiosk counter facing -Y + striped awning + menu fascia
        acc.box((0.0, -hd + 1.2, 2.0), (3.4, 0.14, 1.6), PAL["lit_warm"])
        acc.box((0.0, -hd + 0.95, 0.90), (3.6, 0.60, 0.92), PAL["sign_yellow"])
        acc.box((0.0, -hd + 1.05, 3.25), (3.6, 0.18, 0.54), PAL["sign_blue"])
        if lod == 0:
            for si in range(4):
                ax = -1.35 + si * 0.90
                acc.box((ax, -hd + 0.45, 2.70), (0.86, 1.35, 0.08), PAL["sign_yellow"] if si % 2 == 0 else PAL["steel_blue"], rot_x=0.28)
        else:
            acc.box((0.0, -hd + 0.45, 2.70), (3.8, 1.35, 0.08), PAL["sign_yellow"], rot_x=0.28)
    else:
        acc.box((-hw - 0.35, 0.4, 2.70), (1.3, 13.0, 0.12), PAL["sign_yellow"], rot_y=0.28)
        acc.box((0.0, -hd + 0.45, 2.70), (3.8, 1.35, 0.10), PAL["sign_yellow"], rot_x=0.28)

    # Roof parapet + water tank
    if lod <= 1:
        acc.box((0.0, 0.4, 4.05), (w - 0.4, d - 1.0, 0.40), PAL["white"])
    add_rooftop_props(acc, w - 1.0, d - 2.0, 3.9, lod=lod, add_tank=True)

    return acc


# ---------------------------------------------------------------------------
# 14. C02_beach_police (16x24m, 2F)
# ---------------------------------------------------------------------------


def build_C02_beach_police(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 16.0, 24.0
    hw, hd = 0.5 * w, 0.5 * d

    add_compound_fence(acc, w, -hd + 0.5, -hd + 4.5, PAL["cream"], PAL["crimson"], modern_wood_gate=False, lod=lod)

    # Plinth + main 2F outpost block
    acc.box((0.0, 2.0, 0.22), (14.6, 17.6, 0.44), PAL["plinth"])
    add_steps(acc, 0.0, -8.5, -6.5, 0.0, 0.44, 4.4, 3, PAL["plinth"], PAL["crimson"], lod=lod)
    acc.box((0.0, 2.0, 3.84), (14.0, 17.0, 6.8), PAL["cream"])
    # Crimson trim courses & corner pilasters
    if lod <= 1:
        for bz in (3.75, 7.25):
            acc.box((0.0, 2.0, bz), (14.4, 17.4, 0.24), PAL["crimson"])
        for sx in (-1, 1):
            acc.box((sx * 6.85, -6.5, 3.84), (0.45, 0.30, 6.8), PAL["crimson"])

    # Recessed entrance porch + blue fascia band
    acc.box((0.0, -6.8, 3.45), (5.8, 1.8, 0.55), PAL["sign_blue"])
    if lod <= 1:
        acc.box((0.0, -6.8, 3.10), (4.6, 0.14, 0.25), PAL["cream_trim"])
        for px in (-2.5, 2.5):
            acc.box((px, -7.5, 1.85), (0.42, 0.42, 2.85), PAL["crimson"])
        acc.box((0.0, -6.5, 1.75), (2.2, 0.12, 2.6), PAL["teak_brown"])

    # Barred windows across 1F & 2F
    if lod == 0:
        for sx in (-1, 1):
            add_window(acc, sx * 4.5, -6.5, 1.9, 1.4, 1.4, (0.0, -1.0), PAL["teak_dark"], PAL["glass_blue"], PAL["crimson"], with_chajja=True, with_grille=True, lod=lod)
            add_window(acc, sx * 4.5, -6.5, 5.4, 1.4, 1.4, (0.0, -1.0), PAL["teak_dark"], PAL["lit_warm"], PAL["crimson"], with_chajja=True, with_grille=True, lod=lod)
            for wy in (-3.2, 1.8, 6.8):
                add_window(acc, wy, sx * 7.0, 1.9, 1.3, 1.3, (sx, 0.0), PAL["teak_dark"], PAL["glass_blue"], PAL["crimson"], with_chajja=True, with_grille=True, lod=lod)
                add_window(acc, wy, sx * 7.0, 5.4, 1.3, 1.3, (sx, 0.0), PAL["teak_dark"], PAL["glass_blue"], PAL["crimson"], with_chajja=True, with_grille=True, lod=lod)
        add_window(acc, 0.0, -6.5, 5.4, 2.0, 1.5, (0.0, -1.0), PAL["teak_dark"], PAL["glass_aqua"], PAL["crimson"], with_chajja=True, with_grille=True, lod=lod)
    elif lod == 1:
        for sx in (-1, 1):
            add_simple_win(acc, sx * 4.5, -6.5, 1.9, 1.4, 1.4, (0.0, -1.0), PAL["glass_blue"])
            add_simple_win(acc, sx * 4.5, -6.5, 5.4, 1.4, 1.4, (0.0, -1.0), PAL["lit_warm"])
            for wy in (-3.0, 5.0):
                add_simple_win(acc, wy, sx * 7.0, 1.9, 1.3, 1.3, (sx, 0.0), PAL["glass_blue"])
                add_simple_win(acc, wy, sx * 7.0, 5.4, 1.3, 1.3, (sx, 0.0), PAL["glass_blue"])
        add_simple_win(acc, 0.0, -6.5, 5.4, 2.0, 1.5, (0.0, -1.0), PAL["glass_aqua"])

    # Parapet + flagpole mast + rooftop tank
    add_parapet_with_jaali(acc, 14.0, 17.0, 7.25, 0.90, PAL["cream"], PAL["crimson"], PAL["cream_shade"], pediment=False, lod=lod)
    if lod <= 1:
        acc.cyl((0.0, -6.0, 9.8), 0.06, 0.04, 4.6, PAL["steel_light"], segs=6)
        acc.box((0.55, -6.0, 11.7), (1.0, 0.05, 0.55), PAL["crimson"])
    add_rooftop_props(acc, 14.0, 17.0, 7.35, lod=lod, add_tank=True)

    return acc


# ---------------------------------------------------------------------------
# 15. C03_beach_sports (22x34m, 2F)
# ---------------------------------------------------------------------------


def build_C03_beach_sports(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 22.0, 34.0

    # Plinth + 2F contemporary white & ocean-blue recreation hall
    acc.box((0.0, 1.0, 0.25), (20.5, 31.0, 0.50), PAL["plinth"])
    acc.box((0.0, 1.5, 4.4), (16.8, 26.0, 7.8), PAL["white"])

    # Wrap-around 2F cantilevered glass gallery deck (Z=4.0)
    acc.box((0.0, 1.5, 4.0), (20.4, 29.8, 0.28), PAL["white_shade"])
    # Glass deck balustrades on front & flanks
    add_balustrade_rail(acc, (-10.1, -13.3, 4.14), (10.1, -13.3, 4.14), 1.05, PAL["charcoal"], PAL["steel_light"], glass=True, lod=lod)
    for sx in (-1, 1):
        add_balustrade_rail(acc, (sx * 10.1, -13.3, 4.14), (sx * 10.1, 16.3, 4.14), 1.05, PAL["charcoal"], PAL["steel_light"], glass=True, lod=lod)
        if lod <= 1:
            for py in ((-12.5, -5.0, 2.5, 10.0, 15.5) if lod == 0 else (-12.5, 2.5, 15.5)):
                acc.box((sx * 9.8, py, 2.2), (0.45, 0.45, 3.4), PAL["sky_blue"])

    # External wide concrete access stairs rising from Y=-16.5 to Y=-13.3
    add_steps(acc, 0.0, -16.8, -13.1, 0.0, 4.0, 5.2, 10, PAL["concrete"], PAL["sky_blue"], lod=lod)
    if lod <= 1:
        for sx in (-1, 1):
            add_strut(acc, (sx * 2.65, -16.8, 0.9), (sx * 2.65, -13.1, 4.9), 0.08, 0.08, PAL["steel_light"])

    # Sweeping curved barrel roof + ocean-blue exposed arch ribs
    if lod <= 1:
        acc.pitched_roof(-9.8, 9.8, -12.8, 15.8, 8.3, 3.4, PAL["white"], PAL["glass_aqua"], barrel=True)
        n_ribs = 7 if lod == 0 else 4
        for ri in range(n_ribs):
            ry = -12.0 + ri * (27.0 / max(1, n_ribs - 1))
            acc.arch_slab(0.0, ry, 8.2, 0.34, 9.95, 12 if lod == 0 else 6, PAL["steel_blue"])
    else:
        acc.pitched_roof(-9.8, 9.8, -12.8, 15.8, 8.3, 3.2, PAL["white"], PAL["glass_aqua"], hip=False)
    # Glazed side walls
    if lod == 0:
        for sx in (-1, 1):
            for wy in (-8.5, -2.5, 3.5, 9.5):
                add_window(acc, wy, sx * 8.4, 6.2, 3.4, 2.2, (sx, 0.0), PAL["charcoal"], PAL["glass_aqua"], PAL["sky_blue"], with_chajja=False, with_grille=False, lod=lod)
    elif lod == 1:
        for sx in (-1, 1):
            for wy in (-6.0, 6.0):
                add_simple_win(acc, wy, sx * 8.4, 6.2, 3.4, 2.2, (sx, 0.0), PAL["glass_aqua"])
    if lod <= 1:
        acc.box((0.0, -11.55, 6.2), (12.0, 0.14, 2.4), PAL["glass_aqua"])

    return acc


# ---------------------------------------------------------------------------
# 16. C04_beach_cafe (14x20m, 2F)
# ---------------------------------------------------------------------------


def build_C04_beach_cafe(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 14.0, 20.0
    hw, hd = 0.5 * w, 0.5 * d

    # Warm timber boardwalk plinth
    acc.box((0.0, 0.5, 0.22), (13.4, 18.8, 0.44), PAL["teak_brown"])
    add_steps(acc, 0.0, -9.8, -8.8, 0.0, 0.44, 4.0, 3, PAL["teak_brown"], PAL["charcoal"], lod=lod)

    # Glazed ground-floor beachfront cafe with full-height black mullions
    acc.box((0.0, 1.5, 2.14), (11.6, 14.0, 3.4), PAL["white"])
    if lod <= 1:
        acc.box((0.0, -5.52, 2.14), (10.4, 0.10, 3.0), PAL["glass_aqua"])
        for sx in (-1, 1):
            acc.box((sx * 5.82, 0.2, 2.14), (0.10, 10.6, 3.0), PAL["lit_warm"] if sx < 0 else PAL["glass_aqua"])
    # Black mullions
    if lod == 0:
        for mx in (-5.2, -2.6, 0.0, 2.6, 5.2):
            acc.box((mx, -5.56, 2.14), (0.10, 0.14, 3.15), PAL["charcoal"])
        for sx in (-1, 1):
            for my in (-4.8, -1.8, 1.2, 4.2):
                acc.box((sx * 5.86, my, 2.14), (0.14, 0.10, 3.15), PAL["charcoal"])
    # Cafe awning & planters on ground terrace
    acc.box((0.0, -6.55, 3.35), (10.8, 2.2, 0.12), PAL["terracotta"], rot_x=0.22)
    for px in (-5.6, -2.8, 2.8, 5.6):
        add_potted_plant(acc, px, -8.2, 0.44, scale=1.0, lod=lod)

    # Open-air rooftop terrace dining deck (Z=3.84) + side stair + timber pergola
    acc.box((0.0, 1.5, 3.92), (12.6, 15.2, 0.26), PAL["white_shade"])
    add_balustrade_rail(acc, (-6.2, -6.0, 4.05), (6.2, -6.0, 4.05), 1.0, PAL["charcoal"], PAL["teak_brown"], glass=True, lod=lod)
    for sx in (-1, 1):
        add_balustrade_rail(acc, (sx * 6.2, -6.0, 4.05), (sx * 6.2, 9.0, 4.05), 1.0, PAL["charcoal"], PAL["teak_brown"], glass=True, lod=lod)
    # Rear rooftop bar/kitchen kiosk
    acc.box((0.0, 6.8, 5.45), (10.8, 3.8, 2.8), PAL["cream"])
    if lod <= 1:
        acc.box((0.0, 6.8, 6.95), (11.4, 4.2, 0.20), PAL["terracotta"])
    # Timber pergola beams over dining terrace
    add_pergola(acc, 0.0, -0.5, 4.05, 11.4, 10.2, 2.75, PAL["teak_brown"], XPAL["wood_light"], lod=lod)
    for px in (-4.8, 4.8):
        add_potted_plant(acc, px, -5.0, 4.05, scale=0.9, lod=lod)

    # External stair on +X side
    add_steps(acc, 6.4, -4.0, 2.5, 0.44, 3.92, 1.2, 9, PAL["concrete"], PAL["charcoal"], lod=lod)

    return acc


# ---------------------------------------------------------------------------
# 17. C05_lifeguard_tower (4x4m, 2F)
# ---------------------------------------------------------------------------


def build_C05_lifeguard_tower(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")

    # 4 corner concrete footings & raised timber stilt posts (Z=0..3.6)
    stilt_pts = ((-1.45, -1.45), (1.45, -1.45), (1.45, 1.45), (-1.45, 1.45))
    for sx, sy in stilt_pts:
        if lod <= 1:
            acc.box((sx, sy, 0.18), (0.42, 0.42, 0.36), PAL["plinth"])
        acc.box((sx, sy, 1.85), (0.22, 0.22, 3.5), PAL["teak_brown"])

    # Horizontal ledger beams + X cross-bracing on all 4 stilt bays
    if lod <= 1:
        for bz in (1.75, 3.45):
            for sy in (-1.45, 1.45):
                acc.box((0.0, sy, bz), (3.0, 0.14, 0.16), PAL["teak_dark"])
            for sx in (-1.45, 1.45):
                acc.box((sx, 0.0, bz), (0.14, 3.0, 0.16), PAL["teak_dark"])
        for sx in (-1.45, 1.45):
            add_strut(acc, (sx, -1.45, 0.35), (sx, 1.45, 3.40), 0.10, 0.10, XPAL["wood_light"])
            add_strut(acc, (sx, 1.45, 0.35), (sx, -1.45, 3.40), 0.10, 0.10, XPAL["wood_light"])
        add_strut(acc, (-1.45, 1.45, 0.35), (1.45, 1.45, 3.40), 0.10, 0.10, XPAL["wood_light"])
        add_strut(acc, (1.45, 1.45, 0.35), (-1.45, 1.45, 3.40), 0.10, 0.10, XPAL["wood_light"])
        add_strut(acc, (-1.45, -1.45, 1.75), (1.45, -1.45, 3.40), 0.10, 0.10, XPAL["wood_light"])

    # Planked timber platform deck (3.7x3.7m at Z=3.62)
    if lod == 0:
        for pi in range(12):
            py = -1.72 + pi * (3.44 / 11)
            acc.box((0.0, py, 3.62), (3.76, 0.27, 0.12), XPAL["wood_light"] if pi % 2 == 0 else PAL["teak_brown"])
    else:
        acc.box((0.0, 0.0, 3.62), (3.76, 3.76, 0.14), XPAL["wood_light"])

    # Angled access stairs ascending from front (-Y) up to deck
    if lod <= 1:
        n_treads = 10 if lod == 0 else 5
        for ti in range(n_treads):
            f = (ti + 0.5) / n_treads
            ty = -2.25 + f * 0.95
            tz = 0.2 + f * 3.3
            acc.box((0.0, ty, tz), (0.95, 0.24, 0.08), XPAL["wood_light"])
        for sx in (-0.52, 0.52):
            add_strut(acc, (sx, -2.35, 0.15), (sx, -1.30, 3.60), 0.10, 0.16, PAL["teak_brown"])
            if lod == 0:
                add_strut(acc, (sx, -2.35, 0.95), (sx, -1.30, 4.40), 0.06, 0.06, PAL["white"])

    # Wrap-around deck railing (open at front stair gap X in [-0.55, 0.55])
    add_balustrade_rail(acc, (-1.82, -1.82, 3.68), (-0.58, -1.82, 3.68), 0.92, PAL["white"], PAL["crimson"], glass=False, lod=lod)
    add_balustrade_rail(acc, (0.58, -1.82, 3.68), (1.82, -1.82, 3.68), 0.92, PAL["white"], PAL["crimson"], glass=False, lod=lod)
    add_balustrade_rail(acc, (-1.82, 1.82, 3.68), (1.82, 1.82, 3.68), 0.92, PAL["white"], PAL["crimson"], glass=False, lod=lod)
    for sx in (-1.82, 1.82):
        add_balustrade_rail(acc, (sx, -1.82, 3.68), (sx, 1.82, 3.68), 0.92, PAL["white"], PAL["crimson"], glass=False, lod=lod)

    # Red-and-white observation cabin (2.3x2.3m, Z=3.68..5.75) + wide panoramic windows
    if lod <= 1:
        acc.box((0.0, 0.1, 4.18), (2.3, 2.3, 1.0), PAL["white"])
        acc.box((0.0, 0.1, 5.55), (2.36, 2.36, 0.35), PAL["crimson"])
        for sx in (-1.05, 1.05):
            for sy in (-0.95, 1.15):
                acc.box((sx, sy, 5.05), (0.20, 0.20, 1.0), PAL["white"])
        acc.box((0.0, 0.1, 5.05), (2.15, 2.15, 0.85), PAL["glass_aqua"])
        if lod == 0:
            for mx in (-0.42, 0.42):
                acc.box((mx, -1.06, 5.05), (0.06, 0.06, 0.88), PAL["white"])
            for my in (-0.32, 0.52):
                acc.box((-1.16, my, 5.05), (0.06, 0.06, 0.88), PAL["white"])
                acc.box((1.16, my, 5.05), (0.06, 0.06, 0.88), PAL["white"])
            acc.cyl((0.0, -1.12, 4.18), 0.34, 0.34, 0.10, PAL["crimson"], segs=12, rot_x=math.pi * 0.5)
            acc.cyl((0.0, -1.14, 4.18), 0.18, 0.18, 0.12, PAL["white"], segs=10, rot_x=math.pi * 0.5)
    else:
        acc.box((0.0, 0.1, 4.70), (2.3, 2.3, 2.0), PAL["white"])

    # Pyramidal red roof + flag mast
    acc.cyl((0.0, 0.1, 6.28), 2.15, 0.05, 1.12, PAL["crimson"], segs=4, rot_z=math.pi * 0.25)
    if lod <= 1:
        acc.cyl((0.0, 0.1, 7.15), 0.04, 0.03, 0.9, PAL["steel_light"], segs=5)

    return acc


# ---------------------------------------------------------------------------
# 18. K03_canal_informal (5x8m, 1F)
# ---------------------------------------------------------------------------


def build_K03_canal_informal(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 5.0, 8.0
    hw, hd = 0.5 * w, 0.5 * d

    # Stepped brick plinth
    acc.box((0.0, 0.1, 0.22), (w - 0.1, d - 0.2, 0.44), PAL["red_brick"])
    add_steps(acc, -0.6, -hd - 0.3, -hd + 0.5, 0.0, 0.44, 1.4, 3, PAL["plinth"], PAL["red_brick"], lod=lod)
    if lod == 0:
        # Visible exposed brick plinth courses
        for cz in (0.12, 0.32):
            acc.box((0.0, -hd + 0.06, cz), (w - 0.06, 0.10, 0.10), PAL["red_dark"])

    # Compact lime-blue & ochre walls
    acc.box((0.0, 0.2, 1.74), (w - 0.2, d - 0.8, 2.60), XPAL["lime_blue"])
    acc.box((0.0, 0.2, 0.78), (w - 0.14, d - 0.74, 0.68), PAL["ochre"])

    # Tiny recessed timber door + small barred window + chajja
    if lod <= 1:
        acc.box((-0.7, -hd + 0.52, 1.42), (1.02, 0.10, 1.92), PAL["teak_dark"])
        acc.box((-0.7, -hd + 0.50, 1.42), (0.86, 0.06, 1.78), PAL["teak_brown"])
        if lod == 0:
            add_window(acc, 1.0, -hd + 0.50, 1.72, 0.95, 0.90, (0.0, -1.0), PAL["teak_brown"], PAL["recess"], XPAL["sheet_metal"], with_chajja=True, with_grille=True, lod=lod)
            for sx in (-1, 1):
                add_window(acc, 0.4, sx * (hw - 0.10), 1.72, 0.90, 0.85, (sx, 0.0), PAL["teak_brown"], PAL["recess"], XPAL["sheet_metal"], with_chajja=True, with_grille=True, lod=lod)
        else:
            add_simple_win(acc, 1.0, -hd + 0.50, 1.72, 0.95, 0.90, (0.0, -1.0), PAL["recess"])
            for sx in (-1, 1):
                add_simple_win(acc, 0.4, sx * (hw - 0.10), 1.72, 0.90, 0.85, (sx, 0.0), PAL["recess"])

    # Sloped corrugated sheet lean-to roof (higher at rear, sloping down to front awning)
    add_corrugated_sheet(acc, 0.0, -hd - 0.15, hd + 0.2, 2.75, 3.65, w + 0.2, XPAL["sheet_metal"], XPAL["sheet_rust"], lod=lod)
    if lod <= 1:
        # Gable side infill triangles under lean-to slope + side plastic water drum
        for sx in (-1, 1):
            acc.box((sx * (hw - 0.20), 0.2, 3.04), (0.18, d - 0.8, 0.42), PAL["ochre"])
        acc.cyl((hw - 0.1, -2.0, 0.85), 0.30, 0.30, 0.85, PAL["steel_blue"], segs=8 if lod == 0 else 6)
        if lod == 0:
            # Front awning timber support posts
            for px in (-2.2, 2.2):
                acc.cyl((px, -hd - 0.05, 1.55), 0.06, 0.06, 2.4, PAL["teak_brown"], segs=6)

    return acc


# ---------------------------------------------------------------------------
# 19. K04_north_lane_house (6x12m, 2F)
# ---------------------------------------------------------------------------


def build_K04_north_lane_house(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 12.0
    hw, hd = 0.5 * w, 0.5 * d

    # Dense pastel blue & yellow narrow street house
    acc.box((0.0, 0.2, 0.20), (w, d - 0.4, 0.40), PAL["plinth"])
    acc.box((0.0, 0.2, 2.0), (w, d - 0.4, 3.2), XPAL["pastel_yellow"])
    acc.box((0.0, 0.2, 5.15), (w, d - 0.4, 3.1), PAL["sky_blue"])
    acc.box((0.0, 0.2, 3.60), (w + 0.22, d - 0.18, 0.18), PAL["white"])

    # Recessed front stoop (thinnai step + dwarf side seats + recessed green door)
    add_steps(acc, -0.9, -hd - 0.2, -hd + 0.5, 0.0, 0.40, 1.8, 2, PAL["plinth"], PAL["concrete"], lod=lod)
    if lod <= 1:
        acc.box((1.2, -hd + 0.45, 0.60), (2.4, 0.85, 0.42), PAL["plinth"])
        acc.box((-0.9, -hd + 0.42, 1.45), (1.05, 0.12, 2.1), PAL["teak_green"])
        add_balcony(acc, -0.8, -hd + 0.4, 3.65, 2.4, 0.90, PAL["white"], glass_rail=False, lod=lod)
        if lod == 0:
            add_window(acc, 1.2, -hd + 0.40, 1.85, 1.05, 1.15, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
            add_window(acc, 1.4, -hd + 0.4, 5.15, 1.0, 1.2, (0.0, -1.0), PAL["teak_brown"], PAL["lit_warm"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
            for sx in (-1, 1):
                for wy in (-2.5, 2.5):
                    add_window(acc, wy, sx * hw, 2.0, 0.95, 1.15, (sx, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
                    add_window(acc, wy, sx * hw, 5.15, 0.95, 1.15, (sx, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
        else:
            add_simple_win(acc, 1.2, -hd + 0.40, 1.85, 1.05, 1.15, (0.0, -1.0), PAL["glass_blue"])
            add_simple_win(acc, 1.4, -hd + 0.4, 5.15, 1.0, 1.2, (0.0, -1.0), PAL["lit_warm"])
            for sx in (-1, 1):
                add_simple_win(acc, 0.0, sx * hw, 5.15, 1.2, 1.2, (sx, 0.0), PAL["glass_blue"])
    else:
        acc.box((-0.8, -hd - 0.1, 3.65), (2.4, 0.90, 0.16), PAL["white"])

    # Parapet + clothes-rail bar + rooftop tank
    z_top = add_parapet_with_jaali(acc, w, d - 0.4, 6.70, 0.85, PAL["sky_blue"], PAL["white"], PAL["cream_trim"], pediment=True, lod=lod)
    if lod <= 1:
        # Front clothes-rail bar on steel brackets
        acc.box((0.0, -hd + 0.05, 7.25), (3.8, 0.05, 0.05), PAL["steel_light"])
        for bx in (-1.7, 0.0, 1.7):
            acc.box((bx, -hd + 0.25, 7.25), (0.05, 0.40, 0.05), PAL["iron"])
    add_rooftop_props(acc, w, d - 0.4, 6.8, lod=lod, add_tank=True)

    return acc


# ---------------------------------------------------------------------------
# 20. K06_slum_cluster (6x9m, 1F)
# ---------------------------------------------------------------------------


def build_K06_slum_cluster(lod: int) -> MeshAcc:
    acc = MeshAcc(f"LOD{lod}")
    w, d = 6.0, 9.0

    # Twin irregular semi-pucca shelters side by side (Unit A left/front, Unit B right/offset back)
    # Unit A: X in [-2.95, 0.15], Y in [-4.0, 3.8]
    acc.box((-1.40, -0.1, 0.18), (3.1, 7.8, 0.36), PAL["plinth"])
    acc.box((-1.40, -0.1, 0.86), (3.0, 7.6, 1.0), PAL["red_brick"])
    acc.box((-1.40, -0.1, 2.16), (3.0, 7.6, 1.6), PAL["sky_blue"])
    add_steps(acc, -1.40, -4.3, -3.8, 0.0, 0.36, 1.2, 2, PAL["plinth"], PAL["red_brick"], lod=lod)
    # Unit A door + barred window + clay-tile pitched roof
    if lod <= 1:
        acc.box((-1.55, -3.92, 1.32), (0.92, 0.08, 1.85), PAL["teak_brown"])
        if lod == 0:
            add_window(acc, -0.45, -3.9, 1.65, 0.72, 0.78, (0.0, -1.0), PAL["teak_dark"], PAL["recess"], PAL["white"], with_chajja=True, with_grille=True, lod=lod)
        else:
            add_simple_win(acc, -0.45, -3.9, 1.65, 0.72, 0.78, (0.0, -1.0), PAL["recess"])
    # Pitched tile roof with 3D tile ribs on Unit A
    acc.pitched_roof(-3.05, 0.25, -4.1, 3.9, 2.96, 1.05, PAL["tile_red"], PAL["sky_blue"])
    if lod == 0:
        for ri in range(14):
            ry = -3.8 + ri * (7.6 / 13)
            acc.box((-1.40, ry, 3.55), (3.35, 0.10, 0.06), PAL["tile_ridge"])

    # Unit B: X in [0.15, 2.95], Y in [-3.4, 4.3] (slightly lower, irregular ochre/brick + corrugated sheet roof)
    acc.box((1.55, 0.45, 0.16), (2.8, 7.7, 0.32), PAL["plinth"])
    acc.box((1.55, 0.45, 0.80), (2.7, 7.5, 0.96), PAL["red_brick"])
    acc.box((1.55, 0.45, 1.98), (2.7, 7.5, 1.40), PAL["ochre"])
    add_steps(acc, 1.55, -3.7, -3.2, 0.0, 0.32, 1.1, 2, PAL["plinth"], PAL["red_brick"], lod=lod)
    if lod <= 1:
        acc.box((1.55, -3.32, 1.22), (0.88, 0.08, 1.76), PAL["teak_green"])
        if lod == 0:
            add_window(acc, 2.9, 0.4, 1.60, 0.76, 0.76, (1.0, 0.0), PAL["teak_brown"], PAL["recess"], XPAL["sheet_metal"], with_chajja=True, with_grille=True, lod=lod)
        else:
            add_simple_win(acc, 2.9, 0.4, 1.60, 0.76, 0.76, (1.0, 0.0), PAL["recess"])
    # Doorway overhang + sloped corrugated sheet roof
    add_corrugated_sheet(acc, 1.55, -3.65, 4.4, 2.68, 3.38, 2.95, XPAL["sheet_metal"], XPAL["sheet_rust"], lod=lod)
    if lod <= 1:
        # Doorway porch overhang on Unit A front
        acc.box((-1.55, -4.35, 2.30), (1.4, 0.95, 0.07), XPAL["sheet_rust"], rot_x=0.25)
        if lod == 0:
            for px in (-2.15, -0.95):
                acc.cyl((px, -4.72, 1.22), 0.05, 0.05, 1.95, PAL["teak_brown"], segs=6)
            # Water pot outside
            acc.cyl((2.45, -3.65, 0.25), 0.18, 0.22, 0.50, PAL["pot"], segs=8)

    return acc


# ---------------------------------------------------------------------------
# Building Registry & Export Pipeline
# ---------------------------------------------------------------------------


BUILDINGS: List[Dict] = [
    {
        "id": "B31_temple_hall",
        "title": "Hindu Temple (Dravidian Hall)",
        "source_card": "31",
        "category": "heritage",
        "substyle": "temple_dravidian",
        "preferred_localities": ["Mylapore", "Triplicane", "George Town"],
        "w": 40.0,
        "d": 60.0,
        "floors": 1,
        "shop_ground": False,
        "builder": build_B31_temple_hall,
        "colliders": [
            ("COL_Main", (0.0, 7.0, 5.0), (24.5, 30.5, 10.0)),
            ("COL_Compound", (0.0, -28.0, 8.0), (14.0, 7.0, 16.0)),
        ],
    },
    {
        "id": "B32_church_gothic",
        "title": "Church (Neo-Gothic)",
        "source_card": "32",
        "category": "heritage",
        "substyle": "church_gothic",
        "preferred_localities": ["Santhome", "George Town", "Royapuram"],
        "w": 30.0,
        "d": 50.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_B32_church_gothic,
        "colliders": [
            ("COL_Main", (0.0, 2.0, 11.0), (27.6, 40.0, 22.0)),
            ("COL_Compound", (0.0, -24.5, 0.8), (30.0, 0.5, 1.6)),
        ],
    },
    {
        "id": "B33_mosque_urban",
        "title": "Mosque (Urban Chennai)",
        "source_card": "33",
        "category": "heritage",
        "substyle": "mosque_urban",
        "preferred_localities": ["Triplicane", "Royapettah", "Royapuram"],
        "w": 20.0,
        "d": 30.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_B33_mosque_urban,
        "colliders": [("COL_Main", (0.0, 2.0, 7.5), (18.5, 22.5, 15.0))],
    },
    {
        "id": "B34_colonial_heritage",
        "title": "Colonial Heritage Block",
        "source_card": "34",
        "category": "heritage",
        "substyle": "colonial_civic",
        "preferred_localities": ["Parrys Corner", "Egmore"],
        "w": 40.0,
        "d": 80.0,
        "floors": 3,
        "shop_ground": False,
        "builder": build_B34_colonial_heritage,
        "colliders": [("COL_Main", (0.0, 0.0, 11.0), (37.5, 74.0, 22.0))],
    },
    {
        "id": "B35_museum_heritage",
        "title": "Museum / Hall (Heritage)",
        "source_card": "35",
        "category": "heritage",
        "substyle": "museum",
        "preferred_localities": ["Egmore", "Mylapore"],
        "w": 50.0,
        "d": 60.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_B35_museum_heritage,
        "colliders": [
            ("COL_Main", (0.0, 1.5, 7.0), (45.0, 48.0, 14.0)),
            ("COL_Verandah", (0.0, -26.0, 5.5), (16.5, 5.5, 11.0)),
        ],
    },
    {
        "id": "B37_rotunda_historic",
        "title": "Rotunda Pavilion (Historic)",
        "source_card": "37",
        "category": "heritage",
        "substyle": "rotunda",
        "preferred_localities": ["Triplicane", "Marina"],
        "w": 20.0,
        "d": 20.0,
        "floors": 1,
        "shop_ground": False,
        "builder": build_B37_rotunda_historic,
        "colliders": [("COL_Main", (0.0, 0.0, 6.2), (17.5, 18.5, 12.4))],
    },
    {
        "id": "B39_market_heritage",
        "title": "Market Hall (Heritage Brick)",
        "source_card": "39",
        "category": "heritage",
        "substyle": "heritage_market",
        "preferred_localities": ["George Town", "Egmore"],
        "w": 60.0,
        "d": 80.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_B39_market_heritage,
        "colliders": [("COL_Main", (0.0, 0.5, 9.0), (57.0, 76.0, 18.0))],
    },
    {
        "id": "B40_public_library",
        "title": "Public Library (Heritage)",
        "source_card": "40",
        "category": "heritage",
        "substyle": "library",
        "preferred_localities": ["Egmore", "Mylapore"],
        "w": 40.0,
        "d": 50.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_B40_public_library,
        "colliders": [
            ("COL_Main", (0.0, 2.0, 6.5), (36.0, 39.0, 13.0)),
            ("COL_Compound", (0.0, -24.4, 0.8), (40.0, 0.5, 1.6)),
        ],
    },
    {
        "id": "B45_beach_apartment",
        "title": "Beachside Building (Marina/ECR)",
        "source_card": "45",
        "category": "coastal",
        "substyle": "beach_apartment",
        "preferred_localities": ["Marina Beach", "Thiruvanmiyur", "Besant Nagar"],
        "w": 24.0,
        "d": 40.0,
        "floors": 4,
        "shop_ground": False,
        "builder": build_B45_beach_apartment,
        "colliders": [
            ("COL_Main", (0.0, 2.0, 7.5), (21.0, 33.0, 15.0)),
            ("COL_Compound", (0.0, -19.5, 0.8), (24.0, 0.5, 1.6)),
        ],
    },
    {
        "id": "N01_georgetown_shop",
        "title": "Old Commercial Block (George Town)",
        "source_card": "N01",
        "category": "north_chennai",
        "substyle": "gt_commercial",
        "preferred_localities": ["George Town", "Parrys Corner", "Sowcarpet"],
        "w": 10.0,
        "d": 16.0,
        "floors": 2,
        "shop_ground": True,
        "builder": build_N01_georgetown_shop,
        "colliders": [("COL_Main", (0.0, 0.0, 4.3), (10.2, 16.2, 8.6))],
    },
    {
        "id": "N02_north_tenement",
        "title": "Tenement / Urban Housing (North)",
        "source_card": "N02",
        "category": "north_chennai",
        "substyle": "north_tenement",
        "preferred_localities": ["Royapuram", "Washermanpet", "Tondiarpet"],
        "w": 8.0,
        "d": 16.0,
        "floors": 3,
        "shop_ground": False,
        "builder": build_N02_north_tenement,
        "colliders": [("COL_Main", (0.0, 0.0, 5.3), (8.2, 16.2, 10.6))],
    },
    {
        "id": "N05_lighthouse_complex",
        "title": "Lighthouse Complex (North)",
        "source_card": "N05",
        "category": "north_chennai",
        "substyle": "lighthouse_complex",
        "preferred_localities": ["Royapuram", "Marina"],
        "w": 16.0,
        "d": 22.0,
        "floors": 4,
        "shop_ground": False,
        "builder": build_N05_lighthouse_complex,
        "colliders": [
            ("COL_Main", (0.0, -4.8, 11.0), (6.8, 6.8, 22.0)),
            ("COL_Verandah", (0.0, 4.2, 2.4), (12.0, 11.0, 4.8)),
            ("COL_Compound", (0.0, -10.5, 0.8), (16.0, 0.5, 1.6)),
        ],
    },
    {
        "id": "C01_beach_stalls",
        "title": "Beachside Food Stall Block",
        "source_card": "B01",
        "category": "coastal",
        "substyle": "beach_stalls",
        "preferred_localities": ["Marina Beach", "Besant Nagar", "Thiruvanmiyur"],
        "w": 6.0,
        "d": 16.0,
        "floors": 1,
        "shop_ground": True,
        "builder": build_C01_beach_stalls,
        "colliders": [("COL_Main", (0.0, 0.4, 2.2), (5.8, 15.2, 4.4))],
    },
    {
        "id": "C02_beach_police",
        "title": "Beachside Police Station",
        "source_card": "B02",
        "category": "coastal",
        "substyle": "beach_police",
        "preferred_localities": ["Marina Beach", "Besant Nagar"],
        "w": 16.0,
        "d": 24.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_C02_beach_police,
        "colliders": [
            ("COL_Main", (0.0, 2.0, 4.1), (14.4, 17.4, 8.2)),
            ("COL_Compound", (0.0, -11.5, 0.8), (16.0, 0.5, 1.6)),
        ],
    },
    {
        "id": "C03_beach_sports",
        "title": "Beach Recreation Complex",
        "source_card": "B03",
        "category": "coastal",
        "substyle": "beach_sports",
        "preferred_localities": ["Marina Beach", "Elliot's Beach"],
        "w": 22.0,
        "d": 34.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_C03_beach_sports,
        "colliders": [("COL_Main", (0.0, 1.0, 5.8), (20.4, 30.0, 11.6))],
    },
    {
        "id": "C04_beach_cafe",
        "title": "Beachside Cafe / Restaurant",
        "source_card": "B04",
        "category": "coastal",
        "substyle": "beach_cafe",
        "preferred_localities": ["Besant Nagar", "Elliot's Beach", "Thiruvanmiyur"],
        "w": 14.0,
        "d": 20.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_C04_beach_cafe,
        "colliders": [("COL_Main", (0.0, 1.5, 3.5), (12.8, 15.5, 7.0))],
    },
    {
        "id": "C05_lifeguard_tower",
        "title": "Lifeguard / Beach Safety Tower",
        "source_card": "B05",
        "category": "coastal",
        "substyle": "lifeguard_tower",
        "preferred_localities": ["Marina Beach", "Elliot's Beach", "Thiruvanmiyur"],
        "w": 4.0,
        "d": 4.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_C05_lifeguard_tower,
        "colliders": [("COL_Main", (0.0, 0.0, 3.6), (3.8, 3.8, 7.2))],
    },
    {
        "id": "K03_canal_informal",
        "title": "Canal-Side Housing (Informal)",
        "source_card": "K03",
        "category": "north_chennai",
        "substyle": "canal_informal",
        "preferred_localities": ["Koovam", "Chintadripet", "Perambur"],
        "w": 5.0,
        "d": 8.0,
        "floors": 1,
        "shop_ground": False,
        "builder": build_K03_canal_informal,
        "colliders": [("COL_Main", (0.0, 0.2, 1.85), (4.9, 7.6, 3.7))],
    },
    {
        "id": "K04_north_lane_house",
        "title": "Old Residential Lane House",
        "source_card": "K04",
        "category": "north_chennai",
        "substyle": "narrow_lane",
        "preferred_localities": ["Royapuram", "Washermanpet", "George Town"],
        "w": 6.0,
        "d": 12.0,
        "floors": 2,
        "shop_ground": False,
        "builder": build_K04_north_lane_house,
        "colliders": [("COL_Main", (0.0, 0.2, 3.9), (6.1, 11.8, 7.8))],
    },
    {
        "id": "K06_slum_cluster",
        "title": "High-Density Cluster Dwelling",
        "source_card": "K06",
        "category": "residential",
        "substyle": "cluster_housing",
        "preferred_localities": ["Koovam", "Kasimedu", "Tondiarpet"],
        "w": 6.0,
        "d": 9.0,
        "floors": 1,
        "shop_ground": False,
        "builder": build_K06_slum_cluster,
        "colliders": [("COL_Main", (0.0, 0.1, 2.0), (5.9, 8.6, 4.0))],
    },
]


def _collect_stats() -> Tuple[Dict[str, Dict[str, int]], float]:
    stats: Dict[str, Dict[str, int]] = {}
    max_z = 0.0
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        me = ob.data
        stats[ob.name] = {
            "verts": len(me.vertices),
            "tris": sum(max(0, len(p.vertices) - 2) for p in me.polygons),
        }
        if ob.name == "LOD0" and len(me.vertices) > 0:
            max_z = max(v.co.z for v in me.vertices)
    return stats, round(max_z, 2)


def main() -> None:
    meta_models: List[Dict] = []
    for spec in BUILDINGS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mat = make_vertex_material(f"{spec['id']}_Mat")
        builder: Callable[[int], MeshAcc] = spec["builder"]
        lod_accs = (builder(0), builder(1), builder(2))
        out_glb = PACK_DIR / f"{spec['id']}.glb"
        export_glb_scene(out_glb, mat, lod_accs, spec["colliders"])
        lod_stats, max_z = _collect_stats()

        entry = {
            "id": spec["id"],
            "title": spec["title"],
            "source_card": spec["source_card"],
            "category": spec["category"],
            "substyle": spec["substyle"],
            "preferred_localities": spec["preferred_localities"],
            "dimensions_m": {
                "width": spec["w"],
                "depth": spec["d"],
                "height": max_z,
            },
            "floors": spec["floors"],
            "shop_ground": spec["shop_ground"],
            "glb_path": f"res://assets/buildings/pack_100/{spec['id']}.glb",
            "glb_bytes": out_glb.stat().st_size,
            "lod_stats": lod_stats,
        }
        meta_models.append(entry)
        print(
            f"[SHARD5] {spec['id']:24s} bytes={entry['glb_bytes']:6d} "
            f"LOD0={lod_stats['LOD0']['tris']:4d} LOD1={lod_stats['LOD1']['tris']:4d} "
            f"LOD2={lod_stats['LOD2']['tris']:3d} h={max_z:.2f}m"
        )

    META_PATH.write_text(json.dumps({"shard": 5, "count": len(meta_models), "models": meta_models}, indent=2), encoding="utf-8")
    print(f"[SHARD5] Wrote {len(meta_models)} entries to {META_PATH}")


if __name__ == "__main__":
    main()
