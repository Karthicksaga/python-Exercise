class_name StrikePose
extends RefCounted
## How a punch, a hook and a bat swing look over time (port of `packages/player/src/strikePose.ts`
## and the poses of `HumanFigure`, decision G-430). The timing is the Three.js one, so a blow is
## drawn landing when its damage does: wind-up to the hit frame, then recovery.
##
## The poses themselves are procedural on the shared `PoseRig`, laid over the clip (and the walk's
## arm swing) every step: the hands are placed with the two-bone arm solver on points relative to
## the shoulders (a fist) or to the chest (the bat's arc: hands move on a circle about the body),
## the upper body turns into the blow, the fists close. Where the Three.js game had directions
## of arm bones judged by eye, targets let the test measure that the fist really is out at the hit
## frame. `step` allocates nothing; one instance per figure, made on its first blow.

## The pose a blow is "between" (see `frame`).
const CLIP := &"clip"
const PUNCH := &"punch"
const HOOK := &"hook"
const BAT := &"bat"

## Seconds of wind-up (to the hit frame) and recovery after it, as `STRIKES` of Strikes.ts.
const PUNCH_WINDUP := 0.12
const PUNCH_RECOVER := 0.26
const BAT_WINDUP := 0.22
const BAT_RECOVER := 0.38
## Seconds a flinch lasts.
const FLINCH_TIME := 0.4
## Bat model: grip to the middle of the blade, metres (cricket bat, `WeaponModels`).
const BAT_BLADE_MID := 0.55

## Key names and when each is reached, as (share of the wind-up, share of the recovery).
const KEY_NAMES: Dictionary[StringName, Array] = {
	&"punch": [&"clip", &"chamber", &"jab", &"jab", &"clip"],
	&"hook": [&"clip", &"hookWind", &"hook", &"hook", &"clip"],
	&"bat": [&"clip", &"batBack", &"batHit", &"batFollow", &"clip"],
}
const KEY_TIMES: Dictionary[StringName, Array] = {
	&"punch": [Vector2(0, 0), Vector2(0.5, 0), Vector2(1, 0), Vector2(1, 0.3), Vector2(1, 1)],
	&"hook": [Vector2(0, 0), Vector2(0.5, 0), Vector2(1, 0), Vector2(1, 0.3), Vector2(1, 1)],
	&"bat": [Vector2(0, 0), Vector2(0.6, 0), Vector2(1, 0), Vector2(1, 0.4), Vector2(1, 1)],
}


## Two poses a blow is between and how far from the first to the second.
class Frame extends RefCounted:
	var from_key: StringName = &"clip"
	var to_key: StringName = &"clip"
	var amount: float = 0.0
	## False once the blow is over (Three.js: null).
	var active: bool = false


# ---- timing (pure; the tests port strikePose.test.ts) ----

static func _smooth(x: float) -> float:
	return x * x * (3.0 - 2.0 * x)


## `move` is &"punch", &"hook" or &"bat". Each stretch is eased, except the blow itself (drawn
## back to the hit), which speeds up into the strike. Fills and returns `out` (a new one if null).
static func frame(move: StringName, t: float, windup: float, recover: float, out: Frame = null) -> Frame:
	var f := out if out != null else Frame.new()
	f.active = false
	var names: Array = KEY_NAMES[move]
	var times: Array = KEY_TIMES[move]
	var n := names.size()
	var last: Vector2 = times[n - 1]
	if t < 0.0 or t >= last.x * windup + last.y * recover:
		return f
	for i in range(1, n):
		var a: Vector2 = times[i - 1]
		var b: Vector2 = times[i]
		var start := a.x * windup + a.y * recover
		var end := b.x * windup + b.y * recover
		if t >= end:
			continue
		var x := (t - start) / (end - start) if end > start else 1.0
		var striking := b.x == 1.0 and b.y == 0.0
		f.from_key = names[i - 1]
		f.to_key = names[i]
		f.amount = x * x if striking else _smooth(x)
		f.active = true
		return f
	return f


## How far the striking hand is closed (0 relaxed, 1 a fist): closes during the wind-up, opens
## over the end of the recovery.
static func fist_amount(t: float, windup: float, recover: float) -> float:
	if t < 0.0 or t >= windup + recover:
		return 0.0
	if t < windup * 0.5:
		return _smooth(t / (windup * 0.5))
	var opening := windup + recover * 0.6
	if t <= opening:
		return 1.0
	return 1.0 - _smooth((t - opening) / (windup + recover - opening))


## How far a flinch has the upper body bent away (0..1): snaps back fast, then recovers.
static func flinch_amount(t: float) -> float:
	if t < 0.0 or t >= FLINCH_TIME:
		return 0.0
	var rise := 0.06
	if t < rise:
		return _smooth(t / rise)
	return 1.0 - _smooth((t - rise) / (FLINCH_TIME - rise))


## The move of a kind: jab and cross are punches.
static func move_of(kind: StringName) -> StringName:
	if kind == &"bat":
		return BAT
	return HOOK if kind == &"hook" else PUNCH


static func is_kind(kind: StringName) -> bool:
	return kind == &"jab" or kind == &"cross" or kind == &"hook" or kind == &"bat"


# ---- one blow on one figure ----

var kind: StringName = &""
var side: int = 1
var move: StringName = PUNCH
var windup: float = PUNCH_WINDUP
var recover: float = PUNCH_RECOVER
## Seconds since the blow started.
var t: float = 0.0
var active: bool = false
var hit_fired: bool = false
## The wrist target of the striking hand at the last posed step (figure frame) and the miss.
var wrist_target: Vector3 = Vector3.ZERO
var last_miss: float = 0.0
## Where the blow lands in the figure frame at the last posed step (the fist, or the blade).
var point: Vector3 = Vector3.ZERO

var _frame: Frame = Frame.new()
var _pa: PackedFloat32Array = PackedFloat32Array()
var _pb: PackedFloat32Array = PackedFloat32Array()
var _clip: Array[Quaternion] = []
var _touch: PackedInt32Array = PackedInt32Array()
var _axes: Array[PackedVector3Array] = [PackedVector3Array(), PackedVector3Array()]
var _bound: PoseRig = null


func _init() -> void:
	_pa.resize(9)
	_pb.resize(9)


func start(new_kind: StringName, new_side: int) -> void:
	kind = new_kind
	side = clampi(new_side, 0, 1)
	move = move_of(new_kind)
	windup = BAT_WINDUP if move == BAT else PUNCH_WINDUP
	recover = BAT_RECOVER if move == BAT else PUNCH_RECOVER
	t = 0.0
	hit_fired = false
	active = true


func cancel() -> void:
	active = false


func total_time() -> float:
	return windup + recover


## The bones this pose writes (blended back to the clip's value as the blow ends).
func _bind(r: PoseRig) -> void:
	if _bound == r:
		return
	_bound = r
	_clip.resize(r.index.size())
	_touch = PackedInt32Array([PoseRig.SPINE, PoseRig.SPINE1, PoseRig.SPINE2, PoseRig.NECK, PoseRig.HEAD])
	for s in 2:
		_touch.append(PoseRig.ARM[s])
		_touch.append(PoseRig.FOREARM[s])
		_touch.append(PoseRig.HAND[s])
		_axes[s] = HandReach.axes(r, s)
	# Finger joints follow the core bones in `index`.
	for k in range(PoseRig.BONES.size(), r.index.size()):
		_touch.append(k)


## Advances the blow by `dt` seconds of game time. With `show` the pose is laid on `r` (after the
## clip); without it only the clock runs (a figure out of sight). True on the step that reaches
## the hit frame (the pose is already on `r` then).
func step(r: PoseRig, dt: float, show: bool) -> bool:
	if not active:
		return false
	t += dt
	var fired := false
	if not hit_fired and t >= windup:
		hit_fired = true
		fired = true
	if t >= windup + recover:
		active = false
		return fired
	if show and r != null:
		_pose(r)
	return fired


## Punch keys (in arm lengths from the striking shoulder): forwards, inwards, up; the elbow's
## direction (out, up, back); the body's turn. Bat keys: yaw about the chest (+ to the right),
## radius, height; elbow; turn; the bat's yaw and pitch (a ninth value each).
const KEY_PARAMS: Dictionary[StringName, Array] = {
	&"chamber": [0.30, 0.30, -0.22, 0.4, -0.6, 0.6, -0.25, 0.0, 0.0],
	&"jab": [0.93, 0.18, 0.0, 0.5, -0.8, 0.0, 0.35, 0.0, 0.0],
	&"hookWind": [0.55, -0.45, 0.0, 0.9, 0.2, 0.2, -0.45, 0.0, 0.0],
	&"hook": [0.80, 0.45, 0.02, 0.9, 0.1, 0.0, 0.5, 0.0, 0.0],
	&"batBack": [1.75, 0.27, 0.22, 0.8, 0.2, 0.5, -0.6, 2.5, 1.0],
	&"batHit": [-0.25, 0.46, -0.28, 0.6, -0.5, 0.2, 0.25, -0.5, 0.0],
	&"batFollow": [-1.05, 0.40, -0.12, 0.2, -0.4, -0.3, 0.65, -1.7, 0.25],
}


func _key_params(key: StringName, out: PackedFloat32Array) -> void:
	var p: Array = KEY_PARAMS[key]
	for i in 9:
		out[i] = float(p[i])


func _pose(r: PoseRig) -> void:
	frame(move, t, windup, recover, _frame)
	if not _frame.active:
		return
	_bind(r)
	var wa := 0.0 if _frame.from_key == CLIP else 1.0
	var wb := 0.0 if _frame.to_key == CLIP else 1.0
	var w := lerpf(wa, wb, _frame.amount)
	if w <= 0.0001:
		return
	if _frame.from_key == CLIP:
		_key_params(_frame.to_key, _pa)
	elif _frame.to_key == CLIP:
		_key_params(_frame.from_key, _pa)
	else:
		_key_params(_frame.from_key, _pa)
		_key_params(_frame.to_key, _pb)
		for i in 9:
			_pa[i] = lerpf(_pa[i], _pb[i], _frame.amount)
	r.capture(_clip)
	var sk := r.skeleton
	var is_bat := move == BAT
	var sgn := 1.0 if (is_bat or side == 1) else -1.0
	# The upper body turns into the blow, the head keeps looking ahead.
	var tw := _pa[6] * sgn
	r.bend(PoseRig.SPINE, Vector3.UP, tw * 0.2)
	r.bend(PoseRig.SPINE1, Vector3.UP, tw * 0.35)
	r.bend(PoseRig.SPINE2, Vector3.UP, tw * 0.45)
	r.bend(PoseRig.NECK, Vector3.UP, -tw * 0.3)
	r.bend(PoseRig.HEAD, Vector3.UP, -tw * 0.3)
	var big := r.arm_length
	if is_bat:
		_solve_bat(r, big)
	else:
		_solve_punch(r, big, sgn)
	var fist := fist_amount(t, windup, recover)
	r.curl_fingers(0, 1.0 if is_bat else fist)
	r.curl_fingers(1, 1.0 if is_bat else fist)
	for k in _touch:
		var b := r.index[k]
		sk.set_bone_pose_rotation(b, _clip[k].slerp(sk.get_bone_pose_rotation(b), w))


func _solve_punch(r: PoseRig, big: float, sgn: float) -> void:
	var s := side
	var shoulder := r.at(PoseRig.ARM[s])
	var f := _pa[0] * big
	var inward := _pa[1] * big
	var up := _pa[2] * big
	wrist_target = shoulder + Vector3(-sgn * inward, up, -f)
	var pole := shoulder + Vector3(sgn * _pa[3], _pa[4], _pa[5])
	r.reach(PoseRig.ARM[s], PoseRig.FOREARM[s], PoseRig.HAND[s], wrist_target, pole)
	# The fist lies along the forearm.
	var fore := (r.at(PoseRig.HAND[s]) - r.at(PoseRig.FOREARM[s])).normalized()
	HandReach.aim_fingers(r, s, fore)
	point = _fist_point(r, s)
	# The other hand guards the face.
	var g := 1 - s
	var gsgn := -sgn
	var gs := r.at(PoseRig.ARM[g])
	var guard := gs + Vector3(-gsgn * 0.30 * big, 0.04 * big, -0.42 * big)
	r.reach(PoseRig.ARM[g], PoseRig.FOREARM[g], PoseRig.HAND[g], guard, gs + Vector3(gsgn * 0.4, -0.8, 0.2))
	var gfore := (r.at(PoseRig.HAND[g]) - r.at(PoseRig.FOREARM[g])).normalized()
	HandReach.aim_fingers(r, g, gfore)
	last_miss = r.at(PoseRig.HAND[s]).distance_to(wrist_target)


func _fist_point(r: PoseRig, s: int) -> Vector3:
	var kn := r.knuckle[s]
	if kn < 0:
		return r.at(PoseRig.HAND[s])
	return r.to_fig * r.skeleton.get_bone_global_pose(kn).origin


func _solve_bat(r: PoseRig, _big: float) -> void:
	var centre := (r.at(PoseRig.ARM[0]) + r.at(PoseRig.ARM[1])) * 0.5
	var yaw := _pa[0]
	var rad := _pa[1]
	var palm_right := centre + Vector3(sin(yaw) * rad, _pa[2], -cos(yaw) * rad)
	var by := _pa[7]
	var bp := _pa[8]
	var dir := Vector3(sin(by) * cos(bp), sin(bp), -cos(by) * cos(bp)).normalized()
	var palm_left := palm_right - dir * 0.14
	var sr := r.at(PoseRig.ARM[1])
	var sl := r.at(PoseRig.ARM[0])
	var miss := HandReach.place_axis(r, 1, palm_right, sr + Vector3(_pa[3], _pa[4], _pa[5]), _axes[1][1], dir)
	HandReach.place_axis(r, 0, palm_left, sl + Vector3(-0.5, -0.7, 0.2), _axes[0][1], dir)
	last_miss = miss
	wrist_target = palm_right
	point = r.palm(1) + dir * BAT_BLADE_MID
