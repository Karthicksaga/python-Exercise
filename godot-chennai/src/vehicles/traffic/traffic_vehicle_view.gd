class_name TrafficVehicleView
extends AnimatableBody3D
## One AI traffic vehicle as drawn and felt (G-124): the same `VehicleModel` as the drivable
## vehicle of its variant (so taking it swaps nothing the player can see), a paint from the
## model's own Chennai colour list, wheels turning at its speed, and a kinematic chassis box on
## the vehicles layer, so the player's vehicle hits it and the player cannot walk through it.
## Moved by the AI (`CityLife`), never by physics. No driving logic here.

## Wheels are turned only this close to the camera (the near model has them), metres.
const WHEELS_NEAR := VehicleModel.LOD_DISTANCE

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
## Route buses (G-214): the near model keeps its door nodes (not merged) so the doors open at
## stops, and a destination sign can be shown (`set_route_sign`).
var keeps_doors: bool = false
var route_sign: RouteSign = null
var _doors_open: float = 0.0


## A view of `variant_id` in a paint picked by `variation` (0..1) from the model's paints.
static func make(variant_id: StringName, variation: float, with_doors: bool = false) -> TrafficVehicleView:
	var v := TrafficVehicleView.new()
	v.keeps_doors = with_doors
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
		if keeps_doors and lod.name == &"Lod0" and model.has_doors():
			continue  # the doors must swing (route buses at their stops)
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


## Put the view at a road point (scene position of the road surface) facing `heading`.
func set_pose(road_point: Vector3, heading: float, speed: float, dt: float, camera_distance: float) -> void:
	global_transform = Transform3D(Basis(Vector3.UP, heading), road_point + Vector3(0, ride_height(), 0))
	if camera_distance < WHEELS_NEAR and speed > 0.05:
		var spec := variant.type.spec
		_spin = fposmod(_spin + speed * dt / maxf(0.2, spec.wheels[0].radius), TAU)
		for i in _hub_y.size():
			model.set_wheel(i, _hub_y[i], 0.0, _spin)


## Open (1) or close (0) every door leaf (a route bus at a stop). Cheap when unchanged.
func set_doors(amount: float) -> void:
	if is_equal_approx(amount, _doors_open) or not model.has_doors():
		return
	_doors_open = amount
	for leaf in 4:
		model.set_door(leaf, amount)


func doors_open() -> float:
	return _doors_open


## Shows (or with an empty `ref`, hides) the destination sign: route number, Tamil and English
## destination. `font` should carry a Tamil fallback.
func set_route_sign(ref: String, english: String, tamil: String, font: Font) -> void:
	if ref == "":
		if route_sign != null:
			route_sign.visible = false
		return
	if route_sign == null:
		route_sign = RouteSign.make(variant.type.spec.half_extents, font)
		add_child(route_sign)
	route_sign.show_route(ref, english, tamil)
	route_sign.visible = true


## Where the driver's hips are, in the scene.
func driver_transform() -> Transform3D:
	return global_transform * Transform3D(Basis.IDENTITY, driver_seat)
