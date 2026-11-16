# Realism plan: from prototype look to a realistic Tamil Nadu city

The user's brief of 17 Nov 2026 ("Visual transformation — photorealistic Tamil Nadu
environment"), with five reference photos: an MTC bus with motorbikes and autos on a flyover
road, a dense Chennai commercial street with autos and pedestrians, a blue low-floor MTC bus,
a queue of yellow autos with a scooter and a motorbike, and three scooters. This file is the
analysis and phase plan the brief asks for **before** any implementation. Status values follow
`development-roadmap.md`: nothing is marked done unless it was run and tested.

## 1. What the reference photos show (and what the game lacks)

| In the photos | In the game today |
|---|---|
| Dense, uneven street walls: 2–5 storey buildings of different heights and colours touching each other, deep shop fronts, signboards stacked up the facade, awnings, cables across the street | Real OSM footprints with estimated heights; procedural facade texture, shop fronts and Tamil signs (`FacadeKit`), but flat walls, one texture atlas, no stacked signs, no cables |
| Grey, worn asphalt with patching, dust at the edges, faded lane paint; black-and-yellow kerbs; concrete medians | Flat dark road colour, clean markings, painted kerbs on main roads |
| Yellow autos with black canopies (green band, rear number board), pink-and-yellow and blue MTC buses, commuter motorbikes, scooters, all with riders | Procedural extruded vehicles (`packages/vehicles/src/models.ts`): readable, but toy-like |
| Many pedestrians in lungis, shirts, sarees, salwar, school uniforms, helmets on riders | One placeholder humanoid (Ready Player Me sample, not licensed for release) recoloured |
| Hazy, bright overcast or harsh sun, low saturation, soft shadows | Golden-hour grading by default, fairly saturated |

## 2. Current rendering architecture (what we build on)

- Three.js in the Android System WebView (TD-1), Rapier physics; one bundled script (TD-3), the
  city streamed from 1,877 chunk files (TD-16).
- Per chunk: buildings merged into one walls mesh and one roofs mesh, one facade kit mesh,
  instanced trees, palms and tanks, ground meshes, street furniture, and now street props
  (merged, two meshes). Shared materials (TD-11).
- Quality tiers (`SceneRenderer.ts`): `lite` (tests: quarter pixels, no shadows), `low` (phones:
  1024 shadow map in a 40 m box round the player), `high` (desktop: 2048, MSAA, motion blur).
- Blender pipeline already exists for props: `tools/blender/*.py` → `assets/models` →
  `npm run optimize:assets` (meshopt, WebP 512 px) → embedded GLB (`StreetProps.ts`). **Blender is
  not installed on the CI host or in the cloud container**; it has to be installed (Blender 5.2
  LTS) where models are built.

## 3. Placeholder assets (all to be replaced)

| Asset | Where | Status |
|---|---|---|
| Player and every pedestrian | `assets/models/player.glb` (Ready Player Me sample) | not cleared for release; one body for everyone |
| All vehicles (hatchback, auto, motorbike, ambulance, bus, traffic) | `packages/vehicles/src/models.ts` | procedural primitives |
| Facades | `textures.ts`, `FacadeKit.ts`, `kitAtlas.ts` | procedural canvas textures, flat walls |
| Roads, pavements, ground | `GroundMeshes.ts` | flat colours and canvas textures |
| Trees and palms | `ChunkView.ts` | icosahedron crowns, simple palm |
| Sound | `packages/audio` | synthesised tones |

## 4. Performance: what is known and what is not

- **The 9–12 fps on the screenshots is not a phone measurement.** Those screenshots come from
  headless Chromium with **software rendering** (SwiftShader, CPU only) in the cloud container.
  On the CI Android emulator the game ran at 57–60 fps (`progress.md`). **No real phone has run
  the game yet**, so real performance is unknown.
- Measured load at Anna Nagar spawn, lite tier: 178 draw calls, 248k triangles (budget from
  TD-18: 230–300 draw calls, 300k triangles).
- Known costs that will grow with realism: every pedestrian is a full skinned character (one
  draw call and one skeleton update each); shadows redraw shadow casters a second time; each
  new PBR texture set (albedo, normal, roughness) is 3 textures per material.

## 5. Decisions needed from the user before Phase 5 (vehicles)

1. **Real brands and models.** The brief names Hero Splendor, Honda Activa, TVS Jupiter, Royal
   Enfield Classic, Maruti Swift and WagonR, Hyundai i10, Tata Nexon, Ashok Leyland and Tata
   trucks, and MTC buses. Their names, logos and recognisable body designs belong to those
   companies. Using them needs a licence (commercial games licence them). This project's rule
   (AGENTS.md, TD-18) is **original content**: we model each **type** at real proportions and
   with real detail (a 100 cc commuter motorbike, a 110 cc scooter, a 350 cc retro single, a
   compact hatchback, a tall-boy hatchback, a compact SUV, a medium truck with a cab-over
   cab, a city bus), but with our own body lines and no badges. They will read as "a Chennai
   commuter bike" or "a Chennai hatchback", not as a specific brand. **Changing this rule is the
   user's decision and needs licences first.**
2. **MTC livery.** MTC is a government corporation, but its name, logo and exact colour schemes
   are still its identity. Proposed: city buses in similar colour families (pink-and-yellow,
   blue-and-yellow) with an invented operator name and Tamil text, and no MTC logo.
3. **"Photorealistic, AAA".** A phone WebView renders far less than a console. The target is
   realistic-looking (real proportions, PBR materials, photographic CC0 textures, good
   lighting), measured against a 30 fps floor on a mid-range phone. Where realism and 30 fps
   conflict, frame rate wins, and it is reported.
4. **A test phone.** Phases 1 and 8 cannot be done without one: USB debugging, or a phone at a
   cloud device lab. Without it, "30 fps" cannot be claimed.

## 6. Phases (in the brief's order; each one: build, test, before/after screenshots, measured fps, files listed in `progress.md`)

| Phase | Scope | Depends on | Status |
|---|---|---|---|
| 1. Rendering performance | Phone profiling build (fps, frame time, draw calls, triangles, JS heap shown in the HUD with `?debug`); measure on a real phone at spawn, T. Nagar, Anna Salai. Then, by measured cost: pool and instance pedestrians (shared skeleton animations, impostors beyond 40 m), LOD for buildings beyond 120 m (no facade kit, merged roofs), shadow casters limited to near objects, KTX2/Basis textures (Android supports ETC2/ASTC), frustum and distance culling of chunk parts, AI updates at lower rate when far | a phone | planned |
| 2. Road materials | CC0 photographic asphalt, concrete pavement and kerb textures (ambientCG / Poly Haven, 512 px KTX2 on phones), worn edges, patches, drain covers and roadside drains along main roads, faded markings | Phase 1 budget | planned |
| 3. Chennai buildings | Facade modules made in Blender (shop-front bays with deep openings and roller shutters, window bays with grilles, balconies, sunshades, stair towers, terrace parapets) placed on the real OSM footprints by rule; stacked signboards; cables between poles; more variety per street | Blender on the build host | planned |
| 4. Player character | A realistic CC0 or self-made human (MakeHuman/MPFB in Blender, CC0 body, Mixamo-compatible rig), the existing retargeting (`retarget.ts`), and new clips (get in, drive, punch) | Blender | planned |
| 5. Tamil Nadu vehicles | Blender models per type (see decision 1 above), with interiors where visible through glass, glass and car-paint materials, separate wheel nodes; same `VehicleModel` interface; riders on two-wheelers; trucks, cycles and scooters in traffic | decisions 1–2 | planned |
| 6. Pedestrians and NPCs | 8–12 body and clothing variants (sarees, salwar, lungi, shirts and trousers, school uniform, shopkeeper, vendor, traffic police), pooled and instanced | Phases 1 and 4 | planned |
| 7. Lighting and environment | Daylight first (bright haze, lower saturation, neutral grading) with golden hour as an option; HDR environment map for reflections; realistic trees (rain tree, neem, gulmohar, coconut palm) as Blender models with LODs | Phase 1 | planned |
| 8. Final optimisation | Re-measure every scene on the phone; budgets per tier; fix regressions | a phone | planned |

The existing world is kept: OSM roads, footprints and positions, the chunk format, missions,
jobs, controls and the minimap. Only the visual assets around them change.
