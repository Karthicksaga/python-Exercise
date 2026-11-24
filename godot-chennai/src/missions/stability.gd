## The stability of fragile cargo, 0 to 100 (G-143, `fragile` objectives): a wedding feast's
## sambar vessel, a patient's health. Drops from hard braking, hard cornering, speed breakers taken
## too fast, potholes and crashes; recovers slowly while the drive is smooth. At 0 the cargo is
## ruined. Pure logic; the numbers are estimates, tuned by play (like TD-28).
class_name Stability
extends RefCounted

## Braking harder than this (m/s^2) spills; loss per m/s^2 over, per second.
const BRAKE_SAFE := 4.5
const BRAKE_LOSS := 3.0
## Cornering harder than this (lateral m/s^2); loss per m/s^2 over, per second.
const CORNER_SAFE := 3.5
const CORNER_LOSS := 2.5
## A speed breaker taken faster than this (m/s, 14 km/h); loss per m/s over, once per breaker.
const BREAKER_SAFE := 4.0
const BREAKER_LOSS := 2.5
## A pothole: a flat loss plus this per m/s of speed (up to POTHOLE_SPEED_CAP).
const POTHOLE_BASE := 4.0
const POTHOLE_PER_SPEED := 0.5
const POTHOLE_SPEED_CAP := 12.0
## A crash of impact 1 (0..1 scales it).
const CRASH_LOSS := 40.0
## Smooth driving: braking and cornering under these, and moving; recovers this per second.
const SMOOTH_BRAKE := 2.0
const SMOOTH_CORNER := 2.0
const RECOVERY := 1.0
## Where the HUD turns the meter amber.
const WARN := 40.0
## The bonus goal "cargo above 90 %".
const BONUS_LEVEL := 90.0

signal ruined

var value := 100.0
var lowest := 100.0
var _was_ruined := false


func step(dt: float, decel: float, lateral: float, speed: float, breaker_speed: float = 0.0, pothole: bool = false, crash: float = 0.0) -> void:
	var loss := 0.0
	if decel > BRAKE_SAFE:
		loss += (decel - BRAKE_SAFE) * BRAKE_LOSS * dt
	if lateral > CORNER_SAFE:
		loss += (lateral - CORNER_SAFE) * CORNER_LOSS * dt
	if breaker_speed > BREAKER_SAFE:
		loss += (breaker_speed - BREAKER_SAFE) * BREAKER_LOSS
	if pothole:
		loss += POTHOLE_BASE + minf(speed, POTHOLE_SPEED_CAP) * POTHOLE_PER_SPEED
	if crash > 0.0:
		loss += CRASH_LOSS * minf(crash, 1.0)
	if loss > 0.0:
		value = maxf(0.0, value - loss)
	elif decel < SMOOTH_BRAKE and lateral < SMOOTH_CORNER and speed > 0.5:
		value = minf(100.0, value + RECOVERY * dt)
	lowest = minf(lowest, value)
	if value <= 0.0 and not _was_ruined:
		_was_ruined = true
		ruined.emit()


func is_ruined() -> bool:
	return value <= 0.0


func is_warning() -> bool:
	return value < WARN


## Whether the whole run stayed above the bonus level (the lowest point counts).
func stayed_above(level: float = BONUS_LEVEL) -> bool:
	return lowest >= level


func reset() -> void:
	value = 100.0
	lowest = 100.0
	_was_ruined = false
