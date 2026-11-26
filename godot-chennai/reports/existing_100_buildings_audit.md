# Existing 100 Building Assets Audit Report

**Project:** `godot-chennai` (Godot 4.7.2 · Mobile Renderer · Android Target)  
**Scope:** Full repository inspection + reconciliation of the 11 uploaded building catalogue sheets and generated `pack_100` GLB library.

---

## 1. Repository State Before Integration

### A. Existing Complete Custom-Built Hero Landmarks (`8` Protected `.glb` Models)
Locked in [protected_buildings.json](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/data/protected_buildings.json) (never overwrite or replace):

| Landmark ID | Name | OSM Refs | File Path | Asset Status |
|---|---|---|---|---|
| `anna-nagar-tower` | Anna Nagar Tower | `way/651861526`, `node/295552094` | `assets/landmarks/anna-nagar-tower/anna-nagar-tower.glb` | Complete Hero GLB (LOD0–2 + COL) |
| `chennai-central` | Chennai Central | `way/214739119`, `way/217845073` | `assets/landmarks/chennai-central/chennai-central.glb` | Complete Hero GLB (LOD0–2 + COL) |
| `chennai-egmore` | Chennai Egmore | `way/209558519`, `way/209558528`, `way/209558533` | `assets/landmarks/chennai-egmore/chennai-egmore.glb` | Complete Hero GLB + `512 px` atlas |
| `chennai-lighthouse` | Chennai Lighthouse | `way/1552618806`, `way/211436935` | `assets/landmarks/chennai-lighthouse/chennai-lighthouse.glb` | Complete Hero GLB (LOD0–2 + COL) |
| `generic-mall-royapettah` | Shopping complex | `way/154030370` | `assets/landmarks/generic-mall-royapettah/generic-mall-royapettah.glb` | Complete Hero GLB (LOD0–2 + COL) |
| `kapaleeshwarar-temple` | Kapaleeshwarar Temple | `way/1548155931` (+13 temple parts) | `assets/landmarks/kapaleeshwarar-temple/kapaleeshwarar-temple.glb` | Complete Hero GLB (LOD0–2 + COL) |
| `kathipara-junction` | Kathipara Junction | `way/280718090` | `assets/landmarks/kathipara-junction/kathipara-junction.glb` | Road Flyover Overlay GLB + `512 px` atlas |
| `ripon-building` | Ripon Building | `way/27618298` | `assets/landmarks/ripon-building/ripon-building.glb` | Complete Hero GLB (LOD0–2 + COL) |

### B. Sample Prototype & Runtime Procedural Buildings
- **Prototype sample:** [chennai_mixed_354245383.glb](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/assets/buildings/samples/chennai_mixed_354245383/chennai_mixed_354245383.glb) (`way/354245383`, 4F Anna Nagar mixed-use, `2,682` LOD0 tris, `512×512` albedo + emissive atlases).
- **Procedural city runtime:** `391,283` OSM building footprints across `47` tiles in `world/tiles/*/chunks.bin`, extruded procedurally in [building_meshes.gd](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/src/game_engine/city/building_meshes.gd).

---

## 2. Audit of the 11 Uploaded Catalogue Sheets

The 11 `.jpg` contact sheets provided by the user contain **2D visual reference cards** (not raw `.glb`/`.tscn` binaries):

| Source Sheet Group | Cards Listed | Unique Entries | Notes & Deduplication |
|---|---:|---:|---|
| Batch 1–4 (`01–40`) | 40 | 40 | Residential (`01–10`), Commercial (`11–20`), Industrial/Public (`21–30`), Heritage (`31–40`) |
| North Chennai (`N01–N05`) & Beachside (`B01–B05`) | 10 | 10 | George Town, Kasimedu, Port, Royapuram, Marina, Elliot's Beach |
| Batch 5 Modern (`41–50`) | 10 | 10 | IT Parks, High-Rise, Mega Mall, SEZ, Metro, Hospital, Hotel, Terminus, Stadium |
| Koovam & Streetscapes (`K01–K11` + 11 props) | 11 | 8 buildings + 3 infra | `K01` River, `K02` Bridge, `K07` Canal are non-building infra; 11 bottom props |
| Catalogue Batch `1/30` (`CHN_001–CHN_010`) | 10 | 0 net new | Preview duplicate of `CHN_001–CHN_010` in Batch `1/15` |
| Catalogue Sets 1–3 (`CHN_001–CHN_060`) | 60 | 60 | `CHN_001–040` Traditional Houses + `CHN_041–060` Modern Houses & Apartments |
| **Total Across Uploaded Sheets** | **141** | **120 numbered + 11 Koovam** | **Visual reference quality only** (required parametric 3D `.glb` synthesis) |

### TD-18 Compliance & Exclusion Findings
- Cards `13–20`, `41–50`, `N01` depict real commercial brand/institution names (`Tata Motors`, `Saravana Stores`, `Tidel Park`, `Indian Bank`, `Kauvery`, `Apollo`, `SRM`, `Airtel`, `SBI`, `AGS`, `The Park`, `Phoenix Marketcity`, `Chepauk`). Per [AGENTS.md](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/AGENTS.md) **TD-18**, all shipped textures strip brand names and use generic Tamil/English shop boards (`மளிகை / GROCERY`, `தேநீர் கடை / TEA SHOP`, `மருந்தகம் / PHARMACY`, `பேக்கரி / BAKERY`).
- Cards `31–35`, `39` reflect heritage hero styles; style-archetype `.glb`s (`B31..B40`) are built for style coverage without ever overwriting the **8** locked hero landmarks.

---

## 3. Built 100-Archetype Blender GLB Library (`assets/buildings/pack_100/`)

Generated in parallel across 5 specialized subagent shards using **Blender 5.3.0** (`bmesh` + linear vertex-coloured PBR geometry) via [chennai_kit.py](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/tools/blender/buildings/chennai_kit.py) + `shard_1.py`–`shard_5.py` and indexed in [catalog.json](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/assets/buildings/pack_100/catalog.json):

- **Total 3D Models:** **`100` complete Blender-built `.glb` files** (`27.39 MB` total geometry across all 100 files).
- **Per-Model Structure:** Every `.glb` exports sculpted `LOD0`, `LOD1`, `LOD2`, and `COL_*` collision boxes (`820` to `5,596` LOD0 triangles; `32` to `240` tris in `LOD2`).
- **Mobile Shading:** Pure linear `COLOR_0` vertex-coloured PBR materials (zero extra image textures required, keeping Mobile Adreno 613 texture VRAM overhead near zero, matching `chennai-central` / `ripon-building`).
- **Per-Archetype Sculpted Details:** Compound walls + wrought-iron / wooden-slat gates, potted plants, raised plinths/thinnai seating, 3D Mangalore barrel-tile canopies, recessed shuttered windows + chajjas, perforated `jaali` parapets + arched pediments, stilt parking piers, glass balconies, factory chimneys, transformer gantries, Dravidian gopuram tiers, minarets/onion domes, stadium floodlights, and stilt lifeguard towers.
- **Category Breakdown (`100` models):**
  - **Residential (`44`):** `B01–B08`, `B10`, `B42`, `K06`, `K08`, plus `32` distinct variants from `CHN_001–CHN_059` (`Agraharam`, `Mylapore Traditional`, `Nalukettu`, `Madras Terrace`, `Colonial Bungalow`, `Duplex`, `Builder Floor`, `Gated Villa`, `Walk-Up`).
  - **Mixed-Use & Commercial (`17`):** `B09`, `B11–B16`, `B19`, `B20`, `B41`, `B43`, `B44`, `B48`, `K05`, `K09`, `K11`, `CHN_058`.
  - **Institutional & Public (`14`):** `B17`, `B18`, `B25–B30`, `B38`, `B46`, `B47`, `B49`, `B50`, `K10`.
  - **Heritage & Cultural (`9`):** `B31–B37`, `B39`, `B40`.
  - **North Chennai (`7`):** `N01–N05`, `K03`, `K04`, `CHN_036` (North/canal housing).
  - **Coastal (`6`):** `C01–C05` (`B01–B05` beach pack), `B45`.
  - **Industrial & Utilities (`4`):** `B21–B24`.
