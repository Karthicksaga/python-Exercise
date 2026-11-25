class_name PeaceZones
extends RefCounted
## Places where some things are not allowed (G-471): the temple compound and forecourt. The rules
## are data (`CultureData.Zone.rules`), so a new place of worship is a row in `culture.json`, not code.
## Systems ask `allows(rule, point)` before they do something a peace zone forbids; none of them
## knows which zones exist. Pure logic.
##
## Rules: `violence` (blows, weapons), `wanted` (crimes are not reported, no police heat),
## `crash_effects` (sparks, glass, camera shake), `horn`, `boarding` (getting into a vehicle inside
## `walk_radius`), `take_over` (pulling a driver out), `run` (walking pace only), `swim`.

var zones: Array[CultureData.Zone] = []


static func from_data(data: CultureData) -> PeaceZones:
	var p := PeaceZones.new()
	p.zones = data.zones
	return p


## The zone holding a world point, or null. The nearest centre wins where zones overlap.
func zone_at(point: Vector2) -> CultureData.Zone:
	var best: CultureData.Zone = null
	var best_d := INF
	for z in zones:
		var d := point.distance_to(z.centre)
		if d <= z.radius and d < best_d:
			best = z
			best_d = d
	return best


func inside(point: Vector2) -> bool:
	return zone_at(point) != null


## Whether `rule` is allowed at a point (always true outside every zone). `boarding` is judged on
## the smaller `walk_radius` (the forecourt), the other rules on the whole zone.
func allows(rule: String, point: Vector2) -> bool:
	var z := zone_at(point)
	if z == null:
		return true
	if rule == "boarding" and point.distance_to(z.centre) > z.walk_radius:
		return true
	return bool(z.rules.get(rule, true))


## Metres from a point into the zone round it (negative outside), for the calm sound's fade.
func depth(point: Vector2) -> float:
	var best := -INF
	for z in zones:
		best = maxf(best, z.radius - point.distance_to(z.centre))
	return best
