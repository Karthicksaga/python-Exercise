class_name RailSounds
extends Node
## What a train and a level crossing sound like (G-374, G-375): the EMU's horn, the rumble, the
## wheel clatter and the brake squeal of a train near or under the player, the door chime and
## doors, the station's announcement chime, and the crossing's bell and booms. A child of the
## `Sound` autoload (`Sound.rail`); the railway layer (`src/app/railway/`) calls it, so `src/rail`
## stays free of sound. The levels are pure functions below, so they are unit-tested.
##
## Loops only run while their level is above zero (a phone mixes what plays, silent or not).

## Train speed (m/s) at which the clatter recording was cut (joints about 1.5 times a second).
const CLATTER_REF_SPEED := 20.0
## A train this fast is as loud as it gets.
const FULL_SPEED := 30.0
## Heard from this far (m): full level inside NEAR, gone at FAR (a horn carries further).
const NEAR := 25.0
const FAR := 260.0
const HORN_FAR := 480.0
const BELL_NEAR := 12.0
const BELL_FAR := 170.0
const SMOOTH := 0.25
## Each loop's full level (linear, before its bus). The recordings are all normalised to -16 LUFS,
## so these set the mix: a train at full speed with the player inside is about 6 dB over the
## player's idling hatchback, a horn about as loud as a car's (checked in `test_sound_mix.gd`).
const LOOP_GAIN: Dictionary = {"rumble": 0.2, "clatter": 0.3, "squeal": 0.2, "bell": 0.3}
const HORN_GAIN := 0.7
const CHIME_GAIN := 0.6
const DOOR_GAIN := 0.8
const BOOM_GAIN := 0.7

var library: SoundLibrary
## What was played, by name (tests and the debug snapshot).
var played: Dictionary = {"rail_horn": 0, "rail_announce": 0, "rail_door": 0, "rail_chime": 0, "crossing_boom": 0}

var _rumble: AudioStreamPlayer
var _clatter: AudioStreamPlayer
var _squeal: AudioStreamPlayer
var _bell: AudioStreamPlayer
var _shots: Array[AudioStreamPlayer] = []
var _levels: Dictionary = {"rumble": 0.0, "clatter": 0.0, "squeal": 0.0, "bell": 0.0}
var _targets: Dictionary = {"rumble": 0.0, "clatter": 0.0, "squeal": 0.0, "bell": 0.0}
var _pitch: Dictionary = {"rumble": 1.0, "clatter": 1.0, "squeal": 1.0}


func setup(lib: SoundLibrary) -> void:
	library = lib
	_rumble = _loop_player("rail.rumble", &"World")
	_clatter = _loop_player("rail.clatter", &"World")
	_squeal = _loop_player("rail.squeal", &"World")
	_bell = _loop_player("crossing.bell", &"World")
	for i in 3:
		var p := AudioStreamPlayer.new()
		p.bus = &"Vehicles"
		add_child(p)
		_shots.append(p)


func _loop_player(id: String, bus: StringName) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = bus
	p.name = id.replace(".", "_")
	p.set_meta(&"id", id)
	add_child(p)
	return p


# --- levels (pure) -------------------------------------------------------------------------

## How far a sound at `distance` m is heard: 1 inside `near`, inverse distance after, faded to
## silence over the last quarter before `far`.
static func reach(distance: float, near: float, far: float) -> float:
	if distance >= far:
		return 0.0
	return near / maxf(near, distance) * clampf((far - distance) / (far * 0.25), 0.0, 1.0)


## The running sound of a train: {rumble, clatter, squeal, rumble_pitch, clatter_pitch,
## squeal_pitch}, levels 0..1 of each loop's own full level. `speed` m/s, `brake` 0..1 (how hard it
## is braking), `inside` (the player rides or drives it: louder and nearer, the squeal more
## muffled), `distance` m from the player to the train (ignored inside).
static func motion_levels(speed: float, brake: float, inside: bool, distance: float) -> Dictionary:
	var v := absf(speed)
	var near := 1.0 if inside else reach(distance, NEAR, FAR)
	var fast := clampf(v / FULL_SPEED, 0.0, 1.0)
	var moving := clampf((v - 0.3) / 1.2, 0.0, 1.0)
	# Squeal comes at the end of a stop: braking hard below about 12 m/s, not once nearly stopped.
	var slowing := clampf((12.0 - v) / 8.0, 0.0, 1.0) * clampf((v - 0.4) / 1.6, 0.0, 1.0)
	var inside_cut := 0.45 if inside else 1.0
	return {
		"rumble": (0.18 + 0.82 * fast) * moving * near * (1.0 if inside else 0.8),
		"clatter": pow(fast, 1.2) * moving * near * (0.7 if inside else 1.0),
		"squeal": clampf(brake, 0.0, 1.0) * slowing * near * inside_cut,
		"rumble_pitch": clampf(0.7 + 0.5 * fast, 0.5, 1.5),
		"clatter_pitch": clampf(v / CLATTER_REF_SPEED, 0.35, 1.8),
		"squeal_pitch": clampf(1.15 - 0.3 * slowing, 0.8, 1.3),
	}


## The crossing's bell: rings while the gates are down or moving (`closed` 0..1, the boom's
## position), loud near the road, gone by BELL_FAR.
static func bell_level(distance: float, closed: float) -> float:
	return reach(distance, BELL_NEAR, BELL_FAR) * (1.0 if closed > 0.001 else 0.0)


## How loud a horn is heard at `distance` m (a horn carries further than the rumble).
static func horn_level(distance: float) -> float:
	return reach(distance, NEAR * 1.6, HORN_FAR)


# --- one-shots -------------------------------------------------------------------------------

## The EMU's horn from a train `distance` m away (0 inside the cab).
func horn(distance: float = 0.0) -> void:
	var g := horn_level(distance)
	if g > 0.01:
		_shot("rail.horn.emu", g * HORN_GAIN, 1.0)
	played["rail_horn"] = int(played["rail_horn"]) + 1


## The chime before a train reaches the platform ("ding-dong-ding").
func announce() -> void:
	_shot("rail.announce", CHIME_GAIN, 1.0)
	played["rail_announce"] = int(played["rail_announce"]) + 1


## A train's doors opening or closing; `chime` first sounds the warning (doors closing).
func door(open: bool, chime: bool = false) -> void:
	if chime:
		_shot("rail.door.chime", CHIME_GAIN, 1.0)
		played["rail_chime"] = int(played["rail_chime"]) + 1
	_shot("rail.door.open" if open else "rail.door.close", DOOR_GAIN, 1.0)
	played["rail_door"] = int(played["rail_door"]) + 1


## A crossing's boom going down (closing) or up, `gain` by distance.
func boom(closing: bool, distance: float = 0.0) -> void:
	var g := reach(distance, BELL_NEAR, BELL_FAR)
	if g > 0.01:
		_shot("crossing.boom", g * BOOM_GAIN, 0.92 if closing else 1.0)
	played["crossing_boom"] = int(played["crossing_boom"]) + 1


func _shot(id: String, gain: float, pitch: float) -> void:
	var s := library.stream(id)
	if s == null:
		return
	var player := _shots[0]
	for p in _shots:
		if not p.playing:
			player = p
			break
	player.stream = s
	player.volume_linear = gain
	player.pitch_scale = pitch
	player.play()


# --- loops ---------------------------------------------------------------------------------------

## The running sound, every frame the player is near a train or in one. `distance` INF stops it.
func set_motion(speed: float, brake: float, inside: bool, distance: float) -> void:
	var m := motion_levels(speed, brake, inside, distance)
	_targets["rumble"] = m["rumble"]
	_targets["clatter"] = m["clatter"]
	_targets["squeal"] = m["squeal"]
	_pitch["rumble"] = m["rumble_pitch"]
	_pitch["clatter"] = m["clatter_pitch"]
	_pitch["squeal"] = m["squeal_pitch"]


## The crossing bell's level 0..1 (from `bell_level`).
func set_bell(level: float) -> void:
	_targets["bell"] = clampf(level, 0.0, 1.0)


## Eases the loops towards their targets; call every frame (`Sound._process`).
func update(dt: float) -> void:
	var k := 1.0 - exp(-dt / SMOOTH)
	for name: String in _levels:
		_levels[name] = float(_levels[name]) + (float(_targets[name]) - float(_levels[name])) * k
	_drive(_rumble, float(_levels["rumble"]) * float(LOOP_GAIN["rumble"]), float(_pitch["rumble"]))
	_drive(_clatter, float(_levels["clatter"]) * float(LOOP_GAIN["clatter"]), float(_pitch["clatter"]))
	_drive(_squeal, float(_levels["squeal"]) * float(LOOP_GAIN["squeal"]), float(_pitch["squeal"]))
	_drive(_bell, float(_levels["bell"]) * float(LOOP_GAIN["bell"]), 1.0)


func level(name: String) -> float:
	return float(_levels.get(name, 0.0))


func stop_all() -> void:
	for name: String in _targets:
		_targets[name] = 0.0
		_levels[name] = 0.0
	for p: AudioStreamPlayer in [_rumble, _clatter, _squeal, _bell]:
		p.stop()


func _drive(player: AudioStreamPlayer, gain: float, pitch: float) -> void:
	if player.stream == null and gain > 0.0005:
		player.stream = library.stream(str(player.get_meta(&"id")))
	if player.stream == null:
		return
	player.pitch_scale = pitch
	player.volume_linear = maxf(gain, 0.00001)
	if gain > 0.0005 and not player.playing:
		player.play()
	elif gain <= 0.0005 and player.playing:
		player.stop()


## Loops playing now, for tests.
func playing() -> PackedStringArray:
	var out := PackedStringArray()
	for p: AudioStreamPlayer in [_rumble, _clatter, _squeal, _bell]:
		if p.playing:
			out.append(str(p.get_meta(&"id")))
	out.sort()
	return out
