# Migration prompt: the Chennai open-world game in Godot 4

Give this file to the agent that starts the Godot version. It is the complete brief: the decision,
what exists, what to reuse, the phases, the lessons already paid for, and the rules. Work starts
only when the project owner asks for it.

---

## 1. The decision and the goal
The project owner decided to move the Chennai open-world game from Three.js
(`chennai-open-world/`, a TypeScript game in an Android WebView) to **Godot 4**, built from scratch
in this folder, `godot-chennai/`, and migrated **phase by phase**. Each phase ends with an Android
APK the owner can install, green CI and screenshots. The Three.js game stays untouched and playable
until the Godot version reaches parity; do not modify `chennai-open-world/` (read it, reuse its data
and assets by copying or converting them).

The goal is the same game, more realistic: a real Chennai street map from OpenStreetMap, realistic
South Indian people and original vehicles, driving, walking, traffic, police, gangs, 21 story
stages, city jobs (taxi, courier, ambulance, bus), the suburban railway, on Android phones at a
steady frame rate.

## 2. Read first
1. Root `CLAUDE.md`, then this file, then `docs/concept/characters/README.md` and the four boards
   beside it (the intended cast).
2. The current game's knowledge: `chennai-open-world/AGENTS.md`, `README.md`,
   `docs/technical-decisions.md` (every TD: they are decisions and lessons, e.g. TD-2 coordinates
   +X east / -Z north, TD-6 kinematic character at a fixed 60 Hz step, TD-7/16/17 the streamed OSM
   world, TD-18 realistic original art, TD-20 Android only, TD-21 police, TD-22 weapons and gangs,
   TD-23 stations, TD-24 people, TD-25 strikes, TD-26 vehicles), `docs/progress.md`,
   `docs/handoff.md`, `docs/characters.md`, `docs/vehicles.md`.
3. The Godot skills in `.claude/skills/` (list and sources in `.claude/skills/GODOT_SKILLS_SOURCES.md`).
   Use them by task:

| Task | Skill |
|---|---|
| Folder layout, naming | `godot-project-organization` |
| Day-to-day gameplay code and reviews | `godot-gamedev`, `godot-gdscript` |
| Scenes, autoloads, instancing | `godot-nodes-scenes`, `godot-resources` |
| Camera, lights, environment, materials | `godot-3d-essentials`, `godot-shaders` |
| Characters and vehicles moving, collisions, raycasts (Jolt) | `godot-physics` |
| Animation trees, blends | `godot-animation` |
| HUD, touch controls, menus | `godot-ui-control` |
| Sound | `godot-audio` |
| Decoupled systems (missions, police, jobs) | `godot-signals-groups` |
| Tests that run headless and gate CI | `godot-gdscript-headless-testing` |
| Android APK export, CI export | `godot-export` |
| **Art direction, HUD and menus, screenshot review (this game)** | **`chennai-game-design`** (always, for anything visual) |
| Engine-neutral HUD/menu rules, safe areas, accessibility | `game-ui-ux` (with `godot-ui-control`) |
| Impact, juice, screen shake, hit-stop | `game-feel` |
| Chase and orbit cameras | `camera-systems` |
| Mission spaces, pacing, gating | `level-design` |
| Build-time generation in Python (world tools, archetypes) | `procedural-gen` |
| Buses, ducking, adaptive sound | `audio-design` |
| Frame time, draw calls, stutter (measure first) | `performance-optimization` |
| Touch actions, deadzones, rebinding | `input-systems` |
| Fixed step, interpolation, tunnelling, vehicle tuning | `physics-tuning` |

## 3. Toolchain and environment (verified in this cloud container, 23 Nov 2026)
- **Godot version: 4.7.2 stable** (latest stable on 23 Nov 2026; `4.7.2.stable.official.ed1daf0bf`).
  Pin it in `project.godot`, CI and the docs. Verified here on 23 Nov: headless run, and a
  Compatibility-renderer screenshot under xvfb (Mesa llvmpipe, OpenGL 4.5). Jolt is the default
  3D physics from 4.6. Download: `https://downloads.godotengine.org/?version=4.7.2&flavor=stable&slug=linux.x86_64.zip&platform=linux.64`
  (export templates: `slug=export_templates.tpz&platform=templates`); in the cloud container it
  is installed at `/opt/tools/godot` with `godot` on the PATH (not committed). The environment's
  network allows `downloads.godotengine.org` and its storage host.
- **Blender 5.2.4 LTS** verified headless here on 23 Nov (`/opt/tools/blender`, `blender` on the
  PATH; not committed).
- **Headless works** (`godot --headless --path .`): scripts, imports, tests, exports. Always run
  with `timeout`: a GDScript parse error leaves the scene without its script, nothing calls
  `quit()`, and the run hangs. Add `--audio-driver Dummy` (there is no sound card).
- **Screenshots:** `xvfb-run -a -s "-screen 0 1830x824x24"` with
  `--rendering-method gl_compatibility --rendering-driver opengl3` (Mesa llvmpipe), then save
  `get_viewport().get_texture().get_image()` as PNG. Software Vulkan (lavapipe,
  `mesa-vulkan-drivers`) runs the Mobile renderer but draws SKINNED meshes black, so judge
  characters with the Compatibility renderer here; the game itself targets the **Mobile**
  renderer on phones, and real-device or emulator checks come from CI and the owner.
- **Android:** export templates, JDK and Android SDK in CI (the GitHub runner has the SDK; see
  `.github/workflows/chennai-open-world.yml` and `chennai-open-world/scripts/android-smoke.mjs` for
  the existing emulator smoke test pattern). Debug keystore generated in CI, never committed.
- **Blender 5.2 LTS** (headless) for asset scripts: `chennai-open-world/tools/blender/*.py`, MPFB
  2.0.18 and the MakeHuman CC0 asset packs (see `chennai-open-world/docs/characters.md` for exact
  downloads). Never commit Blender, asset packs or Godot binaries.

## 4. What to reuse (and how)
| What | Where | Reuse |
|---|---|---|
| City data (roads, buildings, trees, areas, districts, places, rail) | `chennai-open-world/apps/game/public/world/` (`index.json`, `roads.bin`, `c/*.bin`, `rail.json`); formats in `packages/game-world/src/codec.ts`, `types.ts` | Port the decoders to GDScript or write a converter in `godot-chennai/tools/`; decide, write it down, test against known values from the TS tests |
| OSM build pipeline | `chennai-open-world/scripts/`, `packages/map-data` | Keep using it to produce the data; don't rewrite unless needed |
| People (37 + player) | `chennai-open-world/assets/models/people/*.glb`, `people.json`, `player.glb`; source `tools/blender/characters.py` | Load as-is first; extend the Blender script for the new cast (section 6) |
| Animations | `chennai-open-world/assets/animations/locomotion.glb` (Mixamo idle/walk/run) | Retarget in Godot (section 7 lessons) or bake per rig in Blender |
| Vehicles | `chennai-open-world/assets/models/vehicles/*.glb`, source `tools/blender/vehicles.py`, `auto_rickshaw.py`; seats, grips, cargo anchors, door hinges in `packages/vehicles` and `docs/vehicles.md` | Load as-is; keep the measured seat/grip/cargo data |
| Props, fonts, textures | `chennai-open-world/assets/` (licences in `assets/README.md`) | Copy with their licence rows |
| Game rules | `packages/missions` (stages, jobs, fares, goods), `packages/combat` (combat, wanted level, weapons, strikes), `apps/game/src/content.ts`, `streetWar.ts`, `laterStages.ts`, `cityJobs.ts` | Port the rules and the content tables faithfully; port their unit tests with them |

Keep the same coordinate convention and world scale so data, missions and positions carry over
unchanged.

## 5. Phases (each ends with: CI green, APK artifact, screenshots, docs updated)
0. **Foundation:** project skeleton (typed GDScript, Mobile renderer, landscape, touch), data and
   asset sync from `chennai-open-world`, headless test runner, CI workflow
   `.github/workflows/godot-chennai.yml` (paths `godot-chennai/**`: import, tests, Android export,
   emulator smoke), `AGENTS.md`, `README.md`, `docs/technical-decisions.md` (G-1, G-2...),
   `docs/progress.md`, `docs/handoff.md`.
1. **Walk around Chennai:** streamed real map (ground, roads with markings and yellow-black kerbs,
   buildings, trees) with no hitches while streaming; colliders; the player (MakeHuman) with
   natural idle/walk/run, third-person camera, touch joystick, run, jump; street name and FPS on
   the HUD; day lighting, haze, shadows near the player.
2. **Vehicles and driving:** hatchback (also taxi/police/gang cars), motorbike, auto-rickshaw,
   bus, ambulance; handling that matches the current game; entering and leaving with doors and
   seated riding poses; wheels and steering.
3. **Traffic and pedestrians:** AI traffic on the road graph with signals; pedestrians on
   pavements stepping round each other and the player; the cast by role (section 6).
4. **Missions and jobs:** objectives, HUD, saving, the 21 stages, city jobs, passengers boarding
   and alighting, goods handed over, ambulance stretchers.
5. **Police, combat, weapons, gangs:** wanted stars and police response, punches and bat swings
   with wind-up and visible hits, guns, gang turfs.
6. **Railway and the city:** trains on the Beach-Tambaram line with stations and crowds, the
   full-screen city map, sound, day/night and weather.
7. **Visual upgrade and release quality:** detailed shop fronts, awnings, signboards, sunshades,
   balconies, textured roads and pavements, better trees; performance on real phones; parity
   check against the Three.js game; then the owner decides when to retire it.

## 6. The people (from the concept boards)
- Grow the cast in the owner's phases: 20 base characters (10 + 10) to validate, then 60 (30 + 30)
  covering students, IT and office workers, drivers and transport, vendors and shopkeepers,
  workers and services, police and public safety, healthcare, families, elderly, children and
  teens, traditional and cultural, lifestyle; then 120 unique base characters; then 200-300
  variants from modular clothing, hairstyles, accessories and colours.
- Each character: rigged (one shared skeleton), idle, walk, run, sit and talk, an LOD for distance,
  GLB, phone budget (about 10k triangles near, 3.5k far, 512 px textures; the player more).
- Realistic South Indian look, natural skin tones, Chennai clothes (saree, veshti, lungi, salwar,
  chudidar, uniforms, office wear), no stereotypes.
- **Original only:** no brands or logos (the boards' "zomato" and other delivery logos become plain
  invented colours), no real insignia, school names or likenesses. Generated with MakeHuman/MPFB
  (CC0) in Blender by script; record every asset and licence.
- Children never in anything that can be hit, shot or hurt; only in station crowds and as
  passengers with an adult.

## 7. Lessons already paid for in the Three.js game (don't relearn them)
- **Retargeting A-pose MPFB rigs from T-pose Mixamo clips:** align whole hand frames and each
  finger joint, or every wrist bends about 70° inwards; then turn upper arms ~9° in towards the body
  (clips hold them 13-16° out, which looks wrong on MakeHuman shoulders). Plant soles per clip and
  during every gait blend (a sole sank up to 8.5 cm in the 0.22 s blends otherwise).
- **MPFB GLBs** carry a black vertex-colour channel; don't use it as albedo. Godot renames bones
  `mixamorig:X` to `mixamorig_X`. Arms rotate down about each arm bone's local Z axis.
- **Streaming:** nothing may simulate on ground that hasn't loaded: a fight that started before a
  chunk's walls existed sealed an enemy inside a building (CI, stage 15). Gate AI and combat on
  "chunks around the player are loaded".
- **Enemies and walls:** look for walls across the body's width; hollow building meshes don't stop
  a ray that starts inside them.
- **Feet, figures, fingers on grips** were all checked by tests measuring the real models; keep
  that kind of test.
- **Tests on slow CI runners:** wait in game time, never wall-clock time; a 40 s wall-clock wait
  failed when the runner played slower than real time. Don't aim at a stale position, and switch
  to a gun with ammo in scripted fights. Split slow suites into CI shards.
- **Main-thread loading stalls:** in CI the Three.js game advanced one frame in 10 s of real time while the player ran (chunk, model and texture decoding on the main thread); the owner felt the same lag on a phone. Load and decode in the background from the start (threaded `ResourceLoader`, `WorkerThreadPool`), build meshes and colliders in time-sliced steps, and test streaming under CPU throttle.
- **Performance:** the phone budget was about 230-300 draw calls and 300k triangles in dense
  streets; LOD switches for figures (30 m) and vehicles (28 m); first-use shader compiles and
  main-thread decoding cause hitches: warm shaders at load, stream and decode off the hot path.
- **Content rules:** original, CC0 or credited CC-BY assets only, licence rows for everything.

## 8. Working rules
- Branches `agent/godot-<topic>`; push at every milestone (`git push -u origin HEAD:agent/godot-<topic>`);
  only the coordinator merges. Commit messages end with the attribution lines the environment
  provides. No model identifiers in commits or docs.
- Never weaken or delete a test to make it pass; if behaviour changes on purpose, update the test
  and say why in the commit.
- Locally run the unit tests and the checks you touched; the full suite runs in CI.
- Look at your screenshots critically before reporting; say plainly what is weak or not done.
- Every phase's report: what works (checklist), CI status and APK artifact, test counts,
  screenshot paths, decisions taken (TD entries), what's not done.

## 9. World reconstruction: the owner's decision of 23 Nov 2026
The owner decided that the Chennai reconstruction plan applies to **this Godot version**, not
to the Three.js game: `suggestions/2026-11-23-chennai-city-reconstruction-blueprint.md` (audit,
datasets, licences, building/road/street/AI/Blender architecture, roadmap, open decisions) and
`suggestions/2026-11-23-chennai-real-trains-and-buildings.md` (Google 3D Tiles ruled out; open
height data; Tamil Nadu trains built in Blender by script). Both were written against the
Three.js code; take their data, licence and asset findings as they are and translate the runtime
parts as below. The blueprint's §21 decisions are still the owner's to make; ask before Phase 1
of the reconstruction work, and build the migration phases (§5) without waiting for them.

| Blueprint (Three.js) | In Godot |
|---|---|
| Keep compact per-chunk data and build meshes on the device; no GLB per building | Same rule. Port the chunk decoder (`codec.ts`) or convert to a Godot-friendly binary; build chunk meshes with `SurfaceTool`/`ArrayMesh` off the main thread (`WorkerThreadPool`), add to the scene when complete (§7 streaming lesson) |
| Codec v2 with a version number, archetype, height source, roof, provenance index | Add the version field in the first Godot reader too; the converter in `godot-chennai/tools/` writes v2 once the fusion step (below) exists |
| Data fusion in `tools/geo/` (Python: GDAL, GeoPandas, Shapely, DuckDB Spatial, PyProj), canonical GeoParquet with provenance | Unchanged: build-time Python, shared by both games while the Three.js one lives; output goes through the **same** `GeoProjection` (TD-2 coordinates) |
| Building archetypes as parameter sets + Blender kit pieces in one atlas, merged per chunk | Kit pieces as GLB scenes → meshes merged per chunk (or `MultiMeshInstance3D` for repeated pieces: tanks, windows, railings); one `StandardMaterial3D` per atlas |
| LOD0/1/2 as separate merged meshes per chunk | `GeometryInstance3D.visibility_range_begin/end` per LOD mesh (+ fade), Godot's automatic mesh LOD for kit pieces |
| Landmarks as single GLBs (5k–15k triangles) | Same GLBs, imported scenes with a `StaticBody3D` + simplified collision |
| Junction polygons, zebra/speed breakers from OSM, surface profiles, decals | Junction meshes via `SurfaceTool`; markings and potholes as `Decal` nodes only near the player (decals cost on Mobile) or baked into the road texture; condition as a vertex attribute read by a road shader |
| Decks and ramps for flyovers, physics trimesh | `ConcavePolygonShape3D` per deck (Jolt), road heights for traffic and pedestrians from day one (the Three.js AI assumed y = 0) |
| KTX2/Basis textures | Godot's VRAM compression (ETC2/ASTC for Android) on import; no extra runtime |
| Per-layer chunk distances (ground, buildings, kerbs, props, parked vehicles, traffic) | Child nodes per layer with their own `visibility_range_end`; props and furniture only near the player |
| Photo-assisted reconstruction (SAM 2, PaddleOCR, COLMAP) | Unchanged: build-time only, own imagery, human review; nothing at run time |
| Trains: ICF EMU, AC EMU, WAP-7 + LHB, Vande Bharat by Blender script, budgets per LOD | Same models (Phase 6), imported GLBs with LODs via visibility ranges |
| Tests: fusion (pytest), codec round trip, archetype determinism, triangle budgets, reference screenshots | GUT/headless GDScript tests for the reader and builders; Compatibility screenshots at the same reference places; pytest stays for `tools/geo` |

**Owner's answers (23 Nov 2026):**
- **Scope (updated by the owner, 23 Nov): Chengalpattu to Pulicat.** The world runs from
  Chengalpattu in the south (≈12.68°N) to Pulicat and Ponneri at the Tamil Nadu border in the
  north (≈13.45°N, the exact edge follows the state border at build time), and from about
  79.95°E (Chengalpattu, Sriperumbudur side) east to the coast: roughly 80–85 km × 40 km, about
  25–30× today's 117 km² box. It covers all of Chennai, the airport (§11), Tambaram and the GST
  Road, Ennore port and Pulicat Lake; Tada (Andhra Pradesh) is a possible later extension. All in
  Tamil Nadu, so the openstreetmap.fr Tamil Nadu extract remains the single OSM source.
  Engine requirements from day one (Foundation is told): a **floating origin** (recentre the
  world on the player; float32 precision far from the origin), a **regional index** (e.g. 10 km
  tiles, each with its own chunk table and roads, streamed; today's single `index.json` and
  `roads.bin` would be 30–50 MB at this size), bounds always read from data, a cheaper **rural
  look** (fields, scrub, lakes, highways) and the **far-city layer** (§11) for distance and flight.
  Build order: today's box first (parity), then grow outward in rings (whole city, then the
  suburbs and corridors, then the rural edges), each ring with its coverage report and phone
  check.
- **Keep the same structure as the existing game.** The Godot project mirrors the Three.js game's
  modules with the same names and boundaries under `godot-chennai/src/`: `game_engine`,
  `game_world`, `map_data`, `physics`, `player`, `vehicles`, `ai`, `combat`, `missions`, `rail`,
  `audio`, `ui`, plus a composition root like `apps/game` (the main scene wires systems and holds
  no gameplay logic, like `Game.ts`). Same data formats and 250 m chunk streaming, same coordinates
  (TD-2) and scale, same game flow (loading screen → title menu → play), same content tables.
- Still open (blueprint §21): real business names on signs (TD-18 forbids them today), the
  imagery source, the Open Buildings licence choice, the pilot neighbourhoods.

Ordering: the migration phases in §5 come first (the game must run in Godot), and the
reconstruction work joins at Phase 1 (world) as data and tools, then Phase 7 (visual upgrade) for
kits, archetypes, roads and landmarks. The chunk reader is written once, versioned, so the richer
data drops in without a rewrite.

## 10. Proposed and built solutions to carry into Godot (owner, 23 Nov 2026)
The owner decided that the solutions designed for the Three.js game, built or only proposed,
are implemented in the Godot version during the migration. Each line's spec is the decision and
code on the named branch (read with `git show origin/<branch>:chennai-open-world/<path>`; the
Three.js TD numbers below are in that branch's `docs/technical-decisions.md`). Port the
behaviour and its tests, not the code.

| Solution | Spec (branch, decision) | Godot phase |
|---|---|---|
| Honest loading screen (real steps, no fake percentage), title menu over the live city, pause menu that never clips, Back routing, QUIT | `agent/loading-screen` (PR #13), TD-25 | 0 (boot) and 1 (HUD); polish in 7 |
| Phone lessons from the loading screen: nothing loops while loading, no full-screen fades over the first frames, a frame between load steps, a diagnostic panel if loading is slow | `agent/loading-screen`, TD-25 "On a phone" | 0–1 |
| Chunks built a few ms per frame, shown when complete (the ride stutter fix) | `agent/gameplay-fixes` `eaf40d0` | 1 |
| Chase camera that eases instead of snapping in on every obstacle | `chennai-game-design` §5 | 1–2 |
| Crash ejection: bike and auto riders thrown off on hard impacts, car drivers through the windscreen at high speed, damage by impact speed | `agent/crash-ejection` (unfinished WIP), TD-29 | 2 |
| Carjacking: stop a traffic car/auto/bike, pull the driver out, take it, a crime | `agent/carjacking` (merged into `agent/gameplay-fixes`), TD-30 | 3 (needs traffic) |
| Crowd density by place and hour (busy beaches, markets, stations; quiet lanes) within the draw budget | `agent/crowd-density` (unfinished WIP), TD-31 | 3 |
| Sound design: every vehicle kind its own engine and horn, placed traffic, footsteps, city ambience by hour and place, mix buses. **Owner (23 Nov): real recorded sounds, not synthesis** — engines as recorded RPM loops crossfaded and pitched by rpm and throttle, recorded horns, doors, sirens, impacts, footsteps and Chennai street ambience. Sources: Wikimedia Commons and OpenGameArt, CC0 preferred, CC-BY with attribution, never NC/ND (the owner chose not to provide a Freesound API key). Synthesis only as a fallback for kinds with no acceptable recording, listed for the owner | `agent/sound-design` (PR #14), TD-26 for the design; recordings replace its synthesis | 6 (wave 5) |
| Combat redesign: pedestrians in fights, visible moves, hit reactions, block and dodge, telegraphed enemies, lock-on | `agent/combat-redesign` (PR #15), TD-27 | 5 |
| Wanted level: heat that builds before a star for street incidents; killed officers stay dead and new units come from out of sight | `agent/police-tuning` (unfinished), TD-28 | 5 |
| Real Chennai reconstruction (open data heights, archetypes, kits, roads, decks, landmarks) | §9 and the blueprint | 1 (data, tools), 7 (visuals) |
| Real Tamil Nadu trains (EMU, AC EMU, WAP-7 + LHB, Vande Bharat) by Blender script | `suggestions/2026-11-23-chennai-real-trains-and-buildings.md` | 6 |

The unfinished branches are specs to finish in Godot, not code to merge. Where a spec was never
tested end to end (the WIP branches), design the tests first in Godot.

## 11. New vehicles and the airport (owner, 23 Nov 2026)
The owner asked for a realistic airport with aeroplane flying, a helicopter, a race car and
premium cars. Rules that apply to all of them: **original designs only** (no real makes, models,
badges, airline names or liveries: TD-18 of the Three.js game; invented airline colours),
built in Blender by script like the other vehicles, phone budgets with LODs, licences recorded.

| What | Scope | Phase |
|---|---|---|
| **Premium cars** (an original luxury saloon, SUV and sports coupé) | Parked in richer districts and as rare traffic; drivable with their own handling (faster, grippier, quieter engines); stealable like any car; a garage to keep the ones the player owns | 2 (vehicles), traffic use in 3 |
| **Race car** (original open-wheel or GT design) | Very high grip and speed; races as city jobs or events: a street circuit (the Island Grounds area, where Chennai held a street race in 2024, is inside the map) and point-to-point races on arterials at night; checkpoints, opponents on the racing line, timing, rewards | Car in 2; races in 4 (missions/jobs) |
| **Helicopter** | Takes off from helipads (airport, a hospital roof, a police station); arcade-realistic flight (collective up/down, cyclic tilt, yaw), auto-hover when the stick is released, landing gear contact, crash when it hits buildings fast; touch controls designed for it (`input-systems`, `chennai-game-design` §3) | New phase 6b, after the railway |
| **Aeroplane and the airport** | Chennai International Airport (Meenambakkam) from OSM: runways, taxiways, aprons, terminals, the ATC tower (aeroways are mapped in OSM); a small original airliner and a light aircraft; taxi, take-off, climb, turn, approach and land; ground handling on the runway (Jolt body with custom lift, drag and thrust forces, `physics-tuning`); a simple flight HUD (speed, altitude, heading, attitude) | New phase 6b |

What this needs beyond the vehicles themselves:
- **World scope:** the airport is inside the Chengalpattu–Pulicat world (§9), in the ring after
  the current box.
- **Seeing the city from the air:** a far-city layer (merged low-poly district blocks, or
  impostors) streamed beyond the 250 m chunk radius when flying, so the city doesn't vanish into
  fog at altitude; chunk streaming follows the aircraft's ground track with look-ahead.
  Performance budgets apply at altitude too (`performance-optimization`).
- **Physics and camera:** high-speed and flight cameras (`camera-systems`), continuous collision
  for fast bodies, crash rules per vehicle (crash ejection, §10, extended to aircraft as a crash
  and respawn).
- **Police and missions:** wanted level reacts to stealing aircraft and flying low over the city;
  aircraft can't be flown in early stages (unlock through missions or a pilot job).

