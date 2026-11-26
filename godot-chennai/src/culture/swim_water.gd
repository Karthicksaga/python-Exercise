class_name SwimWater
extends RefCounted
## Where the water is, for swimming (G-484): the sea (coastline and outline of `WorldSea`) and the
## rivers and canals (`WorldWaterway`, centre line and width, as the map draws them). Asked about a
## world point it says what water is there, how deep inside its banks the point is, and the way to
## the shore. Pure logic; the waterways come from a Callable so the wiring can read the city layout.
##
## Depth is how far a point is from the nearest bank or shore: positive in the water, negative on
## land. It is the swimmer's "depth" for the safe limits: the sea has a rope line (`sea_limit`
## metres out), a river keeps the swimmer inside its banks, and nothing is ever deeper than a
## swimmer can stand (the map's water is a thin sheet: G-152).

## Segments of the coast within this distance of the cache centre are kept, metres.
const COAST_WINDOW := 400.0
## The cache is rebuilt when the query moves this far from its centre.
const COAST_REFRESH := 120.0
## Beyond this distance from any swimmable water a query returns null.
const REACH := 40.0


## One answer.
class Sample:
	extends RefCounted
	## &"sea", &"river" or &"canal".
	var kind: StringName = &""
	## Metres inside the water from the nearest shore or bank; negative on land.
	var depth: float = 0.0
	## The nearest point of the shore or bank (world metres).
	var shore: Vector2 = Vector2.ZERO
	## Unit vector from the shore into the water.
	var inward: Vector2 = Vector2.ZERO
	## The water surface's height.
	var surface: float = 0.0

	func in_water() -> bool:
		return depth > 0.0


var rules: CultureData.Swim
var sea: WorldSea = null
## (point: Vector2, radius: float) -> Array[WorldWaterway] near the point.
var waterways: Callable = Callable()

var _coast_centre: Vector2 = Vector2(INF, INF)
var _coast_a: PackedVector2Array = PackedVector2Array()
var _coast_b: PackedVector2Array = PackedVector2Array()


static func make(swim_rules: CultureData.Swim, world_sea: WorldSea, waterways_near: Callable) -> SwimWater:
	var w := SwimWater.new()
	w.rules = swim_rules
	w.sea = world_sea
	w.waterways = waterways_near
	return w


## The swimmable water nearest to a point (the one the point is deepest in, else the closest), or
## null when none is within REACH. Kinds the rules do not list, tunnels and drains are not water here.
func sample(point: Vector2) -> Sample:
	var best: Sample = null
	if rules.kinds.has(&"sea") and sea != null:
		best = _sea_sample(point)
	if waterways.is_valid():
		var found: Variant = waterways.call(point, REACH + 60.0)
		if found is Array:
			for item: Variant in found as Array:
				var w := item as WorldWaterway
				if w == null or w.tunnel or not rules.kinds.has(w.kind):
					continue
				var s := _river_sample(point, w)
				if s != null and (best == null or s.depth > best.depth):
					best = s
	if best == null or best.depth < -REACH:
		return null
	return best


func _river_sample(point: Vector2, w: WorldWaterway) -> Sample:
	var pts := w.points
	if pts.size() < 2:
		return null
	var best_d := INF
	var best_c := Vector2.ZERO
	for i in pts.size() - 1:
		var c := Geometry2D.get_closest_point_to_segment(point, pts[i], pts[i + 1])
		var d := point.distance_to(c)
		if d < best_d:
			best_d = d
			best_c = c
	var half := w.width * 0.5
	var s := Sample.new()
	s.kind = w.kind
	s.depth = half - best_d
	s.surface = rules.river_surface
	var out := (point - best_c)
	if out.length() < 0.001:
		# On the centre line: any bank will do.
		out = Vector2.RIGHT
	out = out.normalized()
	s.shore = best_c + out * half
	s.inward = -out
	return s


func _sea_sample(point: Vector2) -> Sample:
	if sea.outline.size() < 3 or sea.coast.size() < 2:
		return null
	_refresh_coast(point)
	var best_d := INF
	var best_c := Vector2.ZERO
	for i in _coast_a.size():
		var c := Geometry2D.get_closest_point_to_segment(point, _coast_a[i], _coast_b[i])
		var d := point.distance_squared_to(c)
		if d < best_d:
			best_d = d
			best_c = c
	if is_inf(best_d):
		return null
	var dist := sqrt(best_d)
	var wet := Geometry2D.is_point_in_polygon(point, sea.outline)
	var s := Sample.new()
	s.kind = &"sea"
	s.depth = dist if wet else -dist
	s.surface = rules.sea_surface
	s.shore = best_c
	var toward_shore := (best_c - point)
	if toward_shore.length() < 0.001:
		toward_shore = Vector2.RIGHT
	# Inward runs from the shore into the sea: away from the shore when the point is wet.
	s.inward = (-toward_shore.normalized()) if wet else toward_shore.normalized()
	return s


func _refresh_coast(point: Vector2) -> void:
	if _coast_centre.distance_to(point) < COAST_REFRESH:
		return
	_coast_centre = point
	_coast_a = PackedVector2Array()
	_coast_b = PackedVector2Array()
	var coast := sea.coast
	var reach := COAST_WINDOW + COAST_REFRESH
	for i in coast.size() - 1:
		var a := coast[i]
		var b := coast[i + 1]
		var c := Geometry2D.get_closest_point_to_segment(point, a, b)
		if point.distance_to(c) <= reach:
			_coast_a.append(a)
			_coast_b.append(b)


## True when a no-swim circle of the rules holds the point.
func forbidden(point: Vector2) -> bool:
	for z in rules.no_swim:
		if point.distance_to(Vector2(z.x, z.y)) <= z.z:
			return true
	return false
