class_name VehicleRider
extends CharacterBody3D
## The person `Driving` puts in and out of vehicles (decision G-77): the interface the vehicle
## code needs from the player, with a working default so vehicles can be built and tested before
## the Player agent's character exists. The Player's controller can extend this class (and
## override the `_show_*` hooks to drive its skeleton), or implement the same methods.
##
## What `Driving` calls:
## - `set_walking(on)`: the player's own movement and collisions on or off (off while seated
##   and while a boarding sequence moves the body).
## - `place(position, heading)`: put the feet at a scene position facing `heading` (0 = -Z).
## - `set_seated(type, amount)`: the seated pose of a vehicle type, 0 standing to 1 seated
##   (`VehicleType.pose`, `driver`); `null` stands up.
## - `throw_off(launch, lie_for, vehicle)`: thrown from a crash (TD-29), see `CrashFlight`.
## - `knockdown()`: &"" on foot, else the flight phase (&"flying", &"sliding", &"lying", &"rising").
## - `consume_landing()`: true once, when a thrown body lands.
##
## Health is here for the crash damage until Combat owns it.

const RADIUS := 0.3
const HEIGHT := 1.75

var health: float = 100.0
var flight := CrashFlight.new()
var seated_in: VehicleType = null
var seated_amount := 0.0
var _landed := false
var _figure: Node3D


func _ready() -> void:
	if get_child_count() == 0:
		_build_stub()
	collision_layer = PhysicsLayers.PLAYER
	collision_mask = PhysicsLayers.WORLD | PhysicsLayers.VEHICLES
	floor_snap_length = 0.3


## A capsule and a body-sized figure: the stand-in until the Player's character exists.
func _build_stub() -> void:
	var shape := CollisionShape3D.new()
	shape.name = "Capsule"
	var capsule := CapsuleShape3D.new()
	capsule.radius = RADIUS
	capsule.height = HEIGHT
	shape.shape = capsule
	shape.position = Vector3(0, HEIGHT / 2.0, 0)
	add_child(shape)
	_figure = Node3D.new()
	_figure.name = "Figure"
	add_child(_figure)
	var body := MeshInstance3D.new()
	var mesh := CapsuleMesh.new()
	mesh.radius = 0.22
	mesh.height = 1.45
	var shirt := StandardMaterial3D.new()
	shirt.albedo_color = Color("#3a6ea5")
	mesh.material = shirt
	body.mesh = mesh
	body.position = Vector3(0, 0.82, 0)
	_figure.add_child(body)
	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.13
	sphere.height = 0.26
	var skin := StandardMaterial3D.new()
	skin.albedo_color = Color("#8d5a3b")
	sphere.material = skin
	head.mesh = sphere
	head.position = Vector3(0, 1.62, 0)
	_figure.add_child(head)


func set_walking(on: bool) -> void:
	set_physics_process(on or flight.active())
	var shape := get_node_or_null("Capsule") as CollisionShape3D
	if shape != null:
		shape.disabled = not on
	if not on:
		velocity = Vector3.ZERO


func place(feet: Vector3, heading: float) -> void:
	global_position = feet
	rotation = Vector3(0, heading, 0)
	velocity = Vector3.ZERO


## Seated (`amount` 1) or standing (0) for a vehicle type; null stands up.
func set_seated(t: VehicleType, amount: float = 1.0) -> void:
	seated_in = t
	seated_amount = amount if t != null else 0.0
	_show_seated(t, seated_amount)


## Show or hide the figure (closed vehicles hide their driver).
func set_figure_visible(on: bool) -> void:
	visible = on


func throw_off(launch: Vector3, lie_for: float, vehicle: PhysicsBody3D) -> void:
	set_seated(null)
	visible = true
	var shape := get_node_or_null("Capsule") as CollisionShape3D
	if shape != null:
		shape.disabled = false
	if vehicle != null:
		add_collision_exception_with(vehicle)
	flight.start(launch, lie_for, vehicle)
	set_physics_process(true)
	rotation = Vector3(0, atan2(-launch.x, -launch.z), 0)


func knockdown() -> StringName:
	return flight.phase


func consume_landing() -> bool:
	var l := _landed
	_landed = false
	return l


func _physics_process(delta: float) -> void:
	if flight.active():
		var landed := flight.step(self, delta)
		if landed:
			_landed = true
		if not flight.active() and flight.vehicle != null:
			if is_instance_valid(flight.vehicle):
				remove_collision_exception_with(flight.vehicle)
			flight.vehicle = null
		_show_knockdown(flight.phase, flight.tip())
		return
	# On foot: just gravity until the Player's controller takes over.
	if not is_on_floor():
		velocity.y -= RaycastVehicle.GRAVITY * delta
	else:
		velocity = Vector3(0, minf(velocity.y, 0.0), 0)
	move_and_slide()


## Hook: draw the seated pose. The stub folds the figure to sitting height.
func _show_seated(t: VehicleType, amount: float) -> void:
	if _figure == null:
		return
	if t == null:
		_figure.transform = Transform3D.IDENTITY
		return
	# Hips at the origin when seated: the stub's hips are at 0.9 m standing.
	var sit := Boarding.ease_in_out(amount)
	_figure.transform = Transform3D(Basis(Vector3.RIGHT, -t.pose.lean * sit).scaled(Vector3(1, lerpf(1.0, 0.75, sit), 1)), Vector3(0, -0.9 * sit, 0))


## Hook: draw a thrown body (`tip` 0 upright to 1 lying on its back).
func _show_knockdown(_phase: StringName, tip: float) -> void:
	if _figure == null:
		return
	_figure.transform = Transform3D(Basis(Vector3.RIGHT, -PI / 2.0 * tip), Vector3(0, 0.2 * tip, 0))
