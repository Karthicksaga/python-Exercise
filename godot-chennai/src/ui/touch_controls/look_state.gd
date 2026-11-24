class_name LookState
extends RefCounted
## Camera look from a drag or a stick (decision G-172): sensitivity, invert-Y and a short glide.
## Drags are pushed in UI units; `step(dt)` hands out what to turn the camera by this step. The
## glide is a low-pass over the drag: it never adds distance (a 286-unit drag turns the camera
## by exactly 286 units' worth), it only lets the view settle for about a tenth of a second
## after the thumb leaves, which reads as inertia without overshoot. Pure logic.

## Time constant of the glide, seconds; 0 delivers everything at once.
const GLIDE := 0.03

var sensitivity: float = 1.0
var invert_y: bool = false
var glide: float = GLIDE
var _pending: Vector2 = Vector2.ZERO


## A drag of `delta` UI units (x right, y down) or a stick's share of a step.
func push(delta: Vector2) -> void:
	_pending += Vector2(delta.x, -delta.y if invert_y else delta.y) * sensitivity


## The look to apply this step (UI units, sensitivity and inversion already in).
func step(dt: float) -> Vector2:
	if glide <= 0.0 or dt <= 0.0:
		var all := _pending
		_pending = Vector2.ZERO
		return all
	var out := _pending * (1.0 - exp(-dt / glide))
	_pending -= out
	if _pending.length() < 0.01:
		out += _pending
		_pending = Vector2.ZERO
	return out


## Still gliding.
func moving() -> bool:
	return _pending != Vector2.ZERO


func reset() -> void:
	_pending = Vector2.ZERO
