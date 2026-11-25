class_name SoundSystem
extends Node
## Autoload `Sound`: everything the game hears (TD-26, decisions G-80…G-85). Gameplay calls this
## API; it never builds players itself.
##
## Vehicles (player's vehicle):  Sound.set_engine("car", speed, accelerator)  every frame driving,
##                               Sound.engine_off()  on getting out; Sound.horn("auto");
##                               Sound.door("bus"); Sound.crash(strength); Sound.set_skid(slide);
##                               Sound.set_siren(on); Sound.set_police_siren(level)
## Player on foot:               Sound.walk(dt, speed, grounded, wet) every frame; Sound.land(drop)
## World/traffic:                Sound.set_traffic([{id, position, speed, kind}], dt, hour)
## The place (ambience):         Sound.set_place(coast_m, traffic01, enclosed); Sound.active = true
##                               while playing (the beds follow GameLoop.clock and Weather)
## Interface:                    Sound.cue("cash"); Sound.enabled / Sound.set_enabled(on) (saved)
## Tests and the debug HUD:      Sound.state()
##
## The mix: Vehicles, World, Ambience and UI buses into Master (compressor, limiter), in
## `default_bus_layout.tres`. Sound off mutes Master and is saved in the save file (`SaveStore`,
## key "cow-sound-v1": "on" / "off", as the Three.js game stored it).

signal enabled_changed(on: bool)

const SOUND_KEY := "cow-sound-v1"
## Traffic engines heard at once (each is a few players; phones have little to spare).
const TRAFFIC_VOICES := 3
const TRAFFIC_HEARD := 45.0
const HONK_HEARD := 70.0
const STEP_POOL := 3

var library: SoundLibrary
var ambience: Ambience
var rail: RailSounds
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
## Ambience plays while true (set by the game flow when play starts).
var active: bool = false
var enabled: bool = true
var settings_path: String = SaveStore.DEFAULT_PATH

var engine: EngineVoice = null
var listener: Vector3 = Vector3.ZERO
var listener_yaw: float = 0.0

var _counts: Dictionary = {"footstep": 0, "traffic_honk": 0, "land": 0, "door": 0}
var _traffic: Dictionary = {}
var _stood: Dictionary = {}
var _honk_wait: float = 0.0
var _step_clock: float = 0.0
var _step_side: int = 1
var _fading: Array[EngineVoice] = []
var _wind: AudioStreamPlayer
var _skid: AudioStreamPlayer
var _siren: AudioStreamPlayer
var _police: AudioStreamPlayer
var _world_pool: Array[AudioStreamPlayer] = []
var _vehicle_pool: Array[AudioStreamPlayer] = []
var _ui_pool: Array[AudioStreamPlayer] = []
var _horn_3d: Array[AudioStreamPlayer3D] = []
var _coast: float = INF
var _traffic_level: float = 0.5
var _enclosed: bool = false
var _speed: float = 0.0
var _street: StringName = &""
## 0..1: how calm the place is (a temple's compound: the city fades, the bell is heard more, G-483).
var _calm: float = 0.0
## Footsteps are this loud: 1, less barefoot (the temple's sandal stand).
var step_gain: float = 1.0


func _ready() -> void:
	rng.seed = 4242
	library = SoundLibrary.new()
	if library.error != "":
		push_warning("[sound] %s Playing silently." % library.error)
	library.request_all()
	ambience = Ambience.new()
	ambience.name = "Ambience"
	add_child(ambience)
	ambience.setup(library)
	rail = RailSounds.new()
	rail.name = "RailSounds"
	add_child(rail)
	rail.setup(library)
	_wind = _loop_player("vehicle.wind", &"Vehicles")
	_skid = _loop_player("vehicle.skid", &"Vehicles")
	_siren = _loop_player("siren.ambulance", &"Vehicles")
	_police = _loop_player("siren.police", &"Vehicles")
	for i in STEP_POOL:
		_world_pool.append(_pool_player(&"World"))
		_vehicle_pool.append(_pool_player(&"Vehicles"))
	_ui_pool.append(_pool_player(&"UI"))
	for i in 2:
		var p := AudioStreamPlayer3D.new()
		p.bus = &"Vehicles"
		p.unit_size = 6.0
		p.max_distance = 90.0
		p.attenuation_filter_cutoff_hz = 5000.0
		add_child(p)
		_horn_3d.append(p)
	_load_settings()


func _loop_player(id: String, bus: StringName) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = bus
	p.name = id.replace(".", "_")
	add_child(p)
	p.set_meta(&"id", id)
	return p


func _pool_player(bus: StringName) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = bus
	add_child(p)
	return p


# --- settings ---------------------------------------------------------------------------

func _load_settings() -> void:
	enabled = str(SaveStore.new(settings_path).read().section(SOUND_KEY, "on")) != "off"
	_apply_enabled()


## Sound on or off (pause menu); remembered across launches.
func set_enabled(on: bool) -> void:
	enabled = on
	var store := SaveStore.new(settings_path).read()
	store.set_section(SOUND_KEY, "on" if on else "off")
	store.write()
	_apply_enabled()
	enabled_changed.emit(on)


func toggle() -> void:
	set_enabled(not enabled)


## "Sound: On" / "Sound: Off" for the menu button.
func label() -> String:
	return Tr.t("set.sound", [&"set.on" if enabled else &"set.off"])


func _apply_enabled() -> void:
	AudioServer.set_bus_mute(AudioServer.get_bus_index(&"Master"), not enabled)


# --- the player's vehicle ---------------------------------------------------------------

## The player's vehicle engine: call every frame while driving (kind from SoundProfiles.sound_kind).
func set_engine(kind: String, speed: float, accelerator: float, dt: float = -1.0) -> void:
	var step := get_process_delta_time() if dt < 0.0 else dt
	var k := SoundProfiles.sound_kind(kind)
	if engine != null and engine.kind != k:
		engine_off(false)
	if engine == null:
		engine = EngineVoice.new()
		engine.name = "Engine"
		add_child(engine)
		engine.setup(library, k, false, true)
	engine.drive(step, speed, accelerator)
	_speed = speed
	var p := SoundProfiles.engine(k)
	var share := clampf(absf(speed) / float(p["top_speed"]), 0.0, 1.0)
	_loop(_wind, float(p["wind"]) * share * share * 0.6, 0.8 + share * 0.8)


## Getting out or switching off: the stop sound plays and the loops fade.
func engine_off(play_sound: bool = true) -> void:
	if engine == null:
		return
	engine.stop(play_sound)
	_fading.append(engine)
	engine = null
	_loop(_wind, 0.0, 1.0)


func horn(kind: String = "car") -> void:
	var k := SoundProfiles.sound_kind(kind)
	_one_shot(_vehicle_pool, "horn.%s" % k, 1.0, 1.0)
	var key := "horn:%s" % k
	_counts[key] = int(_counts.get(key, 0)) + 1


## A door shutting: a car's thunk, a bus's air door, an auto or bike's seat.
func door(kind: String = "car") -> void:
	var k := SoundProfiles.sound_kind(kind)
	var id := "door.%s" % k
	if not library.has(id):
		id = "door.auto" if k in ["bike", "thumper", "auto"] else "door.car"
	_one_shot(_world_pool, id, 1.0, 0.96 + rng.randf() * 0.08)
	_counts["door"] = int(_counts["door"]) + 1


## A crash: strength is the change of speed in m/s.
func crash(strength: float) -> void:
	var loud := clampf(strength / 8.0, 0.25, 1.0)
	_one_shot(_vehicle_pool, "vehicle.crash.heavy" if strength > 4.0 else "vehicle.crash.light", loud, 1.0)


## Tyre squeal while sliding: 0 gripping … 1 a full drift (quiet below a small slide).
func set_skid(level: float) -> void:
	var a := clampf(level, 0.0, 1.0)
	var loud := 0.0 if a < 0.15 else (a - 0.15) / 0.85
	_loop(_skid, loud * 0.8, 0.85 + a * 0.4)


func set_siren(on: bool) -> void:
	_loop(_siren, 0.7 if on else 0.0, 1.0)


## A police siren somewhere near: 0 off … 1 right beside the player.
func set_police_siren(level: float) -> void:
	_loop(_police, clampf(level, 0.0, 1.0) * 0.5, 1.0)


func cue(name: String) -> void:
	_counts["cue.%s" % name] = int(_counts.get("cue.%s" % name, 0)) + 1
	_one_shot(_ui_pool if name in ["cash", "chime", "fanfare", "fail"] else _world_pool, "cue.%s" % name, 1.0, 1.0)


# --- on foot ----------------------------------------------------------------------------

## Walking and running: call every frame on foot. Footsteps fall at the stride's cadence
## (`SoundProfiles.step_interval`), alternating feet, splashing when the ground is wet.
func walk(dt: float, speed: float, grounded: bool, wet: bool) -> void:
	if not grounded or speed < 0.6:
		_step_clock = SoundProfiles.step_interval(speed) * 0.6
		return
	_step_clock += dt
	var interval := SoundProfiles.step_interval(speed)
	if _step_clock < interval:
		return
	_step_clock -= interval
	_step_side = -_step_side
	var ids := library.ids_with("step.wet." if wet else "step.dry.")
	if ids.is_empty():
		return
	var run := clampf((speed - 2.0) / 3.0, 0.0, 1.0)
	_one_shot(_world_pool, ids[rng.randi_range(0, ids.size() - 1)], (0.75 + 0.5 * run) * step_gain, 0.92 + rng.randf() * 0.16)
	_counts["footstep"] = int(_counts["footstep"]) + 1
	_counts["wet_footstep" if wet else "dry_footstep"] = int(_counts.get("wet_footstep" if wet else "dry_footstep", 0)) + 1


## Landing after a jump or drop: strength 0..1.
func land(strength: float) -> void:
	_one_shot(_world_pool, "step.land", 0.4 + 0.6 * clampf(strength, 0.0, 1.0), 1.0)
	_counts["land"] = int(_counts["land"]) + 1


# --- traffic and the place --------------------------------------------------------------

## Where the player hears from (the camera): traffic is picked by distance from here.
func set_listener(position: Vector3, yaw: float) -> void:
	listener = position
	listener_yaw = yaw
	ambience.listener = position


## The traffic round the player: [{id: int, position: Vector3, speed: float, kind: String}].
## The nearest few are heard as their own engines in 3D; vehicles that have stood a while may
## honk, more in the rushes (`SoundProfiles.honk_chance`).
func set_traffic(traffic: Array[Dictionary], dt: float, hour: float) -> void:
	var near: Array[Dictionary] = []
	for t in traffic:
		var d := (t["position"] as Vector3).distance_to(listener)
		if d < TRAFFIC_HEARD:
			near.append({"t": t, "d": d})
	near.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["d"]) < float(b["d"]))
	near = near.slice(0, TRAFFIC_VOICES)
	var keep := {}
	for n in near:
		keep[int((n["t"] as Dictionary)["id"])] = true
	for id: int in _traffic.keys():
		if not keep.has(id):
			var gone: EngineVoice = _traffic[id]
			gone.stop(false)
			_fading.append(gone)
			_traffic.erase(id)
	for n in near:
		var t: Dictionary = n["t"]
		var id: int = t["id"]
		var kind := SoundProfiles.sound_kind(str(t.get("kind", "car")))
		var voice: EngineVoice = _traffic.get(id, null)
		if voice != null and voice.kind != kind:
			voice.stop(false)
			_fading.append(voice)
			voice = null
		if voice == null:
			voice = EngineVoice.new()
			add_child(voice)
			voice.setup(library, kind, true, false)
			_traffic[id] = voice
		voice.global_position = t["position"]
		var d: float = n["d"]
		var edge := clampf((TRAFFIC_HEARD - d) / (TRAFFIC_HEARD * 0.25), 0.0, 1.0)
		var speed: float = t.get("speed", 0.0)
		voice.drive(maxf(dt, 0.0001), speed, 0.35 if speed > 0.5 else 0.0, 0.6 * edge)
	_honks(traffic, dt, hour)


func _honks(traffic: Array[Dictionary], dt: float, hour: float) -> void:
	if dt <= 0.0:
		return
	_honk_wait = maxf(0.0, _honk_wait - dt)
	var seen := {}
	for t in traffic:
		var pos: Vector3 = t["position"]
		if pos.distance_to(listener) > HONK_HEARD:
			continue
		var id: int = t["id"]
		seen[id] = true
		var stood := float(_stood.get(id, 0.0)) + dt if float(t.get("speed", 0.0)) < 0.3 else 0.0
		_stood[id] = stood
		if _honk_wait > 0.0 or rng.randf() >= SoundProfiles.honk_chance(hour, stood) * dt:
			continue
		var player: AudioStreamPlayer3D = _horn_3d[0] if not _horn_3d[0].playing else _horn_3d[1]
		var s := library.stream("horn.%s" % SoundProfiles.sound_kind(str(t.get("kind", "car"))))
		if s != null:
			player.stream = s
			player.global_position = pos
			player.volume_linear = 0.8
			player.play()
		_counts["traffic_honk"] = int(_counts["traffic_honk"]) + 1
		_stood[id] = 0.0
		_honk_wait = 1.2 + rng.randf() * 1.5
	for id: int in _stood.keys():
		if not seen.has(id):
			_stood.erase(id)


## The kind of street round the player (`PlaceMap.KINDS`, "" unknown): the market murmur, the tea
## stall and the far temple bell follow it.
func set_street(kind: StringName) -> void:
	_street = kind


## A calm place (0..1): the street and the city beds fade, the temple bell is heard more often.
func set_calm(level: float) -> void:
	_calm = clampf(level, 0.0, 1.0)


## A temple bell close by (its own recording, not the far ambience one), for the lamp and the walk round.
func bell(gain: float = 0.7) -> void:
	ambience.ring("bell.temple", 5.0, 12.0, gain)


## The place round the player, for the ambience: metres to the sea (INF inland), how busy the
## roads are (0..1), and whether the player sits inside a closed vehicle.
func set_place(coast_metres: float, traffic_level: float, enclosed: bool) -> void:
	_coast = coast_metres
	_traffic_level = traffic_level
	_enclosed = enclosed


## Silence everything sustained (pause, menus): engines, sirens, skids, traffic, beds.
func suspend() -> void:
	engine_off(false)
	set_siren(false)
	set_police_siren(0.0)
	set_skid(0.0)
	set_traffic([], 0.0, 12.0)
	ambience.stop_all()
	rail.stop_all()
	active = false


func _process(dt: float) -> void:
	for v: EngineVoice in _fading.duplicate():
		if v.done():
			_fading.erase(v)
			v.queue_free()
		else:
			v.drive(dt, 0.0, 0.0)
	rail.update(dt)
	if active:
		var clock: GameClock = GameLoop.clock
		ambience.update(dt, {"hour": clock.hour, "rain": Weather.rain_level(), "coast": _coast, "traffic": _traffic_level, "enclosed": _enclosed, "street": _street, "calm": _calm})


# --- players ----------------------------------------------------------------------------

## Sets a looped player's level and pitch; starts it when heard, stops it when silent.
func _loop(player: AudioStreamPlayer, gain: float, pitch: float) -> void:
	if player.stream == null and gain > 0.0:
		player.stream = library.stream(str(player.get_meta(&"id")))
	if player.stream == null:
		return
	player.pitch_scale = pitch
	player.volume_linear = maxf(gain, 0.00001)
	if gain > 0.0005 and not player.playing:
		player.play()
	elif gain <= 0.0005 and player.playing:
		player.stop()


func _one_shot(pool: Array[AudioStreamPlayer], id: String, gain: float, pitch: float) -> void:
	var s := library.stream(id)
	if s == null:
		return
	var player := pool[0]
	for p in pool:
		if not p.playing:
			player = p
			break
	player.stream = s
	player.volume_linear = gain
	player.pitch_scale = pitch
	player.play()


## What the sound system is doing, for tests and the debug snapshot.
func state() -> Dictionary:
	var traffic := []
	for id: int in _traffic:
		traffic.append({"id": id, "kind": (_traffic[id] as EngineVoice).kind})
	return {
		"enabled": enabled,
		"engine": null if engine == null else {"kind": engine.kind, "rpm": roundi(engine.rpm), "gear": engine.gear},
		"traffic": traffic,
		"ambience": ambience.active(),
		"rail": rail.playing(),
		"played": _counts.merged(ambience.played).merged(rail.played),
		"synth_engines": library.synth_engine_kinds(),
	}
