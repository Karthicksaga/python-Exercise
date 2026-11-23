class_name Landmark
extends RefCounted
## A famous place that gets its own model or label (`Landmark` in `types.ts`).

## Stable id, e.g. "anna-nagar-tower".
var id: String = ""
## &"tower", &"temple", &"beach" or &"district".
var kind: StringName = &""
var name: String = ""
## (x, z) in metres.
var position: Vector2 = Vector2.ZERO
## Metres; 0 when it has none.
var height: float = 0.0
var levels: int = 0
## Radius of the solid footprint in metres; 0 when it has none.
var radius: float = 0.0
## Year it opened; 0 when unknown.
var opened: int = 0
## Where the position came from.
var source: String = ""
## Fields that are estimated rather than taken from OpenStreetMap, e.g. ["height", "levels"].
var estimated: PackedStringArray = PackedStringArray()
