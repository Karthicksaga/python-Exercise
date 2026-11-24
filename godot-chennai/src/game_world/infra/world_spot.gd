class_name WorldSpot
extends RefCounted
## A street spot from `infra.bin` (format 2.1, G-153): a pedestrian crossing or a speed breaker,
## on a road's centre line. Mapped from OSM (`highway=crossing`, `traffic_calming=*`) or placed
## by the build's simple rules (`mapped` false: zebras on every arm of a junction with signals,
## breakers near the main-road end of some side streets), which are invented.

## &"zebra", &"signal_crossing", &"unmarked", &"bump", &"hump", &"table", &"cushion",
## &"rumble_strip".
var kind: StringName = &"zebra"
var position: Vector2 = Vector2.ZERO
## Direction of the road at the spot, atan2(dx, dz) (0 = towards +Z).
var yaw: float = 0.0
## Carriageway width there, metres.
var width: float = 0.0
## The road's id (way id × 10 + piece of the way), as in `roads.bin`.
var road_id: int = 0
var mapped: bool = false

const BUMPS: Array[StringName] = [&"bump", &"hump", &"table", &"cushion", &"rumble_strip"]
const ZEBRAS: Array[StringName] = [&"zebra", &"signal_crossing"]


func is_bump() -> bool:
	return BUMPS.has(kind)


func is_zebra() -> bool:
	return ZEBRAS.has(kind)


## Unit vector along the road (x, z).
func direction() -> Vector2:
	return Vector2(sin(yaw), cos(yaw))
