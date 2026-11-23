"""
Manifests for the Three.js game's road vehicles (hatchback, motorbike, auto-rickshaw, bus,
ambulance). Their GLBs are copied byte for byte into `godot-chennai/assets/vehicles/legacy/` by
Foundation's `tools/sync_from_threejs.py` (the one source of truth for them, G-36); this script
only checks they are there and writes a manifest beside each, with the data
the old game keeps in code (`packages/vehicles/src/specs.ts`, `models.ts` DOOR_SWING,
`docs/vehicles.md`): wheels, handling, driver's hip point and pose, grips, doors and hinges,
passenger doors, cargo anchors. Plain Python 3, no Blender needed:

    python3 godot-chennai/tools/blender/vehicles/port_road_vehicles.py

The models' sources are kept beside it for reference (`road/vehicles.py`, `road/auto_rickshaw.py`,
copies of the old game's scripts); the GLBs themselves come from the old game through the sync.

Frames: the old game measures riding points in the *chassis* frame (+X right, -Z forwards, y up
from the chassis centre). The GLBs' frame has the ground at y = 0. The manifests here are in the
GLB frame: y_model = y_chassis - groundBelow(kind), with
groundBelow = wheel.y - SETTLED_SUSPENSION (0.3) - wheel.radius, exactly as `specs.ts`.
"""
import json
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))  # godot-chennai/
OLD = os.path.abspath(os.path.join(ROOT, "..", "chennai-open-world"))
SRC = os.path.join(OLD, "assets", "models", "vehicles")
OUT = os.path.join(ROOT, "assets", "vehicles", "legacy")
SETTLED = 0.3

LICENCE = ("Original work for the Three.js game, made by `chennai-open-world/tools/blender/{vehicles,auto_rickshaw}.py` "
           "in Blender 5.2 LTS; copied unchanged. No maker's badges, logos, grilles or liveries copied; plates are not "
           "real registrations (chennai-open-world/assets/README.md).")

# Data from chennai-open-world/packages/vehicles/src/specs.ts (VEHICLE_TYPES), models.ts (DOOR_SWING)
# and docs/vehicles.md, chassis frame.
STEERING = dict(lean=-0.1, hand=(0.17, 0.3, -0.42), foot=(0.12, -0.15, -0.78))
VEHICLES = {
    "hatchback": dict(
        kind="car", label="Hatchback", files=("hatchback.glb", "hatchback_lod1.glb"), mass=950, ride=0.72,
        size=(1.979, 1.784, 3.945), body=(1.66, 1.62, 3.9),
        wheels=[("wheel_fl", -0.74, -0.12, -1.25, 0.32, True, True), ("wheel_fr", 0.74, -0.12, -1.25, 0.32, True, True),
                ("wheel_rl", -0.74, -0.12, 1.25, 0.32, False, False), ("wheel_rr", 0.74, -0.12, 1.25, 0.32, False, False)],
        physics=dict(halfExtents=[0.82, 0.42, 1.95], engineForce=5600, maxSpeed=23, maxSteer=0.6, brakeForce=95, drift=0.55, gears=5),
        driver=(0.36, -0.03, 0.1), pose=STEERING, steering=dict(centre=(0.36, 0.27, -0.32), radius=0.175),
        doors=[("door_fr", (0.845, -0.55), 65), ("door_rl", (-0.845, 0.5), -65), ("door_rr", (0.845, 0.5), 65)],
        entry=dict(side=1, point=(1.25, 0.35), door="hinged", style="door"),
        passengers=[dict(point=(-1.2, 1.35), inside=(-0.35, 0.1, 0.95), leaf=1), dict(point=(1.2, 1.35), inside=(0.35, 0.1, 0.95), leaf=2)],
        cargo=[("back seat", (0, -0.15, 0.95)), ("boot floor", (0, -0.3, 1.62))],
    ),
    "motorbike": dict(
        kind="bike", label="Motorbike", files=("motorbike.glb", "motorbike_lod1.glb"), mass=190, ride=0.62,
        size=(0.802, 1.395, 2.085), body=(0.75, 1.15, 2.0),
        wheels=[("wheel_front", 0, -0.02, -0.72, 0.3, True, False), ("wheel_rear", 0, -0.02, 0.68, 0.3, False, True)],
        physics=dict(halfExtents=[0.32, 0.36, 1.0], engineForce=1500, maxSpeed=26, maxSteer=0.55, brakeForce=28, gears=5),
        driver=(0, 0.345, 0.2), pose=dict(lean=0.5, hand=(0.33, 0.175, -0.62), foot=(0.23, -0.5, -0.03), knees=1),
        grips=[("grip_l", (-0.33, 0.52, -0.42)), ("grip_r", (0.33, 0.52, -0.42))],
        footpegs=[(-0.24, -0.265, 0.12), (0.24, -0.265, 0.12)],
        doors=[], entry=dict(side=-1, point=(-0.7, 0.2), door="none", style="swing"),
        passengers=[], cargo=[("rear carrier", (0, 0.27, 0.85))], leans=True, open_seat=True,
    ),
    "auto_rickshaw": dict(
        kind="auto", label="Auto-rickshaw", files=("auto_rickshaw.glb", "auto_rickshaw_lod1.glb"), mass=420, ride=0.7,
        size=(1.64, 1.719, 2.772), body=(1.30, 1.71, 2.63),
        wheels=[("wheel_front", 0, -0.14, -1.0, 0.24, True, False), ("wheel_rear_left", -0.6, -0.14, 0.8, 0.24, False, True),
                ("wheel_rear_right", 0.6, -0.14, 0.8, 0.24, False, True)],
        # The model's own wheels (auto_rickshaw.py: rear track 0.58, 4.00-8 tyre radius 0.215, front axle 1.0 m ahead):
        model_wheels=[("wheel_front", 0, -1.0, 0.215), ("wheel_rear_left", -0.58, 0.8, 0.215), ("wheel_rear_right", 0.58, 0.8, 0.215)],
        physics=dict(halfExtents=[0.66, 0.45, 1.3], engineForce=1900, maxSpeed=14, maxSteer=0.75, brakeForce=50, drift=0.9, gears=4),
        driver=(0, 0.22, -0.4), pose=dict(lean=0.45, hand=(0.335, 0.25, -0.38), foot=(0.16, -0.37, -0.24)),
        doors=[], entry=dict(side=-1, point=(-0.95, -0.4), door="none", style="step"),
        passengers=[dict(point=(-0.95, 0.8), inside=(-0.36, 0.17, 0.8)), dict(point=(0.95, 0.8), inside=(0.36, 0.17, 0.8))],
        cargo=[("passengers' bench", (0, 0.065, 0.82))], open_seat=True,
        notes="The auto is 16k / 12k triangles (over the 12k / 3k car budget): kept as it is; a lighter LOD1 is a follow-up.",
    ),
    "ambulance": dict(
        kind="ambulance", label="Ambulance", files=("ambulance.glb", "ambulance_lod1.glb"), mass=2300, ride=0.95,
        size=(2.42, 2.4, 5.29), body=(1.96, 2.22, 5.1),
        wheels=[("wheel_fl", -0.86, -0.42, -1.6, 0.38, True, True), ("wheel_fr", 0.86, -0.42, -1.6, 0.38, True, True),
                ("wheel_rl", -0.86, -0.42, 1.55, 0.38, False, False), ("wheel_rr", 0.86, -0.42, 1.55, 0.38, False, False)],
        physics=dict(halfExtents=[0.98, 0.8, 2.5], engineForce=12500, maxSpeed=25, maxSteer=0.55, brakeForce=230, drift=0.45, gears=5),
        driver=(0.45, 0.15, -0.7), pose=dict(lean=-0.05, hand=(0.17, 0.3, -0.42), foot=(0.12, -0.38, -0.7)),
        steering=dict(centre=None, radius=0.19),
        doors=[("door_cab", (0.985, -1.22), 65), ("door_back_l", (-0.7, 2.56), -110), ("door_back_r", (0.7, 2.56), 110)],
        entry=dict(side=1, point=(1.5, -0.5), door="hinged", style="door"),
        passengers=[dict(point=(0, 3.5), inside=(0, 0.2, 1.9), leaf=1)],
        cargo=[("stretcher place", (0, -0.5, 1.45))], cargo_clear=dict(min=(-0.6, -0.48, 0.05), max=(0.3, 0.9, 2.45)), siren=True,
    ),
    "bus": dict(
        kind="bus", label="City bus", files=("bus.glb", "bus_lod1.glb"), mass=9000, ride=1.25,
        size=(2.96, 3.3, 10.445), body=(2.5, 3.26, 10.1),
        wheels=[("wheel_fl", -1.08, -0.72, -3.3, 0.5, True, False), ("wheel_fr", 1.08, -0.72, -3.3, 0.5, True, False),
                ("wheel_rl", -1.08, -0.72, 2.8, 0.5, False, True), ("wheel_rr", 1.08, -0.72, 2.8, 0.5, False, True)],
        physics=dict(halfExtents=[1.25, 1.1, 5.0], engineForce=34000, maxSpeed=17, maxSteer=0.62, brakeForce=900, drift=0.95, gears=5),
        driver=(0.8, 0.3, -4.0), pose=dict(lean=0, hand=(0.2, 0.25, -0.42), foot=(0.12, -0.42, -0.62)),
        steering=dict(centre=None, radius=0.22),
        doors=[("door_front_a", (-1.266, -4.15), -80), ("door_front_b", (-1.266, -3.05), 80)],
        entry=dict(side=-1, point=(-1.85, -3.6), door="folding", style="door", aisle=[(-0.8, -0.35, -3.6), (0.25, -0.35, -3.85)]),
        passengers=[dict(point=(-1.85, -3.6), inside=(-0.6, 0.3, -3.0), leaf=0)],
        cargo=[("floor by the front door", (-0.85, -0.34, -2.9))],
    ),
}


def glb_json(path):
    with open(path, "rb") as f:
        data = f.read()
    n = struct.unpack("<I", data[12:16])[0]
    return json.loads(data[20:20 + n])


def triangles(path):
    j = glb_json(path)
    total = 0
    for node in j["nodes"]:
        if "mesh" not in node:
            continue
        for p in j["meshes"][node["mesh"]]["primitives"]:
            total += j["accessors"][p["indices"]]["count"] // 3
    return total


def r3(v):
    return [round(c, 3) for c in v]


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, v in VEHICLES.items():
        for f in v["files"]:
            if not os.path.exists(os.path.join(OUT, f)):
                raise SystemExit(f"{f} missing in assets/vehicles/legacy/: run python3 godot-chennai/tools/sync_from_threejs.py first")
        w0 = v["wheels"][0]
        ground = w0[2] - SETTLED - w0[4]  # groundBelow: negative, metres below the chassis centre
        up = -ground

        def m(p):
            return r3((p[0], p[1] + up, p[2]))

        hip = m(v["driver"])
        hand = v["pose"]["hand"]
        grips = [dict(node=None, name=n, position=m(p)) for n, p in v.get("grips", [])] or [
            dict(node=None, name="grip_steer_l", position=r3((hip[0] - hand[0], hip[1] + hand[1], hip[2] + hand[2]))),
            dict(node=None, name="grip_steer_r", position=r3((hip[0] + hand[0], hip[1] + hand[1], hip[2] + hand[2])))]
        steering = None
        if "steering" in v:
            c = v["steering"]["centre"]
            steering = dict(node=None, hub=m(c) if c else r3((hip[0], hip[1] + hand[1], hip[2] + hand[2])), radius=v["steering"]["radius"])
        manifest = dict(
            name=name, label=v["label"], kind=v["kind"], licence=LICENCE,
            source="chennai-open-world/tools/blender/" + ("auto_rickshaw.py" if name == "auto_rickshaw" else "vehicles.py") +
                   " (copied to tools/blender/vehicles/road/)",
            frame="metres; +Y up, front faces -Z, +X right; ground at y = 0; origin centred between the axles",
            size_m=dict(zip(("width", "height", "length"), v["size"])),
            body_size_m=dict(zip(("width", "height", "length"), v["body"])),
            size_note="size_m is the measured overall size (mirrors, beacons, handlebars); body_size_m is docs/vehicles.md",
            mass_kg=v["mass"], ported=True,
            lods=[dict(file=v["files"][0], triangles=triangles(os.path.join(OUT, v["files"][0])), max_distance_m=28),
                  dict(file=v["files"][1], triangles=triangles(os.path.join(OUT, v["files"][1])), min_distance_m=34, max_distance_m=300)],
            wheels=[dict(node=n, centre=r3((x, r, z)), radius=r, steers=s, driven=d) for n, x, _y, z, r, s, d in v["wheels"]]
            if "model_wheels" not in v else
            [dict(node=n, centre=r3((x, r, z)), radius=r, steers=pw[5], driven=pw[6])
             for (n, x, z, r), pw in zip(v["model_wheels"], v["wheels"])],
            steering=steering,
            doors=[dict(node=n, hinge=r3((h[0], 0, h[1])), axis=[0, 1, 0], open_deg=o, side="right" if h[0] > 0 else "left",
                        notes="folding leaf" if v["entry"]["door"] == "folding" else None) for n, h, o in v["doors"]],
            seats=[dict(node=None, name="seat_driver", hip=hip, role="driver")] +
                  [dict(node=None, name=f"passenger_{i}", hip=m(p["inside"]), role="passenger", door_leaf=p.get("leaf"),
                        stand=r3((p["point"][0], 0, p["point"][1]))) for i, p in enumerate(v["passengers"])],
            grips=grips,
            pose=dict(lean=v["pose"]["lean"], hand=list(hand), foot=list(v["pose"]["foot"]), knees=v["pose"].get("knees")),
            entry=dict(v["entry"], point=r3((v["entry"]["point"][0], 0, v["entry"]["point"][1])),
                       aisle=[m(p) for p in v["entry"].get("aisle", [])]),
            cargo=[dict(node=None, what=w, position=m(p)) for w, p in v["cargo"]],
            collision=[dict(shape="box", centre=r3((0, up, 0)), half_extents=v["physics"]["halfExtents"])],
            physics=dict(mass=v["mass"], rideHeight=v["ride"], wheels=[dict(x=x, y=y, z=z, radius=r, steers=s, driven=d)
                                                                     for _n, x, y, z, r, s, d in v["wheels"]],
                         **v["physics"]),
            chassis_to_model_y=round(up, 3),
            notes=v.get("notes", "Ported unchanged; riding data from specs.ts (measured off the models by the old game's tests)."),
        )
        if "footpegs" in v:
            manifest["footpegs"] = [m(p) for p in v["footpegs"]]
        if "cargo_clear" in v:
            manifest["cargo_clear"] = dict(min=m(v["cargo_clear"]["min"]), max=m(v["cargo_clear"]["max"]))
        for k in ("leans", "open_seat", "siren"):
            if v.get(k):
                manifest[k] = True
        with open(os.path.join(OUT, name + ".json"), "w") as f:
            json.dump(manifest, f, indent=1)
            f.write("\n")
        print("MANIFEST", name, [l["triangles"] for l in manifest["lods"]])


if __name__ == "__main__":
    main()
