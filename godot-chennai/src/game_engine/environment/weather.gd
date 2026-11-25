class_name WeatherService
extends Node
## Autoload `Weather`: clear or raining (decision G-87). The rain fades in and out over a couple
## of game seconds (advanced by GameLoop's fixed step, so it follows game time), and the choice is
## remembered across launches in the save file (`SaveStore`, key "cow-weather-v1", G-43). Everything wet follows `rain_level()`: the rain streaks and the
## grey sky (`CityEnvironment`), the wet-road look (the global shader parameter `city_wetness`),
## rain on the roofs and wet footsteps (`Sound`).
##
## The time of day is `GameLoop.clock` (GameClock): `hour`, `label()`, `next()`, `text()`; missions
## read the same clock. This service adds only the weather.

signal changed(raining: bool)

## Game seconds for rain to start or stop.
const FADE := 2.5
const WETNESS_PARAM := &"city_wetness"
const NIGHT_PARAM := &"city_night"

var raining: bool = false
var settings_path: String = SaveStore.DEFAULT_PATH
## The last value given to the `city_wetness` global shader parameter.
var published_wetness: float = 0.0
var _level: float = 0.0


func _ready() -> void:
	if str(SaveStore.new(settings_path).read().section(SaveStore.WEATHER, "clear")) == "rain":
		set_raining(true, true, false)
	var loop: Node = get_node_or_null(^"/root/GameLoop")
	if loop != null:
		loop.connect(&"ticked", advance)


## 0 dry … 1 raining (the fade, not the choice).
func rain_level() -> float:
	return _level


## Start or stop the rain; it fades over FADE game seconds unless `immediate`.
func set_raining(on: bool, immediate: bool = false, save: bool = true) -> void:
	raining = on
	if immediate:
		_level = 1.0 if on else 0.0
		_publish()
	if save:
		var store := SaveStore.new(settings_path).read()
		store.set_section(SaveStore.WEATHER, "rain" if on else "clear")
		store.write()
	changed.emit(on)


func toggle() -> void:
	set_raining(not raining)


## "Weather: Clear" / "Weather: Rain" for the pause menu.
func label() -> String:
	return Tr.t("set.weather", [&"weather.rain" if raining else &"weather.clear"])


func advance(dt: float) -> void:
	var target := 1.0 if raining else 0.0
	if _level == target:
		return
	_level = move_toward(_level, target, dt / FADE)
	_publish()


func _publish() -> void:
	published_wetness = _level
	RenderingServer.global_shader_parameter_set(WETNESS_PARAM, _level)
