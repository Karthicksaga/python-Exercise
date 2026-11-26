class_name ParkingSpots
extends RefCounted
## Where vehicles stand parked (decision G-110): the Three.js game's parking from the baked
## content (`GameContent.parking`, kinds mapped to variants) plus the extra spots of
## `parking_spots.json` (taxis, premium cars, the race car). Plain data and pure functions, so
## spots resolve on worker threads: `kerb()` snaps a spot to the kerb of the nearest drivable
## road of the loaded map, on the side of the road it was on, facing along it (`content.ts`
## `kerb`), so spots follow the map when the data is rebuilt.

const EXTRA_PATH := "res://src/app/parked_vehicles/parking_spots.json"
## A spot further than this from any drivable road is not on this map (metres).
const MAX_SNAP := 60.0
## Kerb inset from the road's edge (`content.ts`): the centre of a parked car.
const KERB_INSET := 1.3


class Spot:
	extends RefCounted
	var id: StringName = &""
	var variant: StringName = &""
	## The point given (world metres) and, once resolved, the kerb point and heading.
	var near: Vector2 = Vector2.ZERO
	var point: Vector2 = Vector2.ZERO
	var yaw: float = 0.0
	## Alpha 0: the variant's own paint.
	var paint: Color = Color(0, 0, 0, 0)
	## &"new", &"resolving", &"ready" or &"off_map".
	var state: StringName = &"new"


## Every spot: content parking first, then the extras. `error` names an unreadable file.
static func load_all(content: GameContent, extra_path: String = EXTRA_PATH) -> Array[Spot]:
	var out: Array[Spot] = []
	var extra: Variant = JSON.parse_string(FileAccess.get_file_as_string(extra_path))
	var d: Dictionary = extra if extra is Dictionary else {}
	var kinds: Dictionary = d.get("kinds", {})
	if content != null:
		for p: Dictionary in content.parking:
			var kind := String(p.get("kind", ""))
			if not kinds.has(kind):
				continue
			var s := Spot.new()
			s.id = StringName(String(p["id"]))
			s.variant = StringName(String(kinds[kind]))
			s.near = Vector2(float(p["x"]), float(p["z"]))
			s.yaw = float(p.get("yaw", 0.0))
			if p.has("color") and kind == "car":
				s.paint = Color.hex((int(p["color"]) << 8) | 0xff)
			out.append(s)
	for e: Dictionary in d.get("spots", []):
		var s := Spot.new()
		s.id = StringName(String(e["id"]))
		s.variant = StringName(String(e["variant"]))
		var n: Array = e["near"]
		s.near = Vector2(float(n[0]), float(n[1]))
		out.append(s)
	return out


## The kerb for a point given the nearest road hit (`CityLayout.nearest_road_point`: point,
## heading, distance) and that road's width: {"point", "yaw"}, or {} when no road is near.
static func kerb(near: Vector2, hit: Dictionary, road_width: float) -> Dictionary:
	if hit.is_empty() or float(hit.get("distance", INF)) > MAX_SNAP:
		return {}
	var on_road: Vector2 = hit["point"]
	var heading: float = hit["heading"]
	var right := Vector2(cos(heading), -sin(heading))
	var side := maxf(0.2, road_width / 2.0 - KERB_INSET)
	# The side of the road the given point is on (the Three.js spots are already at a kerb).
	var far := (near - on_road).dot(right) < 0.0
	return {
		"point": on_road + right * side * (-1.0 if far else 1.0),
		"yaw": wrapf(heading + (PI if far else 0.0), -PI, PI),
	}


## The kerb for a world point on the city's roads, {"point", "yaw"} or {} (worker thread: may
## build a tile's road layout).
static func resolve(near: Vector2, world: CityWorld) -> Dictionary:
	var layout := world.layouts.layout_for(world.source.cell_at(near))
	var hit := layout.nearest_road_point(near)
	var width := 0.0
	if not hit.is_empty():
		width = layout.roads[int(hit["road_index"])].width
	return kerb(near, hit, width)


## Takes a `resolve` result on the main thread.
static func apply(spot: Spot, k: Dictionary) -> void:
	if k.is_empty():
		spot.state = &"off_map"
		return
	spot.point = k["point"]
	spot.yaw = k["yaw"]
	spot.state = &"ready"
