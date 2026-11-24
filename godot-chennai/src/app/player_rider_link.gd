class_name PlayerRiderLink
extends RiderLink
## `Driving`'s link to the real player (decisions G-67, G-77): getting in uses
## `PlayerController.enter_vehicle(vehicle, anchor)`, where `anchor` is a node this link moves
## along the walk to the door, onto the seat and with the vehicle; getting out uses
## `exit_vehicle(feet, yaw)`; a crash throw pauses the player's own step (`controls_enabled` and
## its physics process) while `CrashFlight` moves the body.
##
## The player has no seated pose yet: a seated rider is drawn standing with the hips on the seat
## (the legs pass through the seat); closed vehicles hide the driver.

## Height of the hips above the feet of a standing figure (the seated anchor is this much lower).
const HIP_HEIGHT := 0.92

var player: PlayerController
var _anchor := Node3D.new()
var _sit := 0.0


static func make(p: PlayerController) -> PlayerRiderLink:
	var link := PlayerRiderLink.new()
	link.player = p
	link.body = p
	link._anchor.name = "RideAnchor"
	return link


func begin_ride(vehicle: Node3D) -> void:
	if _anchor.get_parent() == null:
		player.get_parent().add_child(_anchor)
	_anchor.global_transform = player.global_transform
	player.enter_vehicle(vehicle, _anchor)


func end_ride(feet: Vector3, yaw: float) -> void:
	_sit = 0.0
	if player.vehicle != null:
		player.exit_vehicle(feet, yaw)
	else:
		player.respawn(feet, yaw)
	player.figure.rotation = Vector3(0, 0, 0)
	player.figure.position = Vector3.ZERO


func place(feet: Vector3, yaw: float) -> void:
	if player.vehicle == null:
		player.respawn(feet, yaw)
		player.global_position = feet
		return
	_anchor.global_transform = Transform3D(Basis(Vector3.UP, yaw), feet - Vector3(0, HIP_HEIGHT * Boarding.ease_in_out(_sit), 0))
	player.global_transform = _anchor.global_transform


func hold(seat: Transform3D) -> void:
	_anchor.global_transform = Transform3D(seat.basis, seat.origin - seat.basis.y * HIP_HEIGHT)
	player.global_transform = _anchor.global_transform


func set_seated(_type: VehicleType, amount: float) -> void:
	_sit = amount if _type != null else 0.0


func set_figure_visible(on: bool) -> void:
	player.figure.visible = on


func _own_control(on: bool) -> void:
	player.controls_enabled = on
	player.set_physics_process(on)
	player.velocity = Vector3.ZERO


func _show_knockdown(tip: float) -> void:
	if _clips():
		# The figure's own fall, crumple and get-up poses draw it (agent/godot-anim); it stays
		# upright on its node.
		player.figure.rotation = Vector3(0, player.yaw - player.rotation.y, 0)
		player.figure.position = Vector3.ZERO
		return
	# Fallback (G-275): tipped onto its back about the feet, head away from the way it flew (so
	# it never lies into the wall it hit; the body itself is the upright capsule the walls stop).
	# Getting up rolls a little onto one side first, so it does not hinge up like a plank.
	var roll := 0.0
	if flight.phase == &"rising":
		roll = 0.55 * sin(PI * clampf(1.0 - tip, 0.0, 1.0))
	player.figure.rotation = Vector3(PI / 2.0 * tip, player.yaw - player.rotation.y, roll)
	player.figure.position = Vector3(0, 0.2 * tip, 0)


## The figure has the knockdown API (play_fall, play_landed, play_getup) of agent/godot-anim.
## A thin, optional interface: until that lands, the tipped fallback above draws the throw.
func _clips() -> bool:
	return player.figure != null and player.figure.has_method(&"play_fall")


func _show_fall(velocity: Vector3) -> void:
	if _clips():
		player.figure.call(&"play_fall", velocity)


func _show_landed() -> void:
	if _clips() and player.figure.has_method(&"play_landed"):
		player.figure.call(&"play_landed")


func _show_getup() -> void:
	if _clips() and player.figure.has_method(&"play_getup"):
		player.figure.call(&"play_getup")
