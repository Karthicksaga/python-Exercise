class_name PeoplePool
extends Node3D
## Reusable `PersonView`s per person of the cast, so the streets never instantiate in play: the
## scenes load on worker threads during loading (`prepare`), views are made then (`warm`), and
## anyone asked for afterwards is taken from the free views of that person, or made then (about
## 0.1 ms; the scene is already in memory), at most MAKE_PER_FRAME a frame.
##
## Each frame the owner calls `begin_frame()`, `take(key, id)` for everyone it shows (`key`: who it
## is, stable from frame to frame), then `end_frame()`, which hides the views nobody took.

const MANIFEST := "res://assets/people/people.json"
const MAKE_PER_FRAME := 3

var manifest: PeopleManifest
var _scenes: Dictionary[String, PackedScene] = {}
var _sole_offsets: Dictionary[String, float] = {}
var _free: Dictionary[String, Array] = {}
var _by_key: Dictionary[int, PersonView] = {}
var _frame_used: Dictionary[int, bool] = {}
var _made_this_frame: int = 0
## Views made in all (tests, HUD).
var made: int = 0


func _init() -> void:
	name = "People"
	manifest = PeopleManifest.open(MANIFEST)


## Load the scenes of `ids` on worker threads (awaitable during loading). "" or the error.
func prepare(ids: PackedStringArray) -> String:
	var paths: Dictionary[String, String] = {}
	for id in ids:
		if _scenes.has(id) or paths.has(id):
			continue
		var p := manifest.model_path(id)
		if p == "":
			continue
		paths[id] = p
		if ResourceLoader.load_threaded_request(p) != OK:
			return "Could not start loading %s." % p
	for id: String in paths:
		var p := paths[id]
		while ResourceLoader.load_threaded_get_status(p) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			await get_tree().process_frame
		var scene := ResourceLoader.load_threaded_get(p) as PackedScene
		if scene == null:
			return "Could not load %s." % p
		_scenes[id] = scene
		_sole_offsets[id] = _measure_sole_offset(scene)
	return ""


static func _measure_sole_offset(scene: PackedScene) -> float:
	var inst := scene.instantiate() as Node3D
	if inst == null:
		return 0.0
	var skeletons := inst.find_children("*", "Skeleton3D", true, false)
	var offset := 0.0
	if not skeletons.is_empty():
		var sk := skeletons[0] as Skeleton3D
		var rig := RigData.from_skeleton(sk, inst)
		var meshes: Array[MeshInstance3D] = []
		for node in sk.find_children("*", "MeshInstance3D", true, false):
			meshes.append(node as MeshInstance3D)
		if not meshes.is_empty():
			var soles := SoleSet.from_meshes(meshes, sk, rig)
			if soles.vertex_count() > 0:
				offset = maxf(0.0, -soles.lowest(rig.rest_model()))
	inst.free()
	return offset


func has_person(id: String) -> bool:
	return _scenes.has(id)


## Make `count` hidden views of each of `ids` ahead of play.
func warm(ids: PackedStringArray, count: int) -> void:
	for id in ids:
		for i in count:
			var v := _make(id)
			if v != null:
				_give_back(v)


func _make(id: String) -> PersonView:
	var scene: PackedScene = _scenes.get(id)
	if scene == null:
		return null
	var v := PersonView.make(id, scene, float(manifest.entry(id).get("seatHeightM", 0.45)), float(_sole_offsets.get(id, 0.0)))
	v.visible = false
	add_child(v)
	made += 1
	return v


## A view of `id` the caller owns (not pooled; add it where it belongs), or null.
func make_view(id: String) -> PersonView:
	var scene: PackedScene = _scenes.get(id)
	if scene == null:
		return null
	return PersonView.make(id, scene, float(manifest.entry(id).get("seatHeightM", 0.45)), float(_sole_offsets.get(id, 0.0)))


func _give_back(v: PersonView) -> void:
	v.visible = false
	if not _free.has(v.person_id):
		_free[v.person_id] = []
	_free[v.person_id].append(v)


func begin_frame() -> void:
	_frame_used.clear()
	_made_this_frame = 0


## The view of `id` shown for `key` this frame (the same view as last frame for the same key,
## so its clip runs on), or null when none is free and this frame has made enough already.
func take(key: int, id: String) -> PersonView:
	var v: PersonView = _by_key.get(key)
	if v != null and v.person_id != id:
		_by_key.erase(key)
		_give_back(v)
		v = null
	if v == null:
		var list: Array = _free.get(id, [])
		if not list.is_empty():
			v = list.pop_back()
		elif _made_this_frame < MAKE_PER_FRAME:
			v = _make(id)
			if v == null:
				return null
			_made_this_frame += 1
		else:
			return null
		_by_key[key] = v
	v.visible = true
	_frame_used[key] = true
	return v


## Views whose key was not taken since `begin_frame` are hidden and free again.
func end_frame() -> void:
	for key: int in _by_key.keys():
		if not _frame_used.has(key):
			_give_back(_by_key[key])
			_by_key.erase(key)


func shown() -> int:
	return _by_key.size()
