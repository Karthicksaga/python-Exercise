class_name Railway
extends Node3D
## The railway in the game (port of `apps/game/src/Railway.ts`, decisions G-320…G-334): tracks and
## stations drawn near the player, timetabled trains (instanced models for the ones in sight,
## kinematic boxes for the ones close by), riding as a passenger (BOARD at a platform when a
## train stands there for a ₹5 ticket, through the doorway, sit or stand, look out, STEP OFF at a
## stop; a ride towards the map's edge ends at the last station on it), driving from the cab (the
## owner's prototype: lever, horn, emergency brake, doors interlock, limits, signals, stop marks),
## level crossings that close for trains and stop the road, platform crowds, the timetable and
## the route map. The rules live in `src/rail/`; this node connects them to the views, the
## player and the HUD, like `CityLife` does for the AI. Holds no rules of its own.
##
## The railway clock runs in game time (physics steps); trains are a function of it.

signal state_changed(state: StringName)

## The railway clock starts mid-service, so trains are already running (Railway.ts).
const CLOCK_START := 2.0 * 3600.0
## Walking pace through a doorway, m/s; a longer walk hurries to take at most DOOR_WALK_TIME s.
const DOOR_WALK_SPEED := 1.5
const DOOR_WALK_TIME := 4.0
const HORN_RANGE := 350.0
## Seconds between two listens (`_listen` runs every sixth physics step).
const LISTEN_DT := 0.1
## The chime sounds this many seconds before a train reaches the player's platform.
const ANNOUNCE_AHEAD := 50.0
const CROWD_RANGE := 170.0
const CROWD_PLATFORMS := 2
## Platform people drawn within this distance, at most PEOPLE_MAX (the nearest).
const PEOPLE_DRAWN := 70.0
const PEOPLE_MAX := 16
## DRIVE is offered within this distance of a standing train's front cab door.
const DRIVE_REACH := 14.0
## Trains of the same line behind the player's cab train within this distance wait out of sight.
const BEHIND_HIDE := 400.0
## A train the player left stands this long (or until the player is this far) before it is gone.
const PARKED_TIME := 240.0
const PARKED_FAR := 300.0
## Quality presets (as `QualitySettings` LOW/MEDIUM/HIGH, G-334): trains drawn and how far, the
## overhead line, crowd people.
const PRESETS: Array[Dictionary] = [
	{"trains": 4, "draw": 520.0, "solid": 250.0, "lod": 0.6, "ohe": false, "ohe_distance": 0.0, "tracks": 450.0, "people": 8},
	{"trains": 6, "draw": 700.0, "solid": 320.0, "lod": 0.8, "ohe": true, "ohe_distance": 160.0, "tracks": 520.0, "people": 12},
	{"trains": 8, "draw": 900.0, "solid": 400.0, "lod": 1.0, "ohe": true, "ohe_distance": 220.0, "tracks": 600.0, "people": PEOPLE_MAX},
]

var world: CityWorld
var rig: PlayerRig
## () -> int: the player's money; (int) -> void: take a fare. Set by the composition root.
var money_of: Callable = func() -> int: return 100
var charge: Callable = func(_rupees: int) -> void: pass
## () -> float: hour of the day (the boards' clock and the crowd's size).
var hour_of: Callable = func() -> float: return 12.0
var network: RailNetwork
var index: RailIndex
var models: TrainModels
var platforms: Array[StationLayout.Platform] = []
var materials: RailMaterials
var tracks_view: RailTracksView
var stations_view: StationView
var trains_view: TrainsView
var hud: RailHud
var font: Font
var clock: float = CLOCK_START
var fares: int = 0
var quality: int = 2
var error: String = ""
## &"foot", &"walk" (through a doorway), &"ride" or &"cab".
var state: StringName = &"foot"
var announcements: int = 0
var horns: int = 0
var bells: int = 0

# Riding.
var ride_line: RailLine = null
var ride_departure: int = 0
var ride_id: String = ""
var ride_car: int = 1
var seated: bool = true
var inside_view: bool = true
var _walk: Array[Vector3] = []
var _walk_time: float = 0.0
var _walk_duration: float = 0.0
var _walk_boarding: bool = true
var _walk_end_yaw: float = 0.0
var _anchor: Node3D
var _inside_camera: Camera3D
var _interior: MeshInstance3D
var _look: Vector2 = Vector2.ZERO
var _seat_pose: SeatPose = null

# Driving.
var cab: CabDrive = null
var cab_departure: int = 0
## Timetable trains the player took over (hidden for the rest of their run).
var taken: Dictionary[String, bool] = {}
var _horn_down: bool = false
## Seconds until the vigilance warning tone sounds again.
var _alarm_cool: float = 0.0
var _horn_cool: float = 0.0
## Trains the player left at a platform: [line, s, seconds].
var _parked: Array[Array] = []

# Stations, crowds and crossings.
var crowds: Dictionary[String, StationCrowd] = {}
var _crowd_platforms: Dictionary[String, StationLayout.Platform] = {}
var crossing_amounts: PackedFloat32Array = PackedFloat32Array()
var _crossing_nodes: Array[Node3D] = []
var _standing: Dictionary[String, bool] = {}
var _last_wait: Dictionary[String, float] = {}
var _board_tick: float = 0.0
var _draws: Array[TrainsView.Draw] = []
var _loads: Dictionary[String, int] = {}


func _init() -> void:
	name = "Railway"
	process_physics_priority = -20


## Loads the network and models and builds the views (awaitable during loading). "" or the error.
func prepare(city: CityWorld, player: PlayerRig) -> String:
	world = city
	rig = player
	network = await BackgroundTask.start(func() -> RailNetwork: return RailNetwork.load_file()).finish(get_tree())
	if network.error != "":
		return network.error
	var source := city.source
	var origin := source.get_grid_origin()
	var size := source.get_chunk_size()
	var net := network
	index = await BackgroundTask.start(func() -> RailIndex: return RailIndex.build(net, origin, size)).finish(get_tree())
	city.set_rail_index(index)  # trees keep clear of the tracks (G-383)
	platforms = await BackgroundTask.start(func() -> Array[StationLayout.Platform]: return StationLayout.platforms(net)).finish(get_tree())
	models = await BackgroundTask.start(func() -> TrainModels: return TrainModels.load_all()).finish(get_tree())
	if models.error != "":
		push_warning(models.error)
	materials = RailMaterials.create()
	font = RailFonts.with_tamil()
	tracks_view = RailTracksView.new()
	tracks_view.name = "Tracks"
	add_child(tracks_view)
	tracks_view.setup(index, materials)
	stations_view = StationView.new()
	stations_view.name = "Stations"
	add_child(stations_view)
	for line in network.lines:
		stations_view.half_train[line.id] = models.train_length(line.train_type) / 2.0
	stations_view.setup(platforms, materials, font)
	trains_view = TrainsView.new()
	trains_view.name = "Trains"
	add_child(trains_view)
	trains_view.setup(models)
	_add_crossings()
	_anchor = Node3D.new()
	_anchor.name = "RideAnchor"
	add_child(_anchor)
	_inside_camera = Camera3D.new()
	_inside_camera.name = "InsideCamera"
	_inside_camera.near = 0.05
	_inside_camera.fov = 70.0
	add_child(_inside_camera)
	_interior = MeshInstance3D.new()
	_interior.name = "Interior"
	_interior.visible = false
	_interior.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_interior)
	crossing_amounts.resize(network.crossings.size())
	for line in network.lines:
		for st in line.stops:
			_stop_points.append(line.path.at(st.s).point())
			_stop_lines.append(line)
	for p in platforms:
		_platform_points.append(p.line.path.at(p.stop.s).point())
	apply_quality(quality)
	prepared = true
	return ""


## True once `prepare` finished: nothing steps before the views exist.
var prepared: bool = false
## Stops' centres and their lines, platforms' centres: so the per-frame checks only look at the
## few lines with a stop near the player (a projection onto a 17 km line costs ~0.1 ms).
var _stop_points := PackedVector2Array()
var _stop_lines: Array[RailLine] = []
var _platform_points := PackedVector2Array()


func _near_lines(at: Vector2, reach: float = 100.0) -> Array[RailLine]:
	var out: Array[RailLine] = []
	for i in _stop_points.size():
		if _stop_points[i].distance_squared_to(at) < reach * reach and not out.has(_stop_lines[i]):
			out.append(_stop_lines[i])
	return out


## The quality preset (0 Low, 1 Medium, 2 High; `QualitySettings` levels).
func apply_quality(level: int) -> void:
	quality = clampi(level, 0, PRESETS.size() - 1)
	var p: Dictionary = PRESETS[quality]
	if trains_view != null:
		trains_view.max_trains = int(p["trains"])
		trains_view.draw_range = float(p["draw"])
		trains_view.solid_range = float(p["solid"])
		trains_view.lod_scale = float(p["lod"])
	if tracks_view != null:
		tracks_view.load_distance = float(p["tracks"])
		tracks_view.unload_distance = float(p["tracks"]) + 100.0
		tracks_view.set_overhead(bool(p["ohe"]), float(p["ohe_distance"]))


func set_hud(h: RailHud) -> void:
	hud = h
	hud.set_tamil_font(font)
	hud.notch_changed.connect(func(i: int) -> void:
		if cab != null:
			cab.set_notch(i))
	hud.horn_changed.connect(func(on: bool) -> void: _horn_down = on)
	hud.emergency_pressed.connect(func() -> void:
		if cab != null:
			cab.emergency())
	hud.leave_cab_pressed.connect(leave_cab)
	hud.step_off_pressed.connect(step_off)
	hud.seat_pressed.connect(toggle_seat)
	hud.view_pressed.connect(toggle_view)
	hud.timetable_pressed.connect(show_timetable)
	hud.drive_pressed.connect(take_cab)
	hud.look.connect(func(d: Vector2) -> void: _look += Vector2(-d.x, -d.y) * 0.005)


# --- the clock and the world ---------------------------------------------------------------------

## Main-thread time this node spends (µs): physics step and frame, last and the running total.
var timing := {"physics_usec": 0, "process_usec": 0, "physics_total": 0, "process_total": 0, "frames": 0, "steps": 0, "process_max": 0, "physics_max": 0}


func _physics_process(dt: float) -> void:
	if not prepared:
		return
	var t0 := Time.get_ticks_usec()
	_physics_step(dt)
	var spent := Time.get_ticks_usec() - t0
	timing["physics_usec"] = spent
	timing["physics_total"] = int(timing["physics_total"]) + spent
	timing["physics_max"] = maxi(int(timing["physics_max"]), spent)
	timing["steps"] = int(timing["steps"]) + 1


func _physics_step(dt: float) -> void:
	clock += dt
	var focus := _focus()
	if cab != null:
		_step_cab(dt)
	_step_walk(dt)
	_step_ride()
	_step_parked(dt, focus)
	_slow_step += 1
	var t0 := Time.get_ticks_usec()
	# Horns, chimes and crossings need no more than ten checks a second.
	if _slow_step % 6 == 0:
		_listen(focus)
	var t1 := Time.get_ticks_usec()
	_step_crowds(dt, focus)
	var t2 := Time.get_ticks_usec()
	if _slow_step % 6 == 3:
		_step_crossings(dt * 6.0)
	var t3 := Time.get_ticks_usec()
	parts += Vector3i(t1 - t0, t2 - t1, t3 - t2)


var _slow_step: int = 0
## Each crossing's last want (1 closing or closed, 0 open), for the booms' sound.
var _crossing_closing: PackedByteArray = PackedByteArray()
## Train id -> its speed at the last listen, for the brake squeal (speed falling).
var _last_speed: Dictionary[String, float] = {}
var _hud_tick: int = 0
## Standing trains' doorways per platform, in its frame: they do not move while a train stands.
var _door_cache: Dictionary[String, PackedVector2Array] = {}
## Physics time by part, summed (µs): listening (horns, chimes), crowds, crossings.
var parts: Vector3i = Vector3i.ZERO


## Skips the timetable forward (tests and the debug menu; `railAdvance` in the Three.js game).
func advance(seconds: float) -> void:
	clock += seconds


func _focus() -> Vector2:
	if rig != null and rig.body != null and rig.body.is_inside_tree():
		return WorldOrigin.to_world(rig.body.global_position)
	return world.streamer.focus if world != null and world.streamer != null else Vector2.ZERO


func _process(dt: float) -> void:
	if not prepared:
		return
	var t0 := Time.get_ticks_usec()
	_frame(dt)
	var spent := Time.get_ticks_usec() - t0
	timing["process_usec"] = spent
	timing["process_total"] = int(timing["process_total"]) + spent
	timing["process_max"] = maxi(int(timing["process_max"]), spent)
	timing["frames"] = int(timing["frames"]) + 1


func reset_timing() -> void:
	for k: String in timing.keys():
		timing[k] = 0
	parts = Vector3i.ZERO


func _frame(dt: float) -> void:
	var focus := _focus()
	tracks_view.focus = focus
	stations_view.focus = focus
	_draw_trains(focus)
	_place_cameras()
	_board_tick -= dt
	if _board_tick <= 0.0:
		_board_tick = 1.0
		stations_view.refresh(clock, float(hour_of.call()), _standing_keys())
	_inside_sound()
	_hud_tick += 1
	# The HUD's words change slowly: a third of the frames is enough (the cab's dial every frame).
	if _hud_tick % 3 == 0 or state == &"cab":
		_update_hud(focus)


## The id of the train the player drives ("" when not driving).
func cab_id() -> String:
	return "%s#%d" % [cab.line.id, cab_departure] if cab != null else ""


## 0..1: how hard the train `id` is slowing (1 at 1 m/s²), from its speed `dt` seconds ago.
func _braking(id: String, speed: float, dt: float) -> float:
	var before: float = _last_speed.get(id, speed)
	_last_speed[id] = speed
	return clampf((before - speed) / maxf(dt, 0.001), 0.0, 1.0)


## The running sound inside the train the player rides or drives (every frame).
func _inside_sound() -> void:
	if state == &"cab" and cab != null:
		Sound.rail.set_motion(cab.v, clampf(-cab.effort / 1.2, 0.0, 1.0), true, 0.0)
	elif state == &"ride" and ride_line != null:
		var tr := ride_line.train(ride_departure, clock)
		if tr != null:
			Sound.rail.set_motion(tr.state.speed, _braking(tr.id, tr.state.speed, get_process_delta_time()), true, 0.0)


func _standing_keys() -> Dictionary[String, bool]:
	var out: Dictionary[String, bool] = {}
	for d in _draws:
		var st := d.line.profile.state(clock - (d.line.offset + _departure_of(d.id) * d.line.headway)) if d.id.contains("#") else null
		if st != null and st.stopped_at >= 0:
			out["%s:%d" % [d.line.id, st.stopped_at]] = true
	if cab != null and cab.doors_open and cab.next < cab.line.stops.size():
		out["%s:%d" % [cab.line.id, cab.next]] = true
	return out


static func _departure_of(id: String) -> int:
	return int(id.get_slice("#", 1))


## The trains to draw this frame: the timetable's near the player (not the ones taken over),
## the player's cab train and any train the player left standing.
func _draw_trains(focus: Vector2) -> void:
	_draws.clear()
	var range_m := trains_view.draw_range + 150.0
	for line in network.lines:
		for t in line.trains(clock):
			if taken.has(t.id):
				continue
			var p := line.path.at(t.state.s).point()
			if p.distance_to(focus) > range_m:
				continue
			if cab != null and line == cab.line and t.departure > cab_departure and t.state.s > cab.s - BEHIND_HIDE and t.state.s < cab.s:
				continue
			var d := TrainsView.Draw.new()
			d.id = t.id
			d.line = line
			d.s = t.state.s
			d.open = RailRules.door_openness(t.state)
			if t.state.stopped_at >= 0:
				d.side = line.stops[t.state.stopped_at].side
			_draws.append(d)
	if cab != null:
		var d := TrainsView.Draw.new()
		d.id = "cab"
		d.line = cab.line
		d.s = cab.s
		d.open = 1.0 if cab.doors_open else 0.0
		d.side = cab.line.stops[mini(cab.next, cab.line.stops.size() - 1)].side
		_draws.append(d)
	for parked in _parked:
		var d := TrainsView.Draw.new()
		d.id = "parked"
		d.line = parked[0] as RailLine
		d.s = float(parked[1])
		_draws.append(d)
	for d in _draws:
		d.distance = d.line.path.at(d.s).point().distance_squared_to(focus)
	_draws.sort_custom(func(a: TrainsView.Draw, b: TrainsView.Draw) -> bool: return a.distance < b.distance)
	var cam := get_viewport().get_camera_3d()
	var eye := cam.global_position if cam != null else WorldOrigin.to_scene(focus, 2.0)
	trains_view.update(_draws, eye, WorldOrigin.to_scene(focus, 1.0))


# --- boarding, riding, stepping off ----------------------------------------------------------------

## The train standing at the platform the player is at (any line), with the stop index, or [].
func standing_train(at: Vector2, height: float) -> Array:
	for line in _near_lines(at):
		var index_at := RailRules.stop_at(line, at, height)
		if index_at < 0:
			continue
		for t in line.trains(clock):
			if t.state.stopped_at == index_at and not taken.has(t.id):
				return [t, index_at]
	return []


## What the ACTION button offers on foot: BOARD THE TRAIN at a standing train (registered as an
## `ActionContext` source by the composition root).
func offer() -> Variant:
	if state != &"foot" or not prepared or rig == null or not rig.body.is_on_foot():
		return null
	var at := _focus()
	var found := standing_train(at, rig.body.global_position.y)
	if found.is_empty():
		return null
	return ActionCandidate.make("BOARD THE TRAIN", ActionContext.P_BOARD + 2, 1.0, board)


## BOARD: the rules first (standing, doors, next stop on the map, a ticket), then the walk.
func board() -> bool:
	if state != &"foot":
		return false
	var at := _focus()
	var found := standing_train(at, rig.body.global_position.y)
	if found.is_empty():
		return false
	var train := found[0] as RailLine.TrainAt
	var stop_index := int(found[1])
	var answer := RailRules.boarding(train, stop_index, int(money_of.call()))
	if not answer.ok:
		_toast("Can't board: %s" % answer.reason)
		return true
	charge.call(answer.fare)
	fares += answer.fare
	ride_line = train.line
	ride_departure = train.departure
	ride_id = train.id
	var nxt := train.state.next_stop
	_toast("Train to %s · ticket ₹%d · next: %s" % [ride_line.destination(), answer.fare, ride_line.stops[nxt].name if nxt >= 0 else "end of the line"])
	_start_walk(true, train, stop_index)
	Sound.rail.door(false)
	return true


## The doorway nearest a world point on a train's platform side: [car index, door, world point outside, world point inside, outward yaw].
func _nearest_doorway(line: RailLine, s: float, side: int, near: Vector3) -> Array:
	var best: Array = []
	var best_d := INF
	var f := TrainModels.formation(line.train_type)
	for i in f.size():
		var t: TrainModels.CarType = models.types.get(str(f[i][0]), null)
		if t == null:
			continue
		var reversed := bool(f[i][1])
		var open_side := -side if not reversed else side
		var xf := trains_view.car_transform(line, s, i)
		for door in t.doors:
			if door.side != open_side:
				continue
			var centre := door.rest.origin + door.slide * door.slide_m * 0.5
			var out_local := Vector3(centre.x + float(door.side) * 0.7, t.floor_height, centre.z)
			var in_local := Vector3(centre.x - float(door.side) * 0.9, t.floor_height, centre.z)
			var outside := xf * out_local
			var d := outside.distance_to(near)
			if d < best_d:
				best_d = d
				var outward := xf.basis * Vector3(float(door.side), 0, 0)
				best = [i, door, outside, xf * in_local, atan2(-outward.x, -outward.z)]
	return best


func _start_walk(boarding: bool, train: RailLine.TrainAt, stop_index: int) -> void:
	var stop := train.line.stops[stop_index]
	var body := rig.body
	var door := _nearest_doorway(train.line, train.state.s, stop.side, body.global_position)
	var platform_y := train.line.height_at(stop.s) + RailRules.PLATFORM_HEIGHT
	_walk.clear()
	if door.is_empty():
		return
	ride_car = int(door[0])
	var outside: Vector3 = door[2]
	var inside: Vector3 = door[3]
	outside.y = platform_y
	if boarding:
		_walk.append(body.global_position)
		_walk.append(outside)
		_walk.append(inside)
	else:
		_walk.append(inside)
		_walk.append(Vector3(outside.x, platform_y, outside.z))
		var outward := Vector3(-sin(float(door[4])), 0, -cos(float(door[4])))
		_walk.append(Vector3(outside.x, platform_y, outside.z) + outward * 1.2)
		_walk_end_yaw = float(door[4])
	var length := 0.0
	for i in range(1, _walk.size()):
		length += _walk[i - 1].distance_to(_walk[i])
	_walk_boarding = boarding
	_walk_time = 0.0
	_walk_duration = minf(DOOR_WALK_TIME, length / DOOR_WALK_SPEED)
	# The walk is in scene space but the world may recentre: keep it relative to the origin.
	_walk_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	if body.vehicle == null:
		_anchor.global_transform = body.global_transform
		body.enter_vehicle(self, _anchor)
		body.figure.rotation = Vector3.ZERO
		body.figure.position = Vector3.ZERO
	body.figure.set_seat(null)
	body.figure.visible = true
	_set_state(&"walk")


var _walk_origin: Vector2 = Vector2.ZERO


func _walk_point(t: float) -> Array:
	var shift := Vector3(_walk_origin.x - WorldOrigin.origin_x, 0, _walk_origin.y - WorldOrigin.origin_z)
	var length := 0.0
	for i in range(1, _walk.size()):
		length += _walk[i - 1].distance_to(_walk[i])
	var left := clampf(t, 0.0, 1.0) * length
	for i in range(1, _walk.size()):
		var a := _walk[i - 1]
		var b := _walk[i]
		var leg := a.distance_to(b)
		if left <= leg or i == _walk.size() - 1:
			var k := clampf(left / leg, 0.0, 1.0) if leg > 0.0 else 1.0
			var d := b - a
			return [a.lerp(b, k) + shift, atan2(-d.x, -d.z) if Vector2(d.x, d.z).length() > 0.01 else _walk_end_yaw]
		left -= leg
	return [_walk[_walk.size() - 1] + shift, _walk_end_yaw]


func _step_walk(dt: float) -> void:
	if state != &"walk":
		return
	_walk_time += dt
	var t := _walk_time / maxf(0.01, _walk_duration)
	var at := _walk_point(t)
	_anchor.global_transform = Transform3D(Basis(Vector3.UP, float(at[1])), at[0] as Vector3)
	rig.body.vehicle_gait = DOOR_WALK_SPEED
	# Getting on, the train must not leave with the player outside: they are in when it moves.
	var moving := false
	if _walk_boarding and ride_line != null:
		var tr := ride_line.train(ride_departure, clock)
		moving = tr == null or tr.state.stopped_at < 0
	if t < 1.0 and not moving:
		return
	rig.body.vehicle_gait = 0.0
	if _walk_boarding:
		_set_state(&"ride")
		_take_seat()
	else:
		var end := _walk_point(1.0)
		rig.body.exit_vehicle((end[0] as Vector3) + Vector3(0, 0.05, 0), _walk_end_yaw)
		rig.body.figure.set_seat(null)
		rig.body.figure.visible = true
		_walk.clear()
		_set_state(&"foot")


## Sit on the bench nearest the door (or stand by it), inside the car the player came in by.
func _take_seat() -> void:
	var body := rig.body
	if seated:
		if _seat_pose == null:
			_seat_pose = SeatPose.passenger(PlayerRiderLink.HIP_HEIGHT, 0.47)
		body.figure.set_seat(_seat_pose)
	else:
		body.figure.set_seat(null)
	hud_refresh_seat()


func hud_refresh_seat() -> void:
	if hud != null:
		hud.set_seated(seated)


## Where the rider is in the car's frame: on the bench facing across, or standing by the door.
func _seat_local(t: TrainModels.CarType) -> Transform3D:
	var hw := t.width / 2.0 - 0.12
	var side := float(ride_side_of_car())
	if seated:
		var hip := Vector3(side * (hw - 0.3), t.floor_height + 0.47, 2.4)
		return Transform3D(Basis(Vector3.UP, PI / 2.0 * side), hip - Vector3(0, PlayerRiderLink.HIP_HEIGHT, 0))
	return Transform3D(Basis(Vector3.UP, -PI / 2.0 * side), Vector3(side * (hw - 0.55), t.floor_height, -0.6))


## The car's side (+1 right, -1 left, car frame) the next platform will be on, for standing at the door.
func ride_side_of_car() -> int:
	if ride_line == null:
		return 1
	var tr := ride_line.train(ride_departure, clock)
	var nxt := tr.state.stopped_at if tr != null and tr.state.stopped_at >= 0 else (tr.state.next_stop if tr != null else -1)
	var side := ride_line.stops[nxt].side if nxt >= 0 else 1
	var f := TrainModels.formation(ride_line.train_type)
	var reversed := bool(f[ride_car][1])
	# Travel's left (+1) is the car's -X unless it is turned round.
	return -side if not reversed else side


func _step_ride() -> void:
	if state != &"ride" or ride_line == null:
		return
	var tr := ride_line.train(ride_departure, clock)
	if tr == null:
		end_ride(true)
		return
	var f := TrainModels.formation(ride_line.train_type)
	var t: TrainModels.CarType = models.types.get(str(f[ride_car][0]), null)
	if t == null:
		return
	var xf := trains_view.car_transform(ride_line, tr.state.s, ride_car) * _seat_local(t)
	_anchor.global_transform = xf
	if RailRules.ride_ends_at(tr):
		var stop := ride_line.stops[tr.state.stopped_at]
		_toast("%s: end of the ride. %s" % [stop.name, ("The line continues to %s beyond the map." % ride_line.to.name) if ride_line.to.beyond else ("This train terminates at %s." % stop.name)], 5.0)
		step_off()


## STEP OFF: only while the train stands at a station; out through the nearest doorway.
func step_off() -> bool:
	if state != &"ride" or ride_line == null:
		return false
	var tr := ride_line.train(ride_departure, clock)
	if tr == null:
		end_ride(true)
		return true
	if not RailRules.can_step_off(tr):
		_toast("Wait for the next station: you can step off when the train stops.")
		return true
	_start_walk(false, tr, tr.state.stopped_at)
	ride_line = null
	ride_id = ""
	_interior.visible = false
	Sound.rail.door(true)
	return true


## Leaves the ride at once (teleport, new game, the train gone): the player stands where the game
## puts them next; with `at_stop`, on the nearest platform of the line.
func end_ride(at_stop: bool = false) -> void:
	if state == &"foot":
		return
	var body := rig.body
	var feet := body.global_position
	var yaw := body.yaw
	if at_stop and ride_line != null:
		var near := ride_line.path.project_near(_focus(), 200.0)
		var best: RailLine.Stop = null
		for st in ride_line.stops:
			if best == null or absf(st.s - near.s) < absf(best.s - near.s):
				best = st
		if best != null:
			var p := RailRules.platform_of(ride_line, best)
			feet = WorldOrigin.to_scene(p.point(), p.base + RailRules.PLATFORM_HEIGHT + 0.05)
	ride_line = null
	cab = null
	_walk.clear()
	if body.vehicle != null:
		body.exit_vehicle(feet, yaw)
	body.vehicle_gait = 0.0
	body.figure.set_seat(null)
	body.figure.visible = true
	_interior.visible = false
	_set_state(&"foot")


func toggle_seat() -> void:
	if state != &"ride":
		return
	seated = not seated
	_take_seat()


func toggle_view() -> void:
	inside_view = not inside_view


# --- driving --------------------------------------------------------------------------------------

## The standing train whose front cab the player is beside (within DRIVE_REACH of its cab door), or null.
func cab_offer_train() -> RailLine.TrainAt:
	if state != &"foot" or not prepared:
		return null
	var at := _focus()
	var found := standing_train(at, rig.body.global_position.y)
	if found.is_empty():
		return null
	var train := found[0] as RailLine.TrainAt
	var f := TrainModels.formation(train.line.train_type)
	var t: TrainModels.CarType = models.types.get(str(f[0][0]), null)
	if t == null or not t.has_cab or train.state.next_stop < 0:
		return null
	var seat := trains_view.car_transform(train.line, train.state.s, 0) * t.driver_seat
	if Vector2(seat.x, seat.z).distance_to(Vector2(rig.body.global_position.x, rig.body.global_position.z)) > DRIVE_REACH:
		return null
	return train


## DRIVE: take over the standing train's cab (the timetable's train is the player's now).
func take_cab() -> bool:
	var train := cab_offer_train()
	if train == null:
		return false
	cab = CabDrive.new(train.line, train.state.s)
	cab_departure = train.departure
	cab.doors_open = true
	cab.dwell = minf(CabDrive.DOOR_DWELL, maxf(3.0, train.state.dwell_left))
	cab.next = train.state.stopped_at
	cab.served[train.state.stopped_at] = true
	cab.scored.connect(func(points: int, why: String) -> void: _toast("%s%d %s" % ["+" if points >= 0 else "", points, why]))
	cab.message.connect(func(text: String) -> void: _toast(text))
	cab.finished.connect(func(_score: int) -> void: _cab_finished())
	cab.doors_changed.connect(func(open: bool) -> void: Sound.rail.door(open, not open))
	# The vigilance handle (G-454): in force from the first step, held by the HOLD button.
	cab.vigilance_on = true
	cab.handle_held = false
	_alarm_cool = 0.0
	taken[train.id] = true
	var body := rig.body
	_anchor.global_transform = body.global_transform
	body.enter_vehicle(self, _anchor)
	body.figure.rotation = Vector3.ZERO
	body.figure.position = Vector3.ZERO
	if _seat_pose == null:
		_seat_pose = SeatPose.passenger(PlayerRiderLink.HIP_HEIGHT, 0.47)
	body.figure.set_seat(_seat_pose)
	inside_view = true
	_toast("You are driving to %s. Raise the lever when the doors close; stop at the red STOP board. Keep HOLD pressed while moving." % cab.line.destination(), 5.0)
	_set_state(&"cab")
	return true


func _step_cab(dt: float) -> void:
	# Trains of the same line ahead of the player's, for the signals.
	var ahead := PackedFloat64Array()
	for t in cab.line.trains(clock):
		if t.departure < cab_departure and not taken.has(t.id):
			ahead.append(t.state.s)
	cab.ahead = ahead
	cab.horn = _horn_down
	if hud != null:
		cab.set_handle(hud.handle_held())
	cab.step(dt)
	_alarm_cool -= dt
	if cab.warning and not cab.tripped and _alarm_cool <= 0.0:
		_alarm_cool = 0.7
		Sound.rail.vigilance()
	_horn_cool -= dt
	if _horn_down and _horn_cool <= 0.0:
		_horn_cool = 0.9
		horns += 1
		Sound.rail.horn(0.0)
	if state != &"cab":
		return
	var f := TrainModels.formation(cab.line.train_type)
	var t: TrainModels.CarType = models.types.get(str(f[0][0]), null)
	if t == null:
		return
	var seat := Transform3D(Basis.IDENTITY, t.driver_seat - Vector3(0, PlayerRiderLink.HIP_HEIGHT, 0))
	_anchor.global_transform = trains_view.car_transform(cab.line, cab.s, 0) * seat


func can_leave_cab() -> bool:
	return cab != null and cab.v < 0.2 and cab.doors_open


## LEAVE CAB: only standing at a platform with the doors open; the train stays there a while.
func leave_cab() -> bool:
	if cab == null:
		return false
	if not can_leave_cab():
		_toast("Stop at a platform and open the doors to leave the cab.")
		return true
	var line := cab.line
	var stop := line.stops[mini(cab.next, line.stops.size() - 1)]
	_parked.append([line, cab.s, 0.0])
	var p := RailRules.platform_of(line, stop)
	var front := trains_view.car_transform(line, cab.s, 0).origin
	var near := line.path.project_near(WorldOrigin.to_world(front), 30.0)
	var spot := line.path.beside(clampf(near.s, stop.s - RailRules.PLATFORM_LENGTH / 2.0 + 4.0, stop.s + RailRules.PLATFORM_LENGTH / 2.0 - 4.0), stop.side * RailRules.platform_offset(stop))
	var feet := WorldOrigin.to_scene(spot, p.base + RailRules.PLATFORM_HEIGHT + 0.05)
	_toast("Score %d for this run." % cab.score, 4.0)
	cab = null
	var body := rig.body
	body.exit_vehicle(feet, p.yaw + PI / 2.0 * stop.side)
	body.figure.set_seat(null)
	_interior.visible = false
	_set_state(&"foot")
	return true


func _cab_finished() -> void:
	# The end of the line on the map: off at the last station passed, the train taken away.
	var line := cab.line
	ride_line = line
	_set_state(&"ride")
	end_ride(true)
	ride_line = null


func _step_parked(dt: float, focus: Vector2) -> void:
	for i in range(_parked.size() - 1, -1, -1):
		var p: Array = _parked[i]
		p[2] = float(p[2]) + dt
		var line := p[0] as RailLine
		var far := line.path.at(float(p[1])).point().distance_to(focus) > PARKED_FAR
		if float(p[2]) > PARKED_TIME or far:
			_parked.remove_at(i)


# --- cameras ----------------------------------------------------------------------------------------

func _place_cameras() -> void:
	var inside := (state == &"ride" or state == &"cab") and inside_view
	if inside:
		_place_inside()
		if not _inside_camera.current:
			_inside_camera.make_current()
	elif _inside_camera.current and rig != null:
		rig.camera.camera.make_current()
		_interior.visible = false
	# The chase camera stands back for a train; only the railway's own states touch its reach
	# (driving a car sets its own, G-115).
	var on_train := state == &"ride" or state == &"cab"
	if rig != null and on_train != _reach_set:
		_reach_set = on_train
		rig.camera.reach = 15.0 if on_train else FollowCamera.DISTANCE


var _reach_set: bool = false


func _place_inside() -> void:
	var line := cab.line if cab != null else ride_line
	if line == null:
		return
	var s := cab.s if cab != null else (line.train(ride_departure, clock).state.s if line.train(ride_departure, clock) != null else 0.0)
	var car := 0 if cab != null else ride_car
	var f := TrainModels.formation(line.train_type)
	var t: TrainModels.CarType = models.types.get(str(f[car][0]), null)
	if t == null:
		return
	var car_xf := trains_view.car_transform(line, s, car)
	if cab != null:
		var eye := car_xf * (t.driver_seat + Vector3(-0.1, 0.72, -0.05))
		var yaw := car_xf.basis.get_euler().y + clampf(_look.x, -1.2, 1.2)
		_inside_camera.global_transform = Transform3D(Basis.from_euler(Vector3(clampf(_look.y, -0.5, 0.4) - 0.04, yaw, 0)), eye)
		if _interior.get_meta(&"kind", "") != "cab:%s" % t.name:
			_interior.mesh = CoachInterior.cab(t.driver_seat, t.width, materials.platform)
			_interior.set_meta(&"kind", "cab:%s" % t.name)
	else:
		var seat := car_xf * _seat_local(t)
		var eye := seat.origin + Vector3(0, 1.18 if seated else 1.62, 0)
		var base_yaw := seat.basis.get_euler().y
		_inside_camera.global_transform = Transform3D(Basis.from_euler(Vector3(clampf(_look.y, -0.6, 0.5) - 0.05, base_yaw + _look.x, 0)), eye)
		if _interior.get_meta(&"kind", "") != "coach:%s" % t.name:
			_interior.mesh = CoachInterior.coach(t.length, t.width, t.floor_height, materials.platform)
			_interior.set_meta(&"kind", "coach:%s" % t.name)
	_interior.global_transform = car_xf
	_interior.visible = true
	# The player's own figure is not drawn from inside their head.
	rig.body.figure.visible = false


# --- station life -------------------------------------------------------------------------------------

## The horn of a train pulling away near the player, and the chime before a train reaches the platform the player is at.
func _listen(focus: Vector2) -> void:
	var seen: Dictionary[String, bool] = {}
	var nearest_d := INF
	var nearest_speed := 0.0
	var nearest_brake := 0.0
	for line in network.lines:
		for t in line.trains(clock):
			var d := line.path.at(t.state.s).point().distance_to(focus)
			if d > HORN_RANGE:
				continue
			seen[t.id] = true
			var stands := t.state.stopped_at >= 0
			if _standing.get(t.id, false) == true and not stands:
				horns += 1
				Sound.rail.horn(d)
			_standing[t.id] = stands
			if d < nearest_d and not (t.id == cab_id() or (state == &"ride" and t.id == ride_id)):
				nearest_d = d
				nearest_speed = t.state.speed
				nearest_brake = _braking(t.id, t.state.speed, LISTEN_DT)
	for id: String in _standing.keys():
		if not seen.has(id):
			_standing.erase(id)
			_last_speed.erase(id)
	# The running sound of the nearest train outside the one the player rides or drives.
	if state != &"ride" and state != &"cab":
		Sound.rail.set_motion(nearest_speed, nearest_brake, false, nearest_d)
	if state != &"foot":
		return
	var height := rig.body.global_position.y if rig != null else 0.0
	for line in _near_lines(focus):
		var i := RailRules.stop_at(line, focus, height)
		if i < 0:
			continue
		var key := "%s:%d" % [line.id, i]
		var wait := line.next_arrival(i, clock)
		var before: float = _last_wait.get(key, -1.0)
		if before > ANNOUNCE_AHEAD and wait <= ANNOUNCE_AHEAD and wait > 1.0:
			announcements += 1
			Sound.rail.announce()
		_last_wait[key] = wait


## Platform crowds near the player (at most CROWD_PLATFORMS): people wait, get on and off.
func _step_crowds(dt: float, focus: Vector2) -> void:
	var near: Array[StationLayout.Platform] = []
	for k in platforms.size():
		if _platform_points[k].distance_to(focus) < CROWD_RANGE:
			near.append(platforms[k])
	near.sort_custom(func(a: StationLayout.Platform, b: StationLayout.Platform) -> bool:
		return a.line.path.at(a.stop.s).point().distance_squared_to(focus) < b.line.path.at(b.stop.s).point().distance_squared_to(focus))
	var keep: Dictionary[String, bool] = {}
	for k in mini(CROWD_PLATFORMS, near.size()):
		var p := near[k]
		keep[p.key] = true
		if not crowds.has(p.key):
			crowds[p.key] = StationCrowd.new(_crowd_spec(p))
			_crowd_platforms[p.key] = p
		var trains: Array[StationCrowd.CrowdTrain] = []
		for si in p.services.size():
			var sv := p.services[si]
			for t in sv.line.trains(clock):
				if t.state.stopped_at != sv.stop or taken.has(t.id):
					continue
				var ct := StationCrowd.CrowdTrain.new()
				ct.id = t.id
				ct.service = si
				ct.open = RailRules.door_openness(t.state)
				ct.dwell_left = t.state.dwell_left
				if not _loads.has(t.id):
					_loads[t.id] = StationCrowd.initial_load(t.id)
				ct.load = _loads[t.id]
				var dk := "%s|%s" % [p.key, t.id]
				if not _door_cache.has(dk):
					if _door_cache.size() > 64:
						_door_cache.clear()
					_door_cache[dk] = _crowd_doors(p, sv, t)
				ct.doors = _door_cache[dk]
				trains.append(ct)
		crowds[p.key].step(dt, StationCrowd.waiting_count(float(hour_of.call()), p.busy), trains)
	for key: String in crowds.keys():
		if not keep.has(key):
			crowds.erase(key)
			_crowd_platforms.erase(key)


func _crowd_spec(p: StationLayout.Platform) -> StationCrowd.Spec:
	var spec := StationCrowd.Spec.new()
	spec.half = RailRules.PLATFORM_LENGTH / 2.0
	for sv in p.services:
		var e := StationCrowd.Edge.new()
		e.w = sv.edge
		e.inward = sv.inward
		spec.edges.append(e)
	spec.exits = p.exits
	spec.middle = p.middle()
	spec.key = p.key
	spec.depth = minf(3.0, absf(p.far - p.near) - 1.0)
	# Nobody waits under the shed's name boards' posts at the ends, nor on the MRTS stair landing.
	spec.blocked = PackedVector2Array([Vector2(-RailRules.PLATFORM_LENGTH / 2.0, -RailRules.PLATFORM_LENGTH / 2.0 + 6.0), Vector2(RailRules.PLATFORM_LENGTH / 2.0 - 6.0, RailRules.PLATFORM_LENGTH / 2.0)])
	return spec


## A standing train's doorways on a platform's side, in the platform frame (u along, w at the edge).
func _crowd_doors(p: StationLayout.Platform, sv: StationLayout.Service, t: RailLine.TrainAt) -> PackedVector2Array:
	var out := PackedVector2Array()
	var f := TrainModels.formation(sv.line.train_type)
	var side := sv.line.stops[sv.stop].side
	for i in f.size():
		var ct: TrainModels.CarType = models.types.get(str(f[i][0]), null)
		if ct == null:
			continue
		var reversed := bool(f[i][1])
		var open_side := -side if not reversed else side
		var xf := trains_view.car_transform(sv.line, t.state.s, i)
		for door in ct.doors:
			if door.side != open_side:
				continue
			var w := xf * (door.rest.origin + door.slide * door.slide_m * 0.5)
			var hit := p.line.path.project_near(WorldOrigin.to_world(w), 30.0)
			out.append(Vector2(hit.s - p.stop.s, sv.edge))
	return out


## The platform people to draw (for `CityLife`'s figures): [key, scene position, yaw, walking speed, look].
func crowd_people(camera: Vector3) -> Array[Array]:
	var out: Array[Array] = []
	var limit := int(PRESETS[quality]["people"])
	for key: String in crowds.keys():
		var p := _crowd_platforms[key]
		var base := p.base() + RailRules.PLATFORM_HEIGHT
		var crowd := crowds[key]
		for person in crowd.people:
			if person.delay > 0.0:
				continue
			var at := WorldOrigin.to_scene(p.world(person.u, person.w), base)
			if at.distance_to(camera) > PEOPLE_DRAWN:
				continue
			# Heading in the platform frame (from +u towards +w) to a world yaw.
			var along := p.line.path.at(p.stop.s + person.u).yaw
			var yaw := along + person.heading
			var walking := person.state != StationCrowd.WAITING
			out.append([hash(key) * 1000 + person.id, at, yaw, StationCrowd.HURRY if person.state == StationCrowd.BOARDING else (StationCrowd.STROLL if walking else 0.0), person.look])
	out.sort_custom(func(a: Array, b: Array) -> bool: return (a[1] as Vector3).distance_squared_to(camera) < (b[1] as Vector3).distance_squared_to(camera))
	return out.slice(0, limit)


# --- level crossings ------------------------------------------------------------------------------------

func _add_crossings() -> void:
	for c in network.crossings:
		var n := CrossingView.make(c, materials)
		add_child(n)
		_crossing_nodes.append(n)


func _step_crossings(dt: float) -> void:
	var extra: Dictionary[String, float] = {}
	if cab != null:
		extra[cab.line.id] = cab.s
	var focus := _focus()
	var bell := 0.0
	if _crossing_closing.size() != network.crossings.size():
		_crossing_closing.resize(network.crossings.size())
	for i in network.crossings.size():
		var c := network.crossings[i]
		var want := LevelCrossing.closed_amount(network, c, clock, extra)
		var now := crossing_amounts[i]
		# The booms move at their own pace (SWING seconds end to end).
		var amount := move_toward(now, 1.0 if want > 0.0 else 0.0, dt / LevelCrossing.SWING)
		var at := Vector2(c.x, c.z)
		var heard := focus.distance_to(at)
		if want > 0.0 and now == 0.0:
			bells += 1
		# The booms' own sound as they start to go down and to come up again.
		var closing := 1 if want > 0.0 else 0
		if closing != _crossing_closing[i] and (closing == 1 or now > 0.0):
			Sound.rail.boom(closing == 1, heard)
		_crossing_closing[i] = closing
		bell = maxf(bell, RailSounds.bell_level(heard, amount))
		crossing_amounts[i] = amount
		(_crossing_nodes[i] as CrossingView).set_amount(amount, clock)
	Sound.rail.set_bell(bell)


## Road traffic stops at closed crossings: Vector3(x, z, radius) points across the road at each boom
## (for `CityLife`'s obstacles), world metres.
func crossing_obstacles() -> PackedVector3Array:
	var out := PackedVector3Array()
	for i in network.crossings.size():
		if crossing_amounts[i] <= 0.0:
			continue
		out.append_array((_crossing_nodes[i] as CrossingView).obstacles())
	return out


# --- the HUD ---------------------------------------------------------------------------------------------

func _update_hud(focus: Vector2) -> void:
	if hud == null:
		return
	match state:
		&"ride", &"walk":
			hud.set_mode(RailHud.RIDE)
			var tr := ride_line.train(ride_departure, clock) if ride_line != null else null
			if tr != null:
				var nxt := tr.state.stopped_at if tr.state.stopped_at >= 0 else tr.state.next_stop
				var stop := ride_line.stops[nxt] if nxt >= 0 else null
				var status := ("At %s" % stop.name) if tr.state.stopped_at >= 0 and stop != null else ("Next: %s" % (stop.name if stop != null else "end of the line"))
				hud.set_info("Train to %s" % ride_line.destination(), stop.name_ta if stop != null else "", status)
				hud.set_offers(RailRules.can_step_off(tr) and state == &"ride", false, false)
			else:
				hud.set_offers(false, false, false)
		&"cab":
			hud.set_mode(RailHud.CAB)
			var nxt := mini(cab.next, cab.line.stops.size() - 1)
			var stop := cab.line.stops[nxt]
			var mark := cab.to_mark()
			hud.set_info("%s · to %s" % [stop.name, cab.line.destination()], stop.name_ta, ("%d m to the stop mark" % roundi(mark)) if is_finite(mark) and mark > 0.0 else cab.state_text())
			var sig := cab.next_signal()
			hud.set_cab(cab.kmh(), cab.limit(), cab.notch, cab.doors_open, String(cab.aspect(sig)) if sig >= 0 else "green", cab.score)
			hud.set_vigilance(cab.vigilance_left(), cab.warning, cab.tripped)
			hud.set_offers(false, can_leave_cab(), false)
		_:
			var here := _station_here(focus)
			if here == null:
				hud.set_mode(RailHud.OFF)
				return
			hud.set_mode(RailHud.STATION)
			var rows := StationLayout.departure_rows(here, clock, 1)
			var line := ("Next train: %s, %s" % [rows[0].destination, rows[0].status.to_lower()]) if not rows.is_empty() else "No trains"
			hud.set_info("%s station" % here.station.name, here.station.name_ta, line)
			hud.set_offers(false, false, cab_offer_train() != null)


## The platform the player is on or right by, or null.
func _station_here(focus: Vector2) -> StationLayout.Platform:
	var height := rig.body.global_position.y if rig != null else 0.0
	for k in platforms.size():
		if _platform_points[k].distance_squared_to(focus) > 100.0 * 100.0:
			continue
		var p := platforms[k]
		if RailRules.stop_at(p.line, focus, height) == p.index:
			return p
		for sv in p.services:
			if RailRules.stop_at(sv.line, focus, height) == sv.stop:
				return p
	return null


## TIMETABLE: the next trains at the nearest station (or the line being ridden) and the route map.
func show_timetable() -> void:
	if hud == null:
		return
	if hud.timetable_open():
		hud.sheet.visible = false
		return
	var focus := _focus()
	var best: StationLayout.Platform = null
	for p in platforms:
		if best == null or p.line.path.at(p.stop.s).point().distance_to(focus) < best.line.path.at(best.stop.s).point().distance_to(focus):
			best = p
	var rows := PackedStringArray()
	var title := "Timetable"
	if best != null:
		title = "%s  ·  %s" % [best.station.name_ta, best.station.name]
		var hour := float(hour_of.call())
		for p in platforms:
			if p.station.id != best.station.id:
				continue
			for r in StationLayout.departure_rows(p, clock, 6):
				var at := StationLayout.clock_text(hour + r.wait / 3600.0)
				rows.append("%s   PF %d   %s   %s" % [at, r.platform, r.destination, r.status])
	rows.append("")
	rows.append("Lines (headways estimated, not the real timetable):")
	for line in network.lines:
		rows.append("%s · every %d min" % [line.name, roundi(line.headway / 60.0)])
	var map_lines: Array[Array] = []
	for line in network.lines:
		var c := Color(0.95, 0.55, 0.2) if line.system == "suburban" else (Color(0.4, 0.75, 1.0) if line.system == "mrts" else Color(0.85, 0.35, 0.35))
		map_lines.append([line.path.points, c])
	var marks: Array[Array] = []
	for st in network.stations:
		marks.append([Vector2(st.x, st.z), st.name])
	hud.show_timetable(title, rows, map_lines, marks, focus, network.attribution)


func _toast(text: String, seconds: float = 2.5) -> void:
	if hud != null:
		hud.show_toast(text, seconds)
	last_message = text


var last_message: String = ""


func _set_state(next: StringName) -> void:
	if state == next:
		return
	state = next
	state_changed.emit(next)


## What tests and the debug snapshot read (the Three.js `RailSnapshot`).
func snapshot() -> Dictionary:
	var tr := ride_line.train(ride_departure, clock) if ride_line != null else null
	var next_stop := ""
	if tr != null and tr.state.next_stop >= 0:
		next_stop = ride_line.stops[tr.state.next_stop].name
	return {
		"clock": clock, "state": state, "riding": ride_line.id if ride_line != null else "",
		"train": ride_id, "destination": ride_line.destination() if ride_line != null else "",
		"next_stop": next_stop, "fares": fares, "drawn_trains": trains_view.drawn_trains,
		"drawn_cars": trains_view.drawn_cars, "doors": trains_view.nearest_doors,
		"track_cells": tracks_view.shown_cells(), "platforms": stations_view.shown(),
		"solid_cars": trains_view.solid_cars(), "announcements": announcements, "horns": horns,
		"bells": bells, "crowds": crowds.size(),
	}
