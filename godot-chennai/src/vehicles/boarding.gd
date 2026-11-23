class_name Boarding
extends RefCounted
## Getting in and out of a vehicle as a timed sequence instead of a switch (decision G-77; a port
## of the Three.js `Boarding.ts`, with the carjacking `pull` phase of TD-30). Getting in: walk to
## the door, open it, (pull the driver out,) climb in and sit down, pull it shut. Getting out:
## open the door, stand up and step out; the player walks away while the door swings shut.
## Vehicles without a door (auto, motorbike) skip the door steps.
##
## Pure numbers, no scene: `Driving` turns `walk`, `aisle`, `seated` and `door` into the rider's
## place and pose and the door's angle. Durations are estimates, tuned by eye in the Three.js game.

const BOARD_WALK_SPEED := 1.4
const APPROACH_LIMIT := 1.5
const DOOR_OPEN_TIME := 0.5
const SIT_TIME := 0.7
const SWING_TIME := 0.8
const DOOR_CLOSE_TIME := 0.4
const PULL_TIME := 0.9
const AISLE_LIMIT := 1.2

## "in" or "out".
var direction: String = "in"
var entry: VehicleType.Entry
var _phases: Array[StringName] = []
var _durations: PackedFloat32Array = []
var _total := 0.0
var _time := 0.0
var _index := 0
var _started := false


## @param approach length of the walk to the entry point, metres (getting in)
## @param aisle length of the walk along the floor inside, metres (0 when there is none)
## @param pull getting in: someone is at the wheel and is pulled out first
func _init(dir: String, vehicle_entry: VehicleType.Entry, approach: float = 0.0, aisle: float = 0.0, pull: bool = false) -> void:
	direction = dir
	entry = vehicle_entry
	var door := entry.door != "none"
	var sit := SWING_TIME if entry.style == "swing" else SIT_TIME
	var climb := minf(AISLE_LIMIT, aisle / BOARD_WALK_SPEED) if aisle > 0.0 else 0.0
	if dir == "in":
		_push(&"approach", minf(APPROACH_LIMIT, maxf(0.0, approach) / BOARD_WALK_SPEED))
		if door:
			_push(&"open", DOOR_OPEN_TIME)
		if pull:
			_push(&"pull", PULL_TIME)
		_push(&"climb", climb)
		_push(&"sit", sit)
		if door:
			_push(&"close", DOOR_CLOSE_TIME)
	else:
		if door:
			_push(&"open", DOOR_OPEN_TIME)
		_push(&"stand", sit)
		_push(&"out", climb)
		if door:
			_push(&"close", DOOR_CLOSE_TIME)
	for d in _durations:
		_total += d


func _push(phase: StringName, duration: float) -> void:
	if duration > 0.0:
		_phases.append(phase)
		_durations.append(duration)


## Seconds the whole sequence takes.
func duration() -> float:
	return _total


func duration_of(phase: StringName) -> float:
	var i := _phases.find(phase)
	return _durations[i] if i >= 0 else 0.0


func phase() -> StringName:
	return _phases[_index] if _index < _phases.size() else &"done"


func done() -> bool:
	return _index >= _phases.size()


## Share of the whole sequence gone, 0 to 1.
func progress() -> float:
	if _total <= 0.0:
		return 1.0
	var before := 0.0
	for i in mini(_index, _phases.size()):
		before += _durations[i]
	return minf(1.0, (before + _time) / _total)


## How far into the current phase, 0 to 1 (linear).
func phase_progress() -> float:
	if done():
		return 1.0
	return minf(1.0, _time / _durations[_index])


## Getting out: true once the rider stands outside with control back (the door may still close).
func is_free() -> bool:
	if direction == "in":
		return false
	var p := phase()
	return p == &"close" or p == &"done"


## How far the door is open, 0 shut to 1 fully open (eased); always 0 without a door.
func door() -> float:
	if entry.door == "none":
		return 0.0
	var p := phase_progress()
	match phase():
		&"approach", &"done":
			return 0.0
		&"open":
			return ease_in_out(p)
		&"close":
			return 1.0 - ease_in_out(p)
	return 1.0


## Share of the walk to the entry point done (1 once there; never walked getting out).
func walk() -> float:
	if direction == "out":
		return 1.0
	return phase_progress() if phase() == &"approach" else 1.0


## Share of the walk along the floor inside, from the door (0) to the last standing point (1).
func aisle() -> float:
	var p := phase()
	if direction == "in":
		if p in [&"approach", &"open", &"pull"]:
			return 0.0
		return phase_progress() if p == &"climb" else 1.0
	if p == &"open" or p == &"stand":
		return 1.0
	return 1.0 - phase_progress() if p == &"out" else 0.0


## From standing (0) to seated (1), linear.
func seated() -> float:
	var p := phase()
	if direction == "in":
		if p == &"sit":
			return phase_progress()
		return 1.0 if p == &"close" or p == &"done" else 0.0
	if p == &"open":
		return 1.0
	return 1.0 - phase_progress() if p == &"stand" else 0.0


## Advance by `dt` seconds; returns what happened, in order: &"door_opening", &"pulled",
## &"seated", &"shut", &"free", &"done".
func step(dt: float) -> Array[StringName]:
	var events: Array[StringName] = []
	if done():
		return events
	if not _started and phase() == &"open":
		events.append(&"door_opening")
	_started = true
	_time += maxf(0.0, dt)
	while not done() and _time >= _durations[_index]:
		var finished := _phases[_index]
		_time -= _durations[_index]
		_index += 1
		if finished == &"pull":
			events.append(&"pulled")
		if finished == &"sit":
			events.append(&"seated")
		if finished == &"close":
			events.append(&"shut")
		var next := phase()
		if next == &"open":
			events.append(&"door_opening")
		if direction == "out" and (finished == &"stand" or finished == &"out") and (next == &"close" or next == &"done"):
			events.append(&"free")
	if done():
		events.append(&"done")
	return events


## Smooth start and stop, 0 to 1.
static func ease_in_out(t: float) -> float:
	var x := clampf(t, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)


## The walk from `from` to the entry point in the chassis frame (x right, y = chassis z), going
## round the front or back when the player is on the far side, never through the body.
static func approach_path(from: Vector2, vehicle_entry: VehicleType.Entry, half: Vector2, margin: float = 0.55) -> PackedVector2Array:
	var to := vehicle_entry.point
	var out := PackedVector2Array([from])
	var corner_x := half.x + margin
	var corner_z := half.y + margin
	var side := float(vehicle_entry.side)
	var on_door_side := from.x * side >= half.x + 0.1
	var beside := absf(from.y) <= corner_z
	if not on_door_side:
		var end := 1.0 if absf(from.y - corner_z) + absf(to.y - corner_z) <= absf(from.y + corner_z) + absf(to.y + corner_z) else -1.0
		var z := end * corner_z
		if beside:
			out.append(Vector2(side * corner_x if from.x * side > 0.0 else -side * corner_x, z))
		out.append(Vector2(side * corner_x, z))
	out.append(to)
	var clean := PackedVector2Array([out[0]])
	for i in range(1, out.size()):
		if out[i].distance_to(out[i - 1]) > 1e-6:
			clean.append(out[i])
	return clean


static func path_length(points: PackedVector2Array) -> float:
	var length := 0.0
	for i in range(1, points.size()):
		length += points[i].distance_to(points[i - 1])
	return length


## The point a share `f` of the way along a path, and the leg's heading (0 faces -Z): (x, z, heading).
static func along_path(points: PackedVector2Array, f: float) -> Vector3:
	if points.is_empty():
		return Vector3.ZERO
	var left := clampf(f, 0.0, 1.0) * path_length(points)
	for i in range(1, points.size()):
		var a := points[i - 1]
		var b := points[i]
		var leg := a.distance_to(b)
		var heading := atan2(-(b.x - a.x), -(b.y - a.y))
		if left <= leg or i == points.size() - 1:
			var t := minf(1.0, left / leg) if leg > 0.0 else 1.0
			var p := a.lerp(b, t)
			return Vector3(p.x, p.y, heading)
		left -= leg
	return Vector3(points[0].x, points[0].y, 0.0)
