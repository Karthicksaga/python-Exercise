class_name ReverseHold
extends RefCounted
## Reverse by holding BRAKE (decision G-175), replacing the P / R / D chips: hold BRAKE for
## `HOLD_TIME` while the vehicle is (nearly) stopped, `|speed| < STOPPED`, and it reverses;
## release BRAKE and it stops reversing (back to drive). Pressing GAS while reversing ends it as
## well (the driver wants to go forwards). Braking from speed never reverses by itself: the
## 0.4 s only counts once the vehicle has stopped. Pure logic; game time via `dt`.

const HOLD_TIME := 0.4
const STOPPED := 0.3

var reversing: bool = false
var _held: float = 0.0


## One step. `speed` is the signed forward speed (m/s). Returns whether to be reversing now.
func step(dt: float, brake: bool, gas: bool, speed: float) -> bool:
	if not brake or gas:
		reversing = false
		_held = 0.0
		return false
	if reversing:
		return true
	if absf(speed) < STOPPED:
		_held += dt
		if _held >= HOLD_TIME:
			reversing = true
	else:
		_held = 0.0
	return reversing


## Seconds of braking towards reverse so far (a hint can fill up with it).
func progress() -> float:
	return clampf(_held / HOLD_TIME, 0.0, 1.0)


func reset() -> void:
	reversing = false
	_held = 0.0
