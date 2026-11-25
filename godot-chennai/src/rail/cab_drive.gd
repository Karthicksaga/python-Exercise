class_name CabDrive
extends RefCounted
## Driving a suburban train from its cab (G-326): a port of the owner's prototype (the "train"
## artifact, `index.html`: lever notches EMG, B3..B1, OFF, P1..P4, the effort that follows the
## lever, the doors interlock, speed limits, starter signals and stop-mark scoring), run on a real
## `RailLine` instead of the prototype's made-up route. Pure logic: the view and HUD read it.
##
## Distances are along the line; `s` is the middle of the train (as the timetable's trains), and
## the stop mark of a station is where the middle stands at the platform's centre. The prototype's
## figures are kept: effort ramps at 2.2/s up and 1.6/s down, power fades towards 29 m/s, rolling
## and air resistance 0.02 + 0.00045 v², a 9 s stop with the doors open.

signal scored(points: int, why: String)
signal message(text: String)
signal doors_changed(open: bool)
signal finished(score: int)

## The lever's notches, lowest first (index 4 is OFF): acceleration asked for, m/s².
const NOTCHES: Array[String] = ["EMG", "B3", "B2", "B1", "OFF", "P1", "P2", "P3", "P4"]
const NOTCH_ACCEL: Array[float] = [-1.3, -0.95, -0.6, -0.3, 0.0, 0.28, 0.5, 0.7, 0.9]
const OFF := 4
const EMERGENCY := 0
## Seconds the doors stay open at a stop (prototype).
const DOOR_DWELL := 9.0
## The starter signal stands this far beyond the stop mark (prototype: mark + 6).
const SIGNAL_AHEAD := 6.0
## A train ahead within this distance of a signal makes it red, within the next stretch yellow.
const RED_BLOCK := 400.0
const YELLOW_BLOCK := 900.0
## The line's end on the map: the run finishes this far past the last stop.
const END_MARGIN := 150.0

var line: RailLine
## Metres along the line (the train's middle) and speed, m/s.
var s: float = 0.0
var v: float = 0.0
## Lever notch index (0 EMG … 4 OFF … 8 P4) and the effort that follows it, m/s².
var notch: int = OFF
var effort: float = 0.0
## Index of the next stop to serve, or line.stops.size() after the last.
var next: int = 0
var served: Dictionary[int, bool] = {}
var score: int = 0
var stops_made: int = 0
## Doors open (standing at a stop) and seconds left before they close.
var doors_open: bool = false
var dwell: float = 0.0
var time: float = 0.0
var done: bool = false
var horn: bool = false
## Other trains on the line ahead (metres along it, their middles), set by the game each step.
var ahead: PackedFloat64Array = PackedFloat64Array()

var _overspeed: float = 0.0
var _standing: float = 0.0
## Signals already passed at danger (by stop index), so each costs once.
var _spad: Dictionary[int, bool] = {}


## A driver at `start_s` on `line`, standing; stops behind `start_s` count as served.
func _init(on_line: RailLine, start_s: float, start_speed: float = 0.0) -> void:
	line = on_line
	s = start_s
	v = start_speed
	next = line.stops.size()
	for i in line.stops.size():
		if line.stops[i].s > s + 3.0:
			next = i
			break
		served[i] = true


func notch_name() -> String:
	return NOTCHES[notch]


func set_notch(i: int) -> void:
	notch = clampi(i, 0, NOTCHES.size() - 1)


func notch_up() -> void:
	set_notch(notch + 1)


func notch_down() -> void:
	set_notch(notch - 1)


func emergency() -> void:
	set_notch(EMERGENCY)


func kmh() -> float:
	return v * 3.6


## The speed limit here, km/h (prototype: 40 within 260 m of a stop mark, 60 within 520, else 80;
## estimated, not the line's real limits).
func limit_at(at: float) -> float:
	var d := INF
	for stop in line.stops:
		d = minf(d, absf(at - stop.s))
	if d < 260.0:
		return 40.0
	if d < 520.0:
		return 60.0
	return 80.0


func limit() -> float:
	return limit_at(s)


## Metres from the train's middle to the next stop's mark (negative: past it), or INF.
func to_mark() -> float:
	if next >= line.stops.size():
		return INF
	return line.stops[next].s - s


## The starter signal ahead of `stop`: &"red", &"yellow" or &"green".
func aspect(stop: int) -> StringName:
	var at := line.stops[stop].s + SIGNAL_AHEAD
	# Red while this train stands at the station with its doors open (prototype), or a train ahead in the next block.
	if doors_open and absf(s - line.stops[stop].s) < 45.0:
		return &"red"
	for other in ahead:
		if other > at and other - at < RED_BLOCK:
			return &"red"
	for other in ahead:
		if other > at and other - at < YELLOW_BLOCK:
			return &"yellow"
	if next == stop and stop > 0 and at - s < 600.0 and at > s:
		return &"yellow"
	return &"green"


## The next signal's index (the starter of the next stop not yet passed), or -1.
func next_signal() -> int:
	for i in line.stops.size():
		if line.stops[i].s + SIGNAL_AHEAD > s - 5.0:
			return i
	return -1


## One step of `dt` seconds.
func step(dt: float) -> void:
	if done:
		return
	time += dt
	var target := NOTCH_ACCEL[notch]
	var rate := 1.6 if target < 0.0 else 2.2
	effort += clampf(target - effort, -rate * dt, rate * dt)
	var a := effort * (1.0 - clampf(v / 29.0, 0.0, 1.0) * 0.92) if effort > 0.0 else effort
	# Interlock: no power with the doors open.
	if doors_open and dwell > 0.0 and a > 0.0:
		a = 0.0
	if v > 0.01:
		a -= 0.02 + 0.00045 * v * v
	var v0 := v
	v = maxf(0.0, v + a * dt)
	var before := s
	s += (v0 + v) / 2.0 * dt
	var lim := limit()
	if kmh() > lim + 3.0:
		_overspeed += dt
		if _overspeed > 2.5:
			_add(-10, "Over the speed limit")
			_overspeed = 0.0
	else:
		_overspeed = maxf(0.0, _overspeed - dt)
	_stations(dt)
	_signals(before)
	if next >= line.stops.size() and not doors_open and s > line.stops[line.stops.size() - 1].s + END_MARGIN:
		_finish()
	elif s >= line.path.length() - 1.0:
		_finish()


func _stations(dt: float) -> void:
	if next < line.stops.size():
		var stop := line.stops[next]
		var err := s - stop.s
		if v < 0.2 and absf(err) < 45.0 and not doors_open and not served.has(next):
			_standing += dt
			if _standing > 0.6:
				var e := absf(err)
				var points := 0
				var why := ""
				if err > 25.0:
					points = -40
					why = "Overran the platform"
				elif e <= 3.0:
					points = 100
					why = "Perfect stop"
				elif e <= 8.0:
					points = 60
					why = "Good stop"
				elif e <= 20.0:
					points = 25
					why = "Stopped short of the mark"
				else:
					why = "Stopped far from the mark"
				_add(points, "%s (%s%.1f m)" % [why, "+" if err >= 0.0 else "", err])
				served[next] = true
				stops_made += 1
				doors_open = true
				dwell = DOOR_DWELL
				doors_changed.emit(true)
				_standing = 0.0
		else:
			_standing = 0.0
		if s > stop.s + 70.0 and not served.has(next):
			_add(-60, "Missed the stop at %s" % stop.name)
			served[next] = true
			next += 1
	if doors_open:
		dwell -= dt
		if dwell <= 0.0:
			doors_open = false
			doors_changed.emit(false)
			next += 1
			message.emit("Doors closed. Signal green. Proceed." if next >= line.stops.size() or aspect(next - 1) == &"green" else "Doors closed. Wait for the signal.")
		elif v > 0.5:
			_add(-30, "Moved with doors open")
			doors_open = false
			doors_changed.emit(false)
			next += 1


## Passing a starter signal at danger costs once per signal.
func _signals(before: float) -> void:
	for i in line.stops.size():
		var at := line.stops[i].s + SIGNAL_AHEAD
		if before < at and s >= at and v > 1.0 and not _spad.has(i):
			var red := false
			for other in ahead:
				if other > at and other - at < RED_BLOCK:
					red = true
			if red:
				_spad[i] = true
				_add(-80, "Signal passed at danger")


func _add(points: int, why: String) -> void:
	score += points
	scored.emit(points, why)


func _finish() -> void:
	done = true
	v = 0.0
	finished.emit(score)
	message.emit("End of the line on the map. Score %d." % score)


## What the panel shows: next station, distance to its mark, the state in words.
func state_text() -> String:
	if done:
		return "End of the line. Score %d" % score
	if doors_open:
		return "Doors open. Passengers getting on and off."
	if v < 0.2:
		return "Standing. Raise the lever to move off."
	var a := NOTCH_ACCEL[notch]
	if a < 0.0:
		return "Braking %s" % notch_name()
	if a > 0.0:
		return "Power %s" % notch_name()
	return "Coasting"
