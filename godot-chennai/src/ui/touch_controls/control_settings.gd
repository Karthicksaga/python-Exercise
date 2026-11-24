class_name ControlSettings
extends RefCounted
## The player's control preferences (decision G-170): driving scheme, left-handed layout, look
## sensitivity, invert-Y, button size and opacity, haptics, run toggle. One shared instance
## (`shared()`) is read by the touch controls, the gamepad reader and the pause menu; every
## change emits `changed` and is saved in the save file's own section `chennai-controls-v1`
## (additive: `SaveStore` keeps unknown sections, and this one carries its own version).
##
## Pure data and persistence, no nodes.

signal changed

const SECTION := "chennai-controls-v1"
const VERSION := 1

## Driving schemes. Only the wheel exists so far; the others are named so the layout, the guide
## and the settings already carry the choice (the architecture is ready for TILT and BUTTONS).
const SCHEME_WHEEL := &"wheel"
const SCHEMES: Array[StringName] = [&"wheel"]

const SIZE_SMALL := 0
const SIZE_MEDIUM := 1
const SIZE_LARGE := 2
const SIZE_SCALE: Array[float] = [0.85, 1.0, 1.15]
const SIZE_NAMES: Array[String] = ["Small", "Medium", "Large"]

const SENSITIVITIES: Array[float] = [0.5, 0.75, 1.0, 1.5, 2.0]
const OPACITIES: Array[float] = [0.5, 0.7, 0.85, 1.0]

var scheme: StringName = SCHEME_WHEEL
var left_handed: bool = false
var look_sensitivity: float = 1.0
var invert_y: bool = false
var button_size: int = SIZE_MEDIUM
var opacity: float = 0.85
var haptics: bool = true
var run_toggle: bool = false
## Where it is saved; tests give their own.
var path: String = SaveStore.DEFAULT_PATH

static var _shared: ControlSettings = null


## The one instance the game uses, loaded from the save file on first use.
static func shared() -> ControlSettings:
	if _shared == null:
		_shared = ControlSettings.new()
		_shared.load_saved()
	return _shared


## Forgets the shared instance (tests).
static func reset_shared() -> void:
	_shared = null


func button_scale() -> float:
	return SIZE_SCALE[clampi(button_size, 0, SIZE_SCALE.size() - 1)]


func to_dict() -> Dictionary:
	return {
		"version": VERSION,
		"scheme": String(scheme),
		"leftHanded": left_handed,
		"lookSensitivity": look_sensitivity,
		"invertY": invert_y,
		"buttonSize": button_size,
		"opacity": opacity,
		"haptics": haptics,
		"runToggle": run_toggle,
	}


## Reads a saved dictionary; a missing or wrong-typed field keeps its default, and a newer
## version than this game knows is read field by field the same way.
func from_dict(d: Dictionary) -> void:
	var s := StringName(str(d.get("scheme", String(SCHEME_WHEEL))))
	scheme = s if SCHEMES.has(s) else SCHEME_WHEEL
	left_handed = _bool(d, "leftHanded", false)
	look_sensitivity = clampf(_num(d, "lookSensitivity", 1.0), 0.25, 3.0)
	invert_y = _bool(d, "invertY", false)
	button_size = clampi(int(_num(d, "buttonSize", float(SIZE_MEDIUM))), SIZE_SMALL, SIZE_LARGE)
	opacity = clampf(_num(d, "opacity", 0.85), 0.3, 1.0)
	haptics = _bool(d, "haptics", true)
	run_toggle = _bool(d, "runToggle", false)
	changed.emit()


static func _bool(d: Dictionary, key: String, fallback: bool) -> bool:
	var v: Variant = d.get(key, fallback)
	return v if v is bool else fallback


static func _num(d: Dictionary, key: String, fallback: float) -> float:
	var v: Variant = d.get(key, fallback)
	return float(v) if (v is float or v is int) else fallback


func load_saved() -> void:
	var v: Variant = SaveStore.new(path).read().section(SECTION)
	if v is Dictionary:
		from_dict(v as Dictionary)


func save() -> void:
	var store := SaveStore.new(path).read()
	store.set_section(SECTION, to_dict())
	store.write()


## Every setter below saves and emits `changed`, so the controls re-lay themselves out.
func set_left_handed(on: bool) -> void:
	left_handed = on
	_commit()


func set_look_sensitivity(v: float) -> void:
	look_sensitivity = v
	_commit()


func set_invert_y(on: bool) -> void:
	invert_y = on
	_commit()


func set_button_size(i: int) -> void:
	button_size = clampi(i, SIZE_SMALL, SIZE_LARGE)
	_commit()


func set_opacity(v: float) -> void:
	opacity = v
	_commit()


func set_haptics(on: bool) -> void:
	haptics = on
	_commit()


func set_run_toggle(on: bool) -> void:
	run_toggle = on
	_commit()


func set_scheme(s: StringName) -> void:
	scheme = s if SCHEMES.has(s) else SCHEME_WHEEL
	_commit()


## The value after `current` in `values` (wrapping), for the pause menu's one-button rows.
static func next_in(values: Array[float], current: float) -> float:
	var best := 0
	for i in values.size():
		if absf(values[i] - current) < absf(values[best] - current):
			best = i
	return values[(best + 1) % values.size()]


func _commit() -> void:
	save()
	changed.emit()
