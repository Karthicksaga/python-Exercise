# Progress, testing and known issues

Last updated: 22 Nov 2026 (the Chennai cast: realistic South Indian people).

- **The Chennai cast (22 Nov; details in `docs/characters.md`, TD-24):** every person in the game
  is now a realistic South Indian figure built with MakeHuman/MPFB in Blender
  (`tools/blender/characters.py`, CC0 assets plus one credited CC-BY vest): 37 pedestrians (men,
  women, children and teens in shirts, T-shirts, veshti, lungi, saree, salwar kameez, chudidar,
  kurti, school uniforms; auto and cab drivers, traffic police and police, vendors, tea worker,
  construction workers, delivery riders, shopkeeper, office workers, college students) and a
  regenerated, clothed player. Cast by role from `assets/models/people/people.json`; children
  only in platform crowds and as passengers beside an adult; LOD1 beyond 30 m; feet planted on
  the ground. 6.8 MB optimised. Tested: unit 518/518, the touched browser specs, CI full suite
  green. Not on a phone yet.

## What exists

- **Full-screen city map (18 Nov, branch `agent/city-map`; unit-tested and browser-tested in
  headless Chromium, checked by eye in screenshots at 915×412 and 740×360; not on the emulator or
  a phone):** tapping the minimap opens a north-up map of the whole city
  (`packages/ui/src/CityMap.ts`, geometry in `cityMapMath.ts`; game glue `apps/game/src/CityMapDesk.ts`).
  It opens centred on the player at about 1.8 km across, with a blue heading arrow in a pulsing
  ring (a DOM element with a CSS animation, so the pulse needs no redraws; still with reduced
  motion), a north arrow, a scale bar and "© OpenStreetMap contributors · <extract date>". Drawn
  on a 2D canvas from data the game already has: every road from `roads.bin` by class (yellow
  arterials, pale-yellow secondary, white streets with casings; footpaths dashed at street
  level), the sea, parks/water/beaches (`index.json` areas), landmark footprints, buildings only
  where chunks are loaded (from 0.9 px/m), main-line railway tracks and stations with names
  (`rail.json`), district names (suburbs always, neighbourhoods from 0.3 px/m), and street names
  written along straight stretches of named roads (pieces between junctions joined first;
  arterials from 0.2 px/m, residential at street level; never cut off by the screen edge or
  under a button). Icons: places (`places.ts` badges), the vehicles (lettered tags in their
  minimap colours), share-auto passengers and drops, a job's route, and the objective as a flag,
  pinned to the screen edge with an arrow when off screen. The header says which district and
  street the player is in. Gestures: pinch (whole city 0.03 px/m to street level 6 px/m),
  one-finger drag, double-tap to zoom ×2 about the point, +/−, "centre on me", close (X);
  Escape and the mouse wheel on a desktop. The game is held while it is open (the job board's
  hold: no simulation, controls hidden) and runs again when it closes. **Android Back** closes
  it: the game tells the shell `{type:"cityMap", open}` and the shell sends `{type:"back"}`
  instead of pausing (`apps/mobile/src/GameScreen.tsx`); a shell pause (app to the background)
  closes the map and shows the pause screen. **Performance:** redraws only on a change, at most
  once per animation frame; roads and areas are filed by 1 km cell and, per zoom band (5 bands:
  main roads only and 20 m simplification zoomed out, everything unsimplified at street level),
  a cell's lines are simplified (Douglas–Peucker) and baked into Path2D objects the first time
  they are drawn; a redraw strokes only the cells on screen. Measured in headless Chromium
  (software rendering, other test runs on the machine): first open 78 ms (includes baking that
  band's cells), later redraws 0.6 ms at street level, 3 ms whole city, 10 ms at district zoom
  (`snapshot().cityMap.drawMs`). Not measured on a phone. Tests: see "What was tested" below.
- **Animated railway stations (18 Nov, branch `agent/stations`, TD-23; unit-tested and
  browser-tested in headless Chromium, checked by eye in screenshots; not on the emulator or a
  phone):** every station on the Beach–Tambaram line is now built round its platforms
  (`packages/game-engine/src/StationKit.ts`, from the layout in `packages/rail/src/station.ts`):
  deck with a pale coping, yellow line and tactile strip; a corrugated-sheet shelter on columns
  over the middle 72 m (single slope on side platforms, ridge on islands) with tube lights;
  benches, dustbins, lamp posts on the open ends; a tea stall with a seller; yellow name boards in
  Tamil, Hindi and English (OSM `name:ta`, `name:hi` where mapped, else transliterations written
  for the game, estimated; a 10 KB subset of Noto Sans Devanagari Bold); platform number boards;
  a clock with live hands and an amber LED departure board at the platform nearest the player
  (`StationLife.ts`; next trains from the timetable, "ON PLATFORM", "ARRIVING", "N MIN");
  "WAY OUT" signs; a foot-over-bridge with stairs onto the platform and down at both landings,
  spanning the main tracks mapped within 32 m; a booking office at its outer landing (not solid).
  Overhead wires (contact and catenary) along every running line, on masts every 54 m on the side
  with room. Trains: turning wheelsets under the coaches within 140 m (one instanced mesh), bogie
  side frames, a pantograph on each motor coach. Life: people wait along the platform edges
  (count by time of day, at most 24 waiting / 36 on a platform, crowds only on the two platforms
  within 170 m, the nearest 20 people within 80 m drawn); when a train's doors open, up to 12 of
  its line's waiting people walk to the nearest door and get on and 2–10 get off and walk to the
  exits (`packages/rail/src/crowd.ts`); the train's load changes accordingly. A three-note chime
  and a murmured "announcement" 50 s before a train reaches the player's platform; a two-tone horn
  as a train within 350 m pulls away (`Sound.stationChime`, `trainHorn`). People are the game's
  human model baked into 7 still poses (stand, 6 walk moments), simplified at load to about 610
  triangles and instanced (`packages/player/src/CrowdFigures.ts`). Trains, doors and people are
  drawn on a render clock that follows the railway clock between physics steps (not while riding:
  the camera still moves on the physics step). Motion is unchanged: brake at 0.9 m/s² to exactly
  the stop mark, 30 s dwell, accelerate at 0.8 m/s² (TD-19).
  **Measured** (production build, headless Chromium, `?quality=lite`, 915×412, max over 1.5 s
  after 4 s of game time; base = `feat/chennai-open-world` a56bb00 built the same way): Anna
  Nagar spawn 178 / 253,838 → 178 / 253,838 (unchanged); Egmore (5622, 703) facing north
  163 / 218k → 178 / 233k, facing south 146 / 229k → 148 / 245k; on Egmore's platform 142 / 202k
  → 145 / 223k; Kodambakkam platform 163 / 299k → 166 / 318k and 133 / 285k → 167 / 319k
  (**over the 300k budget**: the area was already at 285–299k without stations; traffic makes
  these numbers vary by ±10k between runs); Guindy 136 / 188k → 147 / 208k. A detailed side
  station is about 2.9k triangles (unit test). The stations spec saw 135 draw calls / 217k at
  Egmore's platform foot. **Tested:** unit tests (`packages/rail/src/station.test.ts`: arrival
  speed falls every sample and is 0 exactly on the stop mark, steady braking, dwell, accelerating
  away; layout of islands, side platforms, FOB span and office, numbering; departure rows,
  statuses and text; waiting by hour within the cap; boarding/alighting counts, caps and room;
  crowd fill, boarding and alighting to completion, walkers sent back when the train leaves;
  `RailView.test.ts` station triangle budget; `apps/game/src/rail.test.ts` Hindi names and font
  glyphs) and browser tests (`apps/game/tests/stations.spec.ts`, 3 tests: Egmore crowd at rush
  hour on the deck at 0.9 m, the board matches the timetable, under 300 draw calls / 300k; a
  train sampled over game time brakes to 0 at Egmore, people get off and on (platform count
  drops, train load = before + on − off and rises), the board shows ON PLATFORM, wheelsets
  drawn, it pulls away accelerating and the horn counter rises; Kodambakkam crowd on the 4 m
  deck, board format, the chime before a train). Results: typecheck clean, unit 449/449, full browser suite 81/81
  (31.0 min, on 6df2948). Checked by eye (screenshots, not committed):
  Egmore and Kodambakkam platforms with crowds standing on the deck, a train arriving and
  standing, people at the doors, the three-language name board (legible from the platform edge),
  the departure board and clock, the FOB stairs.

- **Animated getting in and out of vehicles and trains (17 Nov, branch `agent/vehicle-entry`;
  unit-tested and browser-tested in headless Chromium, checked by eye in screenshots; not on the
  emulator or a phone):** ENTER no longer switches at once. Getting in: the figure walks to the
  vehicle's entry point beside the door (round the front or back if it stands on the far side;
  walking pace, at most 1.5 s, hurrying when further), the door opens (0.5 s, eased), the figure
  turns to face along the vehicle and sits down (0.7 s; 0.8 s swinging a leg over the motorbike;
  the bus driver first steps up and walks the floor to the seat), the door shuts with the door
  sound (0.4 s). Getting out is the reverse; control comes back while the door is still closing.
  All durations are estimates tuned by eye. India drives on the left: car and ambulance drivers
  get in on the right, the bus driver through the front door on the kerb (left) side; the auto
  (step in from the kerb side, estimated) and the motorbike (mount from the left) have no door.
  Doors: the car's and ambulance's driver's doors are hinged at the front edge and swing out 65°,
  the bus's front door is two glazed leaves folding out 80°; each is one mesh (vertex colours,
  one shared material per paint colour, at most 72 triangles), with a dark doorway panel behind
  it so an open door shows an opening. There is still no modelled cabin: the figure disappears
  into the dark doorway as it sits, and closed vehicles hide the driver once the door shuts, as
  before. During the sequence moving, attacks, jumping and the context button are ignored, the
  controls are hidden, the vehicle holds its brake and the camera follows the figure. EXIT is
  still refused while moving; if the door's side is blocked the player gets out at once on another
  side (the old rule). Teleport, new game and being knocked out stop a sequence at once.
  Trains: the coach nearest the player gets sliding doors (two leaves per doorway, one instanced
  draw call) that open 0.3 s after the train stops and are shut 0.3 s before it leaves (1.2 s
  slides, estimated); BOARD walks the player to the nearest doorway on the platform side and in
  (up the platform steps first from the foot of the platform; hurrying to at most about 4 s from
  far along it, always before the doors close), STEP OFF walks out of the doorway nearest the
  middle of the train onto the platform. Code: `packages/vehicles/src/Boarding.ts` (the sequence
  and the path round the body), `VehicleType.entry` (`specs.ts`), `DoorMesh` in `models.ts`,
  `HumanFigure.sitting` (standing ↔ seated blend), `apps/game/src/Boarder.ts` (placing the figure
  and door), `packages/rail/src/doors.ts` and `TrainDoors` (`TrainView.ts`), `Railway.ts` (doorway
  walks). Tests: see "What was tested" below.
Last updated: 17 Nov 2026 (police and wanted level).

## What exists

- **Police and a wanted level (17 Nov, `agent/police`; unit-tested and browser-tested in headless
  Chromium, not on the emulator or a phone):** 0–5 stars. Rules in `packages/combat/src/Wanted.ts`
  (pure); every number is a game-design estimate. Crimes and heat points: a gun fired in the
  street 1 (one report per 3 s of firing; not counted within 60 m of a story fight's enemies),
  hurting a pedestrian 3 (at least 1 star), killing one 6 (at least 2), taking a vehicle that
  isn't yours 1, driving into a police car 2, shooting one 2, hitting an officer 4 (at least 2),
  knocking one out 10 (at least 3); stars start at 1, 5, 12, 22, 35 points. **Theft:** the start
  hatchback, bike and auto are the player's; any other parked vehicle (free-roam extras, the
  ambulance, the bus, job vehicles) is theft unless the current job or story step asks for that
  kind; each vehicle is reported once. **Losing them:** one star drops after 30/40/55/70/85 s
  (by level) with no police unit seeing the player (cars see 70 m, officers 45 m, with a clear
  line); a sighting or a new crime restarts the wait. **Busted** (1–2 stars): kept still on foot
  within 3.2 m of an officer for 2 s: fine ₹500/1,000 (₹2,000–5,000 at higher levels, unused
  since arrests stop at 2), pistol rounds taken, released on the pavement outside the nearest
  police station (the 37 OSM `amenity=police` points; names not shown), the stage objective
  starts again. **Wasted** (knocked out) clears the level too. **Units** (`apps/game/src/Police.ts`):
  at most 1/2/2/3/3 cars and 2/2/3/4/4 officers by level. Cars appear 80–140 m from where the
  player was last seen, out of the player's sight, and chase on the traffic's road graph
  (`Pursuer`, A*, `packages/ai/src/Pursuit.ts`), straight at the player within 35 m; they stop
  9 m short and two officers get out (Combat enemies, khaki tint). Below 3 stars officers walk up
  to arrest; from 3 they come out armed and shoot with the enemy rules, and cars ram a moving
  vehicle (shunts) and box in a stopped one. Unseen for 3 s, cars search the streets within
  120 m of the last sighting. Traffic gives way to police cars and pulls over for the nearest
  one's siren. Livery: white body, khaki band with POLICE on both sides, red/blue light bar
  (invented; no real force's emblem). **HUD:** five stars under the money line, flashing red/blue
  while seen; police cars flash red/blue and officers are blue dots on the minimap; a synthesised
  siren (`Sound.setPoliceSiren`) as loud as the nearest chasing car is near (within 250 m).
  **Jobs:** from 2 stars the job board takes no new jobs ("Lose them first"); a job already
  running can still be finished or quit; an arrest doesn't quit it (its clock usually runs out).
  The wanted level is not saved. Test hooks: `__cow.setWanted`, `__cow.giveAmmo`.
Last updated: 17 Nov 2026 (weapons, rival gangs, stages 11–15).

## What exists

- **Weapons, rival gangs and stages 11–15 (17 Nov, branch `agent/gangs`; unit-tested and
  browser-tested in headless Chromium, not on the emulator or a phone):**
  - *Weapons* (`packages/combat/src/Weapons.ts`, TD-22): fists, a cricket bat, the pistol, a pump
    shotgun and a compact SMG, each a row of game-design estimates (damage, range, fire interval,
    pellets, spread, aim assist, fall-off, rounds carried, a price for a future dealer). Fists and
    pistol keep their old numbers, so stages 7–10 play as before. Bat: 50 a swing, 2.3 m, 0.7 s.
    Shotgun: six pellets of 20, full to 5 m, 40% at 14 m, nothing beyond, 0.95 s, ±0.13 rad spread,
    40 rounds carried. SMG: 14 a round, about 11 a second, ±0.07 rad, 30 m, 360 carried. HIT swings
    the bat once it is owned; FIRE fires the gun in hand; a new **weapon button** (left of FIRE and
    HIT, e.g. "PISTOL / 24") cycles the guns owned. Pellets and stray bullets hit whoever they pass
    within a body's width, before any wall. Every shot emits `playerShot {x, z, weapon}` for the
    wanted level. Held weapons are a few boxes merged into one vertex-coloured mesh each, sharing one
    material (`packages/player/src/weaponModels.ts`), placed relative to the right-hand bone so they
    follow the hand in every pose; the player carries a loaded gun (or the bat), enemies show guns
    while aiming and carry bats. The arsenal is saved in `localStorage["cow-weapons-v1"]`.
  - *Weapons in the world*: glowing rings with the weapon turning above them; walking over one on
    foot takes it (1.6 m, back after 240 game s; estimates): a bat and pistol rounds in Anna Nagar,
    pistol rounds in Triplicane, shotguns in Royapettah and Egmore, an SMG in Egmore. Stages 12–15
    also hand over guns and rounds (added to the arsenal, not put in the hand). **No back-street dealer**: the place screens need a new place
    kind in shared files (`life.ts`, `places.ts`, `PlaceDesk.ts`, place icons); left for later.
  - *Rival gangs* (invented, `apps/game/src/streetWar.ts`): Manjal Puli (yellow, Royapettah),
    Neela Nandu (blue, Triplicane), Pachai Paambu (green, Egmore), wearing their colours as clothing
    tints. Two crews of three (pistol, bat, fists) on street corners in each district. Crews are
    calm until provoked (`packages/combat/src/Gangs.ts`): hitting one of them, a gunshot within
    22 m, or standing armed within 7 m for 4 s (a warning at 1.5 s) turns the whole crew. At most
    two crews are out at once (within 110 m of the player, removed past 160 m); a beaten crew's
    corner is empty for 180 s; crews within 150 m of the current stage objective stay off.
  - *Stages 11–15* after the Roundtana showdown (stages 1–10 unchanged): 11 *Courier chase*
    (Peters Road, Royapettah: a new `chase` objective; the courier rides a real road, eases off when
    far ahead, and reaching its end fails the stage), 12 *Protection money* (defend a mapped tea
    shop on Triplicane High Road; reward a shotgun), 13 *Hot wheels* (an ambush appears as you ride
    off on a bike from KMS Street; reach the Marina beach road in time; a reach objective can now
    bring `hostiles`; reward an SMG), 14 *Snake pit* (six Pachai Paambu with shotguns and an SMG in
    an Egmore back street), 15 *Turf war* (a 320-health boss and seven more at the Royapettah clock
    tower). Rewards ₹2,200 / 2,500 / 2,000 / 3,500 / 6,000.
  - *Tested:* unit tests `combat/Weapons.test.ts`, `combat/Gangs.test.ts`, `missions/chase.test.ts`,
    `apps/game/src/streetWar.test.ts` (on the real world files); browser specs `weapons.spec.ts`
    (weapon button clear of every on-foot control and the minimap, shotgun pickup, switching,
    rounds used, SMG against pistol fire rate, bat pickup, saving), `gangs.spec.ts` (calm crew,
    hostile when punched, armed lingering, draw cost) and `missions2.spec.ts` (each of stages
    11–15 played to the end with teleports and the `giveWeapon` / `setHealth` hooks). Counts and
    measurements: the handoff entry of the same day.

- **Suburban railway with trains you can ride (17 Nov; unit-tested and browser-tested in headless
  Chromium, not on the emulator or a phone):** the Beach–Tambaram line from OpenStreetMap (the
  openstreetmap.fr Tamil Nadu extract of 15 Nov, the same as the city; route relations 1289050 and
  20986091, one per direction) with its nine stations on the map: Park, Chennai Egmore, Chetpet,
  Nungambakkam, Kodambakkam, Mambalam, Saidapet, Guindy, St. Thomas Mount. Both ends run off the
  map (Chennai Beach to the north-east, Tambaram to the south). All 223 rail tracks on the map
  (running lines, sidings, yards; not the MRTS viaduct or the Metro) are drawn: ballast, concrete
  sleepers (within about 260 m), two rails, in 250 m cells built only near the player (one merged
  mesh per cell, plus one for name boards). Platforms (estimated: 110 m, 0.9 m high, side or
  island, yellow edge line, steps at both ends, a short shelter) are solid, with name boards in
  English and Tamil (OSM `name:ta`, drawn with a 6 KB subset of Noto Sans Tamil Bold; invented
  blue-and-yellow board design). Trains: an original four-coach EMU-style model built in code
  (`TrainView.ts`, under 1,000 triangles a coach, invented cream, teal and saffron livery), all
  coaches as instances of two meshes; timetabled every 8 min each way (estimated), entering at
  line speed from beyond the map, braking at 0.9 m/s², 30 s at each station, accelerating at
  0.8 m/s² to 80 km/h; solid (kinematic boxes per coach) within 400 m, drawn within 900 m (TD-19).
  Riding: on a platform the panel shows the station and when the next trains come; when a train
  stands there, BOARD (the context button, or E) takes a ₹5 ticket (estimated; refused without
  the money), the camera follows the train and the panel shows the destination, the next station,
  the distance and the speed; STEP OFF at any station puts the player on that platform. A ride
  towards Tambaram (or Chennai Beach) ends at the last station on the map with "The line
  continues to Tambaram beyond the map." The minimap draws the running lines and marks the
  stations. **No level crossings:** the only ones in the box are inside the Metro depot; the
  line crosses roads on bridges or in subways, which are not modelled (trains run at ground level
  over the roads there, and AI traffic does not stop for them). **Measured** (production build,
  headless Chromium, `?quality=lite`, 915×412, 2.5 s of game time after teleport; "before" is the
  same build without `rail.json`, so the game runs without the railway): Anna Nagar spawn
  175 → 175 draw calls, 253,610 → 253,610 triangles (no railway within range); beside Chennai Egmore's
  platforms (5622, 703) 133 → 138 draw calls, 176,686 → 199,958 triangles (+23k) with no train in
  sight, and 140 draw calls, 201,142 triangles with two trains (8 coaches) standing there. Both
  runs repeated with identical numbers. **Tested:** unit tests (`packages/rail/src/rail.test.ts`:
  path geometry, chaining and clipping ways, projection, stations snapped to stop positions,
  Metro and MRTS stations left out, platform sides and islands, beyond-map ends, the run profile's
  stops and limits, timetable spacing over three hours, next arrival, boarding and step-off rules;
  `apps/game/src/rail.test.ts` on the real file; `packages/game-engine/src/RailView.test.ts`:
  cells streamed and freed, triangle budget, instancing); browser tests
  (`apps/game/tests/railway.spec.ts`, 3/3): teleport to Egmore, wait for a train (the clock moved on
  with the test hook, then waiting on game time), board (₹100 → ₹95), the train pulls away, ride to
  Chetpet, step off onto the platform (within its length, at 0.9 m, standing); a ride from Guindy
  ending at St. Thomas Mount with the beyond-the-map message; no money, no ticket.
  `npm run typecheck`, `npm test` 218/218. The full browser suite was **not** run on this branch
  (the coordinator runs it on the merged code to save CPU).

- **Places, everyday activities and short stories (17 Nov; unit tests and 6 browser tests,
  headless Chromium only, not on the emulator or a phone):** five places with an entrance on
  the pavement beside the nearest road, a ring and a floating badge at the entrance
  (`game-engine/PlaceMarkers.ts`) and a badge on the minimap (`ui/placeIcons.ts`). Standing at
  an entrance on foot shows ENTER (spoken name "Go inside"; E on a keyboard); a vehicle within
  reach still comes first. Inside, a DOM screen (`ui/PlaceScreen.ts`) holds the game. Rules in
  `packages/missions/src/life.ts` (`Life`) and `stories.ts` (`StoryRunner`); placement and
  stories in `apps/game/src/places.ts`; wiring in `apps/game/src/PlaceDesk.ts` and `Game.ts`.
  - **Home** (across the street from the start, Anna Nagar): sleep until 07:00 (full health,
    saves the game; crossing midnight counts a day), change clothes (cycles owned outfits; tints
    the player's clothes through `HumanFigure.setClothes`).
  - **Hospital** (at the mapped hospital where the ambulance is parked): treatment ₹3 per
    missing health point, at least ₹50, 30 min; free if the last vehicle driven was the
    ambulance; a free counter with a 3-hour queue.
  - **Gym** (invented position): a tap-timing workout (needle sweeps a bar, 5 reps, tap in the
    green); ₹50 day pass, 1 game hour; the first workout of a game day with 3+ good reps raises
    fitness by 1 (max 5); each point is +2% sprint speed (`PlayerController.runScale`, at most +10%).
  - **Mall** (invented position): a 10-minute escalator queue on entering; three snacks (+5 to
    +20 health); three outfits (₹600–900, worn at once) with a "BUY 1 GET 1*" sign whose free
    item is socks.
  - **Cinema** (at the mapped `amenity=theatre` near the hospital): three invented films
    (family comedy *Sambar Sunday*, action drama *Roundtana Thunder*, romance *Filter Coffee
    Kadhal*), shows at 11:00, 14:30, 18:30 and 21:30, ticket ₹150; the clock moves on by the
    wait for the next show plus the running time; a tap-through scene with audience moments
    (whistles at the hero's entry, a phone ringing, the interval rush with optional ₹60 popcorn).
  - **Stories** (offered at a place, one at a time, no enemies or stage progress while one runs,
    paid once): *Paati's check-up* (car to the hospital, check-up inside, home on a timer,
    ₹400), *Selva's gym bet* (4 good reps, then race on foot to the juice shop on a timer, ₹300),
    *First day, first show* (bike, pick up Ravi, reach the cinema on a timer, watch the show,
    ₹250). Failing (out of time) or quitting just ends it.
  - **Save:** fitness, day, clothes, owned items, films seen and finished stories are kept under
    `life` in `cow-progress-v1`; saving stage progress now keeps the save's other fields. Saves
    without `life` load as a fresh life.
  - Real: the hospital and theatre positions (OSM amenities) and the roads. Invented: every name
    shown (Sugam Hospital, Thol Power Gym, Vaanavil Mall, Minnal Cinemas), the home, gym and mall
    positions, films, plots, prices and stories.
  - **Tested:** `npm test` 219/219 (adds `life.test.ts`: fees, sleep, outfits, needle and
    fitness by day, sprint factor, snacks, clothes, show times and time passing, midnight
    counting, old and damaged saves; `stories.test.ts`: steps, activity steps, time limits,
    quitting; `apps/game/src/places.test.ts` on the real world files: entrances beside roads,
    clear of parked vehicles, at the mapped amenities, stories pointing at places).
    `apps/game/tests/places.spec.ts` (6, pass): old save + home sleep and clothes + reload;
    hospital fee and free after the ambulance; gym fitness once a day and run speed; mall
    escalator time, snack, shirt and socks; cinema ticket, scenes, popcorn and hours passed;
    the Paati story end to end by teleport (6/6 again on 18 Nov with `PW_PORT=4293`, 3.6 min).
    One full run on this branch (17 Nov, 44 tests, 18.3 min at load average about 19 with
    other agents' suites running): 42 passed; the ambulance run and the T. Nagar street-name
    check failed on wall-clock limits, and the job tests failed again on reruns. Those runs used
    the shared port 4173 with `reuseExistingServer`, so they may have tested another checkout's
    build (base and branch measured identical draw calls, which the entrance markers by the spawn
    should change). `playwright.config.ts` now takes `PW_PORT`. **The full suite on this branch
    still needs a clean run on its own port** (the coordinator runs it on the merged code).
    Not covered in the browser: the gym bet and first-show
    stories (unit-tested), the 3D markers' look, and whether the sprint boost is felt.

Last updated: 17 Nov 2026 (share auto).

## What exists

- **Share auto (17 Nov; unit tests and one browser test, looked at in headless Chromium, not on a
  phone):** the job board's *Share auto* (`share-auto`, the id kept so saved best fares carry on)
  is now a route job. It replaced the earlier version (two fixed pick-ups, one drop at the market).
  Route: the eastbound carriageway of 2nd Avenue, Anna Nagar West, Thirumangalam to Anna Nagar
  East (2,078 m, past the Roundtana), chained from its OSM pieces in `apps/game/src/shareAutoRoute.ts`;
  the area names are the nearest OSM place points. An auto (`auto-share`) is parked at its start
  and the clock starts in any auto within 150 m of it. While the shift runs, up to 3 people wait
  at the kerb 60–320 m ahead (placed along the route from a seeded random generator, not fixed
  stops); stopping (under 1.2 m/s) within 6 m of one for 1.5 s lets them in, 4 seats (three in the
  back, one beside the driver). Each has a drop point 250–1,200 m further on (pink dot on the
  minimap, the beacon and the HUD point at whichever comes first, a pick-up or a drop); stopping
  within 8 m of it for 1 s drops them and they pay then: ₹10 plus ₹5 a km ridden. **The fares
  are estimates**, not a published tariff; all numbers are in `SHARE_AUTO`
  (`packages/missions/src/shareAuto.ts`). The shift ends at the end of the route or when the
  566 s run out (then it is paid, not failed); the result screen shows people carried, fares,
  people carried past their stop or left waiting with a seat free, and the reputation change:
  +1 for 1–2 carried, +2 for 3–5, +3 for 6 or more, minus 1 per missed drop and per person left
  waiting, kept between -5 and +3. Passing people while full costs nothing. Quitting costs the
  usual 5 reputation and a ₹30 fine; fares already paid are kept. Shown: the route as a yellow
  line on the minimap (`Minimap.setRoute`), waiting people as green dots, the kerb figures
  (`HumanAssets` pedestrian figures, at most 3, within 160 m) and baked seated riders in the auto
  (`apps/game/src/ShareRiders.ts`; seat positions estimated by eye). Measured at lite quality on
  2nd Avenue: 137 draw calls with one figure at the kerb, 185 with three aboard and one waiting.
  **Tested:** `packages/missions/src/shareAuto.test.ts` (13: fares, route measure and windowed
  projection, people appear ahead within the limits and the same for a seed, boarding only when
  stopped beside them in the auto and after the wait, capacity 4 and no fault for passing while
  full, drop and fare by distance, missed drops and people left waiting, end of route, rating and
  reputation, and in `JobRunner`: clock start near the route start, paid at the end, time up ends
  the shift without failing, quitting); `apps/game/src/content.test.ts` (route on 2nd Avenue
  with no gaps, its ends, kerb and lane, parking within the start radius, fare level);
  `apps/game/tests/shareAuto.spec.ts` (board → get in the auto at the start → stopped 20 m short:
  nobody boards, a kerb figure is drawn → teleport beside them: one aboard and seated → teleport to
  their drop: carried 1, money up by exactly the fare → teleport to the end: "Share auto shift
  over", "1 passenger carried", reputation within 45–53 → figures gone). Seen in screenshots: the
  waiting figure at the kerb beside the beacon, riders inside the cabin from the side. Not tested:
  a whole shift driven with the controls, on the emulator or a phone.

- **Pedestrians hurt when the player's vehicle hits them (17 Nov; unit tests and browser tests in
  headless Chromium, not on a phone):** any vehicle the player drives (car, auto, bike, ambulance, bus)
  that touches a pedestrian above 2 m/s knocks them aside or down. A hit is found from the vehicle's
  box, position and velocity against each person's position, a step ahead of contact, not from physics
  contacts; if the person's collision box stopped the vehicle first, the speed it came in at is used
  (`Vehicle.approachVelocity`). Rules in `packages/combat/src/PedestrianHits.ts`, every number in
  `PEDESTRIAN_HIT` and all **game-design estimates**, not a crash or medical model: 2–4.5 m/s (7–16 km/h)
  the person stumbles and steps aside, no penalty ("You bumped a pedestrian"); 4.5–12.5 m/s (16–45 km/h)
  knocked down and injured: lies 5 s, then gets up and limps off at 0.6 m/s for 30 s, ₹1,500 fine and
  8 reputation; from 12.5 m/s (45 km/h) killed: lies on the road and does not get up, ₹5,000 and 20
  reputation, removed after 25 s once the player is 35 m away (or after 90 s) and their agent respawns
  out of sight as recycled pedestrians do. The person is thrown along the direction of travel (1 m plus
  0.035 × speed², at most 8 m) and pushed clear of the vehicle's path, stopping short of walls (ray cast);
  the vehicle keeps vehicle mass / (mass + 70 kg) of its speed, which is not counted as a crash or a job
  bump. Message "You hit a pedestrian: injured/killed" with the fine and reputation lost, the existing
  crash thud; fines never take more than the player has; both are saved. Non-graphic: a person is only
  knocked down (the combat "down" pose) and lies still; no blood. Pedestrians within 16 m react for 6 s
  (`AgentSystem.scare`): those walking towards the spot stop and step back 1.2 m, the others run off at
  3.8 m/s. People lying on the road have no collision box (vehicles can't climb, TD-8) and are a 1 m
  obstacle for AI traffic, which stops short of them; nothing else about how traffic treats pedestrians
  changed. "Limping" is the walk clip played slowly, not a limp animation. Tested by unit tests
  (`combat/PedestrianHits.test.ts`: thresholds, outcomes, fines and reputation, throw, speed kept, box
  contact at angles, casualty and respawn timers; `ai/Reactions.test.ts`: holding, letting go and
  respawning, limping, stepping back and running off, traffic stopping for someone lying down;
  `missions/reputation.test.ts`) and `apps/game/tests/pedestrians.spec.ts`, which stands a pedestrian
  in the vehicle's way with the test-only `__cow.stagePedestrian` and checks: killed at over 15 m/s in the
  car (message, ₹5,000, reputation 50 → 30, saved, still lying 8 s later, removed after the player drives
  off), injured at about 7 m/s (lies down, gets up after 5 s, limps at no more than 0.6 m/s), the auto and
  the bike hitting people off-centre and turned at an angle, and an injured hit with Chromium's CPU slowed
  six times (about 17 fps). Not checked on a phone or the emulator.

- **Riding poses and the P / R / D gear selector (17 Nov; unit tests, browser tests and
  screenshots in headless Chromium, not on a phone):**
  - *Poses:* every vehicle kind has a riding pose (`VehicleType.pose` in
    `packages/vehicles/src/specs.ts`): the driver's hip point on the seat, hands on the grips or a
    steering wheel, feet on the footboard, pegs or pedals, and a torso lean. `@cow/player`
    (`ridingPose.ts`) solves it on the skeleton's rest pose with two-bone IK for the arms and
    legs, hands turned to close round the grip; a seated figure's root is its hip joints. The
    player and every AI driver use the same pose (`HumanAssets.seatedStatic(tint, pose)`). Auto:
    hands on the Blender model's grips (0.47 m above the chassis centre, 0.78 m ahead), feet on
    the floor; the driver hunches and sits deep in the cushion so a 1.75 m figure clears the
    1.71 m canopy. Motorbike: the forks were raked the wrong way; now raked back to a steering
    head with the bar on top, the tank is narrower and the knees splay round it. Car, ambulance
    and bus: hands at ten to two, legs to the pedals, all joints inside the body (closed
    vehicles still hide the player's driver). Closed cabins' seat positions are estimated.
  - *Gears:* driving works like an automatic (`packages/vehicles/src/Gearbox.ts`). D: GAS drives
    forwards; R: GAS drives backwards; P: the vehicle is held still. BRAKE only brakes (it no
    longer reverses once stopped). A gear change needs the vehicle under 1 m/s; asked for while
    moving, it brakes first (HUD shows N, the gear blinks, a short hint) and engages once stopped.
    Getting in selects D. HUD gear: P, R, N, D, or D1–D5 by speed. Touch: a small vertical
    P / R / D selector left of BRAKE, only while driving, clear of the minimap, speedometer and
    EXIT. Keyboard: W/S drive and reverse as before (S brakes, then shifts to R once stopped; W
    in R brakes, then shifts to D); P, R and G select park, reverse and drive.
  - *Tested:* unit tests `apps/game/src/ridingPose.test.ts` (the real character model: both
    palms and ankles within 3 cm of their targets for all five kinds; the auto's palms on the
    Blender grips and the head under the canopy; the bike's hands on the bar and ankles over the
    pegs; car, ambulance and bus drivers' joints inside the body) and
    `packages/vehicles/src/Gearbox.test.ts` (14 tests: pedals per gear, P holds, shifting when
    stopped, braking first when moving, cancelling, keyboard two-key driving, HUD labels).
    Browser tests in `apps/game/tests/driving.spec.ts` with touch events on the new buttons: R
    reverses on GAS, P holds the car, D drives forwards; R while moving shows N and brakes, then
    reverses; getting out in P leaves the car where it stood. Screenshots (side and front, plus
    see-through views of the closed vehicles) of every kind, and the HUD at 915 × 412.

- **Facade kit: sunshades, balconies, shop fronts and Tamil signboards (Phase 3, 16 Nov;
  unit-tested, and looked at in headless Chromium by day and at 21:00, not on a phone):**
  `packages/game-engine/src/FacadeKit.ts` decides at render time, from the `Building` record,
  the roads of its chunk and the building id (deterministic; world files and builder unchanged),
  which details a building gets. All of it is invented (estimated), not mapped:
  concrete sunshades over windows (85 % of apartment blocks, 50 % of houses, 35 % of commercial
  buildings), balconies with a slab and an open railing on the balcony bays (70 % of apartment
  blocks and 30 % of houses of two floors or more), and ground-floor shop fronts on the walls that
  face a road within 12 m of its edge: every commercial building, and on main roads half the
  apartment blocks and 40 % of two-storey-or-more houses (OSM tags only 9 of 1,233 buildings
  round Sir Thyagaraya Road as commercial, so tagged commercial alone left T. Nagar bare). Shops are
  one or two bays under one painted board; shutters are down (40 %, five paint colours), up with
  the lights on (38 %) or up and dim. Ten **invented** boards (`shopSigns.ts`): generic words for
  kinds of shop in Tamil with a small English line (மளிகைக் கடை grocery, சைவ உணவகம் veg eatery,
  துணிக்கடை, மருந்தகம், தேநீர் கடை, பூக்கடை, காலணிகள், கைபேசி சேவை) and two made-up generic
  names (புது ஸ்டோர்ஸ் "New Stores", நிலா டிபன் சென்டர் "Nila Tiffin Centre"); no real business
  or brand. Drawn at start-up into a 1024 px kit atlas with a 7 KB subset of Noto Sans Tamil Bold
  (SIL OFL 1.1, `assets/fonts`, embedded, loaded with `FontFace`); if the font fails the game
  still starts and the boards are English only (checked by blocking `FontFace.load`). At night
  the open, lit shops glow and the boards glow faintly, through a glow atlas like the windows'.
  Slabs merge into the walls mesh; shutters, boards and railings are one extra mesh per chunk
  (one material, alpha-tested, not casting shadows). **Measured** (production build, lite
  quality, 915×412, 2.5 s after teleport; before → after): spawn 149 → 154 draw calls,
  164,652 → 203,558 triangles; T. Nagar Sir Thyagaraya Road 128 → 133, 180,108 → 213,288
  (+33k); Pondy Bazaar 87 → 91, 139,198 → 167,816; Anna Salai 94 → 98, 122,527 → 158,767.
  Headless Chromium here has no Tamil system font; with the embedded subset the Tamil renders
  with correct vowel signs and conjuncts in screenshots. Unit tests (`FacadeKit.test.ts`): road
  facing, shares, determinism, shop bays and sign widths, per-piece triangle counts, sunshade
  winding, the curated sign list (English words from an allowlist of generic shop words, Tamil
  lines Tamil-only), atlas layout, and the glyph list the font was cut to.
- **The city (J2, 16 Nov, evening; tested in the browser only):** the map is now Anna Nagar to
  T. Nagar, Anna Salai, Marina Beach and the start of ECR (about 10 km × 13 km), from an OSM
  extract of 15 Nov: 20,625 road pieces, 106,619 buildings (3,593 with an OSM height or floor
  count; the rest are 2 floors, estimated, or a little more for tagged apartments and
  commercial blocks), 44,541 trees, 553 parks, water and beach areas, 533 bus stops, 266 mapped
  signals, 238 districts, and the sea from the OSM coastline. Streamed from 1,877 chunk files
  (4.6 MB in all, TD-16), nearest first; chunks out of range are freed. Roads are drawn per
  chunk with lane lines by lane count and solid edge lines on primary roads. Sea haze thickens
  within 600 m of the coast. Traffic spawns near the player anywhere in the city; signals stand
  at main-road junctions and at mapped OSM signals (4,775 junctions; only those within 420 m are
  drawn). The AI works on the 2.4 km of roads round the player (TD-17). The minimap is
  painted in tiles. The sea is a flat blue-green surface (no waves yet). The player still starts in Anna Nagar and the ten
  stages and ten jobs are where they were. **Not done yet:** loading from the APK (not run).
- **Street furniture (Phase 3 part 1, 16 Nov; unit tests, measured and looked at in the browser):**
  bus shelters, street-light poles and kerbs, worked out per chunk at run time from data already
  in memory (`packages/game-world/src/furniture.ts`; no change to the world files) and drawn by
  `packages/game-engine/src/StreetFurniture.ts`. *Real:* the shelter positions are the mapped OSM
  bus stops (478 of the 533 get one; stops mapped twice, more than 30 m from a drivable road, on
  another road's carriageway or inside a building are skipped). *Invented:* the shelter design
  (posts, roof, back panel, bench, a blank route board; no names shown) and its spot at the kerb
  (nearest drivable road, on the side the stop is mapped, else the left of the road's direction,
  facing the road); every pole (OSM does not map Chennai's street lights): concrete poles with a
  cross-arm and a lamp every 38 m along primary, secondary and tertiary roads, from the road's id
  and the distance along it (one-way roads on their left edge, two-way primary roads alternating,
  others one side), never within 10 m of a road's end or of a junction, inside a building, on
  another road or within 4.5 m of a shelter; kerbs 0.15 m high, painted black and yellow, along
  both edges of the main roads' carriageway, broken round junctions (where 3 or more road arms
  meet) and continuous where one way of a road runs into the next. Lamps glow after dark and
  throw a soft pool of light on the road (additive, hidden by day). Poles and shelter posts and
  back panels are solid boxes in the chunk's solids; **kerbs are not solid** on purpose: the
  arcade vehicles (TD-8) cannot climb a step and would get stuck. Per chunk at most 3 extra
  draw calls by day (shelters, poles, kerbs) and 4 at night (light pools). Measured with a
  production build in headless Chromium (`?quality=lite`, 915×412), `snapshot()` before → after:
  Anna Nagar spawn 149 → 160 draw calls, 164,652 → 172,300 triangles; T. Nagar (3269, 4960)
  115 → 121, 165,943 → 168,231; Anna Salai (5033, 3180) 92 → 102, 122,343 → 128,375. At 21:00:
  spawn 149 → 165, 164,652 → 173,238; T. Nagar 97 → 106, 149,766 → 152,334; Anna Salai 92 → 106,
  122,343 → 129,033. Working out the city-wide part (junctions, shelters) takes about 0.1 s once,
  when the first chunk loads (Node on a desktop; a phone will be slower). Tested by unit tests
  (`furniture.test.ts` in game-world: sides, spacing, junction and end clearance, buildings and
  shelters, kerbs breaking and continuing, solids; `apps/game/src/furniture.test.ts` on the real
  city files) and screenshots (shelters at Anna Nagar Tower and Thousand Lights stops, poles and
  kerbs on Anna Salai by day and at 21:00). Not run on a phone or in `npm run test:e2e` yet.
- **Visited areas (16 Nov, evening; tested in the browser):** the game notes which named area of
  the city the player is in (the nearest of 238 OSM place points within 1.5 km: an estimate of
  the boundaries, which OSM maps as points), saves each new one (`cow-districts-v1`), shows
  "New area: …" once no other message is on screen, and adds "Explored N areas of Chennai: …"
  to Share progress. New game clears it. `city.spec.ts` checks it survives a reload, and that
  the Marina Beach, Kapaleeshwarar Temple and T. Nagar labels show from 150 m.
- **Kapaleeshwarar Temple gopuram (16 Nov; unit-tested, and looked at in the browser):** an
  original procedural gateway tower built from `gopuramProfile`, the same estimated proportions
  as its collision (37 m, seven tiers; position, size and colours are estimated, not surveyed).
  A grey stone base with the passage open east-west, tapering stucco tiers in a different
  invented colour each with a ledge and a row of pilasters and dark niches, a barrel-vault crown
  and seven gold finials; broad faces look east and west. One merged vertex-coloured mesh with
  the tower's shared material (one draw call, 3,544 triangles), casting and receiving shadows.
  Unit tests check its bounds equal the profile's footprint and height, the triangle budget and
  that rays pass through the passage; seen in headless Chromium (lite quality, golden hour)
  from 16 m, 60 m, 80 m and 100 m. Not checked at night or on a phone.
- **City jobs across the city (J2, 16 Nov, evening; unit tests and one browser test):** three jobs far from Anna Nagar, built from the city map in
  `apps/game/src/cityJobs.ts` (deterministic for a given map), 13 jobs in all.
  *Marina evening drive* (`marina-evening`, car): pick a friend up on Sir Thyagaraya Road where
  it is nearest T. Nagar's centre (about 300 m from it, 3 s wait), drop on Kamarajar Salai
  opposite the Marina Beach landmark (about 250 m from it, 2 s wait); offered only 16:00–20:30
  game time (the board says so otherwise; the desk reads the game clock); 888 s for about 5.4 km
  straight, 7 km by road; up to ₹1,649. Anna Salai between T. Nagar and the Marina is an avoid
  corridor: 394 points every 25 m along both carriageways (radius half the width + 3 m, widened
  so the circles join). Time on it beyond 25 s free (for crossing it) cuts the pay 0.8% a second
  (at most 50%) and one star, two after a minute; the result says "Stuck on Anna Salai for 40 s:
  -12%"; keeping off it pays +10%; a toast warns on entering it and the HUD title counts the
  seconds. *Egmore hospital transfer* (`egmore-transfer`, ambulance, three bumps fail it): from the
  mapped hospital nearest Egmore's place node to the one nearest Royapettah's (2 km apart; on
  Pantheon Road and Conron Smith Road; names not shown, clinics and eye/dental/diabetes centres
  skipped), 425 s, ₹1,000. *Mount Road bus* (`mount-road-bus`, reputation 55): four mapped OSM bus
  stops in order on Anna Salai's north-east-bound carriageway, SIET, DMS, US Embassy, Thousand
  Lights (their OSM names are shown), with a timetable, 668 s, ₹1,300. New parked vehicles:
  `car-tnagar`, `ambulance-egmore`, `bus-mount-road`. These jobs start their clock only once the
  player is in the vehicle within 300–400 m of the first stop (new `startRadius` rule), so getting
  across town is free. Real: landmarks, roads, hospital and bus stop positions, stop names. Invented:
  the stories, times, pay, and the approximate points the searches start from. Tested by unit tests
  in `packages/missions` (evening window, start radius, avoid timing and its effect on pay and
  stars) and `apps/game/src/content.test.ts`, which builds the content from the real world files
  and checks the old job ids and count, the new jobs, parking for every vehicle, stops on drivable
  roads inside the city, and the Marina drive's ends. One browser test was added
  (`jobs.spec.ts`, Marina drive by teleport); it passes (38/38 run, 16 Nov, night).
- **World:** about 1 km² of real Anna Nagar from OpenStreetMap: 136 road pieces, 1,292 building
  footprints, Tower Park and other green areas, 512 trees. Split into 16 chunks of 250 m that
  load and unload (meshes and collision) as the player moves.
- **Player:** a rigged human with idle, walk and run animations, walking, running, jumping,
  collision with buildings and trees, and a third-person camera that avoids walls.
- **Vehicles:** hatchback, auto-rickshaw and motorbike with suspension, steering, braking and
  reverse (P / R / D selector). Get in and out; the rider is visible, holding the grips, on the bike and in the auto; the bike
  leans into corners. Eleven are parked around the map.
- **AI:** traffic that follows the real road network in the left-hand lane, slows for corners
  and stops for the player, parked vehicles and pedestrians; pedestrians walking beside the
  roads, passing each other. Both turn round at dead ends and are recycled around the player.
- **Combat:** player health (shown as a bar, heals after six seconds unhurt), punching (HIT),
  a pistol with ammunition and aim assistance (FIRE shoots where the camera looks), bullet
  tracers. Enemies notice the player, run in and punch, or stand off and shoot when armed; they
  step round walls, can be run over, and fall when beaten. Being knocked out costs a ₹100
  hospital bill and restarts the stage.
- **Missions:** ten stages. 1 walk, 2 drive to the park, 3 timed auto fare, 4 timed parcel run,
  5 cross-town dash, 6 timed bike courier, 7 fist fight in Tower Park, 8 armed bike thieves then
  ride the bike back, 9 four armed guards, 10 the boss and his men at the Roundtana. Money
  rewards; progress is saved on the device.
- **City jobs (16 Nov):** a job board (JOBS button, or J) with four repeatable jobs: ambulance
  run (pick up a patient, drive to a real mapped hospital; SIREN makes traffic pull over to the
  kerb and slow down; five bumps end the run), courier delivery on the motorbike from the real
  post office (bonus for no damage), cab ride (fare = ₹80 + ₹0.35 a metre of estimated road
  distance, tip by star rating), and a bus route with four stops in order and a timetable
  (needs reputation 55). Each job has a start vehicle, stops (some need the vehicle stopped for
  a few seconds), one time limit from the moment the player gets in, and a payout scaled by time
  left, bumps and late stops. Failing or quitting costs a fine and 5 reputation, never the
  game. A result screen shows pay, stars and why. While a job runs, the current stage waits and
  no enemies appear. Reputation (0–100, starts at 50) and job records are saved
  (`cow-jobs-v1`). Hospital and post office positions are real; their names are not shown.
  Bus stop positions are invented points on the main avenues.
- **More jobs (16 Nov):** ten in all. Added: hospital transfer (ambulance, three bumps fail
  it), lunch rush (motorbike, one kitchen, three homes), medicine run (motorbike, the chemist
  and hospital farthest apart), share auto (two pick-ups, one drop at the market; replaced on 17 Nov by the route job above), Tower Park
  visitor (car, fare by distance), and the evening bus round the loop backwards (reputation
  62). Bus stops are spaced about 260 m apart along the main avenues.
- **Traffic (J3, 16 Nov):** signals at 35 real junctions (3+ drivable arms, one of them
  secondary or tertiary; nodes within 16 m merged), two phase groups with 12 s green, 3 s amber
  and 1 s all-red, offset per junction; zebra crossings and stop lines on each signalled arm.
  Traffic stops at red, decides at amber, waits for anyone on a crossing, and takes turns at
  junctions (right turns wait for a gap). Traffic mix: cars, two-wheelers, autos and buses
  with their own speeds and gaps. Density follows the hour (rush 8–10 and 17–20, about a
  quarter late at night), road class and nearby shops; extra agents are hidden out of sight,
  not destroyed. Pedestrians have no walk signal; nothing overtakes; running a red isn't
  penalised.
- **The look (J4, 16 Nov):** light, sky, fog and exposure follow the clock: golden hour by
  default, sunrise and sunset glow, moonlit night with stars; lit windows at night (the same
  ones every night); brighter vehicle lamps and a headlight pool on the road. Rain (pause menu,
  saved) with streaks and wet roads. About a third of small houses get clay-tile roofs and
  about 40% of trees are palms. Draw distance, fog, shadows and rain density per quality tier;
  a frame-blend speed blur only on the high tier. No street lights; rain falls through roofs.
- **Driving feel (J5, 16 Nov):** four-wheelers drift at high speed on hard lock (the car
  most, the bus barely, the auto a twitch), countersteer catches it; the motorbike never
  drifts and straightens itself after a hard flick. Tyre squeal and a gear-change blip. The
  chase camera looks ahead of the vehicle, trails the direction of travel (so a slide shows),
  widens a little at speed and ignores suspension bumps.
- **Anna Nagar Tower (16 Nov):** outline and opening year (1968) from OSM (way 651861526);
  height (about 41 m) and 12 levels estimated. Original procedural model (about 5,700
  triangles), solid base with walkable steps, a name label within 450 m, and a minimap marker.
  The landmark list also holds Marina Beach, Kapaleeshwarar Temple and T. Nagar, which appear
  once the map covers them. The extract was refreshed (16 Nov, 03:40 UTC) and now includes bus
  stops (5), place names and landmark outlines.
- **New vehicles:** an ambulance (original red-and-yellow livery, flashing light bar) parked at
  a hospital, and a 10 m city bus (original teal-and-cream livery) on a main avenue.
- **Crashes:** a velocity change above 1.6 m/s in one physics step counts as a crash: the
  vehicle keeps 65% of its speed, a thump plays (louder for harder hits), and a job counts a
  bump. AI traffic sees long vehicles as a row of circles.
- **HUD:** gear indicator (P, R, N, D or D1–D5; the numbers are display only, the engine has no gearbox), reputation,
  JOBS button. Pause menu: Share progress (system share sheet, else clipboard, else shown on
  screen) and Time of day (Morning, Noon, Evening, Night; the clock runs one game hour per real
  minute and is saved).
- **Sound:** synthesised engine note that rises with speed, horn, doors, gunshots, punches,
  hurt, objective chime, stage fanfare and failure. No sound files.
- **Interface:** joystick, camera drag, context ENTER/EXIT button; JUMP, HIT and FIRE (with
  rounds left) on foot; GAS, BRAKE, the P / R / D selector and HORN when driving; money and stage, health bar, the real
  name of the street underfoot, objective with distance and countdown, speedometer, rotating
  minimap with the objective, vehicles and enemies, a light beacon at the target, pause with
  New game.
- **Android app:** React Native shell with a native menu, landscape, full screen, Back and
  background handling, and an error screen.

## What was tested, and how

| Check | Result | How |
|---|---|---|
| City map (18 Nov, `agent/city-map`) | **pass**: typecheck clean, unit 456/456 (21 new in `packages/ui/src/cityMapMath.test.ts`), browser `citymap.spec.ts` 6/6 with `onfoot.spec.ts` 13/13; full suite **84/84** (31.5 min, no retries) | `npm run typecheck && npm test`; `PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e -- tests/citymap.spec.ts …`. Unit: projection both ways, visible box, zoom clamping, fit-the-city scale, zoom about a point, drag, pinch (scale, anchored midpoint, pinch that pans, limits), centre kept over the city, culling cells, zoom bands, Douglas–Peucker, scale bar, edge pins, joining road pieces and finding straight stretches for names. Browser: tap the minimap → map open, centred on the player, marker (and the drawn arrow) at the screen centre, `held`, `simTime` unchanged over 1 s, controls hidden, X closes and game time runs; pinch doubles the zoom keeping the midpoint, drag moves the centre by the finger's travel, double-tap ×2 about the tap, +/−, street-level and whole-city limits, centre on me, no redraws without a change; teleport to T. Nagar (3269, 4960) → map and marker there with the heading; Back closes the map and the shell hears `cityMap` open/closed, Back with it closed pauses, a shell pause closes it; buttons ≥ 44 px, inside the screen, nothing overlapping at 915×412 and 740×360. Also `driving.spec.ts` (controls clear of the minimap) and `weapons.spec.ts` pass. **Changed on purpose:** none of the existing tests; the map's OSM credit is only in the page while it is open because `onfoot.spec.ts` searches the page for the credit text. Checked by eye (screenshots, not committed): whole city, the player at 0.5 px/m, street level with buildings, T. Nagar with "Anna Salai (Mount Road)" and Mambalam station; labels legible, marker clear of other icons except at the crowded spawn |
| Merged: vehicle entry + police + weapons/gangs (17 Nov, `agent/merge-features`) | **pass**: typecheck clean, unit 430/430, browser **78/78** (28.4 min, full suite run alone, no retries) | `npm run typecheck && npm test`; `cd apps/game && PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --trace off`. The three branches were merged into one; conflicts in `Game.ts` were resolved so they work together: being busted confiscates every weapon (`Arms.confiscate`), the police hear every gun, officers, gang crews and stage enemies can be active at once, a new game resets both. Not run on the emulator or a phone |
| Animated get in / get out, train doors (17 Nov, `agent/vehicle-entry`) | **pass**: typecheck clean, unit 348/348, browser 61/61 (21.9 min, full suite, no retries) | `npm run typecheck && npm test`; `PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e -- --trace off` on 8f7b5bd. New unit tests: `Boarding.test.ts` (phase order and timings, walk cap, door easing and smoothness, events, getting out, the walk path never crosses any vehicle's body from 16 directions, entry data), `doors.test.ts` (vehicles: car and ambulance doors swing out on the front hinge, bus leaves fold outwards and clear the opening, one mesh each with at most 72 triangles, one material per colour, no door on auto and bike), `packages/rail/src/doors.test.ts` (train doors: shut while moving, open mid-stop, shut before leaving, still open when the last ticket is sold), and `ridingPose.test.ts` with the real character (the hips move in a straight line as it sits, hands on the grips or wheel at the end for every kind, a part-way pose does not creep, it stands fully up again). New browser tests: `boarding.spec.ts` (car: door > 0.8 while still on foot, phases open → sit → close, seated with the door shut and driving controls shown, the car does not move; getting out: control back while the door is still closing, standing 1 to 2 m off the car's right side on the ground; bus: climb phase through the folding door; auto and bike: no door; a teleport mid-sequence leaves the player on foot with the door shut) and a railway test (doors open at the stop, the player walks through, doors shut when the train leaves, stepping off walks out onto the platform). **Changed on purpose:** `board()` and a new `getOut()` helper in `support.ts` wait in game time for the sequence, since getting in and out is no longer instant; every gameplay assertion is kept. Checked by eye (Playwright screenshots, 915×412, not committed): the car door swings out from its front hinge with the figure standing behind it, the figure disappears into the dark doorway as it sits (no cabin); bus leaves fold out on the kerb side and the figure steps in between them; the auto rider steps in from the left, though the legs brush the front cowl mid-step; feet stay on the ground while walking; train doors on the coach nearest the player slide apart to show dark openings |
| Police and wanted level (17 Nov, `agent/police`) | **pass**: typecheck clean, unit 337/337 (34 new: `Wanted.test.ts` 25, `Pursuit.test.ts` 9), browser **60/60** full suite (21.0 min) | `npm run typecheck && npm test`; `PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e -- --trace off`. New `police.spec.ts` (4): a pistol shot gives a star and a car comes from out of sight (over 60 m) and reaches the player, stars flash when seen; teleported kilometres away the star holds until its 30 s and then fades and the car leaves; standing still beside the officers at one star → busted, ₹500 fine, rounds taken, released by a police station; the own hatchback is no crime, `car-1` is theft, and at two stars the job board refuses. An earlier partial full run had one failure in `onfoot.spec.ts` (chunk streaming, a wall-clock wait under load); it passed in the complete run. **Cost at `?quality=lite`** (production build, software GPU, spawn street): before police 175–207 draw calls / 250–300k triangles; one car plus two officers on foot +21 draw calls / +30k triangles; a 3-star chase (two cars, three armed officers) peaked at 244 draw calls and 333k triangles (3-star stop on foot: 241 / 309k). Draw calls are within the ~300 budget; triangles go over 300k at the spawn street, which was already at the limit. Checked by eye at 915×412: light bar and POLICE band on the car, officers walking up and standing round the player, armed officers at 3 stars, stars under the money line (no overlap with controls or the minimap), the Busted toast at the station |
| Stabilise merge, Android only (17 Nov, `agent/stabilise-merge`) | **pass**: unit 303/303, browser 55/55, then 56/56 (16.6 min, no retries) on the final code with the controls-layout test and closed grips | `npm run typecheck && npm test`; `cd apps/game && PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --trace off`, run alone on the machine (first run 55/55 in 15.9 min, no retries). Unit count is 305 minus the 4 keyboard Gearbox tests removed with the keyboard (TD-20). New test: every driving control (GAS, BRAKE, HORN/SIREN, EXIT, P/R/D) on screen at 915×412 and none overlapping another or the minimap; it failed on the old layout, where HORN/SIREN sat under the minimap. Checked by eye in screenshots: bike rider seated with hands on the grips and a foot down; auto driver's hands on the handlebar, head under the roof; share-auto passenger on the rear bench with the estimated `PASSENGER` pose, feet on the floor, no clipping; P/R/D beside BRAKE and GAS at 915×412. Car and bus drivers are hidden (closed vehicles, no modelled wheel) |
| Cost at `?quality=lite` (17 Nov, production build) | spawn at the triangle budget, the rest under | Headless Chromium, software GPU, worst of four headings after 6 s of game time: Anna Nagar spawn 207 draw calls / 300k triangles; T. Nagar (3269, 4960) 158 / 271k; Anna Salai (5033, 3180) 154 / 230k; beside Egmore station (5622, 703) 164 / 216k. Budget about 300 draw calls and 300k triangles: draw calls have room, triangles at spawn do not (it was 165k there on 16 Nov evening; the street props, shop fronts and people added since are the likely cause, not yet profiled) |
| Share auto (17 Nov) | **pass**: unit 202/202, browser 55/55 in the merged suite (`shareAuto.spec.ts` kerb passengers included) | `npm run typecheck && npm test`; `cd apps/game && PW_PORT=4273 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --trace off` (the 38 earlier tests plus `shareAuto.spec.ts`). `PW_PORT` was needed because another checkout's preview server held 4173 |
| TypeScript strict | pass | `npm run typecheck`; `cd apps/mobile && npx tsc --noEmit` |
| Unit tests (51, 16 Nov) | pass | `npm test`: projection, OSM parsing, vehicle physics, mission rules, road graph and agents (including dead ends, people passing each other, pulling over for a siren), combat rules, job rules (clock, dwell, pay, bumps, fines, reputation locks, late bus stops, damaged saves), gear indicator, game clock |
| Unit tests (103, 16 Nov, later) | pass | `npm test`, 14 files: adds signals, junction turns, density, traffic mix, lighting by hour and rain, drift on a real Rapier world (and no false crash from drifting or braking), chase camera, landmarks from OSM and the ring-path fallback |
| Suburban railway (17 Nov) | **pass**: unit 218/218, railway browser spec 3/3 | `npm test`; `cd apps/game && PW_PORT=4294 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test railway --trace off` (2.3 min). The full browser suite was not run on this branch. Not run on the emulator or a phone |
| Street props (17 Nov) | **pass**: unit 180/180, browser 38/38 | `npm test` (adds `props.test.ts`, `StreetProps.test.ts`, real-city `apps/game/src/props.test.ts`); `cd apps/game && PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --trace off`, 38/38 in 6.9 min on a software-rendered host. Not run on the emulator or a phone |
| Browser tests (38, 16 Nov, night) | **pass, 38/38** | `npm run test:e2e` on the same slow host (`PW_CHROMIUM=/opt/pw-browsers/chromium`): the 33 earlier tests, `city.spec.ts` (4) and the Marina evening drive. The timing tests now hold controls for a span of **game** time (`waitGameTime`, from `snapshot().simTime`) and wait for a frame after taps and drags, instead of wall-clock milliseconds; every gameplay threshold is unchanged (the drift test now checks "slide ends within a second" in game time). Wall-clock poll limits were raised where they only bound how long to wait. Before this, the same tests failed on this host and on GitHub's runner (4 of 33) because the game ran behind real time |
| City build, browser (16 Nov, evening) | 26/33; the baseline also 26/33 on the same machine | `npm run test:e2e` with `PW_CHROMIUM=/opt/pw-browsers/chromium` (the pinned Playwright's own browser was not installed). The 7 failures are all timing tests (distance in a fixed time, camera drag, jump, drift, getting out). The last tested commit 0931329, run on the same machine straight after, failed 7 timing tests too, 6 of them the same: the host renders at 100–300 ms frames in software. Everything else passes, including the updated streaming test (teleport 6 km to T. Nagar: every Anna Nagar chunk freed, the new ones loaded, street name read). **Needs a rerun on a normal machine or in CI** |
| City measurements, browser (16 Nov, evening) | see note | Headless Chromium, software GPU, `?quality=lite`: ready in 3.5–4.3 s; Anna Nagar spawn 149 draw calls, 165k triangles, 9 chunks (0931329: 154, 175k, 10); T. Nagar 105 / 164k; Anna Salai 90 / 152k; Kapaleeshwarar area 97 / 149k; teleport loads in 0.03–0.9 s; JS heap 110–125 MB (0931329: 45 MB). Frame rates on this host are not meaningful |
| Unit tests (103, 16 Nov, evening) | pass | `npm test`, unchanged count |
| Browser tests (33, 16 Nov, later) | pass | `npm run test:e2e`: adds traffic (signals, mixed kinds, waiting at lights, fewer vehicles at night), look (golden-hour start, night and rain from the pause menu, kept after reload, draw calls under 450), landmarks (tower base solid, steps walkable, label near and on screen only), handling (drift at about 82% of top speed then grip, no drift turning slowly, gears climb, camera follows), and all ten jobs having their vehicle. The drift, traffic and "traffic keeps moving" tests passed three times in a row |
| Browser tests, rerun before commit (16 Nov, 13:50) | 31/33, then on-foot 20/21 | Host load average was 10–16. The two on-foot timing tests (joystick walk distance, camera drag) failed once each: they hold the stick for a fixed time, and under heavy load the game runs in slow motion. Nothing they cover changed; they passed 33/33 earlier at normal load. Rerun on a quiet machine |
| Android build (16 Nov) | pass | APK 22.7 MB |
| Android emulator (16 Nov) | pass, with a caveat | Played on `Medium_Phone_API_35`: golden hour, palms, signals, zebras, job board, an ambulance run started, twilight with lit windows at 60 fps. The first cold start fell to 6–20 fps while the host was busy; it did not happen again, and in the emulator's Chrome both the previous commit and this build held 59–60 fps. In headless Chromium (software GPU) this build is about 25% slower than the previous commit at lite (34 → 25 fps), so the new visuals do cost GPU time: check on a real phone |
| Browser tests (21, 16 Nov) | pass | `npm run test:e2e`, adds `jobs.spec.ts`: board → ambulance run with the siren and gear shown → pick-up → hospital → paid, reputation up, kept after reload; bus locked below reputation 55, drivable with it; quitting a job fines reputation and the stage remains. The 18 earlier tests still pass |
| Browser tests (18, 15 Nov) | pass | `npm run test:e2e`: production bundle in headless Chromium with touch events. Map streaming, walk/run, camera, jump, collision with a real building, driving all three vehicles, steering, AI traffic moving, stages 1, 2, 7 (fist fight) and 8 (pistol), being knocked out, health bar and street name, saved progress, new game |
| Android build | pass | `./gradlew assembleRelease` (JDK 21, arm64-v8a), APK about 23 MB |
| Android emulator | pass | `Medium_Phone_API_35` (Android 15, WebView 157) on an Apple-silicon host GPU: 57–60 fps with traffic and pedestrians; walked to the hatchback, got in, drove at 55 km/h, objective advanced; saved progress survived a reinstall; no graphics errors in the device log. The build with combat was opened there (60 fps, new buttons, health bar and street name shown) but no fight was played on the emulator.|
| **Real Android phone** | **not tested** | No phone was connected. Frame rate, heat, memory and two-thumb touch are unknown |

Not covered by any automated test: the courier and cab jobs end to end and a full bus route
(their rules are unit-tested), Share progress (clipboard and share sheet differ per device),
traffic actually clearing a path for the siren in the city (unit-tested on a test map only),
the ambulance and bus on the emulator. Stages 3 to 6, 9 and 10 end to end (their rules are
unit-tested; the routes are not driven and the last two fights are not played through), sound
(nothing checks what is heard), the bike and auto on the emulator, and long play sessions.
Difficulty has not been play-tested by a person.

### Phone test checklist
1. `adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
2. PLAY loads the street within about ten seconds.
3. Left thumb moves, right thumb looks, both at once. JUMP works while moving.
4. Walk into a wall and a tree: the player stops.
5. ENTER a car: steer with the left thumb while holding GAS with the right. BRAKE to stop, tap R
   and hold GAS to reverse, tap P and check the car holds still, tap D to drive on. Tap R while
   moving: it brakes to a stop first. EXIT only works when nearly stopped. Check the selector is
   easy to hit with the right thumb and the rider's hands sit on the bars (bike, auto).
6. Note the fps on foot and at speed, and the phone model. Play for ten minutes and note heat.
   Check that sound plays (engine, horn, shots) and isn't too loud or harsh.
7. Finish stage 1, close the app, reopen: money and stage are kept.
8. Back: pause. Back again: menu. Switch apps and return: paused.

## Known issues and limits

- **Buildings:** footprints are real; heights, floor counts and colours are estimates (the
  extract has none). No landmark models (Anna Nagar Tower is not modelled). Facades are
  procedural textures, not photographs. Mapped building coverage is patchy in places, which
  shows as empty lots.
- **Character:** placeholder with an unsuitable licence for release; see `assets/README.md`.
  No jump, get-in or driving animations (riding poses are fixed: no steering with the bars or
  wheel, no foot down at a stop).
- **Roads:** flat, no kerb height, no medians (trees mapped on medians are left out), no
  traffic signals or signs. One-way streets are respected by traffic, not enforced on the player.
- **AI:** traffic does not overtake or plan routes, and can queue behind a vehicle the player
  leaves in a lane (agents stuck for 8 s out of sight are moved). AI drivers sit in open vehicles
  (bike, auto) with a riding pose; in closed vehicles they are hidden. Pedestrians react only to someone being hit near them (not to gunfire or the horn); being hit is a knock-down pose, with no ragdoll or limp animation. No police
  or wanted level.
- **Combat:** enemies have no pathfinding (they head straight for the player and side-step
  walls), don't take cover, and exist only during their stage. Punching and aiming are arm
  poses, not animations; a beaten enemy simply lies down. Shooting only works on foot. Bullets
  are instant and never hit pedestrians or vehicles. Balance is a first guess.
- **Vehicles:** cannot roll or pitch (by design, TD-8); no damage; no collision or tyre sound.
- **Sound:** synthesised tones, not recordings, and no music or city ambience.
- **City memory:** road centre lines, places and the chunk table for the whole city stay in
  memory; the AI's road graphs, spawn weights and signals cover only 2.4 km round the player
  and are rebuilt every 500 m (agents keep their road; the signal clock carries on). JS heap
  51–62 MB in the browser at Anna Nagar, T. Nagar, Anna Salai and Marina (110–125 MB with
  whole-city graphs; 45 MB for the old 1 km² map).
- **APK loading of the city: works on the emulator, not tested on a phone.** The APK serves the
  game through `WebViewAssetLoader` at `https://appassets.androidplatform.net/assets/game/`
  with file access off (TD-16). Verified by the CI job `android-smoke` (CI run 43842951826 on 8009db6, 16 Nov 2026: Android 14 (API 34, x86_64, software GPU) emulator; the page at `https://appassets.androidplatform.net/assets/game/index.html` reached `data-ready="true"` with 9 chunks loaded about 60 s after launch). That
  is an x86_64 test build with test hooks (WebView debugging, skip the menu); the arm64 release
  APK built in the same run is the same code otherwise. Not played on the emulator by a person;
  frame rate, memory and touch on a phone are still unknown.
- **Performance:** about 270–300 draw calls and 290k triangles with everything on screen. Fine on
  the emulator's desktop GPU; unknown on phones. Each pedestrian is a full skinned character.
- **Blender auto in the game, and drivers in traffic (17 Nov; unit tests, browser tests 38/38,
  screenshots in headless Chromium; not on a phone):** the auto-rickshaw from
  `tools/blender/auto_rickshaw.py` (optimised `assets/optimized/vehicles/auto_rickshaw_lod1.glb`,
  107 KB, 12k triangles) replaces the code-built auto for the player's, parked and traffic autos.
  `packages/vehicles/src/glbModels.ts` loads it once and merges its parts into seven roles with
  colours in the vertices (shared buffers per livery), and one wheel scaled to the physics radius.
  The code-built auto (`autoModel.ts`) is the fallback before loading and in unit tests. Every
  AI vehicle (auto, car, bike, bus) now has a driver: the game's human model with the seated pose
  baked into static meshes once per shirt colour (`HumanAssets.seatedStatic`), seated at
  `VehicleType.driver` (right-hand drive; estimated positions), auto drivers in a khaki shirt.
  Drivers are drawn within 40 m of the player. Spawn at `?quality=lite`, with drivers drawn
  within 60 m: 181 → 188 draw calls, 265k → 299k triangles (the 300k budget). Then cut to 40 m,
  not re-measured. The bus driver's seat is not checked by eye yet.
- **Realistic auto-rickshaw in the game (17 Nov; unit tests, looked at and measured in
  headless Chromium, not on a phone):** `packages/vehicles/src/autoModel.ts` replaces the boxy
  procedural auto with the reviewed prototype (`prototypes/auto-rickshaw.html`): 2.63 m body,
  1.30 m wide, 1.71 m tall, twin headlamps, raked windscreen, fabric canopy with a rear window,
  open sides, grab rails, saddle and bench, mirrors, yellow commercial plates (no real number),
  and torus tyres with steel rims. Colours are in the vertices, so all autos share seven
  materials (paint, trim, metal, glass, lamp, tail, plate), plus three wheels: 10 meshes and
  under 9k triangles per auto (unit test). A green paint colour gets the yellow band of a battery
  auto (TN rules), any other the green band. The physics (`specs.ts`) is unchanged. Spawn at
  `?quality=lite`: 178 → 181 draw calls, 248k → 265k triangles. Browser tests 38/38
  (`cd apps/game && PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --trace off`).
- **Street props in the streets (17 Nov; unit tests, real-city test, measured and looked at
  in headless Chromium; not on a phone):** the Blender props (original, `npm run blender:props`)
  are now placed. Pavement props (`packages/game-world/src/props.ts`, `chunkProps`): groups of a
  vegetable handcart, stacked crates, oil barrels or clay pots at the back of the pavement of
  main roads, every 13 m from the road's id with a 14 % chance per side, front edge 2.25 m
  outside the carriageway (pedestrians walk at 1.4 m), never round junctions or road ends, in a
  building, on another road, within 2 m of a pole or 4.5 m of a bus shelter; each is a solid
  box (`propSolids`). Fixtures (`packages/game-engine/src/StreetProps.ts`, `buildingFixtures`):
  wall AC units on upper floors of buildings without balconies (not on shop walls, not against
  a neighbouring building) and dish antennas near a corner of flat roofs, all pointing south;
  not solid. All of it is invented. Models are baked once into vertex-coloured geometry and a
  chunk's props are merged into two meshes (pavement props cast shadows, fixtures don't). The
  shutter, the awning and the `ShutterOpen`/`Roll` clips are not used yet. Measured with a
  production build in headless Chromium (`?quality=lite`, 915×412), `snapshot()` before → after:
  Anna Nagar spawn 168 → 178 draw calls, 210,011 → 247,935 triangles; T. Nagar (3269, 4960)
  135 → 141, 196,491 → 213,295; Anna Salai (5033, 3180) 102 → 109, 164,821 → 177,939. A first
  version at twice the density reached 303k at spawn, over the TD-18 budget, and was cut back.
  Tested by unit tests (`props.test.ts` in game-world: setback, facing, both sides, chunk
  independence, junctions, poles and shelters, buildings, solids; `StreetProps.test.ts` in
  game-engine: loads the real optimised models, footprints match `PROP_SIZE`, merging and
  turning, AC and dish rules; `apps/game/src/props.test.ts` on the real city files: nothing in a
  building or on a carriageway round spawn, T. Nagar and Anna Salai, under 40k prop triangles per
  3 × 3 chunks) and screenshots (handcarts on Sir Thyagaraya Road, barrel and crates on 5th
  Avenue).
- **Bundle:** 6.1 MB (16 Nov, night; was 8.1 MB). The character and animations are optimised by
  `npm run optimize:assets` (607 KB together, was 1,985 KB) and embedded as base64 (TD-3); the
  world is no longer in the script (TD-16). Checked in the browser: the optimised character
  loads, walks and animates with no errors.
- **Not built:** inventory or shops, more weapons, settings screen (including a mute switch),
  interiors, weather, day/night.
- The release APK is signed with the debug keystore and built for arm64 only.

## Fares and stages 16–21 (branch `agent/fares-stages`, 21 Nov 2026)
- **Passengers get in and out (fares).** Before, every pick-up and drop was only a marker to stop
  at. Rules in `packages/missions/src/fares.ts` (`FareStop`, `busCrowd`, timings in `FARES`, all
  estimates): someone waits on the pavement beside the marker; once the vehicle is stopped in it
  they walk to the door (1.3 m/s), get in (auto 1.2 s, car 1.8 s, ambulance 2.6 s and a patient
  1.5 × that, bus 1 s), and only then is the objective or job stop done. At a drop they get out,
  walk onto the pavement and 2.5 m on, then it pays. Bus stops: some off first, then some on
  (nobody aboard at the first stop, everyone off at the last). A walker heads back if the vehicle
  drives off; someone at the door finishes. `MissionRunner` and `JobRunner` run a stop's fare
  before it counts, and **their clocks wait while people get in and out** (arriving in time is
  what counts), so time limits, bumps and pay are otherwise unchanged; a stop with a fare no
  longer uses its old `dwell`. Used on stage 3, the cab ride, Tower Park visitor, Marina evening,
  ambulance run, both hospital transfers and all three bus routes (and stages 16 and 18).
- **Where they wait:** `apps/game/src/fareSpots.ts` puts the spot 0.6 m past the carriageway edge
  (estimated), on the side the real place is on, sliding along the road off junctions; two
  hospital pick-ups and the home bus route needed a side or a shift because buildings reach the
  carriageway there (found by `fareSpots.test.ts`, which checks every spot against the real
  chunks' buildings and roads).
- **Drawing them:** `apps/game/src/FareFigures.ts`: background figures (`HumanAssets`) only for the
  current stop and within 220 m; they wave (`HumanFigure.setWaving`, a new arm pose) once the
  vehicle is within 55 m; walk to the passenger door nearest the kerb (`VehicleType.passengers`,
  new in `@cow/vehicles`); sit down on the auto's rear bench (seated baked figures with the share
  auto's `PASSENGER` pose and `SEATS`) or step through a closed vehicle's door and disappear.
  Cars now have **rear passenger doors** and the ambulance **two rear doors**, in the same door
  mesh as the driver's (still one draw call; car 168, ambulance 120 triangles); the door swings
  open for the passenger and shuts after. The bus uses its front door. The HUD says "Passenger
  getting in" / "getting out" / "The patient is being loaded".
- **Stages 16–21** (`apps/game/src/laterStages.ts`), starting at the Royapettah clock tower where
  stage 15 ends, each within 1.5 km of the last one's end, vehicles parked at the starts:
  16 *Muhurtham* (wedding party of three by auto, Westcott Road to North Mada Street, Mylapore;
  ₹1,800, reputation +3), 17 *Hot property* (a planted chain: a new `evade` objective raises the
  wanted level to 2 stars and is met when it is back to 0; ₹2,000, +2), 18 *The Mumbai Mail*
  (a singer by car from South Mada Street to Chennai Central on EVR Periyar Salai, timed;
  ₹2,500, +3), 19 *The harmonium thief* (walk to Park station, ride the train to Egmore: new
  `byTrain` reach; then a motorbike chase on EVR Periyar Salai; ₹2,800), 20 *Biryani for the
  dressing room* (bike delivery Egmore to the Chepauk stadium gate, two timed drops; ₹1,600,
  +2), 21 *Beach road brawl* (five with fists and bats on Kamarajar Salai; ₹3,000, +4).
  Missions can now pay reputation (`Mission.reputation`, `JobRunner.gainReputation`).
- **Tests:** unit: `fares.test.ts` (FareStop, busCrowd, both runners with fares, evade, by
  train), `fareSpots.test.ts`, `laterStages.test.ts`, `doors.test.ts` (rear doors; triangle
  limits raised on purpose), `content.test.ts` (15 → 21 stages on purpose). Browser:
  `fares.spec.ts` (stage 3 passenger waits, walks, sits, gets out and walks off before pay; cab
  rear door opens and shuts; bus stop boarding and alighting) 3/3; `stages3.spec.ts` plays
  stages 16–21 with the test hooks: 6/6 (in the full run).
- **Checked by eye** (screenshots at 915×412, lite, not kept): the stage 3 passenger stands on
  the pavement and walks to the auto's side, gets in beside it, sits under the canopy; the cab
  passenger stands at the open left rear door; three bus passengers walk from the pavement to
  the bus. Figures are small and dark at lite quality; the waving arm was not caught in a
  screenshot (the passenger was off screen in the one taken from down the road).
- **Results on this branch:** typecheck clean; unit 460/460; full browser suite 86/87 in 34.8 min (run once, with the lock); the one failure was `missions2.spec.ts` stage 15 still expecting no stage after the street war: updated on purpose to expect stage 16, then that test passed on its own (1/1).

## 22 Nov 2026: people from the manifest (branch `agent/people-game`)
- **Done:** casting from `people.json` (`people.ts`, `HumanAssets.look`), lazy per-person
  loading, height fit, stride-scaled gait, feet kept on the ground by the retargeted clips, LOD1
  beyond 30 m, dyed gang colours and stand-in uniforms, several people and a tea seller in
  platform crowds, wedding party and patients for fares. `docs/characters.md`, TD-24.
- **Tested:** typecheck; unit tests (`people.test.ts`, `retarget.test.ts`); browser
  `people.spec.ts` and the touched specs listed in `handoff.md` (not the full suite: CI runs it).
  Checked by eye at 915x412 lite: street walkers, auto driver, police (khaki dye), platform crowd.
  Not tried on a phone.
- **Cost** (lite, software GPU, worst of four headings; fixture cast): spawn 207 -> 187 draw
  calls, 300k -> 258k triangles; T. Nagar 154 -> 124, 270k -> 197k; two-star police stop 225 ->
  200, 316k -> 266k; Egmore platform 153 -> 131, 230k -> 165k.

## 22 Nov 2026: loading screen, title menu over the live city, pause menu that never clips (TD-25)
- **Loading screen** (`apps/game/index.html` first frame, `packages/ui/src/LoadingScreen.ts`):
  wordmark (CHENNAI / OPEN WORLD, and சென்னை in the bundled station font once it is loaded),
  rotating tips about real features, and a bar of six segments, one per named step of
  `Game.create` (`LOAD_STEPS`: map, physics, streets, people, traffic, railway). Before the first
  step the bar is an indeterminate sweep; no percentage is shown anywhere. Once the world file is
  read, its real road network is drawn behind (amber by road class, the sea in blue), drifting
  slowly. On failure: the error and a TRY AGAIN button (reload) instead of a line of text.
- **Title menu** (`packages/ui/src/TitleScreen.ts`, `apps/game/src/TitleDesk.ts`): drawn over
  the city round the player, seen from a camera circling at about 30 m (about three minutes a
  turn, pulled in front of buildings with a ray cast), at most 30 frames a second, rules stopped.
  PLAY (stage 1) or CONTINUE (stage, money, stages done) and NEW GAME (asks first), SETTINGS
  (time of day, weather: changed live behind the menu and saved), CONTROLS, ABOUT (OSM
  attribution with the extract date, what is estimated, fonts), QUIT inside the app only. A
  location card shows the real district and street, time and weather. Arrow keys / Home / End /
  Enter / Escape; hover selects on a desktop; staggered entrance; fades through black to the game.
  `prefers-reduced-motion`: no animations, and the city is a still frame.
- **Pause menu fix** (`packages/ui/src/Hud.ts`): the overlay centred its buttons in a box that
  could not scroll, so on a landscape phone the first and last fell off the screen (with six
  buttons in the app at 915×360: "Paused" off the top and MAIN MENU off the bottom). It now
  centres with auto margins inside a scrolling box and puts the buttons in a wrapping grid: all
  six fit at 740×360. Job board overlays get the same. MAIN MENU (now also in a browser) returns
  to the title menu.
- **Shell** (`apps/mobile`): `MainMenu.tsx` removed; the app opens the game page at once; every
  Back goes to the game (city map → close, playing → pause, paused → title menu, sub-page →
  main page, title main page → close the app); failure screen has TRY AGAIN and CLOSE.
  Typecheck and lint clean. **Not built or run on the emulator or a phone** (no Android SDK on
  this machine).
- **Tests:** unit `TitleDesk.test.ts` (camera path, controls list). Browser `title.spec.ts`
  (8): each real step shown in order then "Ready"; menu over a paused city (sim time still);
  PLAY starts where the player stands; settings change and save time and weather; keyboard;
  CONTINUE and NEW GAME with cancel and confirm; every button on screen at 915×412, 640×320,
  412×915, 1024×768 and 1440×900; inside a stand-in shell, every pause button reachable at
  915×360 and MAIN MENU → title → PLAY back where the player was; Android Back order and QUIT.
  The pause test was run against the old `Hud.ts` and failed (a button ended at y=414.5 of 360).
  Other specs now open `/?quality=lite&start=play`.
- **Checked by eye** (screenshots, lite quality, not kept): 915×412, 640×320, 412×915,
  1024×768 and 1440×900 for the loading screen and the title menu; settings, controls and about
  pages; pause menu at 915×412 and 740×360.
- **Results on this branch:** typecheck clean (game and `apps/mobile`, which also lints clean); unit 503/503; full browser suite **104/104** in 38.9 min (run once, alone, with the lock); `title.spec.ts` 8/8 again after the last change (reduced-motion redraw on resize).

## 22 Nov 2026: sound design: every vehicle its own engine and horn; traffic, footsteps, city (TD-26)
- **Before:** one horn for every vehicle; one engine tone in two pitches (auto and bike shared
  the "small" one, car, bus and ambulance the other); no footsteps, no traffic sound, no
  background.
- **Now** (`packages/audio`: `profiles.ts` data and maths, `voices.ts` graphs, `Sound.ts` mix):
  each vehicle's engine follows its own cylinders, idle and change-up revs and the gears, its
  own horn, its own door (car thunk, bus air hiss, none for the auto and bike); nearby traffic
  heard as its own kinds and honking when stood; footsteps and landing; city hum, rain, sea,
  crickets, crows, the koel at dawn, distant horns; muffled inside closed vehicles and trains;
  a compressor on the master. SOUND on/off in Settings and the pause menu (saved).
- **Measured** (offline renders in Chromium, `sound.spec.ts`): idle notes car 26.5 Hz (designed
  26.7), auto 11.5 (11.25), bike 13.5 (13.3), bus 32.5 (32.5), ambulance 22.5 (22.7); each
  more than doubles when driven; horn peaks car 523, auto 680, bike 560, bus 699 (2 × 349),
  ambulance 494 Hz, all different; the auto's horn is silent between its two taps. The first
  render found the multi-cylinder engines an octave low and the auto and bike horns about a
  third as loud as the car's: both fixed.
- **Tests:** unit `profiles.test.ts` (12: notes distinct, gear changes, free revs, horns,
  panning, cadence, time of day, honking); it caught two engine pairs within 7 % of each other
  (car and ambulance, auto and bike), retuned. Browser `sound.spec.ts` (4): the two offline
  measurements above; in the game, footsteps on a walk, the car's and the auto's own engines
  (revs rise with GAS) and horns, traffic voices of traffic kinds, the city bed, SOUND off
  saved; rain and night beds.
- **Not done:** not listened to on a phone (only measured); no footsteps for other people; no
  per-bus volume settings.
- **Results on this branch:** typecheck clean; unit 515/515; `sound.spec`, `title.spec`,
  `driving.spec`, `onfoot.spec` 30/30 (the affected specs, per AGENTS.md; the full suite runs
  in CI). Before the CI-shard rule, one full local run: 107/108, the failure stage 12, which
  also fails 1 in 3 on the untouched base (`suggestions/2026-11-22-chennai-combat-stage-flakes.md`).
  Game speed in headless Chromium measured with and without sound started, next to traffic:
  0.69–0.72 game seconds per second either way (no measurable cost).

## 22 Nov 2026: combat redesign: pedestrians in fights, moves, reactions, block and dodge (TD-27)
- **Before (audit):** a punch was the arm snapped forward for 0.22 s; shots an arm held out and a
  0.07 s tracer; enemies showed nothing until they fell flat in one frame; pedestrians could only
  be hurt by vehicles (punches and bullets passed through them); enemies walked straight at the
  player and all attacked at once; no block, dodge or targeting.
- **Now:** jab/cross/hook combo and bat swing, gun recoil and muzzle flash; enemies square up,
  wind up before striking, flinch and stagger, are knocked back, fall over half a second; health
  bar over a hurt enemy, lock-on brackets, hit markers; DODGE and BLOCK in a fight; brawlers take
  turns and circle, gunmen strafe and keep their distance, the badly hurt back off; pedestrians
  flinch, stagger, are knocked out (and get up later) or killed by guns; bystanders flee or
  cower; the police are told. Combat sounds (impacts, bat crack, block, dodge, wind-up, grunts).
- **Found and fixed while testing:** the lock-on stayed on a farther enemy while another stood in
  the player's face (punches whiffed): an enemy within arm's reach now takes it. A pedestrian's
  health reset after each hit (keyed on a counter that moving them bumps): now kept by place.
  Stage 15 stuck: a hurt enemy backed into the enclosed space by the clock tower and could not
  get out: backing off now needs open ground and steering tries both sides.
- **Tests:** unit `Melee.test.ts` (combo, reactions, block, dodge timing, turns, circling,
  gunman strafing, retreat, steering, lock-on, pedestrians), `combatMoves.test.ts`; three combat
  tests updated on purpose (new hit events; knock-back; wind-up needs small steps). Browser
  `fight.spec.ts` (fight mode and controls, lock-on, health bar, block, dodge; a pedestrian
  knocked out by two punches with the police told; bullets hitting a pedestrian).
- **Checked by eye** (screenshots frozen mid-move at phone quality, not kept): thugs squared up;
  jab with hit marker and health bar; block with forearms up; dodge crouch; knocked-down thug.
- **Results on this branch:** typecheck clean; unit 540/540; browser (affected specs, per
  AGENTS.md): `combat`, `gangs`, `missions2`, `stages3`, `police`, `pedestrians`, `weapons`,
  `onfoot` 37/38 on the first run (stage 15 stuck, fixed as above, then 1/1 again with
  `missions2` 9/9 and `combat` 4/4); `fight.spec` 4/4. The full suite runs in CI.
## 23 Nov 2026: the game stalled loading on a phone (branch `agent/loading-screen`)
- **Seen on a device:** the loading screen stopped at "Reading the map of Chennai", with bands of
  the background undrawn and the progress panel a white box. Not reproducible in headless
  Chromium (no GPU memory budget); there, with the CPU slowed 4×, loading finished in 15 s.
- **Cause found:** the merged Chennai cast inlined 75 model files (6.9 MB) as base64, so the one
  script went from 6.7 MB to 16 MB. And the WebView used `androidLayerType="hardware"`, an extra
  full-screen GPU texture for the whole page.
- **Fix:** the cast's models are files beside the page (`peopleFiles.ts`, `?url`), fetched when a
  person is first needed; the player's model stays inline. Script 6.7 MB again; JavaScript memory
  after loading 157 → 116 MB (CPU slowed 4×, 800×360 at 2.5×). The hardware layer is gone.
- **Phone, second try:** still white boxes, then black after about a minute, and the app
  sometimes closed. The white boxes are layers the phone could not draw, and each animated element
  is one: the loading screen now animates nothing after its opening rise (no map drift, no bar
  sweep, no tip fade, no fade-out over the game; running animations mid-load 2 → 0), its map
  sketch is drawn at CSS pixels, and `Game.create` waits a frame after each step so the screen is
  drawn between long stretches of work.
- **Phone, third try:** the progress panel now drew, but the page stopped updating at the first
  step while the map canvas showed. Added loading reports to the shell (`loadReport.ts`: device,
  steps, 2 s heartbeat, errors, WebGL context lost) and a native status panel in `GameScreen.tsx`
  after 20 s or on a problem (step and time, page answering or not, device; TRY AGAIN, CLOSE).
  New browser test with the stand-in shell: device, the six steps in order, heartbeats that stop
  when loading ends, no problems. Title spec 9/9.
- **The phone:** POCO M6 Pro 5G, 6 GB, Snapdragon 4 Gen 2 with an Adreno 613 GPU. The screen
  flickered. The street sketch (every street, five long round-joined paths) is now drawn on the
  CPU (`willReadFrequently`): 124 ms with the CPU slowed 6×, one upload to the GPU.
- **Known good:** the player says the game ran at about 50 fps on this phone before the loading
  screen and title menu. `androidLayerType="hardware"` (removed on a guess in the first try) is
  restored to match that build.
- **Not yet:** checked on the phone that showed it.


## 23 Nov 2026: crashes throw the rider off (branch `agent/crash-ejection`, TD-29)
- **Asked by a player:** "When I hit some cars or buildings, the entire thing just stops. I
  expect the bike to crash and me to be thrown off."
- **Before:** a hit only played the crash thump and cost the vehicle 35 % of its speed
  (`Vehicle.update`); the chassis cannot roll, so a wall just stopped it dead.
- **Now:** `judgeCrash` (`@cow/vehicles` `crash.ts`, table in TD-29) decides from the impact
  (change of velocity in one step) and the vehicle kind: nothing, shaken (seated damage), or
  thrown. Motorbike riders come off from 35 km/h, auto drivers from 30, car drivers go through the
  windscreen from 70 (ambulance 75), the bus never throws. The body flies with the vehicle's
  speed (`PlayerController.throwOff`, the player's own character controller, so walls stop it),
  lands (damage then, with the hurt grunt and flash; a knock-out at 0 health), scrapes to a stop,
  lies still, gets up (the figure's animated fall, `setDown`) and is on foot. The motorbike falls on
  its side and scrapes to a stop; getting back on picks it up. `Game.ts`: `crashed`, `crashHurt`,
  input held while thrown, snapshot `crash` and vehicles' `tipped`. New `Crashes.ts` (start
  point kept clear of walls, lying direction clear of walls), `Combat.hurt`,
  `CharacterBody.passThrough`. `FollowCamera` eases in when its reach shrinks with nothing in the
  way (it jumped before).
- **Tests:** unit `crash.test.ts` (thresholds, damage, launch), `PlayerController.test.ts` (with
  Rapier: phases, no control while thrown, stopped by a wall and sliding along it, passes through
  its own bike without moving it, respawn ends it), `Combat.test.ts` (`hurt`),
  `FollowCamera.test.ts` (eases in). Browser `crash.spec.ts`: the bike run into a real wall at
  full throttle throws the rider, who ends on foot more than 1.5 m from the bike, hurt, on the
  ground (feet within 5 cm), with nothing solid between it and the start of the run (not through
  the wall), with the camera within 10 m all along
  and the bike tipped over; a bump at about 10 km/h does not throw or hurt.
- **Not tried on a phone.** Thresholds and the look of the tumble judged in the design, not by a
  player yet.
