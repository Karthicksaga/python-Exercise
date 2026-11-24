# Vehicles, aircraft and trains: models, data model, budgets

Every model here is the output of a Blender script in `tools/blender/vehicles/` (Blender 5.2 LTS,
headless). The scripts are the source, and running them again rebuilds the same models (nodes, triangle counts and manifests are identical; a few GLBs differ by a few bytes between runs). All designs
are original. There are no real makes, badges, grilles, airline names, railway or metro logos,
lettering or real numbers (TD-18 of the Three.js game; brief §11). Decisions G-30 to G-39 are in
`technical-decisions.md`.

## What there is

| Model (`assets/…`) | What | Size L × W × H (m) | Triangles LOD0 / LOD1 / LOD2 | Files |
|---|---|---|---|---|
| `vehicles/saloon` | original luxury saloon, 4 doors, 6 paints | 5.13 × 1.99 × 1.47 | 9,894 / 2,088 | 451 KB |
| `vehicles/suv` | original large SUV (7 seats): high ride, 0.80 m wheels, flat high bonnet, upright screen and tailgate, flared arch cladding, short overhangs | 4.6 × 2.1 × 1.9 | 9,958 / 2,096 | ~470 KB |
| `vehicles/coupe` | original sports coupé, 2 doors, 6 paints | 4.58 × 1.93 × 1.25 | 9,018 / 2,090 | 410 KB |
| `vehicles/formula` | original open-wheel race car, 4 invented team-less liveries | 5.60 × 2.36 × 1.19 | 6,834 / 1,638 | 353 KB |
| `vehicles/legacy/hatchback`, `motorbike`, `auto_rickshaw`, `ambulance`, `bus` | the Three.js game's, synced byte for byte by `tools/sync_from_threejs.py` (G-36); manifests by `port_road_vehicles.py` | as before | 10,460 / 3,050 · 7,616 / 2,262 · 16,382 / 12,306 · 14,576 / 3,900 · 12,370 / 5,328 | 3.3 MB |
| `vehicles/auto_rickshaw`, `share_auto`, `goods_carrier` | Tamil Nadu three-wheelers and the mini goods carrier (see "Tamil Nadu road vehicles" below) | 2.69 × 1.50 × 1.70 · 3.43 × 1.69 × 1.92 · 3.78 × 1.90 × 1.95 | 5,586 / 2,040 · 4,898 / 1,690 · 5,596 / 1,272 | 1.0 MB |
| `vehicles/hatchback`, `sedan`, `taxi`, `ambulance` | Indian small hatchback, compact sedan, Chennai taxi, high-roof van ambulance | 3.68 × 1.71 × 1.54 · 4.06 × 1.80 × 1.49 · 4.06 × 1.80 × 1.73 · 5.38 × 2.42 × 2.57 | 9,206 / 1,902 · 9,484 / 2,054 · 9,648 / 2,058 · 7,624 / 1,564 | 1.7 MB |
| `vehicles/bus_city`, `bus_lowfloor`, `bus_intercity`, `bus_mofussil`, `bus_school` | Tamil Nadu buses: city high-floor, low-floor, state-transport intercity, private mofussil, school | 9.5 to 12.2 × 2.56 (3.22 with mirrors) × 3.1 to 3.6 | 9,844 / 2,816 / 308 · 8,940 / 2,486 / 308 · 9,656 / 2,852 / 308 · 10,620 / 3,240 / 308 · 9,146 / 2,608 / 308 | 3.2 MB |
| `aircraft/helicopter` | light utility helicopter: 3-blade main rotor, tail rotor, skids, 5 seats | 12.8 (rotor) × 9.4 × 2.9 | 5,580 / 2,162 / 322 | 392 KB |
| `aircraft/airliner` | small narrow-body twin, about 150 seats, invented airline colours | 37.4 × 34.6 × 11.8 | 7,704 / 2,664 / 556 | 595 KB |
| `aircraft/light_aircraft` | high-wing four-seat single-engine | 8.5 × 11.1 × 2.8 | 6,470 / 1,886 / 340 | 394 KB |
| `trains/emu_cab`, `emu_motor`, `emu_trailer` | ICF-style suburban EMU (12-car rake), stainless with a green and cream colour family | 21.9 × 3.27 × 4.1 (4.8 with pantograph) | cab 3,578 / 392 / 40; motor 3,266 / 376 / 40; trailer 3,022 / 296 / 40 | ~0.7 MB |
| `trains/emu_ac_*` | the AC EMU variant: white, blue window band, sealed windows, roof AC units with grilles | as the EMU | cab 3,234 / 480 / 40; motor 2,874 / 464 / 40; trailer 2,630 / 384 / 40 | ~0.7 MB |
| `trains/wap7` | WAP-7-style twin-cab Co-Co electric locomotive, red and cream colour family: projecting lower cab noses, louvres, roof bars, breakers, insulators, two pantographs | 21.8 × 3.15 × 4.8 | 5,782 / 628 / 40 | ~0.3 MB |
| `trains/lhb_coach` | LHB-style express coach | 24.6 × 3.27 × 4.3 | 2,638 / 416 / 40 | ~0.2 MB |
| `trains/vb_cab`, `vb_coach` | Vande-Bharat-style set, saffron and grey colour family, rounded aerodynamic nose with a wrap-round glass windscreen | 25.6 × 3.28 × 4.0 | nose car 3,393 / 364 / 56; coach 2,370 / 248 / 40 | ~0.4 MB |

The figures come from the manifests, which the tests check against the files. The models together
come to **6.1 MB** of GLB and JSON, plus 3.3 MB of synced legacy vehicles. Train and aircraft dimensions are estimates from published
figures (broad gauge 1,676 mm), and each manifest says so.

## Budgets (held by `tests/models/model_checks.gd`, run in `./run_tests.sh`)

| Kind | LOD0 | LOD1 | LOD2 | Source |
|---|---|---|---|---|
| car, race car | ≤ 12,000 | ≤ 3,000 | (none) | brief, `chennai-game-design` §6 |
| helicopter | ≤ 10,000 | ≤ 2,500 | ≤ 400 | brief |
| airliner | ≤ 15,000 | ≤ 3,500 | ≤ 600 | brief ("strong LODs") |
| light aircraft | ≤ 10,000 | ≤ 2,500 | ≤ 400 | as the helicopter |
| train coach | body ≤ 3,000 + bogies ≤ 400 each (with their wheelsets) | ≤ 600 | ≤ 120 | research note (trains) |
| cab, loco, VB nose car | body ≤ 6,000 + bogies ≤ 400 each (600 for a three-axle Co-Co bogie) | ≤ 1,000 | ≤ 150 | research note |
| auto, share auto, goods carrier, Indian cars, van ambulance | ≤ 12,000 | ≤ 3,000 | (none) | brief (G-92) |
| bus | ≤ 15,000 | ≤ 3,500 | ≤ 600 | brief (G-92) |
| ported road vehicles | the old game's measured counts (the auto is 16.4k / 12.3k, over the car budget) | | | `chennai-open-world/docs/vehicles.md` |

Textures are 512 px, or 1,024 px for the airliner's livery. Vehicle LODs switch at 28 m. The
helicopter and light aircraft switch at 40, 250 and 2,000 m, the airliner at 90, 600 and 4,000 m,
and trains at 60, 300 and 900 m (research note). The game should drive these with
`GeometryInstance3D.visibility_range_begin/end`.

## Train detail (LOD0)

`train_detail.py` builds the LOD0 bodies from pieces that meet exactly:
- the belly and the roof are lofted strips. The roof is rounded (one Chaikin pass), with gutters
  along the cant rail and torpedo ventilators (ICF EMU) or AC units with grilles. It is drawn in
  the atlas `roof_grey` (rough, dark), not the livery, so it doesn't wash out under the sky.
- the side walls are panels with real openings. ICF windows are set in 7 cm, with aluminium frames
  and three horizontal bars. Sealed windows (AC EMU, LHB, Vande Bharat) are dark glass in black
  frames. Doorways are set in 55 cm as vestibules with a floor, a lintel, the sliding leaf, grab
  rails each side and a step. The WAP-7's machine-room louvres have slats.
- the ends are a gangway end (bellows, a face plate, coupler, buffers on the LHB) or a cab front.
  The cab front has two recessed windscreens with wipers, a blank LED route board between twin
  head lamps, lower head and marker lamps, a horn, grab rails, footsteps, a buffer beam, pilot and
  coupler. The WAP-7 adds its projecting lower nose with lamps, and on the roof its bars,
  breakers, insulators and walkway. The Vande Bharat nose is 14 rings rounding to the snout, with
  the windscreen as real glass faces.
- underneath are solebars, equipment cases, tanks and brake cylinders. Bogies have side frames,
  axle boxes, coil springs and a bolster, with the wheelsets as children.

LOD1 and LOD2 keep the light wrapped shell with the windows painted in the livery, in the same
places as the LOD0 openings: both read one window list, so they line up.

## Tamil Nadu road vehicles (agent/godot-tn-vehicles)

Scripts in `tools/blender/vehicles/road/`: `tnkit.py` (shared parts on top of `vkit.py`: steel
disc wheels with duals, plates, mirrors on stalks, round lamps, rounded-section lofts, the bus
livery projection, manifests), `autos.py` (auto-rickshaw, share auto, goods carrier),
`cars_in.py` (hatchback, sedan, taxi, ambulance; bodies by `cars.py`'s `car_body`) and
`buses.py` (five buses). `build_all.sh` runs them after `cars.py`. They replace the Three.js
hatchback, auto, ambulance and bus in `assets/vehicles/` (the old ones stay in `legacy/`).

| Model | Built as | Riding and moving parts |
|---|---|---|
| `auto_rickshaw` | Chennai auto: yellow tub (paint), black canvas hood with a yellow band over the windscreen, rear-quarter curtains and a small rear window, the front cowl with two indicator pods on stalks, a dark vent and the yellow plate, the round headlamp on the front mudguard; black waist stripe; windscreen with frame and wiper; mirrors on stalks; fare meter (red digits) on the dash; driver's seat, three-seat rear bench, passengers' bar on the seat back, safety bar across the right-hand opening, chrome rear-quarter posts; engine and silencer under the back | `steering` (handlebar, column, fork, front mudguard and headlamp turn together about the column axis), `wheel_front`, `wheel_rear_left/right`; seats (driver, 3 bench), grips (handlebar ends, seat-back bar, side bar), feet, cargo (bench, rear shelf), `exit_driver`. Wheel positions, hip points, pose and handling are the Three.js auto's |
| `share_auto` | six-seat share auto (Ape-style): full-width cab with a raked windscreen, cab roof and visor, twin round headlamps, a canvas hood on posts with rolled side curtains, two facing benches of three, rear step and handles | handlebar `steering`, three wheels, `seat_driver`, `seat_left_1..3`, `seat_right_1..3`, roof-rail and rear-step grips, `exit_driver`, `exit_rear` |
| `goods_carrier` | mini goods carrier (Ace-style): cab over the front axle, rectangular headlamps, plain intake slot, two hinged doors, drop-side steel deck with ribs, headboard and guard, mud flaps | `door_r`, `door_l`, steering wheel on the right, four wheels, two seats, `cargo_deck` (size in the manifest) |
| `hatchback` | small tall-boy hatchback (redesign; same handling): five doors, swept headlamp clusters, slim grille slot, black intake, vertical tail lamps, spoiler lip with stop lamp, black mirrors, 13-inch steel wheels with covers | as the premium cars: four doors, steering, four seats, `cargo_boot`, `exit_driver` |
| `sedan` | compact (sub-4 m) sedan with a short boot, chrome grille bar, fog lamps, wide tail lamps, body-colour mirrors, alloy wheels | as the hatchback |
| `taxi` | the sedan as a Chennai taxi: plain yellow roof board with a black band (no lettering), yellow plates, steel wheels; paints white, taxi yellow, silver | as the sedan |
| `ambulance` | high-roof van ambulance (redesign; same wheels and handling): white with a red waist band, red and white beacon bar, amber rear warning lamps, frosted patient-compartment windows, stretcher and attendant's bench inside | `door_cab`, `door_cab_l`, `door_back_l/r` (110°), steering, driver, cab and attendant seats, `cargo_stretcher`, `cargo_clear`, `exit_rear` |
| `bus_city` | classic high-floor city bus: front engine, driver on the right, front door ahead of the front axle and rear door ahead of the rear axle (two leaves each, three steps), window rows with pillars and two guard bars, split windscreen, slatted grille, twin round lamps, rabbit-ear mirrors, roof hatches | `door_front_a/b`, `door_rear_a/b`, `steering`, dual rear wheels (one node per side), driver, conductor (by the rear door) and every passenger seat (`seat_rNN_l1…r2`), ceiling-rail and door-stanchion grips, `standing_area`, kerb points `stand_door_*`, destination boards `dest_front`, `dest_side`, `dest_rear` |
| `bus_lowfloor` | low-floor city bus: rear engine, one step, a wide middle door, deep windows, flat front with strip lamps | as above (`door_front_*`, `door_mid_*`) |
| `bus_intercity` | state-transport-style mofussil bus: one front door, 2 + 2 seats, roof luggage rails, rear ladder | as above |
| `bus_mofussil` | private mofussil bus: invented painted sweeps, sun and stars, chrome bumper and grille slats, a visor with marker lamps, air horns, chrome hubs | as above |
| `bus_school` | school bus: golden yellow with a brown band, barred windows, an emergency door at the back | as above (no destination names) |

Bus LOD2 (308 triangles) is the shell with glass, lamp and bumper blocks and plain wheel
cylinders, no wheel nodes (`lod_max: 1` on the manifest's wheels); buses switch at 40, 250 and
900 m. Destination boards are black panels with a lit amber line (`led_amber`); the game draws one
place name per board, Tamil above English, from the manifest's `destinations` (real place names,
no route numbers or operators). Fleet numbers are invented and painted on the front and rear only
(the sides share the texture, so text there would read backwards on the left).

### Rules followed (G-90 to G-93)
- Original geometry by script at real proportions. No downloaded mesh is in the game; no
  reference picture is in the repository, used as a texture or traced.
- No make, badge, maker's name, grille shape copied from a make, no operator name (MTC, TNSTC,
  SETC or any private operator), emblem, route number, government mark, real registration, red
  cross or star of life. Plates are blank (yellow for commercial vehicles, white for private
  cars); the game draws invented numbers.
- Liveries follow real colour families with invented layouts: Chennai city bus cream with maroon
  bands; low-floor white over red-orange; state-transport intercity green with yellow bands;
  private mofussil white with bright sweeps; school bus golden yellow with the brown band; autos
  yellow with a black hood; taxis plain with a yellow and black roof board. The tests check each
  livery's sampled colours against named colour families (`texture_samples[].family`,
  `paint_family`).

### References (looked at, not shipped)
Pictures were kept in a scratch folder outside the repository. Titles below name real makes
and operators because that is what the pictures show; the models carry none of it.

Seen (Wikimedia Commons photographs):

| File | Author | Licence | Used for |
|---|---|---|---|
| [Maruti Suzuki Alto rear.jpg](https://commons.wikimedia.org/wiki/File:Maruti_Suzuki_Alto_rear.jpg) | V Malik | CC BY-SA 2.0 | small hatchback proportions, tail lamps, plate and bumper |
| [Chennai mtc bus inside.jpg](https://commons.wikimedia.org/wiki/File:Chennai_mtc_bus_inside.jpg) | PlaneMad | CC BY-SA 3.0 | city bus seat rows, rails and stanchions |

Seen (Sketchfab model thumbnails, as 3D shape references; no model downloaded):

| Model | Author | Licence | Used for |
|---|---|---|---|
| [Auto Rickshaw](https://sketchfab.com/3d-models/auto-rickshaw-44776bcb34e04c1a8b9c18a70376304e) | rSquare | CC BY | Chennai auto: cowl, hood, yellow and black |
| [Indian chennai auto rikshaw](https://sketchfab.com/3d-models/indian-chennai-auto-rikshaw-ea9ee5878ca640b783b26f38193584c8) | roystoncinemo | none listed (viewed only) | auto: black waist stripe, bench, mudguard |
| [Low Poly Autorickshaw aka TukTuk](https://sketchfab.com/3d-models/low-poly-autorickshaw-aka-tuktuk-c7c87455ad014b3f9fc8c9fb2d164a61) | Nirmal.Justin | CC BY | auto proportions |
| [tnstc old bus](https://sketchfab.com/3d-models/tnstc-old-bus-3cad9be97ed74e19b3ffd2926fde3cee) | Meshmill | CC BY | city/intercity front: split windscreen, grille, twin round lamps; cream and maroon family |
| [Tamilnadu TNSTC Bus 2009-2014](https://sketchfab.com/3d-models/tamilnadu-tnstc-bus-2009-2014-e6841dcaa4dd4cf8ba62170539179c7a) | Car Simulator 2-Preview | CC BY | intercity green with yellow bands |
| [Tamilnadu SETC Bus 2017-2026](https://sketchfab.com/3d-models/tamilnadu-setc-bus-2017-2026-2d6367ce1a894af3bf7359df94ef9f96) | Car Simulator 2-Preview | CC BY | long-distance body proportions |
| [Balaji Bus 3d model](https://sketchfab.com/3d-models/balaji-bus-3d-model-57e04a7aac6b4a62983bdf87dfa99608) | Meshmill | CC BY | private mofussil: bright painted sides, decorated front (art invented, no names) |
| [TOWN BUS tamilnadu](https://sketchfab.com/3d-models/town-bus-tamilnadu-aa77676b12364b16ab474828554556b5) | Selvam | none listed (viewed only) | town bus front |
| [2008 Ashok Leyland Viking Bus](https://sketchfab.com/3d-models/2008-ashok-leyland-viking-bus-4daaa992332f43419f85783a120cea44), [Indian Bus](https://sketchfab.com/3d-models/indian-bus-67b7998f0f3341a8a96655f96adc1a77), [Indian Bus 6](https://sketchfab.com/3d-models/indian-bus-6-c1061c2c13a24930a2e170d02b545655) | Kevin studio Ltd; Parth; Car Simulator 2-Preview | CC BY | high-floor body, window rows and door layout |
| [Indian School Bus 3D Model](https://sketchfab.com/3d-models/indian-school-bus-3d-model-5e51d8b9265546c9af5f67da7e866a2b) | surya3997 | none listed (viewed only) | school bus yellow with a brown band, barred windows |
| [TATA ACE](https://sketchfab.com/3d-models/tata-ace-a7d929f5c0c74838984fcfb6641c4612) | rmihir560 | CC BY | goods carrier cab and deck proportions |
| [Piaggio Ape C](https://sketchfab.com/3d-models/piaggio-ape-c-e1fc80456fd54065ac8b3c94ca063af3) | Stenz Lannoo | none listed (viewed only) | share-auto cab |
| [Suzuki Swift Dzire](https://sketchfab.com/3d-models/suzuki-swift-dzire-885c8f08674f48d7a54706fee791402f), [Hyundai Santro Xing](https://sketchfab.com/3d-models/hyundai-santro-xing-36b682c730644263b395ff9ab9e6c249) | r34maxpro; Prasad_bhushi | CC BY | compact sedan and tall-boy hatchback proportions |
| [2024 Maruti Suzuki Eeco](https://sketchfab.com/3d-models/2024-maruti-suzuki-eeco-6d1931e262534c96a096b2d18bbc54b9), [Indian Ambulance Vehicle](https://sketchfab.com/3d-models/indian-ambulance-vehicle-3d-model-blender-59b61734dcb54c2991e84e7d41e7d5e4) | BHP3D; Sanjeet Kotarya | CC BY; none listed (viewed only) | van ambulance proportions (its tricolour bands and lettering not used) |

Found but not seen: the Commons image servers answered every download with HTTP 429 (rate
limited) on 23 Nov 2026, so these photographs were identified, with their licences, but not
looked at: MTC Chennai 56N.jpg and MTC Chennai 56.jpg (VtTN, CC BY-SA 3.0), MTC Bus 21G.JPG (VtTN,
CC BY 3.0), Chennai MTC's ordinary fare bus.jpg (Aravind Sivaraj, CC BY-SA 3.0), MTC BUS.jpg
(Kalidasslegend, CC0), Ashok Leyland Low Floor Bus.jpg (Rithish RK, CC BY-SA 4.0), TNSTC Bus
Departing Central Trichy Aug22 A7C 02323.jpg and Pvt Bus MGR Bus Stand Tirunelveli Apr22 A7C
01851.jpg (Timothy A. Gonsalves, CC BY-SA 4.0), A TNSTC Mofussil bus.jpg (Vishwa Sundar, CC BY-SA
4.0), TN private bus.jpg (VtTN, CC BY-SA 3.0), Bus Bay at TVS Matriculation Higher Secondary
School.JPG (Saravanan K, CC BY-SA 3.0), 2013 Bajaj RE auto rickshaw.jpg (Oleg Yunakov, CC BY-SA
4.0), India Chennai riksha (16574373141).jpg (floriamo, CC BY-SA 2.0), Piaggio Ape 01.jpg (Huhu
Uet, CC BY 3.0), Maruti Suzuki Dzire VXi VVT.JPG (Biswarup Ganguly, CC BY 3.0), Santro
BlackANdYellowTaxis.jpg (AroundMumbai, CC BY-SA 3.0), Indian Ambulance.jpg (CC BY 2.0). The city
bus colour family (cream with maroon) rests on the 3D references and the interior photograph;
checking it against these photographs is the first follow-up.

### Not done, or weak (Tamil Nadu vehicles)
- Not compared with real photographs of current Chennai city buses (see above); the city and
  low-floor colour families are the least certain.
- Bus door leaves are a pair of hinged leaves, not a folding mechanism; no wheelchair ramp on the
  low-floor bus. Interiors are seat rows, rails and a dash only.
- The auto's cowl is smoother and blunter than the real pressed panel; the hood has no seams or
  straps. The share auto's cab is simplified (no doors, a plain dash).
- Car fronts are generic small-car faces; the hatchback reads a little long.
- The motorbike is still the Three.js one (`legacy/motorbike`); it was not restyled.
- Nothing has been seen on a phone.

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
- `assets/vehicles/shared/palette.json` lists every role's cell, UV and colours. New roles are only
  ever appended, so existing UVs stay valid. The tests check each GLB's embedded atlas against it
  cell by cell, and read back each manifest's `texture_samples` (livery texels: body colour,
  bands, cab front) from the embedded images, so a wrong or stale texture fails.
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
python3 godot-chennai/tools/sync_from_threejs.py                      # the legacy GLBs (assets/vehicles/legacy/)
python3 godot-chennai/tools/blender/vehicles/port_road_vehicles.py   # their manifests
godot-chennai/run_tests.sh --filter=vehicle_models                   # the model checks
```

Review screenshots (Compatibility renderer, not committed) come from
`tools/models/model_shot.gd`. It loads any GLBs at run time; the command is in the script header. `OPEN_DOORS=1` swings the doors
open.

## Not done, or weak

- The premium cars are clean but simple (the SUV was reworked to read as an SUV): their front and rear faces are lamp boxes on a soft
  shell, and the side glass ends on face edges, so window outlines are a little stepped up close.
  None has been seen on a phone.
- Trains: the door leaves start closed (Chennai EMUs often run with them open; the game decides).
  The Vande Bharat windscreen edge is stepped where it crosses the nose's rings. Bogies are still
  simple boxes (frames, axle boxes and springs, no brake rigging). There are no seats inside the
  cars.
- The helicopter and aeroplane cabins are only seats and a panel. There are no gauges, and the
  rotor has no blurred-disc mesh.
- The ported auto-rickshaw is over the car budget (16k / 12k). A lighter LOD1 is a follow-up.
- Steering wheels exist as nodes on the new cars only. The old models' steering wheels are part
  of the body, as they were in the Three.js game.
- Each GLB carries its own copy of the 11 KB palette. To share one texture in memory, set the
  importer's external-material option for `atlas` once the project exists. The palette PNGs are in
  `assets/vehicles/shared/` for that.
