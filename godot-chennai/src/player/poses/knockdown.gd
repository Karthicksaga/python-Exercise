class_name Knockdown
extends RefCounted
## Falling, lying and getting up, procedurally on the skeleton (decision G-262; no clips, no
## physics bodies). The person's owner keeps moving the figure's node (a thrown body, a walker the
## AI holds); this only poses the skeleton relative to that node, after the clip.
##
## A strong throw (or one from behind) is a head-first dive that rolls three quarters of a turn
## through the air and lands on the back; a weaker push buckles the knees and falls backwards.
## Down: crumple (knees drawn up, arms in), then lie still on the back, one knee raised, head to
## one side. Getting up: sit up on the hands, one knee, then stand into whatever the clip plays.
## Every phase starts from the pose the body is in, so nothing snaps.

## Seconds to stand up from lying: sit up, turn onto the knees, one knee, stand. The crash
## throw's own get-up (`CrashFlight.RISE_TIME`) is the same (G-262; 0.75 s was too quick to
## show four poses without the legs passing through the ground).
const GETUP_TIME := 1.2
## Shares of GETUP_TIME: sit up, crouch on the knees, one knee, stand into the clip.
const GETUP_SHARES: PackedFloat32Array = [0.25, 0.25, 0.2, 0.3]
## Seconds of each part of going down.
const CRUMPLE_TIME := 0.25
## How fast the body rolls on over the ground after an early landing, rad/s.
const ROLL_SPEED := 5.0
const SETTLE_TIME := 0.7
## A fall without a dive takes this long to reach the ground.
const FALL_TIME := 0.5
## Throws at least this fast (horizontal, m/s) dive and roll.
const DIVE_SPEED := 4.0
const GRAVITY := 9.81
## Lowest a joint may be above the ground once down, metres (the body's surface is beyond it).
const JOINT_CLEARANCE := 0.06

## &"" (not down), &"falling", &"down", &"rising".
var state: StringName = &""
## Which way the body turns to fall (radians about +Y in the figure frame).
var yaw: float = 0.0
var dives: bool = false
var _rig: PoseRig
var _t: float = 0.0
var _air: float = 0.5
var _segment: StringName = &""
var _seg_t: float = 0.0
var _seg_len: float = 1.0
var _from: Array[Quaternion] = []
var _from_hips: Vector3 = Vector3.ZERO
var _to: Array[Quaternion] = []
var _to_hips: Vector3 = Vector3.ZERO
var _clip: Array[Quaternion] = []
## The pose written on the last update (what is on screen; the clip overwrites the skeleton
## before the next update runs).
var _shown: Array[Quaternion] = []
var _shown_hips: Vector3 = Vector3.ZERO
var _getup_wanted: bool = false
var _landed: bool = false
## The dive's pitch when it touched down: the roll carries on through the crumple from there.
var _land_pitch: float = 0.0
var _dived_landing: bool = false


func _init(rig: PoseRig) -> void:
	_rig = rig
	var n := rig.index.size()
	_from.resize(n)
	_to.resize(n)
	_clip.resize(n)
	_shown.resize(n)
	KnockdownPoses.build(rig)


func active() -> bool:
	return state != &""


## Off the feet with `velocity` in the figure frame (m/s). Call after this frame's clip.
func fall(velocity: Vector3) -> void:
	var flat := Vector2(velocity.x, velocity.z)
	var face_v := atan2(-velocity.x, -velocity.z) if flat.length() > 0.05 else 0.0
	var back_to_v := wrapf(face_v + PI, -PI, PI)
	dives = flat.length() >= DIVE_SPEED or velocity.y > 2.5 or absf(back_to_v) > deg_to_rad(100.0)
	yaw = face_v if dives else back_to_v
	_air = maxf(0.35, 2.0 * maxf(0.0, velocity.y) / GRAVITY + 0.15)
	_t = 0.0
	_landed = false
	_getup_wanted = false
	# From what is on screen: the clip's pose, or the last fall's if it was already down.
	if state == &"":
		_from_hips = _rig.capture(_from)
	else:
		_take_shown()
	state = &"falling"
	_segment = &""
	if dives:
		_begin(&"dive", &"tumble", 0.22)
	else:
		_begin(&"fall", &"crumple", FALL_TIME)


## Touched the ground (a dive lands now; a plain fall is already on its way down).
func land() -> void:
	if state != &"falling":
		return
	_landed = true
	state = &"down"
	_dived_landing = dives
	_land_pitch = _dive_pitch()
	# Landed early in the dive: the rest of the roll is a forward roll on the ground, at a speed
	# a body rolls (about 5 rad/s), not the rest of the flight's spin squeezed into the crumple.
	var roll_left := absf(-1.5 * PI - _land_pitch) if dives else 0.0
	_begin(&"crumple", &"crumple", clampf(roll_left / ROLL_SPEED, CRUMPLE_TIME, 0.7))


## Stand up (lands first if still in the air).
func get_up() -> void:
	if state == &"" or state == &"rising":
		return
	if state == &"falling":
		_getup_wanted = true
		land()
		return
	state = &"rising"
	_begin(&"situp", &"situp", GETUP_TIME * GETUP_SHARES[0])


## One update after the clip (`dt` game seconds). Returns true on the update the person is up.
func step(dt: float) -> bool:
	if state == &"":
		return false
	_t += dt
	_seg_t += dt
	if state == &"falling" and not dives and _seg_t >= _seg_len:
		state = &"down"
		_landed = true
		_begin(&"settle", &"lying", SETTLE_TIME)
	elif state == &"falling" and dives and _t >= _air:
		land()
	elif _seg_t >= _seg_len:
		match _segment:
			&"crumple":
				_dived_landing = false
				if _getup_wanted:
					state = &"rising"
					_begin(&"situp", &"situp", GETUP_TIME * GETUP_SHARES[0])
				else:
					_begin(&"settle", &"lying", SETTLE_TIME)
			&"situp":
				_begin(&"crouch", &"crouch", GETUP_TIME * GETUP_SHARES[1])
			&"crouch":
				_begin(&"kneel", &"kneel", GETUP_TIME * GETUP_SHARES[2])
			&"kneel":
				_begin(&"stand", &"", GETUP_TIME * GETUP_SHARES[3])
			&"stand":
				state = &""
				_segment = &""
				return true
	_write()
	return false


func _begin(segment: StringName, key: StringName, seconds: float) -> void:
	if _segment != &"":
		_take_shown()
	_segment = segment
	_seg_t = 0.0
	_seg_len = seconds
	if key != &"":
		_to_hips = KnockdownPoses.load_key(_rig, key, yaw, _to)


func _write() -> void:
	var t := smoothstep(0.0, 1.0, clampf(_seg_t / maxf(0.001, _seg_len), 0.0, 1.0))
	if _segment == &"stand":
		# Into the clip's own pose (read before it is overwritten), the turn unwinding.
		var clip_hips := _rig.capture(_clip)
		_rig.blend(_from, _from_hips, _clip, clip_hips, t)
		# Into the clip's planted feet: only keep the body out of the ground on the way.
		var low_s := _rig.lowest_joint()
		if low_s < 0.0:
			_rig.place_hips(_hip_mid() + Vector3(0, -low_s, 0))
	else:
		_rig.blend(_from, _from_hips, _to, _to_hips, t)
		if _segment == &"dive":
			_dive_root(_dive_pitch(), 0.0, _rig.hip_height)
		elif _segment == &"crumple" and _dived_landing:
			# Finish the roll forwards onto the back (slerping could swing it either way).
			var key: Array = KnockdownPoses.KEYS[&"crumple"]
			var end_pitch := -1.5 * PI
			_dive_root(lerpf(_land_pitch, end_pitch, t), float(key[1]) * t, _hip_mid().y)
		if _landed:
			var low := _rig.lowest_joint()
			if low < JOINT_CLEARANCE:
				_rig.place_hips(_hip_mid() + Vector3(0, JOINT_CLEARANCE - low, 0))
	_shown_hips = _rig.capture(_shown)


func _take_shown() -> void:
	for k in _shown.size():
		_from[k] = _shown[k]
	_from_hips = _shown_hips


## The dive's pitch now: three quarters of a turn forwards over the flight.
func _dive_pitch() -> float:
	return -1.5 * PI * smoothstep(0.0, 1.0, clampf(_t / _air, 0.0, 1.0))


## The body's orientation set explicitly (the dive and the landing after it): turned by `yaw`,
## rolled by `roll`, pitched by `pitch`, the hip joints `hip_y` above the ground.
func _dive_root(pitch: float, roll: float, hip_y: float) -> void:
	var turn := Basis(Vector3.UP, yaw * clampf(_t / 0.2, 0.0, 1.0)) * Basis(Vector3.BACK, roll) * Basis(Vector3.RIGHT, pitch)
	var hb := _rig.index[PoseRig.HIPS]
	var skel_turn := _rig.turn * turn * _rig.turn.inverse()
	_rig.skeleton.set_bone_pose_rotation(hb, (Basis(skel_turn) * Basis(_rig.rest_rot[PoseRig.HIPS])).get_rotation_quaternion())
	_rig.place_hips(Vector3(0, hip_y, 0))


func _hip_mid() -> Vector3:
	return (_rig.at(PoseRig.UPLEG[0]) + _rig.at(PoseRig.UPLEG[1])) * 0.5
