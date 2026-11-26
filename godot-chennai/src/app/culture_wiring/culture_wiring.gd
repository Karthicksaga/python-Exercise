class_name CultureWiring
extends Node
## Culture and life in the game (G-480…G-489), composition glue: the heritage journal, the temple
## visit with its props and calm, the peace zones, and swimming. No rules live here; they are in
## `src/culture/` (`HeritageJournal`, `TempleVisit`, `PeaceZones`, `SwimState`). Each physics step,
## after the player has moved, it reads where the player is (world metres) and:
## - writes new places into the journal (a toast, the save) and opens the journal's screen;
## - runs the temple visit: the ACTION button offers LEAVE SANDALS at the stand and LIGHT LAMP at
##   the lamp, the walk round counts, the bell sounds, the city's sound calms inside the zone;
## - keeps the peace zone's rules for the systems that ask `peace.allows(rule, point)` (vehicles stay
##   outside, no horn, no crash effects, no take-over, no wanted level, walking pace only);
## - offers SWIM at the water's edge and GET OUT in the water, and moves the swimmer inside the
##   water's safe limits.
## It never touches the AI's agents (G-364): it reads the player only.
##
## In the game: `CultureWiring.make(world, rig, driving)` then `world.add_child`. Tests give their own
## `save_path`, `data`, `sound` and `toast`.

signal toast_shown(title: String, detail: String)

## Journal stops are checked this often (seconds): they are few and far apart.
const STOP_EVERY := 0.25
## What the sound system calms to, per metre inside the peace zone (full calm 20 m in).
const CALM_RAMP := 20.0
## Swimming entry is looked up this often (seconds).
const ENTRY_EVERY := 0.2
const ROPE_HINT_EVERY := 8.0

var data: CultureData
var peace: PeaceZones
var journal: HeritageJournal
var visit: TempleVisit
var water: SwimWater
var swim: SwimState
var props: TempleProps
var screen: HeritageJournalScreen
var swim_hud: SwimHud
var world: CityWorld
var rig: PlayerRig
var driving: Driving
## (title, detail, seconds): the mission HUD's toast; the composition root sets it.
var toast: Callable = Callable()
var sound: SoundSystem = null
var save_path: String = SaveStore.DEFAULT_PATH
## Only works while true (play, not the title).
var active: bool = true
## What the last steps did, for tests.
var stats: Dictionary = {"visited": 0, "lamps": 0, "completed": 0, "swims": 0, "tired": 0}

var _stop_clock: float = 0.0
var _entry_clock: float = 0.0
var _entry: SwimWater.Sample = null
var _rope_hint: float = 0.0
var _vehicle_warned: bool = false
var _run_scale_saved: float = 1.0
var _run_capped: bool = false
var _ground_set: bool = false


## The wiring for the city: `culture_data` overrides what `culture.json` says (tests).
static func make(city: CityWorld, player: PlayerRig, drive: Driving, culture_data: CultureData = null, save_file: String = SaveStore.DEFAULT_PATH) -> CultureWiring:
	var w := CultureWiring.new()
	w.name = "CultureWiring"
	w.world = city
	w.rig = player
	w.driving = drive
	w.save_path = save_file
	w.data = culture_data if culture_data != null else CultureData.load_file()
	w._build()
	return w


func _build() -> void:
	if data.error != "":
		push_error("culture: %s" % data.error)
	peace = PeaceZones.from_data(data)
	journal = HeritageJournal.load_from(SaveStore.new(save_path).read())
	journal.visited.connect(_on_visited)
	journal.completed.connect(_on_completed)
	var zone := data.zone(data.temple.zone) if data.temple != null else null
	if zone != null:
		visit = TempleVisit.make(data.temple, zone)
		visit.event.connect(_on_visit)
		var gate := zone.centre
		props = TempleProps.make(data.temple.stand, data.temple.lamp, gate)
		add_child(props)
	water = SwimWater.make(data.swim, world.source.get_sea() if world != null and world.source != null else null, _waterways_near)
	swim = SwimState.make(data.swim, water)
	swim.got_tired.connect(_on_tired)
	screen = HeritageJournalScreen.new()
	add_child(screen)
	swim_hud = SwimHud.new()
	add_child(swim_hud)
	# After the player and `Driving` in each step, and after PlayerSounds (10).
	process_physics_priority = 15


func _ready() -> void:
	if sound == null:
		sound = get_node_or_null(^"/root/Sound") as SoundSystem
	if driving != null:
		driving.peace = peace
	if rig != null and rig.controls != null:
		rig.controls.action_context.add_source(_offer)
	if rig != null:
		rig.body.swim_mover = _swim_mover


## Gives the peace zones to the systems that keep their rules (`DrivingWiring`, `Carjacking`,
## `StreetReactions`: each has a `peace` property).
func share_peace(consumers: Array[Object]) -> void:
	for c in consumers:
		if c != null:
			c.set(&"peace", peace)


# --- reading the player -------------------------------------------------------------------

func _here() -> Vector2:
	return WorldOrigin.to_world(rig.body.global_position)


func _on_foot() -> bool:
	return rig.body.is_on_foot() and not rig.body.swimming and (driving == null or driving.mode() == &"foot")


func _physics_process(dt: float) -> void:
	if not active or rig == null or rig.body == null:
		return
	var here := _here()
	var foot := _on_foot()
	_stop_clock += dt
	if _stop_clock >= STOP_EVERY:
		_stop_clock = 0.0
		_check_stops(here, foot)
	if visit != null:
		visit.update(here, foot)
	_peace_effects(here, foot)
	_ground_for_props(here)
	_swim_step(here, foot, dt)


## A stop's radius holds the player: the journal writes it (once; every visit is counted).
func _check_stops(here: Vector2, foot: bool) -> void:
	for s in data.stops:
		if here.distance_to(s.position) > s.radius:
			continue
		if s.on_foot and not foot:
			continue
		if not journal.has_visited(s.id):
			journal.visit(s.id)


func _on_visited(id: String) -> void:
	stats["visited"] = int(stats["visited"]) + 1
	var s := data.stop(id)
	if s != null:
		_toast(Tr.t("cul.toast.added"), Tr.t(s.name_key()), 4.0)
	journal.save(save_path)


func _on_completed(_id: String) -> void:
	stats["completed"] = int(stats["completed"]) + 1
	journal.save(save_path)


func _toast(title: String, detail: String = "", seconds: float = 3.6) -> void:
	toast_shown.emit(title, detail)
	if toast.is_valid():
		toast.call(title, detail, seconds)


# --- the peace zone -----------------------------------------------------------------------

func _peace_effects(here: Vector2, foot: bool) -> void:
	var zone := peace.zone_at(here)
	# Walking pace only (the run rule).
	var cap := foot and zone != null and not peace.allows("run", here)
	if cap and not _run_capped:
		_run_scale_saved = rig.body.run_scale
		rig.body.run_scale = PlayerController.WALK_SPEED / PlayerController.RUN_SPEED
		_run_capped = true
	elif not cap and _run_capped:
		rig.body.run_scale = _run_scale_saved
		_run_capped = false
	# A vehicle driven into the forecourt: a quiet word, once.
	var in_vehicle := driving != null and driving.mode() == &"driving"
	if in_vehicle and zone != null and here.distance_to(zone.centre) <= zone.walk_radius:
		if not _vehicle_warned:
			_vehicle_warned = true
			_toast(Tr.t("cul.temple.vehicle_outside"), "", 3.0)
	elif zone == null:
		_vehicle_warned = false
	if sound != null:
		sound.set_calm(clampf(peace.depth(here) / CALM_RAMP, 0.0, 1.0))
		_set_step_gain(visit != null and visit.shoes_off)


func _on_visit(what: StringName, number: int) -> void:
	match what:
		&"entered":
			if not visit.shoes_off:
				_toast(Tr.t("cul.temple.welcome"), Tr.t("cul.temple.welcome_detail"), 4.5)
		&"shoes_off":
			_set_step_gain(true)
			props.show_player_pair(true)
			_toast(Tr.t("cul.temple.shoes_off"), "", 2.5)
		&"shoes_on":
			_set_step_gain(false)
			props.show_player_pair(false)
			_toast(Tr.t("cul.temple.shoes_on"), "", 2.5)
		&"lamp":
			props.set_lit(true)
			stats["lamps"] = int(stats["lamps"]) + 1
			if sound != null:
				sound.bell()
			_toast(Tr.t("cul.temple.lamp"), Tr.t("cul.temple.lamp_detail"), 5.0)
		&"quarter":
			if sound != null:
				sound.bell(0.35)
			if number == 2:
				_toast(Tr.t("cul.temple.half"), "", 2.0)
		&"complete":
			var stop_id := _temple_stop_id()
			if sound != null:
				sound.bell(0.9)
			# A quiet visit rests the swimmer too.
			swim.stamina = 1.0
			_toast(Tr.t("cul.temple.complete"), Tr.t("cul.temple.complete_detail"), 5.5)
			journal.complete(stop_id)


func _set_step_gain(barefoot: bool) -> void:
	if sound != null:
		sound.step_gain = data.temple.barefoot_step_gain if barefoot else 1.0


func _temple_stop_id() -> String:
	for s in data.stops:
		if s.activity == &"temple_visit":
			return s.id
	return ""


## The props stand on the ground: once the player is near and the chunk's collider is in, a ray finds it.
func _ground_for_props(here: Vector2) -> void:
	if props == null or _ground_set or here.distance_to(data.temple.stand) > 120.0:
		return
	var at := WorldOrigin.to_scene(data.temple.stand, 0.0)
	var q := PhysicsRayQueryParameters3D.create(at + Vector3(0, 6.0, 0), at + Vector3(0, -6.0, 0))
	q.collision_mask = PlayerController.LAYER_WORLD
	var hit := rig.body.get_world_3d().direct_space_state.intersect_ray(q)
	if not hit.is_empty():
		_ground_set = true
		props.set_ground((hit["position"] as Vector3).y)


# --- the ACTION button --------------------------------------------------------------------

func _offer() -> Variant:
	if not active or rig == null or rig.body == null:
		return null
	if rig.body.swimming:
		return ActionCandidate.make(Tr.t("cul.act.get_out"), ActionContext.P_TALK, 0.0, get_out)
	if not _on_foot():
		return null
	var here := _here()
	var out: Array[ActionCandidate] = []
	if visit != null:
		if visit.near_stand(here) and not visit.shoes_off:
			out.append(ActionCandidate.make(Tr.t("cul.act.leave_shoes"), ActionContext.P_TALK, here.distance_to(data.temple.stand), func() -> void: visit.leave_shoes(_here())))
		if visit.near_lamp(here) and visit.shoes_off and not visit.lamp_lit:
			out.append(ActionCandidate.make(Tr.t("cul.act.light_lamp"), ActionContext.P_TALK, here.distance_to(data.temple.lamp), func() -> void: visit.light_lamp(_here())))
	if _entry != null and peace.allows("swim", here):
		out.append(ActionCandidate.make(Tr.t("cul.act.swim"), ActionContext.P_ENTER, -_entry.depth, start_swim))
	return out


# --- swimming -----------------------------------------------------------------------------

## The waterways near a world point, from the city's layouts (the ones the map draws).
func _waterways_near(point: Vector2, radius: float) -> Array[WorldWaterway]:
	var out: Array[WorldWaterway] = []
	if world == null or world.layouts == null or world.source == null:
		return out
	var cell := world.source.cell_at(point)
	var reach := ceili(radius / world.source.get_chunk_size())
	var seen: Dictionary[int, bool] = {}
	var regional := world.source as RegionalWorldSource
	for dx in range(-reach, reach + 1):
		for dz in range(-reach, reach + 1):
			var c := cell + Vector2i(dx, dz)
			# Never wait for a tile's layout on the main thread: a tile that is not built has no water yet.
			if regional != null and not world.layouts.has_tile(regional.tile_of(c)):
				continue
			var layout := world.layouts.layout_for(c)
			if layout == null:
				continue
			for w in layout.water_in(c):
				if not seen.has(w.id):
					seen[w.id] = true
					out.append(w)
	return out


func _swim_step(here: Vector2, foot: bool, dt: float) -> void:
	var body := rig.body
	if body.swimming:
		swim_hud.show_energy(true, swim.stamina)
		_entry = null
		return
	swim_hud.show_energy(false)
	swim.rest(dt)
	_entry_clock += dt
	if _entry_clock >= ENTRY_EVERY:
		_entry_clock = 0.0
		_entry = swim.entry(here) if foot else null


## SWIM on the ACTION button: into the water at the shore.
func start_swim() -> void:
	var body := rig.body
	var here := _here()
	if body.swimming or not peace.allows("swim", here):
		return
	var start := swim.begin(here)
	if is_inf(start.x):
		_toast(Tr.t("cul.swim.not_here"), "", 2.5)
		return
	stats["swims"] = int(stats["swims"]) + 1
	body.begin_swim(WorldOrigin.to_scene(start, swim.here.surface if swim.here != null else 0.0))
	_toast(Tr.t("cul.swim.hint"), "", 3.5)


## GET OUT on the ACTION button: to the nearest shore.
func get_out() -> void:
	if not rig.body.swimming:
		return
	_land(swim.leave(WorldOrigin.to_world(rig.body.global_position)))


## The swimmer's step (`PlayerController.swim_mover`): where the water's limits let it go.
func _swim_mover(from: Vector3, want: Vector2, dt: float) -> Variant:
	var w := WorldOrigin.to_world(from)
	var to := swim.move(w, want, dt)
	if not swim.swimming:
		_land(to)
		return from
	if want.length() > 0.1 and swim.at_rope(to):
		_rope_hint -= dt
		if _rope_hint <= 0.0:
			_rope_hint = ROPE_HINT_EVERY
			_toast(Tr.t("cul.swim.rope"), "", 2.5)
	elif swim.here != null and swim.here.kind != &"sea" and want.length() > 0.1 and swim.here.depth < swim.rules.bank_margin + 0.1:
		_rope_hint -= dt
		if _rope_hint <= 0.0:
			_rope_hint = ROPE_HINT_EVERY
			_toast(Tr.t("cul.swim.bank"), "", 2.5)
	return WorldOrigin.to_scene(to, swim.here.surface if swim.here != null else from.y)


## Out of the water at a world point, on the ground there.
func _land(at: Vector2) -> void:
	var scene := WorldOrigin.to_scene(at, 0.0)
	var q := PhysicsRayQueryParameters3D.create(scene + Vector3(0, 4.0, 0), scene + Vector3(0, -4.0, 0))
	q.collision_mask = PlayerController.LAYER_WORLD
	var hit := rig.body.get_world_3d().direct_space_state.intersect_ray(q)
	var y := 0.05
	if not hit.is_empty():
		y = (hit["position"] as Vector3).y + 0.05
	rig.body.end_swim(Vector3(scene.x, y, scene.z), rig.body.yaw)
	swim_hud.show_energy(false)


func _on_tired() -> void:
	stats["tired"] = int(stats["tired"]) + 1
	_toast(Tr.t("cul.swim.tired"), "", 4.0)


## The hook for blows, weapons and fights (the phase 5 combat runtime asks before it starts one):
## false and a quiet word where the peace zone forbids violence.
func allow_violence(point: Vector2) -> bool:
	if peace.allows("violence", point):
		return true
	_toast(Tr.t("cul.peace.no_violence"), "", 2.5)
	return false


# --- the screen and NEW GAME --------------------------------------------------------------

func open_journal() -> void:
	screen.open(data, journal)


func close_journal() -> bool:
	if screen.is_open():
		screen.close()
		return true
	return false


## NEW GAME: the journal starts empty, the visit starts over (the lamp is put out).
func new_game() -> void:
	journal.clear()
	if visit != null:
		visit.reset()
		props.set_lit(false)
		props.show_player_pair(false)
	swim.stamina = 1.0
	journal.save(save_path)
