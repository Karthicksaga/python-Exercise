# World data: attribution and licence

Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL) 1.0:
https://www.openstreetmap.org/copyright

- Source: `https://download.openstreetmap.fr/extracts/asia/india/tamil_nadu-latest.osm.pbf`, OSM data timestamp **2026-11-23T00:28:57Z**, downloaded 2026-11-23, sha256 `f6f3f7cd0e1161d0cecde6b3437a1d05d87f536f042413fcd8a0e4dddb289b01` (`data/MANIFEST.json`).
- The files in this folder are a Derived Database of OpenStreetMap under the ODbL. The way to
  rebuild them is offered with them: `tools/geo/` (the build scripts), `data/MANIFEST.json` (the
  dataset), `data/boundary/world-boundary.geojson` (the clip boundary, itself derived from the
  OSM Tamil Nadu relation), and `docs/world-format.md`.
- The game shows "© OpenStreetMap contributors" wherever the map is shown (a Produced Work).
- Invented, not from OSM, and called estimated: heights where `heightFrom` is not `height` or
  `levels`, road widths where `widthFrom` is `class`, wall colours, generated trees, landmark
  heights and footprints listed in each landmark's `estimated`.
- No other dataset is in these files yet. When Overture buildings (ODbL) or Google Open Buildings
  (chosen under ODbL, blueprint §21) are fused in, they are credited here.

## Building footprints from other datasets (format 2.3, `fusion.bin`)

OpenStreetMap stays the primary source: a footprint from another dataset is added only where OSM
has no building (docs/fusion.md). Each added building records its source.

- Overture Maps Foundation (ODbL for buildings), release 2026-11-18.0; extract downloaded 2026-11-24, sha256 `e19a97f03a270a57f96b9372555e95b07567ec6b108ea9c13eb19b75a4457e4f`; licence ODbL 1.0.
- Contains data from Google Open Buildings (ODbL); extract downloaded 2026-11-24, sha256 `d34d77ace17cee4987fc54cb95905b71c102c514f02ab7d2715982c37e13ef44`; licence ODbL 1.0 (chosen; also offered under CC BY 4.0).
- Microsoft Global ML Building Footprints (CDLA Permissive 2.0); extract downloaded 2026-11-24, sha256 `2580316f1e61383d94f46e82b63fb118f75e3dbf6f9a3e57b0cc2d793780582d`; licence CDLA Permissive 2.0.
- Heights of added buildings are estimated unless a source gives one (none of the three does in
  this box on the download date); `heightFrom` says which.
- Share-alike: the combined world files are a Derived Database under the ODbL 1.0 (docs/fusion.md
  "Licences"); CDLA Permissive 2.0 data may be combined into it.
