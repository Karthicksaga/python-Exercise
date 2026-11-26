class_name DebugSettings
extends RefCounted
## The developer switches the player can reach (decision G-291). Today one: the performance
## overlay (FPS, time of day, what the world reader loaded), off by default so play stays clean.
## It is turned on from the pause menu's "Performance overlay" row or by tapping the top-left
## corner five times (`CornerTaps`). The richer overlay of the perf work reads `perf_overlay`
## from here too: this is the single switch, saved in the save file's own section
## `chennai-debug-v1` (additive, like `ControlSettings`).
##
## In a release build (the APK) the overlay always starts off (G-491): an "on" saved by an
## earlier session is not restored, and the perf overlay's three-finger tap does nothing, so only
## the menu row and the five corner taps show it, for that session. The owner's phone kept showing
## it because an earlier build had saved it on, and the menu row that turns it off could not be
## tapped (G-490). Debug runs (the editor, tests, desktop) still remember it.
##
## Pure data and persistence, no nodes.

signal changed

const SECTION := "chennai-debug-v1"
const VERSION := 1

var perf_overlay: bool = false
## Where it is saved; tests give their own.
var path: String = SaveStore.DEFAULT_PATH

static var _shared: DebugSettings = null
## True in an exported release build; tests set it to boot like the APK.
static var release_build: bool = not OS.is_debug_build()


## The one instance the game uses, loaded from the save file on first use.
static func shared() -> DebugSettings:
	if _shared == null:
		_shared = DebugSettings.new()
		_shared.load_saved()
	return _shared


## Forgets the shared instance (tests).
static func reset_shared() -> void:
	_shared = null


func to_dict() -> Dictionary:
	return {"version": VERSION, "perfOverlay": perf_overlay}


func from_dict(d: Dictionary) -> void:
	var v: Variant = d.get("perfOverlay", false)
	perf_overlay = v if v is bool else false
	changed.emit()


func load_saved() -> void:
	if release_build:
		return  # starts off in the APK, whatever an earlier session saved (G-491)
	var v: Variant = SaveStore.new(path).read().section(SECTION)
	if v is Dictionary:
		from_dict(v as Dictionary)


func save() -> void:
	var store := SaveStore.new(path).read()
	store.set_section(SECTION, to_dict())
	store.write()


func set_perf_overlay(on: bool) -> void:
	perf_overlay = on
	save()
	changed.emit()


func toggle_perf_overlay() -> void:
	set_perf_overlay(not perf_overlay)


## The pause menu row's text and press, like `Weather.label` / `Weather.toggle`.
static func label() -> String:
	return Tr.t("set.perf_overlay", [&"set.on" if shared().perf_overlay else &"set.off"])


static func toggle() -> void:
	shared().toggle_perf_overlay()
