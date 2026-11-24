class_name EnvironmentWiring
extends Node
## Composition glue that puts the day, night and weather (`CityEnvironment`, game_engine) into the
## streamed city (`CityWorld`, game_world) without either knowing the other (decision G-114):
## - replaces the city scene's stand-in `Environment` and `Sun` with one `CityEnvironment`;
## - follows its look into the city's materials: `set_night` (windows and shops glow) and
##   `set_wet` (the road and walls darken and shine in the rain);
## - gives `StreetLights` the lamp heads of the city's own poles in the shown chunks round the
##   focus (`ChunkBuilder.Build.furniture.poles`), refreshed when chunks come and go and after a
##   floating-origin shift (lamp points are scene positions).
## The clock is `GameLoop.clock` (it starts at golden hour, 17:45) and the rain is `Weather`.

## Lamps further than this from the focus are left out (the real lights only go to the nearest six).
const LAMP_REACH := 160.0
## Default head height (lamps carry their own, `RoadLamps`).
const LAMP_HEIGHT := 8.9
## Real seconds between lamp refreshes while the focus moves.
const LAMP_EVERY := 1.0

var world: CityWorld
var environment: CityEnvironment
var _night: float = -1.0
var _wet: float = -1.0
## Shown chunk → its lamp points (world metres).
var _lamps: Dictionary[Vector2i, PackedVector3Array] = {}
## The same chunks' lamp tints (G-316).
var _tints: Dictionary[Vector2i, PackedColorArray] = {}
var _lamps_dirty: bool = true
var _lamp_clock: float = 0.0
var _lamp_focus: Vector2 = Vector2(INF, INF)


static func wire(city: CityWorld) -> EnvironmentWiring:
	var w := EnvironmentWiring.new()
	w.name = "EnvironmentWiring"
	w.world = city
	for stand_in: String in ["Environment", "Sun"]:
		var n := city.get_node_or_null(stand_in)
		if n != null:
			city.remove_child(n)
			n.queue_free()
	w.environment = CityEnvironment.new(false)
	w.environment.street_lights.head_height = LAMP_HEIGHT
	city.add_child(w.environment)
	city.streamer.chunk_shown.connect(w._on_chunk_shown)
	city.streamer.chunk_hidden.connect(w._on_chunk_hidden)
	WorldOrigin.shifted.connect(w._on_shifted)
	for cell in city.streamer.shown_cells():
		w._on_chunk_shown(cell)
	return w


func _process(dt: float) -> void:
	var look := environment.look
	if absf(look.night - _night) > 0.005:
		_night = look.night
		world.materials.set_night(_night)
	var wet := Weather.rain_level()
	if absf(wet - _wet) > 0.005:
		_wet = wet
		world.materials.set_wet(_wet)
	_lamp_clock -= dt
	var focus := world.streamer.focus
	if _lamps_dirty or (_lamp_clock <= 0.0 and focus.distance_to(_lamp_focus) > 20.0):
		_refresh_lamps(focus)


func _on_chunk_shown(cell: Vector2i) -> void:
	var b := world.streamer.build_of(cell)
	if b == null or b.furniture == null:
		return
	_lamps[cell] = b.lamp_points
	_tints[cell] = b.lamp_tints
	_lamps_dirty = true


func _on_chunk_hidden(cell: Vector2i) -> void:
	_tints.erase(cell)
	if _lamps.erase(cell):
		_lamps_dirty = true


func _on_shifted(_offset: Vector3) -> void:
	_lamps_dirty = true


func _refresh_lamps(focus: Vector2) -> void:
	_lamps_dirty = false
	_lamp_clock = LAMP_EVERY
	_lamp_focus = focus
	var out := PackedVector3Array()
	var tints := PackedColorArray()
	var reach2 := LAMP_REACH * LAMP_REACH
	for cell: Vector2i in _lamps:
		var points: PackedVector3Array = _lamps[cell]
		var colours: PackedColorArray = _tints[cell]
		for i in points.size():
			var flat := Vector2(points[i].x, points[i].z)
			if flat.distance_squared_to(focus) <= reach2:
				# The lamp point is the ground under the head; its y is the head's height.
				out.append(WorldOrigin.to_scene(flat, points[i].y))
				tints.append(colours[i])
	environment.street_lights.set_lamps(out, tints)


## Lamps given to the street lights now (tests).
func lamp_count() -> int:
	return environment.street_lights.lamps.size()


func _exit_tree() -> void:
	if WorldOrigin.shifted.is_connected(_on_shifted):
		WorldOrigin.shifted.disconnect(_on_shifted)
