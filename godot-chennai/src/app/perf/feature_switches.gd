class_name FeatureSwitches
extends Node
## Live feature switches for finding what costs the frames on a phone (decision G-254): each
## optional part of the game can be turned off and on while playing, applied at once, and the
## frame time is compared before and after the press. SAFE MODE turns every switch off (about
## the early build: streets, buildings and the player); the owner then turns them back on one by
## one and reads which one costs the frames. Choices are kept in `QualitySettings.switches`.
##
## Composition glue (app): it reaches into the systems `Main` built; every switch only hides,
## pauses or simplifies, it never frees, so turning it back on is instant.

## Real seconds before and after a press over which the frame time is averaged.
const SETTLE := 1.0
const MEASURE := 3.0

## id, label (order of the list). Chunk layers are the node names `ChunkBuilder` gives them.
const ALL: Array[Array] = [
	["traffic", "Traffic and walkers (AI + views)"],
	["crowds", "Crowds"],
	["parked", "Parked vehicles"],
	["missions", "Missions layer (HUD, markers)"],
	["landmarks", "Landmarks"],
	["decks", "Bridges and flyovers (decks)"],
	["objects", "Street objects (poles, gates, towers, props)"],
	["kit", "Shop fronts and signs (facade kit)"],
	["trees", "Trees and palms"],
	["far", "Far buildings"],
	["water", "Water"],
	["colliders", "Bump, barrier and prop colliders (bridges too)"],
	["ground_detail", "Ground cover shader detail"],
	["water_detail", "Water shader ripples"],
	["rain", "Rain layers"],
	["shadows", "Sun shadows"],
	["street_lights", "Street lights (night)"],
	["sky", "Sky shader (off: flat colour)"],
	["fog", "Haze"],
	["title_life", "Live city behind the title (next start)"],
]
## Chunk layer nodes per switch: direct children of a chunk's view or of its Near/Far.
const LAYERS: Dictionary[String, PackedStringArray] = {
	"decks": ["Decks"], "objects": ["Objects"], "kit": ["Kit"], "trees": ["Trees", "Palms"],
	"far": ["Far"], "water": ["Water"],
}
## Collider bodies per switch, by name prefix (`ChunkBuilder._body` labels).
const BODY_PREFIXES: PackedStringArray = ["Decks", "DetailSolids", "Platforms", "Solids"]

var main: Main
var settings: QualitySettings
## Frame time (ms) source: the wiring's running average.
var frame_ms: Callable = Callable()
## id → last measured change of the frame time (ms; positive: turning it ON made frames slower).
var costs: Dictionary[String, float] = {}
## The last press: [id, on, before_ms] while measuring; empty otherwise.
var _pending: Array = []
var _clock: float = 0.0
var _sum: float = 0.0
var _n: int = 0
var last_line: String = ""


static func make(m: Main, s: QualitySettings) -> FeatureSwitches:
	var f := FeatureSwitches.new()
	f.name = "FeatureSwitches"
	f.main = m
	f.settings = s
	f.process_mode = Node.PROCESS_MODE_ALWAYS
	return f


static func ids() -> PackedStringArray:
	var out := PackedStringArray()
	for row in ALL:
		out.append(String(row[0]))
	return out


func is_on(id: String) -> bool:
	return settings.is_on(id)


## Press: flip a switch, apply it, and start measuring its effect.
func toggle(id: String) -> void:
	var before := _recent_ms()
	settings.set_switch(id, not settings.is_on(id))
	apply(id)
	_start_measure(id, settings.is_on(id), before)


func safe_mode() -> void:
	var before := _recent_ms()
	settings.set_all_switches(ids(), false)
	apply_all()
	_start_measure("safe", false, before)


func all_on() -> void:
	var before := _recent_ms()
	settings.set_all_switches(ids(), true)
	apply_all()
	_start_measure("all", true, before)


func apply_all() -> void:
	for id in ids():
		apply(id)


## Applies one switch to whatever exists now (systems made later get it from `apply_all`).
func apply(id: String) -> void:
	var on := settings.is_on(id)
	var world := main.world
	match id:
		"traffic":
			if main.life != null:
				main.life.traffic_on = on
		"crowds":
			if main.life != null:
				main.life.crowds_on = on
				main.life.refresh_caps()
		"parked":
			_set_parked(on)
		"missions":
			var layer := main.find_child("MissionsLayer", false, false) as MissionsLayer
			if layer != null:
				layer.process_mode = Node.PROCESS_MODE_ALWAYS if on else Node.PROCESS_MODE_DISABLED
				var ui := layer.find_child("MissionUi", false, false) as CanvasLayer
				if ui != null:
					ui.visible = on
				if layer.beacon != null:
					layer.beacon.visible = on
		"landmarks":
			if world != null:
				var n := world.get_node_or_null(^"Landmarks") as Node3D
				if n != null:
					n.visible = on
		"colliders":
			if world != null and world.streamer != null:
				for root in world.streamer.get_children():
					_set_colliders(root, on)
		"ground_detail":
			if world != null and world.materials != null:
				world.materials.ground.set_shader_parameter(&"detail", on and bool(settings.current()["ground_detail"]))
		"water_detail":
			if world != null and world.materials != null:
				world.materials.water.set_shader_parameter(&"animated", on and bool(settings.current()["water_detail"]))
		"rain":
			RainView.enabled = on
		"shadows":
			var env := _environment()
			if env != null:
				QualityApplier.apply_sun(env.sun, settings.current(), on)
		"street_lights":
			var env := _environment()
			if env != null:
				env.street_lights.pool = int(settings.current()["street_lights"]) if on else 0
		"sky":
			var env := _environment()
			if env != null:
				env.environment.background_mode = Environment.BG_SKY if on else Environment.BG_COLOR
				env.environment.background_color = env.look.horizon
		"fog":
			var env := _environment()
			if env != null:
				env.environment.fog_enabled = on
		"title_life":
			pass  # read by Main at the next start (`PerfWiring.title_tour_allowed`)
		_:
			if LAYERS.has(id) and world != null and world.streamer != null:
				for cell in world.streamer.shown_cells():
					var b := world.streamer.build_of(cell)
					if b != null and b.view != null:
						_set_layers(b.view, LAYERS[id], on)


## A chunk joined the scene: give it the switched-off layers and colliders.
func on_chunk_shown(cell: Vector2i) -> void:
	var world := main.world
	var b := world.streamer.build_of(cell)
	if b == null or b.view == null:
		return
	for id: String in LAYERS:
		if not settings.is_on(id):
			_set_layers(b.view, LAYERS[id], false)
	if not settings.is_on("colliders"):
		for root in world.streamer.get_children():
			_set_colliders(root, false)


static func _set_layers(view: Node3D, names: PackedStringArray, on: bool) -> void:
	for holder: Node in [view, view.get_node_or_null(^"Near"), view.get_node_or_null(^"Far")]:
		if holder == null:
			continue
		for n in names:
			var node := holder.get_node_or_null(NodePath(n)) as Node3D
			if node != null:
				node.visible = on


static func _set_colliders(root: Node, on: bool) -> void:
	if not String(root.name).begins_with("Solids_"):
		return
	for body in root.get_children():
		var label := String(body.name)
		var hit := false
		for p in BODY_PREFIXES:
			# "Solids0" but not the walls ("Walls3").
			if label.begins_with(p) and label.trim_prefix(p).is_valid_int():
				hit = true
		if not hit:
			continue
		for shape in body.get_children():
			var cs := shape as CollisionShape3D
			if cs != null and cs.disabled == on:
				cs.set_deferred(&"disabled", not on)


func _set_parked(on: bool) -> void:
	var pw := main.play_wiring
	if pw == null or pw.parked == null:
		return
	pw.parked.process_mode = Node.PROCESS_MODE_INHERIT if on else Node.PROCESS_MODE_DISABLED
	for v: Vehicle in pw.parked.vehicles.values():
		if not is_instance_valid(v) or v.is_driven():
			continue
		v.visible = on
		v.process_mode = Node.PROCESS_MODE_INHERIT if on else Node.PROCESS_MODE_DISABLED


func _environment() -> CityEnvironment:
	var pw := main.play_wiring
	return pw.environment.environment if pw != null and pw.environment != null else null


func _recent_ms() -> float:
	return float(frame_ms.call()) if frame_ms.is_valid() else 0.0


func _start_measure(id: String, on: bool, before: float) -> void:
	_pending = [id, on, before]
	_clock = 0.0
	_sum = 0.0
	_n = 0
	last_line = "measuring %s…" % _label(id)


## Called once a frame by the wiring with the frame's time (ms), only while measuring.
func sample(dt_real: float, ms: float) -> void:
	if _pending.is_empty():
		return
	_clock += dt_real
	if _clock < SETTLE:
		return
	_sum += ms
	_n += 1
	if _clock < SETTLE + MEASURE:
		return
	var id := String(_pending[0])
	var on := bool(_pending[1])
	var before := float(_pending[2])
	var after := _sum / maxf(1.0, float(_n))
	# Cost of the feature: frame time with it on minus without it.
	var cost := (after - before) if on else (before - after)
	if id != "safe" and id != "all":
		costs[id] = cost
	last_line = "last toggle: %s %s changed the frame by %+.1f ms (%.1f → %.1f ms)" % [_label(id), "ON" if on else "OFF", after - before, before, after]
	_pending = []


func measuring() -> bool:
	return not _pending.is_empty()


## "Costs: traffic 6.2 ms, shadows 3.1 ms, …", largest first.
func ranked() -> String:
	var keys: Array[String] = []
	for k: String in costs:
		keys.append(k)
	keys.sort_custom(func(a: String, b: String) -> bool: return costs[a] > costs[b])
	var parts := PackedStringArray()
	for k in keys:
		parts.append("%s %+.1f" % [k, costs[k]])
	return ("costs (ms): " + ", ".join(parts)) if not parts.is_empty() else "costs: none measured yet (turn a switch off and on)"


func rows() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for row in ALL:
		var id := String(row[0])
		out.append({"id": id, "label": String(row[1]), "on": settings.is_on(id), "note": ("%+.1f ms" % costs[id]) if costs.has(id) else ""})
	return out


static func _label(id: String) -> String:
	for row in ALL:
		if String(row[0]) == id:
			return String(row[1])
	return {"safe": "Safe mode", "all": "All on"}.get(id, id)
