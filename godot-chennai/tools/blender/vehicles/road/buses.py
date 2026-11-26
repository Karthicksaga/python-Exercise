"""
Tamil Nadu buses, by script in Blender 5.2 LTS.

    blender -b --factory-startup --python godot-chennai/tools/blender/vehicles/road/buses.py -- [--only bus_city,bus_lowfloor,bus_intercity,bus_mofussil,bus_school]

Writes `assets/vehicles/<name>.glb`, `_lod1.glb`, `_lod2.glb` and `<name>.json` for:

* `bus_city`: a Chennai city bus of the classic high-floor kind (front engine, driver on the
  right, front door ahead of the front axle and a rear door ahead of the rear axle, three steps
  each, window rows with pillars and guard bars, roof hatches, destination boards front, side
  and rear). Colour family of Chennai's city buses: cream with maroon bands.
* `bus_lowfloor`: a low-floor city bus (rear engine, one step, wide middle door, deep windows).
* `bus_intercity`: a state-transport-style mofussil/intercity bus (high floor, one front door,
  2 x 2 seats, roof luggage rails and a rear ladder). Colour family: green with yellow bands.
* `bus_mofussil`: a private mofussil bus with bright painted sides (invented sweeps and stars,
  no names), chrome trim, a decorated front visor.
* `bus_school`: a school bus, golden yellow with a brown band, barred windows, an emergency door
  at the back. Plain: no lettering.

Original designs at real proportions (Indian 10-12 m buses on 10.00-20 tyres, 2.56 m wide);
liveries follow real colour families with invented layouts, invented fleet numbers on the front
and rear (a small pixel font in the livery), no operator names, emblems, route numbers or real
registrations. Destination boards are plain amber LED panels and separate nodes (`dest_*`); the
game draws the place names on them (Tamil first, English below), from `destinations` in the
manifest.

Each bus has one painted livery (`livery_<name>`, 512 px): the sides share the upper part of the
texture (u along the bus, v up), the front and the rear the lower part (see `tnkit.project_livery`).
Glass, lamps, trim, seats and wheels are palette cells.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tnkit as T  # noqa: E402
from tnkit import K, Vector, role  # noqa: E402
import cars as C  # noqa: E402

SOURCE = "tools/blender/vehicles/road/buses.py"
TEX = 512
HW = 1.28

CREAM = (0.62, 0.52, 0.33)
MAROON = (0.16, 0.012, 0.012)
RED = (0.42, 0.02, 0.015)
BROWN = (0.09, 0.035, 0.012)
GREEN = (0.02, 0.2, 0.05)
LEAF = (0.12, 0.42, 0.04)
YELLOW = (0.8, 0.55, 0.02)
GOLD = (0.85, 0.5, 0.0)
WHITE = (0.78, 0.78, 0.76)
SILVER = (0.45, 0.46, 0.47)
GREY = (0.2, 0.2, 0.2)
DARK = (0.02, 0.02, 0.022)
ORANGE = (0.7, 0.16, 0.01)
MAGENTA = (0.45, 0.02, 0.2)
SKY = (0.1, 0.35, 0.7)

DESTINATIONS = [["பிராட்வே", "Broadway"], ["தாம்பரம்", "Tambaram"], ["கோயம்பேடு", "Koyambedu"], ["அடையாறு", "Adyar"],
                ["வேளச்சேரி", "Velachery"], ["திருவொற்றியூர்", "Tiruvottiyur"], ["பெரம்பூர்", "Perambur"], ["கிண்டி", "Guindy"]]
MOFUSSIL_DEST = [["காஞ்சிபுரம்", "Kanchipuram"], ["வேலூர்", "Vellore"], ["திருச்சி", "Tiruchi"], ["மதுரை", "Madurai"],
                 ["புதுச்சேரி", "Puducherry"], ["திருவண்ணாமலை", "Tiruvannamalai"]]

# Per bus: axles (front y, rear y), ends (rear y, front y), floor, skirt bottom, roof, window band,
# windscreen (bottom, top), doors [(name, centre y, width, top)], seats, kind of front.
BUSES = {
    "bus_city": dict(
        label="City bus (high floor, Chennai)", mass=9800, axles=(2.75, -2.75), ends=(-5.95, 5.0), floor=1.08, skirt=0.48,
        roof=3.22, band=(1.72, 2.6), ws=(1.25, 2.58), board=(2.64, 2.94), doors=[("front", 4.42, 0.88, 2.62), ("rear", -1.62, 0.9, 2.62)],
        rows=(3.55, -5.25), pitch=0.74, seat=("seat_dark", "red"), bars=True, hatches=2, steps=3, front="classic", pillars=1.05,
        tyre=0.52, rim=0.26, roof_rack=False, ladder=False, emergency=False, lamps="twin_round",
        physics=dict(engineForce=34000, maxSpeed=17, maxSteer=0.62, brakeForce=900, drift=0.95, gears=5), ride=1.25,
        destinations=DESTINATIONS, fleet="C 2417",
    ),
    "bus_lowfloor": dict(
        label="Low-floor city bus", mass=11500, axles=(2.95, -2.95), ends=(-6.15, 5.55), floor=0.40, skirt=0.26,
        roof=3.1, band=(1.15, 2.55), ws=(0.72, 2.55), board=(2.6, 2.9), doors=[("front", 4.85, 1.0, 2.5), ("mid", -0.35, 1.25, 2.5)],
        rows=(3.9, -5.6), pitch=0.78, seat=("navy", "mid_grey"), bars=False, hatches=2, steps=1, front="flat", pillars=1.25,
        tyre=0.48, rim=0.29, roof_rack=False, ladder=False, emergency=False, lamps="strip",
        physics=dict(engineForce=36000, maxSpeed=18, maxSteer=0.6, brakeForce=950, drift=0.95, gears=6), ride=1.05,
        destinations=DESTINATIONS, fleet="L 0813",
    ),
    "bus_intercity": dict(
        label="State-transport intercity bus", mass=10500, axles=(2.9, -2.9), ends=(-6.25, 5.05), floor=1.15, skirt=0.5,
        roof=3.32, band=(1.8, 2.66), ws=(1.3, 2.64), board=(2.7, 3.0), doors=[("front", 4.48, 0.82, 2.66)],
        rows=(3.55, -5.6), pitch=0.8, seat=("seat_dark", "teal"), bars=False, hatches=2, steps=3, front="classic", pillars=1.0,
        tyre=0.52, rim=0.26, roof_rack=True, ladder=True, emergency=False, lamps="twin_round",
        physics=dict(engineForce=36000, maxSpeed=22, maxSteer=0.58, brakeForce=950, drift=0.9, gears=5), ride=1.25,
        destinations=MOFUSSIL_DEST, fleet="V 1592",
    ),
    "bus_mofussil": dict(
        label="Private mofussil bus", mass=10200, axles=(2.85, -2.85), ends=(-6.0, 5.05), floor=1.12, skirt=0.46,
        roof=3.3, band=(1.78, 2.64), ws=(1.28, 2.62), board=(2.68, 2.98), doors=[("front", 4.45, 0.82, 2.64), ("rear", -1.9, 0.82, 2.64)],
        rows=(3.55, -5.4), pitch=0.78, seat=("seat_dark", "red"), bars=False, hatches=1, steps=3, front="decorated", pillars=1.0,
        tyre=0.52, rim=0.26, roof_rack=False, ladder=False, emergency=False, lamps="quad",
        physics=dict(engineForce=36000, maxSpeed=23, maxSteer=0.6, brakeForce=950, drift=0.92, gears=5), ride=1.25,
        destinations=MOFUSSIL_DEST, fleet="P 77",
    ),
    "bus_school": dict(
        label="School bus", mass=7800, axles=(2.25, -2.25), ends=(-4.65, 4.35), floor=1.0, skirt=0.46,
        roof=3.02, band=(1.62, 2.45), ws=(1.2, 2.45), board=(2.5, 2.78), doors=[("front", 3.78, 0.78, 2.46)],
        rows=(2.9, -4.1), pitch=0.72, seat=("brown", "navy"), bars=True, hatches=1, steps=3, front="classic", pillars=0.95,
        tyre=0.48, rim=0.24, roof_rack=False, ladder=False, emergency=True, lamps="twin_round",
        physics=dict(engineForce=28000, maxSpeed=17, maxSteer=0.64, brakeForce=800, drift=0.95, gears=5), ride=1.2,
        destinations=[], fleet="S 12",
    ),
}

# ----------------------------------------------------------------------------- pixel font (fleet numbers)

FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"], "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"], "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"], " ": ["00000"] * 7,
}


def text(P, s, x, y, px, rgb):
    """Pixel text with its bottom-left at (x, y), `px` texels per font pixel."""
    for ch in s:
        g = FONT.get(ch, FONT[" "])
        for r, row in enumerate(g):
            for c, bit in enumerate(row):
                if bit == "1":
                    P.rect(x + c * px, y + (6 - r) * px, x + (c + 1) * px, y + (7 - r) * px, rgb)
        x += 6 * px


# ----------------------------------------------------------------------------- liveries


class Map:
    """Metres on the bus -> texels of the livery (see tnkit.project_livery)."""

    def __init__(self, d):
        self.y0, self.y1 = d["ends"]
        self.H = d["roof"] + 0.08
        self.L = self.y1 - self.y0

    def su(self, y):
        return TEX * (y - self.y0) / self.L

    def sv(self, z):
        return TEX * (0.375 + 0.625 * min(max(z / self.H, 0.0), 1.0))

    def side(self, P, z0, z1, rgb, ya=None, yb=None):
        P.rect(self.su(ya if ya is not None else self.y0), self.sv(z0), self.su(yb if yb is not None else self.y1) + 1, self.sv(z1), rgb)

    def ends(self, P, z0, z1, rgb, x0=-HW, x1=HW, front=True, rear=True):
        fv0, fv1 = TEX * 0.375 * z0 / self.H, TEX * 0.375 * min(z1, self.H) / self.H
        a, b = (x0 / (2 * HW) + 0.5), (x1 / (2 * HW) + 0.5)
        if front:
            P.rect(256 * (1 - b), fv0, 256 * (1 - a) + 1, fv1, rgb)
        if rear:
            P.rect(256 + 256 * a, fv0, 256 + 256 * b + 1, fv1, rgb)

    def both(self, P, z0, z1, rgb):
        self.side(P, z0, z1, rgb)
        self.ends(P, z0, z1, rgb)

    def end_text(self, P, s, x, z, px, rgb, front=True):
        """Text on the front (or rear) face, x the left edge seen from outside, metres."""
        fv = TEX * 0.375 * z / self.H
        if front:
            u = 256 * (1 - (-x / (2 * HW) + 0.5))  # seen from the front, the viewer's left is +x
            text(P, s, 256 * (0.5 - x / (2 * HW)), fv, px, rgb)
        else:
            text(P, s, 256 + 256 * (x / (2 * HW) + 0.5), fv, px, rgb)


def livery(name, d):
    m = Map(d)
    samples = []
    band0, band1 = d["band"]
    if name == "bus_city":
        P = K.Painter("livery_" + name, TEX, TEX, CREAM)
        m.both(P, 0, d["skirt"] + 0.42, MAROON)
        m.both(P, d["skirt"] + 0.42, d["skirt"] + 0.5, CREAM)
        m.both(P, d["skirt"] + 0.5, d["skirt"] + 0.6, RED)
        m.both(P, band0 - 0.16, band0 - 0.06, MAROON)
        m.both(P, band1 + 0.06, band1 + 0.12, RED)
        m.side(P, d["roof"] - 0.05, m.H, WHITE)
        samples = [("cream body", CREAM, (0.0, 1.3), "cream"), ("maroon skirt", MAROON, (0.0, d["skirt"] + 0.2), "maroon")]
    elif name == "bus_lowfloor":
        P = K.Painter("livery_" + name, TEX, TEX, WHITE)
        m.both(P, 0, band0 - 0.05, ORANGE)
        m.both(P, band0 - 0.12, band0 - 0.05, DARK)
        m.side(P, band1 + 0.05, band1 + 0.14, ORANGE)
        m.side(P, d["roof"] - 0.05, m.H, SILVER)
        samples = [("white upper", WHITE, (0.0, band1 + 0.3), "white"), ("red-orange lower", ORANGE, (0.0, 0.6), "orange")]
    elif name == "bus_intercity":
        P = K.Painter("livery_" + name, TEX, TEX, GREEN)
        m.both(P, 0, d["skirt"] + 0.25, DARK)
        for z in (d["skirt"] + 0.45, d["skirt"] + 0.75):
            m.both(P, z, z + 0.12, YELLOW)
        m.both(P, band0 - 0.18, band0 - 0.08, YELLOW)
        m.side(P, band1 + 0.04, d["roof"], LEAF)
        m.side(P, d["roof"] - 0.05, m.H, WHITE)
        samples = [("green body", GREEN, (0.0, d["skirt"] + 0.62), "green"), ("yellow band", YELLOW, (0.0, d["skirt"] + 0.51), "yellow")]
    elif name == "bus_mofussil":
        P = K.Painter("livery_" + name, TEX, TEX, WHITE)
        m.both(P, 0, d["skirt"] + 0.2, MAGENTA)
        # Invented art: three sweeping bands rising to the rear, a sun of rays, stars.
        for k, (rgb, dz) in enumerate(((MAGENTA, 0.0), (LEAF, 0.22), (GOLD, 0.44), (SKY, 0.66))):
            pts = []
            for i in range(21):
                y = m.y0 + m.L * i / 20
                t = i / 20
                z = d["skirt"] + 0.25 + dz + 0.55 * math.sin(math.pi * (1 - t) * 0.9) * (1 - t) + 0.1 * t
                pts.append((m.su(y), m.sv(z)))
            for i in range(20, -1, -1):
                y = m.y0 + m.L * i / 20
                t = i / 20
                z = d["skirt"] + 0.25 + dz + 0.16 + 0.55 * math.sin(math.pi * (1 - t) * 0.9) * (1 - t) + 0.1 * t
                pts.append((m.su(y), m.sv(min(z, band0 - 0.05))))
            P.poly(pts, rgb)
        cx, cz = m.su(m.y0 + 1.6), m.sv(band0 - 0.35)
        for k in range(12):
            a = math.pi * k / 11
            P.poly([(cx, cz), (cx + 60 * math.cos(a - 0.06), cz + 22 * math.sin(a - 0.06)), (cx + 60 * math.cos(a + 0.06), cz + 22 * math.sin(a + 0.06))], ORANGE)
        P.disc(cx, cz, 9, GOLD)
        for y, z in ((1.0, 1.4), (-1.8, 1.55), (-3.5, 1.35)):
            P.disc(m.su(y), m.sv(z), 4, GOLD)
        m.ends(P, d["skirt"] + 0.3, d["skirt"] + 0.42, LEAF)
        m.ends(P, d["skirt"] + 0.42, d["skirt"] + 0.54, GOLD)
        m.both(P, band0 - 0.1, band0 - 0.04, MAGENTA)
        m.side(P, band1 + 0.05, band1 + 0.14, SKY)
        m.side(P, d["roof"] - 0.05, m.H, WHITE)
        samples = [("white body", WHITE, (0.0, band1 + 0.3), "white"), ("magenta skirt", MAGENTA, (0.0, d["skirt"] + 0.08), "magenta")]
    else:  # school
        P = K.Painter("livery_" + name, TEX, TEX, GOLD)
        m.both(P, 0, d["skirt"] + 0.18, DARK)
        m.both(P, band0 - 0.3, band0 - 0.15, BROWN)  # the 150 mm band at mid height
        m.side(P, d["roof"] - 0.05, m.H, WHITE)
        samples = [("golden yellow body", GOLD, (0.0, 1.0), "yellow"), ("brown band", BROWN, (0.0, band0 - 0.22), "brown")]
    # Invented fleet numbers on the front (left of the plate) and the rear.
    ink = WHITE if name in ("bus_city", "bus_intercity", "bus_lowfloor") else DARK
    if name == "bus_city":
        ink = MAROON
        m.end_text(P, d["fleet"], 0.95, d["skirt"] + 0.72, 2, ink)
        m.end_text(P, d["fleet"], -0.95, d["skirt"] + 0.72, 2, ink, front=False)
    elif name == "bus_lowfloor":
        m.end_text(P, d["fleet"], 1.0, band0 - 0.4, 2, WHITE)
        m.end_text(P, d["fleet"], -1.0, band0 - 0.4, 2, WHITE, front=False)
    else:
        m.end_text(P, d["fleet"], 0.95, d["skirt"] + 0.62, 2, ink)
        m.end_text(P, d["fleet"], 0.3 if d["emergency"] else -0.95, d["skirt"] + 0.62, 2, ink, front=False)
    img = P.image()
    out = []
    for what, rgb, (yy, zz), family in samples:
        y = m.y0 + 0.35 * m.L if yy == 0.0 else yy
        u = (y - m.y0) / m.L
        v = 0.375 + 0.625 * zz / m.H
        smp = K.texture_sample(what, img.name, u, v, rgb)
        smp["family"] = family
        out.append(smp)
    return K.livery_material("livery_" + name, img, rough=0.4, metal=0.05), out


# ----------------------------------------------------------------------------- body


def bus_shell(name, d, liv, lod):
    y0, y1 = d["ends"]
    roof, skirt = d["roof"], d["skirt"]
    n_arc = (3, 2, 1)[lod]
    rt = 0.24 if d["front"] != "flat" else 0.2
    rake = 0.12 if d["front"] == "classic" else (0.18 if d["front"] == "decorated" else 0.06)
    secs = [(y0, HW - 0.04, skirt + 0.06, roof - 0.08), (y0 + 0.08, HW, skirt, roof), (y1 - 0.6, HW, skirt, roof),
            (y1 - 0.12, HW - 0.01, skirt, roof - 0.02), (y1, HW - 0.04, skirt + 0.04, roof - rake)]
    rings = [T.rounded_rect(y, w, zb, zt, 0.05, rt, n_arc, crown=0.05 if lod < 2 else 0.0) for y, w, zb, zt in secs]
    shell = K.loft("shell", K.inset_ends(rings, (0.9, 0.5) if lod < 2 else (0.6,)), liv, caps=(True, True))
    ya, yr = d["axles"]
    r = d["tyre"]
    cuts = [K.cutter_cyl("arch", r + 0.07, 0.5, (sx * HW, y, r), verts=K.seg(32, 16, 8)) for y in (ya, yr) for sx in (1, -1)] if lod < 2 else []
    if lod == 0:
        fl = d["floor"]
        cuts.append(K.cutter_box("cavity", (2 * HW - 0.1, (y1 - y0) - 0.24, roof - 0.1 - fl), (0, (y0 + y1) / 2, fl + (roof - 0.1 - fl) / 2)))
        for nm, yc, w, top in d["doors"]:
            cuts.append(K.cutter_box("door_" + nm, (0.5, w, top - 0.25), (-HW, yc, 0.25 + (top - 0.25) / 2)))
    if cuts:
        K.boolean_cut(shell, cuts)
    b0, b1 = d["band"]
    w0, w1 = d["ws"]
    zs = [b0, b1, w0, w1] if lod < 2 else [b0, b1]
    if lod < 2:
        zs += [d["board"][0], d["board"][1]]
    K.bisect_planes(shell, zs=sorted(set(zs)))
    if lod < 2:
        door_ranges = [(yc - w / 2 - 0.05, yc + w / 2 + 0.05) for _n, yc, w, _t in d["doors"]]
        K.bisect_planes(shell, ys=[y1 - 0.75, y0 + 0.3] + [v for a in door_ranges for v in a])
    else:
        door_ranges = []

    def side_glass(c, n):
        if abs(n.x) < 0.6 or not (b0 < c.z < b1):
            return False
        if not (y0 + 0.3 < c.y < y1 - 0.15):
            return False
        if c.x < 0 and any(a < c.y < b for a, b in door_ranges):
            return False
        return True

    K.paint_faces(shell, role("glass"), side_glass)
    K.paint_faces(shell, role("glass"), lambda c, n: n.y > 0.5 and w0 < c.z < w1 and abs(c.x) < HW - 0.1)
    K.paint_faces(shell, role("glass"), lambda c, n: n.y < -0.5 and b0 + 0.1 < c.z < b1 and abs(c.x) < HW - 0.2)
    K.paint_faces(shell, role("led_amber" if lod == 2 else "black"), lambda c, n: n.y > 0.5 and d["board"][0] < c.z < d["board"][1] and abs(c.x) < HW - 0.25)
    K.paint_faces(shell, role("underframe"), lambda c, n: n.z < -0.7)
    K.paint_faces(shell, role("black"), lambda c, n: abs(n.x) < 0.7 and any(math.hypot(c.y - y, c.z - r) < r + 0.075 for y in (ya, yr)) and abs(c.x) > HW - 0.3)
    K.smooth(shell, 35)
    return shell


def pillars_and_bars(d, liv, lod):
    """Window pillars (body colour, from the livery) and guard bars over the side windows."""
    y0, y1 = d["ends"]
    b0, b1 = d["band"]
    parts = []
    doors = [(yc - w / 2 - 0.05, yc + w / 2 + 0.05) for _n, yc, w, _t in d["doors"]]
    ys = []
    y = y1 - 0.75
    while y > y0 + 0.35:
        ys.append(y)
        y -= d["pillars"]
    ys.append(y0 + 0.3)
    for sx in (1, -1):
        for y in ys:
            if sx < 0 and any(a - 0.05 < y < b + 0.05 for a, b in doors):
                continue
            parts.append(K.box("pillar", (0.03, 0.1, b1 - b0), (sx * (HW + 0.004), y, (b0 + b1) / 2), liv))
        for a, b in doors if sx < 0 else []:
            for yy in (a, b):
                parts.append(K.box("pillar", (0.03, 0.1, b1 - b0), (sx * (HW + 0.004), yy, (b0 + b1) / 2), liv))
        # Sliding-window rails at mid height (the frames read at a distance).
        if lod == 0:
            parts.append(K.box("window_rail", (0.02, y1 - y0 - 0.9, 0.03), (sx * (HW + 0.01), (y0 + y1) / 2 - 0.2, b0 + (b1 - b0) * 0.55), role("alloy")))
        if d["bars"] and lod == 0:
            for k in (0.22, 0.38):
                z = b0 + k * (b1 - b0) + 0.06
                segs = []
                ya = y1 - 0.75
                cuts = sorted(doors) if sx < 0 else []
                start = y0 + 0.3
                for a, b in cuts:
                    segs.append((start, a))
                    start = b
                segs.append((start, ya))
                for a, b in segs:
                    if b - a > 0.2:
                        parts.append(K.box("guard_bar", (0.02, b - a, 0.02), (sx * (HW + 0.025), (a + b) / 2, z), role("steel")))
    return parts


def front_and_rear(d, liv, lod):
    y0, y1 = d["ends"]
    sk = d["skirt"]
    parts = []
    z_l = sk + 0.38
    # Headlamps.
    for sx in (1, -1):
        if d["lamps"] == "twin_round":
            parts.append(K.box("lamp_bezel", (0.42, 0.05, 0.22), (sx * 0.86, y1 + 0.01, z_l), role("black"), bevel=0.02))
            for k in (-1, 1):
                parts += T.lamp_disc((sx * 0.86 + k * 0.1, y1 + 0.03, z_l), 0.07, (0, 1, 0), depth=0.04)
            parts.append(K.box("indicator", (0.12, 0.05, 0.1), (sx * 1.14, y1 + 0.02, z_l), role("indicator"), bevel=0.01))
        elif d["lamps"] == "quad":
            parts.append(K.box("lamp_bezel", (0.62, 0.05, 0.24), (sx * 0.8, y1 + 0.01, z_l), role("chrome"), bevel=0.02))
            for k in (-1.5, -0.5, 0.5, 1.5):
                parts += T.lamp_disc((sx * 0.8 + k * 0.135, y1 + 0.03, z_l), 0.055, (0, 1, 0), depth=0.04)
        else:  # strip (low floor)
            parts.append(K.box("lamp_house", (0.5, 0.05, 0.16), (sx * 0.85, y1 + 0.01, z_l + 0.05), role("dark_grey"), bevel=0.02))
            parts.append(K.box("headlamp", (0.36, 0.05, 0.08), (sx * 0.82, y1 + 0.025, z_l + 0.06), role("headlamp"), bevel=0.01))
            parts.append(K.box("indicator", (0.1, 0.05, 0.06), (sx * 1.04, y1 + 0.025, z_l + 0.06), role("indicator")))
        # Mirrors on long arms from the front corners (the "rabbit ears").
        arm = [(sx * (HW - 0.05), y1 - 0.25, d["ws"][1] - 0.2), (sx * (HW + 0.2), y1 + 0.2, d["ws"][1] - 0.15),
               (sx * (HW + 0.25), y1 + 0.32, d["ws"][1] - 0.45)]
        parts.append(K.path_tube("mirror_arm", arm, 0.018, role("black"), verts=K.seg(8, 5, 4)))
        parts.append(K.box("mirror", (0.16, 0.05, 0.34), (sx * (HW + 0.25), y1 + 0.32, d["ws"][1] - 0.62), role("black"), bevel=0.02))
        # Tail lamps: vertical clusters at the rear corners.
        parts.append(K.box("tail", (0.16, 0.05, 0.42), (sx * (HW - 0.14), y0 - 0.01, sk + 0.55), role("taillamp"), bevel=0.015))
        parts.append(K.box("tail_ind", (0.16, 0.05, 0.12), (sx * (HW - 0.14), y0 - 0.01, sk + 0.85), role("indicator"), bevel=0.015))
    # Grille (front-engine buses): a plain slatted panel in the middle; bumpers; plates (blank).
    if d["front"] != "flat":
        parts.append(K.box("grille", (0.9, 0.05, 0.42), (0, y1 + 0.01, sk + 0.42), role("black"), bevel=0.02))
        if lod == 0:
            for k in range(5):
                parts.append(K.box("slat", (0.86, 0.05, 0.025), (0, y1 + 0.025, sk + 0.27 + k * 0.075), role("chrome" if d["front"] == "decorated" else "dark_alloy")))
    parts.append(K.box("bumper", (2 * HW - 0.06, 0.14, 0.2), (0, y1 + 0.06, sk + 0.04), role("black" if d["front"] != "decorated" else "chrome"), bevel=0.03))
    parts.append(K.box("plate", (0.5, 0.02, 0.13), (0, y1 + 0.14, sk + 0.04), role("yellow")))
    parts.append(K.box("bumper_rear", (2 * HW - 0.06, 0.14, 0.18), (0, y0 - 0.06, sk + 0.02), role("black"), bevel=0.03))
    parts.append(K.box("plate_rear", (0.5, 0.02, 0.13), (0, y0 - 0.14, sk + 0.3), role("yellow")))
    if d["front"] != "flat":
        # Split windscreen: the centre post of the classic Tamil Nadu body.
        parts.append(K.box("ws_post", (0.07, 0.05, d["ws"][1] - d["ws"][0]), (0, y1 - 0.01, (d["ws"][0] + d["ws"][1]) / 2), role("black")))
    # Wipers.
    if lod == 0:
        for sx in (1, -1):
            w = K.box("wiper", (0.7, 0.02, 0.02), (sx * 0.55, y1 + 0.02, d["ws"][0] + 0.25), role("black"))
            w.rotation_euler = (0, sx * 0.5, 0)
            parts.append(w)
    if d["front"] == "decorated":
        # Visor over the windscreen with marker lamps; a chrome strip under the windscreen.
        parts.append(K.box("visor", (2 * HW - 0.1, 0.3, 0.05), (0, y1 + 0.08, d["board"][1] + 0.08), role("chrome"), rot=(0.15, 0, 0)))
        for k in range(7):
            parts.append(K.sphere("marker", 0.035, (-0.9 + k * 0.3, y1 + 0.2, d["board"][1] + 0.12), role("indicator" if k % 2 else "strobe"),
                                  segments=K.seg(8, 4), rings=K.seg(4, 3)))
        parts.append(K.box("chrome_strip", (2 * HW - 0.2, 0.03, 0.05), (0, y1 + 0.005, d["ws"][0] - 0.06), role("chrome")))
        for sx in (1, -1):
            parts.append(K.cylinder("horn", 0.06, 0.35, (sx * 0.45, y1 - 0.2, d["roof"] + 0.06), role("chrome"), rot=(math.pi / 2, 0, 0), verts=K.seg(10, 6)))
    return parts


def roof_parts(d, lod):
    y0, y1 = d["ends"]
    roof = d["roof"] + 0.05
    parts = []
    for k in range(d["hatches"]):
        y = y1 - 2.2 - k * 4.2
        parts.append(K.box("roof_hatch", (0.75, 0.75, 0.08), (0, y, roof), role("light_grey"), bevel=0.02))
    for sx in (1, -1):
        parts.append(K.box("gutter", (0.04, y1 - y0 - 0.6, 0.03), (sx * (HW - 0.2), (y0 + y1) / 2, roof - 0.06), role("alloy")))
    if d["roof_rack"]:
        for sx in (1, -1):
            parts.append(K.box("rack_rail", (0.05, 3.4, 0.05), (sx * 0.95, y0 + 2.3, roof + 0.2), role("steel")))
        for k in range(5 if lod == 0 else 2):
            parts.append(K.box("rack_bar", (1.95, 0.05, 0.05), (0, y0 + 0.7 + k * (3.2 / max(1, (4 if lod == 0 else 1))), roof + 0.2), role("steel")))
            for sx in (1, -1):
                parts.append(K.box("rack_post", (0.04, 0.04, 0.18), (sx * 0.95, y0 + 0.7 + k * (3.2 / max(1, (4 if lod == 0 else 1))), roof + 0.1), role("steel")))
    if d["ladder"]:
        parts.append(K.box("ladder_l", (0.04, 0.04, 2.2), (0.75, y0 - 0.06, 1.95), role("steel")))
        parts.append(K.box("ladder_r", (0.04, 0.04, 2.2), (1.15, y0 - 0.06, 1.95), role("steel")))
        for k in range(7 if lod == 0 else 2):
            parts.append(K.box("rung", (0.42, 0.03, 0.03), (0.95, y0 - 0.06, 1.0 + k * 0.32), role("steel")))
    if d["emergency"]:
        parts.append(K.box("emergency_door", (0.75, 0.03, 1.4), (-0.35, y0 - 0.02, 1.62), role("black")))
        parts.append(K.box("emergency_handle", (0.2, 0.04, 0.04), (-0.05, y0 - 0.04, 1.5), role("chrome")))
    return parts


def interior(d, lod):
    if lod > 0:
        return [], []
    y0, y1 = d["ends"]
    fl = d["floor"]
    cush, back = d["seat"]
    parts = []
    seats = []
    doors = [(yc - w / 2 - 0.1, yc + w / 2 + 0.1) for _n, yc, w, _t in d["doors"]]
    hip_z = fl + 0.5
    row = 0
    y = d["rows"][0]
    while y > d["rows"][1]:
        row += 1
        for side, xc in (("l", -0.77), ("r", 0.77)):
            if side == "l" and any(a < y < b for a, b in doors):
                continue
            parts.append(K.box("seat_c", (0.86, 0.42, 0.1), (xc, y, fl + 0.42), role(cush)))
            b = K.box("seat_b", (0.86, 0.07, 0.55), (xc, y - 0.24, fl + 0.72), role(back))
            b.rotation_euler = (0.15, 0, 0)
            parts.append(b)
            parts.append(K.box("seat_leg", (0.05, 0.3, 0.38), (xc - side.__eq__("l") * 0.0 + (0.36 if side == "l" else -0.36), y, fl + 0.19), role("steel")))
            for k, dx in enumerate((-0.21, 0.21)):
                nm = f"seat_r{row:02d}_{side}{k + 1}"
                K.empty(nm, (xc + dx, y - 0.02, hip_z))
                seats.append((nm, (xc + dx, y - 0.02, hip_z)))
        y -= d["pitch"]
    # Driver: seat, the engine hood beside it (front-engine buses), dash, steering.
    dy = y1 - 1.0
    parts.append(K.box("driver_seat", (0.5, 0.48, 0.12), (0.78, dy, fl + 0.42 + (0.25 if d["floor"] < 0.6 else 0.0)), role("seat_dark"), bevel=0.03))
    parts.append(K.box("driver_back", (0.5, 0.1, 0.65), (0.78, dy - 0.26, fl + 0.8 + (0.25 if d["floor"] < 0.6 else 0.0)), role("seat_dark"), bevel=0.03))
    if d["front"] != "flat":
        parts.append(K.box("engine_hood", (0.6, 1.1, 0.5), (0.15, y1 - 0.85, fl + 0.25), role("interior"), bevel=0.05))
    parts.append(K.box("dash", (2 * HW - 0.2, 0.35, 0.25), (0, y1 - 0.3, d["ws"][0] - 0.1), role("interior")))
    # Grab rails along the ceiling and stanchions at the doors.
    for sx in (1, -1):
        parts.append(K.tube("ceiling_rail", (sx * 0.38, y1 - 1.6, d["roof"] - 0.35), (sx * 0.38, y0 + 0.6, d["roof"] - 0.35), 0.016, role("alloy"), verts=6))
    for _n, yc, w, top in d["doors"]:
        for e in (-1, 1):
            parts.append(K.tube("stanchion", (-HW + 0.2, yc + e * (w / 2 + 0.06), fl), (-HW + 0.2, yc + e * (w / 2 + 0.06), d["roof"] - 0.2), 0.018, role("alloy"), verts=6))
    # Floor.
    parts.append(K.box("floor_in", (2 * HW - 0.12, y1 - y0 - 0.3, 0.02), (0, (y0 + y1) / 2, fl + 0.01), role("rubber")))
    return parts, seats


def door_leaves(name, d, liv):
    """Two leaves per doorway, hinged at the jambs, opening inwards (folding doors simplified to a
    pair of leaves). Lower panel in the livery, glazed above, a rubber edge."""
    out = []
    fl = d["floor"]
    for nm, yc, w, top in d["doors"]:
        for k, sgn in (("a", 1), ("b", -1)):
            hy = yc + sgn * w / 2
            cy = yc + sgn * w / 4
            lw = w / 2 - 0.01
            low = K.box("panel", (0.04, lw, 1.15), (-HW + 0.03, cy, 0.3 + 0.575), liv)
            up = K.box("glass", (0.04, lw - 0.06, top - 1.6), (-HW + 0.03, cy, 1.48 + (top - 1.6) / 2), role("glass"))
            fr = K.box("frame", (0.045, lw, 0.05), (-HW + 0.03, cy, top - 0.08), role("black"))
            extra = [K.box("edge", (0.05, 0.03, top - 0.35), (-HW + 0.03, yc, 0.3 + (top - 0.35) / 2), role("rubber"))] if k == "a" else []
            leaf = K.join([low, up, fr] + extra, f"door_{nm}_{k}")
            K.set_origin(leaf, (-HW + 0.03, hy, 0))
            out.append(dict(node=leaf.name, hinge=K.g((-HW + 0.03, hy, 0)), axis=[0, 1, 0], open_deg=80 * sgn, side="left",
                            notes="folding door simplified to two leaves swinging inwards"))
        # Steps inside the doorway, up to the floor.
        n = d["steps"]
        for i in range(n):
            z = 0.3 + (fl - 0.3) * (i + 1) / (n + 0.0) - 0.02
            if i == n - 1:
                break
            st = K.box("step", (0.32 + 0.0, w - 0.04, 0.05), (-HW + 0.18 + i * 0.12, yc, 0.3 + (fl - 0.3) * (i + 1) / n), role("steel"))
            out.append(dict(step=st))
    return out


def build(name, d, lod):
    K.LOD = lod
    K.reset()
    liv, samples = livery(name, d)
    shell = bus_shell(name, d, liv, lod)
    if lod < 2:
        parts = [shell] + pillars_and_bars(d, liv, lod) + front_and_rear(d, liv, lod) + roof_parts(d, lod)
    else:
        # Far LOD: the shell, lamp and bumper blocks and plain wheels only.
        y0, y1 = d["ends"]
        sk = d["skirt"]
        parts = [shell, K.box("bumper", (2 * HW - 0.06, 0.14, 0.2), (0, y1 + 0.06, sk + 0.04), role("black")),
                 K.box("bumper_rear", (2 * HW - 0.06, 0.14, 0.18), (0, y0 - 0.06, sk + 0.02), role("black"))]
        for sx in (1, -1):
            parts.append(K.box("headlamp", (0.4, 0.04, 0.16), (sx * 0.86, y1 + 0.01, sk + 0.38), role("headlamp")))
            parts.append(K.box("tail", (0.16, 0.04, 0.42), (sx * (HW - 0.14), y0 - 0.01, sk + 0.55), role("taillamp")))
    inside, seats = interior(d, lod)
    parts += inside
    y0, y1 = d["ends"]
    doors = []
    if lod == 0:
        for e in door_leaves(name, d, liv):
            if "step" in e:
                parts.append(e["step"])
            else:
                doors.append(e)
    ya, yr = d["axles"]
    r = d["tyre"]
    if lod == 2:
        for y in (ya, yr):
            for sx in (1, -1):
                parts.append(K.cylinder("wheel_lod2", r, 0.3, (sx * (HW - 0.2), y, r), role("rubber"), rot=(0, math.pi / 2, 0), verts=8, caps=False))
    body = K.join(parts, "body")
    T.project_livery(body, "livery_" + name, y0, y1, HW, d["roof"] + 0.08)
    for nd in K.bpy.context.scene.objects:
        if nd.name.startswith("door_"):
            T.project_livery(nd, "livery_" + name, y0, y1, HW, d["roof"] + 0.08)
    # Destination boards: separate nodes so the game can draw the place names on them.
    bz0, bz1 = d["board"]
    boards = []
    if lod < 2:
        hit = K.surface((0, y1 + 2, (bz0 + bz1) / 2), (0, -1, 0), only=shell)
        fy = hit[0].y + 0.012 if hit else y1
        def board(nm, size, at, normal):
            """A black LED board with a lit amber line (the game draws the place name over it)."""
            sx_, sy_, sz_ = size
            frame = K.box(nm + "_frame", size, at, role("black"))
            n = Vector(normal)
            lit = (sx_ * 0.82 if sx_ > 0.1 else sx_ + 0.004, sy_ * 0.82 if sy_ > 0.1 else sy_ + 0.004, sz_ * 0.45)
            led = K.box(nm + "_led", lit, Vector(at) + n * 0.004, role("led_amber"))
            return K.join([frame, led], nm)

        fb = board("dest_front", (2 * HW - 0.62, 0.03, bz1 - bz0 - 0.06), (0, fy, (bz0 + bz1) / 2), (0, 1, 0))
        boards.append(("dest_front", fb, (0, fy, (bz0 + bz1) / 2), (round(2 * HW - 0.62, 2), round(bz1 - bz0 - 0.06, 2)), [0, 0, -1]))
        rb = board("dest_rear", (1.0, 0.03, 0.26), (0, y0 - 0.005, d["band"][1] - 0.2), (0, -1, 0))
        boards.append(("dest_rear", rb, (0, y0, d["band"][1] - 0.2), (1.0, 0.26), [0, 0, 1]))
        door_y = d["doors"][0][1] - d["doors"][0][2] / 2 - 0.6
        sb = board("dest_side", (0.03, 1.0, 0.24), (-HW - 0.012, door_y, d["band"][1] - 0.2), (-1, 0, 0))
        boards.append(("dest_side", sb, (-HW, door_y, d["band"][1] - 0.2), (1.0, 0.24), [-1, 0, 0]))
        for nm, ob, at, _s, _n in boards:
            K.set_origin(ob, at)
    # Wheels: single front, dual rear (one node per side).
    wheels = []
    if lod < 2:
        tf = HW - 0.25
        tr = HW - 0.29
        for nm, x, y, dual in (("wheel_fl", -tf, ya, False), ("wheel_fr", tf, ya, False), ("wheel_rl", -tr, yr, True), ("wheel_rr", tr, yr, True)):
            T.steel_wheel(nm, (x, y, r), r, 0.27, d["rim"], rim_role="light_grey" if name != "bus_mofussil" else "chrome", studs=8, dual=dual,
                          hubcap="chrome" if name == "bus_mofussil" else None)
            wheels.append((nm, x, y, r, nm.startswith("wheel_f"), not nm.startswith("wheel_f")))
    steer = None
    if lod < 2:
        centre = Vector((0.78, y1 - 0.5, d["floor"] + 0.95 + (0.25 if d["floor"] < 0.6 else 0.0)))
        st, normal = C.steering_wheel(centre, 0.24, math.radians(58))
        steer = dict(node="steering", hub=K.g(centre), axis=K.g_axis(normal), radius=0.24)
        for side in (1, -1):
            K.empty("grip_steer_" + ("r" if side > 0 else "l"), centre + Vector((side * 0.23, 0, 0)))
        K.empty("seat_driver", (0.78, y1 - 1.0, d["floor"] + 0.55 + (0.25 if d["floor"] < 0.6 else 0.0)))
    if lod == 0:
        # Conductor: a seat by the rear door (or behind the front door), grips on the rails.
        cy = d["doors"][-1][1] + d["doors"][-1][2] / 2 + 0.45 if len(d["doors"]) > 1 else d["doors"][0][1] - d["doors"][0][2] / 2 - 0.5
        K.empty("seat_conductor", (-0.85, cy, d["floor"] + 0.5))
        for sx, nm in ((1, "r"), (-1, "l")):
            for k, y in enumerate((y1 - 2.5, (y0 + y1) / 2, y0 + 1.5)):
                K.empty(f"grip_rail_{nm}{k + 1}", (sx * 0.38, y, d["roof"] - 0.35))
        for nm, yc, w, _t in d["doors"]:
            K.empty(f"grip_door_{nm}", (-HW + 0.2, yc + w / 2 + 0.06, d["floor"] + 0.9))
            K.empty(f"stand_door_{nm}", (-HW - 0.7, yc, 0))
        K.empty("standing_area", (0, (y0 + y1) / 2, d["floor"]))
    K.empty("marker_front", (0, y1 + 0.2, 1.0))  # the bumper and mirror arms stand ahead of the face
    if lod < 2:
        K.empty("exit_driver", (-HW - 0.8, d["doors"][0][1], 0))
    res = T.export(name, lod)
    res.update(doors=doors, seats=seats, steer=steer, samples=samples, boards=[(n, at, s, nn) for n, _o, at, s, nn in boards])
    return res


def manifest(name, d, results):
    ya, yr = d["axles"]
    r = d["tyre"]
    tf, tr = HW - 0.25, HW - 0.29
    wheels = [("wheel_fl", -tf, ya, r, True, False), ("wheel_fr", tf, ya, r, True, False),
              ("wheel_rl", -tr, yr, r, False, True), ("wheel_rr", tr, yr, r, False, True)]
    r0 = results[0]
    m = T.base_manifest(name, d["label"], "bus", SOURCE, results, wheels, d["mass"], [(None, 40), (40, 250), (250, 900)])
    y0, y1 = d["ends"]
    fl = d["floor"]
    seats = [dict(node="seat_driver", hip=K.g((0.78, y1 - 1.0, fl + 0.55 + (0.25 if fl < 0.6 else 0.0))), role="driver", door=None)]
    cy = d["doors"][-1][1] + d["doors"][-1][2] / 2 + 0.45 if len(d["doors"]) > 1 else d["doors"][0][1] - d["doors"][0][2] / 2 - 0.5
    seats.append(dict(node="seat_conductor", hip=K.g((-0.85, cy, fl + 0.5)), role="conductor", door=None))
    seats += [dict(node=n, hip=K.g(p), role="passenger", door=None) for n, p in r0["seats"]]
    grips = [dict(node="grip_steer_l", hand="left"), dict(node="grip_steer_r", hand="right")]
    for nm in ("r", "l"):
        for k in range(3):
            grips.append(dict(node=f"grip_rail_{nm}{k + 1}", hand="either", what="ceiling grab rail (standing passengers, conductor)"))
    anchors = [dict(node="standing_area", what="aisle floor for standing passengers")]
    exits = [dict(node="exit_driver", what="driver gets out by the front door")]
    for nm, yc, w, _t in d["doors"]:
        grips.append(dict(node=f"grip_door_{nm}", hand="either", what=f"stanchion at the {nm} door"))
        exits.append(dict(node=f"stand_door_{nm}", what=f"kerb point at the {nm} door (board and alight here)"))
    boards = [dict(node=n, centre=K.g(at), size_m=list(s), faces=nn) for n, at, s, nn in r0["boards"]]
    m.update(
        steering=r0["steer"], doors=r0["doors"], seats=seats, grips=grips, anchors=anchors, exits=exits,
        cargo=[dict(node="standing_area", what="aisle floor")],
        pose=dict(lean=0, hand=[0.2, 0.25, -0.42], foot=[0.12, -0.42, -0.62]),
        entry=dict(side=-1, point=K.g((-HW - 0.8, d["doors"][0][1], 0)), door="folding", style="door",
                   aisle=[K.g((-0.8, d["doors"][0][1], fl)), K.g((0.0, d["doors"][0][1] - 0.6, fl))]),
        collision=[dict(shape="box", centre=K.g((0, (y0 + y1) / 2, (d["skirt"] + d["roof"]) / 2)),
                        half_extents=[HW, round((d["roof"] - d["skirt"]) / 2, 3), round((y1 - y0) / 2, 3)])],
        destination_boards=boards,
        destinations=d["destinations"],
        destination_notes="amber LED panels (material cell `led_amber`); the game draws one place name per board, Tamil above "
                          "English, from `destinations` (real place names, no route numbers or operator names). Faces is the outward normal.",
        livery=f"livery_{name} (512 px painted texture): {d['label']}; fleet number {d['fleet']!r} invented, front and rear only",
        texture_samples=r0["samples"],
        floor_height_m=fl,
        required_nodes=["body", "steering", "seat_driver", "seat_conductor", "dest_front", "dest_side", "dest_rear", "standing_area"],
        physics=T.physics_block(d["mass"], d["ride"], wheels, d["physics"]),
        notes=("Handling from the Three.js game's bus (specs.ts `bus`); " if name == "bus_city" else
               "Handling estimated from the Three.js bus; ") + "starting values for tuning. Rear wheels are dual (one node per side).",
    )
    T.write(name, m)


if __name__ == "__main__":
    for name, d in BUSES.items():
        if not K.ONLY or name in K.ONLY:
            manifest(name, d, [build(name, d, lod) for lod in range(3)])
    K.save_palette(os.path.join(K.ROOT, "assets", "vehicles", "shared"))
