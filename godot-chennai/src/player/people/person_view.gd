class_name PersonView
extends Node3D
## One person of the cast drawn in the street (a walker, someone in a crowd, a driver): their GLB
## (`assets/people/<id>.glb`, decision G-10: `Body` near, `Body_LOD1` from 30 m) playing one of
## its own clips (idle, walk, run, sit, talk). No physics, no AnimationTree: the AI moves it and
## the clip loops; walking clips run at the walker's speed so the feet keep up.
##
## Far figures (beyond LOD_DISTANCE) animate every third frame (`AnimationPlayer` in manual mode,
## advanced by the owner with `advance(dt)`): a figure that small does not show it, and the
## skeleton update is most of a figure's cost (G-127, measured in `CityLife`).
##
## On top of the clip (G-260…G-263): walkers and runners swing their arms with the opposite leg
## (`GaitSwing`), a seated person can take a vehicle's seat pose (`set_seat`), and anyone can be
## knocked down and get up (`play_fall`, `play_landed`, `play_getup`; docs/handoff.md).

## Back on their feet after `play_getup()`.
signal got_up

## The switch to the low-detail body, metres (brief §7: figures at 30 m).
const LOD_DISTANCE := 30.0
## Speed of the walk clip's feet at speed_scale 1, m/s (a natural stroll, the cast's walk).
const WALK_CLIP_SPEED := 1.3
## Faster than the clip's own 2.0 m/s stride for a quicker cadence (G-264).
const RUN_CLIP_SPEED := 3.0
const GETUP_TIME := Knockdown.GETUP_TIME
## Frames between animation updates for a far figure.
const FAR_EVERY := 3
## Only figures this close cast a shadow (each shadow is two more draw calls).
const SHADOW_NEAR := 18.0

var person_id: String = ""
var player: AnimationPlayer = null
## The clip playing: &"idle", &"walk", &"run", &"sit", &"talk".
var clip: StringName = &""
## Seat height of the person (the `sit` clip sits on a seat this high), metres.
var seat_height: float = 0.45
var _far: bool = false
var _skip: int = 0
var _pending: float = 0.0
var _body_mesh: MeshInstance3D = null
var _shadow := true
## The body for the procedural poses (null if the model lacks a core bone).
var poser: PoseRig = null
var swing_enabled: bool = true
## The seat pose shown over the `sit` clip (null: the clip as it is).
var seat: SeatPose = null
var _knock: Knockdown = null
var _seat_rots: Array[Quaternion] = []
var _seat_hips: Vector3 = Vector3.ZERO
var _seat_id: int = 0
var _seat_version: int = -1


## A view of person `id` from its loaded scene (no file access here; the pool loads scenes).
static func make(id: String, scene: PackedScene, seat: float) -> PersonView:
	var v := PersonView.new()
	v.name = "Person_%s" % id.replace("-", "_")
	v.person_id = id
	v.seat_height = seat
	var body := scene.instantiate() as Node3D
	# The cast faces glTF +Z; the game's heading 0 faces -Z.
	body.rotation.y = PI
	v.add_child(body)
	for n in body.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		var lod1 := String(mi.name).ends_with("_LOD1")
		mi.visibility_range_begin = LOD_DISTANCE if lod1 else 0.0
		mi.visibility_range_end = 0.0 if lod1 else LOD_DISTANCE
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if lod1 else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		if not lod1:
			v._body_mesh = mi
	v.player = body.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if v.player != null:
		v.player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	var skeletons := body.find_children("*", "Skeleton3D", true, false)
	if not skeletons.is_empty():
		var sk := skeletons[0] as Skeleton3D
		v.poser = PoseRig.make(sk, body.transform * RigData._relative(sk, body))
	return v


## Show a clip; `speed` m/s sets the gait's pace (walk and run), `phase` seconds into the clip
## (so two people side by side are not in step).
func play(next: StringName, speed: float = 0.0, phase: float = 0.0) -> void:
	if player == null:
		return
	if next == &"walk" or next == &"run":
		var base := WALK_CLIP_SPEED if next == &"walk" else RUN_CLIP_SPEED
		player.speed_scale = clampf(speed / base, 0.35, 1.8) if speed > 0.05 else 0.0
	else:
		player.speed_scale = 1.0
	if next != &"sit":
		seat = null
	if next == clip:
		return
	clip = next
	if player.has_animation(next):
		player.play(next)
		if phase > 0.0:
			player.seek(fposmod(phase, maxf(0.1, player.current_animation_length)), true)


## Advance the clip by `dt` (called every frame by the owner); `distance` to the camera decides
## whether this frame's update can be skipped.
func advance(dt: float, distance: float) -> void:
	if player == null:
		return
	_far = distance > LOD_DISTANCE
	var shadow := distance < SHADOW_NEAR
	if shadow != _shadow and _body_mesh != null:
		_shadow = shadow
		_body_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_pending += dt
	if _far:
		_skip += 1
		if _skip < FAR_EVERY:
			return
		_skip = 0
	player.advance(_pending)
	_after_clip(_pending)
	_pending = 0.0


func _after_clip(dt: float) -> void:
	if poser == null:
		return
	if _knock != null and _knock.active():
		if _knock.step(dt):
			got_up.emit()
		return
	if seat != null:
		if _seat_rots.size() != poser.index.size():
			_seat_rots.resize(poser.index.size())
		if seat.get_instance_id() != _seat_id or seat.version != _seat_version:
			seat.apply(poser)
			_seat_hips = poser.capture(_seat_rots)
			_seat_id = seat.get_instance_id()
			_seat_version = seat.version
		else:
			poser.restore(_seat_rots, _seat_hips)
		return
	if swing_enabled and player.speed_scale > 0.0 and (clip == &"walk" or clip == &"run"):
		GaitSwing.apply(poser, 1.0 if clip == &"walk" else 0.0, 1.0 if clip == &"run" else 0.0)


## Sit with `pose` over the `sit` clip (plays it); null back to the clip alone.
func set_seat(pose: SeatPose) -> void:
	if pose != null and clip != &"sit":
		play(&"sit")
	seat = pose


## Knocked off the feet with `velocity` (m/s, scene space). See docs/handoff.md (knockdown API).
func play_fall(velocity: Vector3) -> void:
	if poser == null:
		return
	if _knock == null:
		_knock = Knockdown.new(poser)
	_knock.fall(global_basis.orthonormalized().inverse() * velocity)


## The body touched the ground: crumple, then lie still.
func play_landed() -> void:
	if _knock != null:
		_knock.land()


## Stand up from lying (lands first if still falling); `got_up` when done.
func play_getup() -> void:
	if _knock != null:
		_knock.get_up()


## &"" upright, &"falling", &"down", &"rising".
func knockdown_state() -> StringName:
	return _knock.state if _knock != null else &""
