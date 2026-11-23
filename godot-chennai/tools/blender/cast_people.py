"""
The Chennai cast for the Godot game, figure by figure from the owner's concept boards
(`godot-chennai/docs/concept/characters/`). Each person records the board and the figure it
comes from. Colours follow the boards, except where a board shows a brand: those become plain
invented colours (no logos, slogans, insignia, school names or company badges).

Imported by `characters.py` (the builder). Garment helpers return the specs the builder's
GARMENT BUILDERS understand; see `docs/characters.md` for what each one makes.
"""
import numpy as np  # noqa: F401  (kept for helpers that use it)

ROLES = {
    # from the Three.js game (kept so its casting rules carry over)
    "pedestrian", "auto-driver", "cab-driver", "traffic-police", "police", "vendor", "tea-worker", "construction",
    "delivery", "shopkeeper", "office", "college", "school", "passenger",
    # new for the Godot cast
    "bus-driver", "bus-conductor", "healthcare", "security", "sanitation", "services", "worker", "family",
    "traditional", "temple", "sport", "tourist", "homemaker", "teacher", "elderly",
}
CLOTHING = {"saree", "veshti", "lungi", "salwar", "chudidar", "kurta", "uniform", "office", "casual", "work", "school", "sport", "traditional"}
BOARDS = {
    "phase1": "docs/concept/characters/phase1-20-characters.webp",
    "phase2": "docs/concept/characters/phase2-60-characters.webp",
}


def c(hex_colour):
    """An sRGB colour from '#rrggbb' (texture pixels are sRGB)."""
    h = hex_colour.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# Colours used across the cast (all invented; no brand or livery colours).
BLACK_HAIR = c("#0b0908")
DARK_HAIR = c("#16110d")
GREY_HAIR = c("#8c8a86")
WHITE_HAIR = c("#c9c6c0")
SALT_PEPPER = c("#4a4744")
KHAKI = c("#b4a072")
KHAKI_DARK = c("#8f7748")
OFF_WHITE = c("#ecebe4")
NAVY = c("#1f2a44")
DENIM = c("#3b5378")
CHARCOAL = c("#2c2b2e")


# ----------------------------------------------------------------------------------------------
# People
# ----------------------------------------------------------------------------------------------
def age_macro(years):
    """MakeHuman's age slider: 0 = 1 year, 0.1875 = 11, 0.5 = 25, 1 = 90."""
    if years <= 11:
        return max(0.0, (years - 1) / 10 * 0.1875)
    if years <= 25:
        return 0.1875 + (years - 11) / 14 * 0.3125
    return min(1.0, 0.5 + (years - 25) / 65 * 0.5)


def age_group(years):
    if years < 13:
        return "child"
    if years < 20:
        return "teen"
    if years < 36:
        return "young"
    if years < 60:
        return "middle"
    return "elderly"


def person(pid, sex, years, roles, board, figure, label, clothing, outfit, **kw):
    """One member of the cast.

    board/figure/label: where on the owner's boards this person comes from (figure number as
    printed on the board, or the board's group and position). clothing: tags from CLOTHING;
    outfit: a short description of what they wear (goes to the manifest).
    tone: 0 (light-medium brown) to 1 (dark brown). face: a seed for small face differences.
    clothes: MakeHuman garments, each {"asset", "colour" | "upper"/"lower", "split", "drop",
    "prints", "pattern"}. garments: garments made here (see GARMENT BUILDERS). shoes:
    "sandals", "barefoot" or a MakeHuman shoe asset.
    """
    assert set(roles) <= ROLES, roles
    assert set(clothing) <= CLOTHING, clothing
    assert board in BOARDS, board
    group = age_group(years)
    male = sex == "male"
    spec = {
        "id": pid,
        "file": f"{pid.replace('-', '_')}.glb",
        "sex": sex,
        "years": years,
        "age": group,
        "roles": list(roles),
        "board": board,
        "figure": figure,
        "label": label,
        "clothing": list(clothing),
        "outfit": outfit,
        "texture": 512,
        "budget": 10000,
        "proxy": "male1591" if male else "female1605",
        "body": {"muscle": 0.5, "weight": 0.5, "height": 0.5, "proportions": 0.5},
        "tone": 0.5,
        "face": sum(map(ord, pid)),
        "targets": {},
        "hair": ("short02" if male else "braid01", BLACK_HAIR),
        "eyebrows": "eyebrow001" if male else "eyebrow010",
        "eyelashes": True,
        "facial": [],
        "facial_colour": None,
        "bindi": None,
        "clothes": [],
        "garments": [],
        "shoes": "sandals",
        "sandal_colours": (c("#2b1d12"), c("#5a3520")),
        # other board figures this person also plays (board, figure, label)
        "also": [],
        # what differs from the board figure on purpose (logo removed, sex changed for 30 + 30...)
        "note": "",
    }
    spec.update(kw)
    if spec["facial_colour"] is None:
        spec["facial_colour"] = spec["hair"][1] if group != "elderly" else SALT_PEPPER
    return spec


# ----------------------------------------------------------------------------------------------
# Garment helpers
# ----------------------------------------------------------------------------------------------
def shirt_trousers(shirt, trousers, pattern=None):
    """Long-sleeved cotton shirt over trousers (MakeHuman male_casualsuit01, recoloured)."""
    item = {"asset": "male_casualsuit01", "split": "z", "upper": shirt, "lower": trousers, "flatten": True}
    if pattern:
        item["pattern"] = pattern
    return [item]


def shirt_only(shirt, pattern=None):
    """The same shirt without the trousers (worn over a veshti or lungi)."""
    item = {"asset": "male_casualsuit01", "split": "z", "upper": shirt, "drop": "lower"}
    if pattern:
        item["pattern"] = pattern
    return [item]


def long_sleeve_top(colour, lower=None):
    """Plain long-sleeved top (male_casualsuit02's T-shirt, logo painted out), with its jeans."""
    item = {"asset": "male_casualsuit02", "split": "uv", "lower_boxes": [(0.0, 0.0, 0.72, 0.6)], "upper": colour, "prints": True}
    if lower:
        item["lower"] = lower
    else:
        item["drop"] = "lower"
    return item


def jacket(colour, lower=None):
    """Zipped jacket over a shirt (male_casualsuit05), one plain colour, its jeans recoloured."""
    item = {"asset": "male_casualsuit05", "split": "uv", "lower_boxes": [(0.0, 0.0, 0.56, 0.46)], "upper": colour, "prints": True, "flatten": True}
    if lower:
        item["lower"] = lower
    else:
        item["drop"] = "lower"
    return item


def women_tee_jeans(top, jeans_colour=DENIM):
    """female_casualsuit01: T-shirt (print painted out) and jeans."""
    return {"asset": "female_casualsuit01", "split": "z", "upper": top, "lower": jeans_colour, "prints": True}


def women_jeans(jeans_colour=DENIM):
    return {"asset": "female_casualsuit01", "split": "z", "lower": jeans_colour, "drop": "upper"}


def women_shirt(colour, pattern=None):
    """A long-sleeved blouse (female_elegantsuit01's top, its stripes flattened), skirt dropped."""
    item = {"asset": "female_elegantsuit01", "split": "z", "upper": colour, "drop": "lower", "flatten": True}
    if pattern:
        item["pattern"] = pattern
    return item


def slim_trousers(colour):
    """Slim trousers: female_sportsuit01's track trousers in a plain dark colour, top dropped."""
    return {"asset": "female_sportsuit01", "split": "z", "lower": colour, "drop": "upper", "flatten": True}


def tshirt(colour, asset="elvs_crude_t-shirt_male"):
    return {"asset": asset, "colour": colour}


def trousers(colour, asset="toigo_wool_pants"):
    return {"asset": asset, "colour": colour}


def cargo(colour):
    return {"asset": "cortu_cargo_pants", "colour": colour}


def jeans(colour=c("#2c3a55")):
    """The jeans of male_casualsuit06 (its T-shirt dropped)."""
    return {"asset": "male_casualsuit06", "split": "uv", "lower": colour, "drop": "upper"}


def banian():
    """Sleeveless cotton vest, the everyday undershirt worn on its own in the heat."""
    return {"asset": "elvs_male_athletic_tank1", "colour": c("#efeee8")}


def veshti(border=c("#b8902c"), length="ankle", colour=OFF_WHITE):
    return {"kind": "tube", "texture": ("veshti", colour, border), "bottom": length, "flare": 0.05}


def lungi(ground, stripes, length="ankle"):
    return {"kind": "tube", "texture": ("check", ground, stripes), "bottom": length, "flare": 0.05}


def saree(base, border, motif, blouse):
    return [
        {"kind": "region", "region": "blouse", "colour": blouse, "offset": 0.004},
        {"kind": "tube", "texture": ("saree", base, border, motif), "bottom": "floor", "flare": 0.03, "pleats": True, "top": "navel"},
        {"kind": "region", "region": "pallu", "texture": ("pallu", base, border, motif), "offset": 0.014},
    ]


def kurta(colour, length="knee", pattern=None, sleeves=0.75, slits=True):
    return [
        {"kind": "region", "region": "kurta_top", "colour": colour, "pattern": pattern, "offset": 0.008, "sleeves": sleeves},
        {"kind": "tube", "texture": ("plain", colour, pattern), "top": "hip", "bottom": length, "flare": 0.015, "slits": slits, "straight": True},
    ]


def dupatta(colour, border=None):
    return {"kind": "region", "region": "dupatta", "texture": ("dupatta", colour, border or colour), "offset": 0.02}


def leggings(colour):
    return {"kind": "region", "region": "leggings", "colour": colour, "offset": 0.003}


def towel(colour=c("#cdb894"), stripe=c("#b23a3a")):
    return {"kind": "region", "region": "towel", "texture": ("towel", colour, stripe), "offset": 0.045}


def head_cloth(colour):
    return {"kind": "region", "region": "headcloth", "colour": colour, "offset": 0.02}


def hivis(colour=c("#e8742a"), band=c("#c9ccc8")):
    """A plain hi-visibility safety vest (invented colour, two reflective bands, no lettering)."""
    return {"kind": "region", "region": "vest", "texture": ("hivis", colour, band), "offset": 0.03}


def apron(colour, stripe):
    """A shop apron: bib over the chest, skirt in front to below the knee, vertical stripes."""
    return [
        {"kind": "region", "region": "apron_bib", "texture": ("stripes", colour, stripe), "offset": 0.022},
        {"kind": "tube", "texture": ("stripes", colour, stripe), "top": "waist", "bottom": "calf", "flare": 0.03, "front": True, "grow": 0.02},
    ]


def socks(colour=c("#f2f2ee")):
    return {"kind": "region", "region": "socks", "colour": colour, "offset": 0.004}


def backpack(colour, strap=None):
    return [{"kind": "backpack", "colour": colour},
            {"kind": "region", "region": "straps", "colour": strap or colour, "offset": 0.03}]


def idtag(colour=c("#2f5d8a")):
    return {"kind": "idtag", "colour": colour}


def belt(colour=c("#2a2018")):
    return {"kind": "belt", "colour": colour}


def police(sex):
    """A generic khaki police uniform: shirt, trousers, belt, peaked cap. No insignia."""
    items = shirt_trousers(KHAKI, KHAKI) if sex == "male" else [{"asset": "female_casualsuit01", "split": "z", "upper": KHAKI, "lower": KHAKI, "prints": True}]
    return items


P1, P2 = "phase1", "phase2"

# ----------------------------------------------------------------------------------------------
# Phase 1: the 20 base characters (board phase1-20-characters.webp), figure numbers as printed.
# ----------------------------------------------------------------------------------------------
PHASE1 = [
    # ---------------------------------------------------------------- men (top row)
    person("college-student-m", "male", 20, ["college", "pedestrian", "passenger"], P1, 1, "College Student",
           ["casual"], "maroon long-sleeved top, blue jeans, white trainers, dark backpack, short beard",
           tone=0.5, body={"muscle": 0.5, "weight": 0.42, "height": 0.55, "proportions": 0.55},
           hair=("short04", BLACK_HAIR), facial=["beard", "moustache"],
           clothes=[long_sleeve_top(c("#6e2233")), jeans(DENIM)], garments=backpack(c("#2d2f33")), shoes="shoes05"),
    person("it-professional-m", "male", 28, ["office", "pedestrian", "passenger"], P1, 2, "IT Professional",
           ["office"], "light blue formal shirt, charcoal trousers, belt, blank ID card on a lanyard, black shoes, short beard",
           tone=0.45, body={"muscle": 0.5, "weight": 0.5, "height": 0.55, "proportions": 0.55},
           facial=["beard", "moustache"], clothes=shirt_trousers(c("#8badd8"), c("#2f2e31")),
           garments=[belt(), idtag(c("#2f4f7a"))], shoes="shoes04"),
    person("delivery-rider", "male", 25, ["delivery", "pedestrian"], P1, 3, "Delivery Rider",
           ["casual", "work"], "plain teal riding jacket (board's branded orange replaced, no logo), black cargo trousers, grey trainers, dark backpack",
           tone=0.55, body={"muscle": 0.5, "weight": 0.45, "height": 0.52, "proportions": 0.5},
           facial=["stubble", "moustache"], clothes=[jacket(c("#1f6f78")), cargo(c("#26272b"))],
           garments=backpack(c("#2b2b2e")), shoes="shoes06"),
    person("auto-driver", "male", 45, ["auto-driver"], P1, 4, "Auto Driver",
           ["uniform"], "khaki shirt and khaki trousers (the auto driver's dress), sandals, moustache",
           tone=0.7, body={"muscle": 0.5, "weight": 0.58, "height": 0.46, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_trousers(c("#7f7552"), c("#776d4a"))),
    person("shopkeeper-m", "male", 48, ["shopkeeper", "vendor", "pedestrian"], P1, 5, "Shopkeeper",
           ["veshti"], "blue-and-red checked shirt, white veshti with a gold border, cream towel on the shoulder, sandals, moustache",
           tone=0.65, body={"muscle": 0.45, "weight": 0.68, "height": 0.46, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_only(c("#9aa4d4"), ("check", c("#b04a52"), 64)), garments=[veshti(c("#b38a34")), towel(c("#d9c59a"), c("#b8a070"))]),
    person("police-constable", "male", 42, ["police", "traffic-police"], P1, 6, "Police Constable",
           ["uniform"], "generic khaki uniform, dark red-brown belt, khaki peaked cap (no insignia, badges or shoulder marks), brown shoes, moustache",
           tone=0.65, body={"muscle": 0.55, "weight": 0.6, "height": 0.55, "proportions": 0.5}, facial=["moustache"],
           clothes=police("male"), garments=[belt(c("#5a2a1e")), {"kind": "cap", "style": "peaked", "colour": KHAKI_DARK, "band": c("#3a2a1a")}],
           shoes="shoes04"),
    person("construction-worker", "male", 32, ["construction", "worker"], P1, 7, "Construction Worker",
           ["work"], "purple T-shirt, plain orange hi-visibility vest with reflective bands, grey-olive cargo trousers, work boots, yellow hard hat",
           tone=0.85, body={"muscle": 0.65, "weight": 0.42, "height": 0.5, "proportions": 0.5}, facial=["beard", "moustache"],
           clothes=[{"asset": "elvs_crude_t-shirt_male", "colour": c("#6a4b8c"), "prints": True}, cargo(c("#5b5a4c"))], garments=[hivis(), {"kind": "hardhat", "colour": c("#e8c22a")}],
           shoes="shoes03"),
    person("office-employee-m", "male", 30, ["office", "pedestrian", "passenger"], P1, 8, "Office Employee",
           ["office"], "pale lilac checked shirt, charcoal trousers, brown belt, blank ID card, brown shoes",
           tone=0.5, body={"muscle": 0.5, "weight": 0.48, "height": 0.55, "proportions": 0.55}, facial=["stubble", "moustache"],
           clothes=shirt_trousers(c("#ddd4e2"), c("#2e2d30"), ("check", c("#a99bb5"), 72)),
           garments=[belt(c("#4a2e1c")), idtag(c("#3c5f8f"))], shoes="shoes01"),
    person("elderly-man", "male", 70, ["pedestrian", "passenger", "elderly"], P1, 9, "Elderly Man",
           ["veshti", "traditional"], "pale pink shirt, white veshti with a gold border, sandals, white hair, white moustache and short beard",
           tone=0.6, body={"muscle": 0.35, "weight": 0.55, "height": 0.42, "proportions": 0.45}, hair=("short02", WHITE_HAIR),
           facial=["moustache", "beard"], facial_colour=WHITE_HAIR, clothes=shirt_only(c("#ead6d8")), garments=[veshti(c("#b8902c"))]),
    person("tea-vendor", "male", 46, ["tea-worker", "vendor"], P1, 10, "Street Vendor (Tea)",
           ["lungi"], "brown-and-red checked shirt, blue checked lungi to the ankle, red towel on the shoulder, sandals, salt-and-pepper beard",
           tone=0.75, body={"muscle": 0.5, "weight": 0.6, "height": 0.47, "proportions": 0.5}, hair=("short04", DARK_HAIR),
           facial=["moustache", "beard"], facial_colour=SALT_PEPPER, clothes=shirt_only(c("#b99a8a"), ("check", c("#8a3a30"), 56)),
           garments=[lungi(c("#2f5d9a"), [c("#8db0d8"), c("#1d2f55")]), towel(c("#b0302a"), c("#e0c060"))]),
    # ---------------------------------------------------------------- women (bottom row)
    person("college-student-f", "female", 20, ["college", "pedestrian", "passenger"], P1, 11, "College Student",
           ["casual"], "plain white T-shirt (the board's slogan left out), blue jeans, trainers, long open hair, dark backpack",
           tone=0.45, body={"muscle": 0.45, "weight": 0.44, "height": 0.52, "proportions": 0.55}, hair=("long01", BLACK_HAIR),
           clothes=[women_tee_jeans(c("#f1f0ec"))], garments=backpack(c("#2c2d31")), shoes="shoes05"),
    person("it-professional-f", "female", 27, ["office", "pedestrian", "passenger"], P1, 12, "IT Professional",
           ["office"], "light blue shirt, dark brown trousers, belt, blank ID card on a lanyard, flat sandals, ponytail",
           tone=0.5, body={"muscle": 0.45, "weight": 0.48, "height": 0.52, "proportions": 0.55}, hair=("ponytail01", BLACK_HAIR),
           clothes=[women_shirt(c("#93b2dc")), slim_trousers(c("#3a2c26"))], garments=[belt(c("#1e1a18")), idtag(c("#2f5d8a"))]),
    person("working-professional-f", "female", 32, ["office", "pedestrian", "passenger"], P1, 13, "Working Professional",
           ["chudidar", "kurta"], "dark green calf-length kurta with fine dots, white leggings, blank ID card, sandals, plait, bindi",
           tone=0.55, body={"muscle": 0.45, "weight": 0.5, "height": 0.5, "proportions": 0.55}, bindi=c("#8a1020"),
           garments=[leggings(c("#f1efe8"))] + kurta(c("#1f4a35"), "calf", ("dots", c("#3f7058"), 30)) + [idtag(c("#2f5d8a"))]),
    person("homemaker", "female", 42, ["homemaker", "pedestrian", "passenger", "family"], P1, 14, "Homemaker",
           ["saree"], "mustard-yellow saree with a maroon and gold border, maroon blouse, plait, bindi, sandals",
           tone=0.6, body={"muscle": 0.4, "weight": 0.62, "height": 0.42, "proportions": 0.5}, hair=("bun", BLACK_HAIR), bindi=c("#8a1020"),
           garments=saree(c("#c4952f"), c("#7a1f2a"), c("#e8c45a"), c("#7a1f2a"))),
    person("shopkeeper-f", "female", 40, ["shopkeeper", "vendor", "pedestrian"], P1, 15, "Shopkeeper",
           ["casual", "work"], "rose-pink printed top, grey-and-black striped apron, jeans, sandals, plait",
           tone=0.6, body={"muscle": 0.45, "weight": 0.56, "height": 0.45, "proportions": 0.5}, bindi=c("#8a1020"),
           clothes=[women_jeans(c("#34486a"))],
           garments=[{"kind": "region", "region": "kurta_top", "colour": c("#c0485e"), "pattern": ("dots", c("#e8b0b8"), 26), "offset": 0.006, "sleeves": 0.75}]
           + apron(c("#3a3a40"), c("#c8c8c8"))),
    person("nurse", "female", 30, ["healthcare", "pedestrian", "passenger"], P1, 16, "Nurse",
           ["uniform"], "white short-sleeved tunic and white trousers (no badge), blank ID card, white shoes, hair in a bun",
           tone=0.5, body={"muscle": 0.45, "weight": 0.5, "height": 0.48, "proportions": 0.55}, hair=("bun", BLACK_HAIR),
           garments=[leggings(c("#f3f3f1"))] + kurta(c("#f4f4f2"), "thigh", sleeves=0.42, slits=True) + [idtag(c("#2f6a8a"))],
           shoes="shoes05"),
    person("school-girl", "female", 12, ["school"], P1, 17, "School Student",
           ["school", "uniform"], "generic uniform: light blue short-sleeved shirt, navy pinafore, white socks, black shoes, two plaits, dark backpack (no school name)",
           tone=0.55, eyelashes=False, body={"muscle": 0.45, "weight": 0.45, "height": 0.52, "proportions": 0.5},
           garments=[{"kind": "region", "region": "school_shirt", "colour": c("#cfdcee"), "offset": 0.004},
                     {"kind": "region", "region": "pinafore", "colour": c("#24346a"), "offset": 0.01},
                     {"kind": "tube", "texture": ("plain", c("#24346a"), ("pleat", None, 24)), "top": "waist", "bottom": "knee", "flare": 0.09},
                     socks()] + backpack(c("#2d2f36")),
           shoes="shoes04"),
    person("elderly-woman", "female", 68, ["pedestrian", "passenger", "elderly"], P1, 18, "Elderly Woman",
           ["saree", "traditional"], "purple silk-look saree with a gold border, purple blouse, grey hair in a plait, sandals",
           tone=0.6, body={"muscle": 0.35, "weight": 0.52, "height": 0.36, "proportions": 0.45}, hair=("bun", GREY_HAIR), eyelashes=False,
           garments=saree(c("#6e1f6a"), c("#c9a13a"), c("#d4b05a"), c("#6e1f6a"))),
    person("flower-vendor", "female", 38, ["vendor", "pedestrian"], P1, 19, "Street Vendor (Flowers)",
           ["saree"], "green saree with a magenta and gold border, lime blouse, plait, bindi, sandals",
           tone=0.75, body={"muscle": 0.45, "weight": 0.55, "height": 0.42, "proportions": 0.5}, bindi=c("#8a1020"),
           garments=saree(c("#3a7434"), c("#8e2a5e"), c("#cdb050"), c("#a9b23e"))),
    person("young-professional-f", "female", 25, ["office", "pedestrian", "passenger"], P1, 20, "Young Professional",
           ["chudidar", "kurta"], "pink knee-length kurta with a fine print, white leggings, blank ID card, sandals, long open hair",
           tone=0.45, body={"muscle": 0.45, "weight": 0.45, "height": 0.5, "proportions": 0.55}, hair=("long01", BLACK_HAIR),
           garments=[leggings(c("#f2efe8"))] + kurta(c("#e39ab3"), "knee", ("dots", c("#f3cfd9"), 28)) + [idtag(c("#2f5d8a"))]),
]


# ----------------------------------------------------------------------------------------------
# Phase 2: the 60 of board phase2-60-characters.webp. The board shows 74 figures (two couples,
# more men than women) under the heading "30 Male + 30 Female": the 20 phase-1 people play the
# matching figures (`also`), 40 new people play the rest, and a few figures are left out or
# played by someone already cast (docs/characters.md lists them). Not cast yet (10 figures):
# Tiffin Vendor, Street Shop Owner, Baker, Plumber, Office Assistant, Pharmacist, Young Man,
# Boy (8-10), Playful Boy (Cricket), Cyclist. Four figures the board draws as men are cast as
# women to reach the board's 30 + 30 (noted per person).
# Figure ids: "<group>-<position>" in the board's reading order; crops are pixel boxes on the
# 1536 x 1024 board (for the side-by-side review sheets).
# ----------------------------------------------------------------------------------------------
NOT_CAST = ["Tiffin Vendor", "Street Shop Owner", "Baker", "Plumber", "Office Assistant", "Pharmacist", "Young Man",
            "Boy (8-10)", "Playful Boy (Cricket)", "Cyclist"]
ROWS = {0: (95, 245), 1: (248, 395), 2: (398, 550), 3: (553, 718), 4: (722, 918)}


def fig(row, x, half=48):
    y0, y1 = ROWS[row]
    return (x - half, y0, x + half, y1)


ALSO = {
    "college-student-m": [("phase2", "students-1", "College Boy")],
    "it-professional-m": [("phase2", "office-1", "Software Engineer"), ("phase2", "families-8", "Young Couple (man)")],
    "delivery-rider": [("phase2", "transport-5", "Delivery Rider"), ("phase2", "transport-6", "Logistics Rider")],
    "auto-driver": [("phase2", "transport-1", "Auto Driver")],
    "shopkeeper-m": [("phase2", "vendors-7", "Petty Shop Owner")],
    "police-constable": [("phase2", "police-2", "Police Constable"), ("phase2", "police-4", "Home Guard")],
    "construction-worker": [("phase2", "workers-1", "Construction Worker")],
    "office-employee-m": [("phase2", "office-3", "Office Executive")],
    "elderly-man": [("phase2", "elderly-1", "Elderly Man (Veshti)"), ("phase2", "traditional-1", "Man (Veshti)")],
    "tea-vendor": [("phase2", "vendors-1", "Tea Stall Owner")],
    "college-student-f": [("phase2", "students-2", "College Girl")],
    "it-professional-f": [("phase2", "office-2", "Product Analyst")],
    "nurse": [("phase2", "healthcare-2", "Nurse")],
    "school-girl": [("phase2", "students-6", "School Girl")],
    "elderly-woman": [("phase2", "elderly-2", "Elderly Woman (Saree)")],
    "flower-vendor": [("phase2", "vendors-3", "Flower Seller")],
    "young-professional-f": [("phase2", "families-8", "Young Couple (woman)")],
}
for _spec in PHASE1:
    _spec["also"] = ALSO.get(_spec["id"], [])

SWAPPED = "the board draws this figure as a man; cast as a woman for the board's 30 + 30 split"

PHASE2 = [
    # ================================================================ men (20)
    person("engineering-student", "male", 21, ["college", "pedestrian", "passenger"], P2, "students-3", "Engineering Student",
           ["casual"], "beige shirt, blue jeans, dark backpack, blank ID card, trainers, beard",
           crop=fig(0, 312), tone=0.55, body={"muscle": 0.5, "weight": 0.45, "height": 0.52, "proportions": 0.5}, facial=["beard", "moustache"],
           clothes=shirt_only(c("#d8cdb4")) + [jeans(DENIM)], garments=backpack(c("#2e3236")) + [idtag(c("#2f5d8a"))], shoes="shoes06"),
    person("school-boy", "male", 10, ["school", "passenger"], P2, "students-5", "School Boy",
           ["school", "uniform"], "generic uniform: white shirt, navy trousers, black belt, black shoes, backpack (no school name)",
           crop=fig(0, 476), tone=0.6, eyelashes=False, body={"muscle": 0.45, "weight": 0.45, "height": 0.5, "proportions": 0.5},
           clothes=shirt_trousers(c("#f2f2f0"), NAVY), garments=[belt(c("#1c1c1c"))] + backpack(c("#33405a")), shoes="shoes04"),
    person("sports-student", "male", 16, ["school", "pedestrian", "passenger"], P2, "students-8", "Student (Sports)",
           ["sport", "school"], "white polo shirt, navy track trousers, white trainers",
           crop=fig(0, 717), tone=0.5, body={"muscle": 0.5, "weight": 0.42, "height": 0.52, "proportions": 0.5},
           clothes=[tshirt(c("#f0f0ee"), "namuhekam_male_polo_shirt"), trousers(c("#22305a"))], shoes="shoes05"),
    person("manager", "male", 46, ["office", "pedestrian", "passenger"], P2, "office-5", "Manager",
           ["office"], "lavender formal shirt, charcoal trousers, belt, blank ID card, black shoes, moustache",
           crop=fig(0, 1254), tone=0.5, body={"muscle": 0.45, "weight": 0.62, "height": 0.52, "proportions": 0.5}, facial=["moustache", "stubble"],
           hair=("short04", SALT_PEPPER), clothes=shirt_trousers(c("#bcb6dc"), c("#2c2b30")), garments=[belt(), idtag(c("#4a3f7a"))], shoes="shoes04"),
    person("cab-driver", "male", 38, ["cab-driver", "pedestrian"], P2, "transport-2", "Cab Driver",
           ["uniform"], "cream shirt, grey trousers, brown shoes, moustache",
           crop=fig(1, 248), tone=0.6, body={"muscle": 0.5, "weight": 0.55, "height": 0.5, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_trousers(c("#ddd5bf"), c("#55565a")), garments=[belt(c("#3a2a1e"))], shoes="shoes01"),
    person("bus-driver", "male", 47, ["bus-driver", "pedestrian"], P2, "transport-3", "Bus Driver",
           ["uniform"], "generic light blue uniform shirt, navy trousers, belt, blank ID card, black shoes (no transport-corporation badge)",
           crop=fig(1, 342), tone=0.7, body={"muscle": 0.5, "weight": 0.6, "height": 0.5, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_trousers(c("#9db6dd"), c("#1f2a44")), garments=[belt(), idtag(c("#2f4f7a"))], shoes="shoes04"),
    person("bus-conductor", "male", 41, ["bus-conductor", "pedestrian"], P2, "transport-4", "Bus Conductor",
           ["uniform"], "generic light blue uniform shirt, navy trousers, belt, blank ID card, sandals, moustache and stubble",
           crop=fig(1, 440), tone=0.65, body={"muscle": 0.45, "weight": 0.5, "height": 0.47, "proportions": 0.5}, facial=["moustache", "stubble"],
           hair=("short04", BLACK_HAIR), clothes=shirt_trousers(c("#a6bfe2"), c("#22304d")), garments=[belt(), idtag(c("#2f4f7a"))]),
    person("fruit-vendor", "male", 52, ["vendor", "pedestrian"], P2, "vendors-4", "Fruit Vendor",
           ["lungi"], "khaki-brown shirt, dark green checked lungi to the knee, towel, sandals, short grey hair",
           crop=fig(1, 1118), tone=0.75, body={"muscle": 0.5, "weight": 0.6, "height": 0.45, "proportions": 0.5}, facial=["moustache"],
           hair=("short04", GREY_HAIR), clothes=shirt_only(c("#9a8466")), garments=[lungi(c("#2f4a35"), [c("#c8c2a8"), c("#1d2a20")], "knee"), towel(c("#d8cfb4"), c("#2f5f8f"))]),
    person("electrician", "male", 34, ["worker", "services", "pedestrian"], P2, "workers-2", "Electrician",
           ["work"], "khaki-brown work shirt, blue jeans, belt, work boots, moustache",
           crop=fig(2, 212), tone=0.7, body={"muscle": 0.55, "weight": 0.45, "height": 0.5, "proportions": 0.5}, facial=["moustache", "stubble"],
           clothes=shirt_only(c("#8a7457")) + [jeans(c("#34466a"))], garments=[belt(c("#2a2018"))], shoes="shoes03"),
    person("security-guard", "male", 49, ["security", "pedestrian"], P2, "workers-6", "Security Guard",
           ["uniform"], "generic light blue shirt, navy trousers, black belt, navy peaked cap (no badge or company name), black shoes",
           crop=fig(2, 523), tone=0.65, body={"muscle": 0.5, "weight": 0.6, "height": 0.5, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_trousers(c("#a9c0e0"), c("#1c2640")), garments=[belt(c("#111111")), {"kind": "cap", "style": "peaked", "colour": c("#1c2640"), "band": c("#111111")}],
           shoes="shoes04"),
    person("traffic-police", "male", 40, ["traffic-police", "police"], P2, "police-3", "Traffic Police",
           ["uniform"], "generic white shirt, navy trousers, black belt, white peaked cap with a dark band (no insignia), black shoes",
           crop=fig(2, 1009), tone=0.6, body={"muscle": 0.55, "weight": 0.55, "height": 0.55, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_trousers(c("#eeeeea"), c("#1f2a44")), garments=[belt(c("#111111")), {"kind": "cap", "style": "peaked", "colour": c("#f0efea"), "band": c("#1f1f1f")}],
           shoes="shoes04"),
    person("police-inspector", "male", 50, ["police"], P2, "police-1", "Police Inspector",
           ["uniform"], "generic khaki uniform, brown belt, darker khaki peaked cap (no insignia, badges or shoulder marks), black shoes, moustache",
           crop=fig(2, 860), tone=0.55, body={"muscle": 0.55, "weight": 0.66, "height": 0.55, "proportions": 0.5}, facial=["moustache"],
           clothes=police("male"), garments=[belt(c("#4a2a1a")), {"kind": "cap", "style": "peaked", "colour": c("#7d6a42"), "band": c("#2a1f14")}], shoes="shoes04"),
    person("middle-aged-man", "male", 52, ["pedestrian", "passenger", "family"], P2, "families-3", "Middle-aged Man",
           ["casual"], "cream half-sleeve-look shirt, dark grey trousers, sandals, grey moustache",
           crop=fig(3, 338), tone=0.6, body={"muscle": 0.45, "weight": 0.62, "height": 0.48, "proportions": 0.5}, facial=["moustache", "beard"],
           hair=("short02", SALT_PEPPER), facial_colour=GREY_HAIR, clothes=shirt_trousers(c("#d9ccad"), c("#45464a"))),
    person("father", "male", 40, ["pedestrian", "passenger", "family"], P2, "families-5", "Father",
           ["casual"], "white shirt, brown trousers, sandals, moustache",
           crop=fig(3, 519), tone=0.65, body={"muscle": 0.5, "weight": 0.52, "height": 0.52, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_trousers(c("#f0f0ec"), c("#5a4634")), also=[("phase2", "families-7", "Parent (Kid)")]),
    person("retired-man", "male", 66, ["pedestrian", "passenger", "elderly"], P2, "elderly-3", "Retired Man",
           ["casual"], "light blue checked shirt, beige trousers, sandals, grey hair and moustache",
           crop=fig(3, 1176), tone=0.55, body={"muscle": 0.4, "weight": 0.55, "height": 0.45, "proportions": 0.45}, facial=["moustache", "stubble"],
           hair=("short02", GREY_HAIR), facial_colour=GREY_HAIR, clothes=shirt_trousers(c("#c3d3e8"), c("#b9ab8c"), ("check", c("#7c95bd"), 64)),
           also=[("phase2", "elderly-5", "Elderly Couple (man)")]),
    person("elderly-man-lungi", "male", 76, ["pedestrian", "passenger", "elderly"], P2, "elderly-6", "Elderly Man (Walking Stick)",
           ["lungi"], "striped beige shirt, maroon checked lungi to the ankle, towel on the shoulder, sandals, white hair and beard (no stick yet)",
           crop=fig(3, 1468), tone=0.7, body={"muscle": 0.3, "weight": 0.42, "height": 0.4, "proportions": 0.45}, facial=["moustache", "beard"],
           hair=("short04", WHITE_HAIR), facial_colour=WHITE_HAIR, clothes=shirt_only(c("#d2c6ad"), ("stripe", c("#8c7a5c"), 40)),
           garments=[lungi(c("#5b2830"), [c("#b79a5a"), c("#2a1a1a")]), towel(c("#e0d6bc"), c("#8a3a2a"))]),
    person("teen-boy", "male", 16, ["pedestrian", "passenger"], P2, "children-3", "Teen Boy",
           ["casual"], "navy polo shirt, blue jeans, trainers",
           crop=fig(4, 294), tone=0.55, body={"muscle": 0.45, "weight": 0.42, "height": 0.55, "proportions": 0.5}, hair=("short04", BLACK_HAIR),
           clothes=[tshirt(c("#1f2c4f"), "namuhekam_male_polo_shirt"), jeans(DENIM)], shoes="shoes06"),
    person("temple-goer-m", "male", 58, ["pedestrian", "passenger", "temple", "traditional"], P2, "traditional-3", "Man (Temple Goer)",
           ["veshti", "traditional"], "white shirt, white veshti with a gold border, cream angavastram (towel) with a gold stripe, sandals, salt-and-pepper beard",
           crop=fig(4, 925), tone=0.65, body={"muscle": 0.45, "weight": 0.6, "height": 0.47, "proportions": 0.5}, facial=["moustache", "beard"],
           hair=("short02", SALT_PEPPER), clothes=shirt_only(c("#f2f1ea")), garments=[veshti(c("#c49a3a")), towel(c("#efe8d2"), c("#c49a3a"))]),
    person("jogger", "male", 29, ["pedestrian", "sport"], P2, "lifestyle-1", "Jogger",
           ["sport"], "light blue T-shirt, navy shorts, white trainers",
           crop=fig(4, 1221), tone=0.55, body={"muscle": 0.6, "weight": 0.38, "height": 0.55, "proportions": 0.55}, facial=["stubble"],
           hair=("short04", BLACK_HAIR), clothes=[tshirt(c("#a9c6e2")), {"asset": "cortu_jeans_shorts", "colour": c("#1f2a4a")}], shoes="shoes05",
           also=[("phase2", "lifestyle-2", "Gym Enthusiast")]),
    person("tourist", "male", 33, ["pedestrian", "passenger", "tourist"], P2, "lifestyle-4", "Tourist",
           ["casual"], "white shirt, blue jeans, dark backpack, trainers",
           crop=fig(4, 1489), tone=0.45, body={"muscle": 0.5, "weight": 0.48, "height": 0.55, "proportions": 0.55}, facial=["stubble", "moustache"],
           clothes=shirt_only(c("#f1f1ee")) + [jeans(c("#3a5680"))], garments=backpack(c("#3a3f35")), shoes="shoes05"),
    # ================================================================ women (20)
    person("arts-student", "female", 20, ["college", "pedestrian", "passenger"], P2, "students-4", "Arts Student",
           ["casual"], "coral T-shirt, blue jeans, blank ID card, trainers, long open hair",
           crop=fig(0, 395), tone=0.5, body={"muscle": 0.45, "weight": 0.45, "height": 0.5, "proportions": 0.55}, hair=("long01", BLACK_HAIR),
           clothes=[tshirt(c("#e07a72"), "joepal_crude_t-shirt_female"), women_jeans(DENIM)], garments=[idtag(c("#2f5d8a"))], shoes="shoes05"),
    person("student-backpack", "female", 17, ["school", "pedestrian", "passenger"], P2, "students-7", "Student (Backpack)",
           ["school"], "white shirt, navy trousers, backpack, blank ID card, sandals, plait",
           crop=fig(0, 637), tone=0.55, body={"muscle": 0.45, "weight": 0.42, "height": 0.48, "proportions": 0.5},
           clothes=[women_shirt(c("#f2f2ef")), slim_trousers(c("#202b4a"))], garments=backpack(c("#3a3a44")) + [idtag(c("#2f5d8a"))]),
    person("hr-professional", "female", 36, ["office", "pedestrian", "passenger"], P2, "office-4", "HR Professional",
           ["saree", "office"], "soft pink cotton saree with a gold border, pink blouse, plait, bindi, sandals",
           crop=fig(0, 1171), tone=0.5, body={"muscle": 0.4, "weight": 0.55, "height": 0.45, "proportions": 0.5}, bindi=c("#8a1020"),
           garments=saree(c("#d8a4a8"), c("#b8902c"), c("#e8c8b8"), c("#c98a92"))),
    person("vegetable-vendor", "female", 44, ["vendor", "pedestrian"], P2, "vendors-5", "Vegetable Vendor",
           ["saree"], "maroon saree with a green border, green blouse, plait, bindi, sandals",
           crop=fig(1, 1218), tone=0.75, body={"muscle": 0.5, "weight": 0.58, "height": 0.42, "proportions": 0.5}, bindi=c("#8a1020"),
           garments=saree(c("#7a2232"), c("#2f6a34"), c("#c8a44a"), c("#2f6a34"))),
    person("facility-staff", "female", 31, ["services", "worker", "pedestrian"], P2, "workers-8", "Facility Staff",
           ["uniform"], "generic navy tunic over a white shirt, navy trousers, blank ID card, sandals, hair in a bun (no company name)",
           crop=fig(2, 678), tone=0.6, body={"muscle": 0.45, "weight": 0.5, "height": 0.47, "proportions": 0.5}, hair=("bun", BLACK_HAIR),
           garments=[{"kind": "region", "region": "school_shirt", "colour": c("#f2f2ef"), "offset": 0.004},
                     {"kind": "region", "region": "pinafore", "colour": c("#23305a"), "offset": 0.01},
                     {"kind": "tube", "texture": ("plain", c("#23305a"), None), "top": "waist", "bottom": "knee", "flare": 0.04},
                     leggings(c("#23305a")), idtag(c("#2f5d8a"))]),
    person("health-worker", "female", 34, ["healthcare", "pedestrian", "passenger"], P2, "healthcare-4", "Health Worker",
           ["uniform", "kurta"], "pink knee-length tunic and pink trousers (no badge), blank ID card, sandals, bun",
           crop=fig(2, 1495), tone=0.6, body={"muscle": 0.45, "weight": 0.52, "height": 0.46, "proportions": 0.5}, hair=("bun", BLACK_HAIR),
           garments=[leggings(c("#d77f96"))] + kurta(c("#df8aa0"), "knee", sleeves=0.42) + [idtag(c("#2f5d8a"))]),
    person("doctor-f", "female", 38, ["healthcare", "pedestrian", "passenger"], P2, "healthcare-1", "Doctor",
           ["uniform", "office"], "white knee-length coat over blue trousers, blank ID card, shoes, bun",
           crop=fig(2, 1264), note=SWAPPED, tone=0.45, body={"muscle": 0.45, "weight": 0.5, "height": 0.5, "proportions": 0.55}, hair=("bun", BLACK_HAIR),
           garments=[leggings(c("#3f5f8f"))] + kurta(c("#f6f6f4"), "knee", sleeves=1.0) + [idtag(c("#2f6a8a"))], shoes="shoes04"),
    person("teacher-f", "female", 42, ["teacher", "pedestrian", "passenger"], P2, "office-7", "Teacher",
           ["saree"], "pale green cotton saree with a maroon border, maroon blouse, plait, bindi, sandals",
           crop=fig(0, 1416), note=SWAPPED, tone=0.55, body={"muscle": 0.4, "weight": 0.55, "height": 0.45, "proportions": 0.5}, bindi=c("#8a1020"),
           garments=saree(c("#9fbf98"), c("#7a1f2a"), c("#d8d0a0"), c("#7a1f2a")), also=[("phase2", "office-8", "Lecturer")]),
    person("bank-employee-f", "female", 29, ["office", "pedestrian", "passenger"], P2, "office-6", "Bank Employee",
           ["chudidar", "kurta", "office"], "blue calf-length kurta, white leggings, white dupatta, blank ID card, sandals, plait",
           crop=fig(0, 1335), note=SWAPPED, tone=0.5, body={"muscle": 0.45, "weight": 0.48, "height": 0.5, "proportions": 0.55},
           garments=[leggings(c("#f1efe8"))] + kurta(c("#5f84c4"), "calf", ("stripe", c("#8aa6d6"), 18)) + [dupatta(c("#f1efe8"), c("#5f84c4")), idtag(c("#2f5d8a"))]),
    person("sanitation-worker-f", "female", 39, ["sanitation", "worker", "services"], P2, "workers-4", "Sanitation Worker",
           ["saree", "work"], "faded green saree, plain orange hi-visibility vest with reflective bands, head cloth, sandals",
           crop=fig(2, 363), note=SWAPPED, tone=0.85, body={"muscle": 0.55, "weight": 0.45, "height": 0.42, "proportions": 0.5},
           garments=saree(c("#4f6e4a"), c("#2f3f2a"), c("#8aa080"), c("#6a3a2a")) + [hivis(), head_cloth(c("#d6cdb6"))],
           also=[("phase2", "workers-5", "Municipal Worker")]),
    person("young-woman", "female", 26, ["pedestrian", "passenger", "office"], P2, "families-2", "Young Woman",
           ["casual", "office"], "beige shirt, beige trousers, blank ID card, sandals, long open hair",
           crop=fig(3, 240), tone=0.45, body={"muscle": 0.45, "weight": 0.45, "height": 0.52, "proportions": 0.55}, hair=("long01", BLACK_HAIR),
           clothes=[women_shirt(c("#cdbb98")), slim_trousers(c("#b9a582"))], garments=[idtag(c("#2f5d8a"))]),
    person("middle-aged-woman", "female", 50, ["pedestrian", "passenger", "family"], P2, "families-4", "Middle-aged Woman",
           ["saree"], "lilac saree with a pink and gold border, lilac blouse, plait, bindi, sandals",
           crop=fig(3, 431), tone=0.6, body={"muscle": 0.4, "weight": 0.62, "height": 0.42, "proportions": 0.5}, hair=("bun", DARK_HAIR), bindi=c("#8a1020"),
           garments=saree(c("#9a7ab8"), c("#b8487a"), c("#d8c070"), c("#8a6aa8"))),
    person("mother", "female", 34, ["pedestrian", "passenger", "family", "homemaker"], P2, "families-6", "Mother",
           ["saree"], "orange saree with a maroon border, maroon blouse, plait, bindi, sandals",
           crop=fig(3, 605), tone=0.55, body={"muscle": 0.45, "weight": 0.52, "height": 0.47, "proportions": 0.5}, bindi=c("#8a1020"),
           garments=saree(c("#d06a2a"), c("#7a1f2a"), c("#e8b85a"), c("#7a1f2a"))),
    person("retired-woman", "female", 66, ["pedestrian", "passenger", "elderly"], P2, "elderly-4", "Retired Woman",
           ["saree", "traditional"], "cream cotton saree with a gold border, cream blouse, grey hair in a plait, sandals",
           crop=fig(3, 1268), tone=0.55, body={"muscle": 0.35, "weight": 0.55, "height": 0.38, "proportions": 0.45}, hair=("bun", GREY_HAIR), eyelashes=False,
           garments=saree(c("#e6dcc2"), c("#b8902c"), c("#d8c890"), c("#e0d4b8"))),
    person("elderly-woman-blue", "female", 72, ["pedestrian", "passenger", "elderly"], P2, "elderly-5", "Elderly Couple (woman)",
           ["saree", "traditional"], "slate blue saree with a maroon border, blue blouse, grey hair in a plait, sandals",
           crop=fig(3, 1383, 30), tone=0.7, body={"muscle": 0.3, "weight": 0.48, "height": 0.36, "proportions": 0.45}, hair=("bun", WHITE_HAIR), eyelashes=False,
           garments=saree(c("#6c7a94"), c("#6a2030"), c("#b8b090"), c("#5a6a86"))),
    person("girl-8-10", "female", 9, ["passenger", "family"], P2, "children-2", "Girl (8-10)",
           ["casual"], "white top with pink sleeves, pink knee-length skirt, sandals, plait",
           crop=fig(4, 215), tone=0.55, eyelashes=False, body={"muscle": 0.45, "weight": 0.45, "height": 0.5, "proportions": 0.5},
           garments=[{"kind": "region", "region": "blouse_child", "colour": c("#f3eef0"), "offset": 0.004},
                     {"kind": "tube", "texture": ("plain", c("#e8a0b8"), ("pleat", None, 20)), "top": "waist", "bottom": "knee", "flare": 0.08}]),
    person("teen-girl", "female", 15, ["school", "pedestrian", "passenger"], P2, "children-4", "Teen Girl",
           ["school", "uniform"], "generic uniform: white shirt, navy knee-length skirt, white socks, black shoes, backpack, blank ID card (no school name)",
           crop=fig(4, 377), tone=0.5, body={"muscle": 0.45, "weight": 0.42, "height": 0.5, "proportions": 0.5},
           garments=[{"kind": "region", "region": "school_shirt", "colour": c("#f4f4f2"), "offset": 0.004},
                     {"kind": "tube", "texture": ("plain", NAVY, ("pleat", None, 22)), "top": "waist", "bottom": "knee", "flare": 0.07},
                     socks(), idtag(c("#2f5d8a"))] + backpack(c("#2e3a5a")), shoes="shoes04"),
    person("girl-cycle", "female", 12, ["passenger", "family"], P2, "children-6", "Girl (Cycle)",
           ["casual"], "lilac T-shirt, pink leggings, sandals, plait (no bicycle yet)",
           crop=fig(4, 548), tone=0.6, eyelashes=False, body={"muscle": 0.45, "weight": 0.42, "height": 0.52, "proportions": 0.5},
           clothes=[tshirt(c("#c8b4d8"), "joepal_crude_t-shirt_female")], garments=[leggings(c("#d48aa4"))]),
    person("woman-traditional", "female", 40, ["pedestrian", "passenger", "traditional"], P2, "traditional-2", "Woman (Traditional)",
           ["saree", "traditional"], "red silk-look saree with a mustard and gold border, mustard blouse, plait, bindi, sandals",
           crop=fig(4, 838), tone=0.6, body={"muscle": 0.4, "weight": 0.58, "height": 0.44, "proportions": 0.5}, bindi=c("#8a1020"),
           garments=saree(c("#a8202e"), c("#d0a030"), c("#e0c060"), c("#c89a30"))),
    person("temple-goer-f", "female", 46, ["pedestrian", "passenger", "temple", "traditional"], P2, "traditional-4", "Woman (Temple Goer)",
           ["saree", "traditional"], "mustard-orange saree with a green border, green blouse, plait, bindi, sandals",
           crop=fig(4, 1020), tone=0.65, body={"muscle": 0.4, "weight": 0.6, "height": 0.43, "proportions": 0.5}, bindi=c("#8a1020"),
           garments=saree(c("#d89a2a"), c("#2f6a3a"), c("#e8c860"), c("#2f6a3a"))),
]

CAST = PHASE1 + PHASE2
