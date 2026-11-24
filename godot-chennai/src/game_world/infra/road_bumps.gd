class_name RoadBumps
extends RefCounted
## Speed breakers (decision G-153): where they are and how high, node-free, for whatever reads
## the road's surface: the missions' fragile cargo (`crossed(from, to)` each step), traffic that
## slows for them, and the chunk builder that draws them and makes their colliders.
##
## From `infra.bin` spots: mapped OSM `traffic_calming=*` and invented ones placed by rule (near
## the main-road end of some side streets). Sizes are estimated (OSM does not map them): a bump
## 1.2 m across the travel direction and 10 cm high, a hump 3.7 m and 10 cm (IRC-style), a table
## 6 m and 8 cm, a cushion 1.8 m and 7 cm, rumble strips 2.4 m and 2 cm.

const SIZES := {
	&"bump": Vector2(1.2, 0.10), &"hump": Vector2(3.7, 0.10), &"table": Vector2(6.0, 0.08),
	&"cushion": Vector2(1.8, 0.07), &"rumble_strip": Vector2(2.4, 0.02),
}


class Bump:
	extends RefCounted
	var kind: StringName = &"bump"
	var position: Vector2 = Vector2.ZERO
	## Unit vector of the road's travel direction.
	var direction: Vector2 = Vector2.DOWN
	## Across the road (carriageway width), along the travel direction (the bump's length), and
	## the crest height, metres.
	var width: float = 0.0
	var length: float = 0.0
	var height: float = 0.0
	var road_id: int = 0
	var mapped: bool = false

	## Height of the bump's surface above the road at a point (0 off it): a cosine profile, a
	## flat top for tables.
	func surface_at(p: Vector2) -> float:
		var d := p - position
		var along := d.dot(direction)
		var across := absf(d.dot(Vector2(-direction.y, direction.x)))
		if across > width / 2.0 or absf(along) > length / 2.0:
			return 0.0
		return height * profile(along / (length / 2.0), kind)

	## Profile from -1 to 1 along the bump, 0 at the ends and 1 at the crest.
	static func profile(u: float, k: StringName) -> float:
		var a := absf(u)
		if a >= 1.0:
			return 0.0
		if k == &"table":
			return 1.0 if a < 0.5 else 0.5 + 0.5 * cos((a - 0.5) * 2.0 * PI)
		return 0.5 + 0.5 * cos(a * PI)


var layouts: CityLayouts


static func create(with_layouts: CityLayouts) -> RoadBumps:
	var b := RoadBumps.new()
	b.layouts = with_layouts
	return b


static func from_spot(sp: WorldSpot) -> Bump:
	var b := Bump.new()
	b.kind = sp.kind
	b.position = sp.position
	b.direction = sp.direction()
	var size: Vector2 = SIZES.get(sp.kind, SIZES[&"bump"])
	b.length = size.x
	b.height = size.y
	b.width = sp.width
	b.road_id = sp.road_id
	b.mapped = sp.mapped
	return b


## Speed breakers in a chunk (the chunk builder and tests).
static func in_layout(layout: CityLayout, cell: Vector2i) -> Array[Bump]:
	var out: Array[Bump] = []
	for sp: WorldSpot in layout.spots_in(cell):
		if sp.is_bump():
			out.append(from_spot(sp))
	return out


## Speed breakers within `radius` of a point.
func near(p: Vector2, radius: float) -> Array[Bump]:
	var out: Array[Bump] = []
	if layouts == null:
		return out
	var source := layouts.source
	var lo := source.cell_at(p - Vector2(radius, radius))
	var hi := source.cell_at(p + Vector2(radius, radius))
	var layout := layouts.layout_for(source.cell_at(p))
	for cx in range(lo.x, hi.x + 1):
		for cz in range(lo.y, hi.y + 1):
			for b in in_layout(layout, Vector2i(cx, cz)):
				if b.position.distance_to(p) <= radius + b.width / 2.0:
					out.append(b)
	return out


## Height of any bump's surface at a point (0 when on no bump).
func surface_at(p: Vector2) -> float:
	var h := 0.0
	for b in near(p, 8.0):
		h = maxf(h, b.surface_at(p))
	return h


## The bump crossed by a move from `from` to `to` (one physics step of a vehicle), or null: the
## segment passes the bump's crest line within the carriageway.
func crossed(from: Vector2, to: Vector2) -> Bump:
	var mid := (from + to) / 2.0
	for b in near(mid, from.distance_to(to) / 2.0 + 8.0):
		var a0 := (from - b.position).dot(b.direction)
		var a1 := (to - b.position).dot(b.direction)
		if (a0 < 0.0) == (a1 < 0.0) and absf(a0) > 0.01 and absf(a1) > 0.01:
			continue
		var t := 0.0 if absf(a1 - a0) < 1e-6 else a0 / (a0 - a1)
		var at := from + (to - from) * clampf(t, 0.0, 1.0)
		var across := absf((at - b.position).dot(Vector2(-b.direction.y, b.direction.x)))
		if across <= b.width / 2.0:
			return b
	return null
