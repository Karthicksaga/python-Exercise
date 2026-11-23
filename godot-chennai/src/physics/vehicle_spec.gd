class_name VehicleSpec
extends RefCounted
## Handling of one vehicle kind: the chassis box, mass, wheels and engine (decision G-72). The
## numbers are the Three.js game's `VehicleSpec` (packages/physics/src/VehicleBody.ts); the
## premium and race cars add `grip`. Read from `src/vehicles/data/vehicle_types.json`.


## One ray-cast wheel: where its suspension is mounted on the chassis, its size and role.
class WheelSpec:
	extends RefCounted
	## Suspension mount relative to the chassis centre (chassis frame: +X right, -Z forwards).
	var at: Vector3 = Vector3.ZERO
	var radius: float = 0.3
	var steers: bool = false
	var driven: bool = false


## Half-sizes of the chassis collision box (also gives the inertia).
var half_extents: Vector3 = Vector3(0.8, 0.4, 2.0)
## Collision boxes from a model manifest, [{centre: Vector3, half: Vector3}] in the chassis frame;
## empty: one box of `half_extents` at the centre.
var boxes: Array[Dictionary] = []
var mass: float = 1000.0
var wheels: Array[WheelSpec] = []
## Total driving force at full throttle, newtons.
var engine_force: float = 5000.0
## Top speed forwards, m/s. Reverse is limited to a third of it.
var max_speed: float = 20.0
## Largest steering angle at standstill, radians; it narrows with speed.
var max_steer: float = 0.6
## Largest braking impulse per step over all wheels (the Rapier/Bullet brake unit).
var brake_force: float = 90.0
## 0 to 1: how readily the rear tyres let go in fast, hard corners. 0: never slides (two-wheelers).
var drift: float = 0.0
## Tyre grip multiplier on both the friction limit and the sideways stiffness (1 for the Three.js
## vehicles; more for premium and race cars).
var grip: float = 1.0


static func from_dict(d: Dictionary) -> VehicleSpec:
	var s := VehicleSpec.new()
	s.half_extents = _vec3(d["half_extents"])
	s.mass = float(d["mass"])
	s.engine_force = float(d["engine_force"])
	s.max_speed = float(d["max_speed"])
	s.max_steer = float(d["max_steer"])
	s.brake_force = float(d["brake_force"])
	s.drift = float(d.get("drift", 0.0))
	s.grip = float(d.get("grip", 1.0))
	for w: Dictionary in d["wheels"]:
		var wheel := WheelSpec.new()
		wheel.at = _vec3(w["at"])
		wheel.radius = float(w["radius"])
		wheel.steers = bool(w["steers"])
		wheel.driven = bool(w["driven"])
		s.wheels.append(wheel)
	return s


## Distance of the unsteered (rear) wheels behind the chassis centre, metres (+Z).
func rear_axle() -> float:
	var sum := 0.0
	var n := 0
	for w in wheels:
		if not w.steers:
			sum += w.at.z
			n += 1
	return sum / n if n > 0 else 0.0


func driven_count() -> int:
	var n := 0
	for w in wheels:
		if w.driven:
			n += 1
	return maxi(1, n)


static func _vec3(a: Array) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))
