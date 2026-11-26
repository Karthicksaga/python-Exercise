class_name LocomotionClips
extends RefCounted
## The idle, walk and run clips (CC0, `assets/animations/locomotion.glb`, decision G-100) and their
## retargeted copies per skeleton (decision G-61). Characters whose skeletons retarget the same
## way (same bone names, rest rotations and bone directions) share one result, as in the
## Three.js `clipCache`; retargeting runs on a worker thread (`BackgroundTask`).

const PATH := "res://assets/animations/locomotion.glb"
const NAMES: PackedStringArray = ["idle", "walk", "run"]

static var _source: RigData = null
static var _clips: Dictionary[String, Animation] = {}
static var _cache: Dictionary[String, Retarget.Result] = {}


## The clip rig and its clips, read once (main thread: it instantiates the imported scene).
static func source() -> RigData:
	if _source == null:
		var scene := load(PATH) as PackedScene
		var root := scene.instantiate() as Node3D
		var player := root.find_children("*", "AnimationPlayer", true, false)[0] as AnimationPlayer
		for n in NAMES:
			_clips[n] = player.get_animation(n)
		_source = RigData.from_joints(root.get_node("Armature") as Node3D, root)
		root.free()
	return _source


static func clips() -> Dictionary[String, Animation]:
	source()
	return _clips


## A key that is equal for skeletons the clips retarget identically.
static func skeleton_key(rig: RigData, soles: SoleSet) -> String:
	var parts := PackedStringArray()
	var rest := rig.rest_model()
	for i in rig.count():
		var q := rig.rest_local[i].basis.get_rotation_quaternion()
		var p := rig.parents[i]
		var d := (rest[i].origin - rest[p].origin).normalized() if p >= 0 else Vector3.ZERO
		parts.append("%s:%.3f,%.3f,%.3f,%.3f:%.3f,%.3f,%.3f" % [rig.names[i], q.x, q.y, q.z, q.w, d.x, d.y, d.z])
	# The soles are this model's own: the hips track depends on them.
	parts.append("soles:%d" % soles.vertex_count())
	return "|".join(parts).md5_text()


## Retargeted clips for `rig` (tracks under `skeleton_path`), from the cache or baked on a
## worker thread while the caller awaits frames of `tree`.
static func retarget(rig: RigData, skeleton_path: String, soles: SoleSet, tree: SceneTree) -> Retarget.Result:
	var key := skeleton_key(rig, soles) + skeleton_path
	if _cache.has(key):
		return _cache[key]
	var src := source()
	var task := BackgroundTask.start(Retarget.run.bind(src, _clips, rig, skeleton_path, soles))
	var result: Retarget.Result = await task.finish(tree)
	_cache[key] = result
	return result
