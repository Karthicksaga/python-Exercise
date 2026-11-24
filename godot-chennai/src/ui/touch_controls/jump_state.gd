class_name JumpState
extends RefCounted
## Jump timing that forgives a thumb (decision G-173): a press up to 100 ms before landing still
## jumps on landing (buffer), and a press up to 80 ms after walking off a kerb still jumps
## (coyote time). Time comes in as `dt` per physics step, so it runs in game time. One jump per
## press and per leaving the ground. Pure logic.

const BUFFER := 0.10
const COYOTE := 0.08

## Seconds since the last press that has not been used yet; INF when none waits.
var _since_press: float = INF
## Seconds since the feet were last on the ground.
var _since_ground: float = INF
var _was_grounded: bool = false


## A press of the jump control.
func press() -> void:
	_since_press = 0.0


## Advance one step; true when the body should jump now. `grounded` is the body's state at the
## start of the step.
func tick(dt: float, grounded: bool) -> bool:
	_since_press += dt
	if grounded:
		_since_ground = 0.0
	else:
		_since_ground += dt
	_was_grounded = grounded
	var can := grounded or _since_ground <= COYOTE
	if _since_press <= BUFFER + 0.0001 and can:
		_since_press = INF
		# The jump uses up the ground: no second one in the coyote window.
		_since_ground = INF
		return true
	return false
