# Progress (Godot version)

## Models (agent/godot-models)
- [x] Model kit by script (`tools/blender/vehicles/vkit.py`): shared palette atlas, paint and
  livery materials, LODs, anchors, manifests (G-30 to G-34).
- [x] Premium cars: luxury saloon, SUV, sports coupé (LOD0/LOD1, doors on hinges, steering
  node, seats, grips, cargo, 6 paints each).
- [x] Race car: original open-wheel car, 4 invented liveries.
- [x] Helicopter: main and tail rotor nodes, skids, hinged and sliding doors, 5 seats, cyclic
  and collective grips (LOD0/1/2).
- [x] Airliner: narrow-body twin, retract-pivot gear, ailerons, flaps, elevators, rudder, fans,
  forward door, invented airline colours (LOD0/1/2).
- [x] Light aircraft: high wing, propeller, control surfaces, steerable nose wheel, doors (LOD0/1/2).
- [x] Trains: ICF-style EMU (cab, motor, trailer), AC EMU variant, WAP-7-style locomotive,
  LHB-style coach, Vande-Bharat-style nose car and coach; bogies, wheelsets, sliding doors,
  pantographs, formations (LOD0/1/2).
- [x] Road vehicles ported from the Three.js game (hatchback, motorbike, auto-rickshaw, bus,
  ambulance) with manifests from `specs.ts` (G-36).
- [x] Headless model checks: `tests/models/test_models.gd`, 1,648 checks on 22 models, all
  passing, including the embedded palette and livery texels (G-37).
- [x] Review round: train LOD0 rebuilt with real openings, rounded roofs, vents, gangways,
  cab fronts, the WAP-7 nose and roof gear, the VB nose; the SUV reshaped; texture checks added.
- [ ] Use in the game (Phase 2, 6, 6b): manifest loader, visibility ranges, wheel, door and
  pivot animation, train MultiMesh.
- [ ] Seen on a phone (nothing tried on a device yet).
