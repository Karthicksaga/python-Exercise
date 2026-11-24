class_name StreetHits
extends RefCounted
## What a person on the street does when the player's vehicle reaches them (decision G-362). Pure
## rules, world metres (x, z as Vector2), no nodes; `StreetReactions` (src/app/city_life/) applies
## them. Speeds are game-design estimates, not measured.
##
## Bands by the vehicle's speed over the ground when its box touches the person:
## - below `STAGGER_FROM`: nothing (people already make way for slow vehicles: the AI's obstacles);
## - below `FALL_FROM`: **stagger**, a step back with a lean, looking at the vehicle;
## - from `FALL_FROM`: **fall**, knocked off the feet (`play_fall`), lies `LIE` s, gets up and walks on.
## A traffic rider (bike, auto) whose vehicle takes a hit of at least its kind's `fall_from` (the
## other side's severity, shared by mass) falls off; the vehicle stops and leans until they are back.
##
## **Children never.** Only adults can be struck: `can_be_hit` is false for a child or a crowd
## spot at play, whatever else is asked (AGENTS.md: children only where nothing can hurt them).

## Vehicle speeds (m/s) from which a touched person staggers, and falls.
const STAGGER_FROM := 1.0
const FALL_FROM := 4.0
## A person's radius for the touch test, metres.
const RADIUS := 0.3
## Seconds a fallen person lies still before getting up; a rider knocked off lies a little longer.
const LIE := 2.2
const RIDER_LIE := 2.6
## A knocked-down person keeps this share of the vehicle's speed, and leaves the ground at least
## (and at most) this fast upwards, m/s.
const PUSH_KEEP := 0.6
const UP_MIN := 1.2
const UP_MAX := 3.2
const UP_PER_SPEED := 0.18
## A stagger leans back for this long (seconds).
const STAGGER_TIME := 0.8
## Everyone within this distance (metres) turns to look, and walkers stop or run off.
const BYSTANDER_REACH := 8.0
const SCARE_SECONDS := 4.0
## A traffic vehicle within this distance honks at the driver who hit someone.
const HONK_REACH := 30.0


## Whether this person can ever be hurt by a vehicle: never a child, never a crowd spot at play.
static func can_be_hit(child: bool, play: bool) -> bool:
	return not child and not play


## &"none", &"stagger" or &"fall" for a vehicle at `speed` m/s.
static func band(speed: float) -> StringName:
	if speed >= FALL_FROM:
		return &"fall"
	if speed >= STAGGER_FROM:
		return &"stagger"
	return &"none"


## Does a circle of `radius` at `p` touch the vehicle's box (centre, unit forward, half width and
## half length)?
static func touches(centre: Vector2, forward: Vector2, half: Vector2, p: Vector2, radius: float) -> bool:
	var r := p - centre
	var along := r.dot(forward)
	var across := r.dot(Vector2(-forward.y, forward.x))
	var dx := maxf(0.0, absf(across) - half.x)
	var dz := maxf(0.0, absf(along) - half.y)
	return dx * dx + dz * dz <= radius * radius


## Did the box, moving with `velocity` over the last `dt` seconds to `centre`, touch `p` anywhere
## on the way (three samples: the step is at most about 0.7 m at 20 m/s and 30 Hz)?
static func swept(centre: Vector2, forward: Vector2, half: Vector2, velocity: Vector2, dt: float, p: Vector2, radius: float) -> bool:
	for i in 3:
		if touches(centre - velocity * dt * (float(i) / 2.0), forward, half, p, radius):
			return true
	return false


## The launch of a person knocked down by a vehicle at `velocity` (x, z), standing `offset` from
## its centre (x, z): along the travel and a little away from the vehicle's line, upwards.
## Scene axes: x, y up, z.
static func launch(velocity: Vector2, offset: Vector2) -> Vector3:
	var speed := velocity.length()
	var dir := velocity / speed if speed > 0.001 else Vector2.ZERO
	var side := Vector2(-dir.y, dir.x)
	var away := side * signf(offset.dot(side)) if absf(offset.dot(side)) > 0.05 else Vector2.ZERO
	var flat := (dir + away * 0.35) * speed * PUSH_KEEP
	return Vector3(flat.x, clampf(UP_PER_SPEED * speed, UP_MIN, UP_MAX), flat.y)


## Does a traffic rider fall off at `their_kmh` (the severity their vehicle felt), given their
## kind's `fall_from` (km/h, `vehicle_types.json`; negative for closed seats: a car or bus driver
## stays in and honks)?
static func rider_falls(fall_from: float, their_kmh: float) -> bool:
	return fall_from >= 0.0 and their_kmh >= fall_from
