# Progress, testing and known issues

Last updated: 16 Nov 2026 (evening).

## What exists

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
  reverse. Get in and out; the rider is visible, seated, on the bike and in the auto; the bike
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
  and hospital farthest apart), share auto (two pick-ups, one drop at the market), Tower Park
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
- **HUD:** gear indicator (R, N, 1–5; display only, the engine has no gearbox), reputation,
  JOBS button. Pause menu: Share progress (system share sheet, else clipboard, else shown on
  screen) and Time of day (Morning, Noon, Evening, Night; the clock runs one game hour per real
  minute and is saved).
- **Sound:** synthesised engine note that rises with speed, horn, doors, gunshots, punches,
  hurt, objective chime, stage fanfare and failure. No sound files.
- **Interface:** joystick, camera drag, context ENTER/EXIT button; JUMP, HIT and FIRE (with
  rounds left) on foot; GAS, BRAKE and HORN when driving; money and stage, health bar, the real
  name of the street underfoot, objective with distance and countdown, speedometer, rotating
  minimap with the objective, vehicles and enemies, a light beacon at the target, pause with
  New game.
- **Android app:** React Native shell with a native menu, landscape, full screen, Back and
  background handling, and an error screen.

## What was tested, and how

| Check | Result | How |
|---|---|---|
| TypeScript strict | pass | `npm run typecheck`; `cd apps/mobile && npx tsc --noEmit` |
| Unit tests (51, 16 Nov) | pass | `npm test`: projection, OSM parsing, vehicle physics, mission rules, road graph and agents (including dead ends, people passing each other, pulling over for a siren), combat rules, job rules (clock, dwell, pay, bumps, fines, reputation locks, late bus stops, damaged saves), gear indicator, game clock |
| Unit tests (103, 16 Nov, later) | pass | `npm test`, 14 files: adds signals, junction turns, density, traffic mix, lighting by hour and rain, drift on a real Rapier world (and no false crash from drifting or braking), chase camera, landmarks from OSM and the ring-path fallback |
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
5. ENTER a car: steer with the left thumb while holding GAS with the right. BRAKE, then hold
   BRAKE to reverse. EXIT only works when nearly stopped.
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
  No jump, get-in or driving animations (the seated pose is a fixed pose).
- **Roads:** flat, no kerb height, no medians (trees mapped on medians are left out), no
  traffic signals or signs. One-way streets are respected by traffic, not enforced on the player.
- **AI:** traffic does not overtake or plan routes, and can queue behind a vehicle the player
  leaves in a lane (agents stuck for 8 s out of sight are moved). AI autos have no visible
  driver. Pedestrians don't react to danger, gunfire or the horn, and can't be hurt. No police
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
- **APK loading of the city is untested**: the APK now serves the game through
  `WebViewAssetLoader` at `https://appassets.androidplatform.net/assets/game/` with file access
  off (TD-16), but that code (a react-native-webview patch and shell changes) has not been
  compiled or run here (no Android SDK). The CI job `android-smoke` checks it on an emulator;
  until it passes, treat APK loading as unverified.
- **Performance:** about 270–300 draw calls and 290k triangles with everything on screen. Fine on
  the emulator's desktop GPU; unknown on phones. Each pedestrian is a full skinned character.
- **Bundle:** 6.1 MB (16 Nov, night; was 8.1 MB). The character and animations are optimised by
  `npm run optimize:assets` (607 KB together, was 1,985 KB) and embedded as base64 (TD-3); the
  world is no longer in the script (TD-16). Checked in the browser: the optimised character
  loads, walks and animates with no errors.
- **Not built:** inventory or shops, more weapons, settings screen (including a mute switch),
  interiors, weather, day/night.
- The release APK is signed with the debug keystore and built for arm64 only.
