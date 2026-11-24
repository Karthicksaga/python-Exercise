class_name PlayerRiderLink
extends RiderLink
## `Driving`'s link to the real player (decisions G-67, G-77): getting in uses
## `PlayerController.enter_vehicle(vehicle, anchor)`, where `anchor` is a node this link moves
## along the walk to the door, onto the seat and with the vehicle; getting out uses
## `exit_vehicle(feet, yaw)`; a crash throw pauses the player's own step (`controls_enabled` and
## its physics process) while `CrashFlight` moves the body.
##
## Seated, the figure takes the vehicle's ride pose (`SeatPose` from `VehicleType.pose`, G-261):
## hips on the seat, palms on the grips or wheel following the steering, feet on the footrest or
## pedals. Thrown, it falls, lies and gets up through the figure's knockdown API (G-262).

## Height of the hips above the feet of a standing figure (the seated anchor is this much lower).
const HIP_HEIGHT := 0.92

var player: PlayerController
var _anchor := Node3D.new()
var _sit := 0.0
## One seat pose per vehicle type ridden (the steering angle lives on it).
var _seats: Dictionary[int, SeatPose] = {}
var _seat: SeatPose = null
var _flight_phase: StringName = &""
var _advanced_frame: int = -1


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
	# The body now turns with the anchor; the figure faces the body's way.
	player.figure.rotation = Vector3.ZERO
	player.figure.position = Vector3.ZERO


func end_ride(feet: Vector3, yaw: float) -> void:
	_sit = 0.0
	if player.vehicle != null:
		player.exit_vehicle(feet, yaw)
	else:
		player.respawn(feet, yaw)
	player.figure.rotation = Vector3(0, yaw - player.rotation.y, 0)
	player.figure.position = Vector3.ZERO
	player.figure.set_seat(null)


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


func set_seated(type: VehicleType, amount: float) -> void:
	_sit = amount if type != null else 0.0
	if type == null:
		_seat = null
		player.figure.set_seat(null)
		return
	_seat = seat_for(type)
	player.figure.rotation = Vector3.ZERO
	player.figure.set_seat(_seat, amount)


## The seated pose of a vehicle type's driver, hip joints HIP_HEIGHT above the figure's origin.
func seat_for(type: VehicleType) -> SeatPose:
	var id := type.get_instance_id()
	if not _seats.has(id):
		var p := type.pose
		var s := SeatPose.driver(HIP_HEIGHT, p.lean, p.hand, p.foot, p.knees)
		s.hub = p.hub
		s.steer_axis = p.steer_axis
		s.steer_ratio = p.steer_ratio
		_seats[id] = s
	return _seats[id]


func steer(angle: float) -> void:
	if _seat != null:
		_seat.set_steer(angle)


func set_figure_visible(on: bool) -> void:
	player.figure.visible = on


func _own_control(on: bool) -> void:
	player.controls_enabled = on
	player.set_physics_process(on)
	player.velocity = Vector3.ZERO


func _show_knockdown(_tip: float) -> void:
	# The figure falls, lies and gets up on its own skeleton (G-262), facing the way it flew;
	# the body itself is the upright capsule the walls stop. The player's own step is off during
	# the throw, so the figure is advanced here, once per physics frame.
	var fig := player.figure
	var phase := flight.phase
	if phase != _flight_phase:
		match phase:
			&"flying":
				fig.rotation = Vector3(0, player.yaw - player.rotation.y, 0)
				fig.position = Vector3.ZERO
				fig.play_fall(body.velocity)
			&"sliding", &"lying":
				fig.play_landed()
			&"rising":
				fig.play_getup()
		_flight_phase = phase
	var frame := Engine.get_physics_frames()
	if frame != _advanced_frame and phase != &"":
		_advanced_frame = frame
		fig.advance(body.get_physics_process_delta_time(), 0.0, true)
