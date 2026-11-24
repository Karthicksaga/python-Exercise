class_name TrainsView
extends Node3D
## The timetabled trains near the player (G-328): every car of a type and LOD is one instance of
## one `MultiMesh` (merged by `TrainModels`), door leaves of the near cars another, so all the
## trains in view cost a few draw calls. Cars follow the track on both bogies (yaw from the path
## 7 m either side of the car's middle), at the rail top (the viaduct's height on the MRTS).
## The cars of trains within `solid_range` are solid: one kinematic box each (pooled).
##
## The scene node sits at the floating origin's zero and joins `WorldOrigin.GROUP`; instance
## transforms are written in scene space every frame, so a recentre needs nothing more.

const MAX_CARS_PER_TYPE := 40
## Bogie centres from the car's middle, metres (the manifests' pivots: about 7.35 m).
const BOGIE := 7.35

## Drawn within this distance of the camera (metres); solid within `solid_range` of the focus.
@export var draw_range: float = 900.0
@export var solid_range: float = 400.0
## LOD 0 (with doors) within this distance; the manifests' figures scaled by the quality preset.
@export var lod_scale: float = 1.0
## Most trains drawn at once (nearest first).
@export var max_trains: int = 8

var models: TrainModels


## A train to draw this frame.
class Draw:
	extends RefCounted
	var id: String = ""
	var line: RailLine
	## Metres along the line of the train's middle.
	var s: float = 0.0
	## Doors open 0..1 on the platform side, and that side (+1 left of the direction of travel).
	var open: float = 0.0
	var side: int = 1
	## Hidden (the player's cab is drawn as this train but by its own entry).
	var hidden: bool = false
	## Squared distance to the focus (for sorting, set by the owner).
	var distance: float = 0.0


var drawn_trains: int = 0
var drawn_cars: int = 0
## How far open the doors drawn on the car nearest the focus are (tests).
var nearest_doors: float = 0.0

var _multi: Dictionary[String, MultiMeshInstance3D] = {}
var _counts: Dictionary[String, int] = {}
var _bodies: Array[AnimatableBody3D] = []
var _bodies_used: int = 0


func setup(train_models: TrainModels) -> void:
	models = train_models
	add_to_group(WorldOrigin.GROUP)
	for n: String in models.types.keys():
		var t: TrainModels.CarType = models.types[n]
		for lod in t.lods.size():
			_make("%s:%d" % [n, lod], t.lods[lod], lod == 0)
		if t.door_left != null:
			_make("%s:door_l" % n, t.door_left, false)
		if t.door_right != null:
			_make("%s:door_r" % n, t.door_right, false)


func _make(key: String, mesh: Mesh, shadows: bool) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = MAX_CARS_PER_TYPE * (6 if key.contains("door") else 1)
	mm.visible_instance_count = 0
	var mmi := MultiMeshInstance3D.new()
	mmi.name = key.replace(":", "_")
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Instances move every frame: no culling by the stale bounds.
	mmi.custom_aabb = AABB(Vector3(-1e5, -100, -1e5), Vector3(2e5, 400, 2e5))
	add_child(mmi)
	_multi[key] = mmi


## Where car `index` of a train of `line` with its middle at `s` is, world metres and yaw, as a
## scene transform (rail top on the line's height).
func car_transform(line: RailLine, s: float, index: int) -> Transform3D:
	var offsets := models.car_offsets(line.train_type)
	var f := TrainModels.formation(line.train_type)
	var cs := s + offsets[index]
	var front := line.path.at(cs + BOGIE)
	var back := line.path.at(cs - BOGIE)
	var yaw := atan2(-(front.x - back.x), -(front.z - back.z))
	if bool(f[index][1]):
		yaw += PI
	var mid := Vector2((front.x + back.x) / 2.0, (front.z + back.z) / 2.0)
	var y := line.height_at(cs) + RailGeometry.RAIL_TOP
	return Transform3D(Basis(Vector3.UP, yaw), WorldOrigin.to_scene(mid, y))


func car_count(line: RailLine) -> int:
	return TrainModels.formation(line.train_type).size()


## Draws `draws` (nearest first is best) for a camera at `camera` (scene space); the cars of
## trains within `solid_range` of `focus` (scene space) get bodies.
func update(draws: Array[Draw], camera: Vector3, focus: Vector3) -> void:
	for k: String in _multi.keys():
		_counts[k] = 0
	drawn_trains = 0
	drawn_cars = 0
	_bodies_used = 0
	nearest_doors = 0.0
	var nearest := INF
	for d in draws:
		if d.hidden:
			continue
		if drawn_trains >= max_trains:
			break
		var middle := WorldOrigin.to_scene(d.line.path.at(d.s).point(), d.line.height_at(d.s))
		if middle.distance_to(camera) > draw_range + 60.0:
			continue
		drawn_trains += 1
		var solid := middle.distance_to(focus) < solid_range
		var f := TrainModels.formation(d.line.train_type)
		for i in f.size():
			var type_name := str(f[i][0])
			var reversed := bool(f[i][1])
			var t: TrainModels.CarType = models.types.get(type_name, null)
			if t == null:
				continue
			var xf := car_transform(d.line, d.s, i)
			var dist := xf.origin.distance_to(camera)
			var lod := t.lods.size() - 1
			for l in t.lods.size():
				if dist < t.lod_end[l] * lod_scale:
					lod = l
					break
			if dist > draw_range:
				continue
			_put("%s:%d" % [type_name, lod], xf)
			drawn_cars += 1
			if lod == 0:
				# The doors on the platform side open: the car's left (-X) is the travel's left
				# unless the car is turned round.
				var open_side := -d.side if not reversed else d.side
				for door in t.doors:
					var amount := d.open if door.side == open_side else 0.0
					var leaf := door.rest
					leaf.origin += door.slide * door.slide_m * amount
					_put("%s:%s" % [type_name, "door_l" if door.side < 0 else "door_r"], xf * leaf)
				var fd := xf.origin.distance_to(focus)
				if fd < nearest:
					nearest = fd
					nearest_doors = d.open
			if solid:
				_body(xf, t)
	for k: String in _multi.keys():
		_multi[k].multimesh.visible_instance_count = _counts[k]
	for i in range(_bodies_used, _bodies.size()):
		var b := _bodies[i]
		if b.process_mode != Node.PROCESS_MODE_DISABLED:
			b.global_position = Vector3(0, -500, 0)
			b.process_mode = Node.PROCESS_MODE_DISABLED


func _put(key: String, xf: Transform3D) -> void:
	if not _multi.has(key):
		return
	var n := _counts[key]
	var mm := _multi[key].multimesh
	if n >= mm.instance_count:
		return
	mm.set_instance_transform(n, xf)
	_counts[key] = n + 1


func _body(xf: Transform3D, t: TrainModels.CarType) -> void:
	var b: AnimatableBody3D
	if _bodies_used < _bodies.size():
		b = _bodies[_bodies_used]
	else:
		b = AnimatableBody3D.new()
		b.sync_to_physics = false
		b.collision_layer = 8  # LAYER_VEHICLES (G-64)
		b.collision_mask = 0
		var cs := CollisionShape3D.new()
		var box := BoxShape3D.new()
		cs.shape = box
		b.add_child(cs)
		add_child(b)
		_bodies.append(b)
	_bodies_used += 1
	var box_shape := (b.get_child(0) as CollisionShape3D).shape as BoxShape3D
	box_shape.size = Vector3(t.width - 0.1, t.height - 1.0, t.length - 0.6)
	b.process_mode = Node.PROCESS_MODE_INHERIT
	b.global_transform = Transform3D(xf.basis, xf.origin + xf.basis.y * (0.5 + (t.height - 1.0) / 2.0))


func solid_cars() -> int:
	return _bodies_used
