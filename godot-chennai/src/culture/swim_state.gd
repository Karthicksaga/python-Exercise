class_name SwimState
extends RefCounted
## The swimming rules for one swimmer (G-484), pure logic. Safe by construction:
## - **where:** only shallow water inside its limits: the sea out to a rope line `sea_limit`
##   metres from the shore, a river or canal inside its banks. A move past a limit is slid back
##   to the limit, never blocked with a wall and never fatal;
## - **tiring:** swimming uses stamina (`stamina_seconds` of moving, treading water costs
##   `idle_drain` of that); at zero the swimmer is "tired" and drifts to the nearest shore by
##   itself (`tired_drift_speed`) and gets out. Nobody drowns, loses health or respawns;
## - **resting:** stamina comes back on land in `recover_seconds`.
## The wiring turns a swimmer's request into a world step with `move`; this class knows no nodes.

signal got_tired
signal reached_shore(point: Vector2)

## How far past the shore the swimmer is put when getting out, metres.
const LAND_STEP := 1.8

var rules: CultureData.Swim
var water: SwimWater
var swimming: bool = false
var tired: bool = false
## 1 full, 0 empty.
var stamina: float = 1.0
## The last answer for the swimmer's place (for the HUD and the figure).
var here: SwimWater.Sample = null


static func make(swim_rules: CultureData.Swim, swim_water: SwimWater) -> SwimState:
	var s := SwimState.new()
	s.rules = swim_rules
	s.water = swim_water
	return s


## Can the player get in from `point` (on land)? The sample of the water to enter, or null:
## water within `entry_reach` of the shore, not forbidden, not tired out.
func entry(point: Vector2) -> SwimWater.Sample:
	if swimming or stamina < 0.2 or water.forbidden(point):
		return null
	var s := water.sample(point)
	if s == null or s.depth > 0.0 or -s.depth > rules.entry_reach:
		return null
	return s


## Gets in at `point` (on land): the swimmer starts one metre inside the water. Returns the world
## point to start from, or Vector2.INF when the water is not reachable.
func begin(point: Vector2) -> Vector2:
	var s := entry(point)
	if s == null:
		return Vector2.INF
	swimming = true
	tired = false
	var start := s.shore + s.inward * 1.0
	here = water.sample(start)
	return start


## One step of `dt` seconds from `from` wanting to go `want` (unit or shorter vector, world
## metres per second share of the swim speed). Returns where the swimmer ends up; sets
## `swimming` false when the swimmer gets out (on the shore it ends on). Nothing here can fail.
func move(from: Vector2, want: Vector2, dt: float) -> Vector2:
	if not swimming:
		return from
	var moving := want.length() > 0.1
	var drain := (1.0 if moving else rules.idle_drain) / maxf(1.0, rules.stamina_seconds)
	stamina = maxf(0.0, stamina - drain * dt)
	if stamina <= 0.0 and not tired:
		tired = true
		got_tired.emit()
	var step := Vector2.ZERO
	if tired:
		# Drift to the nearest shore.
		var s := water.sample(from)
		if s != null:
			step = (s.shore - from).normalized() * rules.tired_drift_speed * dt
	elif moving:
		step = want.limit_length(1.0) * rules.speed * dt
	var to := _limited(from + step)
	here = water.sample(to)
	if here == null or here.depth <= 0.0:
		return _get_out(to)
	# Close to the shore and heading for it: out of the water.
	var toward_shore := moving and not tired and here.depth < 0.9 and want.normalized().dot(here.inward) < -0.3
	if toward_shore or (tired and here.depth < 1.2):
		return _get_out(to)
	return to


## Gets out where the swimmer is: on the nearest shore, a little way up the bank (the bank's stone
## bund, 0.55 m high, is stepped over by the ground's own step rule).
func leave(from: Vector2) -> Vector2:
	return _get_out(from)


func _get_out(near: Vector2) -> Vector2:
	var s := water.sample(near)
	var out := near
	if s != null:
		out = s.shore - s.inward * LAND_STEP
	swimming = false
	tired = false
	here = null
	reached_shore.emit(out)
	return out


## The point itself, or the nearest point inside the limits.
func _limited(to: Vector2) -> Vector2:
	var s := water.sample(to)
	if s == null:
		return to
	if s.kind == &"sea":
		var out := s.depth - rules.sea_limit
		if out > 0.0:
			return to - s.inward * out
		return to
	# A river: stay inside the banks by the margin.
	if s.depth < rules.bank_margin and s.depth > -rules.bank_margin * 6.0:
		return to + s.inward * (rules.bank_margin - s.depth)
	return to


## On land, resting: stamina comes back.
func rest(dt: float) -> void:
	if not swimming:
		stamina = minf(1.0, stamina + dt / maxf(1.0, rules.recover_seconds))


## True when the sea limit, not the bank, is what holds the swimmer back at `point`.
func at_rope(point: Vector2) -> bool:
	var s := water.sample(point)
	return s != null and s.kind == &"sea" and s.depth >= rules.sea_limit - 0.5
