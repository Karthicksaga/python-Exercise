class_name Road
extends RefCounted
## One road centre line from `roads.bin` (`Road` in `types.ts`).

## OSM way id (can exceed 32 bits).
var id: int = 0
## &"primary", &"secondary", &"tertiary", &"residential", &"service" or &"footway".
var kind: StringName = &"residential"
## "" when the road has no name.
var name: String = ""
## Carriageway width in metres (OSM `width`, else lanes times a lane width, else estimated).
var width: float = 0.0
## Traffic lanes in all, or -1 when the file has none (then estimate from the width).
var lanes: int = -1
var oneway: bool = false
## Centre line (x, z) in metres.
var points: PackedVector2Array = PackedVector2Array()

## Arterial roads that get verges, avenue trees and lane markings (`MAIN_ROADS`).
const MAIN_KINDS: Array[StringName] = [&"primary", &"secondary", &"tertiary"]


func is_main() -> bool:
	return MAIN_KINDS.has(kind)


func length() -> float:
	var total := 0.0
	for i in range(1, points.size()):
		total += points[i - 1].distance_to(points[i])
	return total
