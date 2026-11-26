class_name TitleWiring
extends Node
## The live city behind the title menu (G-164, G-165): a slow camera drift over one chosen place
## (Marina, T. Nagar or Central, picked by a seed, once per launch), the real clock and weather
## (`CityEnvironment` reads them through `GameLoop.clock` and `Weather`; nothing here draws a world
## or a second rain), the chip's place and status, and distant lightning when it rains.
##
## Where the camera is. At launch, with `tour` on, the streaming focus moves to the spot while
## loading is still shown, the player and their parked vehicles stay behind (the player is frozen
## so they cannot fall through ground that is no longer there) and `CityLife` follows the spot, so
## its traffic and people are the real ones of that street. Pressing CONTINUE or NEW GAME hands
## the focus back (`release`) and waits, in game time, for the ground under the player. Coming back
## to the title from play (QUIT TO TITLE) the camera simply drifts over where the player is (their
## vehicle must not lose its ground). Headless runs (the tests) keep `tour` off by default.
##
## Reduced motion: the camera holds still and nothing flashes.

signal released

## Frames (game time) the spot's ground may take; after that the title is shown anyway.
const READY_FRAMES := 60 * 40
## Ground that must be loaded under the player before they are let go (metres).
const HANDOFF_RADIUS := 60.0
const CHIP_EVERY := 0.5
const FOV := 58.0
## Lightning: gaps between bolts in seconds, and the flash's colour.
const BOLT_GAP := Vector2(4.5, 12.0)
const FLASH := Color(0.87, 0.91, 1.0)
## Exposure multiplier of the title camera at full night (1 by day).
const NIGHT_LIFT := 2.6
## The rain beyond the camera's own box, as `RainView` layers in front of the camera (the prototype's
## far and middle drops): {distance ahead, box, drops, streak, width, opacity share}. The near
## layer is `CityEnvironment`'s rain, unchanged. One draw call each, none when dry.
const RAIN_LAYERS: Array[Dictionary] = [
	{"distance": 32.0, "box": Vector3(76.0, 44.0, 76.0), "drops": 900, "streak": 0.07, "width": 0.014, "share": 0.8},
	{"distance": 120.0, "box": Vector3(220.0, 90.0, 220.0), "drops": 1100, "streak": 0.12, "width": 0.03, "share": 0.6},
]

var world: CityWorld
var rig: PlayerRig
var life: CityLife = null
var title: TitleMenu = null
## True: the camera tours a faraway spot. False: it drifts over the player.
var tour: bool = DisplayServer.get_name() != "headless"
var reduced_motion: bool = TitleMenu.platform_reduces_motion()
## Forced storm (lightning while it rains) or not; set by `prepare` from the seed otherwise.
var storm: bool = false
var spot: TitleSpots.Spot = null
var place: String = ""
var camera: Camera3D
var active: bool = false
## The focus has been moved off the player to the spot.
var away: bool = false

var rain_layers: Array[RainView] = []
## Main-thread script time of the title's own frame work (µs), for the report.
var stats: Dictionary = {"steps": 0, "total_usec": 0, "max_usec": 0}
var _marker: Node3D
var _exposure: CameraAttributesPractical
var _t: float = 0.0
var _phase: float = 0.0
var _chip_clock: float = 0.0
var _waiting: bool = false
var _rng := RandomNumberGenerator.new()
var _flash: ColorRect = null
var _flash_layer: CanvasLayer = null
var _flash_level: float = 0.0
var _flash_steps: Array[Vector2] = []
var _next_bolt: float = 0.0
var _centre: Vector2 = Vector2.ZERO
var _facing: float = 0.0


static func make(city: CityWorld, player: PlayerRig, city_life: CityLife, menu: TitleMenu) -> TitleWiring:
	var w := TitleWiring.new()
	w.name = "TitleWiring"
	w.world = city
	w.rig = player
	w.life = city_life
	w.title = menu
	return w


func _ready() -> void:
	camera = Camera3D.new()
	camera.name = "TitleCamera"
	camera.fov = FOV
	camera.near = 0.3
	camera.far = 900.0
	# The title is staged a little brighter than play at night (the prototype's night is a graded
	# photo at 0.8 brightness, ours is near black): only this camera, never the world's light.
	_exposure = CameraAttributesPractical.new()
	camera.attributes = _exposure
	world.add_child(camera)
	_marker = Node3D.new()
	_marker.name = "TitleFocus"
	world.add_child(_marker)
	# Both stay put in the world when the floating origin moves.
	camera.add_to_group(WorldOrigin.GROUP)
	_marker.add_to_group(WorldOrigin.GROUP)
	_flash_layer = CanvasLayer.new()
	_flash_layer.name = "Lightning"
	_flash_layer.layer = 4
	add_child(_flash_layer)
	_flash = ColorRect.new()
	_flash.color = FLASH
	_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_flash.material = mat
	_flash.modulate.a = 0.0
	_flash.visible = false
	_flash_layer.add_child(_flash)
	for layer: Dictionary in RAIN_LAYERS:
		var view := RainView.new(int(layer["drops"]), layer["box"], float(layer["streak"]), float(layer["width"]))
		view.name = "TitleRain"
		add_child(view)
		rain_layers.append(view)
	set_process(false)
	set_physics_process(false)


## Loading work: chooses the spot from `seed_value` (or `forced`), and with `tour` moves the
## streaming there and waits for the ground, in game time, with the loading screen still up.
func prepare(seed_value: int, forced: StringName = &"") -> void:
	spot = TitleSpots.by_id(forced) if forced != &"" else TitleSpots.pick(seed_value)
	_rng.seed = seed_value
	_phase = _rng.randf() * TAU
	storm = _rng.randi_range(0, 2) == 0
	_next_bolt = _rng.randf_range(BOLT_GAP.x, BOLT_GAP.y)
	if not tour or spot == null:
		return
	away = true
	_marker.global_position = WorldOrigin.to_scene(spot.target)
	rig.body.process_mode = Node.PROCESS_MODE_DISABLED
	world.focus_node = _marker
	if life != null:
		life.focus_node = _marker
	await world.wait_ready_around(spot.target, -1.0, READY_FRAMES)


## The title is shown: the camera takes over and drifts.
func activate() -> void:
	active = true
	_waiting = false
	_t = 0.0
	if not away or spot == null:
		_centre = WorldOrigin.to_world(rig.body.global_position)
		_facing = rig.camera.yaw
	_place_camera()
	camera.make_current()
	set_process(true)
	_update_chip(true)


## Play begins: the camera goes back to the player. Returns true while the ground under the
## player is still loading (the caller shows its loading screen until `released`).
func release() -> bool:
	if not active:
		return false
	active = false
	set_process(false)
	set_physics_process(false)
	_flash.visible = false
	for view in rain_layers:
		view.visible = false
	rig.camera.camera.make_current()
	if not away:
		return false
	away = false
	world.focus_node = rig.body
	if life != null:
		life.focus_node = rig.body
	_waiting = true
	set_physics_process(true)
	return true


## Rewrites the chip now (the place and the clock and weather as they are).
func refresh_chip() -> void:
	_update_chip(true)


func is_waiting() -> bool:
	return _waiting


func _physics_process(_dt: float) -> void:
	if not _waiting:
		set_physics_process(false)
		return
	var at := WorldOrigin.to_world(rig.body.global_position)
	if world.world_ready_around(at, HANDOFF_RADIUS):
		_waiting = false
		rig.body.process_mode = Node.PROCESS_MODE_INHERIT
		released.emit()


func _process(dt: float) -> void:
	if not active:
		return
	step(dt)


## One frame of the title: the drift, the chip and the lightning (`dt` is real frame time; the
## clock and the weather it shows run in game time).
func step(dt: float) -> void:
	var started := Time.get_ticks_usec()
	_step(dt)
	var spent := Time.get_ticks_usec() - started
	stats["steps"] = int(stats["steps"]) + 1
	stats["total_usec"] = int(stats["total_usec"]) + spent
	stats["max_usec"] = maxi(int(stats["max_usec"]), spent)


func _step(frame_dt: float) -> void:
	# A slow frame must not make the drift jump or swallow a flash (the prototype clamps too).
	var dt := minf(frame_dt, 0.05)
	if not reduced_motion:
		_t += dt
	_place_camera()
	_rain(dt)
	_chip_clock -= frame_dt
	if _chip_clock <= 0.0:
		_update_chip(false)
	_lightning(dt)


func _place_camera() -> void:
	var ground: Vector2
	var height: float
	var target: Vector2
	if away and spot != null:
		var pose := TitleSpots.pose(spot, _t, _phase)
		ground = pose["ground"]
		height = pose["height"]
		target = pose["target"]
		_marker.global_position = WorldOrigin.to_scene(target)
	else:
		# Over where the player is: back and up, looking ahead; nobody close up.
		var wave := sin(TAU * _t / 64.0 + _phase)
		var forward := Vector2(-sin(_facing + 0.22 * wave), -cos(_facing + 0.22 * wave))
		ground = _centre - forward * 22.0
		height = 12.0 + wave
		target = _centre + forward * 30.0
	camera.global_position = WorldOrigin.to_scene(ground, height)
	camera.look_at(WorldOrigin.to_scene(target, 3.0))


func _rain(dt: float) -> void:
	var level := Weather.rain_level()
	var night := CityEnvironment.night_level
	var lift := lerpf(1.0, NIGHT_LIFT, night)
	if absf(lift - _exposure.exposure_multiplier) > 0.005:
		_exposure.exposure_multiplier = lift
	var ahead := -camera.global_basis.z
	var flat := Vector3(ahead.x, 0.0, ahead.z).normalized()
	for i in rain_layers.size():
		var layer := RAIN_LAYERS[i]
		var box: Vector3 = layer["box"]
		var centre := camera.global_position + flat * float(layer["distance"])
		centre.y = box.y * 0.35
		rain_layers[i].step(dt, centre, level * float(layer["share"]), night)


## The real place near the camera and "Evening · 17:45 · Rain".
func current_place() -> String:
	var at := spot.target if (away and spot != null) else _centre
	return TitlePlace.name_at(world.source, at)


func status_text() -> String:
	var weather := "weather.clear"
	if Weather.raining:
		weather = "weather.storm" if storm and not reduced_motion else "weather.rain"
	return "%s · %s · %s" % [GameLoop.clock.label_text(), GameLoop.clock.text(), Tr.line(weather)]


func _update_chip(force: bool) -> void:
	_chip_clock = CHIP_EVERY
	if title == null:
		return
	if force or place == "":
		place = current_place()
	title.set_place(place, status_text())


# --- Lightning ---------------------------------------------------------------------------------

## A flash of 0.55, then 0.75 a moment later and 0.35 after that, fading, like the prototype; only
## while it rains and the launch drew a storm (the weather itself is clear or rain, G-87).
func _lightning(dt: float) -> void:
	var stormy := storm and Weather.raining and Weather.rain_level() > 0.6 and not reduced_motion
	_flash.visible = stormy and _flash_level > 0.0
	if stormy:
		_next_bolt -= dt
		if _next_bolt <= 0.0:
			bolt()
	if not _flash_steps.is_empty():
		var s := _flash_steps[0]
		s.x -= dt
		_flash_steps[0] = s
		if s.x <= 0.0:
			_flash_level = s.y
			_flash_steps.remove_at(0)
	_flash_level = maxf(0.0, _flash_level - dt * 2.2)
	_flash.modulate.a = _flash_level
	_flash.visible = _flash_level > 0.001


## Starts a bolt now; the next comes after a random gap.
func bolt() -> void:
	_flash_level = 0.55
	_flash_steps = [Vector2(0.09, 0.75), Vector2(0.08, 0.35)]
	_next_bolt = _rng.randf_range(BOLT_GAP.x, BOLT_GAP.y)


func flash_level() -> float:
	return _flash_level
