class_name TrafficVehicleView
extends AnimatableBody3D
## One AI traffic vehicle as drawn and felt (G-124): the same `VehicleModel` as the drivable
## vehicle of its variant (so taking it swaps nothing the player can see), a paint from the
## model's own Chennai colour list, wheels turning at its speed, and a kinematic chassis box on
## the vehicles layer, so the player's vehicle hits it and the player cannot walk through it.
## Moved by the AI (`CityLife`), never by physics. No driving logic here.
##
## **Jumps are not drives (G-340).** Jolt moves every kinematic body with `MoveKinematic`, even with
## `sync_to_physics` off: a transform set from code is reached in one step at whatever speed that
## takes. A view the AI puts somewhere new (a respawn out of sight, a carjacked agent let go, a view
## shown again) would cross the gap at thousands of m/s and smash anything its box overlapped at
## the start: the taken bike stood exactly in its hidden box, and the rider was flung tens of
## metres the step they sat down (the owner's report on afed12f). So a jump of more than `JUMP`
## metres beyond its speed, and every `set_shown(true)`, happens with the box off; the box comes
## back one physics step later, at the new place.

## Wheels are turned only this close to the camera (the near model has them), metres.
const WHEELS_NEAR := VehicleModel.LOD_DISTANCE
## A pose further than this (metres) beyond what its speed covers in the step is a jump.
const JUMP := 1.5

var variant: VehicleCatalog.VariantInfo
var model: VehicleModel
var paint: Color = Color.WHITE
## The driver's seat in the view's frame (hips), and whether the seat is open (bikes, autos).
var driver_seat: Vector3 = Vector3.ZERO
var open_seat: bool = false
## The AI agent this view draws (-1 while not in use).
var agent_id: int = -1
var _hub_y: PackedFloat32Array = PackedFloat32Array()
var _spin: float = 0.0
var _shape: CollisionShape3D
var _shown: bool = true
## The physics frame of the last jump: the box stays off until a step after it.
var _jump_frame: int = -1


## A view of `variant_id` in a paint picked by `variation` (0..1) from the model's paints.
static func make(variant_id: StringName, variation: float) -> TrafficVehicleView:
	var v := TrafficVehicleView.new()
	var base := VehicleCatalog.variant(variant_id)
	var own := VehicleCatalog.VariantInfo.new()
	own.id = base.id
	own.type = base.type
	own.label = base.label
	own.siren = false
	own.light_bar = base.light_bar
	own.roof_sign = base.roof_sign
	own.paint = base.paint
	var manifest := VehicleCatalog.manifest_for(base.type)
	if manifest != null:
		var paints: Array = manifest.data.get("paints", [])
		if not paints.is_empty():
			var p: Dictionary = paints[mini(paints.size() - 1, floori(variation * paints.size()))]
			var c: Array = p.get("srgb", [1, 1, 1])
			own.paint = Color(float(c[0]), float(c[1]), float(c[2]))
		for s: Dictionary in manifest.data.get("seats", []):
			if String(s.get("role", "")) == "driver":
				var hip: Array = s.get("hip", [0, 0.6, 0])
				v.driver_seat = Vector3(float(hip[0]), float(hip[1]), float(hip[2]))
		v.open_seat = bool(manifest.data.get("open_seat", base.type.open_seat))
	v.variant = own
	v.paint = own.paint
	v.name = "Traffic_%s" % variant_id
	v.sync_to_physics = false
	v.collision_layer = PhysicsLayers.VEHICLES
	v.collision_mask = 0
	var spec := base.type.spec
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = spec.half_extents * 2.0
	cs.shape = box
	v.add_child(cs)
	v._shape = cs
	v.set_physics_process(false)
	v.model = VehicleModel.build(base.type, own)
	v.add_child(v.model)
	v._merge_far_lods(String(variant_id))
	# The model's ground is at `model.position.y` below the chassis centre; the seat is in the
	# model's frame (ground at 0).
	v.driver_seat += v.model.position
	var sag := RaycastVehicle.GRAVITY / (spec.wheels.size() * RaycastVehicle.SUSPENSION_STIFFNESS)
	for w in spec.wheels:
		v._hub_y.append(w.at.y - (RaycastVehicle.SUSPENSION_REST - sag))
	for i in v._hub_y.size():
		v.model.set_wheel(i, v._hub_y[i], 0.0, 0.0)
	return v


## Each model (`Lod0` near, `Lod1`/`Lod2` far: six to eighteen surfaces each) becomes one mesh
## with a surface per material, shared by every view of the same look and paint; the far ones
## cast no shadow. The wheels stay apart (they turn; `VehicleModel` moved them out of `Lod0`).
## Traffic doors never open. A traffic vehicle costs about four draw calls instead of seven to
## eighteen (G-127, measured with `traffic_shot.gd`).
##
## Not headless: the dummy renderer's mesh store is not thread-safe, and the city builds chunk
## meshes on worker threads meanwhile (nothing is drawn headless anyway).
func _merge_far_lods(look: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	for child in model.get_children():
		var lod := child as Node3D
		if lod == null or not String(lod.name).begins_with("Lod"):
			continue
		var parts := lod.find_children("*", "MeshInstance3D", true, false)
		if parts.is_empty():
			continue
		var first := parts[0] as MeshInstance3D
		var key := "%s:%s:%s" % [look, lod.name, paint.to_html()]
		var mesh: ArrayMesh = _merged.get(key)
		if mesh == null:
			mesh = _merge(lod, parts)
			_merged[key] = mesh
		var merged := MeshInstance3D.new()
		merged.name = "Merged"
		merged.mesh = mesh
		merged.visibility_range_begin = first.visibility_range_begin
		merged.visibility_range_end = first.visibility_range_end
		merged.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if lod.name == &"Lod0" else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		for n in lod.get_children():
			lod.remove_child(n)
			n.queue_free()
		lod.add_child(merged)


static var _merged: Dictionary = {}


static func _merge(lod: Node3D, parts: Array[Node]) -> ArrayMesh:
	var tools: Dictionary = {}
	var inverse := lod.global_transform.affine_inverse() if lod.is_inside_tree() else Transform3D.IDENTITY
	for n in parts:
		var mi := n as MeshInstance3D
		if mi.mesh == null:
			continue
		var xf := _relative(mi, lod) if not lod.is_inside_tree() else inverse * mi.global_transform
		for s in mi.mesh.get_surface_count():
			var arrays := mi.mesh.surface_get_arrays(s)
			if arrays.is_empty():
				continue
			var mat := mi.get_surface_override_material(s)
			if mat == null:
				mat = mi.mesh.surface_get_material(s)
			if not tools.has(mat):
				var st := SurfaceTool.new()
				st.begin(Mesh.PRIMITIVE_TRIANGLES)
				st.set_material(mat)
				tools[mat] = st
			(tools[mat] as SurfaceTool).append_from(mi.mesh, s, xf)
	var out := ArrayMesh.new()
	for mat: Variant in tools:
		(tools[mat] as SurfaceTool).commit(out)
	return out


static func _relative(node: Node3D, root: Node3D) -> Transform3D:
	var xf := Transform3D.IDENTITY
	var n: Node = node
	while n != null and n != root:
		var n3 := n as Node3D
		if n3 != null:
			xf = n3.transform * xf
		n = n.get_parent()
	return xf


## Height of the chassis centre above the road surface.
func ride_height() -> float:
	return -model.position.y


## Shown and felt, or hidden with its box off. Shown again, the box waits a step (G-340): pose it
## at its new place in the same physics frame.
func set_shown(on: bool) -> void:
	visible = on
	_shown = on
	_shape.disabled = true
	if on:
		_mark_jump()


func is_solid() -> bool:
	return not _shape.disabled


## Put the view at a road point (scene position of the road surface) facing `heading`.
func set_pose(road_point: Vector3, heading: float, speed: float, dt: float, camera_distance: float) -> void:
	var to := road_point + Vector3(0, ride_height(), 0)
	if not _shape.disabled and global_position.distance_to(to) > JUMP + absf(speed) * dt:
		_shape.disabled = true
		_mark_jump()
	global_transform = Transform3D(Basis(Vector3.UP, heading), to)
	if camera_distance < WHEELS_NEAR and speed > 0.05:
		var spec := variant.type.spec
		_spin = fposmod(_spin + speed * dt / maxf(0.2, spec.wheels[0].radius), TAU)
		for i in _hub_y.size():
			model.set_wheel(i, _hub_y[i], 0.0, _spin)


## Where the driver's hips are, in the scene.
func driver_transform() -> Transform3D:
	return global_transform * Transform3D(Basis.IDENTITY, driver_seat)


func _mark_jump() -> void:
	_jump_frame = Engine.get_physics_frames()
	set_physics_process(true)


## Only while a jump is pending: the box comes back once the step that moved the view is over.
func _physics_process(_delta: float) -> void:
	if Engine.get_physics_frames() <= _jump_frame:
		return
	set_physics_process(false)
	if _shown:
		_shape.disabled = false
