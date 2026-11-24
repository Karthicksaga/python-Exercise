class_name Vehicle
extends RaycastVehicle
## One drivable vehicle: its physics (`RaycastVehicle`), its model, doors, siren and crash
## detection (a port of the Three.js `Vehicle.ts`). Built with `Vehicle.create(variant_id)`.
##
## Nobody driving: call `park()` (handbrake, like the Three.js IDLE controls).

## A change of velocity bigger than this in one physics step (m/s) is a crash, not driving: the
## tyres' grip keeps engine, brakes and cornering under about 0.4 m/s per step (measured, G-71).
const IMPACT := 1.6
## Share of speed kept after a crash.
const CRASH_KEEP := 0.65
## Two-wheelers bank into corners, at most this much (radians); drawn only.
const MAX_LEAN := 0.5
## A toppled motorbike slides to a stop at this rate (m/s²).
const TOPPLE_SCRAPE := 6.0
const GROUP := &"vehicles"

signal crashed(impact: float)

var id: StringName = &""
var type: VehicleType
var variant: VehicleCatalog.VariantInfo
var model: VehicleModel

var _impact := 0.0
var _approach := Vector2.ZERO
var _last_pos := Vector2.ZERO
var _last_vel := Vector2.ZERO
var _has_last := false
var _siren_on := false
var _siren_clock := 0.0
var _lean := 0.0
var _roll := 0.0
## Toppled to this side (1 right, -1 left), 0 upright; and how far over it is drawn (0 to 1).
var _toppled := 0
var _topple_amount := 0.0
var _driven := false


## A vehicle of a variant (`vehicle_types.json`), parked, ready to add to the tree. `paint`
## (alpha above 0) repaints this one vehicle (parked cars in the Three.js game's colours).
static func create(variant_id: StringName, vehicle_id: StringName = &"", paint: Color = Color(0, 0, 0, 0)) -> Vehicle:
	var v := Vehicle.new()
	v.variant = VehicleCatalog.variant(variant_id)
	if paint.a > 0.0:
		v.variant = VehicleCatalog.repainted(v.variant, paint)
	v.type = v.variant.type
	v.id = vehicle_id if vehicle_id != &"" else variant_id
	v.name = String(v.id)
	v.setup(v.type.spec)
	v.model = VehicleModel.build(v.type, v.variant)
	v.add_child(v.model)
	v.add_to_group(GROUP)
	v.park()
	return v


## Place it parked on the ground at a scene position (x, z of `where`; y is the ground height).
func place(where: Vector3, heading: float) -> void:
	var at := Vector3(where.x, where.y + type.ride_height + 0.1, where.z)
	if is_inside_tree():
		teleport(at, heading)
	else:
		transform = Transform3D(Basis(Vector3.UP, heading), at)
	_has_last = false


## Nobody at the controls: the handbrake holds it.
func park() -> void:
	_driven = false
	set_controls(0.0, 0.0, 0.4)


## Someone is driving: `set_controls` each step.
func take_controls() -> void:
	_driven = true
	upright()


func is_driven() -> bool:
	return _driven


## Speed shown to the player, km/h.
func speed_kmh() -> float:
	return absf(forward_speed()) * 3.6


## Velocity over the ground before the last step's collision, if there was one (else now).
func approach_velocity() -> Vector2:
	return _approach


## Strength of a crash in the last step (change of speed, m/s), then 0 until the next one.
func consume_impact() -> float:
	var i := _impact
	_impact = 0.0
	return i


## Where the driver's hip joints go and the way they face, in scene space (follows the lean).
func rider_transform() -> Transform3D:
	return model.global_transform * Transform3D(Basis.IDENTITY, type.driver - model.position)


## A point in the chassis frame (x right, z back) on the ground under it, in scene space.
func ground_point(local: Vector2) -> Vector3:
	var p := global_transform * Vector3(local.x, 0.0, local.y)
	p.y = global_position.y + model.position.y
	return p


## How far the driver's door is open, 0 to 1 (always 0 without a door).
func door() -> float:
	return model.door_amount(0)


func set_door(amount: float) -> void:
	model.set_door(0, amount)


func passenger_door(leaf: int) -> float:
	return model.door_amount(leaf)


func set_passenger_door(leaf: int, amount: float) -> void:
	model.set_door(leaf, amount)


func has_siren() -> bool:
	return variant.siren


func siren() -> bool:
	return _siren_on


## Switch the siren and lights. Ignored on vehicles without them.
func set_siren(on: bool) -> void:
	_siren_on = on and variant.siren
	if not _siren_on:
		model.flash_beacons(-1)


## The motorbike falls on its side (drawn only; the chassis stays upright) and scrapes to a stop.
func topple(side: int) -> void:
	_toppled = side
	park()


func toppled() -> bool:
	return _toppled != 0


## Picked up again (getting back on).
func upright() -> void:
	_toppled = 0


## Set the speed along the heading at once, m/s (mission starts, tests), without it counting
## as a crash.
func set_speed(forward: float) -> void:
	linear_velocity = -global_basis.z * forward
	sleeping = false
	_has_last = false


## Lose some speed without it counting as a crash (hitting a person).
func knock(keep: float) -> void:
	linear_velocity = Vector3(linear_velocity.x * keep, linear_velocity.y, linear_velocity.z * keep)
	_last_vel *= keep
	_approach *= keep


func _before_wheels(state: PhysicsDirectBodyState3D) -> void:
	# Compare with the previous step: a sudden change of velocity means the vehicle hit something.
	var p := Vector2(state.transform.origin.x, state.transform.origin.z)
	var v := Vector2(state.linear_velocity.x, state.linear_velocity.z)
	var hit := false
	if _has_last and p.distance_to(_last_pos) < 3.0:
		var change := v.distance_to(_last_vel)
		if change > IMPACT:
			hit = true
			_impact = maxf(_impact, change)
			state.linear_velocity = Vector3(v.x * CRASH_KEEP, state.linear_velocity.y, v.y * CRASH_KEEP)
	_approach = _last_vel if hit else v
	_last_pos = p
	_last_vel = Vector2(state.linear_velocity.x, state.linear_velocity.z)
	_has_last = true
	if hit:
		crashed.emit.call_deferred(_impact)


func _after_wheels(state: PhysicsDirectBodyState3D) -> void:
	if _toppled == 0:
		return
	var v := state.linear_velocity
	var flat := Vector2(v.x, v.z)
	var speed := flat.length()
	if speed > 0.0:
		flat *= maxf(0.0, speed - TOPPLE_SCRAPE * state.step) / speed
	state.linear_velocity = Vector3(flat.x, v.y, flat.y)
	state.angular_velocity = Vector3.ZERO


func _process(delta: float) -> void:
	if spec == null:
		return
	if _siren_on:
		# Red and blue take turns, about three flashes a second.
		_siren_clock += delta
		model.flash_beacons(int(floor(_siren_clock * 6.0)) % 2)
	var roll := 0.0
	if type.leans:
		var wanted := clampf(steering() * absf(forward_speed()) * 0.16, -MAX_LEAN, MAX_LEAN)
		_lean += (wanted - _lean) * minf(1.0, delta * 6.0)
		roll = _lean
	_topple_amount = move_toward(_topple_amount, 1.0 if _toppled != 0 else 0.0, delta * 3.0)
	if _topple_amount > 0.0:
		roll = lerpf(roll, -float(_toppled) * 1.45, Boarding.ease_in_out(_topple_amount))
	model.set_roll(roll)
	model.set_steering(steering() * type.pose.steer_ratio)
	var r0 := spec.wheels[0].radius if not spec.wheels.is_empty() else 0.3
	_roll += forward_speed() / r0 * delta
	for i in spec.wheels.size():
		model.set_wheel(i, spec.wheels[i].at.y - suspension_length(i), steering() if spec.wheels[i].steers else 0.0, _roll)
