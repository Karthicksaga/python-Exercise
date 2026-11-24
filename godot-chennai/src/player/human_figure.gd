class_name HumanFigure
extends Node3D
## A walking, running person drawn from a MakeHuman (MPFB) model with the retargeted CC0
## locomotion clips; port of the Three.js `HumanFigure` for the player (decisions G-61, G-62).
## The node sits at the figure's feet, facing -Z like every Node3D (the model is turned round).
##
##     var figure := HumanFigure.new()
##     add_child(figure)
##     var error := await figure.load_model(PeopleManifest.DEFAULT_PLAYER, 1.75)
##     figure.advance(delta, speed, grounded)   # every physics step
##
## Each step, after the clips: the upper arms are brought in towards the body (the clips hold
## them 13-16° out, which looks wrong on MakeHuman shoulders), then the hips are moved so the
## lowest sole vertex is exactly on the ground: each clip is planted when retargeted, but a
## blend of two (starting, stopping) is not, and a sole sank up to 8.5 cm in the Three.js blends.

signal model_loaded
## The person is back on their feet after `play_getup()` (the clips have taken over).
signal got_up

## Gait clip speeds at a playback rate of 1 (m/s), and where the run takes over. The CC0 walk
## (G-100) covers about 1.09 m/s at the player's size with planted feet (`clipSpeedsMps` in
## people.json, scaled to 1.75 m): 1.1 keeps the feet from sliding and gives ~131 steps a minute
## at 1.6 m/s (the Mixamo walk was 1.5). The run keeps the Three.js value: its natural ~1.95 m/s
## would need a frantic rate at 6.2 m/s, so it plays for a believable cadence (~174 steps a
## minute) and the feet slide, as before (decision G-105). G-264 quickened the run's cadence
## (4.6 → 4.2: about 186 steps a minute at 6.2 m/s) and blends walk into run by speed between
## RUN_BLEND_FROM and RUN_BLEND_TO, both clips on one normalised stride cycle so their feet stay
## in step through the blend.
const WALK_CLIP_SPEED := 1.1
const RUN_CLIP_SPEED := 4.2
const RUN_BLEND_FROM := 2.6
const RUN_BLEND_TO := 4.0
## Where the run is the larger part of the blend (the reported `gait` switches here).
const RUN_FROM := 3.3
const IDLE_BELOW := 0.25
## Gait blend time (standing ↔ moving), seconds; how fast the walk/run share follows speed, 1/s.
const BLEND_TIME := 0.22
const RUN_SHARE_RATE := 6.0
## Seconds to get up (`play_getup`), as the crash throw's own get-up.
const GETUP_TIME := Knockdown.GETUP_TIME
## Degrees each upper arm is brought in at full weight of each gait, and the least it stays out.
const ARM_SETTLE := {"idle": 9.0, "walk": 8.0, "run": 10.0}
const ARM_MIN_OUT := 4.0
const GAITS: PackedStringArray = ["idle", "walk", "run"]

## The model instance (turned to face -Z, scaled to its height).
var model: Node3D = null
var skeleton: Skeleton3D = null
var rig: RigData = null
var tree: AnimationTree = null
## The scale the model is drawn at (manifest height over its own height).
var model_scale: float = 1.0
## Keep the soles on the ground every step (the player); false: only during blends.
var plants_feet: bool = true
## Current weight of each gait (sum 1).
var weights: Dictionary[String, float] = {"idle": 1.0, "walk": 0.0, "run": 0.0}
var gait: String = "idle"
## The retargeted clips and run-time sole candidates this figure plays.
var baked: Retarget.Result = null
## The last step's correction of the hips, metres (diagnostics and tests).
var last_plant: float = 0.0
var _from: Dictionary[String, float] = {}
var _fade: float = 0.0
var _soles: SoleSet = null
var _candidates: SoleSet = null
var _all_feet: SoleSet = null
var _rest_low: float = 0.0
var _hips: int = -1
var _arms: Dictionary[String, PackedInt32Array] = {}
## The body for the procedural poses (seat, swing, falls; G-260).
var poser: PoseRig = null
## Natural arm swing, torso turn, head nod and run lean on top of the gait clips (G-263).
var swing_enabled: bool = true
## The leg split the swing used on the last step, radians (tests).
var last_split: float = 0.0
## Sitting: the seat (null standing) and how far down, 0 standing to 1 seated (G-261).
var seat: SeatPose = null
var seat_amount: float = 0.0
var _knock: Knockdown = null
var _run_share: float = 0.0
var _cycle_offset: float = 0.0
var _seat_cache: Array[Quaternion] = []
var _seat_cache_hips: Vector3 = Vector3.ZERO
var _seat_cache_id: int = 0
var _seat_cache_version: int = -1
var _stand: Array[Quaternion] = []


func is_ready() -> bool:
	return tree != null


## Loads a model (a glTF scene with a Skeleton3D and skinned meshes), drawn `height` metres
## tall (0: as modelled), and retargets the clips to it. Returns "" or what went wrong.
func load_model(path: String, height: float = 0.0) -> String:
	if not ResourceLoader.exists(path):
		return "No model at %s." % path
	if ResourceLoader.load_threaded_request(path) != OK:
		return "Could not start loading %s." % path
	while ResourceLoader.load_threaded_get_status(path) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
		await get_tree().process_frame
	var scene := ResourceLoader.load_threaded_get(path) as PackedScene
	if scene == null:
		return "Could not load %s." % path
	var instance := scene.instantiate() as Node3D
	var found := instance.find_children("*", "Skeleton3D", true, false)
	if found.is_empty():
		instance.free()
		return "%s has no skeleton." % path
	var sk := found[0] as Skeleton3D
	var new_rig := RigData.from_skeleton(sk, instance)
	if new_rig.find("Hips") < 0:
		instance.free()
		return "%s has no Hips bone." % path
	var meshes: Array[MeshInstance3D] = []
	for node in sk.find_children("*", "MeshInstance3D", true, false):
		meshes.append(node as MeshInstance3D)
	_strip_vertex_colour(meshes)
	var soles := SoleSet.from_meshes(meshes, sk, new_rig)
	var all_feet := SoleSet.from_meshes(meshes, sk, new_rig, true)
	var skeleton_path := String(instance.get_path_to(sk))
	var result := await LocomotionClips.retarget(new_rig, skeleton_path, soles, get_tree())
	if not is_inside_tree():
		instance.free()
		return "The figure left the scene while loading."
	_install(instance, sk, new_rig, soles, all_feet, result, height, meshes)
	model_loaded.emit()
	return ""


## MPFB exports a black vertex-colour channel: never use it as albedo (§7 lesson).
static func _strip_vertex_colour(meshes: Array[MeshInstance3D]) -> void:
	for mesh in meshes:
		for s in mesh.mesh.get_surface_count():
			var m := mesh.get_active_material(s) as BaseMaterial3D
			if m != null and m.vertex_color_use_as_albedo:
				var copy := m.duplicate() as BaseMaterial3D
				copy.vertex_color_use_as_albedo = false
				mesh.set_surface_override_material(s, copy)


func _install(instance: Node3D, sk: Skeleton3D, new_rig: RigData, soles: SoleSet, all_feet: SoleSet, baked_clips: Retarget.Result, height: float, meshes: Array[MeshInstance3D]) -> void:
	if model != null:
		model.queue_free()
	model = instance
	baked = baked_clips
	skeleton = sk
	rig = new_rig
	_soles = soles
	_all_feet = all_feet
	_candidates = soles.subset(baked_clips.candidates)
	_hips = rig.find("Hips")
	_rest_low = soles.lowest(rig.rest_model())
	_arms.clear()
	for side: String in ["Left", "Right"]:
		_arms[side] = PackedInt32Array([rig.find(side + "Arm"), rig.find(side + "ForeArm"), rig.find(side + "Hand"), rig.find(side + "HandMiddle1")])
	# Height: the skinned meshes at rest (MPFB rigs have no head-top bone): soles to hair.
	var box := AABB()
	for i in meshes.size():
		var b := meshes[i].get_aabb()
		box = b if i == 0 else box.merge(b)
	var own := box.size.y
	model_scale = height / own if height > 0.0 and own > 0.01 else 1.0
	# glTF figures face +Z; Godot's forward is -Z. Feet on this node's origin.
	model.transform = Transform3D(Basis(Vector3.UP, PI).scaled(Vector3.ONE * model_scale), Vector3(0.0, -_rest_low * model_scale, 0.0))
	add_child(model)
	for mesh in meshes:
		mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	poser = PoseRig.make(sk, model.transform * rig.to_model)
	_knock = null
	_seat_cache_id = 0
	_build_tree()


func _build_tree() -> void:
	if tree != null:
		tree.queue_free()
	var library := AnimationLibrary.new()
	for n in GAITS:
		library.add_animation(n, baked.clips[n])
	tree = AnimationTree.new()
	tree.name = "Locomotion"
	tree.add_animation_library("", library)
	var blend := AnimationNodeBlendTree.new()
	var x := 0.0
	var offsets := stride_offsets(baked)
	for n in GAITS:
		var clip := AnimationNodeAnimation.new()
		clip.animation = n
		if n != "idle":
			# One stride per second of the tree's time, starting at the left foot's
			# furthest-forward moment, so walk and run are always at the same point of the stride.
			clip.use_custom_timeline = true
			clip.timeline_length = 1.0
			clip.stretch_time_scale = true
			clip.start_offset = offsets[n]
			clip.loop_mode = Animation.LOOP_LINEAR
		blend.add_node(n, clip, Vector2(x, 0))
		blend.add_node(n + "_rate", AnimationNodeTimeScale.new(), Vector2(x, 120))
		blend.connect_node(n + "_rate", 0, n)
		x += 200.0
	var moving := AnimationNodeBlend2.new()
	moving.sync = true
	blend.add_node("walk_run", moving, Vector2(300, 260))
	blend.connect_node("walk_run", 0, "walk_rate")
	blend.connect_node("walk_run", 1, "run_rate")
	var gait_node := AnimationNodeBlend2.new()
	gait_node.sync = true
	blend.add_node("gait", gait_node, Vector2(400, 380))
	blend.connect_node("gait", 0, "idle_rate")
	blend.connect_node("gait", 1, "walk_run")
	blend.connect_node("output", 0, "gait")
	tree.tree_root = blend
	tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	tree.deterministic = true
	add_child(tree)
	tree.root_node = tree.get_path_to(model)
	tree.active = true
	weights = {"idle": 1.0, "walk": 0.0, "run": 0.0}
	gait = "idle"
	_fade = 0.0
	_run_share = 0.0
	advance(0.0, 0.0, true)


## Seconds into each gait clip where its left foot is furthest ahead of the right (the stride's
## start for the normalised timelines): from the baked tracks, so it holds for any skeleton.
static func stride_offsets(clips: Retarget.Result) -> Dictionary[String, float]:
	var out: Dictionary[String, float] = {"idle": 0.0, "walk": 0.0, "run": 0.0}
	for n: String in ["walk", "run"]:
		var clip: Animation = clips.clips[n]
		var tl := -1
		var tr := -1
		for t in clip.get_track_count():
			if clip.track_get_type(t) != Animation.TYPE_ROTATION_3D:
				continue
			var bone := BoneNames.plain(clip.track_get_path(t).get_concatenated_subnames())
			if bone == "LeftUpLeg":
				tl = t
			elif bone == "RightUpLeg":
				tr = t
		if tl < 0 or tr < 0:
			continue
		var best := -INF
		for k in 60:
			var time := clip.length * k / 60.0
			# Thigh lines in the hips' frame: forwards is +Z for the glTF figures.
			var dl := clip.rotation_track_interpolate(tl, time) * Vector3.UP
			var dr := clip.rotation_track_interpolate(tr, time) * Vector3.UP
			var split := dl.z - dr.z
			if split > best:
				best = split
				out[n] = time
	return out


## Gait for a horizontal speed (m/s).
static func gait_for(speed: float) -> String:
	if speed < IDLE_BELOW:
		return "idle"
	return "walk" if speed < RUN_FROM else "run"


## One step: choose the gait, play the clips at the rate that keeps feet from sliding (slower in
## the air), then settle the arms and plant the soles.
func advance(dt: float, speed: float, grounded: bool) -> void:
	if tree == null:
		return
	var seated := seat != null and seat_amount > 0.0
	if seated or (_knock != null and _knock.active()):
		speed = 0.0
	var next := gait_for(speed)
	if next != gait:
		# Standing ↔ moving fades; walk ↔ run follows the speed (below), not a fade.
		if (next == "idle") != (gait == "idle"):
			_from = weights.duplicate()
			_fade = BLEND_TIME
		gait = next
	var want_run := smoothstep(RUN_BLEND_FROM, RUN_BLEND_TO, speed)
	_run_share = want_run if dt <= 0.0 else move_toward(_run_share, want_run, RUN_SHARE_RATE * dt)
	var moving := 0.0 if gait == "idle" else 1.0
	if _fade > 0.0:
		_fade = maxf(0.0, _fade - dt)
		var from_moving := 1.0 - float(_from["idle"])
		moving = lerpf(from_moving, moving, 1.0 - _fade / BLEND_TIME)
	weights["idle"] = 1.0 - moving
	weights["walk"] = moving * (1.0 - _run_share)
	weights["run"] = moving * _run_share
	var air := 1.0 if grounded else 0.55
	# Strides per second: each clip's own for this speed, blended like the clips.
	var walk_len := clip_length("walk")
	var run_len := clip_length("run")
	var f_walk := maxf(0.6, speed / WALK_CLIP_SPEED) / maxf(0.01, walk_len)
	var f_run := maxf(0.7, speed / RUN_CLIP_SPEED) / maxf(0.01, run_len)
	var stride_rate := lerpf(f_walk, f_run, _run_share) * air
	tree.set("parameters/idle_rate/scale", 1.0)
	tree.set("parameters/walk_rate/scale", stride_rate)
	tree.set("parameters/run_rate/scale", stride_rate)
	tree.set("parameters/walk_run/blend_amount", _run_share)
	tree.set("parameters/gait/blend_amount", moving)
	tree.advance(dt)
	if _knock != null and _knock.active():
		if _knock.step(dt):
			got_up.emit()
		return
	_settle_arms()
	last_split = GaitSwing.apply(poser, weights["walk"], weights["run"]) if swing_enabled and poser != null and not seated else 0.0
	if seated:
		_sit()
	elif plants_feet or _fade > 0.0:
		_plant()


## Model-space bone poses in rig order.
func poses() -> Array[Transform3D]:
	var out: Array[Transform3D] = []
	out.resize(rig.count())
	for i in rig.count():
		out[i] = rig.to_model * skeleton.get_bone_global_pose(rig.skeleton_index[i])
	return out


## How far (degrees) an upper arm stands out from straight down, in the figure's front plane.
func arm_out(side: String, at: Array[Transform3D] = []) -> float:
	var p := at if not at.is_empty() else poses()
	var bones := _arms[side]
	var dir := (p[bones[1]].origin - p[bones[0]].origin).normalized()
	# The model's own +X is its left (glTF figures face +Z).
	var outward := 1.0 if side == "Left" else -1.0
	return rad_to_deg(atan2(dir.x * outward, -dir.y))


## The wrist's bend: degrees between the forearm (elbow to wrist) and the hand (wrist to the
## middle knuckle). Natural hands stay within about 25°; the Three.js bug bent them about 70°.
func wrist_bend(side: String, at: Array[Transform3D] = []) -> float:
	var p := at if not at.is_empty() else poses()
	var bones := _arms[side]
	var fore := p[bones[2]].origin - p[bones[1]].origin
	var hand := p[bones[3]].origin - p[bones[2]].origin
	return rad_to_deg(fore.angle_to(hand))


func _settle_arms() -> void:
	var want := 0.0
	for n in GAITS:
		want += float(ARM_SETTLE[n]) * weights[n]
	if want <= 0.0:
		return
	for side: String in ["Left", "Right"]:
		var p := poses()
		var arm := _arms[side][0]
		var by := minf(want, maxf(0.0, arm_out(side, p) - ARM_MIN_OUT))
		if by <= 0.0 or arm < 0:
			continue
		var parent := rig.parents[arm]
		var parent_basis := (p[parent].basis if parent >= 0 else rig.to_model.basis).orthonormalized()
		var axis := (parent_basis.inverse() * Vector3.BACK).normalized()
		var angle := deg_to_rad(by) * (-1.0 if side == "Left" else 1.0)
		var bone := rig.skeleton_index[arm]
		skeleton.set_bone_pose_rotation(bone, (Quaternion(axis, angle) * skeleton.get_bone_pose_rotation(bone)).normalized())


func _plant() -> void:
	var low := _candidates.lowest(poses())
	var dy := _rest_low - low
	last_plant = dy
	if absf(dy) < 0.0002:
		return
	var bone := rig.skeleton_index[_hips]
	var parent := rig.parents[_hips]
	var parent_basis := rig.to_model.basis if parent < 0 else poses()[parent].basis
	skeleton.set_bone_pose_position(bone, skeleton.get_bone_pose_position(bone) + parent_basis.inverse() * Vector3(0.0, dy, 0.0))


## Height of the lowest foot vertex above this node, metres, in the current pose (every vertex
## of both feet, not only the candidates; for tests).
func feet_height() -> float:
	var low := _all_feet.lowest(poses())
	return (low - _rest_low) * model_scale


## Seconds into each gait's clip loop is not exposed by AnimationTree; tests sample poses
## over game time instead.
func clip_length(name: String) -> float:
	var library := tree.get_animation_library("")
	return library.get_animation(name).length if library.has_animation(name) else 0.0


## Sit on `pose` (null stands up), `amount` 0 standing to 1 seated (getting in and out blend).
func set_seat(pose: SeatPose, amount: float = 1.0) -> void:
	seat = pose
	seat_amount = clampf(amount, 0.0, 1.0) if pose != null else 0.0


## The seated pose on the skeleton, blended from the clip's standing pose by `seat_amount`. The
## solve is cached while the seat and steering are unchanged (passengers solve once).
func _sit() -> void:
	if poser == null:
		return
	var n := poser.index.size()
	if _seat_cache.size() != n:
		_seat_cache.resize(n)
		_stand.resize(n)
	var stand_hips := poser.capture(_stand)
	if seat.get_instance_id() != _seat_cache_id or seat.version != _seat_cache_version:
		seat.apply(poser)
		_seat_cache_hips = poser.capture(_seat_cache)
		_seat_cache_id = seat.get_instance_id()
		_seat_cache_version = seat.version
	if seat_amount >= 1.0:
		poser.restore(_seat_cache, _seat_cache_hips)
	else:
		poser.blend(_stand, stand_hips, _seat_cache, _seat_cache_hips, smoothstep(0.0, 1.0, seat_amount))


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
