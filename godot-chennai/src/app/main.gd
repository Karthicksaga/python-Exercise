class_name Main
extends Node
## The composition root (like `apps/game/src/Game.ts`): wires the systems and runs the game
## flow, loading screen → title menu → play. No gameplay logic lives here.
##
## Loading runs the real steps in order, each on a worker thread (`BackgroundTask`) with a
## frame between steps so the loading screen is drawn; a failed step shows TRY AGAIN / CLOSE.
## The launch argument `--start=play` (after `--`) skips the title menu, for tests and the
## emulator smoke run, like `?start=play` in the Three.js game.
##
## Lines starting with "[boot]" go to stdout (logcat tag `godot` on Android): the CI smoke
## test waits for "[boot] play".

signal state_changed(state: StringName)

const CITY := "res://src/game_world/city/city_world.tscn"
const STEPS: PackedStringArray = ["Reading the map of Chennai", "Reading the streets", "Building the streets around you"]
## Longest wait for the ground's collider, in physics frames (game time, not wall clock).
const GROUND_WAIT_FRAMES := 120

## &"loading", &"failed", &"title" or &"play".
var state: StringName = &"loading"
var source: FileWorldSource = FileWorldSource.new()
var world: CityWorld = null
## Watches for a stalled main loop while loading (see `_watch_frames`).
var _watchdog: Thread = null
var _watching: bool = false

@onready var loading: LoadingScreen = $LoadingScreen
@onready var title: TitleMenu = $TitleMenu
@onready var hud: DebugHud = $DebugHud


func _ready() -> void:
	title.visible = false
	hud.visible = false
	loading.retry_requested.connect(_load)
	loading.close_requested.connect(quit)
	title.play_requested.connect(play)
	title.quit_requested.connect(quit)
	print("[boot] %s, renderer %s" % [Engine.get_version_info().string, RenderingServer.get_current_rendering_method()])
	_load.call_deferred()


func _set_state(next: StringName) -> void:
	state = next
	print("[boot] %s" % next)
	state_changed.emit(next)


func _load() -> void:
	_set_state(&"loading")
	loading.visible = true
	loading.set_steps(STEPS)
	var started := Time.get_ticks_msec()
	_start_watchdog()
	for i in STEPS.size():
		loading.begin_step(i)
		await get_tree().process_frame  # let the screen show the step before the work
		var error := await _run_step(i)
		if error != "":
			printerr("[boot] step %d failed: %s" % [i + 1, error])
			loading.fail(i, error)
			_stop_watchdog()
			_set_state(&"failed")
			return
		loading.finish_step(i)
		print("[boot] step %d/%d done: %s (%d ms since start)" % [i + 1, STEPS.size(), STEPS[i], Time.get_ticks_msec() - started])
		await get_tree().process_frame
	_stop_watchdog()
	loading.visible = false
	var roads := source.loaded_roads()
	hud.set_world_text("%s roads · %s chunks" % [_thousands(roads.size()), _thousands(source.index.chunk_sizes.size())])
	hud.set_credit(source.get_attribution())
	title.set_credits(source.get_attribution(), source.get_data_date())
	if OS.get_cmdline_user_args().has("--start=play"):
		play()
	else:
		show_title()


## Runs one loading step; returns "" or what went wrong.
func _run_step(i: int) -> String:
	match i:
		0:
			return await _background(i, source.open_index)
		1:
			return await _background(i, source.open_roads)
		2:
			return await _add_city()
	return "Unknown step %d." % i


## Runs a step's work on a worker thread; prints a heartbeat every 5 s while it runs (a slow
## device then shows where it is, the TD-25 lesson). The work returns "" or an error.
func _background(i: int, work: Callable) -> String:
	var task := BackgroundTask.start(work)
	var started := Time.get_ticks_msec()
	var beat := started
	while not task.is_done():
		await get_tree().process_frame
		if Time.get_ticks_msec() - beat >= 5000:
			beat = Time.get_ticks_msec()
			print("[boot] step %d still running after %d s" % [i + 1, roundi((beat - started) / 1000.0)])
	var result: Variant = task.result()
	if typeof(result) != TYPE_STRING:
		return "Step %d stopped with an error (see the log)." % (i + 1)
	return result


func _add_city() -> String:
	if world != null:
		return ""
	if ResourceLoader.load_threaded_request(CITY) != OK:
		return "Could not start loading %s." % CITY
	while ResourceLoader.load_threaded_get_status(CITY) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
		await get_tree().process_frame
	var scene := ResourceLoader.load_threaded_get(CITY) as PackedScene
	if scene == null:
		return "Could not load %s." % CITY
	world = scene.instantiate() as CityWorld
	add_child(world)
	move_child(world, 0)
	var error := await world.setup(source)
	if error != "":
		return error
	# The streets round the spawn are built in the background; wait in game time until they and
	# their colliders are in (the streamer's gating, G-54).
	if not await world.wait_ready_around(world.spawn["point"], -1.0, GROUND_WAIT_FRAMES * 60):
		return "The streets round the start did not load."
	for f in GROUND_WAIT_FRAMES:
		if world.ground_ready():
			return ""
		await GameLoop.wait_physics_frames(1)
	return "The ground's collider did not appear in %d physics frames." % GROUND_WAIT_FRAMES


## A thread that reports when no frame has been drawn for 5 s while loading: on a device whose
## GPU stalls, the log then says the main loop stopped rather than going silent (TD-25 lesson).
func _start_watchdog() -> void:
	_stop_watchdog()
	_watching = true
	_watchdog = Thread.new()
	_watchdog.start(_watch_frames)


func _stop_watchdog() -> void:
	_watching = false
	if _watchdog != null:
		_watchdog.wait_to_finish()
		_watchdog = null


func _watch_frames() -> void:
	var last_frame := Engine.get_process_frames()
	var since := Time.get_ticks_msec()
	while _watching:
		OS.delay_msec(250)
		var frame := Engine.get_process_frames()
		if frame != last_frame:
			last_frame = frame
			since = Time.get_ticks_msec()
		elif Time.get_ticks_msec() - since >= 5000:
			print("[boot] no frame for %d s (frame %d): the main loop is stalled" % [roundi((Time.get_ticks_msec() - since) / 1000.0), frame])
			since = Time.get_ticks_msec()


func _exit_tree() -> void:
	_stop_watchdog()


func show_title() -> void:
	hud.visible = false
	title.visible = true
	title.show_menu()
	_set_state(&"title")


func play() -> void:
	title.visible = false
	hud.visible = true
	_set_state(&"play")


func quit() -> void:
	print("[boot] quit")
	get_tree().quit()


## Android Back and Escape: one level up (play → title, ABOUT → menu), then quit.
func go_back() -> void:
	match state:
		&"play":
			show_title()
		&"title":
			if not title.go_back():
				quit()
		&"failed":
			quit()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		go_back()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		go_back()


static func _thousands(n: int) -> String:
	var s := str(n)
	var out := ""
	while s.length() > 3:
		out = "," + s.right(3) + out
		s = s.left(s.length() - 3)
	return s + out
