class_name RaycastVehicle
extends RigidBody3D
## A drivable vehicle: a rigid chassis on ray-cast wheels (decision G-70). Suspension and tyre
## grip are simulated per wheel; the wheels are not bodies. A GDScript port of the Three.js
## game's `VehicleBody.ts` on Rapier's `DynamicRayCastVehicleController` (itself Bullet's
## `btRaycastVehicle`), so the same `VehicleSpec` numbers give the same handling (tested against
## `tests/data/threejs_handling.json`, decision G-71).
##
## Local axes: forward is -Z, right +X, up +Y. The chassis cannot roll or pitch (axis locks),
## which keeps handling predictable on a touchscreen and makes it impossible to flip over.
##
## Arcade drift: fast and at full lock, vehicles with a `drift` rating loosen their rear tyres so
## the tail steps out; a countersteer, easing the stick or losing speed brings the grip back.
## Vehicles without one (two-wheelers) are held in line instead.
##
## Set `throttle`, `steer` and `brake` before each physics step (or call `set_controls`); the
## wheels act in `_integrate_forces`.

const SUSPENSION_REST := 0.32
const SUSPENSION_STIFFNESS := 28.0
const SUSPENSION_COMPRESSION := 2.4
const SUSPENSION_RELAXATION := 2.9
const MAX_TRAVEL := 0.25
## Maximum suspension force per wheel, per kilogram of chassis.
const MAX_SUSPENSION_FORCE_PER_KG := 40.0
## Tyre grip: how much force a tyre can pass before it slides, and how firmly it resists sliding sideways.
const FRICTION_SLIP := 2.2
const SIDE_STIFFNESS := 1.0
## Bullet's bilateral side-friction constraint only removes this share of the sideways speed per step.
const SIDE_CONTACT_DAMPING := 0.2
## Share of the forward impulse counted against the friction circle (Bullet's `fwdFactor`).
const FORWARD_FACTOR := 0.5

## Drift tuning (same constants as `VehicleBody.ts`).
const DRIFT_FROM := 0.52
const DRIFT_FULL := 0.72
const STEER_FROM := 0.55
const STEER_FULL := 0.95
const REAR_SIDE_LOSS := 0.85
const REAR_SLIP_LOSS := 0.55
const COUNTER_KEEP := 0.25
const COUNTER_LOCK := 0.18
const SPIN_GUARD_FROM := 0.3
const SPIN_GUARD_TO := 0.5
const RELEASE_RATE := 3.0
const REGRIP_RATE := 2.2
const SLIP_QUIET := 0.06
const SLIP_LOUD := 0.32
const HOLD_LINE_RATE := 12.0
## Steering wheels turn at this rate, rad/s.
const STEER_RATE := 2.6
## Rapier's chassis damping (linear 0.08, angular 1.2 per second).
const LINEAR_DAMP := 0.08
const ANGULAR_DAMP := 1.2
## Rapier's gravity, m/s².
const GRAVITY := 9.81

## -1 (full reverse) to 1 (full throttle).
var throttle: float = 0.0
## -1 (left) to 1 (right).
var steer: float = 0.0
## 0 to 1.
var brake: float = 0.0

var spec: VehicleSpec

var _steer_angle := 0.0
## Share of rear grip given up for a drift, 0 to 1 (eased).
var _release := 0.0
## Last measured slide, 0 to 1.
var _slide := 0.0
var _rear_axle := 0.0
var _inv_yaw_inertia := 0.0
var _susp_length: PackedFloat32Array = []
var _contact: Array[bool] = []
var _side_stiffness: PackedFloat32Array = []
var _friction_slip: PackedFloat32Array = []
var _halt_requested := false
var _teleport_to: Transform3D
var _teleport_requested := false
var _ray := PhysicsRayQueryParameters3D.new()


## Builds the chassis from a spec: mass, box collider, damping, axis locks, CCD. Call before
## adding to the tree (or right after).
func setup(vehicle_spec: VehicleSpec) -> void:
	spec = vehicle_spec
	mass = spec.mass
	var box := BoxShape3D.new()
	box.size = spec.half_extents * 2.0
	var shape := CollisionShape3D.new()
	shape.name = "Chassis"
	shape.shape = box
	add_child(shape)
	var w := spec.half_extents.x * 2.0
	var h := spec.half_extents.y * 2.0
	var l := spec.half_extents.z * 2.0
	# A solid box's inertia, as Rapier gives a cuboid collider of this mass.
	inertia = Vector3(spec.mass * (h * h + l * l), spec.mass * (w * w + l * l), spec.mass * (w * w + h * h)) / 12.0
	_inv_yaw_inertia = 1.0 / inertia.y
	var material := PhysicsMaterial.new()
	material.friction = 0.4
	material.bounce = 0.1
	physics_material_override = material
	linear_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	angular_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	linear_damp = LINEAR_DAMP
	angular_damp = ANGULAR_DAMP
	gravity_scale = GRAVITY / float(ProjectSettings.get_setting("physics/3d/default_gravity", 9.8))
	axis_lock_angular_x = true
	axis_lock_angular_z = true
	continuous_cd = true
	can_sleep = true
	collision_layer = PhysicsLayers.VEHICLES
	collision_mask = PhysicsLayers.WORLD | PhysicsLayers.VEHICLES | PhysicsLayers.PLAYER | PhysicsLayers.PEOPLE
	_rear_axle = spec.rear_axle()
	var n := spec.wheels.size()
	_susp_length.resize(n)
	_side_stiffness.resize(n)
	_friction_slip.resize(n)
	_contact.resize(n)
	for i in n:
		_susp_length[i] = SUSPENSION_REST
		_contact[i] = false
	_reset_grip()
	_ray.collision_mask = PhysicsLayers.WHEEL_RAY
	_ray.exclude = [get_rid()]


func set_controls(new_throttle: float, new_steer: float, new_brake: float) -> void:
	throttle = clampf(new_throttle, -1.0, 1.0)
	steer = clampf(new_steer, -1.0, 1.0)
	brake = clampf(new_brake, 0.0, 1.0)
	if throttle != 0.0 or brake > 0.0:
		sleeping = false


## Heading in radians: 0 faces -Z (north), positive turning left.
func yaw() -> float:
	var f := -global_basis.z
	return atan2(-f.x, -f.z)


## Speed along the vehicle's own forward direction, m/s (negative when reversing).
func forward_speed() -> float:
	return linear_velocity.dot(-global_basis.z)


## Velocity over the ground (x, z), m/s.
func planar_velocity() -> Vector2:
	return Vector2(linear_velocity.x, linear_velocity.z)


## Current steering angle of the front wheels, radians (positive = left).
func steering() -> float:
	return _steer_angle


## How much the vehicle is sliding sideways, 0 (gripping) to 1 (a full drift).
func drifting() -> float:
	return _slide


## How far each wheel's suspension is extended (for drawing the wheels).
func suspension_length(wheel: int) -> float:
	return _susp_length[wheel]


## True when the wheel's ray touches something.
func wheel_in_contact(wheel: int) -> bool:
	return _contact[wheel]


## Stop dead at the next step (parking, mission reset).
func halt() -> void:
	_halt_requested = true
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO


## Move to a place and heading at the next step, stopped.
func teleport(where: Vector3, heading: float) -> void:
	_teleport_to = Transform3D(Basis(Vector3.UP, heading), where)
	_teleport_requested = true
	global_transform = _teleport_to
	halt()


func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	if spec == null:
		return
	if _teleport_requested:
		state.transform = _teleport_to
		_teleport_requested = false
	if _halt_requested:
		state.linear_velocity = Vector3.ZERO
		state.angular_velocity = Vector3.ZERO
		_release = 0.0
		_slide = 0.0
		_reset_grip()
		_halt_requested = false
	_before_wheels(state)
	_drive(state)
	_after_wheels(state)


## Hook for subclasses: runs before the wheels act in each step (crash detection).
func _before_wheels(_state: PhysicsDirectBodyState3D) -> void:
	pass


## Hook for subclasses: runs after the wheels acted (extra forces).
func _after_wheels(_state: PhysicsDirectBodyState3D) -> void:
	pass


func _drive(state: PhysicsDirectBodyState3D) -> void:
	var dt := state.step
	var xf := state.transform
	var forward := -xf.basis.z
	var v := state.linear_velocity
	var w := state.angular_velocity
	var speed := v.dot(forward)

	# Engine: full force at standstill, fading to nothing at top speed.
	var force := 0.0
	if throttle > 0.0 and speed < spec.max_speed:
		force = spec.engine_force * throttle * minf(1.0, (spec.max_speed - speed) / 4.0)
	elif throttle < 0.0 and speed > -spec.max_speed / 3.0:
		force = spec.engine_force * 0.6 * throttle
	# Lifting off slows the vehicle gently, like engine braking.
	var coasting := throttle == 0.0 and brake == 0.0
	var brake_total := brake * spec.brake_force + (spec.brake_force * 0.06 if coasting else 0.0)

	var countering := _update_grip(xf, v, w, speed, dt)
	w = state.angular_velocity if spec.drift > 0.0 else _held_w
	var lock := spec.max_steer / (1.0 + absf(speed) * 0.09) + (_release * COUNTER_LOCK if countering else 0.0)
	var wanted := -steer * lock
	var step := STEER_RATE * dt
	_steer_angle += clampf(wanted - _steer_angle, -step, step)

	var n := spec.wheels.size()
	var driven := spec.driven_count()
	var down := -xf.basis.y
	var space := state.get_space_state()
	var contact_point: Array[Vector3] = []
	var contact_normal: Array[Vector3] = []
	var susp_force := PackedFloat32Array()
	contact_point.resize(n)
	contact_normal.resize(n)
	susp_force.resize(n)
	var com := xf.origin
	var max_len := SUSPENSION_REST + MAX_TRAVEL
	var min_len := SUSPENSION_REST - MAX_TRAVEL
	var on_ground := 0

	# 1. Suspension: a ray per wheel, a spring and damper on its length.
	for i in n:
		var wheel := spec.wheels[i]
		var mount := xf * wheel.at
		_ray.from = mount
		# Rapier's ray reaches the rest length (plus the radius): a wheel hanging lower has no contact.
		_ray.to = mount + down * (SUSPENSION_REST + wheel.radius)
		var hit := space.intersect_ray(_ray)
		susp_force[i] = 0.0
		if hit.is_empty():
			_contact[i] = false
			_susp_length[i] = SUSPENSION_REST
			continue
		_contact[i] = true
		on_ground += 1
		var point: Vector3 = hit["position"]
		var normal: Vector3 = hit["normal"]
		contact_point[i] = point
		contact_normal[i] = normal
		_susp_length[i] = clampf(mount.distance_to(point) - wheel.radius, min_len, max_len)
		var denominator := normal.dot(down)
		var rel_vel := 0.0
		var clipped_inv := 10.0
		var at_point := v + w.cross(point - com)
		if denominator < -0.1:
			var inv := -1.0 / denominator
			rel_vel = normal.dot(at_point) * inv
			clipped_inv = inv
		var f := SUSPENSION_STIFFNESS * (SUSPENSION_REST - _susp_length[i]) * clipped_inv
		f -= (SUSPENSION_COMPRESSION if rel_vel < 0.0 else SUSPENSION_RELAXATION) * rel_vel
		susp_force[i] = maxf(f * spec.mass, 0.0)
	# All springs are measured before any pushes (as Rapier does), then applied.
	for i in n:
		if not _contact[i]:
			continue
		var j := contact_normal[i] * minf(susp_force[i], spec.mass * MAX_SUSPENSION_FORCE_PER_KG) * dt
		v += j / spec.mass
		w.y += _inv_yaw_inertia * (contact_point[i] - com).cross(j).y

	# 2. Tyres: sideways grip (a bilateral constraint), then rolling/engine/brake along the wheel.
	var side_imp := PackedFloat32Array()
	var fwd_imp := PackedFloat32Array()
	var axles: Array[Vector3] = []
	var fwds: Array[Vector3] = []
	side_imp.resize(n)
	fwd_imp.resize(n)
	axles.resize(n)
	fwds.resize(n)
	for i in n:
		side_imp[i] = 0.0
		if not _contact[i]:
			continue
		var a := _steer_angle if spec.wheels[i].steers else 0.0
		var axle := xf.basis * Vector3(cos(a), 0.0, -sin(a))
		var normal := contact_normal[i]
		axle = (axle - normal * axle.dot(normal)).normalized()
		axles[i] = axle
		fwds[i] = normal.cross(axle).normalized()
		var r := contact_point[i] - com
		var rel := (v + w.cross(r)).dot(axle)
		side_imp[i] = -SIDE_CONTACT_DAMPING * rel / _denominator(r, axle) * _side_stiffness[i]
	var sliding := false
	var skid := PackedFloat32Array()
	skid.resize(n)
	for i in n:
		skid[i] = 1.0
		fwd_imp[i] = 0.0
		if not _contact[i]:
			continue
		var rolling := 0.0
		var engine := force / driven if spec.wheels[i].driven else 0.0
		var r := contact_point[i] - com
		if engine != 0.0:
			rolling = engine * dt
		else:
			var max_imp := brake_total / n
			var vrel := (v + w.cross(r)).dot(fwds[i])
			rolling = clampf(-vrel / _denominator(r, fwds[i]) / on_ground, -max_imp, max_imp)
		fwd_imp[i] = rolling
		var max_imp_grip := susp_force[i] * dt * _friction_slip[i]
		var x := rolling * FORWARD_FACTOR
		var y := side_imp[i]
		var sq := x * x + y * y
		if sq > max_imp_grip * max_imp_grip:
			sliding = true
			skid[i] = max_imp_grip / sqrt(sq)
	if sliding:
		for i in n:
			if side_imp[i] != 0.0 and skid[i] < 1.0:
				fwd_imp[i] *= skid[i]
				side_imp[i] *= skid[i]
	for i in n:
		if not _contact[i]:
			continue
		var r := contact_point[i] - com
		var j := fwds[i] * fwd_imp[i] + axles[i] * side_imp[i]
		v += j / spec.mass
		w.y += _inv_yaw_inertia * r.cross(j).y
	state.linear_velocity = v
	state.angular_velocity = Vector3(0.0, w.y, 0.0)


## Bullet's impulse denominator for a unit impulse along `dir` at `r` from the centre (only yaw can turn).
func _denominator(r: Vector3, dir: Vector3) -> float:
	var c := r.cross(dir).y
	return 1.0 / spec.mass + _inv_yaw_inertia * c * c


var _held_w := Vector3.ZERO


## Arcade drift (see the class notes). Returns true while the driver is countersteering. For
## vehicles without `drift`, holds the line instead (`_held_w` is the corrected spin).
func _update_grip(xf: Transform3D, v: Vector3, w: Vector3, speed: float, dt: float) -> bool:
	var slip := _slip_angle(xf, v, w)
	_slide = (1.0 if absf(speed) > 4.0 else 0.0) * smoothstep(SLIP_QUIET, SLIP_LOUD, absf(slip))
	if spec.drift <= 0.0:
		_held_w = w
		if absf(slip) >= SLIP_QUIET and absf(speed) >= 1.0:
			# Tail sliding right: turn the nose right (negative yaw) to line it up with the travel.
			_held_w.y -= slip * HOLD_LINE_RATE * dt
		return false
	var fast := smoothstep(DRIFT_FROM, DRIFT_FULL, speed / spec.max_speed) if speed > 0.0 else 0.0
	var hard := smoothstep(STEER_FROM, STEER_FULL, absf(steer))
	var countering := absf(slip) > 0.05 and signf(steer) == signf(slip)
	var guard := 1.0 - smoothstep(SPIN_GUARD_FROM, SPIN_GUARD_TO, absf(slip))
	var wanted := spec.drift * fast * hard * guard * (COUNTER_KEEP if countering else 1.0)
	var rate := (RELEASE_RATE if wanted > _release else REGRIP_RATE) * dt
	_release += clampf(wanted - _release, -rate, rate)
	for i in spec.wheels.size():
		if spec.wheels[i].steers:
			continue
		_side_stiffness[i] = SIDE_STIFFNESS * spec.grip * (1.0 - REAR_SIDE_LOSS * _release)
		_friction_slip[i] = FRICTION_SLIP * spec.grip * (1.0 - REAR_SLIP_LOSS * _release)
	return countering


## Angle between the heading and the way the rear axle is moving, radians (+ = tail sliding right).
func _slip_angle(xf: Transform3D, v: Vector3, w: Vector3) -> float:
	var forward := v.dot(-xf.basis.z)
	var right := v.dot(xf.basis.x) + w.y * _rear_axle
	return atan2(right, absf(forward))


func _reset_grip() -> void:
	for i in _side_stiffness.size():
		_side_stiffness[i] = SIDE_STIFFNESS * (spec.grip if spec != null else 1.0)
		_friction_slip[i] = FRICTION_SLIP * (spec.grip if spec != null else 1.0)
