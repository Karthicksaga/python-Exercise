# Development roadmap

Status values: **done** (built and tested as described in `progress.md`), **in progress**,
**planned**. Nothing is marked done on the strength of code alone.

| Phase | Scope | Status |
|---|---|---|
| 1. Technical foundation | Android project, rendering stack chosen and validated, runs on Android | done on the emulator; not yet on a phone |
| 2. Chennai map | OSM extract for ~1 km² of Anna Nagar, roads, building footprints, parks, chunk streaming, attribution | done (heights and facades are estimates) |
| 3. Player | Rigged character with animations, movement, camera, collisions | done with a placeholder model; no jump or interaction animations |
| 4. Vehicles | Car, auto-rickshaw and motorbike; enter/exit; driving controls; speedometer | done |
| 5. AI | Road graph from OSM; traffic, pedestrians, enemies | first version done; no signals, overtaking, pathfinding or reactions |
| 6. Game mechanics | Missions, money, health, fighting and shooting, saved progress | ten stages done; no inventory, police or wanted level |
| 7. Optimisation | Merged buildings and vehicles, instancing, streaming, quality tiers | partly done; no LOD, texture compression or phone profiling |

## Next steps, in order of value

1. **Run on a real phone** and profile. Everything about performance is unverified until then.
2. **Art pass:** a properly licensed character; photographed facade and ground textures
   (KTX2); a few hand-modelled landmarks (Tower Park tower, a temple gopuram); better vehicles.
3. **Sound:** recorded effects, footsteps, city ambience and music in place of the synthesised tones; a mute setting.
4. **Road detail:** kerbs, medians, junction markings, signals that traffic obeys.
5. **Deeper AI:** route planning, overtaking, pedestrians that cross and react, enemies that
   use cover, police and a wanted level.
   Combat animations (punch, aim, fall) belong with the art pass.
6. **More content:** more stages with story, shops to spend money in, a second neighbourhood
   (the chunk format and streaming already allow it).
7. **Serve assets through a WebView asset loader** so models and chunks stream from files
   instead of being embedded in the script (TD-3).

## City jobs brief (adopted 16 Nov 2026)

The user's six-part brief (real Chennai from Anna Nagar to Marina Beach and the start of ECR,
believable driving, Chennai traffic, everyday jobs, a golden-hour look, save and share) is
folded into this project. It keeps this project's stack and rules. Where the brief asks for
something different, this is what we do instead, and why:

| Brief says | Here | Why |
|---|---|---|
| Single HTML file, plain JavaScript | TypeScript packages, bundled into one script (`apps/game/dist`) | Strict types and package boundaries (AGENTS.md); the web build is already one page that can be hosted as one link |
| Download OSM in the browser, cache in localStorage | Extract fetched at build time and turned into chunks (`npm run build:world`) | Works offline on a phone; the public Overpass servers were overloaded on 16 Nov 2026 (502 on two mirrors); localStorage holds ~5 MB, too little for the city |
| No glorified violence | New content is jobs only. Stages 7–10 (fights) still exist | **Open question for the user:** keep, tone down or remove the fight stages |

Milestones, in order:

| Milestone | Scope | Status |
|---|---|---|
| J1. Jobs on the current map | Job board, ambulance run (siren clears traffic), courier (damage bonus), cab ride (fare by distance and rating), bus route (stops in order, timetable); start point, time limit, payout; failing costs money and reputation, not the game; result screen; crash detection with speed loss and a thud; gear indicator; ambulance and bus vehicles; share progress | done in the browser and on the emulator (10 jobs) |
| J2. The bigger city | Extract and chunks for Anna Nagar → T. Nagar → Anna Salai → Marina Beach → ECR start; OSM `height`/`building:levels` used, 2 floors when missing; coastline and sea plane; landmark models and labels (Anna Nagar Tower, Kapaleeshwarar Temple, Marina Beach, T. Nagar); chunks streamed from files (TD-3) because the city will not fit in one script; Marina evening drive job | in progress: city streamed from files and playable in the browser (106,619 buildings, 20,625 road pieces, 1,877 chunk files, 4.6 MB); sea and sea haze; gopuram model, city jobs, visited districts and APK loading still to do (see "J2 status") |
| J3. Chennai traffic | Signals at main junctions that traffic and the HUD obey; zebra crossings where traffic yields to pedestrians; buses and two-wheelers in traffic; density by time of day and by area (T. Nagar, Anna Salai heavier); time-of-day setting | done in the browser (no player penalty for red lights, no walk signals, no overtaking) |
| J4. The look | Golden hour by default, day/night cycle, light rain, sea haze, whitewashed walls and red-tile roofs, palms, draw distance per quality tier, cheap motion blur at speed (high tier only) | done in the browser and seen on the emulator; sea haze is a hook only; no street lights |
| J5. Driving feel | Drift at high speed, chase camera that looks ahead, gear-change sound | done in the browser |

J2 depends on Overpass being reachable (or a Geofabrik extract of Tamil Nadu filtered locally)
and on the asset loader: the target area is roughly 12 km × 9 km, about 100 times today's map.
Phone limits to respect: WebView memory (stream and dispose chunks), draw calls (merge per
chunk), and touch: every new control must fit beside GAS and BRAKE.

## J2 status (16 Nov 2026, evening)

Built and tested in the browser (details and measurements in `progress.md`): the city extract
(rebuilt from the openstreetmap.fr Tamil Nadu extract of 15 Nov, because Geofabrik was not
reachable), the streamed world files (TD-16), on-demand chunk loading with disposal, roads,
markings, parks and sand per chunk, the sea from the OSM coastline with sea haze, AI spawning
near the player, signals at main-road junctions and mapped OSM signals with only the nearby
ones drawn, a tiled minimap, and the original stages and jobs kept in Anna Nagar.

Left, in order: the gopuram model at Kapaleeshwarar (data and solids exist, no mesh yet); the
Marina evening drive and other city jobs; visited districts in the save and share text;
loading from the APK (not run: no Android SDK here; TD-16 says what to check); memory (the
whole-city road graph and signals are always loaded, heap about 110–125 MB versus 45 MB);
the open question about stages 7–10. The toolchain audit (`toolchain-audit.md`) proposes
replacing the interim Android file access with `WebViewAssetLoader`.

The city extract is git-ignored (58 MB). To rebuild it: `python3 -m venv .venv &&
.venv/bin/pip install osmium`; download `https://download.openstreetmap.fr/extracts/asia/india/tamil_nadu.osm.pbf`
(124 MB; Geofabrik's `southern-zone-latest.osm.pbf`, 560 MB, also works); then
`.venv/bin/python -I scripts/clip-city.py tamil_nadu.osm.pbf assets/osm/city/chennai-city.osm.json "openstreetmap.fr tamil_nadu extract" <timestamp from tamil_nadu.state.txt>`
(about 2 minutes); delete the download and the venv; `npm run build:world`.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| WebView GPU performance on low-end phones | Low frame rate, heat | Quality tiers, capped pixel ratio (done), instancing and merging, LOD, profiling on a real phone early in Phase 2 |
| WebGL blocklisted or old WebView | Game can't start | Clear error screen (done); minimum WebView version check later |
| OSM data lacks building heights, textures, interiors | World looks generic | Estimated heights and procedural facades now; photographed textures and landmark models next; never claim surveyed accuracy |
| Memory in a WebView (textures, geometry) | Renderer process killed | `onRenderProcessGone` handled (done); streaming budgets; compressed textures |
| Bundle size (8.1 MB now) | Slow first load | Loaded from the APK; later split Rapier and load world chunks on demand |
| Scope: an open-world game is years of content work | Never finished | Phases with playable milestones; no feature marked done before it is tested |
| Art: placeholder primitives | Doesn't feel like a game | Blender asset pipeline (glTF + KTX2) from Phase 3 |
| ODbL licence of OSM | Legal | Attribution in app, keep derived map data separable, document the extract date |
