# Vehicles (Godot)

Phase 2 of the migration: drivable vehicles, matched to the Three.js game's handling. Decisions
G-70…G-79 in `technical-decisions.md`. Code: `src/physics/` (the vehicle body), `src/vehicles/`
(types, models, gearbox, boarding, crashes, driving), `src/game_engine/chase_camera.gd`,
`src/ui/driving_controls/`, `src/app/driving_wiring.gd` and the test ground
`src/app/vehicle_yard/`.

## What is where
| Piece | File | Port of (Three.js) |
|---|---|---|
| Ray-cast vehicle body (suspension, tyres, engine, brakes, arcade drift, hold-the-line) | `src/physics/raycast_vehicle.gd` | `packages/physics/src/VehicleBody.ts` on Rapier's `DynamicRayCastVehicleController` |
| Handling numbers | `src/physics/vehicle_spec.gd` | `VehicleSpec` |
| Kinds, variants, seats, poses, doors, passengers, crash rules | `src/vehicles/data/vehicle_types.json`, `vehicle_type.gd`, `vehicle_catalog.gd` | `packages/vehicles/src/specs.ts`, TD-29 `crash.ts` |
| Drivable vehicle (model, wheels, doors, siren, lean, topple, crash detection) | `src/vehicles/vehicle.gd`, `vehicle_model.gd` | `Vehicle.ts`, `glbModels.ts` |
| Gear selector P/R/D, HUD gear | `src/vehicles/gearbox.gd` | `Gearbox.ts`, `gearFor`, `shiftedUp` |
| Getting in and out (walk, door, pull, climb, sit, close) | `src/vehicles/boarding.gd` | `Boarding.ts` (with the TD-30 `pull` phase) |
| Crash rules and the thrown body | `src/vehicles/crash_rules.gd`, `crash_flight.gd` | `crash.ts`, `Crashes.ts`, `PlayerController.throwOff` (TD-29) |
| Driving session (input → gearbox → vehicle, boarding, crashes) | `src/vehicles/driving.gd`, `drive_input.gd` | parts of `Game.ts`, `Boarder.ts` |
| The person in the seat | `src/vehicles/vehicle_rider.gd` | interface for the Player agent; a capsule stand-in until then |
| Chase camera | `src/game_engine/chase_camera.gd` | `FollowCamera` driving mode, `chennai-game-design` §5 |
| Touch controls | `src/ui/driving_controls/` | the driving HUD of `Controls` |

## Kinds and variants
| Variant | Kind (handling) | Model | Notes |
|---|---|---|---|
| hatchback, taxi, police, gang | car | `hatchback.glb` | taxi: amber roof sign; police: light bar and siren; gang: dark paint. Paint colours are invented, no insignia |
| auto | auto | `auto_rickshaw.glb` | open sides, step in from the kerb |
| motorbike | bike | `motorbike.glb` | leans into corners (drawn only), topples when the rider is thrown |
| ambulance | ambulance | `ambulance.glb` | siren (red/blue beacons), rear doors for patients |
| bus | bus | `bus.glb` | folding front door on the kerb side, aisle to the driver's seat |
| saloon, suv, coupe, race_car | saloon, suv, coupe, race (model `formula`) | **stand-ins** until the Models agent's GLBs land on this branch: `hatchback.glb` (saloon, coupé, race car) and `ambulance.glb` (SUV) stretched to the car's size | handling profiles are invented (MIGRATION_PROMPT §11): faster, grippier (`grip`), quieter engines are the Sound agent's |

## Model manifest (`assets/vehicles/<model>.json`, G-73)
The schema is the Models agent's (their `docs/vehicles.md`, "The manifest"); the Tamil Nadu
vehicles agent uses it too. `VehicleManifest` (`src/vehicles/vehicle_manifest.gd`) reads it:

| Manifest field | Used for |
|---|---|
| `lods[]` (`file`, `min_distance_m`, `max_distance_m`) | LOD0 animated (wheels, doors), the others swapped in by `visibility_range` |
| `wheels[]` (`node`, `centre`, `radius`) | wheel nodes matched to the physics wheels by position, drawn at the physics hub, scaled to the physics radius |
| `doors[]` (`node`, `hinge`, `open_deg`, `notes`) | doors swing about Y by `open_deg`; leaf 0 is the first (the driver's); a pair on one hinge line at the front or back (the ambulance's rear doors) and `folding leaf`s (the bus) swing together |
| `physics.wheels`, `physics.halfExtents` (else the first `collision` box), `physics.rideHeight`, `collision[]` boxes, `seats[]` (driver `hip`), `pose`, `entry` | the kind's geometry, when the kind's own model is present (chassis frame: model y minus `chassis_to_model_y`, else `rideHeight`) |
| `paint_surface`/`paints` | material `paint` takes the variant's colour (ported GLBs: `v_paint_body`, `auto_paint`) |
| `siren` | the ported ambulance's beacon materials flash |
| `body_size_m`/`size_m` height | roof height for the police light bar and taxi roof sign |

The handling scalars (mass, engine, top speed, steering, brakes, drift, grip) stay in
`src/vehicles/data/vehicle_types.json`: the five Three.js kinds are held to the Three.js numbers
by the tests (G-71); the manifests' `physics` values for new cars are the Models agent's
"proposed starting values" and are not used for handling. A kind names its `model` and a
`fallback_model`: until `saloon`, `suv`, `coupe` and `formula` GLBs are on the branch, those
kinds draw a stretched stand-in (hatchback or ambulance) and keep their data geometry; when the
GLB and manifest arrive, the model and its geometry are used with no code change.

## Handling against the Three.js game (G-71)
`tools/reference/threejs_handling.mts` drives the Three.js vehicles (Rapier) on a flat plane and
writes `tests/data/threejs_handling.json`; `tests/support/handling_measure.gd` drives the Godot
vehicles the same way and `tests/scene/test_vehicle_handling.gd` compares them. Measured
23 Nov 2026 (Godot / Three.js):

| | Hatchback | Auto | Motorbike | Ambulance | Bus |
|---|---|---|---|---|---|
| Speed after 2 s, m/s | 10.90 / 10.69 | 8.37 / 8.14 | 14.60 / 13.80 | 10.05 / 9.87 | 6.99 / 6.88 |
| Top speed, m/s (spec) | 21.84 / 21.82 (23) | 13.09 / 13.08 (14) | 25.02 / 24.99 (26) | 23.64 / 23.61 (25) | 15.69 / 15.67 (17) |
| Time to 90 % of spec top, s | 4.32 / 4.37 | 3.95 / 4.03 | 3.45 / 3.58 | 5.20 / 5.27 | 5.90 / 5.98 |
| Braking from 80 %, m | 24.5 / 24.3 | 8.2 / 8.1 | 22.0 / 21.7 | 28.6 / 28.3 | 13.8 / 13.7 |
| Coast 3 s from 80 %, m/s | 13.55 / 13.54 | 7.67 / 7.69 | 14.99 / 14.98 | 14.80 / 14.78 | 9.74 / 9.74 |
| Reverse after 5 s, m/s | -7.72 / -7.71 | -4.71 / -4.66 | -8.72 / -8.72 | -8.35 / -8.32 | -5.67 / -5.67 |
| Heading after 2.5 s full right from rest, rad | -1.87 / -1.85 | -2.01 / -2.31 | -2.85 / -3.36 | -1.30 / -1.28 | -0.50 / -0.52 |
| Fast full lock (90 %): peak slide, rad | 0.43 / 0.44 | 0.29 / 0.17 | 0.12 / 0.06 | 0.29 / 0.26 | 0.13 / 0.07 |

**Known differences.** Speed, braking, coasting and reversing match within a few per cent. The
first second of the motorbike's run is 13 % faster here: the Rapier reference vehicles had gone
to sleep while settling and woke with a suspension bounce (measured: the motorbike's chassis
rose 11 cm), which costs grip. The two vehicles with a single front wheel (motorbike, auto)
turn about 15 % less from rest, and the rear-driven ones (auto, motorbike, bus) slide a little
more at full lock near top speed (still within the "never drifts" and "no drift when slow"
rules the tests check). The algorithm is Rapier's (`ray_cast_vehicle_controller.rs` 0.21 was
read line by line); the remaining gap was not found.

Premium and race cars (no Three.js reference; invented): saloon 34.9 m/s top (126 km/h),
SUV 31.8 (115), coupé 43.0 (155), race car 61.2 (220).

## Crash ejection (TD-29, G-75)
| Vehicle | Shaken from | Thrown from | Style |
|---|---|---|---|
| Motorbike | 18 km/h | 35 km/h | off the seat; the bike topples |
| Auto | 18 | 30 | off the seat |
| Hatchback (taxi, police, gang) | 25 | 70 | through the windscreen |
| Ambulance | 25 | 75 | windscreen |
| Bus | 30 | never | – |
| Saloon / SUV / coupé | 30 | 95 / 90 / 110 | windscreen (invented: above each car's reach on the flat only in a head-on) |
| Race car | 40 | never (harness) | – |

The impact is the vehicle's change of velocity in one step; into a wall it comes out about 5 %
above the approach speed (restitution 0.1, as in Rapier). The thrown body moves with the
rider's own `CharacterBody3D.move_and_slide`, so walls stop it (swept, no tunnelling); it passes
through its own vehicle until it is up.

## Gaps
- Seated poses are the stand-in capsule folded to sitting height; the Player agent's
  `VehicleRider` subclass draws the real figure (hands on grips, feet on pegs: `VehicleType.pose`).
- No engine or horn sound (Sound agent: listen to `Driving.horn`, `boarding_event`, `crashed`).
- Not wired into `Main` yet (the streamed city is the World agent's); the yard is the test ground.
- Premium and race cars use stretched stand-in models.
