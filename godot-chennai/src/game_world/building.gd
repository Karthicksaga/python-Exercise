class_name Building
extends RefCounted
## One building footprint from a chunk file (`Building` in `types.ts`).

## OSM way id.
var id: int = 0
## Footprint (x, z) in metres, anticlockwise seen from above, last point not repeated.
var outline: PackedVector2Array = PackedVector2Array()
## Metres: OSM `height`, else `building:levels` times a floor height, else estimated.
var height: float = 0.0
var floors: int = 0
## Where the height came from: &"height" (OSM), &"levels" (OSM floors) or &"estimated".
var height_from: StringName = &"estimated"
## &"house", &"apartments" or &"commercial".
var kind: StringName = &"house"
## Wall colour as 0xRRGGBB (invented; OSM has no colours).
var color_hex: int = 0


## Format 2 only (empty or defaults for format 1): courtyards (holes, opposite winding),
## height of the underside above ground, OSM building use and roof shape names, provenance.
var holes: Array[PackedVector2Array] = []
var min_height: float = 0.0
var use: StringName = &"unknown"
var roof_shape: StringName = &"unknown"
var dataset: int = 0
var source_id: int = 0
## Format 2.3 (`fusion.bin`, G-221): which dataset the footprint came from (&"osm", &"overture",
## &"google", &"microsoft"), the dataset Overture took it from, and the source's confidence
## (-1 when it gives none). `source_id` is then the row in that source's extract.
var fusion_source: StringName = &"osm"
var fusion_origin: StringName = &""
var confidence: float = -1.0


func color() -> Color:
	return Color.hex((color_hex << 8) | 0xff)


## Format 2.2 (`detail.bin`, G-190): what OSM maps beyond the chunk file, filled in by the chunk
## builder from `DetailTile`. -1 / empty = not mapped (the renderer then estimates).
var detail_roof: int = -1
var detail_material: StringName = &""
var detail_roof_material: StringName = &""
## Sign category (`SignCategories`) of what the building holds, 0 = none mapped.
var detail_category: int = 0
## A `building:part` polygon (drawn from `min_height` up, no ground-floor shops).
var is_part: bool = false
## Wall colour was mapped (`building:colour`), else `color_hex` is the estimated palette colour.
var wall_mapped: bool = false
## Roof kind chosen by the renderer (`BuildingMeshes.assign_roof`), -1 = not chosen yet.
var roof_kind: int = -1
## A shop, amenity or office is mapped here (detail_category is not a public place).
var detail_shop: bool = false
