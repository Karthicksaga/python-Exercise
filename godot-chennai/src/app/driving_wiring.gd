class_name DrivingWiring
extends Node
## Composition glue between `Driving` (vehicles), the player's `FollowCamera` and `PlayerRig`
## (player) and the touch `DrivingControls` (ui), so none of those modules knows the others
## (AGENTS.md boundaries, decision G-78). Holds no gameplay: it copies touch state in, pushes HUD
## state out, swaps the on-foot and driving controls, and points the camera at what `Driving`
## says to follow, chasing the vehicle while driving (`FollowCamera.chase`, G-65, G-79). It also
## registers GET IN with the walking controls' `ActionContext` (the ACTION button, G-176), turns
## crashes into haptics (G-178) and tells the controls when the vehicle is reversing on hold.
## Crash feedback (G-272…G-274): every felt hit (bump to throw) bursts sparks and glass from the
## contact (`CrashEffects`, sized by the band and the kinds), shakes the camera (trauma by band;
## none with reduced motion), and a wrecked vehicle smokes; a traffic vehicle that was hit
## honks back a moment later (`reaction`).

var driving: Driving
var controls: DrivingControls
var camera: FollowCamera
var rig: PlayerRig
var action_source: Callable = Callable()
var _followed: Node3D = null
var _settings: ControlSettings = null
## Sparks, glass and smoke (one per wiring, in `WorldOrigin.GROUP`).
var effects: CrashEffects = null
## Peace zones: no crash effects or camera shake inside, no GET IN (G-481); null: none.
var peace: PeaceZones = null
## No camera shake (the platform's reduced-motion flag by default).
var reduced_motion: bool = TitleMenu.platform_reduces_motion()
## Camera trauma per band (game-feel tiers: bump small, shaken medium, fall and thrown large).
const TRAUMA := {&"bump": 0.18, &"shaken": 0.45, &"fall": 0.65, &"thrown": 0.9}
## A hit traffic driver honks this long after the hit (game seconds).
const HONK_AFTER := 0.6
## Someone hit by the player reacts (a honk): the kind of the vehicle hit (&"bike", &"car", …).
signal reaction(kind: StringName, at: Vector3)
var _honk_in := -1.0
var _honk_kind: StringName = &""
var _honk_at := Vector3.ZERO


## GET IN, offered to the ACTION button while a vehicle is within reach on foot.
func _get_in() -> Variant:
	var v := driving.nearest_vehicle()
	if v == null:
		return null
	# Vehicles stay outside a peace zone (G-481): nothing to get into there.
	if peace != null and not peace.allows("boarding", WorldOrigin.to_world(driving.rider.position())):
		return null
	var gap := v.global_position.distance_to(driving.rider.position())
	return ActionCandidate.make(Tr.t("act.get_in"), ActionContext.P_BOARD, gap, func() -> void: driving.enter(driving.nearest_vehicle()))


func _on_crash(v: Vehicle, outcome: CrashRules.Outcome) -> void:
	var settings := _settings if _settings != null else ControlSettings.shared()
	HapticsPlan.play(HapticsPlan.crash(outcome.type, outcome.damage), settings, DeviceTracker.shared().current)
	feedback(v, outcome)


## The look and feel of a hit: effects, camera shake, smoke when wrecked, the other's reaction.
func feedback(v: Vehicle, outcome: CrashRules.Outcome) -> void:
	# A peace zone has no sparks, glass or shaking (G-481); the hit is still felt in the vehicle's wobble.
	if peace != null and not peace.allows("crash_effects", WorldOrigin.to_world(v.global_position)):
		return
	if camera != null:
		camera.shake_strength = 0.0 if reduced_motion else 1.0
		camera.add_trauma(float(TRAUMA.get(outcome.type, 0.0)))
	var hit := outcome.hit
	if effects != null and hit != null:
		var plan := burst_plan(v.type.kind, hit.other_kind, outcome.type, outcome.impact_kmh)
		effects.burst(hit.point, hit.normal, plan.z, int(plan.x), int(plan.y))
		_smoke_if_wrecked(v)
		var other := hit.other as Vehicle
		if other != null and is_instance_valid(other):
			_smoke_if_wrecked(other)
	if hit != null and hit.other is TrafficVehicleView and outcome.type != &"none":
		_honk_in = HONK_AFTER
		_honk_kind = hit.other_kind
		_honk_at = hit.point


func _smoke_if_wrecked(v: Vehicle) -> void:
	if v.damage_stage() >= 2:
		# From the engine: the front of cars, autos and buses, under the seat of a two-wheeler.
		var h := v.type.spec.half_extents
		effects.smoke(v, Vector3(0, h.y * 0.6, -h.z * 0.7 if not v.type.leans else 0.0))


## How many sparks and shards a hit throws, and how hard (x sparks, y shards, z strength 0..1):
## glass from the windows and lamps of cars, autos and buses (a bike only has its lamp), sparks
## from metal on metal or on a wall, more the harder the hit.
static func burst_plan(kind: StringName, other_kind: StringName, band: StringName, kmh: float) -> Vector3:
	var s := clampf((kmh - CrashRules.BUMP_FROM) / 50.0, 0.0, 1.0)
	var glass := maxf(_glass(kind), 0.5 * _glass(other_kind))
	var sparks := roundi(lerpf(3.0, 30.0, s))
	var shards := 0
	if band != &"bump":
		shards = roundi(lerpf(4.0, 36.0, s) * glass)
	return Vector3(sparks, shards, s)


## Glass in a kind: 1 windows and lamps, a quarter for a bike's lamp, none for a wall.
static func _glass(kind: StringName) -> float:
	if kind == &"":
		return 0.0
	return 0.25 if kind == &"bike" else 1.0


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
	d.bumped.connect(w._on_bump)
	w.effects = CrashEffects.new()
	w.effects.add_to_group(WorldOrigin.GROUP)
	w.add_child(w.effects)
	d.mode_changed.connect(w._on_mode)
	return w


func _on_bump(v: Vehicle, outcome: CrashRules.Outcome) -> void:
	var settings := _settings if _settings != null else ControlSettings.shared()
	HapticsPlan.play(HapticsPlan.crash(&"bump", 0.0), settings, DeviceTracker.shared().current)
	feedback(v, outcome)


func _on_mode(mode: StringName) -> void:
	var v := driving.vehicle
	if controls != null:
		controls.set_mode(mode, "ctl.siren" if v != null and v.has_siren() else "ctl.horn")
	if rig != null and rig.controls != null:
		# The walking controls (stick, ACTION, JUMP) only on foot.
		rig.controls.visible = mode == &"foot"


func _physics_process(dt: float) -> void:
	if _honk_in >= 0.0:
		_honk_in -= dt
		if _honk_in < 0.0:
			reaction.emit(_honk_kind, _honk_at)
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
