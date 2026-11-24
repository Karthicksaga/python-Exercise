# App size: what the APK holds, the diet, the budget and the forecast

Decisions G-240 to G-243 (`technical-decisions.md`). Numbers are bytes stored in the APK
(compressed, what the download costs), in MB of 1,000,000 bytes, unless a column says unpacked.

## 1. Method

- **Local export, as CI does it.** The Android export templates (4.7.2.stable, from
  `downloads.godotengine.org`) were installed in the build container, the project imported
  (`godot --headless --import`) and exported with the real `export_presets.cfg`:
  `godot --headless --export-release "Android" out.apk` (CI also uses `--export-release` for the
  phone APK and `--export-debug` for the emulator smoke APK). The container has no Android SDK, so
  the export ran with `package/signed=false` and stub `apksigner`/`zipalign`/`adb` files in a fake
  SDK folder; the committed preset keeps `signed=true`. A signature adds a few KB.
- **Local and CI differ by about 3 %.** On the commit before this work the CI artifact
  (`godot-chennai-apk`, run 45374097425) was **157.88 MB**; the same export here, unsigned, was
  **162.68 MB** (+4.8 MB). Both are given below; use the CI figure for decisions, and the local
  numbers for differences between two local exports (those are exact).
- **Breakdown.** An APK is a zip: `unzip -lv` gives stored and unpacked bytes per entry. Imported
  assets are stored as `assets/.godot/imported/<name>-<hash>.<ext>`; each was mapped back to its
  source file through the `path=` lines of the `.import` files. `tools/apk_size_report.sh [apk]
  [N]` prints the same table (groups and the N biggest entries; the CI job prints it in the job
  summary).
- Textures, audio and GLB scenes are not further compressed by the zip (deflate saves 0 to 3 % on
  them), so stored size is about unpacked size for those; the world `.bin` files deflate to half.

## 2. Breakdown of the APK before the diet (local release, arm64-v8a, 162.68 MB file)

| Part | Files | Stored MB | Unpacked MB | Share |
|---|---|---|---|---|
| People, current cast (`assets/people/*.glb`, 63 models, LOD1 inside each) | 143 | 51.74 | 51.85 | 32 % |
| People, legacy Three.js cast (`assets/people/legacy`) | 151 | 39.16 | 39.17 | 24 % |
| World tiles (`world/tiles`: `chunks.bin` 12.6, `roads.bin` 5.7, `tile.json` 0.6, others) | 235 | 19.65 | 38.66 | 12 % |
| Godot runtime, arm64 (`lib/arm64-v8a/libgodot_android.so`) | 2 | 24.48 | 72.49 | 15 % |
| `docs/` (4 concept-art WebP) shipped by accident | 8 | 5.15 | 5.15 | 3 % |
| Vehicles (own models) | 97 | 4.77 | 4.86 | 3 % |
| World v1 (`assets/world`: 1,877 chunk files, roads, index, rail) | 1,880 | 3.35 | 4.91 | 2 % |
| City textures (`assets/city`: facade, ground, kit, glows; ETC2) | 12 | 3.16 | 3.16 | 2 % |
| Legacy vehicles | 25 | 2.46 | 2.47 | 2 % |
| `classes.dex` (Godot's Kotlin glue) | 1 | 1.79 | 5.14 | 1 % |
| Landmarks (6 models, LODs) | 25 | 1.74 | 1.78 | 1 % |
| Trains | 70 | 1.34 | 1.37 | 1 % |
| Aircraft | 21 | 0.89 | 0.91 | 0.5 % |
| GDScript (`src/`, binary tokens) | 391 | 0.84 | 0.96 | 0.5 % |
| Audio (61 Ogg, 60 short WAV as QOA) | 243 | 0.80 | 1.00 | 0.5 % |
| Everything else (fonts 0.18, animations, props, manifests, project) | | ~1.0 | | 0.6 % |
| **Zip entries** | | **162.14** | | |

By file type: imported GLB scenes 102.1 MB, `.bin` data 22.3, native library 24.5, WebP (docs) 5.2,
PNG textures 3.2, dex 1.8, JSON 0.9, GDScript 0.8, Ogg 0.5, WAV 0.3.

**What the cast costs per person (63 current models, 0.82 MB each in the APK):** vertex data
(8.1k vertices x about 60 bytes: positions, normals, UVs, 4 joints and weights, shadow copy) 0.52 MB,
the authored LOD1 and Godot's generated LODs 0.06, **five animations 0.10 MB (identical skeleton
and clips in every file)**, index buffers 0.08, two WebP textures 0.03.

### After the diet (local release, arm64-v8a)

| Part | Stored MB |
|---|---|
| People, current cast | 51.74 |
| Godot runtime arm64 | 24.48 |
| World tiles | 19.65 |
| Vehicles + legacy motorbike | 5.05 |
| City textures | 3.16 |
| dex | 1.79 |
| Landmarks | 1.74 |
| Trains | 1.34 |
| Aircraft 0.89, `src` 0.84, audio 0.80, v1 roads/index/rail 0.72, player model 1.88, rest ~1.0 | ~6.1 |
| **File** | **115.00** |

## 3. The diet, step by step (local release arm64 file size, before and after)

| Step | Before | After | Saved | Test |
|---|---|---|---|---|
| (a) Legacy people out except `people.json` and `player.glb` (saves 37.3: 39.2 minus the player's 1.9), legacy vehicles out except the motorbike (2.2), `docs/*` out (5.2, concept-art WebP shipped by accident). `exclude_filter` patterns `assets/people/legacy/[a-z]*`, `po*`, `legacy/a*`, `b*`, `h*` | 162.68 | **118.01** | **44.67** | `test_export_size.gd` |
| (a3) v1 world chunks (`assets/world/c/*`) out: the APK always carries `world/`, `main.gd` uses v1 only without it | 118.01 | **115.00** | 3.0 | `test_the_regional_world_ships_and_the_v1_chunks_do_not` |
| (b) VRAM compression of textures | already on | | 0 | `test_asset_budget.gd` |
| (c) Audio to Ogg Vorbis | already done | | 0 | `test_asset_budget.gd` |
| (d) GLB data | measured, nothing cheap left (see below) | | 0 | `test_asset_budget.gd` |
| (e) World tiles | measured, not changed (see below) | | 0 | |
| **Total** | **162.68** | **115.00** | **47.68 (29 %)** | |

CI figures (before 157.88 MB) are filled in section 8 once the run on this branch has finished.

The legacy folders stay in the repository byte for byte (`sync_from_threejs.py --check` is green:
1,978 files match). Only `export_presets.cfg` (`exclude_filter`, both presets) leaves them out of
the APK; the filter has no negation, so it lists first letters. **What the game loads from them**
(found by reading `people_manifest.gd`, `player_controller.gd`, `vehicle_catalog.gd`, all `res://`
strings, and by resolving every cast and vehicle through the real code in the test):

- `assets/people/legacy/player.glb` (`PeopleManifest.DEFAULT_PLAYER`) and `people.json`
  (`PeopleManifest.LEGACY`, read by `test_retarget.gd` only; shipped because it is 12 KB).
- `assets/vehicles/legacy/motorbike.{json,glb}` and `_lod1.glb` (the only motorbike model: the type
  has no model of its own). The other legacy vehicles are fallbacks for models that now exist
  (`bus` for `bus_city`, `hatchback` for the premium cars): `VehicleCatalog.manifest_for` stops at
  the first model with a GLB. Tests that read legacy manifests directly (`test_vehicle_catalog`,
  `test_vehicle_handling`) run from the repository, where the files are still present.

`tests/unit/test_export_size.gd` fails if: the two presets exclude different files; a legacy file
would ship that is not on its list (a new file from the sync tool must be excluded or justified);
shipped code, scenes or data name an excluded file; any person, fare figure or vehicle model the
catalogs resolve (with its LODs and manifest) is excluded; the regional world or its data files are
excluded or missing from `include_filter`. It was checked to fail when `player.glb` is put in the
filter.

### (b) Textures: already VRAM compressed

All five city textures import with `compress/mode=2` (VRAM compressed, ETC2 on Android;
`rendering/textures/vram_compression/import_etc2_astc=true` is set), the kit atlas included: the
1024 x 1024 atlas costs 1.40 MB, its glow partner 0.70 MB (ETC2 RGB), facade/ground 0.35 MB each.
The OSM-detail atlas of 1024 x 2368 will cost about 3.2 MB plus 1.6 MB for its glow partner, not 26 MB:
the 26 MB is the uncompressed GPU size, which VRAM compression already avoids. Textures embedded
in GLBs are stored by the scene importer as portable compressed textures (the 1024 x 1024 player
skin is 1.7 of the player's 1.88 MB); the cast's own textures are 0.03 MB per person. No texture
was changed, so there are no before/after screenshots to compare; **nothing visible changed**. The
only lossless textures are three flat 512 x 512 vehicle palettes (0.2 to 0.4 KB each in the APK),
which the model tests compare swatch by swatch. `test_asset_budget.gd` keeps it that way: a
texture of 256 x 256 or more must be VRAM compressed, a GLB may not embed a texture over 1024 px
(today's largest: 1024 in the player and one aircraft LOD, 512 elsewhere).

ASTC 6 x 6 instead of ETC2 would shrink the three big city textures by about a third (0.9 MB) and
would not run on every GPU; not done.

### (c) Audio: nothing to convert

Every long sound is already Ogg Vorbis (the 61 beds and loops are 0.48 MB in all; the largest, the
crickets, is 57 KB: 10 s, mono, 22.05 kHz, q3). The 60 WAV files are 35 KB engine stand-ins that
import as QOA. When recorded sounds arrive, the rule (tested: no WAV over 200 KB) is Ogg Vorbis
mono 22.05 kHz q3 to q4 for beds (about 6 KB per second) and stereo 44.1 kHz q4 for music (about 16 KB
per second, 1 MB per minute).

### (d) GLB data

Measured over every shipped GLB: no `TEXCOORD_1` outside the legacy player (129 KB), no tangents, no
duplicate textures that matter (the 270 duplicate palette images in vehicles and trains are 4 to 6 KB
each and import as portable textures of the same few bytes), no 2K or 4K textures. Vertex colours
in the landmark GLBs are the one fat attribute (2.1 MB as float in the GLBs); Godot stores them as
bytes, so the APK holds the whole landmark set in 1.74 MB. Import options tried on one cast model
(stored size of the scene, 738,798 bytes): tangents off -0.3 %, shadow meshes off 0 %, generated
LODs off -7.4 % (-55 KB), animations off -14 % (-103 KB). **Not applied**, because each changes
what the phone draws or needs architecture work:

- *Generated LODs off* on the cast and vehicles that already author their LODs: about 4 MB. Needs a
  look at crowd frame time on a phone first.
- *One shared animation library for the cast*: the five clips are in every one of 63 GLBs; sharing
  them saves about 6.5 MB now and 0.1 MB per future person. It changes how the cast loads and how
  the people tests measure clips, so it belongs to the cast agent (suggestion for `godot-complex`).

### (e) World data

| Data | Raw MB | Deflate (the APK) | xz | zstd |
|---|---|---|---|---|
| `chunks.bin` (47 tiles) | 24.08 | 12.62 | 10.33 | n/a here |
| `roads.bin` | 11.00 | 5.70 | 4.85 | |
| `infra.bin` | 1.29 | 0.33 | 0.28 | |
| `areas.bin` | 0.60 | 0.45 | 0.42 | |
| `tile.json` | 1.70 | 0.55 | 0.43 | |
| **Total** | **38.66** | **19.65** | **16.30** | |

The data is already quantised to 5 cm and half of it is incompressible geometry; even xz saves only
17 % (3.3 MB), and the APK cannot use xz or zstd without a decoder in the reader. Quantising
further (10 cm) would save less than 10 % and show on building corners; dropping fields means a
format change owned by the data and fusion agents. **Left as it is.** Lossless gains for later: delta
and byte-plane transposition of the coordinate arrays before deflate (typically 15 to 25 % for
this kind of data), to be done in `tools/geo` with the fusion work, with a reader change.

### Other findings, not changed

- **The Godot runtime is the second biggest item** (24.5 MB stored, 72.5 MB unpacked per ABI):
  a custom export template without unused modules (3D physics other than Jolt, navigation, XR,
  unused image formats, text server fallback) typically saves 4 to 8 MB. Needs a template build
  in CI; not done.
- **Per architecture and build kind**, local, unsigned, same filters (MB of the file):

| | release | debug |
|---|---|---|
| arm64-v8a (the phone APK) | 115.00 | 116.81 |
| armeabi-v7a | 116.43 | |
| x86_64 (the emulator smoke APK is the debug build of this) | 116.36 | |
| x86 | 117.16 | |
| all four in one APK | 193.39 | 203.23 |

  One ABI costs 24.5 MB for arm64 and about 25.5 to 26.5 for the others; **a Play app bundle
  gives each phone only its own ABI**, so an `.aab` is the size of the arm64 line, not of the
  universal one. A debug APK is 1.8 MB (1.6 %) bigger than a release one here: the debug template
  carries the logging and editor-debug code. CI builds the phone APK with `--export-release`
  (despite the label "debug APK" in the task wording) and the x86_64 smoke APK with `--export-debug`.

## 4. Budget guard

`.github/workflows/godot-chennai.yml`, job `android`, step "APK size against the budget" (after the
uploads, so a failing APK can still be downloaded):

- prints the phone APK size and the smoke APK size in MB and the 25 biggest items
  (`tools/apk_size_report.sh`) in the job summary;
- **fails when the arm64 phone APK is over `APK_BUDGET_MB`** (workflow-level `env`, currently
  **260**, the one place to change);
- warns (`::warning::`) over `PLAY_BASE_LIMIT_MB` (200, Play's base-module limit).

260 MB is the agreed starting value: 2.3 times today's size, headroom for the forecast's middle case.
Lower it to 200 when the app bundle pipeline exists, or to today's size plus a margin to catch
accidental growth; the tests of section 3 catch the accidental ones earlier (a texture, a WAV,
an unreviewed legacy file) because they run on every push.

## 5. Forecast

Base: the CI size after the diet (about 110 MB; section 8 has the measured value). Additions are
the stored size in the APK; low and high are explicit about what they assume.

| Addition | Assumption (low / high) | Low MB | High MB |
|---|---|---|---|
| Hand-made landmarks | 50 / 100 models at 0.2 / 0.6 MB with LODs (today 6 models = 1.74 MB, 0.29 each) | 10 | 60 |
| Fused building data, outer rings (Overture, Microsoft, Google) | `chunks.bin` is 12.6 MB for OSM buildings; fusion adds 0.7x / 2.8x of that where OSM is sparse, deflate 2:1 | 9 | 35 |
| Recorded sounds | 100 clips and loops at 40 KB / 200 clips + 10 music tracks (3 min stereo, 2.9 MB) | 4 | 25 |
| Homes and about 45 props | 45 props at 50 KB / 300 KB; 10 / 50 home kits of 0.15 / 0.35 MB | 5 | 30 |
| Transit data (stops, routes, timetables) | JSON/binary, deflates well | 1 | 6 |
| More cast variants | +30 / +100 people at 0.82 MB (0.72 with shared animations) | 25 | 82 |
| Trains and stations | 2 / 8 more models (today 1.34 MB for 6) | 2 | 8 |
| UI, fonts (Tamil), misc textures, new tiles for ring growth | | 2 | 10 |
| **Total added** | | **58** | **256** |
| **APK, phone (arm64)** | base 110 + added | **~168** | **~366** |

Reading it: the low case fits Play's 200 MB base; the high case is 1.4 times the 260 MB budget and
blows past 200 MB. **The cast is the biggest uncertain line (up to 82 MB), then landmarks and fused
data.** Cheap measures that move the high case: the shared animation library (-6.5 MB now,
-10 MB at 100 more people), generated LODs off (-4 to -8 MB), a stripped Godot template (-4 to -8 MB),
the data transform of section 3(e) (-4 MB), 8-bit vertex colours in landmark GLBs (already bytes in
the APK). They are worth about 25 to 30 MB; the high case still needs asset packs.

## 6. Play Store limits and the plan if we go over

Limits as published by Google Play for Android App Bundles when this was written (from the brief
and memory; **check them on the current Play Console documentation before relying on them, the
container cannot reach it**): the base module is limited to **200 MB compressed download**; install-time
asset packs, fast-follow packs and on-demand packs each carry their own limits (about 1 GB per pack,
about 4 GB all together); a new app must be uploaded as an `.aab`, not an APK. The compressed download
is close to our APK size (models and textures do not compress further), and Play serves only the
phone's own ABI.

Plan, in the order it is needed:

1. **Move to an `.aab`** (`gradle_build/use_gradle_build=true`, `export_format=1`, a real keystore
   from Secrets) and measure the base module there. Needed anyway for Play; the APK stays for
   sideloading and the emulator smoke.
2. **Split by what is needed when**, each a Godot resource pack (`--export-pack` with an
   include/exclude preset, loaded by `ProjectSettings.load_resource_pack()` before the world
   opens), delivered as Play Asset Delivery packs:
   - base module: engine, code, UI, city textures, vehicles, player, the current ring-0 tiles;
   - **install-time pack `world`**: `world/tiles` (grows with fusion, about 20 to 55 MB);
   - **install-time pack `cast`**: `assets/people/*.glb` (50 to 130 MB), so the game never starts
     without the people it streams;
   - **fast-follow pack `landmarks`**: landmark GLBs and recorded sounds, fetched right after install
     (the game checks the pack state in the loading screen and is honest about it: "downloading
     landmarks");
   - **on-demand packs** for rings the player has not reached (tiles of ring 2 and 3 with their
     fused data) if the world data passes about 100 MB.
3. The CI guard then becomes two numbers (base module and total); `APK_BUDGET_MB` is lowered to the
   base module's share.
4. Until then: `PLAY_BASE_LIMIT_MB` warns at 200.

Not built: none of step 1 to 3 (no store upload is planned yet). The cast agent should know that the
cast, not the code, decides when this is needed.

## 7. Guards that keep the numbers

| Guard | Fails when |
|---|---|
| `tests/unit/test_export_size.gd` | an excluded file is loaded, a legacy file ships unreviewed, the presets disagree, the world data would not ship |
| `tests/unit/test_asset_budget.gd` | a 256 x 256 or bigger texture is not VRAM compressed, a WAV is over 200 KB, a GLB embeds a texture over 1024 px |
| CI step "APK size against the budget" | the phone APK is over `APK_BUDGET_MB` (warning over 200 MB) |

## 8. CI numbers

Filled in after the run on `agent/godot-sizediet` (see the report in `handoff.md`).
