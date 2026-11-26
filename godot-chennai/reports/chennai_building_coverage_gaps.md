# Chennai Building Coverage & Gap Analysis (Post-100 Mapping)

**Dataset:** `391,283` OSM buildings across `47` tiles mapped by [map_buildings.py](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/tools/buildings/map_buildings.py) against the `100` GLB archetypes in [catalog.json](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/assets/buildings/pack_100/catalog.json).

---

## 1. Global Mapping Summary

| Metric | Count | Share |
|---|---:|---:|
| **Total OSM Buildings** | `391,283` | `100.00%` |
| **Matched for Replacement (`proposed_glb_swap`)** | `386,910` | `98.88%` |
| **Retained Procedural (`retain_procedural`)** | `4,264` | `1.09%` |
| **Excluded Protected (`excluded_protected`)** | `109` | `0.03%` |

- **Why `4,264` buildings remain procedural:**
  - `3,158` failed geometry/floor/style matching bounds (`no_style_or_scale_match`, score < `0.56` or aspect/floor gap > tolerance).
  - `1,104` are tiny auxiliary structures `< 14 m²`, `roof`/`shed`/`garage` tags, or oversized structures `> 125 m` (`minor_or_oversized_gap`).
  - `2` floating skybridge/upper building parts (`min_height > 0`).

---

## 2. Zone Breakdown

| Urban Zone | Matched | Retained Procedural | Protected | Notes |
|---|---:|---:|---:|---|
| **Residential** | `331,349` | `2,127` | `60` | Strong house coverage; outer suburb tiny houses heavily reuse low-rise variants |
| **Industrial** | `28,407` | `1,301` | `11` | `1,301` retained industrial footprints lack small MSME shed variants (`8–18 m`) |
| **Commercial** | `12,942` | `468` | `31` | High match in shop corridors; gaps on irregular/odd-floor commercial blocks |
| **North Chennai** | `6,689` | `53` | `3` | Good North Chennai coverage (`N01–N05`, `K03`, `K04`, `CHN_036`) |
| **Mixed-Use** | `3,948` | `46` | `0` | T. Nagar / Nungambakkam / Parrys shops+apartments |
| **Coastal** | `3,105` | `42` | `3` | Marina / Besant Nagar / Thiruvanmiyur covered by `C01–C05`, `B45` |
| **Institutional** | `470` | `227` | `1` | High `32.5%` gap rate (`227 / 698`): large school/hospital footprints often mismatch template sizes |

---

## 3. Unused & Over-Reused Archetypes (Quality & Variation Risks)

### A. 7 Unused Archetypes in `pack_100`
1. `B17_hospital_multi` (`30×40 m 5F`) — shadowed by closer floor/size matches (`B47_hospital_tower` / commercial mid-rises).
2. `B29_bus_depot` (`60×90 m 1F`) — OSM bus depot footprints rarely carry `use=transport` + exact `60×90 m` bounds simultaneously.
3. `B31_temple_hall` (`40×60 m 1F`) — `0` placements because **all `91` OSM `use=religious` structures are strictly protected**.
4. `B35_museum_heritage` (`50×60 m 2F`) & `B37_rotunda_historic` (`20×20 m 1F`) — oversized/circular footprints not present in generic `commercial` OSM tags.
5. `CHN_043_duplex_pergola` (`12×16 m 2F`) & `CHN_047_row_modern` (`6×14 m 2F`) — out-scored by `B05_duplex_house` and `B04_compact_urban` at identical dimensions.

### B. Over-Reused Archetypes & Style Skew
- `B02_old_residential` (`68,321` instances, `17.7%` of all replacements) and `B05_duplex_house` (`37,343` instances) carry heavy load across `Outer Suburbs` (`212,416` matched buildings) because `97.8%` of OSM footprints have estimated default `floors = 2`.
- **`CHN_017_thatch_house` absorbed `20,626` small (`~4–7 m`) urban footprints**: because it was one of the few `< 6×9 m` `1F` footprints available outside North Chennai, small urban RCC houses (`1–2F`) need compact `4×8 m` to `6×10 m` concrete flat-roof variants in the next 200 pack so rustic thatch roofs do not appear in dense inner suburbs!

---

## 4. Priority Targets for the Next 200 Assets

To eliminate repetition and fill the `4,264` retained + skewed footprints cleanly:

1. **Compact Urban Concrete Houses (`4×8 m`, `5×10 m`, `6×10 m`, `1–2F`) — ~35 variants:** Replaces the `20,626` small footprints currently falling onto `CHN_017_thatch_house`.
2. **Everyday 2–6F Narrow Commercial Strips (`5×12 m` to `10×20 m`) — ~40 variants:** Needed for `Flower Bazaar (6,095)`, `Parrys Corner (4,279)`, `T. Nagar`, and arterial roads.
3. **7–14F Mid-High Rise Residential Towers — ~25 variants:** Closes the gap between `5F` (`B08`) and `16F` (`B42`) where `> 500` OSM apartments sit (`7–14F`).
4. **Small & Mid-Scale Industrial Sheds / Godowns (`8×15 m` to `18×28 m`, `1–2F`) — ~35 variants:** Closes the `1,301` retained industrial gaps in **Ambattur, Guindy, Manali, Vikram Sarabhai Industrial Estate**.
5. **Mid-Sized Neighbourhood Schools, Clinics, Marriage Halls (*Kalyana Mandapam*) (`14×22 m` to `24×35 m`, `2–3F`) — ~30 variants:** Closes the `227` (`32.5%`) Institutional gap rate.
6. **Suburban Flat-Roof Variations (OMR / Tambaram / Avadi / Velachery `2F` diverse colours & gates) — ~35 variants:** Reduces visual monotony where `B02` + `B05` currently account for `> 105,000` matches.
