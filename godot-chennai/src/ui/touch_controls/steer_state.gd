class_name SteerState
extends RefCounted
## Slide-to-steer, the "wheel" scheme (decision G-174): a thumb lands anywhere on the left, and
## sideways drag from where it landed steers; `FULL_LOCK` UI units of drag is full lock. Lifting
## the thumb eases the steering back to centre. `value` is what the driver sees (eased, -1..1);
## `raw` is the drag itself. Pure logic; time comes in as `dt`.
##
## `shape(raw, speed_share)` is the response curve applied on top (by `DriveInput`, so touch and
## stick share it): progressive (small slides steer gently, full slide is full lock) and
## speed-sensitive (less steering near top speed, because the vehicle's own lock already
## narrows with speed and a thumb overshoots at 80 km/h).

## Sideways drag for full lock, UI units (about 13 mm on a phone).
const FULL_LOCK := 70.0
## A slide smaller than this share is a resting thumb, not steering.
const DEAD_ZONE := 0.04
## How fast `value` follows the drag, per second (it reaches 90 % in about 0.15 s).
const FOLLOW_RATE := 15.0
## How fast it returns to centre after release, per second.
const CENTRE_RATE := 7.0
## The curve's exponent: 1 is linear; above 1 the first part of the slide steers less.
const CURVE_POWER := 1.6
## Steering kept at top speed (share of the low-speed steering).
const TOP_SPEED_STEER := 0.65

var active: bool = false
var origin_x: float = 0.0
var raw: float = 0.0
var value: float = 0.0


func begin(x: float) -> void:
	active = true
	origin_x = x
	raw = 0.0


func drag(x: float) -> void:
	if active:
		raw = clampf((x - origin_x) / FULL_LOCK, -1.0, 1.0)


func end() -> void:
	active = false
	raw = 0.0


## Ease `value` towards the drag (or back to centre), one step.
func step(dt: float) -> float:
	var target := raw if absf(raw) >= DEAD_ZONE else 0.0
	var rate := FOLLOW_RATE if active else CENTRE_RATE
	value += (target - value) * minf(1.0, rate * dt)
	if not active and absf(value) < 0.002:
		value = 0.0
	return value


## Holds the steering at `v` as if dragged (tests and scripted demos); 0 releases.
func hold(v: float) -> void:
	raw = clampf(v, -1.0, 1.0)
	value = raw
	active = v != 0.0


## The response curve: `x` in -1..1, `speed_share` the vehicle's speed over its top speed
## (0..1). Full lock at low speed is exactly 1.
static func shape(x: float, speed_share: float) -> float:
	var a := clampf(absf(x), 0.0, 1.0)
	var s := clampf(speed_share, 0.0, 1.0)
	var speed_factor := lerpf(1.0, TOP_SPEED_STEER, s * s * (3.0 - 2.0 * s))
	return signf(x) * pow(a, CURVE_POWER) * speed_factor
