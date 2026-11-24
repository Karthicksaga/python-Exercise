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
	v.model = VehicleModel.build(base.type, own)
	v.add_child(v.model)
	# The model's ground is at `model.position.y` below the chassis centre; the seat is in the
	# model's frame (ground at 0).
	v.driver_seat += v.model.position
	var sag := RaycastVehicle.GRAVITY / (spec.wheels.size() * RaycastVehicle.SUSPENSION_STIFFNESS)
	for w in spec.wheels:
		v._hub_y.append(w.at.y - (RaycastVehicle.SUSPENSION_REST - sag))
	for i in v._hub_y.size():
		v.model.set_wheel(i, v._hub_y[i], 0.0, 0.0)
	return v


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


## Where the driver's hips are, in the scene.
func driver_transform() -> Transform3D:
	return global_transform * Transform3D(Basis.IDENTITY, driver_seat)
