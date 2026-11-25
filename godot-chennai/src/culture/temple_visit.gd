class_name TempleVisit
extends RefCounted
## The temple visit as a small state machine (G-473), in the order a visitor does it: come into
## the forecourt, leave the sandals at the stand, light the lamp, walk once round the shrines
## clockwise (pradakshina). No scoring of devotion, no timer and no penalty: nothing here fails.
## Sandals put back on when the visitor leaves the grounds; the lamp stays lit; the walk round
## counts only while the sandals are off and the lamp is lit. Pure logic: the wiring gives it the
## player's world position each step and shows the props.
##
## `event` carries what happened: &"entered", &"left", &"shoes_off", &"shoes_on", &"lamp",
## &"quarter" (each quarter of the walk round, with its number 1..3), &"complete".

signal event(what: StringName, number: int)

## A step bigger than this angle (rad) in one update is a jump (teleport), not walking.
const MAX_STEP_ANGLE := 0.9

var spec: CultureData.Temple
var zone: CultureData.Zone

var inside: bool = false
var shoes_off: bool = false
var lamp_lit: bool = false
var done: bool = false
## How far round the shrines the visitor has walked, radians (clockwise, never below 0).
var swept: float = 0.0
var _last_angle: float = 0.0
var _have_angle: bool = false
var _quarters: int = 0


static func make(temple: CultureData.Temple, temple_zone: CultureData.Zone) -> TempleVisit:
	var v := TempleVisit.new()
	v.spec = temple
	v.zone = temple_zone
	return v


## Share of the walk round done, 0..1.
func progress() -> float:
	return clampf(swept / (TAU * spec.circle_turns), 0.0, 1.0)


func near_stand(point: Vector2) -> bool:
	return inside and point.distance_to(spec.stand) <= spec.stand_reach


func near_lamp(point: Vector2) -> bool:
	return inside and point.distance_to(spec.lamp) <= spec.lamp_reach


## The sandals are left at the stand (the stand's ACTION). False when it is not time or place.
func leave_shoes(point: Vector2) -> bool:
	if shoes_off or not near_stand(point):
		return false
	shoes_off = true
	event.emit(&"shoes_off", 0)
	return true


## The lamp is lit (its ACTION): only with the sandals off.
func light_lamp(point: Vector2) -> bool:
	if lamp_lit or not shoes_off or not near_lamp(point):
		return false
	lamp_lit = true
	event.emit(&"lamp", 0)
	return true


## Call every physics step with the player's world position. `on_foot` false (in a vehicle, in
## the water) counts as outside.
func update(point: Vector2, on_foot: bool) -> void:
	var now := on_foot and point.distance_to(zone.centre) <= zone.radius
	if now and not inside:
		inside = true
		_have_angle = false
		event.emit(&"entered", 0)
	elif not now and inside:
		inside = false
		_have_angle = false
		swept = 0.0
		_quarters = 0
		if shoes_off:
			shoes_off = false
			event.emit(&"shoes_on", 0)
		event.emit(&"left", 0)
	if not inside:
		return
	_walk_round(point)


func _walk_round(point: Vector2) -> void:
	if not (shoes_off and lamp_lit) or done:
		_have_angle = false
		return
	var from := point - spec.circle_centre
	var r := from.length()
	if r < spec.circle_min or r > spec.circle_max:
		_have_angle = false
		return
	var angle := atan2(from.y, from.x)
	if _have_angle:
		var step := wrapf(angle - _last_angle, -PI, PI)
		# +z is south on the map: an increasing angle runs east, south, west, north: clockwise.
		if not spec.clockwise:
			step = -step
		if absf(step) <= MAX_STEP_ANGLE:
			swept = maxf(0.0, swept + step)
	_last_angle = angle
	_have_angle = true
	var quarter := int(swept / (TAU * spec.circle_turns) * 4.0)
	while _quarters < mini(quarter, 3):
		_quarters += 1
		event.emit(&"quarter", _quarters)
	if swept >= TAU * spec.circle_turns:
		done = true
		event.emit(&"complete", 0)


## Starts over after NEW GAME (the lamp is put out too).
func reset() -> void:
	inside = false
	shoes_off = false
	lamp_lit = false
	done = false
	swept = 0.0
	_quarters = 0
	_have_angle = false
