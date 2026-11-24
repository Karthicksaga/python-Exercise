"""
Kit `lighthouse`: a banded concrete lighthouse on its OSM outline (Chennai Lighthouse; G-184).

    blender -b --factory-startup --python tools/blender/landmarks/lighthouse.py [-- ID ...]

The OSM outline is extruded in `bands` alternating red and white bands, tapering slightly, with
a small ledge between bands and window slits on each face; then a gallery slab with brackets and
a railing, the glazed lantern with mullions, a red dome, a vent and a lightning rod, all within
the spec height (OSM's `height` tag when present).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lkit  # noqa: E402
from mathutils import Vector  # noqa: E402


def scaled(ring, c, k):
    return [(c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k) for x, y in ring]


def build(spec, acc, col, lod):
    p = spec["recipe"]["params"]
    cols = lkit.colours(spec)
    ring = lkit.part_ring(spec, p["part"])
    c = lkit.part_centre(spec, p["part"])
    H = spec["height"]["value"]
    g = p["gallery_height"]
    bands = p["bands"]
    top_k = 0.82
    bh = g / bands
    for i in range(bands):
        k0 = 1 - (1 - top_k) * i / bands
        k1 = 1 - (1 - top_k) * (i + 1) / bands
        r0, r1 = scaled(ring, c, k0), scaled(ring, c, k1)
        colour = cols["red"] if i % 2 == 0 else cols["white"]
        z0, z1 = i * bh, (i + 1) * bh
        r0c, r1c = lkit._ccw(r0), lkit._ccw(r1)
        for a in range(len(r0c)):
            b = (a + 1) % len(r0c)
            acc.face([(r0c[a][0], r0c[a][1], z0), (r0c[b][0], r0c[b][1], z0), (r1c[b][0], r1c[b][1], z1), (r1c[a][0], r1c[a][1], z1)], colour)
        if lod < 2 and i > 0:
            acc.band(r0, z0 - 0.12, z0 + 0.12, 0.12, cols["white"])
        if lod == 0:
            # Rounded corner fillets where the faces meet (sharp corners only).
            for a in range(len(r0c)):
                e0 = Vector(r0c[a]) - Vector(r0c[a - 1])
                e1 = Vector(r0c[(a + 1) % len(r0c)]) - Vector(r0c[a])
                if e0.length > 0.5 and e1.length > 0.5 and e0.normalized().dot(e1.normalized()) < 0.7:
                    acc.cylinder((r0c[a][0], r0c[a][1], z0), 0.35, 0.33, bh, colour, sides=8, top=False)
        if lod == 0:
            # Window slits with a sill on every long face.
            for a, b, L, u, n in lkit.edges(r0):
                if L < 3.0:
                    continue
                for s in (-0.28, 0.0, 0.28):
                    m = (a + b) / 2 + u * (s * L) - u * 0.25
                    lkit.vface(acc, m, u, z0 + bh * 0.3, 0.5, bh * 0.4, 0.03, cols["opening"])
                    q = m + u * 0.25 + n * 0.12
                    acc.box((q.x, q.y, z0 + bh * 0.27), (0.8, 0.25, 0.08), cols["white"], math.atan2(u.y, u.x))
    top_ring = scaled(ring, c, top_k)
    acc.cap(top_ring, g, cols["white"])
    # Gallery: a wider slab on brackets, railing posts and two rails.
    gal = lkit.offset(top_ring, 1.0)
    acc.prism(gal, g, g + 0.35, cols["gallery"])
    if lod < 2:
        for a, b, L, u, n in lkit.edges(top_ring):
            k = max(1, int(L / 1.2))
            for i in range(k + 1):
                q = a + u * (L * i / k) + n * 0.4
                acc.box((q.x, q.y, g - 0.8), (0.18, 0.8, 0.8), cols["gallery"], math.atan2(u.y, u.x), top=(0.18, 0.25))
        rail = lkit.offset(top_ring, 0.9)
        for a, b, L, u, n in lkit.edges(rail):
            k = max(1, int(L / (0.4 if lod == 0 else 1.5)))
            for i in range(k):
                q = a + u * (L * i / k)
                acc.box((q.x, q.y, g + 0.35), (0.06, 0.06, 1.05), cols["rail"], math.atan2(u.y, u.x))
            for z in ((g + 0.85, g + 1.35) if lod == 0 else (g + 1.35,)):
                m = (a + b) / 2
                acc.box((m.x, m.y, z), (L, 0.06, 0.06), cols["rail"], math.atan2(u.y, u.x))
    # Watch room and lantern.
    lr = p["lantern_radius"]
    lh = p["lantern_height"]
    sides = 24 if lod == 0 else (10 if lod == 1 else 6)
    z = g + 0.35
    acc.cylinder((c[0], c[1], z), lr + 0.3, lr + 0.3, 1.6, cols["white"], sides=sides)
    z += 1.6
    acc.cylinder((c[0], c[1], z), lr, lr, lh * 0.75, cols["glass"], sides=sides, top=False)
    if lod < 2:
        for i in range(sides):
            a = 2 * math.pi * i / sides
            acc.box((c[0] + math.cos(a) * lr, c[1] + math.sin(a) * lr, z), (0.1, 0.1, lh * 0.75), cols["rail"], a)
        for zz in (z + lh * 0.25, z + lh * 0.5):
            acc.cylinder((c[0], c[1], zz), lr + 0.04, lr + 0.04, 0.08, cols["rail"], sides=sides, top=False)
    z += lh * 0.75
    acc.cylinder((c[0], c[1], z), lr + 0.25, lr + 0.25, 0.3, cols["rail"], sides=sides)
    z += 0.3
    dome_h = max(0.6, H - z - 0.9)
    acc.dome((c[0], c[1], z), lr + 0.1, dome_h, cols["dome"], sides=sides, rings=4 if lod == 0 else 2)
    acc.lathe((c[0], c[1], z + dome_h - 0.05), [(0.0, 0.0), (0.3, 0.05), (0.32, 0.3), (0.0, 0.4)], cols["rail"], sides=8 if lod < 2 else 4)
    acc.cylinder((c[0], c[1], z + dome_h + 0.35), 0.04, 0.02, H - (z + dome_h + 0.35), cols["rail"], sides=4)
    # Base blocks: OSM building parts at their tagged heights, white with window bands.
    for name in p.get("base_parts", []):
        br = lkit.part_ring(spec, name)
        bh2 = float(spec["osm"]["parts"][name]["tags"].get("height", 5))
        acc.prism(br, 0.0, bh2, cols["white"], top_colour=cols["base"])
        if lod < 2:
            acc.band(br, bh2 - 0.3, bh2 + 0.1, 0.2, cols["base"])
            z = 1.0
            while z + 1.6 < bh2:
                for a, b, L, u, n in lkit.edges(br):
                    if L > 3:
                        k2 = max(1, int(L / 2.6))
                        for i in range(k2):
                            lkit.vface(acc, a + u * (L * (i + 0.25) / k2), u, z, L / k2 * 0.5, 1.3, 0.03, cols["opening"])
                z += 3.2
        bc = lkit.part_centre(spec, name)
        by = lkit.part_yaw(spec, name)
        bl, bs = lkit.part_rect(spec, name)
        col.append(((bc[0], bc[1], bh2 / 2), (bl * 0.9, bs * 0.9, bh2), by))
    # Collision: the tower's minimum rectangle as a box, the gallery as a thinner one.
    yaw = lkit.part_yaw(spec, p["part"])
    L, S = lkit.part_rect(spec, p["part"])
    col.append(((c[0], c[1], g / 2), (L * 0.85, S * 0.85, g), yaw))
    col.append(((c[0], c[1], g + (H - g) / 2), (lr * 2, lr * 2, H - g), yaw))


if __name__ == "__main__":
    lkit.run(build, os.path.basename(__file__))
