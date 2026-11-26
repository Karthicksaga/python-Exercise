class_name BusBoarding
extends RefCounted
## Getting on and off a city bus on foot (decision G-220, the owner's request of 25 Nov): walk to
## the front door on the kerb side, up the step, along the aisle past the conductor (who sells the
## ticket), and sit on a free passenger seat, or stand by the rear rail when the bus is full; off
## again the same way back, down the step and onto the pavement. Every point comes from the bus's
## own manifest (`assets/vehicles/<bus>.json` through `VehicleType`: `entry.point`, `entry.aisle`,
## `seats`, the conductor's seat), in the bus's frame (+X right, +Y up, -Z forwards, metres from
## the chassis centre), so it fits every bus model. Pure logic: the game samples it each frame and
## moves the player's anchor, plays the walk clip and blends the seated pose.

const WALK := &"walk"
const STEP := &"step"
const TICKET := &"ticket"
const SIT := &"sit"
const STAND := &"stand"
const WAIT := &"wait"

## Walking pace in the bus and on the pavement, m/s; the step up or down, the ticket, sitting down
## and standing up, seconds (estimates).
const PACE := 1.25
const STEP_TIME := 0.7
const TICKET_TIME := 1.4
const SIT_TIME := 0.8
## The player stands this far behind the conductor's seat when the bus is full, and steps off this
## far from the door onto the pavement, metres.
const STAND_BEHIND := 0.9
const PAVEMENT := 1.2
## Hip joints above the figure's origin when seated (as `FareFigures.SEAT_HIP`).
const SEAT_HIP := 0.92


class Leg:
	extends RefCounted
	var kind: StringName = WALK
	var from: Vector3 = Vector3.ZERO
	var to: Vector3 = Vector3.ZERO
	var duration: float = 0.0
	## Seated amount at the end of the leg (0 standing, 1 seated).
	var sit_to: float = 0.0


var legs: Array[Leg] = []
## The seat taken (index into `VehicleType.seats`), or -1 standing.
var seat: int = -1
## Where the player rides: the figure's origin (feet, or the seated hips minus SEAT_HIP) and the
## seated amount there.
var ride_point: Vector3 = Vector3.ZERO
## True for getting off.
var leaving: bool = false
var floor_y: float = 0.0
var ground_y: float = 0.0


## The floor inside (the aisle's height) and where the conductor sits.
static func floor_of(t: VehicleType) -> float:
	return t.entry.aisle[0].y if not t.entry.aisle.is_empty() else 0.0


## The conductor's seat (hip joints, bus frame) from the manifest's `seat_conductor` row, moved
## to the drawn ground as `VehicleType.seats` are (G-267); else just behind the middle on the
## door side.
static func conductor_of(t: VehicleType, data: Dictionary) -> Vector3:
	var shift := 0.0
	var conductor: Variant = null
	for s: Dictionary in data.get("seats", []):
		var hip: Variant = s.get("hip")
		if hip == null:
			continue
		var h: Array = hip
		if String(s.get("role", "")) == "passenger" and shift == 0.0 and not t.seats.is_empty():
			shift = float(h[1]) - t.seats[0].y
		if String(s.get("role", "")) == "conductor":
			conductor = h
	if conductor != null:
		var c: Array = conductor
		return Vector3(float(c[0]), float(c[1]) - shift, float(c[2]))
	var y := t.seats[0].y if not t.seats.is_empty() else floor_of(t) + 0.5
	return Vector3(-0.85, y, 0.7)


## A free seat behind the conductor (so the player walks past them), nearest them first, on the
## aisle side; -1 when `full` or none is free. `taken`: seat indices already used.
static func choose_seat(t: VehicleType, conductor: Vector3, taken: PackedInt32Array, full: bool) -> int:
	if full:
		return -1
	var best := -1
	var best_score := INF
	for i in t.seats.size():
		if taken.has(i):
			continue
		var s := t.seats[i]
		if s.z < conductor.z + 0.3:
			continue
		var score := (s.z - conductor.z) + absf(s.x) * 0.5
		if score < best_score:
			best_score = score
			best = i
	return best


## Getting on: from `start` (the player's feet now, bus frame) to a seat or the standing place.
## `ground_y`: the road under the bus in its frame (`VehicleModel` ground, `model.position.y`).
static func board(t: VehicleType, start: Vector3, ground_y: float, conductor: Vector3, seat_index: int) -> BusBoarding:
	var b := BusBoarding.new()
	b.seat = seat_index
	b.ground_y = ground_y
	b.floor_y = floor_of(t)
	var door := Vector3(t.entry.point.x, ground_y, t.entry.point.y)
	var at := Vector3(start.x, ground_y, start.z)
	b._walk(at, door)
	var inside := t.entry.aisle[0] if not t.entry.aisle.is_empty() else Vector3(door.x * 0.4, b.floor_y, door.z)
	b._leg(STEP, door, inside, STEP_TIME, 0.0)
	var aisle_in := t.entry.aisle[t.entry.aisle.size() - 1] if t.entry.aisle.size() > 1 else Vector3(0, b.floor_y, inside.z)
	b._walk(inside, aisle_in)
	# Down the aisle (x = 0) to the conductor for the ticket.
	var by_conductor := Vector3(0.0, b.floor_y, conductor.z)
	b._walk(aisle_in, by_conductor)
	b._leg(TICKET, by_conductor, by_conductor, TICKET_TIME, 0.0)
	if seat_index >= 0:
		var hip := t.seats[seat_index]
		var in_aisle := Vector3(0.0, b.floor_y, hip.z)
		b._walk(by_conductor, in_aisle)
		b.ride_point = hip - Vector3(0, SEAT_HIP, 0)
		b._leg(SIT, in_aisle, b.ride_point, SIT_TIME, 1.0)
	else:
		b.ride_point = Vector3(0.0, b.floor_y, conductor.z + STAND_BEHIND)
		b._walk(by_conductor, b.ride_point)
		b._leg(STAND, b.ride_point, b.ride_point, 0.3, 0.0)
	return b


## Getting off: from the riding place back along the aisle, down the step, onto the pavement on
## the kerb side.
## `out_to`: where to step off to (bus frame), e.g. by the stop's pole; null: PAVEMENT beside the
## door.
static func alight(t: VehicleType, ride_point: Vector3, seated: bool, ground_y: float, out_to: Variant = null) -> BusBoarding:
	var b := BusBoarding.new()
	b.leaving = true
	b.ground_y = ground_y
	b.floor_y = floor_of(t)
	var in_aisle := Vector3(0.0, b.floor_y, ride_point.z)
	if seated:
		b._leg(SIT, ride_point, in_aisle, SIT_TIME, 0.0)
	else:
		b._walk(ride_point, in_aisle)
	var aisle_in := t.entry.aisle[t.entry.aisle.size() - 1] if t.entry.aisle.size() > 1 else Vector3(0, b.floor_y, t.entry.point.y)
	b._walk(in_aisle, aisle_in)
	var inside := t.entry.aisle[0] if not t.entry.aisle.is_empty() else aisle_in
	b._walk(aisle_in, inside)
	var door := Vector3(t.entry.point.x, ground_y, t.entry.point.y)
	b._leg(STEP, inside, door, STEP_TIME, 0.0)
	var side := -1.0 if t.entry.point.x < 0.0 else 1.0
	var out := door + Vector3(side * PAVEMENT, 0.0, 0.0)
	if out_to is Vector3:
		var o: Vector3 = out_to
		out = Vector3(o.x, ground_y, o.z)
	b._walk(door, out)
	b.ride_point = out
	return b


func _walk(a: Vector3, b: Vector3) -> void:
	var d := Vector2(b.x - a.x, b.z - a.z).length()
	if d > 0.02:
		_leg(WALK, a, b, d / PACE, 0.0)


func _leg(kind: StringName, a: Vector3, b: Vector3, duration: float, sit_to: float) -> void:
	var l := Leg.new()
	l.kind = kind
	l.from = a
	l.to = b
	l.duration = maxf(duration, 0.01)
	l.sit_to = sit_to
	legs.append(l)


func total() -> float:
	var t := 0.0
	for l in legs:
		t += l.duration
	return t


## Where the player is `time` seconds in: {position (figure origin, bus frame), yaw (bus frame, 0
## faces forwards), sit (0..1), kind, speed (m/s, for the walk clip), done}.
func sample(time: float) -> Dictionary:
	var t := maxf(0.0, time)
	var sit_before := 1.0 if leaving and not legs.is_empty() and legs[0].kind == SIT else 0.0
	for i in legs.size():
		var l := legs[i]
		if t <= l.duration or i == legs.size() - 1:
			var u := clampf(t / l.duration, 0.0, 1.0)
			var e := Boarding.ease_in_out(u) if l.kind != WALK else u
			var p := l.from.lerp(l.to, e)
			var dir := Vector2(l.to.x - l.from.x, l.to.z - l.from.z)
			var moving := dir.length() > 0.05 and (l.kind == WALK or l.kind == STEP)
			var yaw := atan2(-dir.x, -dir.y) if moving else 0.0
			var sit := lerpf(sit_before, l.sit_to, e) if l.kind == SIT else sit_before
			var speed := PACE if l.kind == WALK and u < 1.0 else 0.0
			return {"position": p, "yaw": yaw, "sit": sit, "kind": l.kind, "speed": speed, "done": time >= total(), "leg": i}
		t -= l.duration
		if l.kind == SIT:
			sit_before = l.sit_to
	return {"position": ride_point, "yaw": 0.0, "sit": 0.0, "kind": WAIT, "speed": 0.0, "done": true, "leg": legs.size()}


## Seconds until the player is inside the bus (past the step): the doors may close after it.
func inside_at() -> float:
	var t := 0.0
	for l in legs:
		t += l.duration
		if l.kind == STEP:
			return t
	return t


## Seconds until the ticket is sold (the conductor's leg ends), or -1.
func ticket_at() -> float:
	var t := 0.0
	for l in legs:
		t += l.duration
		if l.kind == TICKET:
			return t
	return -1.0
