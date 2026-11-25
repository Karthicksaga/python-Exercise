class_name MapSettings
extends RefCounted
## The one map option the player can change (G-281): the minimap turns with the player (the way
## you face is up) or stays north-up. Saved on a change; `changed` tells the maps to redraw.

signal changed

const PATH := "user://map_settings.cfg"

static var _shared: MapSettings = null

var rotating := true
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


func label() -> String:
	return Tr.t("set.minimap", [&"set.minimap.turns" if rotating else &"set.minimap.north"])


func _load() -> void:
	var f := ConfigFile.new()
	if f.load(_path) == OK:
		rotating = bool(f.get_value("map", "rotating", true))


func _save() -> void:
	var f := ConfigFile.new()
	f.set_value("map", "rotating", rotating)
	f.save(_path)
