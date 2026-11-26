class_name HomeSite
extends RefCounted
## Where one home for sale is in the world (G-233): the real OSM building, the door spot on its
## road-facing edge and the pavement spot to stand at. The building itself stays as it is; the
## door, the board and the trigger are drawn and tested on top of it. Resolved on a worker
## thread (`resolve` reads the building's chunk and the street layout, both node-free).
##
## The door is the middle of the footprint edge that looks at the nearest road (the edge whose
## middle is nearest the road, with the road on its outside), 0.1 m clear of the wall. The spot
## to stand is 1.3 m out from the door; when that falls on a carriageway it is the pavement spot
## of the fare logic (`FareSpots.kerb_spot`, estimated: OSM maps no pavements). The ground height
## comes from `RoadHeights` (a home on a flyover deck is not offered).

## Metres out from the wall where the player stands to use the door.
const STAND_OUT := 1.3
## How near the player must be to the standing spot to buy or enter, metres.
const REACH := 3.2
## A footprint edge shorter than this cannot hold a door.
const MIN_EDGE := 2.6

var listing: HomeListing
var outline: PackedVector2Array = PackedVector2Array()
var centre: Vector2 = Vector2.ZERO
## The door's middle on the wall, world metres.
var door: Vector2 = Vector2.ZERO
## The unit vector pointing out of the building at the door.
var normal: Vector2 = Vector2.ZERO
## Where the player stands for the door and comes out to, world metres.
var stand: Vector2 = Vector2.ZERO
## The player's facing when standing at the door looking at it (along -normal), and coming out.
var yaw_in: float = 0.0
var yaw_out: float = 0.0
var ground_y: float = 0.0
## The wall's length at the door's edge (the board and door are sized to it), metres.
var edge_length: float = 0.0


func id() -> String:
	return listing.id


## The site of a listing, or null when its building is not in the world data (or has no edge fit
## for a door, or stands on a deck). Worker-thread safe.
static func resolve(l: HomeListing, source: WorldSource, layouts: CityLayouts) -> HomeSite:
	var b := _find_building(l, source)
	if b == null or b.outline.size() < 3:
		return null
	var s := HomeSite.new()
	s.listing = l
	s.outline = b.outline
	var sum := Vector2.ZERO
	for p in b.outline:
		sum += p
	s.centre = sum / float(b.outline.size())
	var layout := layouts.layout_for(source.cell_at(s.centre))
	var best_score := INF
	var n := b.outline.size()
	for i in n:
		var a := b.outline[i]
		var c := b.outline[(i + 1) % n]
		var len := a.distance_to(c)
		if len < MIN_EDGE:
			continue
		var mid := (a + c) * 0.5
		var out := (c - a).orthogonal().normalized()
		if out.dot(mid - s.centre) < 0.0:
			out = -out
		var hit := layout.nearest_road_point(mid)
		if hit.is_empty():
			continue
		var at: Vector2 = hit["point"]
		var d := float(hit["distance"])
		# The road must be on this edge's outside; an edge facing away is penalised hard.
		var score := d + (0.0 if out.dot(at - mid) > 0.0 else 60.0) - minf(len, 12.0) * 0.05
		if score < best_score:
			best_score = score
			s.door = mid + out * 0.1
			s.normal = out
			s.edge_length = len
	if best_score == INF:
		return null
	s.stand = s.door + s.normal * (STAND_OUT - 0.1)
	if layout.on_other_road(s.stand, -1, 0.3):
		var hit2 := layout.nearest_road_point(s.door)
		s.stand = FareSpots.kerb_spot(layout, hit2["point"], s.door)
	s.ground_y = RoadHeights.create(layouts).height_at(s.stand, 0.0)
	if s.ground_y > 0.3:
		return null
	s.yaw_out = atan2(-s.normal.x, -s.normal.y)
	s.yaw_in = atan2(s.normal.x, s.normal.y)
	return s


static func _find_building(l: HomeListing, source: WorldSource) -> Building:
	for cell in source.chunks_near(l.at, 30.0):
		var chunk := source.read_chunk(cell)
		for b in chunk.buildings:
			if b.id == l.osm:
				return b
	return null


## Whether a world point is within reach of the standing spot.
func in_reach(at: Vector2) -> bool:
	return at.distance_to(stand) <= REACH


## The door's centre as a scene position (the origin shift applied).
func door_scene(height: float = 0.0) -> Vector3:
	return WorldOrigin.to_scene(door, ground_y + height)
