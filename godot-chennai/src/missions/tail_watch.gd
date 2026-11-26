## Rules of a `tail` objective (G-143), the inverse of `chase`: keep between `near` and `far`
## metres of a moving target without being noticed. Inside `notice` metres for longer than `grace`
## seconds fills suspicion fast; between `notice` and `near` it fills slowly; a red light run
## beside the target adds a jump; in the safe band suspicion drains. Beyond `far` for more than
## `lost_after` seconds the target is lost. Pure logic; numbers are estimates.
class_name TailWatch
extends RefCounted

const CLOSE_RATE := 25.0
const NEAR_RATE := 4.0
const DRAIN_RATE := 8.0
const RED_LIGHT_JUMP := 15.0
## Suspicion at which the target spots you.
const SPOTTED := 100.0
const WARN := 50.0
const LOST_AFTER := 6.0

var near := 25.0
var far := 90.0
var notice := 12.0
var grace := 2.0
var suspicion := 0.0
var peak := 0.0
## Seconds spent inside `notice` at a stretch, and beyond `far`.
var close_time := 0.0
var lost_time := 0.0
## What ended it: "", "spotted" or "lost".
var outcome := ""


static func make(near_m: float, far_m: float, notice_m: float, grace_s: float) -> TailWatch:
	var t := TailWatch.new()
	t.near = near_m
	t.far = far_m
	t.notice = notice_m
	t.grace = grace_s
	return t


## `distance`: metres to the target; `ran_red_light`: the player crossed a red this step beside it.
func step(dt: float, distance: float, ran_red_light: bool = false) -> void:
	if outcome != "":
		return
	if distance < notice:
		close_time += dt
		if close_time > grace:
			suspicion += CLOSE_RATE * dt
	else:
		close_time = 0.0
		if distance < near:
			suspicion += NEAR_RATE * dt
		elif distance <= far:
			suspicion = maxf(0.0, suspicion - DRAIN_RATE * dt)
	if distance > far:
		lost_time += dt
		suspicion = maxf(0.0, suspicion - DRAIN_RATE * dt)
	else:
		lost_time = 0.0
	if ran_red_light and distance <= far:
		suspicion += RED_LIGHT_JUMP
	suspicion = clampf(suspicion, 0.0, SPOTTED)
	peak = maxf(peak, suspicion)
	if suspicion >= SPOTTED:
		outcome = "spotted"
	elif lost_time > LOST_AFTER:
		outcome = "lost"


func is_warning() -> bool:
	return suspicion >= WARN


## Whether the whole tail went unnoticed enough for a bonus goal: suspicion never above `level`.
func stayed_under(level: float) -> bool:
	return peak <= level
