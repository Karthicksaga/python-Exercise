class_name HomesLayer
extends Node
## Homes in the city (composition glue, G-233…G-237): the homes for sale on their real streets,
## BUY and ENTER on the ACTION button, the door, the interior and the furnish editor. No rules
## here: they are in `src/homes/` (prices, placement, state, save) and `HomeRules`.
##
## In the game: `add_child(HomesLayer.for_main(self))` once the player is in the city, after the
## `MissionsLayer` (it pays with the missions' money and saves in the same file). Tests call
## `setup(world, rig, session)` on their own ground.
##
## Going in: ENTER opens the door leaf, the player walks to it (their own model and clips), the
## screen fades, the world is suspended (its nodes stop, physics stops, nothing is drawn: no
## traffic, no AI, no streaming), the interior scene is made and the person walks in. Going out
## is the same backwards; the interior is freed. While inside the game's clock keeps running and
## the sound is the quiet interior bed. Inside is a peace zone (`HomeRules`).

const INTERIOR := preload("res://src/app/homes_layer/home_interior.tscn")
## Boards are made and shown within this distance of the player, hidden beyond FAR.
const NEAR := 190.0
const FAR := 240.0
const WALK_TIMEOUT := 3.5
const FADE := 0.35

signal entered(home_id: String)
signal left(home_id: String)

var data: HomeData
var state: HomeState = HomeState.new()
var sites: Dictionary[String, HomeSite] = {}
var views: Dictionary[String, HomeSiteView] = {}
var world: CityWorld = null
var rig: PlayerRig = null
var session: MissionSession = null
var driving: Driving = null
var interior: HomeInterior = null
var hud: HomeHud = null
var editor: HomeEditor = null
## &"street", &"entering", &"inside", &"leaving".
var phase: StringName = &"street"
## Only offers BUY and ENTER while true (play, not the title or a menu).
var active: bool = true
## The police stars now (the combat runtime sets this; 0 until a wanted level is wired).
var wanted_stars: Callable = Callable()
var ready_to_use: bool = false
var editing: bool = false
var selected: PlacedProp = null

var _main: Node = null
var _source: Callable
var _site: HomeSite = null
var _timer: float = 0.0
var _since_view: float = 99.0
var _fade: ColorRect
var _fade_layer: CanvasLayer
var _world_mode: Node.ProcessMode = Node.PROCESS_MODE_PAUSABLE
var _busy: bool = false


func _init() -> void:
	name = "HomesLayer"
	process_mode = Node.PROCESS_MODE_ALWAYS
	# After the player and driving in each step.
	process_physics_priority = 12


static func for_main(main: Node) -> HomesLayer:
	var layer := HomesLayer.new()
	layer._main = main
	return layer


func _ready() -> void:
	_fade_layer = CanvasLayer.new()
	_fade_layer.layer = 20
	_fade_layer.name = "Fade"
	_fade = ColorRect.new()
	_fade.color = Color.BLACK
	_fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.modulate.a = 0.0
	_fade_layer.add_child(_fade)
	add_child(_fade_layer)
	if _main != null:
		_attach_main()


func _attach_main() -> void:
	var w: Variant = _main.get(&"world")
	var r: Variant = _main.get(&"rig")
	var missions := _main.find_child("MissionsLayer", false, false) as MissionsLayer
	setup(w as CityWorld, r as PlayerRig, missions.session if missions != null else null)
	if _main.has_signal(&"state_changed"):
		_main.connect(&"state_changed", func(s: StringName) -> void: active = (s == &"play"))
	var t: Variant = _main.get(&"title")
	if t is TitleMenu:
		(t as TitleMenu).new_game_requested.connect(new_game)
	active = str(_main.get(&"state")) == "play"


## Wires the layer to the city, the player and the missions' session (money and save file), and
## starts reading the data and finding the buildings on a worker thread.
func setup(city: CityWorld, player: PlayerRig, sess: MissionSession) -> void:
	world = city
	rig = player
	session = sess
	_source = rig.controls.action_context.add_source(_street_source)
	_prepare.call_deferred()


func _prepare() -> void:
	var source := world.source
	var layouts := world.layouts
	var loaded: Dictionary = await BackgroundTask.start(func() -> Dictionary:
		var d := HomeData.load_all()
		var found: Array[HomeSite] = []
		if d.error() == "":
			for l in d.listings.listings:
				var s := HomeSite.resolve(l, source, layouts)
				if s != null:
					found.append(s)
		return {"data": d, "sites": found}).finish(get_tree())
	data = loaded["data"]
	if data.error() != "":
		push_error("homes: %s" % data.error())
		return
	for s: HomeSite in loaded["sites"]:
		sites[s.id()] = s
	for l in data.listings.listings:
		if not sites.has(l.id):
			push_warning("homes: %s (OSM %d) is not in the world data; skipped" % [l.id, l.osm])
	state = HomeState.from_save(session.store.section(HomeState.SAVE_KEY) if session != null else null, data)
	ready_to_use = true


## NEW GAME forgets the homes too.
func new_game() -> void:
	state.reset()
	for id in views:
		var s := sites[id]
		views[id].show_state(false, data.prices.home(s.listing.type_id), data.homes.type_of(s.listing.type_id))


# --- on the street ----------------------------------------------------------------------------

func _physics_process(dt: float) -> void:
	if not ready_to_use or world == null or rig == null:
		return
	match phase:
		&"street":
			_since_view += dt
			if active and _since_view >= 0.4:
				_since_view = 0.0
				_update_views()
		&"entering":
			_step_entering(dt)


func player_world() -> Vector2:
	return WorldOrigin.to_world(rig.body.global_position)


func _update_views() -> void:
	var at := player_world()
	for id in sites:
		var s := sites[id]
		var d := at.distance_to(s.stand)
		var view: HomeSiteView = views.get(id)
		if d <= NEAR and view == null and world.world_ready_around(s.stand, 40.0):
			view = HomeSiteView.make(s)
			world.add_child(view)
			views[id] = view
			_show_state(s)
		elif view != null:
			var want := d <= FAR
			if view.visible != want:
				view.visible = want
				view.set_process(want)


func _show_state(s: HomeSite) -> void:
	var view: HomeSiteView = views.get(s.id())
	if view == null:
		return
	var type := data.homes.type_of(s.listing.type_id)
	view.show_state(state.owns(s.id()), data.prices.home(type.id), type)


## The site whose standing spot the player is at, or null.
func site_near() -> HomeSite:
	if not ready_to_use or rig == null:
		return null
	var at := player_world()
	var best: HomeSite = null
	var best_d := INF
	for id in sites:
		var s := sites[id]
		var d := at.distance_to(s.stand)
		if d <= HomeSite.REACH and d < best_d:
			best = s
			best_d = d
	return best


## ActionContext source on the walking controls: BUY (with the price), then ENTER once it is yours.
func _street_source() -> Variant:
	if not active or phase != &"street" or _busy or session == null:
		return null
	if driving == null:
		_find_driving()
	if driving != null and driving.mode() != &"foot":
		return null
	var s := site_near()
	if s == null:
		return null
	var d := player_world().distance_to(s.stand)
	if state.owns(s.id()):
		return ActionCandidate.make("ENTER", ActionContext.P_ENTER + 1, d, enter.bind(s))
	var price := data.prices.home(s.listing.type_id)
	var c := ActionCandidate.make("BUY · ₹%s" % MissionSession.rupees(price), ActionContext.P_ENTER + 1, d, buy.bind(s))
	c.enabled = session.runner.balance() >= price
	return c


func _find_driving() -> void:
	if _main != null:
		var pw: Variant = _main.get(&"play_wiring")
		if pw is PlayWiring:
			driving = (pw as PlayWiring).driving


func buy(s: HomeSite) -> HomeResult:
	var r := state.buy(s.listing, session.runner.balance(), data)
	if not r.ok:
		_notice(r.reason, r.reason_ta, "You have ₹%s." % MissionSession.rupees(session.runner.balance()))
		return r
	session.runner.charge(-r.delta)
	_show_state(s)
	save()
	var type := data.homes.type_of(s.listing.type_id)
	_notice("You bought the %s in %s · %s வாங்கினீர்கள்" % [type.en, s.listing.area_en, type.ta], "", "₹%s paid. Press ENTER." % MissionSession.rupees(-r.delta))
	Sound.cue("cash")
	return r


func _notice(title: String, title_ta: String, detail: String) -> void:
	if session != null:
		session.notice.emit(title if title_ta == "" else "%s · %s" % [title, title_ta], detail, 4.0)


## Writes the homes' section and the game's progress (the safe save point).
func save() -> void:
	if session == null:
		return
	session.store.set_section(HomeState.SAVE_KEY, state.to_save())
	session.save(GameLoop.clock.hour)


# --- going in -----------------------------------------------------------------------------------

func enter(s: HomeSite) -> void:
	if phase != &"street" or _busy:
		return
	var on_foot := driving == null or driving.mode() == &"foot"
	var stars: float = float(wanted_stars.call()) if wanted_stars.is_valid() else 0.0
	var problem := HomeRules.entry_problem(stars, on_foot)
	if problem != "":
		_notice(problem, HomeRules.entry_problem_ta(stars, on_foot), "")
		return
	_site = s
	phase = &"entering"
	_timer = 0.0
	rig.reads_devices = false
	rig.controls.release_all()
	var view: HomeSiteView = views.get(s.id())
	if view != null:
		view.open_door(true)


func _step_entering(dt: float) -> void:
	_timer += dt
	var at := player_world()
	var to := _site.door - at
	var yaw := atan2(-to.x, -to.y)
	rig.body.input = PlayerInput.make(Vector2(0.0, 0.5), yaw, false, false)
	rig.camera.yaw = lerp_angle(rig.camera.yaw, yaw, minf(1.0, 3.0 * dt))
	# The door's leaf needs a moment to swing before anyone walks through it.
	if _timer < 0.6:
		rig.body.input = PlayerInput.new()
		return
	if to.length() < 0.5 or _timer > WALK_TIMEOUT:
		phase = &"inside"
		rig.body.input = PlayerInput.new()
		_go_inside.call_deferred()


func _go_inside() -> void:
	_busy = true
	await _fade_to(1.0)
	state.current = _site.id()
	_suspend_world()
	editor = state.editor(_site.id(), data)
	var home := state.get_home(_site.id())
	interior = INTERIOR.instantiate() as HomeInterior
	add_child(interior)
	interior.hour = GameLoop.clock.hour
	interior.setup(data, home, editor)
	interior.attach_figure(rig.body.figure)
	interior.door_open = 1.0
	interior.door_want = 1.0
	interior.floor_tapped.connect(_on_floor_tapped)
	interior.camera.make_current()
	_make_hud()
	if _main != null and _main.has_method(&"set_home"):
		_main.call(&"set_home", true)
	Sound.suspend()
	Sound.active = true
	Sound.set_place(INF, 0.08, true)
	editing = false
	selected = null
	interior.walk_in()
	await _fade_to(0.0)
	_busy = false
	entered.emit(_site.id())


func _make_hud() -> void:
	hud = HomeHud.new()
	add_child(hud)
	hud.bind(data)
	var type := data.homes.type_of(state.get_home(_site.id()).type_id)
	hud.set_home(type.en, type.ta)
	hud.set_wallet(session.runner.balance() if session != null else 0)
	hud.set_clock(GameLoop.clock.text())
	hud.leave_pressed.connect(leave)
	hud.furnish_toggled.connect(set_editing)
	hud.prop_armed.connect(_on_armed)
	hud.rotate_pressed.connect(rotate_selected)
	hud.remove_pressed.connect(remove_selected)
	hud.clear_pressed.connect(clear_room)
	hud.extend_pressed.connect(extend_room)
	hud.wall_chosen.connect(set_wall)
	hud.kolam_pressed.connect(toggle_kolam)
	hud.context.add_source(_inside_source)
	_refresh_tools()


func _suspend_world() -> void:
	_world_mode = world.process_mode
	world.process_mode = Node.PROCESS_MODE_DISABLED
	world.visible = false
	PhysicsServer3D.set_active(false)


func _resume_world() -> void:
	PhysicsServer3D.set_active(true)
	world.process_mode = _world_mode
	world.visible = true


func in_home() -> bool:
	return interior != null


# --- inside -------------------------------------------------------------------------------------

## SLEEP and FURNISH always, LEAVE at the door (the interior's ActionContext).
func _inside_source() -> Variant:
	if phase != &"inside" or _busy or interior == null:
		return null
	var out: Array[ActionCandidate] = []
	var cot_near := _near_prop("cot")
	out.append(ActionCandidate.make("FURNISH", 12, 0.0, set_editing.bind(true)))
	out.append(ActionCandidate.make("SLEEP", 30 if cot_near else 11, 0.0, sleep))
	if interior.near_door():
		out.append(ActionCandidate.make("LEAVE", ActionContext.P_ENTER + 20, 0.0, leave))
	return out


func _near_prop(prop_id: String) -> bool:
	for it in state.get_home(_site.id()).items:
		if it.k == prop_id and Vector2(float(it.x) + 1.0, float(it.z) + 1.0).distance_to(interior.walker.position) <= 2.2:
			return true
	return false


func _process(_dt: float) -> void:
	if interior == null or hud == null:
		return
	hud.set_clock(GameLoop.clock.text())
	if not _busy and phase == &"inside" and Input.is_action_just_pressed(&"player_action"):
		hud.context.trigger()


func set_editing(on: bool) -> void:
	if interior == null or _busy:
		return
	editing = on
	selected = null
	interior.show_selection(null)
	interior.view_shift = 1.0 if on else 0.0
	hud.set_editing(on)
	hud.set_kolam(state.get_home(_site.id()).kolam)
	_refresh_tools()
	if on:
		hud.show_hint("Pick a piece, then tap the floor · ஒரு பொருளைத் தேர்ந்து தரையைத் தொடவும்")


func _on_armed(prop_id: String) -> void:
	selected = null
	interior.show_selection(null)
	_refresh_tools()
	if prop_id == "":
		hud.show_hint("Pick a piece, then tap the floor · ஒரு பொருளைத் தேர்ந்து தரையைத் தொடவும்")
		return
	var def := data.props.get_prop(prop_id)
	var how := "tap the floor" if def.kind == PropDef.FLOOR else ("tap the floor near a wall; it hangs on the nearest wall" if def.kind == PropDef.WALL else "tap the floor; it hangs from the ceiling above")
	hud.show_hint("%s · %s · ₹%d: %s" % [def.en, def.ta, data.prices.prop(prop_id), how])


func _on_floor_tapped(point: Vector2) -> void:
	if _busy or phase != &"inside":
		return
	var cell := editor.room.cell_at(point)
	if not editing:
		interior.walk_to(point)
		return
	if hud.armed != "":
		var r := editor.place(hud.armed, cell, session.runner.balance())
		if r.ok:
			_pay(r.delta)
			selected = r.item
			interior.rebuild_furniture()
			interior.show_selection(selected)
			save()
			Sound.cue("chime")
		else:
			hud.toast(r.reason, r.reason_ta)
		_refresh_tools()
		return
	var hit := editor.item_at(cell)
	selected = hit
	interior.show_selection(hit)
	_refresh_tools()
	if hit == null:
		interior.walk_to(point)


func _pay(delta: int) -> void:
	if session == null:
		return
	if delta < 0:
		session.runner.charge(-delta)
	elif delta > 0:
		session.runner.earn(delta)
	hud.set_wallet(session.runner.balance())


func _refresh_tools() -> void:
	if hud == null:
		return
	var def: PropDef = null if selected == null else data.props.get_prop(selected.k)
	hud.set_selection(selected != null, def != null and def.kind == PropDef.FLOOR)
	var cost := state.extension_cost(_site.id(), data)
	if cost < 0:
		hud.set_extension("FULL", "முழுமை", false)
	else:
		hud.set_extension("ROOM +₹%s" % MissionSession.rupees(cost), "அறை +", true)


func rotate_selected() -> void:
	if selected == null or editor == null:
		return
	var r := editor.rotate(selected)
	if r.ok:
		interior.rebuild_furniture()
		interior.show_selection(selected)
		save()
	else:
		hud.toast(r.reason, r.reason_ta)


func remove_selected() -> void:
	if selected == null or editor == null:
		return
	var r := editor.remove(selected)
	if r.ok:
		_pay(r.delta)
		selected = null
		interior.show_selection(null)
		interior.rebuild_furniture()
		save()
		hud.toast("Removed. You got ₹%d back." % r.delta, "அகற்றப்பட்டது. ₹%d திரும்பக் கிடைத்தது." % r.delta)
	_refresh_tools()


func clear_room() -> void:
	if editor == null or editor.items.is_empty():
		return
	var r := editor.clear()
	_pay(r.delta)
	selected = null
	interior.show_selection(null)
	interior.rebuild_furniture()
	save()
	hud.toast("Cleared. You got ₹%d back." % r.delta, "அனைத்தும் அகற்றப்பட்டது. ₹%d திரும்பக் கிடைத்தது." % r.delta)
	_refresh_tools()


func extend_room() -> void:
	var id := _site.id()
	var r := state.extend(id, session.runner.balance(), data)
	if not r.ok:
		hud.toast(r.reason, r.reason_ta)
		return
	_pay(r.delta)
	editor = state.editor(id, data)
	interior.editor = editor
	interior.rebuild()
	selected = null
	interior.show_selection(null)
	save()
	hud.toast("You built a new room for ₹%d." % -r.delta, "புதிய அறை கட்டப்பட்டது: ₹%d." % -r.delta)
	_refresh_tools()


func set_wall(colour: String) -> void:
	if state.set_wall(_site.id(), colour):
		interior.rebuild()
		save()


func toggle_kolam() -> void:
	var h := state.get_home(_site.id())
	state.set_kolam(_site.id(), not h.kolam)
	interior.rebuild()
	hud.set_kolam(h.kolam)
	save()


## SLEEP: the night passes until morning, health is restored and the game is saved (the life
## rules' own sleep, the same as the family home's).
func sleep() -> void:
	if _busy or phase != &"inside":
		return
	_busy = true
	await _fade_to(1.0, 0.6)
	session.store.set_section(HomeState.SAVE_KEY, state.to_save())
	var out := session.do_place("home", "sleep", GameLoop.clock.hour)
	GameLoop.clock.hour = GameLoop.clock.hour + float(out.get("hours", 0.0))
	save()
	interior.set_hour(GameLoop.clock.hour)
	await _fade_to(0.0, 0.6)
	hud.toast("You sleep until morning and wake rested. Game saved.", "காலை வரை நன்றாகத் தூங்கினீர்கள். விளையாட்டு சேமிக்கப்பட்டது.", 4.0)
	_busy = false


# --- going out ----------------------------------------------------------------------------------

## The way back: the back button closes the editor first, then leaves.
func back() -> void:
	if editing:
		set_editing(false)
	else:
		leave()


func leave() -> void:
	if phase != &"inside" or _busy or interior == null:
		return
	phase = &"leaving"
	_leave_async()


func _leave_async() -> void:
	_busy = true
	if editing:
		set_editing(false)
	interior.input_enabled = false
	interior.walk_out()
	var waited := 0.0
	while not interior.walker.arrived() and waited < 8.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	await _fade_to(1.0)
	save()
	var id := _site.id()
	var figure := interior.detach_figure()
	figure.reparent(rig.body, false)
	figure.position = Vector3.ZERO
	figure.rotation.y = 0.0
	interior.queue_free()
	interior = null
	hud.queue_free()
	hud = null
	_resume_world()
	rig.camera.camera.make_current()
	rig.place(WorldOrigin.to_scene(_site.stand, _site.ground_y + 0.05), _site.yaw_out)
	rig.reads_devices = true
	var view: HomeSiteView = views.get(id)
	if view != null:
		view.open_door(true)
	if _main != null and _main.has_method(&"set_home"):
		_main.call(&"set_home", false)
	Sound.suspend()
	Sound.active = true
	Sound.set_place(INF, 0.5, false)
	phase = &"street"
	_since_view = 99.0
	await _fade_to(0.0)
	_busy = false
	left.emit(id)
	# The door swings shut behind the player.
	await get_tree().create_timer(1.2).timeout
	if view != null and is_instance_valid(view) and phase == &"street":
		view.open_door(false)


func _fade_to(alpha: float, seconds: float = FADE) -> void:
	var tween := create_tween()
	tween.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tween.tween_property(_fade, "modulate:a", alpha, seconds)
	await tween.finished


func _exit_tree() -> void:
	# Never leave the physics server off if the layer goes while the player is inside.
	if interior != null:
		PhysicsServer3D.set_active(true)
