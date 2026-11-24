class_name VehicleModel
extends Node3D
## A vehicle's look: the GLB of its manifest (decision G-73), placed with its ground at the
## settled ride height, wheels moved to the physics wheels, doors swung about their hinges, paint
## and siren beacons. The node's origin is on the ground under the chassis centre, so a lean or a
## topple (`set_roll`) pivots on the road. LOD: the `_lod1` GLB replaces the model beyond 28 m
## (chennai-game-design §6); wheels and doors animate on the near model only.

const LOD_DISTANCE := 28.0
const BEACON_ON := 3.0
const BEACON_OFF := 0.1

var _wheels: Array[Node3D] = []
## Uniform scale of each wheel mesh, so its radius matches the physics wheel.
var _wheel_scale: PackedFloat32Array = []
var _wheel_xz: Array[Vector2] = []
## Per door node: its leaf, its angle when fully open, and its rest basis.
var _doors: Array[Node3D] = []
var _door_leaf: PackedInt32Array = []
var _door_open: PackedFloat32Array = []
var _door_rest: Array[Basis] = []
var _leaf_amount: Dictionary = {}
var _beacons: Array[StandardMaterial3D] = []
var _beacon_colour: Array[int] = []
## Scale of a stand-in model (premium and race cars until their own GLBs exist).
var _stretch := Vector3.ONE
## True when the model is a stand-in (fallback GLB or the code box).
var stand_in := false
## The handlebar or steering wheel (the model's `steering` node), its rest basis and the axis it
## turns about in its parent's frame (G-261); null when the model has none.
var _steering: Node3D = null
var _steering_rest: Basis = Basis.IDENTITY
var _steering_axis: Vector3 = Vector3.UP

static var _paint_cache: Dictionary = {}


static func build(t: VehicleType, variant: VehicleCatalog.VariantInfo) -> VehicleModel:
	var m := VehicleModel.new()
	m.name = "Model"
	m.position = Vector3(0, settled_ground(t.spec), 0)
	var manifest := VehicleCatalog.manifest_for(t)
	var roof := -m.position.y + t.spec.half_extents.y
	if manifest == null:
		m.stand_in = true
		m._build_box(t, variant)
	else:
		m._build_glb(t, variant, manifest)
		roof = manifest.roof()
	m._build_extras(variant, roof)
	return m


## Height of the ground below the chassis centre when settled on its springs (negative).
static func settled_ground(s: VehicleSpec) -> float:
	var sag := RaycastVehicle.GRAVITY / (s.wheels.size() * RaycastVehicle.SUSPENSION_STIFFNESS)
	var sum := 0.0
	for w in s.wheels:
		sum += w.at.y - (RaycastVehicle.SUSPENSION_REST - sag) - w.radius
	return sum / maxi(1, s.wheels.size())


func _build_glb(t: VehicleType, variant: VehicleCatalog.VariantInfo, manifest: VehicleManifest) -> void:
	var lods := manifest.lods()
	if manifest.id != t.model:
		# A stand-in: stretch the fallback model to the type's footprint.
		stand_in = true
		var model_half := manifest.half_extents()
		_stretch = Vector3(t.spec.half_extents.x / model_half.x, 1.0, t.spec.half_extents.z / model_half.z)
	var paint_names := manifest.paint_materials()
	var body: Node3D = null
	for i in lods.size():
		var path := String(lods[i]["file"])
		if not ResourceLoader.exists(path):
			continue
		var node := (load(path) as PackedScene).instantiate() as Node3D
		node.name = "Lod%d" % i
		node.scale = _stretch
		add_child(node)
		# LOD0 animates (wheels, doors); the others swap in by distance (visibility ranges).
		var begin := 0.0 if i == 0 else float(lods[i]["min"])
		var end := float(lods[i]["max"]) if i < lods.size() - 1 else 0.0
		if i > 0 and begin <= 0.0:
			begin = float(lods[i - 1]["max"])
		_style_meshes(node, paint_names, manifest.beacons() if i == 0 else {}, variant.paint, begin, end)
		if i == 0:
			body = node
	if body == null:
		return
	var wheels := manifest.wheels()
	for i in t.spec.wheels.size():
		var at := t.spec.wheels[i].at
		var best: Dictionary = {}
		var best_d := INF
		for w in wheels:
			var c: Vector3 = w["centre"]
			var d := Vector2(c.x * _stretch.x, c.z * _stretch.z).distance_to(Vector2(at.x, at.z))
			if d < best_d:
				best_d = d
				best = w
		var node: Node3D = body.find_child(String(best.get("node", "")), true, false) as Node3D if not best.is_empty() else null
		if node == null or best_d > 0.6:
			_wheels.append(null)
			_wheel_scale.append(1.0)
			_wheel_xz.append(Vector2.ZERO)
			continue
		wheels.erase(best)
		node.get_parent().remove_child(node)
		node.owner = null
		add_child(node)
		_wheels.append(node)
		_wheel_scale.append(t.spec.wheels[i].radius / maxf(0.05, float(best["radius"])))
		_wheel_xz.append(Vector2(at.x, at.z))
	if not stand_in:
		measure_ride_pose(t, body)
	var st: Variant = manifest.data.get("steering")
	if st is Dictionary and not stand_in:
		var sd: Dictionary = st
		var node := body.find_child(String(sd.get("node", "steering")), true, false) as Node3D
		if node != null:
			_steering = node
			_steering_rest = node.basis
			var ax: Variant = sd.get("axis")
			if ax is Array:
				var a: Array = ax
				_steering_axis = Vector3(float(a[0]), float(a[1]), float(a[2])).normalized()
	for d in manifest.doors():
		var door := body.find_child(String(d["node"]), true, false) as Node3D
		if door == null:
			continue
		_doors.append(door)
		_door_leaf.append(int(d["leaf"]))
		_door_open.append(float(d["open"]))
		_door_rest.append(door.basis)


## Paint, beacons and the visibility range (`begin`/`end` metres, 0: none) on every mesh under `root`.
func _style_meshes(root: Node, paint_names: Array[String], beacons: Dictionary, paint: Color, begin: float, end: float) -> void:
	for n in root.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		mi.visibility_range_begin = begin
		mi.visibility_range_end = end
		if mi.mesh == null:
			continue
		for s in mi.mesh.get_surface_count():
			var mat := mi.mesh.surface_get_material(s)
			if mat == null:
				continue
			var mname := mat.resource_name
			if mname in paint_names and mat is StandardMaterial3D:
				mi.set_surface_override_material(s, _painted(mat as StandardMaterial3D, paint))
			for colour: String in beacons:
				var names: Array = beacons[colour]
				if mname in names and mat is StandardMaterial3D:
					var own := (mat as StandardMaterial3D).duplicate() as StandardMaterial3D
					own.emission_enabled = true
					own.emission = Color(1, 0.1, 0.08) if colour == "red" else Color(0.15, 0.35, 1)
					own.emission_energy_multiplier = BEACON_OFF
					mi.set_surface_override_material(s, own)
					_beacons.append(own)
					_beacon_colour.append(0 if colour == "red" else 1)


## One shared material per base material and colour.
static func _painted(base: StandardMaterial3D, paint: Color) -> StandardMaterial3D:
	var key := "%s:%s" % [base.get_instance_id(), paint.to_html()]
	if not _paint_cache.has(key):
		var m := base.duplicate() as StandardMaterial3D
		m.albedo_color = paint
		m.albedo_texture = null if base.albedo_texture == null else base.albedo_texture
		_paint_cache[key] = m
	return _paint_cache[key]


## No GLB yet: a plain painted box the size of the chassis with four wheels (a placeholder).
func _build_box(t: VehicleType, variant: VehicleCatalog.VariantInfo) -> void:
	var h := t.spec.half_extents
	var body := MeshInstance3D.new()
	body.name = "Lod0"
	var box := BoxMesh.new()
	box.size = h * 2.0
	var mat := StandardMaterial3D.new()
	mat.albedo_color = variant.paint
	mat.roughness = 0.35
	mat.metallic = 0.3
	box.material = mat
	body.mesh = box
	body.position = Vector3(0, -position.y, 0)
	add_child(body)
	for w in t.spec.wheels:
		var wheel := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = w.radius
		cyl.bottom_radius = w.radius
		cyl.height = 0.2
		var dark := StandardMaterial3D.new()
		dark.albedo_color = Color(0.08, 0.08, 0.08)
		cyl.material = dark
		var holder := Node3D.new()
		wheel.mesh = cyl
		wheel.rotation = Vector3(0, 0, PI / 2)
		holder.add_child(wheel)
		add_child(holder)
		_wheels.append(holder)
		_wheel_scale.append(1.0)
		_wheel_xz.append(Vector2(w.at.x, w.at.z))


## Variant extras made in code: the police light bar, the taxi roof sign.
## `roof`: height of the roof above the ground, metres (the manifest's `roof`, else the box top).
func _build_extras(variant: VehicleCatalog.VariantInfo, roof_height: float) -> void:
	var roof := roof_height * _stretch.y + 0.05
	# A siren vehicle whose model has no beacon materials (the redesigned ambulance) gets the bar too.
	if variant.light_bar or (variant.siren and _beacons.is_empty()):
		for i in 2:
			var lamp := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(0.36, 0.1, 0.18)
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color(0.8, 0.1, 0.1) if i == 0 else Color(0.1, 0.25, 0.85)
			mat.emission_enabled = true
			mat.emission = Color(1, 0.1, 0.08) if i == 0 else Color(0.15, 0.35, 1)
			mat.emission_energy_multiplier = BEACON_OFF
			box.material = mat
			lamp.mesh = box
			lamp.name = "LightBar%d" % i
			lamp.position = Vector3(-0.19 if i == 0 else 0.19, roof, 0.15)
			add_child(lamp)
			_beacons.append(mat)
			_beacon_colour.append(i)
	if variant.roof_sign:
		var sign := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.55, 0.16, 0.22)
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color("#ffb703")
		mat.emission_enabled = true
		mat.emission = Color("#ffb703")
		mat.emission_energy_multiplier = 0.4
		box.material = mat
		sign.mesh = box
		sign.name = "RoofSign"
		sign.position = Vector3(0, roof, 0.2)
		add_child(sign)


## The driver's palms and feet from the model's own nodes (G-261): `grip_r`/`grip_steer_r` and
## `foot_r` relative to `seat_driver`, and the steering hub, into `t.pose` (the manifest's numbers
## were typed beside the model and disagree with it in places, the city bus's grips by 22 cm).
## The `foot_*` anchors mark the sole on the footboard; the pose wants the ankle, a little above
## and behind it. Once per type (the first model built).
static func measure_ride_pose(t: VehicleType, body: Node3D) -> void:
	if t.pose.measured:
		return
	t.pose.measured = true
	var seat := body.find_child("seat_driver", true, false) as Node3D
	if seat == null:
		return
	var hip := _in(body, seat)
	for grip_name: String in ["grip_r", "grip_steer_r"]:
		var g := body.find_child(grip_name, true, false) as Node3D
		if g != null:
			t.pose.hand = _in(body, g) - hip
			break
	var foot := body.find_child("foot_r", true, false) as Node3D
	if foot != null:
		t.pose.foot = _in(body, foot) - hip + Vector3(0, 0.08, 0.05)
	var wheel := body.find_child("steering", true, false) as Node3D
	if wheel != null:
		t.pose.hub = _in(body, wheel) - hip


## A node's origin in `root`'s frame.
static func _in(root: Node3D, node: Node3D) -> Vector3:
	var xf := Transform3D.IDENTITY
	var n: Node = node
	while n != null and n != root:
		var n3 := n as Node3D
		if n3 != null:
			xf = n3.transform * xf
		n = n.get_parent()
	return xf.origin


## Turns the handlebar or steering wheel by `angle` radians about its column (+ left).
func set_steering(angle: float) -> void:
	if _steering != null:
		_steering.basis = Basis(_steering_axis, angle) * _steering_rest


## Draws wheel `i` with its hub at `hub_y` (chassis frame), steered and spun.
func set_wheel(i: int, hub_y: float, steer: float, spin: float) -> void:
	if i >= _wheels.size() or _wheels[i] == null:
		return
	var w := _wheels[i]
	w.position = Vector3(_wheel_xz[i].x, hub_y - position.y, _wheel_xz[i].y)
	var s := _wheel_scale[i]
	w.basis = Basis(Vector3.UP, steer) * Basis(Vector3.RIGHT, -spin).scaled(Vector3(s, s, s))


## Lean or topple: roll about the forward axis, pivoting on the ground.
func set_roll(angle: float) -> void:
	rotation = Vector3(0, 0, angle)


func set_door(leaf: int, amount: float) -> void:
	var a := clampf(amount, 0.0, 1.0)
	_leaf_amount[leaf] = a
	for i in _doors.size():
		if _door_leaf[i] == leaf:
			_doors[i].basis = Basis(Vector3.UP, _door_open[i] * Boarding.ease_in_out(a)) * _door_rest[i]


func door_amount(leaf: int) -> float:
	return float(_leaf_amount.get(leaf, 0.0))


func has_doors() -> bool:
	return not _doors.is_empty()


## Light the red beacons (phase 0) or the blue ones (phase 1); -1 turns them all off.
func flash_beacons(phase: int) -> void:
	for i in _beacons.size():
		_beacons[i].emission_energy_multiplier = BEACON_ON if _beacon_colour[i] == phase else BEACON_OFF
