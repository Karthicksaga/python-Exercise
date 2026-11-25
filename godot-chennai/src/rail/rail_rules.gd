class_name RailRules
extends RefCounted
## The railway's rules (port of the functions and constants in `packages/rail/src/network.ts` and
## `doors.ts`): platform sizes and where a platform is, which stop the player is at, who may
## board, when a ride ends and how far the sliding doors are open. Pure logic.

## Platform length (estimated: long enough for the game's four-coach trains, with room).
const PLATFORM_LENGTH := 110.0
## Platform height above the ground (or the viaduct's rail top), metres (Indian high-level
## platforms are about 0.84 m).
const PLATFORM_HEIGHT := 0.9
const PLATFORM_WIDTH := 4.0
## Distance from the track's centre to the platform's edge.
const PLATFORM_EDGE := 1.75
## Ticket for one ride, rupees (estimated: a second-class single for a short suburban trip).
const FARE := 5
## A Metro ride, rupees (estimated: one flat fare in the middle of the real distance slabs, G-462).
const METRO_FARE := 20


## The ticket for a ride on `line`.
static func fare_for(line: RailLine) -> int:
	return METRO_FARE if line != null and line.is_metro() else FARE

## Seconds the doors take to slide open or shut (doors.ts).
const DOOR_SLIDE := 1.2
## Seconds after stopping before the doors start to open, and before leaving that they are shut.
const DOOR_DELAY := 0.3


## Where a stop's platform is: its centre, the way the track runs and the side it lies on.
class PlatformPlace:
	extends RefCounted
	var x: float = 0.0
	var z: float = 0.0
	var yaw: float = 0.0
	var s: float = 0.0
	var lateral: float = 0.0
	## Rail-top height there (the viaduct; 0 on the ground). Godot addition.
	var base: float = 0.0

	func point() -> Vector2:
		return Vector2(x, z)


## Whether the player may board, and why not (`BoardingAnswer`).
class Answer:
	extends RefCounted
	var ok: bool = false
	var fare: int = 0
	var reason: String = ""


## Distance from the track's centre to the middle of a stop's platform.
static func platform_offset(stop: RailLine.Stop) -> float:
	return PLATFORM_EDGE + stop.width / 2.0


static func platform_of(line: RailLine, stop: RailLine.Stop) -> PlatformPlace:
	var lateral := stop.side * platform_offset(stop)
	var centre := line.path.beside(stop.s, lateral)
	var p := PlatformPlace.new()
	p.x = centre.x
	p.z = centre.y
	p.yaw = line.path.at(stop.s).yaw
	p.s = stop.s
	p.lateral = lateral
	p.base = line.height_at(stop.s)
	return p


## The stop whose platform (or the ground right by it) the player is at, or -1. `height`: the
## player's feet above the ground; an elevated platform counts only for someone up on it.
static func stop_at(line: RailLine, p: Vector2, height: float = 0.0) -> int:
	var where := line.path.project_near(p, 20.0)
	if where.distance > 16.0:
		return -1
	for i in line.stops.size():
		var stop := line.stops[i]
		if absf(where.s - stop.s) > PLATFORM_LENGTH / 2.0 + 8.0:
			continue
		if line.elevated() and absf(height - line.height_at(stop.s)) > 3.0:
			continue
		# On the platform's side of the track, or standing on the track by it.
		if where.lateral * stop.side > -2.5:
			return i
	return -1


## May the player board this train at stop `index`? The train must be standing there with time
## left, it must stop again on the map, and the player must have the fare.
static func boarding(train: RailLine.TrainAt, index: int, money: int) -> Answer:
	var a := Answer.new()
	var state := train.state
	var line := train.line
	var fare := fare_for(line)
	if state.stopped_at != index:
		a.reason = RailText.NOT_STANDING
	elif state.dwell_left < 1.5:
		a.reason = RailText.DOORS_CLOSING
	elif state.next_stop < 0:
		a.reason = (RailText.NEXT_BEYOND % line.to.name) if line.to.beyond else RailText.TERMINATES
	elif goes_underground(train):
		a.reason = RailText.UNDERGROUND_NEXT
	elif money < fare:
		a.reason = RailText.TICKET_COSTS % fare
	else:
		a.ok = true
		a.fare = fare
	return a


## True when the train's run to its next stop goes through a tunnel (G-462: rides end before one;
## nothing is drawn below the ground).
static func goes_underground(train: RailLine.TrainAt) -> bool:
	var next := train.state.next_stop
	if next < 0:
		return false
	return train.line.tunnel_between(train.state.s, train.line.stops[next].s) or train.line.underground_at(train.line.stops[next].s)


## True when a rider must get off here: the train stops on the map no more, or goes underground.
static func ride_ends_at(train: RailLine.TrainAt) -> bool:
	return train.state.stopped_at >= 0 and (train.state.next_stop < 0 or goes_underground(train))


## May a rider step off now? Only while the train stands at a station.
static func can_step_off(train: RailLine.TrainAt) -> bool:
	return train.state.stopped_at >= 0 and train.state.dwell_left > 0.2


## How far the doors are open, 0 shut to 1 open (eased), for a train in `state` that stops
## `dwell` seconds (doors.ts). With `dwell` < 0 the stop's own length is used (a terminus).
static func door_openness(state: RunProfile.TrainState, dwell: float = -1.0) -> float:
	if state.stopped_at < 0:
		return 0.0
	var total := state.dwell_total if dwell < 0.0 else dwell
	var since_stop := total - state.dwell_left
	var t := minf(since_stop - DOOR_DELAY, state.dwell_left - DOOR_DELAY) / DOOR_SLIDE
	var x := clampf(t, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)
