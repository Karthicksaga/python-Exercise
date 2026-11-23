class_name WorldSea
extends RefCounted
## The sea where the map has a coast (`Sea` in `types.ts`).

## Coastline from one map edge to another, land on its left (as in OSM).
var coast: PackedVector2Array = PackedVector2Array()
## The water's outline, reaching well past the playable edge.
var outline: PackedVector2Array = PackedVector2Array()
var source: String = ""
