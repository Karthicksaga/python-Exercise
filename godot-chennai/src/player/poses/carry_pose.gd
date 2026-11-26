class_name CarryPose
extends RefCounted
## Carrying something (port of `packages/player/src/carryPose.ts`, decision G-431): a box held in
## both hands in front of the waist, a small box steadied on the right shoulder, a bag in one
## hand, both hands on a trolley bar. The Three.js game gave the arms bone directions; here the
## prop has anchors (where the palms go, in the figure frame) and the arms are solved onto them
## with the two-bone solver, so the hands really are on the box. The walk's arm swing is
## replaced by the grip (damped to nothing on the carrying arms; the free arm of the shoulder and
## bag carries still swings).
##
## One instance per figure, made on its first carry. `apply` allocates nothing (the prop is built
## once and kept; hidden when put down).

## Seconds to pick up or put down (the arms blend from the clip).
const RAMP := 0.3
const BOX := &"box"
const SHOULDER := &"shoulder"
const BAG := &"bag"
const PUSH := &"push"
const KINDS: Array[StringName] = [&"box", &"shoulder", &"bag", &"push"]
## Prop sizes (width, height, depth), metres: a parcel carton and a small box on the shoulder.
const BOX_SIZE := Vector3(0.36, 0.26, 0.28)
const SHOULDER_SIZE := Vector3(0.26, 0.2, 0.24)

var on: bool = false
var kind: StringName = BOX
## 0 empty-handed .. 1 carrying (ramps).
var amount: float = 0.0
## The prop (a MeshInstance3D child of the figure; null for kinds without one).
var prop: MeshInstance3D = null
## Palm targets of the last pose, figure frame, and the worst miss, metres.
var anchors: PackedVector3Array = PackedVector3Array([Vector3.ZERO, Vector3.ZERO])
var last_miss: float = 0.0
var prop_centre: Vector3 = Vector3.ZERO

var _clip: Array[Quaternion] = []
var _touch: PackedInt32Array = PackedInt32Array()
var _axes: Array[PackedVector3Array] = [PackedVector3Array(), PackedVector3Array()]
var _bound: PoseRig = null
static var _meshes: Dictionary[StringName, ArrayMesh] = {}


static func is_kind(k: StringName) -> bool:
	return KINDS.has(k)


func set_carry(want: bool, new_kind: StringName, host: Node3D) -> void:
	on = want
	if want:
		if new_kind != kind or prop == null:
			kind = new_kind
			_make_prop(host)
		elif prop != null:
			prop.visible = true


func active() -> bool:
	return on or amount > 0.0


func _make_prop(host: Node3D) -> void:
	if prop != null:
		prop.queue_free()
		prop = null
	if kind != BOX and kind != SHOULDER:
		return
	prop = MeshInstance3D.new()
	prop.name = "CarriedProp"
	prop.mesh = _mesh(kind)
	prop.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	prop.visible = false
	host.add_child(prop)


## The carton: cardboard with a tape band over the lid and a label, one draw call.
static func _mesh(k: StringName) -> ArrayMesh:
	if _meshes.has(k):
		return _meshes[k]
	var size := BOX_SIZE if k == BOX else SHOULDER_SIZE
	var b := LowPoly.Builder.new()
	b.add_box(size.x, size.y, size.z, 0, 0, 0, LowPoly.CARDBOARD)
	b.add_box(0.05, size.y + 0.006, size.z + 0.006, 0, 0, 0, LowPoly.TAPE)
	b.add_box(size.x * 0.35, size.y * 0.35, 0.004, size.x * 0.18, 0.0, size.z * 0.5 + 0.002, LowPoly.PAPER)
	var m := b.build()
	_meshes[k] = m
	return m


func _bind(r: PoseRig) -> void:
	if _bound == r:
		return
	_bound = r
	_clip.resize(r.index.size())
	_touch = PackedInt32Array()
	for s in 2:
		_touch.append(PoseRig.ARM[s])
		_touch.append(PoseRig.FOREARM[s])
		_touch.append(PoseRig.HAND[s])
		_axes[s] = HandReach.axes(r, s)
	for k in range(PoseRig.BONES.size(), r.index.size()):
		_touch.append(k)


## Lays the carrying pose on `r` after the clip (and the walk's arm swing).
func apply(r: PoseRig, dt: float) -> void:
	amount = move_toward(amount, 1.0 if on else 0.0, dt / RAMP)
	if amount <= 0.0:
		if prop != null:
			prop.visible = false
		return
	_bind(r)
	r.capture(_clip)
	var shoulder_r := r.at(PoseRig.ARM[1])
	var shoulder_l := r.at(PoseRig.ARM[0])
	var mid := (shoulder_r + shoulder_l) * 0.5
	var big := r.arm_length
	var miss := 0.0
	var both_hands := false
	match kind:
		BOX:
			# Held at the waist, in front of the chest; palms on the sides, fingers forwards and under.
			var c := Vector3(0.0, mid.y - 0.36, -0.30)
			prop_centre = c
			var hx := BOX_SIZE.x * 0.5 + 0.004
			anchors[0] = c + Vector3(-hx, -0.02, 0.02)
			anchors[1] = c + Vector3(hx, -0.02, 0.02)
			both_hands = true
			for s in 2:
				var out := 1.0 if s == 1 else -1.0
				var fingers := Vector3(-out * 0.35, -0.3, -0.9)
				miss = maxf(miss, HandReach.place_palm(r, s, anchors[s], r.at(PoseRig.ARM[s]) + Vector3(out * 0.5, -0.8, 0.3), fingers))
				HandReach.roll_palm(r, s, _axes[s], Vector3(-out, 0.0, 0.0))
				r.curl_fingers(s, 0.35)
		SHOULDER:
			var c := shoulder_r + Vector3(-0.03, 0.15, 0.0)
			prop_centre = c
			# The right palm steadies it from the front and below; the left arm hangs and swings.
			anchors[1] = c + Vector3(0.05, -0.04, -SHOULDER_SIZE.z * 0.5 - 0.004)
			anchors[0] = Vector3.ZERO
			miss = HandReach.place_palm(r, 1, anchors[1], shoulder_r + Vector3(0.8, 0.3, 0.1), Vector3(-0.2, 0.55, -0.8))
			HandReach.roll_palm(r, 1, _axes[1], Vector3(0.0, 0.0, 1.0))
			r.curl_fingers(1, 0.3)
		BAG:
			# A bag or tiffin carrier by its handle in the right hand, the arm a little forwards.
			anchors[1] = shoulder_r + Vector3(0.05, -big * 0.9, -big * 0.12)
			miss = HandReach.place_palm(r, 1, anchors[1], shoulder_r + Vector3(0.2, -0.9, 0.5), Vector3(0.0, -1.0, -0.1))
			r.curl_fingers(1, 0.9)
		PUSH:
			# Both hands forwards on a trolley bar at about hip height.
			var y := mid.y - 0.5
			anchors[0] = Vector3(-0.2, y, -0.55)
			anchors[1] = Vector3(0.2, y, -0.55)
			both_hands = true
			for s in 2:
				var out := 1.0 if s == 1 else -1.0
				miss = maxf(miss, HandReach.place_palm(r, s, anchors[s], r.at(PoseRig.ARM[s]) + Vector3(out * 0.5, -0.8, 0.3), Vector3(0.0, -0.1, -1.0)))
				HandReach.roll_palm(r, s, _axes[s], Vector3(0.0, -1.0, 0.0))
				r.curl_fingers(s, 0.8)
	last_miss = miss
	if prop != null:
		prop.visible = true
		prop.position = prop_centre
		prop.rotation = Vector3.ZERO
	var w := smoothstep(0.0, 1.0, amount)
	var sk := r.skeleton
	for k in _touch:
		# A one-handed carry leaves the free arm as the clip and the swing had it.
		if not both_hands and k < PoseRig.BONES.size() and (k == PoseRig.ARM[0] or k == PoseRig.FOREARM[0] or k == PoseRig.HAND[0]):
			continue
		var b := r.index[k]
		sk.set_bone_pose_rotation(b, _clip[k].slerp(sk.get_bone_pose_rotation(b), w))
	if w < 1.0 and prop != null:
		# Rising out of the hands while picked up or put down: sink a little.
		prop.position = prop_centre + Vector3(0.0, -0.25 * (1.0 - w), 0.0)
