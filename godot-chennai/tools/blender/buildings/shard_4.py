"""Blender 5.x shard 4 generator: 20 Industrial, Transit & Institutional Chennai buildings.

Generates B17, B18, B21-B30, B38, B46, B47, B49, B50, K10, N03, N04 into
godot-chennai/assets/buildings/pack_100/<id>.glb and writes shard_4_meta.json.

Usage:
    /opt/homebrew/bin/blender -b --factory-startup --python godot-chennai/tools/blender/buildings/shard_4.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Callable, Dict, List, Sequence, Tuple

import bpy

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from chennai_kit import (
    PAL,
    MeshAcc,
    add_balcony,
    add_clay_tile_canopy,
    add_compound_fence,
    add_parapet_with_jaali,
    add_rooftop_props,
    add_window,
    export_glb_scene,
    make_vertex_material,
)

ROOT = THIS_DIR.parents[2]
OUT_DIR = ROOT / "assets" / "buildings" / "pack_100"
META_PATH = THIS_DIR / "shard_4_meta.json"

Colour = Tuple[float, float, float, float]
ColliderList = List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float]]]


# ---------------------------------------------------------------------------
# Local Shared Architectural Helpers
# ---------------------------------------------------------------------------

def add_wall_ribbon_windows(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    cz: float,
    span_w: float,
    win_h: float,
    face_y: float,
    frame_col: Colour,
    pane_col: Colour,
    trim_col: Colour,
    n_mullions: int,
    lod: int,
    chajja: bool = True,
) -> None:
    """Place a horizontal ribbon window band along X on -Y or +Y wall."""
    acc.box((cx, y_wall + face_y * 0.03, cz), (span_w, 0.08, win_h), frame_col)
    acc.box((cx, y_wall + face_y * 0.06, cz), (span_w - 0.14, 0.04, win_h - 0.14), pane_col)
    acc.box((cx, y_wall + face_y * 0.08, cz - 0.5 * win_h - 0.04), (span_w + 0.14, 0.16, 0.08), trim_col)
    if lod == 0 and n_mullions > 0:
        for i in range(1, n_mullions):
            mx = cx - 0.5 * span_w + i * (span_w / n_mullions)
            acc.box((mx, y_wall + face_y * 0.075, cz), (0.07, 0.05, win_h - 0.06), frame_col)
    if chajja and lod < 2:
        acc.box((cx, y_wall + face_y * 0.25, cz + 0.5 * win_h + 0.09), (span_w + 0.24, 0.48, 0.09), trim_col, rot_x=face_y * 0.20)


def add_side_ribbon_windows(
    acc: MeshAcc,
    x_wall: float,
    cy: float,
    cz: float,
    span_d: float,
    win_h: float,
    face_x: float,
    frame_col: Colour,
    pane_col: Colour,
    trim_col: Colour,
    n_mullions: int,
    lod: int,
    chajja: bool = True,
) -> None:
    """Place a horizontal ribbon window band along Y on -X or +X wall."""
    acc.box((x_wall + face_x * 0.03, cy, cz), (0.08, span_d, win_h), frame_col)
    acc.box((x_wall + face_x * 0.06, cy, cz), (0.04, span_d - 0.14, win_h - 0.14), pane_col)
    acc.box((x_wall + face_x * 0.08, cy, cz - 0.5 * win_h - 0.04), (0.16, span_d + 0.14, 0.08), trim_col)
    if lod == 0 and n_mullions > 0:
        for i in range(1, n_mullions):
            my = cy - 0.5 * span_d + i * (span_d / n_mullions)
            acc.box((x_wall + face_x * 0.075, my, cz), (0.05, 0.07, win_h - 0.06), frame_col)
    if chajja and lod < 2:
        acc.box((x_wall + face_x * 0.25, cy, cz + 0.5 * win_h + 0.09), (0.48, span_d + 0.24, 0.09), trim_col, rot_y=-face_x * 0.20)


def add_rolling_shutter_bay(
    acc: MeshAcc,
    cx: float,
    y_wall: float,
    z0: float,
    bw: float,
    bh: float,
    face_y: float,
    shutter_col: Colour,
    frame_col: Colour,
    lod: int,
    rib_col: Colour | None = None,
    open_frac: float = 0.0,
) -> None:
    """Tall industrial/garage rolling shutter bay with hood drum, jambs & ribbed slats."""
    rib_col = rib_col or PAL["slate"]
    # Recessed interior dark backing
    acc.box((cx, y_wall - face_y * 0.05, z0 + 0.5 * bh), (bw, 0.12, bh), PAL["recess"])
    # Side jamb pillars
    for sx in (-1, 1):
        acc.box((cx + sx * (0.5 * bw + 0.14), y_wall + face_y * 0.04, z0 + 0.5 * bh), (0.28, 0.24, bh + 0.12), frame_col)
    # Lintel + shutter hood box
    acc.box((cx, y_wall + face_y * 0.08, z0 + bh + 0.16), (bw + 0.56, 0.34, 0.32), frame_col)
    acc.box((cx, y_wall + face_y * 0.16, z0 + bh - 0.12), (bw + 0.10, 0.26, 0.34), PAL["slate"])

    shutter_h = bh * max(0.15, 1.0 - open_frac)
    sz_c = z0 + bh - 0.5 * shutter_h
    acc.box((cx, y_wall + face_y * 0.03, sz_c), (bw - 0.06, 0.07, shutter_h), shutter_col)
    if lod == 0 and shutter_h > 0.6:
        n_ribs = max(3, min(10, int(shutter_h / 0.55)))
        for ri in range(1, n_ribs):
            rz = (z0 + bh - shutter_h) + ri * (shutter_h / n_ribs)
            acc.box((cx, y_wall + face_y * 0.075, rz), (bw - 0.10, 0.03, 0.045), rib_col)


def add_medical_cross(acc: MeshAcc, cx: float, cy: float, cz: float, size: float, face_y: float = -1.0, lod: int = 0) -> None:
    """Simple 3D red cross medical relief emblem on crisp white backing plaque."""
    r = size * 0.72
    if lod == 0:
        acc.cyl((cx, cy, cz), r, r, 0.10, PAL["white"], segs=12, rot_x=math.pi * 0.5)
    else:
        acc.box((cx, cy, cz), (r * 1.8, 0.10, r * 1.8), PAL["white"])
    arm = size * 0.92
    thick = size * 0.30
    acc.box((cx, cy + face_y * 0.07, cz), (arm, 0.08, thick), PAL["crimson"])
    acc.box((cx, cy + face_y * 0.07, cz), (thick, 0.08, arm), PAL["crimson"])


def add_steps(acc: MeshAcc, cx: float, y_front: float, z0: float, z1: float, w: float, run_y: float, n: int, col: Colour, lod: int) -> None:
    """Cascading entrance granite/concrete steps from y_front - run_y up to y_front."""
    if lod >= 2:
        acc.box((cx, y_front - 0.5 * run_y, 0.5 * (z0 + z1)), (w, run_y, z1 - z0), col)
        return
    steps = n if lod == 0 else max(2, n // 2)
    dz = (z1 - z0) / steps
    dy = run_y / steps
    for i in range(steps):
        sh = (i + 1) * dz
        sy = y_front - run_y + (i + 0.5) * dy
        acc.box((cx, sy, z0 + 0.5 * sh), (w, dy + 0.04, sh), col)


def add_truss_arch_frame(
    acc: MeshAcc,
    y_pos: float,
    half_span_x: float,
    z_eaves: float,
    rise_z: float,
    col_beam: Colour,
    segs: int = 8,
    lod: int = 0,
) -> None:
    """Exposed curved steel arch truss spanning X at a fixed Y station."""
    if lod >= 2:
        return
    n = segs if lod == 0 else max(4, segs // 2)
    pts = []
    for i in range(n + 1):
        a = math.pi * i / n
        px = -half_span_x * math.cos(a)
        pz = z_eaves + rise_z * math.sin(a)
        pts.append((px, pz))
    for i in range(n):
        x0, z0 = pts[i]
        x1, z1 = pts[i + 1]
        mx, mz = 0.5 * (x0 + x1), 0.5 * (z0 + z1)
        seg_l = math.hypot(x1 - x0, z1 - z0)
        ang = math.atan2(z1 - z0, x1 - x0)
        acc.box((mx, y_pos, mz), (seg_l + 0.08, 0.24, 0.28), col_beam, rot_y=-ang)
    # Horizontal tie chord + vertical king/queen struts
    acc.box((0.0, y_pos, z_eaves + 0.14), (2.0 * half_span_x, 0.18, 0.20), col_beam)
    if lod == 0:
        for frac in (-0.55, 0.0, 0.55):
            sx = frac * half_span_x
            h_top = z_eaves + rise_z * math.sqrt(max(0.05, 1.0 - frac * frac))
            acc.box((sx, y_pos, 0.5 * (z_eaves + h_top)), (0.14, 0.14, h_top - z_eaves), col_beam)


def add_chimney_stack(acc: MeshAcc, cx: float, cy: float, z0: float, total_h: float, r_base: float, r_top: float, lod: int) -> None:
    """Red-and-white banded industrial smokestack chimney."""
    plinth_h = 2.2
    acc.box((cx, cy, z0 + 0.5 * plinth_h), (r_base * 2.5, r_base * 2.5, plinth_h), PAL["concrete"])
    segs = 12 if lod == 0 else (8 if lod == 1 else 6)
    shaft_h = total_h - plinth_h
    if lod == 2:
        acc.cyl((cx, cy, z0 + plinth_h + 0.5 * shaft_h), r_base, r_top, shaft_h, PAL["crimson"], segs=segs)
        return
    bands = 6 if lod == 0 else 4
    bh = shaft_h / bands
    for bi in range(bands):
        ra = r_base + (r_top - r_base) * (bi / bands)
        rb = r_base + (r_top - r_base) * ((bi + 1) / bands)
        col = PAL["crimson"] if bi % 2 == 0 else PAL["white"]
        acc.cyl((cx, cy, z0 + plinth_h + (bi + 0.5) * bh), ra, rb, bh + 0.02, col, segs=segs)
    # Top flared cap collar
    acc.cyl((cx, cy, z0 + total_h + 0.18), r_top * 1.24, r_top * 1.05, 0.36, PAL["charcoal"], segs=segs)


def add_potted_row(acc: MeshAcc, xs: Sequence[float], y_pos: float, z_base: float, lod: int) -> None:
    if lod > 0:
        return
    for px in xs:
        acc.cyl((px, y_pos, z_base + 0.20), 0.18, 0.25, 0.40, PAL["pot"], segs=8)
        acc.sphere((px, y_pos, z_base + 0.58), 0.30, PAL["foliage"], subdiv=1)


def add_compound_perimeter(
    acc: MeshAcc,
    w: float,
    d: float,
    gate_w: float,
    wall_col: Colour,
    trim_col: Colour,
    lod: int,
    wall_h: float = 1.4,
    with_rear: bool = True,
) -> None:
    """Full campus/industrial perimeter masonry wall with open gate piers at front (-Y)."""
    if lod >= 2:
        return
    hw, hd = 0.5 * w, 0.5 * d
    y_front = -hd + 0.25
    y_back = hd - 0.25
    wing_w = max(1.0, hw - 0.5 * gate_w - 0.35)
    for sx in (-1, 1):
        cx = sx * (0.5 * gate_w + 0.35 + 0.5 * wing_w)
        acc.box((cx, y_front, 0.5 * wall_h), (wing_w, 0.28, wall_h), wall_col)
        acc.box((cx, y_front, wall_h + 0.05), (wing_w + 0.08, 0.36, 0.10), trim_col)
        # Side walls
        acc.box((sx * (hw - 0.20), 0.0, 0.5 * wall_h), (0.28, d - 0.4, wall_h), wall_col)
        acc.box((sx * (hw - 0.20), 0.0, wall_h + 0.05), (0.36, d - 0.3, 0.10), trim_col)
        # Gate piers
        px = sx * (0.5 * gate_w + 0.25)
        acc.box((px, y_front, 0.5 * (wall_h + 0.75)), (0.62, 0.62, wall_h + 0.75), wall_col)
        acc.box((px, y_front, wall_h + 0.80), (0.76, 0.76, 0.14), trim_col)
        if lod == 0:
            acc.sphere((px, y_front, wall_h + 1.04), 0.18, PAL["white"], subdiv=1)
    if with_rear:
        acc.box((0.0, y_back, 0.5 * wall_h), (w - 0.4, 0.28, wall_h), wall_col)
        acc.box((0.0, y_back, wall_h + 0.05), (w - 0.3, 0.36, 0.10), trim_col)


# ---------------------------------------------------------------------------
# 20 Individual Building Builders
# ---------------------------------------------------------------------------

def build_B17_hospital_multi(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """30x40m, 5F: Clean white 5F hospital, central teal glazed curtain bay, crimson ambulance canopy & red cross."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 30.0, 40.0
    bw, bd = 26.0, 28.0
    cy_b = 2.0  # building center Y -> [-12, +16], front plaza [-20, -12]
    fh = 3.2
    floors = 5
    z_plinth = 0.5
    z_top = z_plinth + floors * fh  # 16.5m

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_top), (bw, bd, z_top), PAL["white"])
        acc.box((0.0, cy_b - 0.5 * bd - 0.2, 0.5 * z_top), (8.2, 0.6, z_top), PAL["glass_aqua"])
        acc.box((0.0, cy_b - 0.5 * bd - 3.2, 4.1), (9.0, 6.4, 0.9), PAL["crimson"])
        acc.box((0.0, cy_b, z_top + 1.1), (7.5, 6.0, 2.2), PAL["white_shade"])
    else:
        # Plinth & front ambulance apron
        acc.box((0.0, cy_b, 0.25), (bw + 0.6, bd + 0.6, 0.50), PAL["plinth"])
        acc.box((0.0, -16.0, 0.08), (28.0, 8.0, 0.16), PAL["pavement"])
        # Main white wings + central recessed spine
        acc.box((0.0, cy_b, 0.5 * (z_plinth + z_top)), (bw, bd, z_top - z_plinth), PAL["white"])
        # Central proud teal glazed curtain bay (X in [-4.2, +4.2])
        y_f = cy_b - 0.5 * bd
        acc.box((0.0, y_f - 0.25, 0.5 * (z_plinth + z_top + 0.9)), (8.6, 0.8, z_top - z_plinth + 0.9), PAL["teal_wall"])
        acc.box((0.0, y_f - 0.62, 0.5 * (z_plinth + 3.6 + z_top + 0.4)), (7.4, 0.16, z_top - z_plinth - 3.0), PAL["glass_aqua"])
        if lod == 0:
            for mx in (-2.4, -0.8, 0.8, 2.4):
                acc.box((mx, y_f - 0.68, 0.5 * (4.0 + z_top)), (0.14, 0.12, z_top - 4.0), PAL["white"])
            for fi in range(1, floors):
                fz = z_plinth + fi * fh
                acc.box((0.0, y_f - 0.68, fz), (7.8, 0.24, 0.26), PAL["white_shade"])
        # Flanking wing windows & horizontal cornice bands
        for fi in range(floors):
            fz = z_plinth + fi * fh
            cz = fz + 1.65
            if fi > 0:
                acc.box((0.0, cy_b, fz), (bw + 0.25, bd + 0.25, 0.16), PAL["white_shade"])
            for sx in (-1, 1):
                add_wall_ribbon_windows(
                    acc, sx * 8.6, y_f, cz, 6.4, 1.45, -1.0,
                    PAL["slate"], PAL["glass_blue"], PAL["white_shade"], 3, lod, chajja=(lod == 0),
                )
                if lod == 0:
                    add_wall_ribbon_windows(
                        acc, sx * 8.6, cy_b + 0.5 * bd, cz, 6.4, 1.45, +1.0,
                        PAL["slate"], PAL["glass_blue"], PAL["white_shade"], 2, lod, chajja=False,
                    )
                    add_side_ribbon_windows(
                        acc, sx * 0.5 * bw, cy_b, cz, 18.0, 1.45, float(sx),
                        PAL["slate"], PAL["glass_blue"], PAL["white_shade"], 4, lod, chajja=False,
                    )
        # Projecting crimson-banded emergency ambulance canopy portico
        y_port_c = y_f - 3.4
        acc.box((0.0, y_port_c, 4.15), (9.4, 6.8, 0.55), PAL["white"])
        acc.box((0.0, y_port_c, 4.48), (9.6, 7.0, 0.34), PAL["crimson"])
        acc.box((0.0, y_f - 6.85, 4.20), (5.6, 0.12, 0.34), PAL["sign_red"])
        acc.box((0.0, y_f - 6.92, 4.20), (4.4, 0.04, 0.16), PAL["white"])
        for sx in (-4.0, 4.0):
            for py in (y_f - 6.2, y_f - 2.6):
                acc.cyl((sx, py, 2.05), 0.28, 0.28, 4.0, PAL["white_shade"], segs=10 if lod == 0 else 6)
        # Ambulance sliding glass entrance + ramp
        acc.box((0.0, y_f - 0.64, 1.85), (4.4, 0.16, 2.8), PAL["glass_aqua"])
        acc.box((0.0, y_f - 0.72, 1.85), (0.12, 0.12, 2.8), PAL["steel_light"])
        add_steps(acc, 0.0, y_f - 0.7, 0.0, z_plinth, 5.4, 1.2, 3, PAL["concrete"], lod)

        # Red cross medical relief emblem on crown above glass bay
        add_medical_cross(acc, 0.0, y_f - 0.72, z_top + 0.55, 2.1, -1.0, lod)
        # Parapet & rooftop mechanical penthouse
        add_parapet_with_jaali(acc, bw, bd, z_top, 0.9, PAL["white"], PAL["white_shade"], PAL["concrete"], False, lod)
        acc.box((0.0, cy_b + 3.0, z_top + 1.35), (8.0, 7.0, 2.5), PAL["white_shade"])
        add_rooftop_props(acc, bw, bd, z_top + 0.15, lod, add_tank=True)
        if lod == 0:
            for cx in (-6.5, 6.5):
                acc.box((cx, cy_b - 2.0, z_top + 0.75), (2.4, 1.6, 1.1), PAL["steel_light"])
            add_potted_row(acc, (-5.2, 5.2), y_f - 6.5, 0.16, lod)
        add_compound_perimeter(acc, w, d, 10.0, PAL["white_shade"], PAL["crimson"], lod, wall_h=1.2)

    cols = [
        ("COL_Main", (0.0, cy_b, 0.5 * z_top), (bw, bd, z_top)),
        ("COL_Verandah", (0.0, y_f - 3.4 if lod < 2 else cy_b - 0.5 * bd - 3.2, 2.3), (9.4, 6.8, 4.6)),
    ]
    return acc, cols


def build_B18_college_inst(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """40x60m, 4F: Cream/sandstone symmetric institutional hall, triple-storey columned verandah wings, portico pediment & gate piers."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 40.0, 60.0
    fh = 3.2
    floors = 4
    z_plinth = 0.6
    z_top = z_plinth + floors * fh  # 13.4m
    # E-shaped / symmetric hall facing -Y: main spine + forward end pavilions + rear wings
    bw, bd = 34.0, 36.0
    cy_b = 2.0  # [-16, +20]

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_top), (bw, bd, z_top), PAL["cream"])
        acc.box((0.0, -18.5, 5.6), (11.0, 5.5, 11.2), PAL["cream_trim"])
        acc.pitched_roof(-6.0, 6.0, -21.5, -15.5, 11.2, 2.4, PAL["terracotta"], PAL["cream"], hip=False)
        for sx in (-1, 1):
            acc.box((sx * 14.0, -17.5, 0.5 * z_top), (6.5, 5.0, z_top), PAL["ochre"])
    else:
        acc.box((0.0, cy_b, 0.30), (bw + 1.0, bd + 1.0, 0.60), PAL["plinth"])
        # Main central spine + rear corridor wings
        acc.box((0.0, cy_b + 3.0, 0.5 * (z_plinth + z_top)), (bw, bd - 6.0, z_top - z_plinth), PAL["cream"])
        # End corner pavilions (X = +-13.5)
        for sx in (-1, 1):
            acc.box((sx * 13.5, -14.5, 0.5 * (z_plinth + z_top)), (7.0, 7.5, z_top - z_plinth), PAL["cream"])
            acc.box((sx * 13.5, -14.5, z_plinth + 0.5), (7.3, 7.8, 0.30), PAL["ochre"])
            acc.pitched_roof(sx * 13.5 - 3.7, sx * 13.5 + 3.7, -18.4, -10.6, z_top + 0.8, 2.1, PAL["tile_red"], PAL["cream"], hip=True)
            for fi in range(floors):
                add_window(acc, sx * 13.5, -18.25, z_plinth + fi * fh + 1.65, 2.2, 1.5, (0.0, -1.0), PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], True, lod == 0, arched=(fi < 2), lod=lod)

        # Triple-storey columned verandah wings between central portico and end pavilions (X = +-6.8, Y = -16.0..-12.5)
        for sx in (-1, 1):
            vx = sx * 6.8
            for fi in range(3):
                fz = z_plinth + fi * fh
                acc.box((vx, -14.2, fz - 0.08), (7.2, 3.8, 0.22), PAL["cream_trim"])
                if fi > 0:
                    acc.box((vx, -16.0, fz + 0.50), (7.0, 0.16, 0.92), PAL["cream_shade"])
                for cx_off in (-2.2, 0.0, 2.2):
                    acc.box((vx + cx_off, -15.9, fz + 0.5 * fh), (0.42, 0.42, fh - 0.15), PAL["cream_trim"])
                # Classroom windows & doors in recessed verandah wall
                if lod == 0:
                    add_window(acc, vx - 1.5, -12.4, fz + 1.65, 1.4, 1.5, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], False, False, lod=lod)
                    add_window(acc, vx + 1.5, -12.4, fz + 1.65, 1.4, 1.5, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], False, False, lod=lod)
                else:
                    acc.box((vx, -12.4, fz + 1.65), (4.2, 0.14, 1.5), PAL["glass_blue"])
            # 4th floor set back with terrace parapet
            acc.box((vx, -12.4, z_plinth + 3 * fh + 1.65), (5.8, 0.2, 1.4), PAL["glass_blue"])

        # Projecting central entrance portico + monumental columns + pediment
        y_p = -18.8
        acc.box((0.0, -16.0, z_plinth + 0.5 * (3 * fh)), (10.2, 6.2, 3 * fh), PAL["cream"])
        acc.box((0.0, y_p, z_plinth + 3 * fh + 0.25), (10.6, 5.4, 0.45), PAL["cream_trim"])
        for cx in (-4.2, -1.6, 1.6, 4.2):
            acc.cyl((cx, y_p - 2.0, z_plinth + 1.5 * fh), 0.42, 0.36, 3 * fh, PAL["cream_trim"], segs=10 if lod == 0 else 6)
            acc.box((cx, y_p - 2.0, z_plinth + 0.20), (1.0, 1.0, 0.40), PAL["ochre"])
        add_steps(acc, 0.0, y_p - 2.4, 0.0, z_plinth, 8.6, 2.0, 4, PAL["concrete"], lod)
        # Main arched entrance portal
        acc.box((0.0, y_p + 2.6, z_plinth + 1.6), (3.4, 0.22, 3.2), PAL["teak_brown"])
        # Triangular portico pediment crest
        acc.pitched_roof(-5.4, 5.4, y_p - 2.7, y_p + 2.7, z_plinth + 3 * fh + 0.45, 2.3, PAL["tile_red"], PAL["cream_trim"], hip=False)
        if lod == 0:
            acc.cyl((0.0, y_p - 2.75, z_plinth + 3 * fh + 1.25), 0.55, 0.55, 0.14, PAL["ochre"], segs=12, rot_x=math.pi * 0.5)
            # Flagstaff
            acc.cyl((0.0, y_p - 2.6, z_plinth + 3 * fh + 4.0), 0.05, 0.04, 3.2, PAL["steel_light"], segs=6)

        # Side wing windows & rear facade
        if lod == 0:
            for fi in range(floors):
                fz = z_plinth + fi * fh + 1.65
                for sx in (-1, 1):
                    add_side_ribbon_windows(acc, sx * 0.5 * bw, cy_b + 3.0, fz, 22.0, 1.4, float(sx), PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], 5, lod, chajja=True)
                add_wall_ribbon_windows(acc, 0.0, cy_b + 3.0 + 0.5 * (bd - 6.0), fz, 24.0, 1.4, +1.0, PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], 6, lod, chajja=False)
        else:
            for sx in (-1, 1):
                acc.box((sx * (0.5 * bw + 0.04), cy_b + 3.0, 0.5 * (z_plinth + z_top)), (0.10, 22.0, z_top - z_plinth - 2.0), PAL["glass_blue"])

        add_parapet_with_jaali(acc, bw, bd - 6.0, z_top, 0.85, PAL["cream"], PAL["cream_trim"], PAL["ochre"], pediment=True, lod=lod)
        add_compound_perimeter(acc, w, d, 11.0, PAL["cream"], PAL["ochre"], lod, wall_h=1.5)
        if lod == 0:
            add_potted_row(acc, (-6.2, 6.2), -29.2, 0.0, lod)

    cols = [
        ("COL_Main", (0.0, cy_b, 0.5 * z_top), (bw, bd, z_top)),
        ("COL_Compound", (0.0, -29.75, 0.8), (w, 0.6, 1.6)),
    ]
    return acc, cols


def build_B21_factory(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """40x60m, 2F: Corrugated steel-blue/grey gabled hall, clerestory ribbon windows, tall rolling door, compound wall & twin chimneys."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 40.0, 60.0
    hw, hd = 16.0, 22.0
    cy_b = 1.0  # [-21, +23]
    z_eaves = 8.6
    ridge_h = 3.4

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_eaves), (2 * hw, 2 * hd, z_eaves), PAL["steel_blue"])
        acc.pitched_roof(-hw, hw, cy_b - hd, cy_b + hd, z_eaves, ridge_h, PAL["steel_light"], PAL["steel_blue"])
        for cx in (-11.0, 11.0):
            add_chimney_stack(acc, cx, cy_b + hd + 3.2, 0.0, 17.2, 1.25, 0.78, lod)
    else:
        # Concrete floor slab & masonry dado base
        acc.box((0.0, cy_b, 0.25), (2 * hw + 0.6, 2 * hd + 0.6, 0.50), PAL["plinth"])
        acc.box((0.0, cy_b, 1.45), (2 * hw, 2 * hd, 2.40), PAL["concrete"])
        acc.box((0.0, cy_b, 5.60), (2 * hw - 0.1, 2 * hd - 0.1, 6.00), PAL["steel_blue"])
        # Corrugated vertical pilasters along side walls
        if lod == 0:
            for yi in range(-18, 22, 6):
                for sx in (-1, 1):
                    acc.box((sx * hw, cy_b + yi, 4.4), (0.36, 0.42, 8.4), PAL["slate"])
        # Clerestory ribbon windows along sides
        for sx in (-1, 1):
            add_side_ribbon_windows(acc, sx * hw, cy_b, 7.1, 36.0, 1.25, float(sx), PAL["slate"], PAL["glass_aqua"], PAL["steel_light"], 8, lod, chajja=False)
        # Tall front rolling bay door + side personnel door
        y_f = cy_b - hd
        add_rolling_shutter_bay(acc, -3.5, y_f, 0.45, 7.2, 5.6, -1.0, PAL["shutter"], PAL["slate"], lod, open_frac=0.20)
        acc.box((6.5, y_f - 0.05, 1.55), (2.2, 0.14, 2.4), PAL["teak_green"])
        acc.box((6.5, y_f - 0.65, 3.00), (3.2, 1.2, 0.12), PAL["steel_light"], rot_x=-0.18)
        # Factory gable roof + raised monitor ridge vent
        acc.pitched_roof(-hw - 0.5, hw + 0.5, y_f - 0.5, cy_b + hd + 0.5, z_eaves, ridge_h, PAL["steel_light"], PAL["steel_blue"])
        acc.box((0.0, cy_b, z_eaves + ridge_h + 0.35), (4.2, 34.0, 0.85), PAL["slate"])
        acc.pitched_roof(-2.4, 2.4, cy_b - 17.5, cy_b + 17.5, z_eaves + ridge_h + 0.78, 0.75, PAL["steel_blue"], PAL["slate"])

        # Twin tall red-and-white banded smokestack chimneys!
        for cx in (-10.5, 10.5):
            add_chimney_stack(acc, cx, cy_b + hd + 3.2, 0.0, 17.4, 1.28, 0.80, lod)
            # Horizontal flue duct into factory rear
            acc.cyl((cx, cy_b + hd + 1.4, 3.2), 0.75, 0.75, 3.0, PAL["slate"], segs=8, rot_x=math.pi * 0.5)

        # Guardhouse at front-right corner + compound perimeter wall
        acc.box((15.5, -25.8, 1.5), (3.6, 3.2, 3.0), PAL["cream"])
        acc.box((15.5, -25.8, 3.1), (4.0, 3.6, 0.24), PAL["terracotta"])
        add_compound_perimeter(acc, w, d, 10.0, PAL["concrete"], PAL["steel_blue"], lod, wall_h=1.8)

    cols = [
        ("COL_Main", (0.0, cy_b, 0.5 * (z_eaves + ridge_h)), (2 * hw, 2 * hd, z_eaves + ridge_h)),
        ("COL_Compound", (0.0, -29.75, 0.95), (w, 0.6, 1.9)),
    ]
    return acc, cols


def build_B22_warehouse(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """30x50m, 1F: Tall metal-clad pitched warehouse, 2 recessed loading bay shutters, dock rain canopy & pallet crate stacks."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 30.0, 50.0
    bw, bd = 24.0, 38.0
    cy_b = 3.0  # [-16, +22], front truck apron [-25, -16]
    z_dock = 1.1
    z_eaves = 8.4
    ridge_h = 3.0

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_eaves), (bw, bd, z_eaves), PAL["steel_light"])
        acc.pitched_roof(-0.5 * bw, 0.5 * bw, cy_b - 0.5 * bd, cy_b + 0.5 * bd, z_eaves, ridge_h, PAL["steel_blue"], PAL["steel_light"])
        acc.box((0.0, cy_b - 0.5 * bd - 2.2, 5.4), (16.0, 4.4, 0.5), PAL["slate"])
    else:
        # Raised concrete loading dock platform
        acc.box((0.0, cy_b - 1.2, 0.5 * z_dock), (bw + 0.8, bd + 3.0, z_dock), PAL["plinth"])
        acc.box((0.0, -20.5, 0.08), (28.0, 9.0, 0.16), PAL["pavement"])
        # Main metal-clad shell
        acc.box((0.0, cy_b, 0.5 * (z_dock + z_eaves)), (bw, bd, z_eaves - z_dock), PAL["steel_light"])
        acc.box((0.0, cy_b, z_dock + 1.1), (bw + 0.08, bd + 0.08, 2.2), PAL["concrete"])
        acc.pitched_roof(-0.5 * bw - 0.5, 0.5 * bw + 0.5, cy_b - 0.5 * bd - 0.5, cy_b + 0.5 * bd + 0.5, z_eaves, ridge_h, PAL["steel_blue"], PAL["steel_light"])

        # 2 deep recessed loading bay rolling shutters on front dock (-Y)
        y_f = cy_b - 0.5 * bd
        for bx in (-5.2, 5.2):
            add_rolling_shutter_bay(acc, bx, y_f, z_dock, 5.4, 4.2, -1.0, PAL["shutter"], PAL["slate"], lod, open_frac=0.35)
            # Rubber dock bumpers
            if lod == 0:
                for sx in (-2.2, 2.2):
                    acc.box((bx + sx, y_f - 1.65, z_dock - 0.18), (0.36, 0.25, 0.55), PAL["charcoal"])
        # Cantilevered dock rain canopy
        acc.box((0.0, y_f - 2.3, 5.95), (17.5, 4.6, 0.24), PAL["steel_blue"], rot_x=0.14)
        acc.box((0.0, y_f - 4.55, 5.60), (17.6, 0.20, 0.34), PAL["sign_yellow"])
        if lod == 0:
            for tx in (-7.2, 0.0, 7.2):
                acc.cyl((tx, y_f - 1.8, 6.9), 0.05, 0.05, 4.2, PAL["slate"], segs=6, rot_x=0.95)
            # Roof turbine vents
            for vy in (-10.0, 0.0, 10.0, 18.0):
                acc.cyl((0.0, cy_b + vy, z_eaves + ridge_h + 0.4), 0.48, 0.36, 0.72, PAL["steel_light"], segs=8)

        # Pallet crate stacks beside dock (front-left & front-right dock apron)
        crate_specs = [
            (-10.2, y_f - 1.0, z_dock, 2.2, 1.8, 1.5, PAL["ochre"]),
            (-10.0, y_f - 1.0, z_dock + 1.5, 1.6, 1.4, 1.1, PAL["terracotta"]),
            (10.6, y_f - 1.0, z_dock, 2.0, 2.0, 1.4, PAL["steel_blue"]),
            (-11.8, y_f - 4.2, 0.16, 2.4, 2.0, 1.3, PAL["teak_brown"]),
        ]
        for cx, cy, cz, sx, sy, sz, col in crate_specs:
            acc.box((cx, cy, cz + 0.10), (sx + 0.1, sy + 0.1, 0.18), PAL["teak_brown"])
            acc.box((cx, cy, cz + 0.18 + 0.5 * sz), (sx, sy, sz), col)
        if lod == 0:
            # Side ribbed cladding panels & louvers
            for yi in range(-12, 20, 6):
                for sx in (-1, 1):
                    acc.box((sx * 0.5 * bw, cy_b + yi, 4.6), (0.24, 0.30, 7.2), PAL["slate"])
            add_side_ribbon_windows(acc, -0.5 * bw, cy_b, 7.0, 28.0, 0.9, -1.0, PAL["slate"], PAL["glass_blue"], PAL["steel_light"], 6, lod, chajja=False)
            add_side_ribbon_windows(acc, +0.5 * bw, cy_b, 7.0, 28.0, 0.9, +1.0, PAL["slate"], PAL["glass_blue"], PAL["steel_light"], 6, lod, chajja=False)

    cols = [("COL_Main", (0.0, cy_b, 0.5 * (z_eaves + ridge_h)), (bw, bd, z_eaves + ridge_h))]
    return acc, cols


def build_B23_workshop(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """18x30m, 1F: Weathered cream/grey workshop, wide blue roll-up door, office window, clerestory vents & industrial signboard."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 30.0
    bw, bd = 15.0, 22.0
    cy_b = 1.5  # [-9.5, +12.5]
    z_eaves = 5.6
    ridge_h = 2.2

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_eaves), (bw, bd, z_eaves), PAL["cream_shade"])
        acc.pitched_roof(-0.5 * bw, 0.5 * bw, cy_b - 0.5 * bd, cy_b + 0.5 * bd, z_eaves, ridge_h, PAL["slate"], PAL["cream_shade"])
        acc.box((-1.5, cy_b - 0.5 * bd - 0.1, 2.2), (6.0, 0.4, 4.0), PAL["sign_blue"])
    else:
        acc.box((0.0, cy_b, 0.20), (bw + 0.4, bd + 0.4, 0.40), PAL["plinth"])
        acc.box((0.0, cy_b, 0.4 + 0.5 * (z_eaves - 0.4)), (bw, bd, z_eaves - 0.4), PAL["cream_shade"])
        acc.box((0.0, cy_b, 1.15), (bw + 0.08, bd + 0.08, 1.50), PAL["concrete"])
        acc.pitched_roof(-0.5 * bw - 0.45, 0.5 * bw + 0.45, cy_b - 0.5 * bd - 0.45, cy_b + 0.5 * bd + 0.45, z_eaves, ridge_h, PAL["slate"], PAL["cream_shade"])

        y_f = cy_b - 0.5 * bd
        # Wide central/left blue roll-up bay door
        add_rolling_shutter_bay(acc, -1.8, y_f, 0.40, 5.6, 3.8, -1.0, PAL["sign_blue"], PAL["concrete"], lod, rib_col=PAL["steel_blue"], open_frac=0.15)
        # Side office door + barred office window
        acc.box((4.4, y_f - 0.04, 1.5), (1.3, 0.10, 2.2), PAL["teak_brown"])
        add_window(acc, 5.9, y_f, 1.85, 1.6, 1.2, (0.0, -1.0), PAL["slate"], PAL["glass_blue"], PAL["concrete"], True, True, lod=lod)
        # Clerestory vents along front & sides
        add_wall_ribbon_windows(acc, 0.0, y_f, 4.95, 12.2, 0.65, -1.0, PAL["slate"], PAL["steel_light"], PAL["concrete"], 5, lod, chajja=False)
        for sx in (-1, 1):
            add_side_ribbon_windows(acc, sx * 0.5 * bw, cy_b, 4.90, 17.0, 0.70, float(sx), PAL["slate"], PAL["steel_light"], PAL["concrete"], 6, lod, chajja=False)
        # Industrial signboard fascia above door
        acc.box((0.0, y_f - 0.16, 5.55), (11.5, 0.22, 0.85), PAL["sign_blue"])
        acc.box((0.0, y_f - 0.28, 5.55), (9.8, 0.04, 0.42), PAL["sign_yellow"])
        if lod == 0:
            # Outdoor air compressor / steel bar rack at side yard
            acc.cyl((6.0, y_f - 2.0, 0.85), 0.40, 0.40, 1.4, PAL["terracotta"], segs=8, rot_y=math.pi * 0.5)
            acc.box((-6.4, -12.0, 1.2), (2.2, 1.2, 2.0), PAL["steel_blue"])
        add_compound_perimeter(acc, w, d, 8.0, PAL["concrete"], PAL["slate"], lod, wall_h=1.2)

    cols = [("COL_Main", (0.0, cy_b, 0.5 * (z_eaves + ridge_h)), (bw, bd, z_eaves + ridge_h))]
    return acc, cols


def build_B24_substation(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """25x40m, 1F: Perimeter masonry wall + gate + control house + lattice steel HV gantry frames, busbars, insulators & radiator transformers."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 25.0, 40.0

    if lod == 2:
        acc.box((0.0, 0.0, 0.75), (w, d, 1.5), PAL["concrete"])
        acc.box((-5.5, -11.5, 2.3), (10.0, 11.0, 4.6), PAL["cream"])
        # Gantry + transformer massing
        acc.box((0.0, 6.0, 4.8), (16.0, 1.2, 7.6), PAL["steel_light"])
        for tx in (-4.5, 4.5):
            acc.box((tx, 12.0, 2.0), (4.2, 4.2, 4.0), PAL["slate"])
    else:
        # Gravel switchyard pad + concrete equipment plinths
        acc.box((0.0, 0.0, 0.10), (w - 0.6, d - 0.6, 0.20), PAL["pavement"])
        acc.box((0.0, 7.5, 0.18), (20.0, 21.0, 0.32), PAL["slate"])

        # Control house block (front-left)
        ch_x, ch_y = -5.8, -11.5
        acc.box((ch_x, ch_y, 2.3), (10.0, 11.0, 4.4), PAL["cream"])
        acc.box((ch_x, ch_y, 4.65), (10.5, 11.5, 0.35), PAL["concrete"])
        acc.box((ch_x, ch_y, 5.15), (10.2, 11.2, 0.65), PAL["cream_shade"])
        acc.box((ch_x, ch_y - 5.55, 1.5), (2.2, 0.12, 2.5), PAL["steel_blue"])
        add_window(acc, ch_x + 2.6, ch_y - 5.5, 2.2, 1.8, 1.2, (0.0, -1.0), PAL["slate"], PAL["glass_blue"], PAL["concrete"], True, True, lod=lod)
        acc.box((ch_x, ch_y - 5.6, 3.85), (5.8, 0.14, 0.60), PAL["sign_yellow"])

        # Sculpted outdoor lattice steel HV gantry frames (2 rows at Y=2.0 and Y=9.5)
        for gy in (1.5, 9.0):
            for gx in (-7.0, 0.0, 7.0):
                # Tower legs
                acc.box((gx, gy, 4.2), (0.65, 0.65, 8.0), PAL["steel_light"])
                # Lightning spike at top
                acc.cyl((gx, gy, 8.8), 0.08, 0.02, 1.3, PAL["steel_light"], segs=6)
                if lod == 0:
                    # Cross-brace ribs on gantry columns
                    for bz in (1.8, 3.6, 5.4, 7.2):
                        acc.box((gx, gy, bz), (0.80, 0.80, 0.14), PAL["slate"])
            # Overhead horizontal lattice crossbeam
            acc.box((0.0, gy, 6.4), (15.0, 0.60, 0.55), PAL["steel_light"])
            acc.box((0.0, gy, 7.4), (14.8, 0.45, 0.35), PAL["steel_light"])

        # Overhead busbars & vertical porcelain insulators between gantries
        for bx in (-4.8, -2.4, 0.0, 2.4, 4.8):
            acc.cyl((bx, 5.25, 6.95), 0.06, 0.06, 8.2, PAL["steel_light"], segs=6, rot_x=math.pi * 0.5)
            for gy in (1.5, 9.0):
                acc.cyl((bx, gy, 6.05), 0.14, 0.14, 0.70, PAL["white"], segs=8 if lod == 0 else 6)
                if lod == 0:
                    for iz in (5.85, 6.05, 6.25):
                        acc.cyl((bx, gy, iz), 0.22, 0.22, 0.06, PAL["terracotta"], segs=8)

        # Cylindrical radiator-finned transformer banks at rear (Y = 14.5)
        for tx in (-5.5, 0.0, 5.5):
            ty = 14.2
            acc.box((tx, ty, 0.35), (3.8, 3.6, 0.50), PAL["concrete"])
            # Main cylindrical tank + radiator fins
            acc.cyl((tx, ty, 1.75), 0.95, 0.95, 2.4, PAL["slate"], segs=10 if lod == 0 else 6)
            # Conservator drum above
            acc.cyl((tx, ty + 0.5, 3.35), 0.38, 0.38, 1.8, PAL["steel_light"], segs=8, rot_y=math.pi * 0.5)
            # HV bushings
            for bx_o in (-0.55, 0.0, 0.55):
                acc.cyl((tx + bx_o, ty - 0.4, 3.30), 0.11, 0.07, 0.95, PAL["terracotta"], segs=6)
            if lod == 0:
                for fx in (-1.25, 1.25):
                    for fy_o in (-0.6, 0.0, 0.6):
                        acc.box((tx + fx, ty + fy_o, 1.75), (0.55, 0.14, 1.9), PAL["steel_blue"])

        add_compound_perimeter(acc, w, d, 7.0, PAL["concrete"], PAL["sign_yellow"], lod, wall_h=1.9)

    cols = [
        ("COL_Main", (0.0, 0.0, 4.0), (w - 1.0, d - 1.0, 8.0)),
        ("COL_Compound", (0.0, -19.75, 1.0), (w, 0.6, 2.0)),
    ]
    return acc, cols


def build_B25_water_tower(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """20x20m, 3F: Iconic Chennai circular elevated tank on 8 columns braced by 2 ring tie-beams, catwalk, central shaft, blue drum & pump house."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 20.0, 20.0
    r_cols = 4.9
    r_tank = 5.9
    z_catwalk = 12.2
    z_drum_bot = 12.4
    z_drum_top = 17.5
    segs = 20 if lod == 0 else (12 if lod == 1 else 8)

    if lod == 2:
        acc.cyl((0.0, 0.0, 6.2), 4.6, 4.6, 12.4, PAL["concrete"], segs=8)
        acc.cyl((0.0, 0.0, 15.0), r_tank, r_tank, 5.2, PAL["sky_blue"], segs=8)
        acc.cyl((0.0, 0.0, 18.2), r_tank, 0.6, 1.4, PAL["white_shade"], segs=8)
    else:
        acc.box((0.0, 0.0, 0.18), (16.5, 16.5, 0.36), PAL["pavement"])
        # Central pipe riser shaft + concrete footing
        acc.cyl((0.0, 0.0, 6.2), 1.05, 0.95, 12.4, PAL["concrete"], segs=10 if lod == 0 else 8)
        acc.cyl((0.45, -1.1, 6.1), 0.24, 0.24, 12.2, PAL["steel_blue"], segs=8)

        # 8 perimeter concrete columns braced by 2 horizontal ring tie-beams
        n_col = 8
        pts = [(r_cols * math.cos(2 * math.pi * i / n_col), r_cols * math.sin(2 * math.pi * i / n_col)) for i in range(n_col)]
        for px, py in pts:
            acc.box((px, py, 0.45), (1.05, 1.05, 0.90), PAL["plinth"])
            acc.cyl((px, py, 6.2), 0.42, 0.40, 12.0, PAL["concrete"], segs=8 if lod == 0 else 6)
        for z_ring in (4.2, 8.2):
            for i in range(n_col):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % n_col]
                mx, my = 0.5 * (x0 + x1), 0.5 * (y0 + y1)
                span = math.hypot(x1 - x0, y1 - y0)
                ang = math.atan2(y1 - y0, x1 - x0)
                acc.box((mx, my, z_ring), (span + 0.2, 0.46, 0.56), PAL["concrete"], rot_z=ang)
                # Radial tie-beam to central shaft
                acc.box((0.5 * x0, 0.5 * y0, z_ring), (r_cols, 0.34, 0.42), PAL["concrete"], rot_z=math.atan2(y0, x0))

        # Circular inspection catwalk slab + handrail
        acc.cyl((0.0, 0.0, z_catwalk), r_tank + 0.95, r_tank + 0.95, 0.34, PAL["concrete"], segs=segs)
        if lod == 0:
            for i in range(16):
                a = 2 * math.pi * i / 16
                rx, ry = (r_tank + 0.80) * math.cos(a), (r_tank + 0.80) * math.sin(a)
                acc.cyl((rx, ry, z_catwalk + 0.62), 0.04, 0.04, 0.95, PAL["iron"], segs=6)
                nx, ny = (r_tank + 0.80) * math.cos(2 * math.pi * ((i + 1) % 16) / 16), (r_tank + 0.80) * math.sin(2 * math.pi * ((i + 1) % 16) / 16)
                acc.box((0.5 * (rx + nx), 0.5 * (ry + ny), z_catwalk + 1.05), (math.hypot(nx - rx, ny - ry) + 0.06, 0.05, 0.05), PAL["iron"], rot_z=math.atan2(ny - ry, nx - rx))

        # Large blue-banded overhead drum + conical dome roof
        drum_h = z_drum_top - z_drum_bot
        acc.cyl((0.0, 0.0, z_drum_bot + 0.5 * drum_h), r_tank, r_tank, drum_h, PAL["white_shade"], segs=segs)
        acc.cyl((0.0, 0.0, z_drum_bot + 0.5 * drum_h), r_tank + 0.05, r_tank + 0.05, 1.45, PAL["sky_blue"], segs=segs)
        acc.cyl((0.0, 0.0, z_drum_top - 0.35), r_tank + 0.08, r_tank + 0.08, 0.55, PAL["sign_blue"], segs=segs)
        acc.cyl((0.0, 0.0, z_drum_top + 0.65), r_tank + 0.15, 0.9, 1.30, PAL["white"], segs=segs)
        acc.cyl((0.0, 0.0, z_drum_top + 1.45), 0.55, 0.55, 0.50, PAL["sign_blue"], segs=8)

        # Small ground pump house at front-right
        acc.box((5.6, -5.8, 1.65), (4.6, 4.4, 3.0), PAL["cream"])
        acc.box((5.6, -5.8, 3.25), (5.0, 4.8, 0.24), PAL["terracotta"])
        acc.box((5.6, -8.02, 1.35), (1.4, 0.10, 2.2), PAL["sign_blue"])
        add_compound_perimeter(acc, w, d, 5.5, PAL["cream_shade"], PAL["sky_blue"], lod, wall_h=1.3)

    cols = [("COL_Main", (0.0, 0.0, 9.4), (2 * r_tank + 1.4, 2 * r_tank + 1.4, 18.8))]
    return acc, cols


def build_B26_govt_office(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """30x45m, 3F: Salmon-pink & cream Indo-classical public office, colonnaded portico, pediment crest, arched windows & compound pillars."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 30.0, 45.0
    bw, bd = 24.0, 32.0
    cy_b = 2.0  # [-14, +18]
    fh = 3.2
    floors = 3
    z_plinth = 0.6
    z_top = z_plinth + floors * fh  # 10.2m

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_top), (bw, bd, z_top), PAL["salmon"])
        acc.box((0.0, -16.5, 5.2), (10.4, 5.2, 10.4), PAL["cream_trim"])
        acc.pitched_roof(-5.5, 5.5, -19.2, -13.8, 10.4, 2.2, PAL["tile_red"], PAL["cream_trim"])
    else:
        acc.box((0.0, cy_b, 0.30), (bw + 0.8, bd + 0.8, 0.60), PAL["red_brick"])
        acc.box((0.0, cy_b, 0.5 * (z_plinth + z_top)), (bw, bd, z_top - z_plinth), PAL["salmon"])
        # Corner quoins & floor cornice bands
        for fi in range(1, floors):
            acc.box((0.0, cy_b, z_plinth + fi * fh), (bw + 0.24, bd + 0.24, 0.20), PAL["cream_trim"])
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.box((sx * (0.5 * bw - 0.3), cy_b + sy * (0.5 * bd - 0.3), 0.5 * (z_plinth + z_top)), (0.9, 0.9, z_top - z_plinth), PAL["cream_trim"])

        # Symmetrical tall arched windows across 3 floors
        y_f = cy_b - 0.5 * bd
        for fi in range(floors):
            cz = z_plinth + fi * fh + 1.65
            for wx in (-9.2, -6.4, 6.4, 9.2):
                add_window(acc, wx, y_f, cz, 1.5, 1.85, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], lod == 0, lod == 0 and fi == 0, arched=(lod == 0), lod=lod)
                if lod == 0:
                    add_window(acc, wx, cy_b + 0.5 * bd, cz, 1.5, 1.85, (0.0, +1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], False, False, arched=False, lod=lod)
            if lod == 0:
                for wy in (-9.0, 0.0, 9.0):
                    for sx in (-1, 1):
                        add_window(acc, wy + cy_b, sx * 0.5 * bw, cz, 1.5, 1.85, (float(sx), 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], False, False, lod=lod)

        # Projecting colonnaded portico + triangular roof pediment crest
        y_port = y_f - 2.6
        acc.box((0.0, y_port, 0.5 * z_plinth), (10.6, 5.4, z_plinth), PAL["plinth"])
        acc.box((0.0, y_port, z_top + 0.22), (11.0, 5.6, 0.44), PAL["cream_trim"])
        for cx in (-4.4, -1.6, 1.6, 4.4):
            acc.cyl((cx, y_port - 2.1, z_plinth + 0.5 * (z_top - z_plinth)), 0.38, 0.32, z_top - z_plinth, PAL["cream_trim"], segs=10 if lod == 0 else 6)
        add_steps(acc, 0.0, y_port - 2.7, 0.0, z_plinth, 8.8, 1.8, 4, PAL["concrete"], lod)
        acc.box((0.0, y_f - 0.05, z_plinth + 1.7), (3.0, 0.16, 3.2), PAL["teak_brown"])
        acc.pitched_roof(-5.6, 5.6, y_port - 2.8, y_port + 2.8, z_top + 0.44, 2.3, PAL["tile_red"], PAL["cream_trim"])
        if lod == 0:
            acc.cyl((0.0, y_port - 2.85, z_top + 1.2), 0.50, 0.50, 0.12, PAL["gold"], segs=12, rot_x=math.pi * 0.5)
            acc.cyl((0.0, y_port - 2.6, z_top + 3.8), 0.05, 0.04, 2.8, PAL["steel_light"], segs=6)

        add_parapet_with_jaali(acc, bw, bd, z_top, 0.9, PAL["salmon"], PAL["cream_trim"], PAL["cream_shade"], False, lod)
        add_rooftop_props(acc, bw, bd, z_top + 0.15, lod)
        add_compound_fence(acc, w, -22.2, 22.0, PAL["salmon"], PAL["cream_trim"], modern_wood_gate=False, lod=lod)

    cols = [
        ("COL_Main", (0.0, cy_b, 0.5 * z_top), (bw, bd, z_top)),
        ("COL_Verandah", (0.0, -16.6, 5.1), (10.8, 5.4, 10.2)),
    ]
    return acc, cols


def build_B27_police_station(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """18x28m, 2F: Classic Chennai cream plaster + bold crimson upper parapet fascia, portico crest, blue station board & compound wall."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 18.0, 28.0
    bw, bd = 14.0, 18.0
    cy_b = 2.0  # [-7, +11]
    fh = 3.2
    z_plinth = 0.5
    z_top = z_plinth + 2 * fh  # 6.9m

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_top), (bw, bd, z_top), PAL["cream"])
        acc.box((0.0, cy_b, z_top + 0.55), (bw + 0.3, bd + 0.3, 1.1), PAL["crimson"])
        acc.box((0.0, -8.5, 2.4), (5.2, 3.0, 4.4), PAL["cream_trim"])
    else:
        acc.box((0.0, cy_b, 0.25), (bw + 0.5, bd + 0.5, 0.50), PAL["plinth"])
        acc.box((0.0, cy_b, 0.5 * (z_plinth + z_top)), (bw, bd, z_top - z_plinth), PAL["cream"])
        acc.box((0.0, cy_b, z_plinth + fh), (bw + 0.20, bd + 0.20, 0.18), PAL["crimson"])

        y_f = cy_b - 0.5 * bd  # -7.0
        for fi in range(2):
            cz = z_plinth + fi * fh + 1.65
            for wx in (-4.4, 4.4):
                add_window(acc, wx, y_f, cz, 1.6, 1.4, (0.0, -1.0), PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], True, lod == 0, lod=lod)
                add_window(acc, wx, cy_b + 0.5 * bd, cz, 1.6, 1.4, (0.0, +1.0), PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], False, False, lod=lod)
            for sx in (-1, 1):
                for wy in (-3.5, 3.5):
                    add_window(acc, cy_b + wy, sx * 0.5 * bw, cz, 1.5, 1.4, (float(sx), 0.0), PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], lod == 0, False, lod=lod)

        # Projecting central entry portico crest + blue generic station board fascia
        acc.box((0.0, y_f - 1.5, 0.5 * z_plinth), (5.6, 3.2, z_plinth), PAL["plinth"])
        acc.box((0.0, y_f - 1.5, z_plinth + fh + 0.25), (5.8, 3.2, 0.36), PAL["cream_trim"])
        for cx in (-2.3, 2.3):
            acc.box((cx, y_f - 2.7, z_plinth + 0.5 * fh), (0.48, 0.48, fh), PAL["cream_trim"])
        add_steps(acc, 0.0, y_f - 3.1, 0.0, z_plinth, 4.4, 1.2, 3, PAL["concrete"], lod)
        acc.box((0.0, y_f - 0.04, z_plinth + 1.3), (2.2, 0.14, 2.4), PAL["teak_brown"])
        # Blue generic station board fascia
        acc.box((0.0, y_f - 3.18, z_plinth + fh + 0.55), (4.8, 0.20, 0.80), PAL["sign_blue"])
        acc.box((0.0, y_f - 3.29, z_plinth + fh + 0.55), (3.8, 0.04, 0.38), PAL["white"])
        # Upper crimson parapet band + arched central crest
        add_parapet_with_jaali(acc, bw, bd, z_top, 1.0, PAL["crimson"], PAL["cream_trim"], PAL["red_dark"], pediment=True, lod=lod)
        add_rooftop_props(acc, bw, bd, z_top + 0.15, lod)
        if lod == 0:
            # Radio antenna mast on roof
            acc.cyl((-3.5, cy_b + 3.0, z_top + 2.4), 0.06, 0.03, 4.2, PAL["steel_light"], segs=6)
            add_potted_row(acc, (-3.1, 3.1), y_f - 2.9, 0.0, lod)
        add_compound_perimeter(acc, w, d, 6.2, PAL["cream"], PAL["crimson"], lod, wall_h=1.45)

    cols = [
        ("COL_Main", (0.0, cy_b, 0.5 * z_top), (bw, bd, z_top)),
        ("COL_Compound", (0.0, -13.75, 0.8), (w, 0.6, 1.6)),
    ]
    return acc, cols


def build_B28_fire_station(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """25x35m, 2F: Red-and-cream station with 3 tall fire-engine garage bays, upper crew rooms & corner hose-drying lookout tower."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 25.0, 35.0
    bw, bd = 21.0, 22.0
    cy_b = 2.0  # [-9, +13], front apron [-17.5, -9]
    z_eaves = 7.4
    tower_h = 14.2

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_eaves), (bw, bd, z_eaves), PAL["cream"])
        acc.box((0.0, cy_b, 2.2), (bw + 0.1, bd + 0.1, 4.4), PAL["crimson"])
        acc.box((8.2, cy_b + 7.5, 0.5 * tower_h), (4.2, 4.2, tower_h), PAL["crimson"])
        acc.pitched_roof(6.0, 10.4, cy_b + 5.3, cy_b + 9.7, tower_h, 1.4, PAL["tile_red"], PAL["cream"])
    else:
        acc.box((0.0, cy_b, 0.18), (bw + 0.5, bd + 0.5, 0.36), PAL["plinth"])
        acc.box((0.0, -13.2, 0.08), (23.0, 8.5, 0.16), PAL["pavement"])
        # Ground floor engine bay block (crimson) + upper crew floor (cream)
        acc.box((0.0, cy_b, 2.45), (bw, bd, 4.2), PAL["crimson"])
        acc.box((0.0, cy_b, 5.95), (bw, bd, 2.9), PAL["cream"])
        acc.box((0.0, cy_b, 4.55), (bw + 0.25, bd + 0.25, 0.24), PAL["cream_trim"])

        # 3 tall open arched/framed fire-engine garage bays on -Y
        y_f = cy_b - 0.5 * bd  # -9.0
        for bx in (-6.2, 0.0, 6.2):
            add_rolling_shutter_bay(acc, bx, y_f, 0.36, 4.2, 3.8, -1.0, PAL["shutter"], PAL["cream_trim"], lod, rib_col=PAL["crimson"], open_frac=0.68)
            if lod == 0:
                acc.arch_slab(bx, y_f - 0.05, 3.65, 0.24, 2.1, 8, PAL["cream_trim"])
        # Upper crew room windows & continuous observation balcony
        acc.box((0.0, y_f - 0.65, 4.62), (17.5, 1.3, 0.18), PAL["cream_trim"])
        acc.box((0.0, y_f - 1.24, 5.08), (17.5, 0.10, 0.84), PAL["crimson"])
        for wx in (-6.2, -2.1, 2.1, 6.2):
            add_window(acc, wx, y_f, 5.95, 1.8, 1.3, (0.0, -1.0), PAL["teak_brown"], PAL["glass_blue"], PAL["cream_trim"], True, False, lod=lod)
        # Generic station signboard fascia
        acc.box((0.0, y_f - 0.22, 7.65), (9.2, 0.20, 0.72), PAL["sign_red"])
        acc.box((0.0, y_f - 0.33, 7.65), (7.6, 0.04, 0.34), PAL["white"])

        add_parapet_with_jaali(acc, bw, bd, z_eaves, 0.8, PAL["crimson"], PAL["cream_trim"], PAL["red_dark"], False, lod)

        # Tall corner hose-drying lookout tower at rear-right
        tx, ty = 8.4, cy_b + 8.6
        acc.box((tx, ty, 0.5 * tower_h), (4.0, 4.0, tower_h), PAL["crimson"])
        acc.box((tx, ty, tower_h - 1.8), (4.5, 4.5, 0.28), PAL["cream_trim"])
        acc.box((tx, ty, tower_h - 1.1), (4.4, 4.4, 1.1), PAL["cream"])
        for fz_t in (6.5, 9.5, 12.9):
            acc.box((tx, ty - 2.04, fz_t), (1.2, 0.12, 1.4), PAL["glass_blue"])
        acc.pitched_roof(tx - 2.3, tx + 2.3, ty - 2.3, ty + 2.3, tower_h, 1.5, PAL["tile_red"], PAL["cream_trim"], hip=True)
        if lod == 0:
            acc.cyl((tx, ty, tower_h + 2.1), 0.12, 0.04, 1.5, PAL["steel_light"], segs=6)

    cols = [
        ("COL_Main", (0.0, cy_b, 0.5 * z_eaves), (bw, bd, z_eaves)),
        ("COL_Tower", (8.4, cy_b + 8.6, 0.5 * tower_h), (4.4, 4.4, tower_h)),
    ]
    return acc, cols


def build_B29_bus_depot(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """60x90m, 1F: Long-span vaulted/gabled open steel truss maintenance shed, side office wing & apron wheel stops."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 60.0, 90.0
    shed_w, shed_d = 36.0, 68.0
    z_eaves = 8.2
    rise_h = 3.8

    if lod == 2:
        acc.box((0.0, 2.0, 0.5 * z_eaves), (shed_w, shed_d, z_eaves), PAL["steel_blue"])
        acc.pitched_roof(-0.5 * shed_w, 0.5 * shed_w, 2.0 - 0.5 * shed_d, 2.0 + 0.5 * shed_d, z_eaves, rise_h, PAL["steel_light"], PAL["steel_blue"], barrel=True)
        acc.box((23.5, 0.0, 2.6), (9.0, 34.0, 5.2), PAL["cream"])
    else:
        acc.box((0.0, 0.0, 0.10), (w - 1.0, d - 1.0, 0.20), PAL["pavement"])
        # Shed centered at X=0? If shed_w=36 -> [-18, +18], office wing at X=+23 -> [18.5, 28.5] fits inside w=60 ([-30, +30])!
        # Let's center shed at X=-3 (`[-21, +15]`)? Or X=0 (`[-18, +18]`) and office wing at X=+23.5 (`[19.0, 28.0]`)! X=0 aligns with add_truss_arch_frame!
        for side in (-1, 1):
            cx_col = side * (0.5 * shed_w - 0.6)
            for py in range(-30, 36, 8):
                acc.box((cx_col, 2.0 + py, 1.3), (0.90, 0.90, 2.6), PAL["concrete"])
                acc.box((cx_col, 2.0 + py, 5.4), (0.62, 0.62, 5.8), PAL["steel_blue"])
            acc.box((cx_col, 2.0, 1.5), (0.35, shed_d, 2.6), PAL["concrete"])
            acc.box((cx_col, 2.0, 6.2), (0.28, shed_d, 3.6), PAL["steel_blue"])
        for ty in (range(-32, 37, 17) if lod == 0 else (-32, 2, 36)):
            add_truss_arch_frame(acc, 2.0 + ty, 0.5 * shed_w - 0.6, z_eaves, rise_h, PAL["steel_light"], segs=8, lod=lod)
        # Vaulted roof shell (open ends!)
        acc.pitched_roof(-0.5 * shed_w - 0.6, 0.5 * shed_w + 0.6, 2.0 - 0.5 * shed_d, 2.0 + 0.5 * shed_d, z_eaves, rise_h, PAL["steel_light"], PAL["steel_blue"], barrel=True)
        acc.box((0.0, 2.0, z_eaves + rise_h + 0.25), (3.6, shed_d - 2.0, 0.5), PAL["glass_aqua"])

        # Side office/dispatch wing (X = +23.5, Y in [-18, +18])
        ox, ow, od = 23.5, 9.0, 34.0
        acc.box((ox, 0.0, 2.6), (ow, od, 4.8), PAL["cream"])
        acc.box((ox, 0.0, 5.15), (ow + 0.4, od + 0.4, 0.30), PAL["sign_blue"])
        acc.box((ox, -17.1, 2.6), (ow + 0.2, 0.25, 4.8), PAL["cream_trim"])
        acc.box((ox, -17.25, 4.2), (7.0, 0.16, 0.65), PAL["sign_blue"])
        for wy in (-11.0, -3.5, 4.0, 11.5):
            add_window(acc, wy, ox - 0.5 * ow, 2.4, 2.4, 1.4, (-1.0, 0.0), PAL["slate"], PAL["glass_blue"], PAL["cream_trim"], True, False, lod=lod)

        # Apron concrete wheel stops in front & inside maintenance lanes
        for lane_x in (-11.0, -3.5, 3.5, 11.0):
            acc.box((lane_x, -38.5, 0.28), (2.4, 0.45, 0.36), PAL["sign_yellow"])
            acc.box((lane_x, 28.0, 0.28), (2.4, 0.45, 0.36), PAL["sign_yellow"])
        add_compound_perimeter(acc, w, d, 18.0, PAL["concrete"], PAL["sign_blue"], lod, wall_h=1.5)

    cols = [
        ("COL_Main", (0.0, 2.0, 0.5 * (z_eaves + rise_h)), (shed_w, shed_d, z_eaves + rise_h)),
        ("COL_Office", (23.5, 0.0, 2.6), (9.0, 34.0, 5.2)),
    ]
    return acc, cols


def build_B30_metro_station(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """35x50m, 2F: Elevated curved barrel-arch station canopy deck on concrete portal piers + street-level glazed escalator pavilion."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 35.0, 50.0
    deck_w, deck_d = 24.0, 44.0
    z_deck = 6.2
    z_eaves = 9.4
    rise_h = 3.2

    if lod == 2:
        acc.box((0.0, 2.0, z_deck), (deck_w, deck_d, 1.8), PAL["concrete"])
        acc.pitched_roof(-0.5 * deck_w, 0.5 * deck_w, 2.0 - 0.5 * deck_d, 2.0 + 0.5 * deck_d, z_eaves, rise_h, PAL["steel_light"], PAL["glass_aqua"], barrel=True)
        acc.box((0.0, -18.5, 2.5), (12.0, 9.0, 5.0), PAL["glass_aqua"])
    else:
        acc.box((0.0, 0.0, 0.10), (w - 1.0, d - 1.0, 0.20), PAL["pavement"])
        # Massive concrete portal piers supporting elevated deck
        for py in (-14.0, 0.0, 14.0):
            for sx in (-1, 1):
                acc.box((sx * 6.5, py, 3.0), (2.2, 2.4, 5.8), PAL["concrete"])
            acc.box((0.0, py, z_deck - 0.4), (deck_w - 2.0, 2.0, 1.3), PAL["concrete"])
        # Elevated platform deck & viaduct box girder extending north
        acc.box((0.0, 2.0, z_deck + 0.35), (deck_w, deck_d, 0.75), PAL["slate"])
        acc.box((0.0, 2.0, z_deck + 0.85), (deck_w + 0.4, deck_d + 0.4, 0.30), PAL["sign_blue"])
        # Side glass louver screens & arch ribs
        for sx in (-1, 1):
            acc.box((sx * 0.5 * deck_w, 2.0, z_deck + 2.1), (0.24, deck_d, 2.5), PAL["glass_aqua"])
        for ry in (range(-18, 24, 10) if lod == 0 else (-18, 2, 22)):
            add_truss_arch_frame(acc, ry, 0.5 * deck_w, z_eaves, rise_h, PAL["white"], segs=8, lod=lod)
        acc.pitched_roof(-0.5 * deck_w - 0.5, 0.5 * deck_w + 0.5, 2.0 - 0.5 * deck_d, 2.0 + 0.5 * deck_d, z_eaves, rise_h, PAL["steel_light"], PAL["glass_aqua"], barrel=True)

        # Street-level glazed escalator/stair entry pavilion (-Y)
        acc.box((0.0, -19.5, 2.6), (12.0, 8.5, 4.8), PAL["glass_aqua"])
        acc.box((0.0, -19.5, 5.15), (13.2, 9.8, 0.36), PAL["steel_light"])
        # Blue generic transit fascia strip & entry pylon
        acc.box((0.0, -24.0, 4.6), (13.4, 0.35, 0.95), PAL["sign_blue"])
        acc.box((0.0, -24.2, 4.6), (9.6, 0.05, 0.42), PAL["white"])
        add_steps(acc, 0.0, -23.8, 0.0, 0.45, 10.0, 1.6, 3, PAL["concrete"], lod)
        if lod == 0:
            # Diagonal escalator truss inside glass pavilion
            acc.box((-2.2, -16.0, 3.6), (1.8, 9.5, 0.6), PAL["steel_blue"], rot_x=0.45)
            acc.box((2.2, -16.0, 3.6), (1.8, 9.5, 0.6), PAL["steel_blue"], rot_x=0.45)
            for mx in (-4.0, 0.0, 4.0):
                acc.box((mx, -23.75, 2.6), (0.18, 0.18, 4.8), PAL["steel_light"])
            # Transit totem at curb
            acc.box((-8.2, -23.5, 2.4), (1.1, 0.4, 4.8), PAL["sign_blue"])
            acc.box((-8.2, -23.72, 3.8), (0.8, 0.04, 0.8), PAL["white"])

    cols = [
        ("COL_Main", (0.0, 2.0, 0.5 * (z_eaves + rise_h)), (deck_w, deck_d, z_eaves + rise_h)),
        ("COL_Verandah", (0.0, -19.5, 2.6), (13.2, 9.8, 5.2)),
    ]
    return acc, cols


def build_B46_metro_modern(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """40x95m, 2F: Extended modern arched metro concourse & platform shell on twin central viaduct piers + symmetrical glass street plazas."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 40.0, 95.0
    shell_w, shell_d = 22.0, 84.0
    z_deck = 6.4
    z_eaves = 9.4
    rise_h = 3.2

    if lod == 2:
        acc.box((0.0, 0.0, z_deck), (shell_w, shell_d, 1.8), PAL["concrete"])
        acc.pitched_roof(-0.5 * shell_w, 0.5 * shell_w, -0.5 * shell_d, 0.5 * shell_d, z_eaves, rise_h, PAL["steel_light"], PAL["glass_aqua"], barrel=True)
        for sx in (-1, 1):
            acc.box((sx * 14.5, 0.0, 2.6), (8.0, 14.0, 5.2), PAL["glass_aqua"])
    else:
        acc.box((0.0, 0.0, 0.10), (w - 1.0, d - 1.0, 0.20), PAL["pavement"])
        # Central viaduct piers + continuous longitudinal box girder
        acc.box((0.0, 0.0, z_deck - 0.65), (7.6, d - 2.0, 1.4), PAL["concrete"])
        for py in range(-36, 42, 18):
            acc.box((0.0, float(py), 2.9), (3.4, 3.0, 5.6), PAL["concrete"])
            # Twin flared hammerhead arms
            for sx in (-1, 1):
                acc.box((sx * 4.5, float(py), 5.3), (7.5, 2.2, 1.1), PAL["concrete"], rot_y=sx * 0.24)
        # Main elevated concourse/platform shell
        acc.box((0.0, 0.0, z_deck + 0.35), (shell_w, shell_d, 0.70), PAL["slate"])
        acc.box((0.0, 0.0, z_deck + 0.85), (shell_w + 0.4, shell_d + 0.4, 0.30), PAL["sign_blue"])
        for sx in (-1, 1):
            acc.box((sx * 0.5 * shell_w, 0.0, z_deck + 2.1), (0.24, shell_d, 2.4), PAL["glass_aqua"])
        for ry in (range(-38, 42, 19) if lod == 0 else (-38, 0, 38)):
            add_truss_arch_frame(acc, float(ry), 0.5 * shell_w, z_eaves, rise_h, PAL["white"], segs=8, lod=lod)
        acc.pitched_roof(-0.5 * shell_w - 0.5, 0.5 * shell_w + 0.5, -0.5 * shell_d, 0.5 * shell_d, z_eaves, rise_h, PAL["steel_light"], PAL["glass_aqua"], barrel=True)

        # Symmetrical glass-roofed street access plazas on East & West
        for sx in (-1, 1):
            px = sx * 14.8
            acc.box((px, 0.0, 2.5), (7.6, 14.0, 4.6), PAL["glass_aqua"])
            acc.box((px, 0.0, 5.0), (8.4, 15.2, 0.32), PAL["steel_light"])
            acc.box((px + sx * 4.2, 0.0, 4.4), (0.30, 12.0, 0.85), PAL["sign_blue"])
            # Skybridge connector to elevated concourse
            acc.box((sx * 10.5, 0.0, 4.8), (6.0, 5.0, 3.2), PAL["glass_aqua"])

    cols = [
        ("COL_Main", (0.0, 0.0, 0.5 * (z_eaves + rise_h)), (shell_w, shell_d, z_eaves + rise_h)),
        ("COL_Plazas", (0.0, 0.0, 2.6), (38.0, 15.2, 5.2)),
    ]
    return acc, cols


def build_B47_hospital_tower(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """45x75m, 8F: Tall 8F modern hospital complex, aqua glass center bay, white ribbon-window wings, covered ambulance bay & cross relief."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 45.0, 75.0
    pw, pd = 38.0, 58.0  # 2F podium
    tw, td = 34.0, 46.0  # 6F upper tower
    fh = 3.3
    z_pod = 0.5 + 2 * fh  # 7.1m
    z_top = 0.5 + 8 * fh  # 26.9m

    if lod == 2:
        acc.box((0.0, 2.0, 0.5 * z_pod), (pw, pd, z_pod), PAL["white_shade"])
        acc.box((0.0, 2.0, 0.5 * (z_pod + z_top)), (tw, td, z_top - z_pod), PAL["white"])
        acc.box((0.0, 2.0 - 0.5 * td - 0.2, 0.5 * z_top), (10.0, 0.6, z_top), PAL["glass_aqua"])
        acc.box((0.0, -30.0, 4.4), (12.0, 7.0, 0.8), PAL["crimson"])
    else:
        acc.box((0.0, 2.0, 0.25), (pw + 1.0, pd + 1.0, 0.50), PAL["plinth"])
        # 2F podium + 6F tower
        acc.box((0.0, 2.0, 0.5 * (0.5 + z_pod)), (pw, pd, z_pod - 0.5), PAL["white"])
        acc.box((0.0, 2.0, 0.5 * (z_pod + z_top)), (tw, td, z_top - z_pod), PAL["white"])
        # Aqua reflective glass center bay full height
        y_pod_f = 2.0 - 0.5 * pd  # -27.0
        y_tw_f = 2.0 - 0.5 * td   # -21.0
        acc.box((0.0, y_tw_f - 0.35, 0.5 * (0.5 + z_top + 1.2)), (11.0, 0.9, z_top + 0.7), PAL["teal_wall"])
        acc.box((0.0, y_tw_f - 0.72, 0.5 * (z_pod + z_top + 0.4)), (9.6, 0.16, z_top - z_pod + 0.4), PAL["glass_aqua"])
        if lod == 0:
            for mx in (-3.2, -1.1, 1.1, 3.2):
                acc.box((mx, y_tw_f - 0.78, 0.5 * (z_pod + z_top)), (0.16, 0.14, z_top - z_pod), PAL["white"])
        # White ribbon-window wings (efficient horizontal ribbons per floor!)
        for fi in range(8):
            fz = 0.5 + fi * fh
            cz = fz + 1.75
            cur_w = pw if fi < 2 else tw
            cur_d = pd if fi < 2 else td
            cur_yf = 2.0 - 0.5 * cur_d
            if fi >= 2:
                for sx in (-1, 1):
                    add_wall_ribbon_windows(acc, sx * 10.8, cur_yf, cz, 8.6, 1.45, -1.0, PAL["slate"], PAL["glass_blue"], PAL["white_shade"], 2 if lod == 0 else 0, lod, chajja=False)
                    if lod == 0:
                        add_wall_ribbon_windows(acc, sx * 10.8, 2.0 + 0.5 * cur_d, cz, 8.6, 1.45, +1.0, PAL["slate"], PAL["glass_blue"], PAL["white_shade"], 0, lod, chajja=False)
                        add_side_ribbon_windows(acc, sx * 0.5 * cur_w, 2.0, cz, cur_d - 6.0, 1.45, float(sx), PAL["slate"], PAL["glass_blue"], PAL["white_shade"], 4, lod, chajja=False)
            else:
                for sx in (-1, 1):
                    add_wall_ribbon_windows(acc, sx * 12.0, cur_yf, cz, 10.0, 1.6, -1.0, PAL["slate"], PAL["glass_aqua"], PAL["white_shade"], 2 if lod == 0 else 0, lod, chajja=False)
                    if lod == 0:
                        add_side_ribbon_windows(acc, sx * 0.5 * cur_w, 2.0, cz, cur_d - 8.0, 1.6, float(sx), PAL["slate"], PAL["glass_aqua"], PAL["white_shade"], 4, lod, chajja=False)

        # Covered ambulance emergency bay at podium front
        acc.box((0.0, y_pod_f - 3.6, 4.3), (12.0, 7.2, 0.55), PAL["white"])
        acc.box((0.0, y_pod_f - 3.6, 4.65), (12.2, 7.4, 0.36), PAL["crimson"])
        acc.box((0.0, y_pod_f - 7.25, 4.35), (6.4, 0.14, 0.36), PAL["sign_red"])
        for sx in (-5.0, 5.0):
            acc.cyl((sx, y_pod_f - 6.6, 2.15), 0.34, 0.34, 4.2, PAL["white_shade"], segs=8)
        acc.box((0.0, y_pod_f - 0.15, 2.0), (6.4, 0.25, 3.2), PAL["glass_aqua"])

        # Medical cross relief at tower crown
        add_medical_cross(acc, 0.0, y_tw_f - 0.85, z_top - 0.6, 2.8, -1.0, lod)
        add_parapet_with_jaali(acc, tw, td, z_top, 1.0, PAL["white"], PAL["white_shade"], PAL["concrete"], False, lod)
        # Rooftop helipad ring & chiller penthouse
        acc.cyl((0.0, -3.0, z_top + 0.22), 7.2, 7.2, 0.24, PAL["slate"], segs=16 if lod == 0 else 8)
        acc.box((-2.2, -3.0, z_top + 0.36), (0.6, 4.2, 0.06), PAL["sign_yellow"])
        acc.box((2.2, -3.0, z_top + 0.36), (0.6, 4.2, 0.06), PAL["sign_yellow"])
        acc.box((0.0, -3.0, z_top + 0.36), (4.4, 0.6, 0.06), PAL["sign_yellow"])
        acc.box((0.0, 14.0, z_top + 1.5), (10.0, 8.0, 2.8), PAL["white_shade"])
        add_compound_perimeter(acc, w, d, 14.0, PAL["white_shade"], PAL["crimson"], lod, wall_h=1.3)

    cols = [
        ("COL_Main", (0.0, 2.0, 0.5 * z_top), (tw, td, z_top)),
        ("COL_Podium", (0.0, 2.0, 0.5 * z_pod), (pw, pd, z_pod)),
    ]
    return acc, cols


def build_B49_bus_terminus(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """80x120m, 2F: Iconic twin sweeping vaulted wave roofs, rhythmic glass curtain front & multiple covered bus boarding platforms."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 80.0, 120.0
    conc_w, conc_d = 68.0, 34.0
    cy_c = -34.0  # front concourse Y in [-51, -17], bus bays behind [-15, +54]
    z_eaves = 7.6
    rise_h = 3.8

    if lod == 2:
        acc.box((0.0, cy_c, 0.5 * z_eaves), (conc_w, conc_d, z_eaves), PAL["concrete"])
        for sx in (-1, 1):
            acc.pitched_roof(sx * 17.0 - 16.5, sx * 17.0 + 16.5, cy_c - 0.5 * conc_d, cy_c + 0.5 * conc_d, z_eaves, rise_h, PAL["steel_light"], PAL["glass_aqua"], barrel=True)
            acc.box((sx * 20.0, 18.0, 4.8), (8.0, 56.0, 0.8), PAL["steel_blue"])
    else:
        acc.box((0.0, 0.0, 0.12), (w - 1.0, d - 1.0, 0.24), PAL["pavement"])
        # Main 2F concourse hall
        acc.box((0.0, cy_c, 0.5 * z_eaves), (conc_w, conc_d, z_eaves), PAL["cream"])
        # Rhythmic glass curtain front (-Y)
        y_f = cy_c - 0.5 * conc_d  # -51.0
        acc.box((0.0, y_f - 0.15, 4.0), (conc_w - 6.0, 0.25, 6.4), PAL["glass_aqua"])
        for mx in range(-30, 34, 6):
            acc.box((float(mx), y_f - 0.28, 3.8), (0.45, 0.45, 7.6), PAL["concrete"])
        # Central projecting departure canopy + blue transit fascia
        acc.box((0.0, y_f - 2.6, 5.2), (20.0, 5.2, 0.45), PAL["steel_light"])
        acc.box((0.0, y_f - 5.25, 5.35), (16.0, 0.22, 0.85), PAL["sign_blue"])
        add_steps(acc, 0.0, y_f - 5.0, 0.0, 0.45, 18.0, 1.8, 3, PAL["concrete"], lod)

        # Twin sweeping vaulted wave roofs spanning left & right halves!
        for sx in (-1, 1):
            x0, x1 = sx * 17.0 - 17.0, sx * 17.0 + 17.0
            acc.pitched_roof(x0, x1, y_f - 1.2, cy_c + 0.5 * conc_d + 1.2, z_eaves, rise_h, PAL["steel_light"], PAL["glass_aqua"], barrel=True)
            acc.box((sx * 17.0, y_f - 1.2, z_eaves + 0.2), (34.0, 0.35, 0.45), PAL["sign_blue"])

        # Multiple covered bus boarding island platforms extending north (Y = -12..+50)
        for px in (-22.0, 0.0, 22.0):
            acc.box((px, 19.0, 0.42), (6.4, 60.0, 0.60), PAL["concrete"])
            acc.box((px, 19.0, 0.74), (6.6, 60.2, 0.08), PAL["sign_yellow"])
            acc.box((px, 19.0, 4.9), (7.6, 61.0, 0.28), PAL["steel_blue"])
            acc.pitched_roof(px - 3.9, px + 3.9, -11.5, 49.5, 5.04, 1.1, PAL["steel_light"], PAL["steel_blue"])
            for py in range(-8, 50, 14):
                acc.cyl((px, float(py), 2.8), 0.32, 0.32, 4.4, PAL["concrete"], segs=8 if lod == 0 else 6)
                if lod == 0:
                    acc.box((px, float(py) + 4.5, 1.05), (1.4, 2.2, 0.55), PAL["sign_blue"])

    cols = [
        ("COL_Main", (0.0, cy_c, 0.5 * (z_eaves + rise_h)), (conc_w, conc_d, z_eaves + rise_h)),
        ("COL_Platforms", (0.0, 19.0, 3.1), (52.0, 61.0, 6.2)),
    ]
    return acc, cols


def build_B50_stadium_bowl(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """95x120m, 3F: Stepped concrete perimeter seating tiers, green turf pitch, cantilevered white tensile canopies & 4 floodlight masts."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 95.0, 120.0
    pitch_w, pitch_d = 52.0, 74.0
    mast_h = 28.5

    if lod == 2:
        acc.box((0.0, 0.0, 0.25), (pitch_w, pitch_d, 0.5), PAL["foliage"])
        for sx in (-1, 1):
            acc.box((sx * 36.0, 0.0, 6.0), (18.0, 96.0, 12.0), PAL["concrete"])
            acc.box((sx * 32.0, 0.0, 14.0), (16.0, 72.0, 0.8), PAL["white"])
        for sy in (-1, 1):
            acc.box((0.0, sy * 47.0, 5.0), (88.0, 18.0, 10.0), PAL["concrete"])
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.cyl((sx * 41.0, sy * 51.0, 0.5 * mast_h), 1.4, 0.7, mast_h, PAL["steel_light"], segs=6)
    else:
        # Green turf pitch + crisp pitch markings
        acc.box((0.0, 0.0, 0.15), (w - 2.0, d - 2.0, 0.30), PAL["pavement"])
        acc.box((0.0, 0.0, 0.35), (pitch_w, pitch_d, 0.16), PAL["foliage"])
        acc.box((0.0, 0.0, 0.44), (4.5, 22.0, 0.04), PAL["thatch"])
        acc.box((0.0, 0.0, 0.44), (pitch_w - 4.0, 0.4, 0.04), PAL["white"])

        # Stepped concrete perimeter seating tiers (3 tiers along East, West, North, South)
        tiers = [
            (0.0, 2.6, 5.2, PAL["concrete"], PAL["sign_blue"]),
            (4.8, 5.6, 4.8, PAL["concrete"], PAL["terracotta"]),
            (9.4, 8.8, 4.4, PAL["concrete"], PAL["sign_blue"]),
        ]
        for off, z_tier, step_w, wall_c, seat_c in tiers:
            # East & West grandstands
            for sx in (-1, 1):
                gx = sx * (0.5 * pitch_w + 0.5 * step_w + off)
                acc.box((gx, 0.0, 0.5 * z_tier), (step_w, pitch_d + 2 * off + 2 * step_w, z_tier), wall_c)
                acc.box((gx - sx * 0.4, 0.0, z_tier + 0.12), (step_w - 0.8, pitch_d + 2 * off + step_w, 0.24), seat_c)
            # North & South end bowls
            for sy in (-1, 1):
                gy = sy * (0.5 * pitch_d + 0.5 * step_w + off)
                acc.box((0.0, gy, 0.5 * z_tier), (pitch_w + 2 * off, step_w, z_tier), wall_c)
                acc.box((0.0, gy - sy * 0.4, z_tier + 0.12), (pitch_w + 2 * off - 0.8, step_w - 0.8, 0.24), seat_c)

        # Exterior concourse facade arches/columns
        if lod == 0:
            for sx in (-1, 1):
                for py in range(-48, 52, 12):
                    acc.box((sx * 43.2, float(py), 5.6), (1.4, 1.4, 11.2), PAL["cream_trim"])
            for sy in (-1, 1):
                for px in range(-32, 36, 12):
                    acc.box((float(px), sy * 54.0, 5.2), (1.4, 1.4, 10.4), PAL["cream_trim"])

        # Cantilevered white tensile fabric roof canopies on curved struts (East & West stands)
        for sx in (-1, 1):
            for ci in range(-3, 4):
                cy_seg = ci * 12.0
                acc.box((sx * 33.5, cy_seg, 14.5), (17.0, 11.2, 0.36), PAL["white"], rot_y=sx * 0.16)
                acc.box((sx * 41.0, cy_seg, 12.6), (1.0, 0.7, 5.2), PAL["steel_blue"])
                if lod == 0:
                    acc.box((sx * 34.5, cy_seg, 14.1), (15.5, 0.45, 0.55), PAL["steel_blue"], rot_y=sx * 0.16)

        # 4 tall steel floodlight masts at corners
        for sx in (-1, 1):
            for sy in (-1, 1):
                mx, my = sx * 41.5, sy * 51.5
                acc.box((mx, my, 1.2), (3.4, 3.4, 2.4), PAL["concrete"])
                acc.cyl((mx, my, 1.2 + 0.5 * mast_h), 1.15, 0.52, mast_h, PAL["steel_light"], segs=8 if lod == 0 else 6)
                # Angled floodlight head array aiming at pitch center
                ang_z = math.atan2(-my, -mx)
                acc.box((mx, my, mast_h + 1.5), (1.4, 5.2, 3.4), PAL["slate"], rot_y=0.35, rot_z=ang_z)
                acc.box((mx - sx * 0.5, my - sy * 0.5, mast_h + 1.3), (0.25, 4.6, 2.8), PAL["lit_warm"], rot_y=0.35, rot_z=ang_z)

    cols = [
        ("COL_Main", (0.0, 0.0, 6.0), (88.0, 110.0, 12.0)),
    ]
    return acc, cols


def build_K10_govt_school(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """16x38m, 2F: Warm ochre-yellow elongated 2F school corridor wing, colonnaded verandah, central pediment, green doors & assembly yard."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 16.0, 38.0
    bw, bd = 10.5, 30.0  # elongated block running along Y -> [-13, +17], front/assembly yard at -Y & -X
    cx_b, cy_b = 1.8, 2.0
    fh = 3.1
    z_plinth = 0.5
    z_top = z_plinth + 2 * fh  # 6.7m

    if lod == 2:
        acc.box((cx_b, cy_b, 0.5 * z_top), (bw, bd, z_top), PAL["ochre"])
        acc.box((cx_b - 0.5 * bw - 1.1, cy_b, 0.5 * z_top), (2.2, bd, z_top), PAL["cream_trim"])
        acc.box((-0.5, cy_b, z_top + 1.0), (3.0, 4.5, 1.8), PAL["ochre"])
    else:
        acc.box((0.0, 0.0, 0.08), (w - 0.4, d - 0.4, 0.16), PAL["pavement"])
        acc.box((cx_b, cy_b, 0.25), (bw + 0.6, bd + 0.6, 0.50), PAL["plinth"])
        acc.box((cx_b, cy_b, 0.5 * (z_plinth + z_top)), (bw, bd, z_top - z_plinth), PAL["ochre"])
        acc.box((cx_b, cy_b, z_plinth + fh), (bw + 0.2, bd + 0.2, 0.18), PAL["cream_trim"])
        x_ver = cx_b - 0.5 * bw - 1.2
        x_wall = cx_b - 0.5 * bw
        for fi in range(2):
            fz = z_plinth + fi * fh
            acc.box((x_ver, cy_b, fz - 0.05), (2.6, bd, 0.18), PAL["cream_trim"])
            if fi == 1:
                acc.box((x_ver - 1.18, cy_b, fz + 0.48), (0.16, bd - 0.4, 0.90), PAL["cream_trim"])
            for py in range(-12, 16, 4):
                acc.box((x_ver - 1.15, cy_b + py, fz + 0.5 * fh), (0.34, 0.34, fh - 0.1), PAL["cream_trim"])
            for py in (-10.0, -2.0, 6.0, 12.0):
                acc.box((x_wall - 0.04, cy_b + py, fz + 1.15), (0.10, 1.3, 2.2), PAL["teak_green"])
                add_window(acc, cy_b + py + 2.1, x_wall, fz + 1.6, 1.5, 1.3, (-1.0, 0.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], False, lod == 0, lod=lod)
        acc.box((x_ver, cy_b, z_top + 0.08), (2.8, bd + 0.4, 0.22), PAL["cream_trim"])
        # Central verandah pediment fascia facing assembly yard
        acc.box((x_ver - 1.15, cy_b, z_top + 0.85), (0.32, 5.4, 1.4), PAL["ochre"])
        acc.pitched_roof(x_ver - 1.35, x_ver - 0.95, cy_b - 2.7, cy_b + 2.7, z_top + 1.55, 1.0, PAL["terracotta"], PAL["cream_trim"])
        # Roof cornice + parapet around main block
        acc.box((cx_b, cy_b, z_top + 0.10), (bw + 0.4, bd + 0.4, 0.20), PAL["cream_trim"])
        acc.box((cx_b, cy_b, z_top + 0.52), (bw - 0.2, bd - 0.2, 0.65), PAL["ochre"])
        acc.box((cx_b, cy_b, z_top + 0.58), (bw - 0.8, bd - 0.8, 0.62), PAL["surkhi"])
        # Front -Y entrance & flagpole
        y_f = cy_b - 0.5 * bd
        acc.box((cx_b, y_f - 0.05, z_plinth + 1.2), (1.8, 0.14, 2.3), PAL["teak_green"])
        add_window(acc, cx_b, y_f, z_plinth + fh + 1.6, 2.4, 1.4, (0.0, -1.0), PAL["teak_green"], PAL["glass_blue"], PAL["cream_trim"], True, lod == 0, lod=lod)
        acc.box((-4.8, -14.5, 0.35), (1.4, 1.4, 0.7), PAL["cream_trim"])
        acc.cyl((-4.8, -14.5, 3.4), 0.06, 0.04, 5.6, PAL["steel_light"], segs=6)
        add_compound_perimeter(acc, w, d, 5.0, PAL["ochre"], PAL["cream_trim"], lod, wall_h=1.25)

    cols = [
        ("COL_Main", (cx_b - 0.6, cy_b, 0.5 * z_top), (bw + 2.4, bd, z_top)),
        ("COL_Compound", (0.0, -18.75, 0.7), (w, 0.6, 1.4)),
    ]
    return acc, cols


def build_N03_fish_market(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """22x34m, 1F: Open-front harbour auction hall, weathered teal steel columns, arched sea-blue parapet, vaulted roof & concrete stall tables."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 22.0, 34.0
    hw, hd = 9.5, 14.5
    z_eaves = 5.4
    rise_h = 2.8

    if lod == 2:
        acc.box((0.0, 0.0, 0.45), (2 * hw, 2 * hd, 0.90), PAL["concrete"])
        acc.pitched_roof(-hw, hw, -hd, hd, z_eaves, rise_h, PAL["steel_light"], PAL["sky_blue"], barrel=True)
        for sx in (-1, 1):
            acc.box((sx * (hw - 0.4), 0.0, 3.0), (0.8, 2 * hd, 5.2), PAL["teal_wall"])
    else:
        # Wet concrete floor plinth + side splash walls
        acc.box((0.0, 0.0, 0.25), (2 * hw + 0.8, 2 * hd + 0.8, 0.50), PAL["plinth"])
        acc.box((0.0, 0.0, 0.08), (w - 0.4, d - 0.4, 0.16), PAL["pavement"])
        # Weathered teal steel columns along East & West + rear gable wall
        for sx in (-1, 1):
            for py in range(-12, 16, 4):
                acc.box((sx * (hw - 0.4), float(py), 2.95), (0.48, 0.48, 4.9), PAL["teal_wall"])
            # Low concrete side splash wall
            acc.box((sx * (hw - 0.4), 0.0, 1.05), (0.30, 2 * hd - 1.0, 1.1), PAL["concrete"])
        acc.box((0.0, hd - 0.3, 2.95), (2 * hw - 0.6, 0.36, 4.9), PAL["concrete"])

        # Arched front parapet fascia in sea-blue + vaulted corrugated roof
        acc.box((0.0, -hd + 0.3, z_eaves + 0.3), (2 * hw + 0.6, 0.40, 1.0), PAL["sky_blue"])
        acc.arch_slab(0.0, -hd + 0.3, z_eaves + 0.6, 0.36, 5.6, 12 if lod == 0 else 6, PAL["sky_blue"])
        acc.box((0.0, -hd + 0.10, z_eaves + 0.95), (8.6, 0.18, 0.65), PAL["sign_blue"])
        acc.box((0.0, -hd + 0.00, z_eaves + 0.95), (6.8, 0.04, 0.30), PAL["white"])

        for ty in (range(-12, 16, 7) if lod == 0 else (-12, 0, 12)):
            add_truss_arch_frame(acc, float(ty), hw - 0.4, z_eaves, rise_h, PAL["teal_wall"], segs=8, lod=lod)
        acc.pitched_roof(-hw - 0.5, hw + 0.5, -hd - 0.4, hd + 0.4, z_eaves, rise_h, PAL["steel_light"], PAL["sky_blue"], barrel=True)

        # Concrete auction stall tables + blue fish crates inside open hall
        for sx in (-4.4, 0.0, 4.4):
            for sy in (-7.5, 0.0, 7.5):
                acc.box((sx, sy, 0.75), (2.6, 5.2, 0.52), PAL["concrete"])
                acc.box((sx, sy, 1.04), (2.7, 5.3, 0.10), PAL["white_shade"])
                if lod == 0:
                    acc.box((sx - 0.5, sy - 1.2, 1.24), (0.85, 0.65, 0.32), PAL["sign_blue"])
                    acc.box((sx + 0.6, sy + 1.0, 1.24), (0.85, 0.65, 0.32), PAL["terracotta"])

    cols = [("COL_Main", (0.0, 0.0, 0.5 * (z_eaves + rise_h)), (2 * hw, 2 * hd, z_eaves + rise_h))]
    return acc, cols


def build_N04_port_warehouse(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """32x55m, 2F: Deep harbour steel-blue ribbed transit shed, extra-tall container portal doors, clerestory monitor ridge & loading apron."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 32.0, 55.0
    bw, bd = 26.0, 44.0
    cy_b = 1.5  # [-20.5, +23.5]
    z_eaves = 8.8
    ridge_h = 2.6

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_eaves), (bw, bd, z_eaves), PAL["steel_blue"])
        acc.pitched_roof(-0.5 * bw, 0.5 * bw, cy_b - 0.5 * bd, cy_b + 0.5 * bd, z_eaves, ridge_h, PAL["slate"], PAL["steel_blue"])
        acc.box((0.0, cy_b, z_eaves + ridge_h + 0.5), (5.0, 38.0, 1.0), PAL["steel_light"])
    else:
        acc.box((0.0, 0.0, 0.12), (w - 0.8, d - 0.8, 0.24), PAL["pavement"])
        acc.box((0.0, cy_b, 0.30), (bw + 0.8, bd + 0.8, 0.60), PAL["plinth"])
        acc.box((0.0, cy_b, 1.80), (bw, bd, 2.40), PAL["concrete"])
        acc.box((0.0, cy_b, 5.90), (bw - 0.1, bd - 0.1, 5.80), PAL["steel_blue"])
        acc.pitched_roof(-0.5 * bw - 0.6, 0.5 * bw + 0.6, cy_b - 0.5 * bd - 0.6, cy_b + 0.5 * bd + 0.6, z_eaves, ridge_h, PAL["slate"], PAL["steel_blue"])

        # Continuous clerestory monitor ridge
        acc.box((0.0, cy_b, z_eaves + ridge_h + 0.40), (5.2, 38.0, 1.1), PAL["steel_light"])
        acc.box((0.0, cy_b, z_eaves + ridge_h + 0.45), (5.4, 36.0, 0.55), PAL["glass_aqua"])
        acc.pitched_roof(-3.0, 3.0, cy_b - 19.5, cy_b + 19.5, z_eaves + ridge_h + 0.95, 0.9, PAL["steel_blue"], PAL["slate"])

        # Extra-tall truck/container rolling portal doors on front (-Y) & side
        y_f = cy_b - 0.5 * bd
        for bx in (-6.2, 6.2):
            add_rolling_shutter_bay(acc, bx, y_f, 0.60, 5.8, 5.6, -1.0, PAL["shutter"], PAL["sign_yellow"], lod, open_frac=0.25)
        add_rolling_shutter_bay(acc, -6.0, cy_b + 0.5 * bd, 0.60, 5.8, 5.6, +1.0, PAL["shutter"], PAL["sign_yellow"], lod, open_frac=0.10)
        # Port dock canopy over front portals
        acc.box((0.0, y_f - 2.0, 6.8), (22.0, 4.0, 0.28), PAL["slate"], rot_x=0.12)
        if lod == 0:
            for sx in (-1, 1):
                for yi in range(-18, 22, 6):
                    acc.box((sx * 0.5 * bw, cy_b + yi, 4.7), (0.32, 0.38, 8.2), PAL["slate"])
                add_side_ribbon_windows(acc, sx * 0.5 * bw, cy_b, 7.2, 34.0, 1.0, float(sx), PAL["slate"], PAL["glass_aqua"], PAL["steel_light"], 6, lod, chajja=False)
            # Roof turbine ventilators
            for vy in (-12.0, 0.0, 12.0):
                acc.cyl((0.0, cy_b + vy, z_eaves + ridge_h + 2.1), 0.48, 0.36, 0.70, PAL["steel_light"], segs=8)
            # Dock bollards & harbour shipping container stacks beside loading apron
            for bx in (-10.2, -2.5, 2.5, 10.2):
                acc.cyl((bx, y_f - 1.2, 0.55), 0.14, 0.14, 1.1, PAL["sign_yellow"], segs=6)
            acc.box((-9.8, -24.2, 1.55), (6.0, 2.4, 2.6), PAL["terracotta"])
            acc.box((-9.8, -24.2, 4.15), (6.0, 2.4, 2.6), PAL["ochre"])
            acc.box((9.8, -24.2, 1.55), (6.0, 2.4, 2.6), PAL["sign_blue"])
            acc.box((9.8, -24.2, 4.15), (6.0, 2.4, 2.6), PAL["teak_green"])

    cols = [("COL_Main", (0.0, cy_b, 0.5 * (z_eaves + ridge_h)), (bw, bd, z_eaves + ridge_h))]
    return acc, cols


def build_B38_auditorium_hall(lod: int) -> Tuple[MeshAcc, ColliderList]:
    """40x50m, 2F: Classical cream stone-clad cultural auditorium, curved arched shell pediment, 4 monumental columns, granite steps & poster alcoves."""
    acc = MeshAcc(f"LOD{lod}")
    w, d = 40.0, 50.0
    bw, bd = 32.0, 38.0
    cy_b = 2.0  # [-17, +21]
    z_plinth = 0.8
    z_eaves = 9.2
    fly_h = 11.8

    if lod == 2:
        acc.box((0.0, cy_b, 0.5 * z_eaves), (bw, bd, z_eaves), PAL["cream"])
        acc.box((0.0, -19.5, 4.8), (16.0, 5.0, 9.6), PAL["cream_trim"])
        acc.arch_slab(0.0, -19.5, 9.6, 4.2, 6.4, 8, PAL["cream_trim"])
        acc.box((0.0, cy_b + 6.0, 0.5 * fly_h), (24.0, 18.0, fly_h), PAL["cream_shade"])
    else:
        acc.box((0.0, 0.0, 0.08), (w - 0.8, d - 0.8, 0.16), PAL["pavement"])
        acc.box((0.0, cy_b, 0.5 * z_plinth), (bw + 1.0, bd + 1.0, z_plinth), PAL["plinth"])
        acc.box((0.0, cy_b, 0.5 * (z_plinth + z_eaves)), (bw, bd, z_eaves - z_plinth), PAL["cream"])
        # Elevated auditorium fly-loft volume toward rear
        acc.box((0.0, cy_b + 7.5, 0.5 * (z_eaves + fly_h)), (24.0, 17.0, fly_h - z_eaves + 0.4), PAL["cream_shade"])
        acc.pitched_roof(-16.2, 16.2, cy_b - 0.5 * bd, cy_b + 0.5 * bd, z_eaves, 2.2, PAL["terracotta"], PAL["cream"])

        y_f = cy_b - 0.5 * bd  # -17.0
        # 4 monumental entrance columns + projecting entablature + curved arched shell pediment facade
        y_port = y_f - 2.4
        acc.box((0.0, y_port, 0.5 * z_plinth), (16.8, 5.0, z_plinth), PAL["plinth"])
        acc.box((0.0, y_port, z_eaves + 0.30), (17.2, 5.2, 0.60), PAL["cream_trim"])
        for cx in (-6.4, -2.2, 2.2, 6.4):
            acc.cyl((cx, y_port - 1.9, z_plinth + 0.5 * (z_eaves - z_plinth)), 0.52, 0.44, z_eaves - z_plinth, PAL["cream_trim"], segs=12 if lod == 0 else 6)
            acc.box((cx, y_port - 1.9, z_plinth + 0.25), (1.3, 1.3, 0.50), PAL["cream_shade"])
        # Curved arched shell pediment facade
        acc.arch_slab(0.0, y_port - 1.2, z_eaves + 0.60, 2.8, 6.4, 14 if lod == 0 else 8, PAL["cream"])
        acc.arch_slab(0.0, y_port - 2.65, z_eaves + 0.60, 0.30, 6.75, 14 if lod == 0 else 8, PAL["cream_trim"])
        if lod == 0:
            acc.cyl((0.0, y_port - 2.82, z_eaves + 2.4), 1.4, 1.4, 0.16, PAL["gold"], segs=14, rot_x=math.pi * 0.5)
        # Wide granite steps
        add_steps(acc, 0.0, y_port - 2.5, 0.0, z_plinth, 15.6, 2.4, 5, PAL["concrete"], lod)

        # Grand entrance double teak doors + flanking poster alcoves
        for dx in (-2.4, 2.4):
            acc.box((dx, y_f - 0.06, z_plinth + 1.8), (2.4, 0.16, 3.4), PAL["teak_brown"])
            acc.box((dx, y_f - 0.16, z_plinth + 1.8), (1.8, 0.06, 2.9), PAL["gold"])
        for ax in (-11.4, 11.4):
            acc.box((ax, y_f - 0.10, z_plinth + 2.6), (4.2, 0.28, 4.6), PAL["cream_trim"])
            acc.box((ax, y_f - 0.26, z_plinth + 2.6), (3.0, 0.08, 3.4), PAL["sign_red"] if ax < 0 else PAL["sign_blue"])
            acc.box((ax, y_f - 0.32, z_plinth + 2.6), (2.4, 0.04, 2.6), PAL["lit_warm"])
        if lod == 0:
            for sx in (-1, 1):
                for wy in (-9.0, 0.0, 9.0):
                    add_window(acc, cy_b + wy, sx * 0.5 * bw, 5.2, 2.2, 3.2, (float(sx), 0.0), PAL["cream_shade"], PAL["glass_blue"], PAL["cream_trim"], True, False, arched=True, lod=lod)
            add_potted_row(acc, (-8.8, 8.8), y_port - 2.6, z_plinth, lod)
        add_compound_perimeter(acc, w, d, 14.0, PAL["cream"], PAL["cream_trim"], lod, wall_h=1.3)

    cols = [
        ("COL_Main", (0.0, cy_b, 0.5 * fly_h), (bw, bd, fly_h)),
        ("COL_Verandah", (0.0, -19.4, 4.8), (17.2, 5.2, 9.6)),
    ]
    return acc, cols


# ---------------------------------------------------------------------------
# Shard 4 Specification Table
# ---------------------------------------------------------------------------

SPECS: List[Dict[str, object]] = [
    {"id": "B17_hospital_multi", "title": "Hospital (Multi-Speciality)", "source_card": "17", "category": "institutional", "substyle": "hospital", "localities": ["Nungambakkam", "Adyar", "Anna Salai"], "w": 30.0, "d": 40.0, "floors": 5, "shop_ground": False, "builder": build_B17_hospital_multi},
    {"id": "B18_college_inst", "title": "College / Institutional Building", "source_card": "18", "category": "institutional", "substyle": "college", "localities": ["Guindy", "Adyar", "Nungambakkam"], "w": 40.0, "d": 60.0, "floors": 4, "shop_ground": False, "builder": build_B18_college_inst},
    {"id": "B21_factory", "title": "Factory Building (Industrial)", "source_card": "21", "category": "industrial", "substyle": "factory", "localities": ["Ambattur", "Guindy", "Manali"], "w": 40.0, "d": 60.0, "floors": 2, "shop_ground": False, "builder": build_B21_factory},
    {"id": "B22_warehouse", "title": "Warehouse / Storage", "source_card": "22", "category": "industrial", "substyle": "warehouse", "localities": ["Ambattur", "Manali", "Chennai Port"], "w": 30.0, "d": 50.0, "floors": 1, "shop_ground": True, "builder": build_B22_warehouse},
    {"id": "B23_workshop", "title": "Workshop Building (Small Industry)", "source_card": "23", "category": "industrial", "substyle": "workshop", "localities": ["Ambattur", "Guindy", "Korattur"], "w": 18.0, "d": 30.0, "floors": 1, "shop_ground": True, "builder": build_B23_workshop},
    {"id": "B24_substation", "title": "Power Substation (Utility)", "source_card": "24", "category": "industrial", "substyle": "substation", "localities": ["Ambattur", "Manali", "Guindy"], "w": 25.0, "d": 40.0, "floors": 1, "shop_ground": False, "builder": build_B24_substation},
    {"id": "B25_water_tower", "title": "Water Tank Facility (Metro Water)", "source_card": "25", "category": "institutional", "substyle": "water_tower", "localities": ["Anna Nagar", "Kilpauk", "Velachery"], "w": 20.0, "d": 20.0, "floors": 3, "shop_ground": False, "builder": build_B25_water_tower},
    {"id": "B26_govt_office", "title": "Government Office (District/Public)", "source_card": "26", "category": "institutional", "substyle": "govt_office", "localities": ["George Town", "Egmore", "Saidapet"], "w": 30.0, "d": 45.0, "floors": 3, "shop_ground": False, "builder": build_B26_govt_office},
    {"id": "B27_police_station", "title": "Police Station (Urban)", "source_card": "27", "category": "institutional", "substyle": "police_station", "localities": ["Mylapore", "Anna Nagar", "Royapuram"], "w": 18.0, "d": 28.0, "floors": 2, "shop_ground": False, "builder": build_B27_police_station},
    {"id": "B28_fire_station", "title": "Fire Station (City)", "source_card": "28", "category": "institutional", "substyle": "fire_station", "localities": ["Egmore", "Teynampet", "Guindy"], "w": 25.0, "d": 35.0, "floors": 2, "shop_ground": True, "builder": build_B28_fire_station},
    {"id": "B29_bus_depot", "title": "Bus Depot (MTC)", "source_card": "29", "category": "institutional", "substyle": "bus_depot", "localities": ["Koyambedu", "Adyar", "Tondiarpet"], "w": 60.0, "d": 90.0, "floors": 1, "shop_ground": False, "builder": build_B29_bus_depot},
    {"id": "B30_metro_station", "title": "Metro Station (Entrance)", "source_card": "30", "category": "institutional", "substyle": "metro_station", "localities": ["Anna Nagar", "Guindy", "Vadapalani"], "w": 35.0, "d": 50.0, "floors": 2, "shop_ground": False, "builder": build_B30_metro_station},
    {"id": "B46_metro_modern", "title": "Metro Station (Modern Elevated)", "source_card": "46", "category": "institutional", "substyle": "metro_modern", "localities": ["Anna Nagar", "Guindy", "Vadapalani"], "w": 40.0, "d": 95.0, "floors": 2, "shop_ground": False, "builder": build_B46_metro_modern},
    {"id": "B47_hospital_tower", "title": "Multi-Speciality Hospital Tower", "source_card": "47", "category": "institutional", "substyle": "hospital_tower", "localities": ["Greams Road", "Adyar", "OMR"], "w": 45.0, "d": 75.0, "floors": 8, "shop_ground": False, "builder": build_B47_hospital_tower},
    {"id": "B49_bus_terminus", "title": "Bus Terminus (Koyambedu Style)", "source_card": "49", "category": "institutional", "substyle": "bus_terminus", "localities": ["Koyambedu", "Kilambakkam"], "w": 80.0, "d": 120.0, "floors": 2, "shop_ground": False, "builder": build_B49_bus_terminus},
    {"id": "B50_stadium_bowl", "title": "Stadium / Sports Complex", "source_card": "50", "category": "institutional", "substyle": "stadium", "localities": ["Chepauk", "Nehru Park", "Velachery"], "w": 95.0, "d": 120.0, "floors": 3, "shop_ground": False, "builder": build_B50_stadium_bowl},
    {"id": "K10_govt_school", "title": "School Building (Govt. Style)", "source_card": "K10", "category": "institutional", "substyle": "govt_school", "localities": ["Mylapore", "Anna Nagar", "Triplicane"], "w": 16.0, "d": 38.0, "floors": 2, "shop_ground": False, "builder": build_K10_govt_school},
    {"id": "N03_fish_market", "title": "Fish Market Building (Kasimedu)", "source_card": "N03", "category": "north_chennai", "substyle": "fish_market", "localities": ["Kasimedu", "Royapuram"], "w": 22.0, "d": 34.0, "floors": 1, "shop_ground": True, "builder": build_N03_fish_market},
    {"id": "N04_port_warehouse", "title": "Port Warehouse (Chennai Port)", "source_card": "N04", "category": "north_chennai", "substyle": "port_warehouse", "localities": ["Chennai Port", "Royapuram", "Manali"], "w": 32.0, "d": 55.0, "floors": 2, "shop_ground": False, "builder": build_N04_port_warehouse},
    {"id": "B38_auditorium_hall", "title": "Community Hall / Auditorium", "source_card": "38", "category": "institutional", "substyle": "auditorium", "localities": ["Triplicane", "Teynampet", "T. Nagar"], "w": 40.0, "d": 50.0, "floors": 2, "shop_ground": False, "builder": build_B38_auditorium_hall},
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta_records: List[Dict[str, object]] = []

    for sp in SPECS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mat = make_vertex_material("ChennaiMat")
        builder: Callable[[int], Tuple[MeshAcc, ColliderList]] = sp["builder"]  # type: ignore[assignment]

        acc0, cols = builder(0)
        acc1, _ = builder(1)
        acc2, _ = builder(2)

        lod0_max_z = max((v.co.z for v in acc0.bm.verts), default=5.0)
        vert_counts = {
            "LOD0": len(acc0.bm.verts),
            "LOD1": len(acc1.bm.verts),
            "LOD2": len(acc2.bm.verts),
        }

        out_glb = OUT_DIR / f"{sp['id']}.glb"
        tris = export_glb_scene(out_glb, mat, (acc0, acc1, acc2), cols)

        lod_stats = {
            k: {"verts": vert_counts[k], "tris": tris[k]}
            for k in ("LOD0", "LOD1", "LOD2")
        }
        rec = {
            "id": sp["id"],
            "title": sp["title"],
            "source_card": sp["source_card"],
            "category": sp["category"],
            "substyle": sp["substyle"],
            "preferred_localities": sp["localities"],
            "dimensions_m": {
                "width": sp["w"],
                "depth": sp["d"],
                "height": round(float(lod0_max_z), 2),
            },
            "floors": sp["floors"],
            "shop_ground": sp["shop_ground"],
            "glb_path": f"res://assets/buildings/pack_100/{sp['id']}.glb",
            "glb_bytes": out_glb.stat().st_size,
            "lod_stats": lod_stats,
        }
        meta_records.append(rec)
        print(f"BUILT {sp['id']} | bytes={rec['glb_bytes']} | tris={tris} | h={rec['dimensions_m']['height']}")

    META_PATH.write_text(json.dumps({"shard": 4, "count": len(meta_records), "models": meta_records}, indent=2), encoding="utf-8")
    print(f"SHARD_4_DONE count={len(meta_records)} meta={META_PATH}")


if __name__ == "__main__":
    main()
