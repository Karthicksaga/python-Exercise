# Handoff

Newest entry last. Say who you are (branch), what you did, what is next and what is weak.

## Foundation (phase 0), branch `agent/godot-foundation`, 23 Nov 2026
**Done.** Project skeleton, module layout as the Three.js game, boot flow (loading → title →
play on an empty test ground with a debug HUD), byte-for-byte data and asset sync with licence
rows, the world reader with a format-version check behind the `WorldSource` interface, the
floating origin, a headless test runner (21 tests), CI with import, tests, Android APK and an
emulator smoke run. Decisions G-1…G-9 in `technical-decisions.md`.

**For the World agent (wave 2).**
- Read the city only through `WorldSource` (`FileWorldSource` today). Call `open()`,
  `read_chunk()` and `roads_near()` on worker threads (`BackgroundTask`); they return plain data.
  Build chunk meshes with `SurfaceTool`/`ArrayMesh` off the main thread around `ChunkData.centre`,
  add a chunk only when complete, a few ms per frame.
- Put streamed content and the player in the group `WorldOrigin.GROUP` and call
  `WorldOrigin.follow(player_position)` from the player's step; convert data with
  `WorldOrigin.to_scene(Vector2(x, z), y)`.
- Replace `src/app/test_world/` with the streamed city; keep printing `[boot] play` when the
  player can move (the emulator smoke test waits for it), and keep the loading steps honest
  (add steps to `Main.STEPS`, each real work).
- `roads_near()` is a linear scan; keep roads per chunk (`roadSpansByChunk`) for streaming.

**CI.** Green on `agent/godot-foundation` (run 45185128445): tests, the `godot-chennai-apk`
artifact, emulator smoke. The first emulator runs stalled: the emulator's Vulkan failed to
present and the main loop stopped; with guest Vulkan off, Godot's own switch to OpenGL worked
once and then lost the app on the next run. The smoke APK now starts on the Compatibility
renderer itself, so the emulator tests booting, data and flow, not the Mobile renderer.

**Weak or not done.**
- The test ground is deliberately empty: no city meshes, no player, no touch joystick yet.
- 640×320 screens get readable but small text (14 at 0.7 scale ≈ 10 px).
- The Mobile (Vulkan) renderer has not run anywhere real yet: the CI emulator cannot present
  with Vulkan, and Godot's automatic Vulkan-to-OpenGL switch was unreliable there. First check
  on the owner's phone (Adreno 613).
- The frame watchdog is not covered by a test (it would need a deliberately stalled main loop).
- The APK carries every synced asset (about 50 MB of data, mostly the legacy cast) although
  phase 0 uses none of the models.
- Safe-area insets are coded but only real on a phone with a notch; untested there.

## Vehicles (phase 2), branch `agent/godot-vehicles`, 23 Nov 2026
**Done.** A ray-cast vehicle body that reproduces the Three.js handling (measured against the
Rapier vehicles: `tools/reference/threejs_handling.mts`, `tests/data/threejs_handling.json`),
all five Three.js vehicles plus taxi/police/gang variants, premium and race profiles, the
gearbox, boarding with doors, crash ejection, the chase camera and the touch driving controls,
tested in `src/app/vehicle_yard/` (a test ground). Decisions G-70…G-79; details in
`docs/vehicles.md`.

**For the Player agent.** Extend `VehicleRider` (or give your player its methods): `Driving`
calls `set_walking`, `place`, `set_seated(type, amount)` (draw `type.pose`: hands on the grips
or wheel, feet on the pegs or pedals, hips at the origin), `set_figure_visible`, `throw_off`,
`knockdown`, `consume_landing`. `CrashFlight` moves any `CharacterBody3D` through a throw.
**For the World agent.** Spawn with `Vehicle.create(variant)` + `place()`, add a `Driving` with
the rider, and `DrivingWiring.wire(driving, controls, camera)` in `Main`; put vehicles in
`WorldOrigin.GROUP` when they join the streamed city.
**For the Models agent.** Drop `saloon.glb`, `suv.glb`, `coupe.glb`, `race_car.glb` with a
`.vehicle.json` each in `assets/vehicles/` (format in `docs/vehicles.md`); wheels at the physics
wheel positions of `vehicle_types.json`.
**For the Sound agent.** Signals: `Driving.horn`, `boarding_event` (door_opening, shut…),
`crashed`; `Gearbox.shifted_up` for gear changes; `Vehicle.siren()`.

**Weak.** The single-front-wheel vehicles turn ~15 % less from rest than in the Three.js game and
the rear-driven ones slide a little more at full lock (cause not found; `docs/vehicles.md`).
Seated riders are a capsule; premium cars are stretched stand-ins; the yard's lighting is a test
ground, not the city. No physics interpolation: if the phone shows judder at 90+ Hz, revisit
with G-2.
