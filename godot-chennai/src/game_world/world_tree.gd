class_name WorldTree
extends RefCounted
## One tree from a chunk file (`Tree` in `types.ts`; named so it does not clash with Godot's Tree control).

## (x, z) in metres.
var position: Vector2 = Vector2.ZERO
## Size multiplier around 1.
var scale: float = 1.0
## &"osm" trees are mapped; &"generated" ones were added along avenues and in parks for looks.
var source: StringName = &"generated"
## Species silhouette: &"neem", &"rain", &"coconut", &"palmyra", or empty to pick by hash (G-312).
var species: StringName = &""
