class_name EngineVoice
extends Node3D
## One running engine played from its loops (decision G-83): a player per rpm/load point, the
## gains and pitches from `EngineBlend`, a slow lope at idle for singles, a dip and clunk at each
## gear change, and start/stop one-shots. The player's own vehicle is heard flat (non-positional);
## traffic voices are `AudioStreamPlayer3D`s at the vehicle, panned by the camera and dulled with
## distance by Godot's attenuation filter.
##
## Players only run while their gain is above zero (a phone mixes what plays, silent or not).

## Emitted when the gearbox changes up or down while moving (HUD and tests).
signal gear_changed(gear: int)

const SMOOTH_RPM := 0.05
const SILENT := 0.0005
## Traffic voices: heard within this many metres; full level within NEAR.
const FAR := 45.0
const NEAR := 5.0

var kind: String = "car"
var positional: bool = false
var rpm: float = 0.0
var gear: int = 1
var throttle: float = 0.0
## 0 while starting, 1 running, fading to 0 when stopped.
var running: float = 0.0
var stopped: bool = false

var _profile: Dictionary = {}
var _library: SoundLibrary
var _points: Array[Dictionary] = []
var _players: Array[Node] = []
var _time: float = 0.0
var _dip: float = 0.0
var _start_delay: float = 0.0
var _level: float = 1.0
var _bus: StringName = &"Vehicles"
var _one_shot: Node = null


## kind: a sound kind (`SoundProfiles.KINDS`). start_sound: play the starter first (the player's
## own vehicle when it is switched on); traffic is already running.
func setup(library: SoundLibrary, engine_kind: String, is_positional: bool, start_sound: bool, bus: StringName = &"Vehicles") -> void:
	_library = library
	kind = SoundProfiles.sound_kind(engine_kind)
	positional = is_positional
	_bus = bus
	_profile = SoundProfiles.engine(kind)
	rpm = _profile["idle_rpm"]
	_points = library.engine_points(kind)
	for p in _points:
		var player := _make_player()
		var s := library.stream(str(p["id"]))
		_set_stream(player, s)
		add_child(player)
		_players.append(player)
	_one_shot = _make_player()
	add_child(_one_shot)
	if start_sound and library.has("engine.%s.start" % kind):
		_play_one_shot("engine.%s.start" % kind, 1.0)
		_start_delay = 0.38
	else:
		running = 1.0


func _make_player() -> Node:
	if positional:
		var p3 := AudioStreamPlayer3D.new()
		p3.bus = _bus
		p3.unit_size = NEAR
		p3.max_distance = FAR
		p3.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p3.attenuation_filter_cutoff_hz = 6000.0
		p3.attenuation_filter_db = -18.0
		p3.panning_strength = 0.85
		return p3
	var p := AudioStreamPlayer.new()
	p.bus = _bus
	return p


static func _set_stream(player: Node, s: AudioStream) -> void:
	if player is AudioStreamPlayer3D:
		(player as AudioStreamPlayer3D).stream = s
	elif player is AudioStreamPlayer:
		(player as AudioStreamPlayer).stream = s


func _play_one_shot(id: String, gain: float) -> void:
	var s := _library.stream(id)
	if s == null:
		return
	_set_stream(_one_shot, s)
	if _one_shot is AudioStreamPlayer3D:
		var p3 := _one_shot as AudioStreamPlayer3D
		p3.volume_linear = gain * _level
		p3.play()
	else:
		var p := _one_shot as AudioStreamPlayer
		p.volume_linear = gain * _level
		p.play()


## Follow the vehicle: revs from speed and accelerator (`SoundProfiles.engine_rpm`). level 0..1
## (traffic plays quieter and fades at the edge of hearing).
func drive(dt: float, speed: float, accelerator: float, level: float = 1.0) -> void:
	_time += dt
	throttle = clampf(accelerator, 0.0, 1.0)
	_level = level
	var target := SoundProfiles.engine_rpm(_profile, speed, throttle)
	rpm += (target - rpm) * (1.0 - exp(-dt / SMOOTH_RPM))
	var g := SoundProfiles.gear_for(_profile, speed) if absf(speed) >= 0.4 else 1
	if g != gear:
		if absf(speed) >= 0.4 and gear != 0:
			_dip = 1.0
			if not positional:
				_play_one_shot("vehicle.gear", 0.8)
			gear_changed.emit(g)
		gear = g
	_dip = maxf(0.0, _dip - dt / 0.15)
	if stopped:
		running = maxf(0.0, running - dt / 0.12)
	elif _start_delay > 0.0:
		_start_delay -= dt
	else:
		running = minf(1.0, running + dt / 0.15)
	_mix()


## Switch the engine off: the stop one-shot plays and the loops fade; free the node after `done()`.
func stop(play_sound: bool) -> void:
	if stopped:
		return
	stopped = true
	if play_sound and _library.has("engine.%s.stop" % kind):
		_play_one_shot("engine.%s.stop" % kind, 1.0)


## True once a stopped voice has faded and its one-shot finished.
func done() -> bool:
	if not stopped or running > 0.0:
		return false
	if _one_shot is AudioStreamPlayer3D:
		return not (_one_shot as AudioStreamPlayer3D).playing
	return not (_one_shot as AudioStreamPlayer).playing


## How loud the engine is overall (profile volume, throttle and revs, as `voices.ts`), scaled so
## the stand-ins and normalised recordings sit at the same level in the Vehicles bus.
func loudness() -> float:
	var idle: float = _profile["idle_rpm"]
	var rev := clampf((rpm - idle) / (float(_profile["shift_rpm"]) - idle), 0.0, 1.0)
	return float(_profile["volume"]) * (1.0 - 0.5 * _dip) * running * _level * (0.75 + 0.25 * rev)


## Gains of every point now (tests and the debug snapshot).
func gains() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	for w in EngineBlend.weights(_points, rpm, throttle):
		out.append(float(w["gain"]))
	return out


func playing_players() -> int:
	var n := 0
	for p in _players:
		if (p is AudioStreamPlayer3D and (p as AudioStreamPlayer3D).playing) or (p is AudioStreamPlayer and (p as AudioStreamPlayer).playing):
			n += 1
	return n


func _mix() -> void:
	var idle: float = _profile["idle_rpm"]
	var rev := clampf((rpm - idle) / (float(_profile["shift_rpm"]) - idle), 0.0, 1.0)
	var lope := 1.0 + 0.07 * float(_profile["lope"]) * (1.0 - rev) * sin(TAU * 3.1 * _time)
	var weights := EngineBlend.weights(_points, rpm * lope, throttle)
	var loud := loudness()
	for i in _players.size():
		var gain := float(weights[i]["gain"]) * loud
		_apply(_players[i], gain, float(weights[i]["pitch"]))


static func _apply(player: Node, gain: float, pitch: float) -> void:
	if player is AudioStreamPlayer3D:
		var p3 := player as AudioStreamPlayer3D
		p3.pitch_scale = pitch
		p3.volume_linear = maxf(gain, 0.00001)
		if gain > SILENT and not p3.playing and p3.stream != null:
			p3.play(randf() * maxf(0.0, p3.stream.get_length() - 0.05))
		elif gain <= SILENT and p3.playing:
			p3.stop()
	elif player is AudioStreamPlayer:
		var p := player as AudioStreamPlayer
		p.pitch_scale = pitch
		p.volume_linear = maxf(gain, 0.00001)
		if gain > SILENT and not p.playing and p.stream != null:
			p.play(randf() * maxf(0.0, p.stream.get_length() - 0.05))
		elif gain <= SILENT and p.playing:
			p.stop()
