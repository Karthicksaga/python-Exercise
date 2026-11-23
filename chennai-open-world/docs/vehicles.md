# Vehicles: models, levels of detail, doors, cargo anchors

Every vehicle kind (`VEHICLE_TYPES` in `packages/vehicles/src/specs.ts`) is drawn with an original
model made by script in Blender 5.2 LTS (TD-18, TD-25). Physics, handling and collider sizes are
unchanged; the models were built round them.

| Kind (`VehicleKind`) | Model | Script | Detailed / traffic triangles | Draw calls (detailed / traffic) | Optimised size |
|---|---|---|---|---|---|
| `car` (hatchback; also the cab, police and gang cars) | tall-boy hatchback, 3.9 × 1.66 × 1.62 m | `tools/blender/vehicles.py` | 10,460 / 3,050 | 12 / 11 | 112 + 49 KB |
| `bike` | 125 cc commuter motorbike, 2.0 m, spoked wheels | `vehicles.py` | 7,616 / 2,262 | 9 / 9 | 82 + 43 KB |
| `auto` | auto-rickshaw (unchanged) | `auto_rickshaw.py` | 16k / 12k | 10 / 10 | 130 + 107 KB |
| `ambulance` | van ambulance, 5.1 × 1.96 × 2.22 m | `vehicles.py` | 14,576 / 3,900 | 15 / 13 | 134 + 58 KB |
| `bus` | city bus, 10.1 × 2.5 × 3.26 m | `vehicles.py` | 12,370 / 5,328 | 13 / 12 | 100 + 52 KB |

Triangles count everything (body, every wheel, doors). Budgets are held by
`packages/vehicles/src/blenderVehicles.test.ts`.

## How a model is made
`npm run blender:vehicles` (Blender 5.2 LTS; `BLENDER=/path/to/blender`) writes
`assets/models/vehicles/<name>.glb` and `<name>_lod1.glb`; `npm run optimize:assets` writes the game's
copies in `assets/optimized/vehicles/`. Add `-- <out> --only car,bike --render <dir>` (run the script
through `node scripts/blender.mjs`) for Cycles review renders. A body is one shell lofted through
cross-sections and subdivided, with wheel arches cut by booleans, panel seams as 12 mm grooves,
colours given by face position (glass, bands, bumpers), then doors split off the shell along their
seams so a door is the body's own curved panel and window. Lamps, plates and mirrors are placed on
the surface by ray casts. Nothing is copied from a real vehicle: no badge, logo, grille shape or
livery; plates read "TN 00 X 0000" (not a real registration); the ambulance is white with red and
yellow bands and "AMBULANCE" lettering; the bus is the game's own teal and cream.

In the game (`glbModels.ts`, `models.ts`): parts are grouped by material role (`v_<role>_<what>`:
paint, trim, metal, glass, lamp, tail, decal, board, beaconred, beaconblue) with colours in the
vertices, so one draw call per role, shared buffers per livery colour, and shared materials for
every vehicle. `v_paint_body` takes the livery colour (the bus and ambulance keep their own). Plates
and lettering (`decal`) use one generated 512 × 256 canvas, `vehicleDecalTexture()`. Wheels are one
geometry per model, mirrored for the left side; doors are one `DoorMesh` per vehicle.

## Levels of detail
- **Traffic** (`TrafficCar`, so AI traffic, police and gang cars) always uses the light model
  (`<kind>_lod1`): no separate doors, no interior detail, simpler wheels.
- **Parked and drivable vehicles** (`Vehicle`) use the detailed model within 28 m of the player and
  the light one beyond 34 m; a vehicle with a door open stays detailed. `Game` passes the player's
  position to `Vehicle.sync`.

## Doors
Same hinges, seams and angles as before (`DOOR_SWING` in `models.ts`, matching `specs.ts`): car
driver's door (right front, hinge z -0.55) and both rear doors (hinge z 0.5); ambulance cab door
(hinge z -1.22) and two rear doors (hinges x ±0.7, z 2.56, opening 110°); bus front door, two
folding leaves on the kerb side (z -4.15 to -3.05). Hinges are not read from the files: the
optimiser moves node origins (quantisation).

## Riding and driving points
Unchanged data, modelled to fit (`blenderVehicles.test.ts`, `apps/game/src/ridingPose.test.ts`):
bike grips at (±0.33, 0.52, -0.42) and footpegs at (±0.24, -0.265, 0.12); steering wheels whose
rims pass through the drivers' hand points (car centre (0.36, 0.27, -0.32), radius 0.175; ambulance
radius 0.19; bus radius 0.22), seats under the hip points, pedals under the feet.

## Cargo anchors (for job props)
`VehicleType.cargo`: the middle of a load's base, chassis frame (+X right, -Z forwards, y up from
the chassis centre, y on the surface it rests on). A test checks there is a surface within 3 cm
under each and 25 cm of room above.

| Kind | `cargo` | Where | Also useful |
|---|---|---|---|
| `bike` | (0, 0.27, 0.85) | rear carrier plate behind the seat | pillion seat top y ≈ 0.26 at z 0.6 |
| `car` | (0, -0.15, 0.95) | middle of the back seat (cushion top), seen through the glass | boot floor (0, -0.3, 1.62); seat runs x ±0.68, z 0.78 to 1.26 |
| `auto` | (0, 0.065, 0.82) | middle of the passengers' bench | floor in front of it y -0.29 |
| `ambulance` | (0, -0.5, 1.45) | floor of the patient's compartment, the stretcher's place | `cargoClear`: x -0.6..0.3, y -0.48..0.9, z 0.05..2.45 is empty |
| `bus` | (-0.85, -0.34, -2.9) | floor beside the front door, kerb side (no seats there) | floor y -0.34 throughout |

The ambulance's compartment has a crew bench along the right wall (x > 0.5) and cabinets at the
front (z < 0); the stretcher space between them, from the rear doors forwards, is kept clear, and
the patient's door point (`passengers[0].inside`) is inside it.

## Not done
Steering wheels and handlebars don't turn with the front wheels; the car's glass is tinted (62 %
opaque), so the back seat shows dimly; the bus has single rear wheels (physics has one per side);
no damage states; nothing tried on a phone.
