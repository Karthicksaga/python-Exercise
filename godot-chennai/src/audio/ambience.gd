class_name Ambience
extends Node
## The city's background (TD-26): beds that follow the hour and the place (traffic hum, rain on
## the roofs, waves near the coast, crickets after dark) and, now and then, a crow by day, the
## koel at dawn and a distant horn, placed around the listener. A bed starts only when it is
## heard and stops a few seconds after it falls silent, so a quiet street costs nothing.
##
## Inside a vehicle (`enclosed`) the Ambience bus's low-pass closes: the street is muffled.

## Full level of each bed in the Ambience bus (linear), chosen so a clear evening rush sits about
## 6 dB under the player's idle hatchback, rain on the roofs about as loud as the rush, the sea a
## little under it and crickets well under (checked in tests/unit/test_sound_mix.gd). Retune
## when recordings replace the stand-ins (they are loudness-normalised per category).
const BED_GAIN: Dictionary = {"city": 0.09, "rain": 0.05, "sea": 0.1, "crickets": 0.03, "market": 0.12, "tea": 0.07}
const QUIET_STOP := 4.0
const SMOOTH := 0.6

## One-shots played so far, by name (tests and the debug snapshot).
var played: Dictionary = {"crow": 0, "koel": 0, "honk": 0, "temple": 0}
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
## Where the listener is (one-shots are placed round it).
var listener: Vector3 = Vector3.ZERO

var _library: SoundLibrary
var _beds: Dictionary = {}
var _levels: Dictionary = {}
var _quiet: Dictionary = {}
var _next_bird: float = 4.0
var _next_honk: float = 3.0
var _next_bell: float = 12.0
var _shots: Array[AudioStreamPlayer3D] = []
var _muffle: AudioEffectLowPassFilter = null


func setup(library: SoundLibrary) -> void:
	_library = library
	rng.seed = 2611
	for i in 3:
		var p := AudioStreamPlayer3D.new()
		p.bus = &"Ambience"
		p.unit_size = 10.0
		p.max_distance = 400.0
		p.attenuation_filter_cutoff_hz = 3500.0
		p.attenuation_filter_db = -12.0
		add_child(p)
		_shots.append(p)
	var bus := AudioServer.get_bus_index(&"Ambience")
	if bus >= 0 and AudioServer.get_bus_effect_count(bus) > 0:
		_muffle = AudioServer.get_bus_effect(bus, 0) as AudioEffectLowPassFilter


## Beds playing now.
func active() -> PackedStringArray:
	var out := PackedStringArray()
	for name: String in _beds:
		out.append(name)
	out.sort()
	return out


## Current level of a bed (0..1 of its full level), for tests.
func level(name: String) -> float:
	return float(_levels.get(name, 0.0))


## Call every frame while playing. state: {hour, rain 0..1, coast m (INF inland), traffic 0..1, enclosed,
## street (a `PlaceMap.KINDS` name, optional)}.
func update(dt: float, state: Dictionary) -> void:
	var hour: float = state.get("hour", 12.0)
	var rain: float = state.get("rain", 0.0)
	var enclosed: bool = state.get("enclosed", false)
	if _muffle != null:
		var want := 1400.0 if enclosed else 18000.0
		_muffle.cutoff_hz = lerpf(_muffle.cutoff_hz, want, 1.0 - exp(-dt / 0.3))
	var street: StringName = state.get("street", &"")
	var targets := SoundProfiles.ambience_levels(hour, rain, float(state.get("coast", INF)), float(state.get("traffic", 0.5)), street)
	for name: String in targets:
		_bed(name, dt, float(targets[name]))
	if enclosed:
		return
	var birds := SoundProfiles.wildlife(hour)
	_next_bird -= dt
	if _next_bird <= 0.0:
		_next_bird = 6.0 + rng.randf() * 14.0
		var koel: float = birds["koel"]
		var crows: float = birds["crows"]
		if koel > 0.2 and rng.randf() < koel:
			_shot("bird.koel.", 25.0, 70.0, 1.0)
			played["koel"] = int(played["koel"]) + 1
		elif crows > 0.0 and rng.randf() < crows * (1.0 - rain):
			_shot("bird.crow.", 25.0, 70.0, 1.0)
			played["crow"] = int(played["crow"]) + 1
	_next_bell -= dt
	if _next_bell <= 0.0:
		_next_bell = SoundProfiles.temple_bell_wait(hour) * (0.7 + rng.randf() * 0.6)
		if street == &"temple" and rain < 0.6:
			_shot("bell.temple", 110.0, 240.0, 1.0)
			played["temple"] = int(played["temple"]) + 1
	_next_honk -= dt
	if _next_honk <= 0.0:
		var city := SoundProfiles.city_level(hour)
		_next_honk = 2.0 + rng.randf() * (14.0 - 10.0 * city)
		if rng.randf() < 0.3 + 0.7 * city:
			var kinds: PackedStringArray = ["car", "car", "auto", "auto", "bike", "bus"]
			_shot("horn.%s" % kinds[rng.randi_range(0, kinds.size() - 1)], 80.0, 220.0, 0.6)
			played["honk"] = int(played["honk"]) + 1


func stop_all() -> void:
	for name: String in _beds.keys():
		_release(name)


func _bed(name: String, dt: float, target: float) -> void:
	var current: float = _levels.get(name, 0.0)
	current += (target - current) * (1.0 - exp(-dt / SMOOTH))
	_levels[name] = current
	var player: AudioStreamPlayer = _beds.get(name, null)
	if player == null:
		if target < SILENT_LEVEL:
			return
		var s := _library.stream("bed.%s" % name)
		if s == null:
			return
		player = AudioStreamPlayer.new()
		player.bus = &"Ambience"
		player.stream = s
		add_child(player)
		player.volume_linear = 0.00001
		player.play(rng.randf() * maxf(0.0, s.get_length() - 0.1))
		_beds[name] = player
		_quiet[name] = 0.0
	player.volume_linear = maxf(0.00001, current * float(BED_GAIN[name]))
	_quiet[name] = float(_quiet[name]) + dt if target < SILENT_LEVEL else 0.0
	if float(_quiet[name]) > QUIET_STOP:
		_release(name)


const SILENT_LEVEL := 0.0005


func _release(name: String) -> void:
	var player: AudioStreamPlayer = _beds.get(name, null)
	_beds.erase(name)
	_quiet.erase(name)
	_levels[name] = 0.0
	if player != null:
		player.queue_free()


## Plays a one-shot (an id or the prefix of a few variants) somewhere round the listener.
func _shot(id_or_prefix: String, near: float, far: float, gain: float) -> void:
	var id := id_or_prefix
	if id.ends_with("."):
		var ids := _library.ids_with(id)
		if ids.is_empty():
			return
		id = ids[rng.randi_range(0, ids.size() - 1)]
	var s := _library.stream(id)
	if s == null:
		return
	var player: AudioStreamPlayer3D = null
	for p in _shots:
		if not p.playing:
			player = p
			break
	if player == null:
		return
	var angle := rng.randf() * TAU
	var distance := near + rng.randf() * (far - near)
	player.stream = s
	player.position = listener + Vector3(cos(angle) * distance, 8.0, sin(angle) * distance)
	player.volume_linear = gain
	player.pitch_scale = 0.95 + rng.randf() * 0.1
	player.play()
