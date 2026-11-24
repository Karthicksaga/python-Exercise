class_name CornerTaps
extends RefCounted
## The hidden gesture that turns the performance overlay on and off (decision G-291): `COUNT`
## taps in the top-left corner, each within `GAP` seconds of the one before. Pure: the caller
## passes the time of each tap and the position, so tests drive it in game time.

const COUNT := 5
## The corner's side in UI units: a thumb-sized square at the screen's top-left.
const CORNER := 64.0
## Longest pause between two taps of one gesture, in seconds.
const GAP := 0.8

var _count: int = 0
var _last: float = -INF


## True when `at` is inside the corner.
static func in_corner(at: Vector2) -> bool:
	return at.x >= 0.0 and at.y >= 0.0 and at.x <= CORNER and at.y <= CORNER


## Records a tap at `at` at time `now`; true when it completes the gesture. A tap outside the
## corner, or one too long after the last, starts over.
func tap(at: Vector2, now: float) -> bool:
	if not in_corner(at):
		_count = 0
		return false
	_count = _count + 1 if now - _last <= GAP else 1
	_last = now
	if _count >= COUNT:
		_count = 0
		return true
	return false
