# Progress (godot-chennai)

<!-- Data agent section. Other agents append their own sections. -->

## Data: world tools and format 2 (agent/godot-data, 23 Nov 2026)

Done:
- [x] `tools/geo/` (Python, typed, 43 pytest tests, `tools/geo/run_tests.sh`, no network).
- [x] Projection port, checked against `projection.ts` to 1 cm (G-21).
- [x] Format-1 port (`codec_v1.py`): today's 1,877 chunks and `roads.bin` re-encode byte for byte.
- [x] World boundary Chengalpattu–Pulicat from the OSM Tamil Nadu polygon, committed (G-22).
- [x] Pipeline: fetch (manifest with sha256 and OSM timestamp) → boundary → osmium clip → parse
      (multipolygons, aeroways, rural landuse/natural, coastline) → rings → tiles → format 2.
- [x] Format 2 designed, documented with byte layouts (`docs/world-format.md`) and built:
      `godot-chennai/world/`, all 4 rings, 37.5 MB, 190 files, 47 tiles (G-23 to G-26, G-29).
- [x] Coverage report: `world/REPORT.md` (whole world, by ring) and `world/reports/<tile>.md`.
- [x] Ring 0 reproduces today's world within 1–2 % (test); converter paths v1 → v2 and
      OSM → v1 (G-27).
- [x] Fusion step (Overture footprints + Open Buildings heights) designed and tested on
      fixtures; not run (hosts not allowed) (G-28).

Measured (OSM 2026-11-23T00:28:57Z, whole world):
- 391,283 buildings (908 multipolygon parts, 844 with courtyards); heights estimated 97.8 %,
  `building:levels` 2.2 %, `height` 103. Roof shape tagged on 45. Rings: 0 107,098, 1 268,840,
  2 13,998, 3 1,347 (OSM barely maps buildings outside the city: fusion is needed there).
- 151,851 road pieces (residential 114,784, service 20,258, primary 4,298, tertiary 4,379,
  secondary 2,254, footway 3,263, track 1,992, motorway 616, raceway 7 — the Irungattukottai
  circuit). Tags: lanes 2.3 %, width 0.1 %, surface 6.2 %, bridge 1.4 %, layer 1.7 %, tunnel 0.2 %,
  maxspeed 1.2 %, name 13.8 %.
- Airport (Meenambakkam) present: runways 07/25 and 12/30 with widths, 160 taxiway ways,
  15 aprons, 5 terminals, 104 gates, 36 hangars, 12 helipads, windsocks; Tambaram air station too.
- 7,804 areas (water 1,644, residential 1,331, park 1,290, saltpan 288 round Ennore and Pulicat,
  forest 334, farmland only 136); 417,486 trees (1,315 mapped).
- Geometry: 358 slivers dropped, 1 footprint repaired.

Not done / weak: see `handoff.md` "Data".
