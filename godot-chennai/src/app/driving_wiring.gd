class_name DrivingWiring
extends Node
## Composition glue between `Driving` (vehicles), the player's `FollowCamera` and `PlayerRig`
## (player) and the touch `DrivingControls` (ui), so none of those modules knows the others
## (AGENTS.md boundaries, decision G-78). Holds no gameplay: it copies touch state in, pushes HUD
## state out, swaps the on-foot and driving controls, and points the camera at what `Driving`
## says to follow, chasing the vehicle while driving (`FollowCamera.chase`, G-65, G-79). It also
## registers GET IN with the walking controls' `ActionContext` (the ACTION button, G-176), turns
## crashes into haptics (G-178) and tells the controls when the vehicle is reversing on hold.

var driving: Driving
var controls: DrivingControls
var camera: FollowCamera
var rig: PlayerRig
var action_source: Callable = Callable()
var _followed: Node3D = null
var _settings: ControlSettings = null


## GET IN, offered to the ACTION button while a vehicle is within reach on foot.
func _get_in() -> Variant:
	var v := driving.nearest_vehicle()
	if v == null:
		return null
	var gap := v.global_position.distance_to(driving.rider.position())
	return ActionCandidate.make("GET IN", ActionContext.P_BOARD, gap, func() -> void: driving.enter(driving.nearest_vehicle()))


func _on_crash(_v: Vehicle, outcome: CrashRules.Outcome) -> void:
	var settings := _settings if _settings != null else ControlSettings.shared()
	HapticsPlan.play(HapticsPlan.crash(outcome.type, outcome.damage), settings, DeviceTracker.shared().current)


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
		c.exit_pressed.connect(func() -> void: d.exit())
		c.horn_pressed.connect(d.press_horn)
		d.toast.connect(c.show_toast)
	if player_rig != null and player_rig.controls != null:
		w.action_source = player_rig.controls.action_context.add_source(w._get_in)
		w._settings = player_rig.controls.settings
	d.crashed.connect(w._on_crash)
	d.mode_changed.connect(w._on_mode)
	return w


func _on_mode(mode: StringName) -> void:
	var v := driving.vehicle
	if controls != null:
		controls.set_mode(mode, "SIREN" if v != null and v.has_siren() else "HORN")
	if rig != null and rig.controls != null:
		# The walking controls (stick, ACTION, JUMP) only on foot.
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
	var v := driving.vehicle
	if mode == &"driving" and v != null:
		controls.set_readout("%d km/h   %s" % [roundi(v.speed_kmh()), driving.gear_label()])
		controls.set_reversing(driving.reverse_hold.reversing)
		if v.has_siren():
			controls.set_siren_lit(v.siren())
