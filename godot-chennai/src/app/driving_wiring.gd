class_name DrivingWiring
extends Node
## Composition glue between `Driving` (vehicles), the `ChaseCamera` (game_engine) and the touch
## `DrivingControls` (ui), so none of those modules knows the others (AGENTS.md boundaries,
## decision G-78). Holds no gameplay: it copies touch state in, pushes HUD state out, and points
## the camera at what `Driving` says to follow.

## Height of the camera's pivot above a person's feet, and how far back it sits on foot.
const FOOT_PIVOT := 1.6
const FOOT_DISTANCE := 5.6

var driving: Driving
var controls: DrivingControls
var camera: ChaseCamera


static func wire(d: Driving, c: DrivingControls, cam: ChaseCamera) -> DrivingWiring:
	var w := DrivingWiring.new()
	w.name = "DrivingWiring"
	w.driving = d
	w.controls = c
	w.camera = cam
	# Before `Driving` (-10) in each step, so the touch state is fresh.
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
	controls.set_mode(mode, "SIREN" if v != null and v.has_siren() else "HORN")


func _physics_process(_delta: float) -> void:
	if controls != null:
		driving.touch_gas = controls.gas_held()
		driving.touch_brake = controls.brake_held()
		driving.touch_steer = controls.steer_value()
	if camera != null:
		var t := driving.camera_target()
		var v := t as Vehicle
		if v != null:
			# Pivot a little above the roof: the ground is `model.position.y` below the chassis centre.
			camera.follow(v, v.type.camera_distance, v.model.position.y + v.type.spec.half_extents.y * 2.0 + 0.6)
		elif t != null:
			camera.follow(t, FOOT_DISTANCE, FOOT_PIVOT)


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
