## The player's swing between pressing HIT and the blow landing (port of `SwingClock` in
## `combat/src/Strikes.ts`): `begin` starts it, `step` says when it lands (once). One at a time.
class_name SwingClock
extends RefCounted

var _left := 0.0
var _swinging := ""


## The swing under way ("punch", "bat"), or "".
func kind() -> String:
	return _swinging


## Start a swing; false (and nothing changes) while one is already winding up.
func begin(strike: String) -> bool:
	if _swinging != "":
		return false
	_swinging = strike
	_left = Strikes.windup(strike)
	return true


## Advance; returns the kind of blow on the step it lands, else "".
func step(dt: float) -> String:
	if _swinging == "":
		return ""
	_left -= dt
	if _left > 1e-9:
		return ""
	var landed := _swinging
	_swinging = ""
	return landed


## Drop a swing that has not landed (getting into a vehicle, knocked out).
func cancel() -> void:
	_swinging = ""
