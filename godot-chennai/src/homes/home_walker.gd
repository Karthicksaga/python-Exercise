class_name HomeWalker
extends RefCounted
## Walks a person along a route inside a home (G-235): constant pace, turning to face the way
## they go, stopping at the end. Pure; the interior scene reads `position`, `yaw` and `speed` to
## place the figure and play its walk clip. Positions are floor points in metres; `yaw` follows
## the player's convention (0 faces -z, so a direction (dx, dz) faces atan2(-dx, -dz)).

## Indoor pace, m/s (the clips' walk speed is 1.1; a little faster reads as brisk).
const PACE := 1.5
## How fast the figure turns to the way it goes, per second.
const TURN := 9.0

var position: Vector2 = Vector2.ZERO
var yaw: float = 0.0
var speed: float = 0.0
var _route: PackedVector2Array = PackedVector2Array()
var _next: int = 0


func place(at: Vector2, facing_yaw: float) -> void:
	position = at
	yaw = facing_yaw
	speed = 0.0
	_route = PackedVector2Array()
	_next = 0


## Starts walking along `route` (its first point is where the walk starts from and is skipped).
func go(route: PackedVector2Array) -> void:
	_route = route
	_next = 1


func arrived() -> bool:
	return _next >= _route.size()


func step(dt: float) -> void:
	if arrived():
		speed = 0.0
		return
	var target := _route[_next]
	var to := target - position
	var dist := to.length()
	var move := minf(dist, PACE * dt)
	if dist > 0.0001:
		var want := atan2(-to.x, -to.y)
		yaw += wrapf(want - yaw, -PI, PI) * minf(1.0, TURN * dt)
		position += to / dist * move
	speed = move / maxf(dt, 0.0001)
	if move >= dist - 0.0001:
		_next += 1
		if arrived():
			speed = 0.0
