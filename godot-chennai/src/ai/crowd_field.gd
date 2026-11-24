class_name CrowdField
extends RefCounted
## Crowds (TD-31, port of `ai/src/Crowds.ts` on `agent/crowd-density`): the people who stand,
## sit, talk and stroll near the player, as many as the place and hour call for. Not agents:
## each 32 m square has a fixed set of spots (made from the map the first time it is near, only
## once its ground has loaded, the same every visit), generated at the place's busiest and
## thinned by the hour (each spot has a rank: taken while the rank is below the hour's share).
## On pavements people stand beside the road (never on another road's carriageway) or stroll a
## few metres up and down it; on the sand they come in groups that sit in a ring, stand
## together or walk along the beach. They step out of the way of the player and vehicles.
##
## Children (G-18, brief §6): only as part of a family group at a station or on the sand (an
## adult beside them), and the cricket boy (role `play`) only on the sand; never alone on a
## pavement. Crowd people have no bodies and nothing drives through them (they make way and
## stand off the carriageway), so nothing can hurt them.
##
## Pure logic: the game draws the result (`CrowdFigures`).

const STAND := 0
const WALK := 1
const SIT := 2
const TALK := 3

## Side of a crowd square; drawn within RADIUS; beyond NEAR only FAR_SHARE of the spots; never
## more than CAP at once (nearest kept); at most NEW_CELLS new squares per call.
var cell: float = 32.0
var radius: float = 70.0
var near: float = 40.0
var far_share: float = 0.45
var cap: int = 90
var new_cells: int = 8

const MAKE_WAY := 0.5
const PAVEMENT_FROM := 1.0
const PAVEMENT_SPREAD := 1.3
const JUNCTION_CLEAR := 6.0
## Share of standing and walking per kind of place (the rest sit or talk).
const POSES := {
	&"beach": Vector2(0.3, 0.2), &"promenade": Vector2(0.4, 0.6), &"market": Vector2(0.45, 0.4), &"station": Vector2(0.55, 0.3),
	&"temple": Vector2(0.5, 0.35), &"main_road": Vector2(0.4, 0.55), &"street": Vector2(0.35, 0.6), &"lane": Vector2(0.3, 0.65),
}
## Kinds of place where a pavement spot may be a family (an adult with a child beside them).
const FAMILY_PLACES: Array[StringName] = [&"station"]
const FAMILY_SHARE := 0.18


class Spot:
	extends RefCounted
	## Stable number of the spot (its square and place in it): who it is, frame to frame.
	var key: int = 0
	var pos: Vector2
	var yaw: float = 0.0
	var pose: int = STAND
	var rank: float = 0.0
	## Picks the person drawn.
	var look: int = 0
	var kind: StringName = &"lane"
	var stroll: float = 0.0
	var speed: float = 1.0
	## A child beside an adult (`look` then picks among the children).
	var child: bool = false
	## The cricket boy (role `play`): on the sand only.
	var play: bool = false


## Someone to draw this frame.
class Person:
	extends RefCounted
	var key: int = 0
	var pos: Vector2
	var yaw: float = 0.0
	var pose: int = STAND
	## Walking pace, m/s (strollers).
	var speed: float = 0.0
	## Metres walked so far (picks the walk phase), for walkers.
	var walked: float = 0.0
	var look: int = 0
	var kind: StringName = &"lane"
	var child: bool = false
	var play: bool = false
	var distance: float = 0.0


var places: PlaceMap
## Optional: ready(Vector2) -> bool once the buildings round a point are in; solid(Vector2) ->
## bool inside (or within a step of) a building.
var ground_ready: Callable = Callable()
var solid: Callable = Callable()
var _cells: Dictionary[Vector2i, Array] = {}


func _init(place_map: PlaceMap) -> void:
	places = place_map


func cell_count() -> int:
	return _cells.size()


## The spots made so far (handed to the next area's field: spots depend only on the roads).
func take_cells() -> Dictionary[Vector2i, Array]:
	var out := _cells
	_cells = {}
	return out


func give_cells(cells: Dictionary[Vector2i, Array]) -> void:
	_cells = cells


func spots(c: Vector2i) -> Array:
	if not _cells.has(c):
		var list: Array = _pavement_spots(c)
		list.append_array(_sand_spots(c))
		var base := (((c.x & 0xfffff) << 20) | (c.y & 0xfffff)) << 10
		for i in list.size():
			(list[i] as Spot).key = base | (i & 0x3ff)
		_cells[c] = list
	return _cells[c]


func _in_cell(p: Vector2, c: Vector2i) -> bool:
	return floori(p.x / cell) == c.x and floori(p.y / cell) == c.y


func _is_solid(p: Vector2) -> bool:
	return solid.is_valid() and solid.call(p) == true


func _pavement_spots(c: Vector2i) -> Array:
	var centre := (Vector2(c) + Vector2(0.5, 0.5)) * cell
	var out: Array = []
	var seen: Dictionary[int, bool] = {}
	places.segments_near(centre, cell * 0.75, func(ri: int, i: int) -> bool:
		var key := ri * 65536 + i
		if seen.has(key):
			return false
		seen[key] = true
		var road := places.roads[ri]
		if road.kind == &"service" or road.kind == &"motorway":
			return false
		var kind := places.segment_kind(ri, i)
		var pk := PlaceMap.peak(kind)
		if pk <= 0.0:
			return false
		var a := road.points[i]
		var b := road.points[i + 1]
		var length := a.distance_to(b)
		if length < 1.0:
			return false
		var d := (b - a) / length
		var spacing := 100.0 / pk
		var footway := road.kind == &"footway"
		var start_clear := JUNCTION_CLEAR if i == 0 else 0.0
		var end_clear := JUNCTION_CLEAR if i == road.points.size() - 2 else 0.0
		var j := 0
		while j * spacing < length:
			var seed_a := int(road.id & 0x7fffffff)
			var seed_b := i * 1024 + j
			j += 1
			var along := (j - 1 + 0.1 + AiRandom.hash3(seed_a, seed_b, 1) * 0.8) * spacing
			if along > length - end_clear or along < start_clear:
				continue
			var side := 1.0 if AiRandom.hash3(seed_a, seed_b, 2) < 0.5 else -1.0
			var offset := (AiRandom.hash3(seed_a, seed_b, 3) - 0.5) * road.width if footway else side * (road.width / 2.0 + PAVEMENT_FROM + AiRandom.hash3(seed_a, seed_b, 3) * PAVEMENT_SPREAD)
			var p := a + d * along + Vector2(-d.y, d.x) * offset
			if not _in_cell(p, c) or _on_carriageway(p, ri) or places.in_sea(p) or _is_solid(p):
				continue
			var poses: Vector2 = POSES[kind]
			var roll := AiRandom.hash3(seed_a, seed_b, 4)
			var walk := roll >= poses.x and roll < poses.x + poses.y
			var room := minf(along - start_clear, length - end_clear - along)
			var stroll := minf(room, 3.0 + AiRandom.hash3(seed_a, seed_b, 5) * 6.0) if walk else 0.0
			var forwards := AiRandom.hash3(seed_a, seed_b, 6) < 0.5
			var s := Spot.new()
			s.pos = p
			s.kind = kind
			s.rank = AiRandom.hash3(seed_a, seed_b, 8)
			s.look = floori(AiRandom.hash3(seed_a, seed_b, 9) * 997)
			s.speed = 0.9 + AiRandom.hash3(seed_a, seed_b, 10) * 0.5
			if walk and stroll > 1.0:
				s.pose = WALK
				s.stroll = stroll
				s.yaw = atan2(-d.x, -d.y) if forwards else atan2(d.x, d.y)
			else:
				# Standing (or talking): turned towards the road or along it.
				s.pose = TALK if roll >= poses.x + poses.y else STAND
				var towards := Vector2(d.y, -d.x) * side
				s.yaw = atan2(-towards.x, -towards.y) + (AiRandom.hash3(seed_a, seed_b, 7) - 0.5) * 2.2
			out.append(s)
			# A family at a station: a child beside the adult (never alone on a pavement).
			if not footway and FAMILY_PLACES.has(kind) and s.pose != WALK and AiRandom.hash3(seed_a, seed_b, 11) < FAMILY_SHARE:
				var kid := Spot.new()
				kid.pos = p + d * 0.55
				if not _on_carriageway(kid.pos, ri) and not _is_solid(kid.pos) and _in_cell(kid.pos, c):
					kid.yaw = s.yaw
					kid.pose = STAND
					kid.rank = s.rank
					kid.look = floori(AiRandom.hash3(seed_a, seed_b, 12) * 997)
					kid.kind = kind
					kid.child = true
					out.append(kid)
		return false)
	return out


## True on the carriageway of a road other than `own` (index).
func _on_carriageway(p: Vector2, own: int) -> bool:
	var on := [false]
	places.segments_near(p, 16.0, func(ri: int, i: int) -> bool:
		var road := places.roads[ri]
		if ri == own or road.kind == &"footway":
			return false
		var reach := road.width / 2.0 + 0.6
		if Geometry2D.get_closest_point_to_segment(p, road.points[i], road.points[i + 1]).distance_squared_to(p) < reach * reach:
			on[0] = true
		return on[0])
	return on[0]


func _sand_spots(c: Vector2i) -> Array:
	var centre := (Vector2(c) + Vector2(0.5, 0.5)) * cell
	if not places.near_beach(centre, cell):
		return []
	var out: Array = []
	var ppl := cell * cell * PlaceMap.peak(&"beach") / 1000.0
	var groups := roundi(ppl / 2.5 + AiRandom.hash3(c.x, c.y, 1) - 0.5)
	for g in groups:
		var h := func(k: int) -> float: return AiRandom.hash3(c.x * 131 + g, c.y, 100 + k)
		var gp := Vector2(c) * cell + Vector2(h.call(1), h.call(2)) * cell
		if not places.on_sand(gp) or _is_solid(gp):
			continue
		var poses: Vector2 = POSES[&"beach"]
		var roll: float = h.call(3)
		var pose := STAND if roll < poses.x else (WALK if roll < poses.x + poses.y else SIT)
		var size := 1 + floori(float(h.call(4)) * 2.0) if pose == WALK else 1 + floori(float(h.call(4)) * float(h.call(5)) * 5.0)
		var heading: float = float(h.call(6)) * TAU
		var dir := Vector2(-sin(heading), -cos(heading))
		var stroll := 6.0 + float(h.call(7)) * 10.0 if pose == WALK else 0.0
		var walking := pose == WALK and places.on_sand(gp + dir * stroll) and places.on_sand(gp - dir * stroll) and not _is_solid(gp + dir * stroll) and not _is_solid(gp - dir * stroll)
		var rank: float = h.call(8)
		# A family on the sand: the first is an adult, the others may be children; a lone
		# sitter or a pair standing may be the cricket boy at play with someone.
		var family := size >= 2 and pose != WALK and float(h.call(11)) < 0.35
		for m in size:
			var k := func(n: int) -> float: return AiRandom.hash3(c.x * 131 + g, c.y * 7 + m, 300 + n)
			var p := gp
			var yaw := heading
			if pose == WALK:
				p = gp + Vector2(dir.y, -dir.x) * m * 0.8
			else:
				var angle := TAU * m / size + float(h.call(9)) * PI
				var r := 0.0 if size == 1 else (0.75 if pose == SIT else 0.6) + float(k.call(1)) * 0.2
				p = gp + Vector2(sin(angle), cos(angle)) * r
				if size > 1:
					var to := gp - p
					yaw = atan2(-to.x, -to.y)
			if not places.on_sand(p) or _is_solid(p):
				continue
			var s := Spot.new()
			s.pos = p
			s.yaw = yaw
			s.pose = WALK if pose == WALK and walking else (STAND if pose == WALK else pose)
			s.rank = rank
			s.look = floori(float(k.call(2)) * 997)
			s.kind = &"beach"
			s.stroll = stroll if s.pose == WALK else 0.0
			s.speed = 0.8 + float(h.call(10)) * 0.35
			s.child = family and m > 0 and float(k.call(3)) < 0.6
			s.play = s.child and pose == STAND and m == 1 and float(k.call(4)) < 0.5
			out.append(s)
	return out


## The people to draw round `focus` at this hour, nearest first, at most `cap`. `time`: game
## seconds (strollers follow it); `avoid`: Vector3(x, z, radius) of things moving through the
## crowd, who are given room.
func people_near(focus: Vector2, hour: float, time: float, avoid: PackedVector3Array = PackedVector3Array()) -> Array[Person]:
	var fresh := new_cells
	var out: Array[Person] = []
	var share: Dictionary[StringName, float] = {}
	var c0 := floori((focus.x - radius) / cell)
	var c1 := floori((focus.x + radius) / cell)
	var r0 := floori((focus.y - radius) / cell)
	var r1 := floori((focus.y + radius) / cell)
	for col in range(c0, c1 + 1):
		for row in range(r0, r1 + 1):
			var key := Vector2i(col, row)
			if not _cells.has(key):
				if ground_ready.is_valid() and ground_ready.call((Vector2(key) + Vector2(0.5, 0.5)) * cell) != true:
					continue
				fresh -= 1
				if fresh < 0:
					continue
			for s: Spot in spots(key):
				var d := s.pos.distance_to(focus)
				if d > radius:
					continue
				if not share.has(s.kind):
					share[s.kind] = PlaceMap.people(s.kind, hour) / PlaceMap.peak(s.kind)
				if s.rank >= share[s.kind] * (1.0 if d < near else far_share):
					continue
				var person := _person_at(s, time, avoid)
				person.distance = person.pos.distance_to(focus)
				out.append(person)
	if out.size() > cap:
		out.sort_custom(func(a: Person, b: Person) -> bool: return a.distance < b.distance)
		out.resize(cap)
	_forget(focus)
	return out


func _person_at(s: Spot, time: float, avoid: PackedVector3Array) -> Person:
	var p := Person.new()
	p.key = s.key
	p.pos = s.pos
	p.yaw = s.yaw
	p.pose = s.pose
	p.look = s.look
	p.kind = s.kind
	p.child = s.child
	p.play = s.play
	p.speed = s.speed
	if s.pose == WALK and s.stroll > 0.0:
		# Up and back along the walk: out, turn, back past the spot, turn.
		var lap := s.stroll * 4.0
		var distance := time * s.speed + s.look * 0.37
		var u := fposmod(distance, lap)
		var along := u if u < s.stroll else (s.stroll * 2.0 - u if u < s.stroll * 3.0 else u - s.stroll * 4.0)
		var outwards := u < s.stroll or u >= s.stroll * 3.0
		p.pos = s.pos + Vector2(-sin(s.yaw), -cos(s.yaw)) * along
		p.yaw = s.yaw if outwards else s.yaw + PI
		p.walked = distance
	for o in avoid:
		var r := p.pos - Vector2(o.x, o.y)
		var d := r.length()
		var room := o.z + MAKE_WAY
		if d < room:
			p.pos = Vector2(o.x, o.y) + (r * (room / d) if d > 0.001 else Vector2(room, 0.0))
	return p


func _forget(focus: Vector2) -> void:
	if _cells.size() < 600:
		return
	for key: Vector2i in _cells.keys():
		if ((Vector2(key) + Vector2(0.5, 0.5)) * cell).distance_to(focus) > radius * 4.0:
			_cells.erase(key)
