class_name FrameTimeline
extends RefCounted
## Where one frame's main-thread time went (decision G-340), for the hitch line of the overlay
## and the perf log. Pure: the caller marks the frame's boundaries with timestamps (µs) as they
## happen and reads the last complete frame.
##
## Godot runs a frame as: for each physics step (the scripts' physics callbacks, their deferred
## calls, then the physics engine: its step, sync and the contact queries with their signals),
## then the scripts' process callbacks, then deferred calls, timers, tweens and the delete queue
## (`queue_free`), then drawing, then the frame cap, vsync, input and the OS (order checked on
## 4.7.2). Two probe nodes (first and last in callback order), a deferred call queued by the last
## one, and the renderer's pre-draw and post-draw signals mark those edges. Headless runs never
## draw: the time after the delete queue then counts as "frees".

enum Part { PHYSICS_SCRIPTS, PHYSICS_DEFERRED, PHYSICS_ENGINE, SCRIPTS, DEFERRED, FREES, RENDER, BETWEEN }
const LABELS: Array[String] = ["physics scripts", "physics deferred calls", "physics engine", "scripts", "deferred calls", "timers, tweens and frees", "render", "between frames"]
const PARTS := 8

## µs per part of the last complete frame, and its total.
var last := PackedInt64Array()
var last_total: int = 0
## Physics steps the last complete frame ran, and its slowest engine step (µs).
var last_steps: int = 0
var last_worst_step: int = 0
## Complete frames seen.
var frames: int = 0

var _current := PackedInt64Array()
var _steps: int = 0
var _worst_step: int = 0
var _mark: int = -1
var _part: int = Part.BETWEEN


func _init() -> void:
	last.resize(PARTS)
	_current.resize(PARTS)


## The time since the last mark belongs to the part that was running; `next` runs from now.
func _to(now: int, next: int) -> void:
	if _mark >= 0:
		var d := maxi(0, now - _mark)
		_current[_part] += d
		if _part == Part.PHYSICS_ENGINE:
			_worst_step = maxi(_worst_step, d)
	_mark = now
	_part = next


## A frame starts at the first physics step or, with none, at the first process callback; it
## starts a new frame when the previous one already ran its scripts. True when a frame closed.
func _maybe_close(now: int) -> bool:
	if _part != Part.DEFERRED and _part != Part.FREES and _part != Part.RENDER and _part != Part.BETWEEN:
		return false
	_to(now, _part)
	if _current[Part.SCRIPTS] == 0 and _current[Part.PHYSICS_SCRIPTS] == 0 and _steps == 0:
		_reset()
		return false
	var total := 0
	for i in PARTS:
		last[i] = _current[i]
		total += _current[i]
	last_total = total
	last_steps = _steps
	last_worst_step = _worst_step
	frames += 1
	_reset()
	return true


func _reset() -> void:
	_current.fill(0)
	_steps = 0
	_worst_step = 0


func physics_start(now: int) -> bool:
	var closed := _maybe_close(now)
	_to(now, Part.PHYSICS_SCRIPTS)
	_steps += 1
	return closed


func physics_end(now: int) -> void:
	_to(now, Part.PHYSICS_DEFERRED)


## The deferred call queued at `physics_end` ran: the engine's step comes next.
func physics_deferred(now: int) -> void:
	if _part == Part.PHYSICS_DEFERRED:
		_to(now, Part.PHYSICS_ENGINE)


func process_start(now: int) -> bool:
	var closed := _maybe_close(now)
	_to(now, Part.SCRIPTS)
	return closed


func process_end(now: int) -> void:
	_to(now, Part.DEFERRED)


## The deferred call queued at `process_end` ran: timers, tweens and the delete queue next.
func deferred(now: int) -> void:
	if _part == Part.DEFERRED:
		_to(now, Part.FREES)


func pre_draw(now: int) -> void:
	_to(now, Part.RENDER)


func post_draw(now: int) -> void:
	_to(now, Part.BETWEEN)


## ms of one part of the last frame.
func ms(part: int) -> float:
	return last[part] / 1000.0


## The biggest part of the last frame.
func largest() -> int:
	var best := 0
	for i in PARTS:
		if last[i] > last[best]:
			best = i
	return best


## "physics engine 61.0 (2 steps, worst 58.3) · scripts 3.1 · …" for the last frame, parts over
## 0.5 ms, largest first.
func breakdown() -> String:
	var order: Array[int] = []
	for i in PARTS:
		if last[i] >= 500:
			order.append(i)
	order.sort_custom(func(a: int, b: int) -> bool: return last[a] > last[b])
	var out := PackedStringArray()
	for i in order:
		var s := "%s %.1f" % [LABELS[i], ms(i)]
		if i == Part.PHYSICS_ENGINE:
			s += " (%d steps, worst %.1f)" % [last_steps, last_worst_step / 1000.0]
		out.append(s)
	return " · ".join(out) if not out.is_empty() else "no part over 0.5 ms"
