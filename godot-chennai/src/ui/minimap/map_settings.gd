class_name MapSettings
extends RefCounted
## The map options the player can change (G-281): the minimap turns with the player (the way you
## face is up) or stays north-up; and (G-465) whether the railway and Metro lines are drawn on
## both maps (the full map's legend toggles it). Saved on a change; `changed` tells the maps to
## redraw.

signal changed

const PATH := "user://map_settings.cfg"

static var _shared: MapSettings = null

var rotating := true
var rail_shown := true
var _path: String


func _init(path: String = PATH) -> void:
	_path = path
	_load()


static func shared() -> MapSettings:
	if _shared == null:
		_shared = MapSettings.new()
	return _shared


func set_rotating(on: bool) -> void:
	if on == rotating:
		return
	rotating = on
	_save()
	changed.emit()


func set_rail_shown(on: bool) -> void:
	if on == rail_shown:
		return
	rail_shown = on
	_save()
	changed.emit()


func label() -> String:
	return "Minimap: %s" % ("turns with you" if rotating else "north up")


func _load() -> void:
	var f := ConfigFile.new()
	if f.load(_path) == OK:
		rotating = bool(f.get_value("map", "rotating", true))
		rail_shown = bool(f.get_value("map", "rail", true))


func _save() -> void:
	var f := ConfigFile.new()
	f.set_value("map", "rotating", rotating)
	f.set_value("map", "rail", rail_shown)
	f.save(_path)
