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

Ordering: the migration phases in §5 come first (the game must run in Godot), and the
reconstruction work joins at Phase 1 (world) as data and tools, then Phase 7 (visual upgrade) for
kits, archetypes, roads and landmarks. The chunk reader is written once, versioned, so the richer
data drops in without a rewrite.

