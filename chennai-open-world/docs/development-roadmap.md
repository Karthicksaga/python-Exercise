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
