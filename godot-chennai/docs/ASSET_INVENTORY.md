# Asset Inventory — Chennai Open World (`godot-chennai`)

> **Total `assets/` Disk Size:** ~173 MB | **Total `world/` Disk Size:** 38 MB | **Total `data/` Size:** 1.4 MB
> **Licensing:** Tracked in `assets/LICENSES.md` (CC0, CC-BY with attribution, original procedural/Blender assets, and ODbL 1.0 for OpenStreetMap). Checked in CI by `tools/sync_from_threejs.py --check`.

---

## 1. Summary by Directory

| Directory | Size | File Count | Contents & Format | Status |
|---|---|---|---|---|
| `assets/people/` | **133 MB** | 145 `.glb` | Blender character cast (students, auto/bus/cab drivers, vendors, police, office workers, elderly, children) + `legacy/` Three.js cast | Active; `legacy/` partially excluded in `export_presets.cfg`, needs APK size diet |
| `assets/vehicles/` | **11 MB** | 47 `.glb` + `.json` | Cars (`hatchback`, `sedan`, `saloon`, `suv`, `coupe`, `taxi`, `formula`), `auto_rickshaw`, `share_auto`, `ambulance`, `goods_carrier`, buses (`bus_city`, `bus_intercity`, `bus_lowfloor`, `bus_mofussil`, `bus_school`) + LOD1/LOD2 + `legacy/` | Active; manifests & LODs verified (`test_vehicle_models.gd`) |
| `assets/world/` | **9.1 MB** | Binary + JSON | Legacy Format 1 world (`index.json`, `roads.bin`, `rail.json`, `c/*.bin`) synced from Three.js | Active fallback (`--world=v1`); excluded from default Android export |
| `world/` | **38 MB** | 190 files (47 tiles) | Format 2 regional OSM world (Chengalpattu–Pulicat, 4 rings: `world.json`, `tiles/<c>_<r>/tile.json`, `chunks.bin`, `roads.bin`, `areas.bin`, `detail.bin`, `rail/rail.json`) | Active primary world (`RegionalWorldSource`) |
| `assets/landmarks/` | **5.6 MB** | 8 `.glb` + JSON | `anna-nagar-tower`, `chennai-central`, `chennai-egmore`, `chennai-lighthouse`, `generic-mall-royapettah`, `kapaleeshwarar-temple`, `kathipara-junction`, `ripon-building` + `index.json` | Active in play (`LandmarkModels`) |
| `assets/audio/` | **3.4 MB** | 147 files | `manifest.json`, `synthetic/` (procedural stand-ins), `standin/`, `rec/` (field recordings) | Active (`SoundLibrary`); Chennai field recordings incomplete |
| `assets/trains/` | **3.2 MB** | 30 `.glb` | ICF EMU (cab, motor, trailer), AC EMU, WAP-7 locomotive, LHB coach, Vande-Bharat-style nose & coach (LOD0/1/2) | Active (`Railway`) |
| `assets/aircraft/` | **1.4 MB** | 9 `.glb` + JSON | `airliner`, `helicopter`, `light_aircraft` (LOD0/1/2) | Models tested (`test_vehicle_models.gd`), **unused in gameplay** (Phase 6b) |
| `assets/city/` | **1.4 MB** | Textures + JSON + Font | `textures/` (`facade`, `facade_glow`, `roof_tiles`, `kit`, `kit_glow`, `ground`), `sign_categories.json`, `noto-sans-tamil-categories.woff2` | Active (`CityMaterials`, `ShopSigns`) |
| `assets/trees/` | **520 KB** | Atlas + JSON | 18 species × 3 LODs baked tree/understory atlas (`tools/trees/bake_tree_atlas.py`) | Active (`TreeKit`) |
| `assets/fonts/` | **348 KB** | 3 `.woff2` + `title/` | `noto-sans-tamil-signs.woff2`, `noto-sans-tamil-stations.woff2`, `noto-sans-devanagari-stations.woff2`, `OFL.txt` | Active (`TitleMenu`, `ShopSigns`, `Railway`) |
| `assets/animations/` | **236 KB** | 1 `.glb` | `locomotion.glb` (CC0 Quaternius locomotion clips) | Active (`LocomotionClips`, `Retarget`) |
| `assets/props/` | **224 KB** | 8 `.glb` | `ac_unit`, `awning`, `barrel`, `clay_pots`, `crates`, `dish_antenna`, `handcart`, `shop_shutter` | Active (`StreetProps`, `ChunkBuilder`) |
| `data/` | **1.4 MB** | JSON / GeoJSON | `MANIFEST.json`, `areas/*.json`, `boundary/world-boundary.geojson` | Active (geo pipeline & area palettes) |

---

## 2. Asset Pipeline & Tooling (`tools/`)

- **Three.js Sync:** `tools/sync_from_threejs.py` (byte-for-byte sync + `LICENSES.md` check).
- **Geo / OSM Builder:** `tools/geo/chennai_geo/` (Python CLI + 43 pytest tests).
- **Vehicle & Cast Blender Kits:** `tools/blender/vehicles/vkit.py` and `tools/blender/` (generates `.glb`, LODs, anchors, and `.json` manifests).
- **Texture & Tree Bakers:** `tools/bake_city_textures.gd` and `tools/trees/bake_tree_atlas.py`.
- **Automated Asset Checks:** `tests/unit/test_vehicle_models.gd` (1,648 checks across 22 models), `tests/unit/test_asset_budget.gd`, `tests/unit/test_asset_licences.gd`, `tests/unit/test_export_size.gd`.
