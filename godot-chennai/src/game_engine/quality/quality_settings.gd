class_name QualitySettings
extends RefCounted
## Graphics quality presets, Low / Medium / High (decisions G-250, G-251), chosen automatically
## from the GPU, the memory and the screen on the first start, changeable in Settings, applied
## live (`QualityApplier` for the engine, `PerfWiring` for the game's systems) and saved in the
## save file's own section `chennai-quality-v1` (like `ControlSettings`: additive, own version).
##
## Also carries the performance overlay's on/off and the feature switches the owner uses to find
## what costs the frames on a phone (G-254). Pure data and persistence, no nodes.

signal changed

const SECTION := "chennai-quality-v2"
const VERSION := 2
## Builds before v2 saved a level the player cycled through with no way back to automatic, and the
## owner's Adreno 613 ran at a saved High (G-341): v1 keeps its feature switches, never its level.
const OLD_SECTION := "chennai-quality-v1"

const LOW := 0
const MEDIUM := 1
const HIGH := 2
const NAMES: Array[String] = ["Low", "Medium", "High"]
## One line per level for the Settings row (what the level trades).
const EXPLAIN: Array[String] = [
	"65% resolution, flat lighting, less traffic",
	"80% resolution, short shadows, fewer people",
	"full resolution, long shadows, full traffic",
]
## Auto drops one level when play stays under this for AUTO_WINDOW seconds.
const AUTO_MIN_FPS := 24
const AUTO_WINDOW := 10.0

## 3D resolution scaling modes (Viewport.SCALING_3D_MODE_*), by name so the table reads.
const BILINEAR := 0
const FSR1 := 1

## What each preset sets. High is the game as it was before presets (every test and tool
## measures it); Low is for weak phones (Adreno 6xx low tier at 1080x2400).
const TABLE: Array[Dictionary] = [
	{
		"scale": 0.65, "scale_mode": BILINEAR, "msaa": 0,
		"shadows": true, "shadow_size": 1024, "shadow_distance": 18.0, "soft_shadows": false, "vertex_lighting": true,
		"load_distance": 200.0, "unload_distance": 280.0, "near_distance": 80.0,
		"fog_far": 240.0, "camera_far": 330.0,
		"traffic": 18, "walkers": 14, "figures": 12, "driver_reach": 30.0, "rider_reach": 60.0,
		"rain": 0.4, "title_rain_layers": 0, "water_detail": false, "ground_detail": false,
		"lod_threshold": 4.0, "landmark_range": 0.6, "aniso": 0,
		"max_fps": 30, "physics_steps": 2, "workers": 1, "street_lights": 0, "ai_patience": 6,
		"animate_reach": 25.0, "npc_shadow": 0.0, "parked_reach": 100.0, "prop_shadows": false,
		"tree_density": 0.55, "scrub_density": 0.3, "tree_lod0": 28.0, "tree_lod1": 85.0, "tree_far": 220.0, "tree_sway": false, "tree_shadows": false, "tree_species": 4, "under_species": 1,
		"hit_puffs": 4, "motion_blur": false,
	},
	{
		"scale": 0.8, "scale_mode": FSR1, "msaa": 0,
		"shadows": true, "shadow_size": 1024, "shadow_distance": 28.0, "soft_shadows": false, "vertex_lighting": false,
		"load_distance": 240.0, "unload_distance": 320.0, "near_distance": 100.0,
		"fog_far": 300.0, "camera_far": 480.0,
		"traffic": 26, "walkers": 24, "figures": 24, "driver_reach": 40.0, "rider_reach": 80.0,
		"rain": 0.7, "title_rain_layers": 1, "water_detail": true, "ground_detail": true,
		"lod_threshold": 2.0, "landmark_range": 0.8, "aniso": 1,
		"max_fps": 60, "physics_steps": 3, "workers": 2, "street_lights": 2, "ai_patience": 4,
		"animate_reach": 35.0, "npc_shadow": 0.0, "parked_reach": 150.0, "prop_shadows": false,
		"tree_density": 0.8, "scrub_density": 0.65, "tree_lod0": 32.0, "tree_lod1": 105.0, "tree_far": 250.0, "tree_sway": true, "tree_shadows": false, "tree_species": 5, "under_species": 2,
		"hit_puffs": 6, "motion_blur": false,
	},
	{
		"scale": 1.0, "scale_mode": BILINEAR, "msaa": 1,
		"shadows": true, "shadow_size": 2048, "shadow_distance": 40.0, "soft_shadows": true, "vertex_lighting": false,
		"load_distance": 260.0, "unload_distance": 340.0, "near_distance": 120.0,
		"fog_far": 340.0, "camera_far": 750.0,
		"traffic": 34, "walkers": 34, "figures": 36, "driver_reach": 45.0, "rider_reach": 95.0,
		"rain": 1.0, "title_rain_layers": 2, "water_detail": true, "ground_detail": true,
		"lod_threshold": 1.0, "landmark_range": 1.0, "aniso": 2,
		"max_fps": 60, "physics_steps": 5, "workers": 3, "street_lights": 6, "ai_patience": 2,
		"animate_reach": 45.0, "npc_shadow": 18.0, "parked_reach": 200.0, "prop_shadows": true,
		"tree_density": 1.0, "scrub_density": 1.0, "tree_lod0": 45.0, "tree_lod1": 140.0, "tree_far": 340.0, "tree_sway": true, "tree_shadows": true, "tree_species": 7, "under_species": 3,
		"hit_puffs": 8, "motion_blur": true,
	},
]

## Memory below this (bytes) caps the default at Low. Phones sold as 8 GB report about 7.3 GiB.
const LOW_MEMORY := 7 * 1024 * 1024 * 1024
## Screens with more pixels than this take one preset lower on a Medium-tier GPU.
const BIG_SCREEN := 3_000_000

var preset: int = LOW
## True while the preset is the detected default (the player never chose one).
var auto: bool = true
## Auto never goes above this: it is lowered when a level proved too slow in play (G-251),
## saved, so the next start begins at the level that held.
var auto_cap: int = HIGH
## Why the default was chosen ("Adreno (TM) 613: Adreno 6xx low tier").
var reason: String = ""
## The performance overlay (G-253): off by default.
var overlay: bool = false
## Feature switches (G-254): id → on. Missing ids are on.
var switches: Dictionary[String, bool] = {}
var path: String = SaveStore.DEFAULT_PATH
## The GPU name detection reads; empty: the renderer's (`RenderingServer.get_video_adapter_name`).
## Tests set a phone's name here.
var gpu_name: String = ""
## Also for tests: false makes detection ignore that the run is headless.
var headless_is_high: bool = true

static var _shared: QualitySettings = null


## The one instance the game uses: loaded from the save file, or detected on the first start.
static func shared() -> QualitySettings:
	if _shared == null:
		_shared = QualitySettings.new()
		_shared.load_saved()
	return _shared


static func reset_shared() -> void:
	_shared = null


## Makes `s` the shared instance (tests give one with its own save path).
static func use_shared(s: QualitySettings) -> void:
	_shared = s


## The preset's values (a copy).
static func values(p: int) -> Dictionary:
	return TABLE[clampi(p, LOW, HIGH)].duplicate()


func current() -> Dictionary:
	return values(preset)


func preset_name() -> String:
	return NAMES[clampi(preset, LOW, HIGH)]


## Picks a default from what the device says (pure; the auto-detect table, G-251). Returns
## [preset, reason]. `gpu` is `RenderingServer.get_video_adapter_name()`, `memory` the physical
## memory in bytes (0 unknown), `pixels` the screen's pixel count, `headless` true in tests and
## tools (they measure the full game: High).
static func detect(gpu: String, memory: int, pixels: int, headless: bool = false) -> Array:
	if headless:
		return [HIGH, "headless run: High (tests and tools measure the full game)"]
	var g := gpu.to_lower()
	var tier := LOW
	var why := ""
	if g.strip_edges() == "":
		why = "unknown GPU"
	elif is_software(gpu):
		why = "software renderer"
	elif g.contains("adreno"):
		var n := _model_number(g)
		# 6xx: 610-630 low tier (Snapdragon 4/6 class), 640s mid, 650/660 flagships of their
		# day; 7xx: 710-725 mid, 730 and up flagships; 8xx flagships.
		if n >= 730 or (n >= 650 and n < 700):
			tier = HIGH
		elif n >= 640:
			tier = MEDIUM
		why = "Adreno %d" % n
		if n > 0 and n < 640:
			why += " (6xx low tier)"
	elif g.contains("mali") or g.contains("immortalis"):
		var n := _model_number(g)
		if g.contains("immortalis") or n >= 710:
			tier = HIGH
		elif n >= 68:
			tier = MEDIUM
		why = "Mali %d" % n
	elif g.contains("powervr") or g.contains("img "):
		why = "PowerVR"
	elif g.contains("xclipse"):
		tier = HIGH
		why = "Xclipse"
	elif g.contains("nvidia") or g.contains("geforce") or g.contains("radeon") or g.contains("amd") or g.contains("intel") or g.contains("apple"):
		tier = HIGH
		why = "desktop GPU"
	else:
		why = "unlisted GPU"
	var out := tier
	if tier == MEDIUM and pixels > BIG_SCREEN:
		out = LOW
		why += ", big screen"
	if memory > 0 and memory < LOW_MEMORY and out > LOW:
		out = LOW
		why += ", under 7 GiB memory"
	return [out, "%s: %s → %s" % [gpu if gpu != "" else "?", why, NAMES[out]]]


## Software rasterisers draw everything on the CPU: never a phone's real GPU.
static func is_software(gpu: String) -> bool:
	var g := gpu.to_lower()
	for word: String in ["llvmpipe", "lavapipe", "swiftshader", "software", "softpipe", "microsoft basic"]:
		if g.contains(word):
			return true
	return false


## The first number of three or more digits ("adreno (tm) 613" → 613), else the first number of
## two ("mali-g68" → 68), else 0.
static func _model_number(g: String) -> int:
	var re := RegEx.create_from_string("(\\d+)")
	var best := 0
	for m in re.search_all(g):
		var n := int(m.get_string(1))
		if m.get_string(1).length() >= 3:
			return n
		if best == 0:
			best = n
	return best


func set_preset(p: int) -> void:
	preset = clampi(p, LOW, HIGH)
	auto = false
	_commit()


## Auto → Low → Medium → High → Auto (the Settings row "Graphics").
func next_preset() -> void:
	if auto:
		set_preset(LOW)
	elif preset == HIGH:
		set_auto()
	else:
		set_preset(preset + 1)


## Back to the automatic level: detected again, under the cap a slow phone earned.
func set_auto() -> void:
	auto = true
	_detect()
	_commit()


## Auto only: detect again now the renderer is up (the first read may come before it names the
## GPU); applied and saved only when the level changes.
func refresh_auto() -> void:
	if not auto:
		return
	var before := preset
	_detect()
	if preset != before:
		_commit()


## Auto only: one level down after play stayed too slow (G-251). False at Low or when manual.
func drop_auto() -> bool:
	if not auto or preset <= LOW:
		return false
	preset -= 1
	auto_cap = preset
	reason = "dropped to %s: under %d fps in play" % [preset_name(), AUTO_MIN_FPS]
	_commit()
	return true


## The overlay's level: "Low (auto)", "High (chosen)" or "Medium (benchmark)".
func overlay_label() -> String:
	return "%s (%s)" % [preset_name(), "benchmark" if is_held() else ("auto" if auto else "chosen")]


## The benchmark (G-402) runs each level in turn without touching the player's choice: the level is
## held (applied live, never saved, Auto's drop is off because Auto is off) until `release_hold`
## puts the player's level back. A save meanwhile writes the level as it was before the hold.
var _hold: Dictionary = {}


func hold_preset(p: int) -> void:
	if _hold.is_empty():
		_hold = to_dict()
	preset = clampi(p, LOW, HIGH)
	auto = false
	changed.emit()


func is_held() -> bool:
	return not _hold.is_empty()


func release_hold() -> void:
	if _hold.is_empty():
		return
	var before := _held_dict()
	_hold = {}
	from_dict(before)


## What is saved while a level is held: everything as it is now, the level as it was.
func _held_dict() -> Dictionary:
	var d := to_dict()
	for k: String in ["preset", "auto", "auto_cap"]:
		d[k] = _hold[k]
	return d


## The Settings row: "Graphics: Auto (Low)".
func row_label() -> String:
	return "Graphics: %s" % ("Auto (%s)" % preset_name() if auto else preset_name())


## What the current level changes, one line.
func explain() -> String:
	return EXPLAIN[clampi(preset, LOW, HIGH)]


func set_overlay(on: bool) -> void:
	overlay = on
	_commit()


func is_on(id: String) -> bool:
	return switches.get(id, true)


func set_switch(id: String, on: bool) -> void:
	if on:
		switches.erase(id)
	else:
		switches[id] = false
	_commit()


func set_all_switches(ids: PackedStringArray, on: bool) -> void:
	for id in ids:
		if on:
			switches.erase(id)
		else:
			switches[id] = false
	_commit()


func to_dict() -> Dictionary:
	var off: Array[String] = []
	for id: String in switches:
		if not switches[id]:
			off.append(id)
	off.sort()
	return {"version": VERSION, "preset": preset, "auto": auto, "auto_cap": auto_cap, "overlay": overlay, "off": off}


func from_dict(d: Dictionary) -> void:
	var p: Variant = d.get("preset", preset)
	preset = clampi(int(p) if (p is int or p is float) else preset, LOW, HIGH)
	var a: Variant = d.get("auto", true)
	auto = a if a is bool else true
	var c: Variant = d.get("auto_cap", HIGH)
	auto_cap = clampi(int(c) if (c is int or c is float) else HIGH, LOW, HIGH)
	var o: Variant = d.get("overlay", false)
	overlay = o if o is bool else false
	switches.clear()
	var off: Variant = d.get("off", [])
	if off is Array:
		for id: Variant in off:
			switches[str(id)] = false
	changed.emit()


## Reads the saved choice; with none (or an automatic one) detects the default on this device.
func load_saved() -> void:
	var store := SaveStore.new(path).read()
	var v: Variant = store.section(SECTION)
	if v is Dictionary:
		from_dict(v as Dictionary)
	else:
		var old: Variant = store.section(OLD_SECTION)
		if old is Dictionary:
			from_dict(old as Dictionary)
			# The level of a v1 save is not trusted (G-341): back to automatic, no cap.
			auto = true
			auto_cap = HIGH
	if auto:
		_detect()


func _detect() -> void:
	var size := DisplayServer.screen_get_size()
	var mem: Variant = OS.get_memory_info().get("physical", 0)
	var gpu := gpu_name if gpu_name != "" else RenderingServer.get_video_adapter_name()
	var found := detect(gpu, int(mem) if (mem is int or mem is float) else 0, size.x * size.y, headless_is_high and DisplayServer.get_name() == "headless")
	preset = mini(int(found[0]), auto_cap)
	reason = String(found[1]) + (" (capped at %s after a slow run)" % NAMES[auto_cap] if auto_cap < int(found[0]) else "")


func save() -> void:
	var store := SaveStore.new(path).read()
	store.set_section(SECTION, _held_dict() if is_held() else to_dict())
	store.write()


func _commit() -> void:
	save()
	changed.emit()
