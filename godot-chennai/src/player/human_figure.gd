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

## Gait clip speeds at a playback rate of 1 (m/s), and where the run takes over. The CC0 walk
## (G-100) covers about 1.09 m/s at the player's size with planted feet (`clipSpeedsMps` in
## people.json, scaled to 1.75 m): 1.1 keeps the feet from sliding and gives ~131 steps a minute
## at 1.6 m/s (the Mixamo walk was 1.5). The run keeps the Three.js value: its natural ~1.95 m/s
## would need a frantic rate at 6.2 m/s, so it plays for a believable cadence (~174 steps a
## minute) and the feet slide, as before (decision G-105).
const WALK_CLIP_SPEED := 1.1
const RUN_CLIP_SPEED := 4.6
const RUN_FROM := 3.2
const IDLE_BELOW := 0.25
## Gait blend time, seconds.
const BLEND_TIME := 0.22
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
	for n in GAITS:
		var clip := AnimationNodeAnimation.new()
		clip.animation = n
		blend.add_node(n, clip, Vector2(x, 0))
		blend.add_node(n + "_rate", AnimationNodeTimeScale.new(), Vector2(x, 120))
		blend.connect_node(n + "_rate", 0, n)
		x += 200.0
	blend.add_node("idle_walk", AnimationNodeBlend2.new(), Vector2(200, 260))
	blend.connect_node("idle_walk", 0, "idle_rate")
	blend.connect_node("idle_walk", 1, "walk_rate")
	blend.add_node("gait", AnimationNodeBlend2.new(), Vector2(400, 380))
	blend.connect_node("gait", 0, "idle_walk")
	blend.connect_node("gait", 1, "run_rate")
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
	advance(0.0, 0.0, true)


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
	var next := gait_for(speed)
	if next != gait:
		_from = weights.duplicate()
		_fade = BLEND_TIME
		gait = next
	if _fade > 0.0:
		_fade = maxf(0.0, _fade - dt)
		var t := 1.0 - _fade / BLEND_TIME
		for n in GAITS:
			weights[n] = lerpf(_from[n], 1.0 if n == gait else 0.0, t)
	else:
		for n in GAITS:
			weights[n] = 1.0 if n == gait else 0.0
	var air := 1.0 if grounded else 0.55
	tree.set("parameters/idle_rate/scale", 1.0)
	tree.set("parameters/walk_rate/scale", maxf(0.6, speed / WALK_CLIP_SPEED) * air)
	tree.set("parameters/run_rate/scale", maxf(0.7, speed / RUN_CLIP_SPEED) * air)
	var low_pair := weights["idle"] + weights["walk"]
	tree.set("parameters/idle_walk/blend_amount", weights["walk"] / low_pair if low_pair > 0.0001 else 0.0)
	tree.set("parameters/gait/blend_amount", weights["run"])
	tree.advance(dt)
	_settle_arms()
	if plants_feet or _fade > 0.0:
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
