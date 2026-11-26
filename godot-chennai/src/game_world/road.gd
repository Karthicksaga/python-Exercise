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
## Format 2 roads come in pieces split at tile edges: piece number, metres along the whole road
## to this piece's first point, and the whole road's length (-1 when the file has the whole road).
var piece: int = 0
var offset_along: float = 0.0
var total_length: float = -1.0
## Format 2 extras: OSM highway class, bridge, tunnel, layer, ref ("NH 48").
var highway: StringName = &""
var bridge: bool = false
var tunnel: bool = false
var layer: int = 0
var ref: String = ""
## Format 2.1 (`infra.bin`, G-150): height of the road surface above the ground every
## `height_step` metres along this piece from its first point, the last sample at its end; empty
## when the road lies on the ground. Estimated by rule at build time (OSM maps no heights).
var heights: PackedFloat32Array = PackedFloat32Array()
var height_step: float = 5.0
## Distance along this piece to each point (set with the heights).
var along: PackedFloat32Array = PackedFloat32Array()

## Arterial roads that get verges, avenue trees and lane markings (`MAIN_ROADS`).
const MAIN_KINDS: Array[StringName] = [&"primary", &"secondary", &"tertiary", &"motorway"]


## Attaches the height samples (decoder only, before the road is shared between threads).
func set_heights(samples: PackedFloat32Array, step: float) -> void:
	heights = samples
	height_step = step
	along = PackedFloat32Array()
	along.resize(points.size())
	var run := 0.0
	for i in points.size():
		if i > 0:
			run += points[i - 1].distance_to(points[i])
		along[i] = run


## True when any part of this piece is off the ground (a deck, a ramp or an embankment).
func is_raised() -> bool:
	return not heights.is_empty()


## Height of the surface at distance `d` along this piece (0 on the ground).
func height_along(d: float) -> float:
	if heights.is_empty():
		return 0.0
	var last := heights.size() - 1
	var k := clampi(floori(d / height_step), 0, last - 1)
	var span_end := minf((k + 1) * height_step, along[along.size() - 1]) if not along.is_empty() else (k + 1) * height_step
	var span := maxf(span_end - k * height_step, 1e-4)
	return lerpf(heights[k], heights[k + 1], clampf((d - k * height_step) / span, 0.0, 1.0))


## Height at fraction `t` of segment `i` (points[i] -> points[i + 1]).
func height_at(i: int, t: float) -> float:
	if heights.is_empty():
		return 0.0
	return height_along(lerpf(along[i], along[mini(i + 1, along.size() - 1)], t))


func is_main() -> bool:
	return MAIN_KINDS.has(kind)


func length() -> float:
	var total := 0.0
	for i in range(1, points.size()):
		total += points[i - 1].distance_to(points[i])
	return total
