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
const STEPS: PackedStringArray = ["Reading the map of Chennai", "Reading the streets", "Building the streets around you", "Parking the vehicles"]
## Longest wait for the ground's collider, in physics frames (game time, not wall clock).
const GROUND_WAIT_FRAMES := 120

## &"loading", &"failed", &"title", &"play" or &"paused".
var state: StringName = &"loading"
## The regional world (format 2, `world/`) when it is installed, else today's files (format 1);
## `--world=v1` after `--` forces format 1 for comparison (G-56).
var source: WorldSource = _default_source()
var world: CityWorld = null
## The player on foot, placed on loaded ground at the start (Player's G-67).
var rig: PlayerRig = null
## Driving, parked vehicles, sounds, day and night round the player (`PlayWiring`).
var play_wiring: PlayWiring = null
## The pause menu and the PAUSE button (built here, shown in play).
var pause_menu: PauseMenu = null


## Traffic, walkers and crowds round the player (G-120…G-128).
var life: CityLife = null
## Taking over traffic cars, autos and bikes on foot (G-300); the ACTION button's TAKE OVER.
var carjacking: Carjacking = null
## The live city behind the title: camera drift, chip, lightning (G-164). Made at the end of loading.
var title_wiring: TitleWiring = null
## The title camera tours a faraway spot (needs a display; headless runs stay with the player).
var title_tour: bool = DisplayServer.get_name() != "headless"
## The launch's seed for the spot (`-1`: the clock), and a spot forced by a tool or test.
var title_seed: int = -1
var title_spot: StringName = &""
## Watches for a stalled main loop while loading (see `_watch_frames`).
var _watchdog: Thread = null
var _watching: bool = false

@onready var loading: LoadingScreen = $LoadingScreen
@onready var title: TitleMenu = $TitleMenu
@onready var hud: DebugHud = $DebugHud


func _ready() -> void:
	# The menus and Back keep working while the world is paused; the world itself pauses.
	process_mode = Node.PROCESS_MODE_ALWAYS
	_add_pause_menu()
	title.visible = false
	hud.visible = false
	loading.retry_requested.connect(_load)
	loading.close_requested.connect(quit)
	title.play_requested.connect(play)
	title.quit_requested.connect(quit)
	print("[boot] %s, renderer %s" % [Engine.get_version_info().string, RenderingServer.get_current_rendering_method()])
	_load.call_deferred()


static func _default_source() -> WorldSource:
	if RegionalWorldSource.available() and not OS.get_cmdline_user_args().has("--world=v1"):
		return RegionalWorldSource.new()
	return FileWorldSource.new()


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
	if not OS.get_cmdline_user_args().has("--start=play"):
		await _prepare_title()
	_stop_watchdog()
	loading.visible = false
	var roads := source.loaded_roads()
	hud.set_world_text("%s roads · %s chunks" % [_thousands(roads.size()), _thousands(source.chunk_count())])
	hud.set_credit(source.get_attribution())
	title.set_credits(source.get_attribution(), source.get_data_date())
	if OS.get_cmdline_user_args().has("--start=play"):
		play()
	else:
		show_title()


## Chooses the title's spot and (with `title_tour`) streams it in, still behind the loading screen.
func _prepare_title() -> void:
	if title_wiring == null:
		title_wiring = TitleWiring.make(world, rig, life, title)
		title_wiring.tour = title_tour
		add_child(title_wiring)
	var seed_value := title_seed if title_seed >= 0 else int(Time.get_unix_time_from_system())
	await title_wiring.prepare(seed_value, title_spot)


## Runs one loading step; returns "" or what went wrong.
func _run_step(i: int) -> String:
	match i:
		0:
			return await _background(i, Callable(source, &"open_index"))
		1:
			return await _background(i, Callable(source, &"open_roads"))
		2:
			return await _add_city()
		3:
			return await _add_play()
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
			loading.show_slow(i, roundi((beat - started) / 1000.0))
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
	world.process_mode = Node.PROCESS_MODE_PAUSABLE
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
			var failed := await _add_player()
			return failed if failed != "" else await _add_life()
		await GameLoop.wait_physics_frames(1)
	return "The ground's collider did not appear in %d physics frames." % GROUND_WAIT_FRAMES


## The player at the start, on the road the Three.js game starts on; streaming and the floating
## origin then follow the player's body.
func _add_player() -> String:
	if rig != null:
		return ""
	rig = PlayerRig.new()
	rig.name = "Player"
	rig.add_to_group(WorldOrigin.GROUP)
	rig.reads_devices = false
	world.add_child(rig)
	rig.controls.visible = false
	var error := await rig.load_figure()
	if error != "":
		return error
	var start: Vector2 = world.spawn["point"]
	rig.place(WorldOrigin.to_scene(start, 0.05), world.spawn["heading"])
	world.focus_node = rig.body
	world.manage_origin = true
	WorldOrigin.shifted.connect(func(_offset: Vector3) -> void: rig.camera.snap())
	# The missions, jobs, fares and their HUD (G-130): they follow `state_changed` and NEW GAME.
	add_child(MissionsLayer.for_main(self))
	return ""


## Driving, parked vehicles, sounds and the environment (`PlayWiring`), the vehicles round the
## start parked before play.
func _add_play() -> String:
	if play_wiring != null:
		return ""
	var content := GameContent.load_file()
	if content.error != "":
		push_warning("[boot] content: %s (only the extra parking spots)" % content.error)
	play_wiring = PlayWiring.make(world, rig, content)
	world.add_child(play_wiring)
	var error := await play_wiring.prepare(world.spawn["point"])
	if error == "":
		_add_carjacking()
	return error


## TAKE OVER on the ACTION button: a traffic car, auto or bike beside the player on foot.
func _add_carjacking() -> void:
	if carjacking != null or life == null:
		return
	carjacking = Carjacking.make(life, play_wiring.driving)
	world.add_child(carjacking)
	rig.controls.action_context.add_source(carjacking.offer)


## The pause menu's real settings: time of day, weather, sound (G-115).
func _add_pause_menu() -> void:
	pause_menu = PauseMenu.new()
	add_child(pause_menu)
	# The same three settings on the pause menu and on the title's SETTINGS page (G-162).
	var time_label := func() -> String: return "Time: %s (%s)" % [GameLoop.clock.label(), GameLoop.clock.text()]
	var time_next := func() -> void: GameLoop.clock.next()
	for host: Object in [pause_menu, title]:
		host.call(&"add_setting", &"Time", time_label, time_next)
		host.call(&"add_setting", &"Weather", Weather.label, Weather.toggle)
		host.call(&"add_setting", &"Sound", Sound.label, Sound.toggle)
	ControlSettingsRows.add_to(pause_menu, ControlSettings.shared())
	pause_menu.add_setting(&"PerfOverlay", DebugSettings.label, DebugSettings.toggle)
	pause_menu.pause_requested.connect(pause)
	pause_menu.resume_requested.connect(resume)
	pause_menu.title_requested.connect(show_title)


## The streets' traffic, walkers and crowds round the start, made during loading.
func _add_life() -> String:
	if life != null:
		return ""
	life = CityLife.make(world, rig.body)
	world.add_child(life)
	return await life.prepare(world.spawn["point"])


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
	if get_tree() != null:
		get_tree().paused = false


## What the title's rows say, from the live mission session and the save file (G-161): CONTINUE
## exists only when a save does, and shows the real stage, money and stages done.
func title_summary() -> Dictionary:
	var out := {"has_save": false}
	var layer := find_child("MissionsLayer", false, false) as MissionsLayer
	if layer == null or layer.session == null:
		return out
	var session := layer.session
	if not session.content.missions.is_empty():
		out["new_game_line"] = "Begin in Chennai: Stage 1, %s" % session.content.missions[0].title
	if SaveStore.new(session.store.path).read().progress().is_empty():
		return out
	var m := session.runner.mission()
	var where := "Stage %d" % m.stage if m != null else "Free roam"
	out["has_save"] = true
	out["continue_line"] = "%s · ₹%s · %d of %d stages" % [where, MissionSession.rupees(session.runner.balance()), session.runner.stages_done(), session.runner.stage_count()]
	return out


func show_title() -> void:
	_unpause()
	hud.visible = false
	_set_controls(false)
	title.set_save(title_summary())
	title.visible = true
	title.show_menu()
	title.enter()
	if title_wiring != null:
		title_wiring.activate()
	Sound.suspend()
	_set_state(&"title")


func play() -> void:
	_unpause()
	title.visible = false
	if title_wiring != null and title_wiring.release():
		_wait_for_ground()
	hud.visible = true
	Sound.active = true
	_set_controls(true)
	_set_state(&"play")


## After the title toured a faraway spot: the loading screen, one honest step, until the streets
## round the player are in (game time; `TitleWiring.released`).
func _wait_for_ground() -> void:
	loading.set_steps(PackedStringArray([STEPS[2]]))
	loading.begin_step(0)
	loading.visible = true
	await title_wiring.released
	loading.finish_step(0)
	loading.visible = false


## Pauses play: game time, physics and the world stop (the tree pauses), sound goes quiet.
func pause() -> void:
	if state != &"play":
		return
	get_tree().paused = true
	_set_controls(false)
	Sound.suspend()
	pause_menu.open()
	_set_state(&"paused")


func resume() -> void:
	if state != &"paused":
		return
	_unpause()
	Sound.active = true
	_set_controls(true)
	_set_state(&"play")


func _unpause() -> void:
	pause_menu.close()
	get_tree().paused = false


func _set_controls(on: bool) -> void:
	if play_wiring != null:
		play_wiring.set_active(on)
	elif rig != null:
		rig.controls.visible = on
		rig.reads_devices = on
	pause_menu.show_pause_button(on)


func quit() -> void:
	print("[boot] quit")
	get_tree().quit()


## Android Back and Escape: one level up (chennai-game-design §3): play → pause menu → title,
## ABOUT → menu, then quit.
func go_back() -> void:
	match state:
		&"play":
			pause()
		&"paused":
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
	# The gamepad's Start pauses and resumes (G-178).
	if InputMap.has_action(&"pad_pause") and event.is_action_pressed(&"pad_pause"):
		get_viewport().set_input_as_handled()
		if state == &"play":
			pause()
		elif state == &"paused":
			resume()
		return
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
