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


func color() -> Color:
	return Color.hex((color_hex << 8) | 0xff)
