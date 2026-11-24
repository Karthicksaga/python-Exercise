class_name MapRoads
extends RefCounted
## The road lines a map draws: pairs of points (segment 2i to 2i+1) in world metres, split into
## main roads (primary to tertiary) and side streets, so the minimap draws them in two weights.
## Built by the composition root from the world's road data (`MapRoadFeed`); the map only draws.

var major := PackedVector2Array()
var minor := PackedVector2Array()
## The centre and radius the lines were gathered for (metres).
var centre := Vector2.INF
var radius := 0.0


func is_empty() -> bool:
	return major.is_empty() and minor.is_empty()


func segment_count() -> int:
	return (major.size() + minor.size()) / 2


## Does this set still cover a view of `view_radius` metres round `at`?
func covers(at: Vector2, view_radius: float) -> bool:
	return centre != Vector2.INF and at.distance_to(centre) + view_radius <= radius
