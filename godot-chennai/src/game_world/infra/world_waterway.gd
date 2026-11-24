class_name WorldWaterway
extends RefCounted
## A river, canal, stream or drain centre line from `infra.bin` (format 2.1, G-152). OSM maps
## most rivers as lines (`waterway=*`); the width is OSM `width` where mapped, else estimated by
## kind (river 30 m, canal 18 m, stream 6 m, drain 3 m).

## Way id × 10 + clip piece.
var id: int = 0
## &"river", &"canal", &"stream", &"drain" or &"ditch".
var kind: StringName = &"river"
var width: float = 0.0
var name: String = ""
## In a culvert or covered: not drawn.
var tunnel: bool = false
var intermittent: bool = false
var points: PackedVector2Array = PackedVector2Array()
