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
KHAKI = c("#a99260")
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
    item = {"asset": "male_casualsuit01", "split": "z", "upper": shirt, "lower": trousers}
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
        {"kind": "tube", "texture": ("saree", base, border, motif), "bottom": "floor", "flare": 0.06, "pleats": True, "top": "navel"},
        {"kind": "region", "region": "pallu", "texture": ("pallu", base, border, motif), "offset": 0.014},
    ]


def kurta(colour, length="knee", pattern=None, sleeves=0.75, slits=True):
    return [
        {"kind": "region", "region": "kurta_top", "colour": colour, "pattern": pattern, "offset": 0.008, "sleeves": sleeves},
        {"kind": "tube", "texture": ("plain", colour, pattern), "top": "hip", "bottom": length, "flare": 0.04, "slits": slits},
    ]


def dupatta(colour, border=None):
    return {"kind": "region", "region": "dupatta", "texture": ("dupatta", colour, border or colour), "offset": 0.02}


def leggings(colour):
    return {"kind": "region", "region": "leggings", "colour": colour, "offset": 0.003}


def towel(colour=c("#cdb894"), stripe=c("#b23a3a")):
    return {"kind": "region", "region": "towel", "texture": ("towel", colour, stripe), "offset": 0.035}


def head_cloth(colour):
    return {"kind": "region", "region": "headcloth", "colour": colour, "offset": 0.02}


def hivis(colour=c("#e8742a"), band=c("#c9ccc8")):
    """A plain hi-visibility safety vest (invented colour, two reflective bands, no lettering)."""
    return {"kind": "region", "region": "vest", "texture": ("hivis", colour, band), "offset": 0.016}


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
            {"kind": "region", "region": "straps", "colour": strap or colour, "offset": 0.012}]


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
           clothes=[long_sleeve_top(c("#6e2233"), DENIM)], garments=backpack(c("#2d2f33")), shoes="shoes05"),
    person("it-professional-m", "male", 28, ["office", "pedestrian", "passenger"], P1, 2, "IT Professional",
           ["office"], "light blue formal shirt, charcoal trousers, belt, blank ID card on a lanyard, black shoes, short beard",
           tone=0.45, body={"muscle": 0.5, "weight": 0.5, "height": 0.55, "proportions": 0.55},
           facial=["beard", "moustache"], clothes=shirt_trousers(c("#a8c4e6"), c("#2f2e31")),
           garments=[belt(), idtag(c("#2f4f7a"))], shoes="shoes04"),
    person("delivery-rider", "male", 25, ["delivery", "pedestrian"], P1, 3, "Delivery Rider",
           ["casual", "work"], "plain teal riding jacket (board's branded orange replaced, no logo), black cargo trousers, grey trainers, dark backpack",
           tone=0.55, body={"muscle": 0.5, "weight": 0.45, "height": 0.52, "proportions": 0.5},
           facial=["stubble", "moustache"], clothes=[jacket(c("#1f6f78")), cargo(c("#26272b"))],
           garments=backpack(c("#2b2b2e")), shoes="shoes06"),
    person("auto-driver", "male", 45, ["auto-driver"], P1, 4, "Auto Driver",
           ["uniform"], "khaki shirt and khaki trousers (the auto driver's dress), sandals, moustache",
           tone=0.7, body={"muscle": 0.5, "weight": 0.58, "height": 0.46, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_trousers(c("#8e8558"), c("#867c52"))),
    person("shopkeeper-m", "male", 48, ["shopkeeper", "vendor", "pedestrian"], P1, 5, "Shopkeeper",
           ["veshti"], "blue-and-red checked shirt, white veshti with a gold border, cream towel on the shoulder, sandals, moustache",
           tone=0.65, body={"muscle": 0.45, "weight": 0.68, "height": 0.46, "proportions": 0.5}, facial=["moustache"],
           clothes=shirt_only(c("#c7cde6"), ("check", c("#4a62a8"), 64)), garments=[veshti(c("#b38a34")), towel(c("#e3d6b4"), c("#d8c9a0"))]),
    person("police-constable", "male", 42, ["police", "traffic-police"], P1, 6, "Police Constable",
           ["uniform"], "generic khaki uniform, dark red-brown belt, khaki peaked cap (no insignia, badges or shoulder marks), brown shoes, moustache",
           tone=0.65, body={"muscle": 0.55, "weight": 0.6, "height": 0.55, "proportions": 0.5}, facial=["moustache"],
           clothes=police("male"), garments=[belt(c("#5a2a1e")), {"kind": "cap", "style": "peaked", "colour": KHAKI_DARK, "band": c("#3a2a1a")}],
           shoes="shoes04"),
    person("construction-worker", "male", 32, ["construction", "worker"], P1, 7, "Construction Worker",
           ["work"], "purple T-shirt, plain orange hi-visibility vest with reflective bands, grey-olive cargo trousers, work boots, yellow hard hat",
           tone=0.85, body={"muscle": 0.65, "weight": 0.42, "height": 0.5, "proportions": 0.5}, facial=["beard", "moustache"],
           clothes=[tshirt(c("#6a4b8c")), cargo(c("#5b5a4c"))], garments=[hivis(), {"kind": "hardhat", "colour": c("#e8c22a")}],
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
           clothes=[women_shirt(c("#b3c9e8")), slim_trousers(c("#3a2c26"))], garments=[belt(c("#1e1a18")), idtag(c("#2f5d8a"))]),
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

PHASE2 = []  # filled in below the phase-1 list once phase 1 is validated

CAST = PHASE1 + PHASE2
