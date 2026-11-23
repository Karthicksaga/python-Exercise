# Vehicles, aircraft and trains: models, data model, budgets

Every model here is the output of a Blender script in `tools/blender/vehicles/` (Blender 5.2 LTS,
headless). The scripts are the source, and running them again rebuilds the same files. All designs
are original. There are no real makes, badges, grilles, airline names, railway or metro logos,
lettering or real numbers (TD-18 of the Three.js game; brief §11). Decisions G-30 to G-39 are in
`technical-decisions.md`.

## What there is

| Model (`assets/…`) | What | Size L × W × H (m) | Triangles LOD0 / LOD1 / LOD2 | Files |
|---|---|---|---|---|
| `vehicles/saloon` | original luxury saloon, 4 doors, 6 paints | 5.13 × 1.99 × 1.47 | 9,894 / 2,088 | 451 KB |
| `vehicles/suv` | original large SUV (7 seats), 4 doors, 6 paints | 4.63 × 2.12 × 1.81 | 9,836 / 2,060 | 466 KB |
| `vehicles/coupe` | original sports coupé, 2 doors, 6 paints | 4.58 × 1.93 × 1.25 | 9,018 / 2,090 | 410 KB |
| `vehicles/formula` | original open-wheel race car, 4 invented team-less liveries | 5.60 × 2.36 × 1.19 | 6,834 / 1,638 | 353 KB |
| `vehicles/hatchback`, `motorbike`, `auto_rickshaw`, `ambulance`, `bus` | ported unchanged from the Three.js game | as before | 10,460 / 3,050 · 7,616 / 2,262 · 16,382 / 12,306 · 14,576 / 3,900 · 12,370 / 5,328 | 3.3 MB |
| `aircraft/helicopter` | light utility helicopter: 3-blade main rotor, tail rotor, skids, 5 seats | 12.8 (rotor) × 9.4 × 2.9 | 5,580 / 2,162 / 322 | 392 KB |
| `aircraft/airliner` | small narrow-body twin, about 150 seats, invented airline colours | 37.4 × 34.6 × 11.8 | 7,704 / 2,664 / 556 | 595 KB |
| `aircraft/light_aircraft` | high-wing four-seat single-engine | 8.5 × 11.1 × 2.8 | 6,470 / 1,886 / 340 | 394 KB |
| `trains/emu_cab`, `emu_motor`, `emu_trailer` | ICF-style suburban EMU (12-car rake), stainless with a green and cream colour family | 21.9 × 3.27 × 4.1 (4.8 with pantograph) | 1,560 / 392 / 40 (cab) | 570 KB |
| `trains/emu_ac_*` | the AC EMU variant: white, blue window band, roof AC units | as the EMU | 1,384 / 480 / 40 (cab) | 550 KB |
| `trains/wap7` | WAP-7-style twin-cab Co-Co electric locomotive, red and cream colour family | 21.8 × 3.15 × 4.8 | 1,596 / 628 / 40 | 219 KB |
| `trains/lhb_coach` | LHB-style express coach | 24.6 × 3.27 × 4.3 | 1,296 / 416 / 40 | 180 KB |
| `trains/vb_cab`, `vb_coach` | Vande-Bharat-style set, saffron and grey colour family, aerodynamic nose | 25.6 × 3.28 × 4.0 | 1,268 / 364 / 56 (nose car) | 321 KB |

The figures come from the manifests, which the tests check against the files. All assets together
come to **8.5 MB** of GLB and JSON. Train and aircraft dimensions are estimates from published
figures (broad gauge 1,676 mm), and each manifest says so.

## Budgets (held by `tests/models/test_models.gd`)

| Kind | LOD0 | LOD1 | LOD2 | Source |
|---|---|---|---|---|
| car, race car | ≤ 12,000 | ≤ 3,000 | (none) | brief, `chennai-game-design` §6 |
| helicopter | ≤ 10,000 | ≤ 2,500 | ≤ 400 | brief |
| airliner | ≤ 15,000 | ≤ 3,500 | ≤ 600 | brief ("strong LODs") |
| light aircraft | ≤ 10,000 | ≤ 2,500 | ≤ 400 | as the helicopter |
| train coach | body ≤ 3,000 + bogies ≤ 400 each | ≤ 600 | ≤ 120 | research note (trains) |
| cab, loco, VB nose car | body ≤ 6,000 + bogies ≤ 400 each | ≤ 1,000 | ≤ 150 | research note |
| ported road vehicles | the old game's measured counts (the auto is 16.4k / 12.3k, over the car budget) | | | `chennai-open-world/docs/vehicles.md` |

Textures are 512 px, or 1,024 px for the airliner's livery. Vehicle LODs switch at 28 m. The
helicopter and light aircraft switch at 40, 250 and 2,000 m, the airliner at 90, 600 and 4,000 m,
and trains at 60, 300 and 900 m (research note). The game should drive these with
`GeometryInstance3D.visibility_range_begin/end`.

## Frames and nodes

- Metres. **+Y up, the front towards -Z, +X to the right** (TD-2, the same as the Three.js game).
  Ground, or the rail top for trains, is at y = 0.
- Origins: cars are centred between the axles. The helicopter's origin is on the ground below the
  rotor mast. The aeroplanes' origin is on the ground below the main gear axle. Train cars have
  theirs at mid-car on the rail top.
- `body`: everything that doesn't move.
- `wheel_*`: origin on the axle; the wheel spins about X. The lowest point is on the ground. On
  aircraft the wheels are children of the gear legs. Train wheelsets are `wheelset_f1…`, children
  of `bogie_front`/`bogie_rear`, and their flanges reach 28 mm below the rail top.
- `steering`: origin on the hub. The `steering.axis` in the manifest is the column, and
  `grip_steer_l`/`grip_steer_r` are the hand points on the rim.
- `door_*`: origin on the hinge line. Car doors swing about Y by `open_deg` (+ is the right side,
  opening outwards). Sliding leaves (trains, the helicopter's rear doors) have `slide` and `slide_m`.
- `pivots` (manifest): every other moving part, with its `pivot`, unit `axis` (Godot frame) and
  `range_deg` or `rpm`. These are `rotor_main`, `rotor_tail`, `propeller`, `fan_l/r`,
  `aileron_*`, `flap_*`, `elevator*`, `rudder`, `gear_nose`, `gear_main_*` (retract pivots),
  `bogie_*` and `pantograph*`.
- Anchors (empty nodes): `seat_*` (hip points), `grip_*` (hands: steering rim, cyclic,
  collective, yokes, master controller), `cargo_*` (load surfaces), `exit_driver`,
  `standing_area`, and `marker_front` (the leading face; the tests use it to check orientation).

## The manifest (`<name>.json` beside the GLBs)

It keeps the Three.js game's vehicle data model (`packages/vehicles/src/specs.ts`, its
`docs/vehicles.md`), in the GLB frame:

- `size_m`, `mass_kg`, `lods[]` (file, triangles, distance range), `wheels[]` (node, centre,
  radius, steers, driven), `steering`, `doors[]`, `seats[]`, `grips[]`, `cargo[]`, `pivots[]`.
- `collision[]`: simple proxies (boxes, and a capsule or cylinder for aircraft and the rotor disc),
  to be built as `BoxShape3D` and similar. No collision meshes are in the GLBs.
- Cars: `physics` is shaped like `VehicleSpec`: halfExtents, mass, wheels in the chassis frame
  with `wheel.y = radius + 0.3 - rideHeight` so that `groundBelow` works unchanged, plus
  engineForce, maxSpeed, maxSteer, brakeForce, drift, gears and rideHeight. They also carry
  `pose`, `entry` and `paints[]` (sRGB; set `albedo_color` of the surface whose material is named
  `paint`).
- Ported vehicles: the data of `specs.ts` and `DOOR_SWING`, converted with
  `y_model = y_chassis - groundBelow(kind)` (`chassis_to_model_y`). Their seats, grips and cargo
  are positions, not nodes, because the old GLBs have no anchor nodes.
- Aircraft: `flight` (starting values) and `landing_contacts` (helicopter skids).
- Trains: `bogies`, `formation` (12-car EMU, 12-car AC EMU, WAP-7 with LHB coaches, an 8-car VB set;
  `@reversed` means the car is turned round) and `coupler_faces_z` for spacing cars in a rake.
- All handling and flight numbers are **proposed starting values (estimated)**, for Phase 2 and 6b
  to tune.

## Materials

- `atlas`: every fixed colour is one 64 px cell of a shared 512 px palette (`shared/vehicle_palette_{albedo,mr,emit}.png`:
  albedo, metallic-roughness and emission for the lamps). A face's UVs sit at its cell centre. The
  roles are listed in `vkit.py` `ROLES`, and the cells must stay where they are because the UVs
  point at them.
- `paint`: plain body colour. The game sets the colour per car from the manifest.
- `livery_<type>`: trains and the airliner use a painted texture with real UVs. The u axis runs
  along the car and v runs round the half section, with both sides sharing the texture. Windows,
  doors and bands are painted in, not modelled. Ends and the cab front are planar-mapped into the
  bottom strip.
- No vertex colours anywhere. Glass is opaque and dark: no transparency, to spare fill rate on the
  Adreno 613.

## Using them in Godot (Phase 2, 6, 6b)

- Import the GLBs as scenes. Read the manifest beside each one (a small `VehicleManifest`
  resource loader is the natural place). Add LOD0 and LOD1 (and LOD2) as children with
  visibility ranges. Traffic can load LOD1 only.
- Spin wheels about their local X, steer the front wheel nodes about Y, swing doors about Y at
  their origin and slide leaves along `slide`. Turn `pivots` about their `axis` within their range.
- Trains: draw one `MultiMeshInstance3D` per car type per LOD, so a 12-car rake costs a few draw
  calls (research note: at most about 6 for all trains). Animate bogies only at LOD0.

## Rebuilding

```bash
godot-chennai/tools/blender/vehicles/build_all.sh         # everything, then the checks
blender -b --factory-startup --python godot-chennai/tools/blender/vehicles/cars.py -- --only saloon,suv
python3 godot-chennai/tools/blender/vehicles/port_road_vehicles.py   # re-copy the Three.js vehicles
godot --headless --audio-driver Dummy --script godot-chennai/tests/models/test_models.gd
```

Review screenshots (Compatibility renderer, not committed) come from
`tests/models/model_shot.gd`. It loads any GLBs at run time and needs a throwaway project
folder for the windowed run, as noted in the script header. `OPEN_DOORS=1` swings the doors
open.

## Not done, or weak

- The premium cars are clean but simple: their front and rear faces are lamp boxes on a soft
  shell, and the side glass ends on face edges, so window outlines are a little stepped up close.
  None has been seen on a phone.
- The trains are light (about 1.0 to 1.6k triangles at LOD0, well under budget). Windows are
  painted, not inset, so up close they read as flat. Bogies are blocky, and EMU doorways are
  painted dark under the leaves.
- The helicopter and aeroplane cabins are only seats and a panel. There are no gauges, and the
  rotor has no blurred-disc mesh.
- The ported auto-rickshaw is over the car budget (16k / 12k). A lighter LOD1 is a follow-up.
- Steering wheels exist as nodes on the new cars only. The old models' steering wheels are part
  of the body, as they were in the Three.js game.
- Each GLB carries its own copy of the 11 KB palette. To share one texture in memory, set the
  importer's external-material option for `atlas` once the project exists. The palette PNGs are in
  `assets/vehicles/shared/` for that.
