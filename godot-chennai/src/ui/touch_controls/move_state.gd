class_name MoveState
extends RefCounted
## The walking stick turned into what the body is asked for (decision G-171), from any device:
## a radial dead zone, then run with hysteresis. Push past 0.85 of the stick's travel to run;
## ease back under 0.70 to walk again, so a thumb wobbling round 0.8 does not flicker between
## gaits. Optionally "toggle run": a press of the run control latches running until the stick is
## let go (`run_toggle`). Pure logic: no nodes, no clock (it has none to keep).

const DEAD_ZONE := 0.12
const RUN_ABOVE := 0.85
const WALK_BELOW := 0.70
## The most a walking stick asks for, just under `PlayerController.RUN_THRESHOLD` (0.82) so the
## body's own run rule never disagrees with this one.
const WALK_CAP := 0.80

## Move asked for: x right, y forward, length 0..1, dead zone removed and rescaled.
var move: Vector2 = Vector2.ZERO
var running: bool = false
var run_toggle: bool = false
var _latched: bool = false


## `raw` is the stick (length 0..1; longer is clamped); `run_held` a button held for running
## (Shift); returns `move`.
func update(raw: Vector2, run_held: bool = false) -> Vector2:
	var m := minf(raw.length(), 1.0)
	if m < DEAD_ZONE:
		move = Vector2.ZERO
		running = false
		_latched = false
		return move
	if run_toggle:
		# Toggle mode: only the run control starts running; the stick's edge does not.
		running = false
	elif m >= RUN_ABOVE:
		running = true
	elif m < WALK_BELOW:
		running = false
	var out := (m - DEAD_ZONE) / (1.0 - DEAD_ZONE)
	var run_now := running or run_held or _latched
	if not run_now:
		out = minf(out, WALK_CAP)
	move = raw.normalized() * out
	return move


## The run control was pressed (toggle mode): running stays on until the stick is released.
func press_run() -> void:
	if run_toggle and move != Vector2.ZERO:
		_latched = not _latched


## True when the body should run (hysteresis, held run button or the toggle).
func wants_run(run_held: bool = false) -> bool:
	return move != Vector2.ZERO and (running or run_held or _latched)


func reset() -> void:
	move = Vector2.ZERO
	running = false
	_latched = false
