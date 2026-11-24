class_name DrivingWiring
extends Node
## Composition glue between `Driving` (vehicles), the player's `FollowCamera` and `PlayerRig`
## (player) and the touch `DrivingControls` (ui), so none of those modules knows the others
## (AGENTS.md boundaries, decision G-78). Holds no gameplay: it copies touch state in, pushes HUD
## state out, swaps the on-foot and driving controls, and points the camera at what `Driving`
## says to follow, chasing the vehicle while driving (`FollowCamera.chase`, G-65, G-79).

var driving: Driving
var controls: DrivingControls
var camera: FollowCamera
var rig: PlayerRig
var _followed: Node3D = null


static func wire(d: Driving, c: DrivingControls, player_rig: PlayerRig) -> DrivingWiring:
	var w := DrivingWiring.new()
	w.name = "DrivingWiring"
	w.driving = d
	w.controls = c
	w.rig = player_rig
	w.camera = player_rig.camera if player_rig != null else null
	# Before `Driving` (-10) in each step, so the touch state is fresh; the camera runs last (100).
	w.process_physics_priority = -20
	if c != null:
		c.gear_selected.connect(d.select_gear)
		c.exit_pressed.connect(func() -> void: d.exit())
		c.horn_pressed.connect(d.press_horn)
		c.get_in_pressed.connect(func() -> void: d.enter(d.nearest_vehicle()))
		d.toast.connect(c.show_toast)
	d.mode_changed.connect(w._on_mode)
	return w


func _on_mode(mode: StringName) -> void:
	var v := driving.vehicle
	if controls != null:
		controls.set_mode(mode, "SIREN" if v != null and v.has_siren() else "HORN")
	if rig != null and rig.controls != null:
		# The walking controls (stick, JUMP, RUN) only on foot.
		rig.controls.visible = mode == &"foot"


func _physics_process(dt: float) -> void:
	if controls != null:
		driving.touch_gas = controls.gas_held()
		driving.touch_brake = controls.brake_held()
		driving.touch_steer = controls.steer_value()
	if camera == null:
		return
	var t := driving.camera_target()
	if t != _followed and t != null:
		camera.follow(t)
		var v := t as Vehicle
		camera.reach = v.type.camera_distance if v != null else FollowCamera.DISTANCE
		_followed = t
	var driven := driving.vehicle
	if driving.mode() == &"driving" and driven != null:
		camera.chase(driven.linear_velocity, driven.yaw(), driven.forward_speed(), driven.type.spec.max_speed, dt)


func _process(_delta: float) -> void:
	if controls == null:
		return
	var mode := driving.mode()
	controls.set_get_in(mode == &"foot" and driving.nearest_vehicle() != null)
	var v := driving.vehicle
	if mode == &"driving" and v != null:
		controls.set_readout("%d km/h   %s" % [roundi(v.speed_kmh()), driving.gear_label()])
		controls.set_gears(driving.gearbox.gear, driving.gearbox.pending)
		if v.has_siren():
			controls.set_siren_lit(v.siren())
