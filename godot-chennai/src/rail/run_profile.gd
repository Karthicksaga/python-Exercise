class_name RunProfile
extends RefCounted
## How a train runs along a line (port of `packages/rail/src/motion.ts`): it enters at line speed
## (or starts from a terminus), brakes to a stop at each station, waits, accelerates away, and
## leaves at the far end. The whole run is worked out once per line as phases of constant
## acceleration, so a train's state at any time is a lookup: trains are a function of the
## railway clock.
##
## The figures are estimates for an EMU of this kind, not measured: about 0.8 m/s² away from a
## stop, 0.9 m/s² braking, 80 km/h top speed on these short hops, 30 s at each station.
##
## Godot addition (G-322): `start_standing` / `end_standing` for a terminus on the map (Chennai
## Central): the run begins (ends) standing at the first (last) stop for `terminus_dwell` seconds,
## instead of entering at line speed from the buffers. Both false is motion.ts exactly.


class MotionSpec:
	extends RefCounted
	## m/s².
	var accel: float = 0.8
	## m/s², positive.
	var brake: float = 0.9
	## m/s.
	var top_speed: float = 22.0
	## Seconds at each station.
	var dwell: float = 30.0
	## Seconds at a terminus on the map (Godot addition).
	var terminus_dwell: float = 120.0

	static func make(a: float, b: float, top: float, d: float, terminus: float = 120.0) -> MotionSpec:
		var m := MotionSpec.new()
		m.accel = a
		m.brake = b
		m.top_speed = top
		m.dwell = d
		m.terminus_dwell = terminus
		return m

	## From the rail file's `motion` object, or the EMU's figures when there is none.
	static func from_data(data: Variant) -> MotionSpec:
		if not data is Dictionary:
			return emu()
		var d: Dictionary = data
		return make(float(d.get("accel", 0.8)), float(d.get("brake", 0.9)), float(d.get("topSpeed", 22.0)), float(d.get("dwell", 30.0)), float(d.get("terminusDwell", 120.0)))

	static func emu() -> MotionSpec:
		return make(0.8, 0.9, 22.0, 30.0)


## A stretch of constant acceleration (a = 0 and v0 = 0 for a stop).
class Phase:
	extends RefCounted
	var t0: float = 0.0
	var duration: float = 0.0
	var s0: float = 0.0
	var v0: float = 0.0
	var a: float = 0.0
	## Index (in the stop list) of the station the train stands at, during a stop; -1 otherwise.
	var stop: int = -1


class TrainState:
	extends RefCounted
	## Metres along the line.
	var s: float = 0.0
	## m/s.
	var speed: float = 0.0
	## Index of the stop the train is standing at, or -1 while moving.
	var stopped_at: int = -1
	## Seconds before it leaves the stop (0 while moving).
	var dwell_left: float = 0.0
	## Seconds this stop lasts in all (the dwell, or the terminus dwell); 0 while moving.
	var dwell_total: float = 0.0
	## Index of the next stop ahead (the one it stands at counts as passed), or -1 after the last.
	var next_stop: int = -1


var phases: Array[Phase] = []
## Seconds from entering (or leaving the first terminus) to leaving the line.
var duration: float = 0.0
## When the train arrives at each stop, seconds into the run.
var arrivals: PackedFloat64Array = PackedFloat64Array()
var length: float
var stops: PackedFloat64Array
var spec: MotionSpec

var _t: float = 0.0
var _s: float = 0.0
var _v: float = 0.0


## `line_length` metres; `stop_list` distances of the stops along the line, ascending.
func _init(line_length: float, stop_list: PackedFloat64Array, motion: MotionSpec = null, start_standing: bool = false, end_standing: bool = false) -> void:
	length = line_length
	stops = stop_list
	spec = motion if motion != null else MotionSpec.emu()
	_t = 0.0
	_s = stops[0] if start_standing and not stops.is_empty() else 0.0
	# Trains enter from beyond the map at line speed, unless the line starts at a stop.
	_v = 0.0 if (not stops.is_empty() and stops[0] < 1.0) or start_standing else spec.top_speed
	var last := stops.size() - 1
	for index in stops.size():
		var target := stops[index]
		var distance := target - _s
		if distance > 0.01:
			_run_to(distance, _v, true)
		# Snap away rounding so each stop is exact.
		_s = target
		_v = 0.0
		arrivals.append(_t)
		var terminus := (index == 0 and start_standing) or (index == last and end_standing)
		_push(spec.terminus_dwell if terminus else spec.dwell, 0.0, index)
	if not end_standing and length - _s > 0.01:
		_run_to(length - _s, _v, false)
	duration = _t


func _push(span: float, a: float, stop: int = -1) -> void:
	if span <= 0.0:
		return
	var p := Phase.new()
	p.t0 = _t
	p.duration = span
	p.s0 = _s
	p.v0 = 0.0 if stop >= 0 else _v
	p.a = 0.0 if stop >= 0 else a
	p.stop = stop
	phases.append(p)
	_s += _v * span + 0.5 * a * span * span
	_v += a * span
	_t += span


## Phases covering `distance` from speed `v0`, ending stopped (`stop`) or at whatever speed is reached.
func _run_to(distance: float, v0: float, stop: bool) -> void:
	var a := spec.accel
	var b := spec.brake
	var top := spec.top_speed
	if not stop:
		# Accelerate to top speed, then hold it to the end.
		var to_top := maxf(0.0, (top * top - v0 * v0) / (2.0 * a))
		if to_top >= distance:
			var v1 := sqrt(v0 * v0 + 2.0 * a * distance)
			_push((v1 - v0) / a, a)
		else:
			_push((top - v0) / a, a)
			_push((distance - to_top) / top, 0.0)
		return
	# Highest speed reachable when accelerating then braking to a stop within the distance.
	var peak := sqrt((distance + (v0 * v0) / (2.0 * a)) / (1.0 / (2.0 * a) + 1.0 / (2.0 * b)))
	if peak < v0:
		# Too close to stop at the normal rate: brake harder, all the way.
		var hard := (v0 * v0) / (2.0 * distance)
		_push(v0 / hard, -hard)
		return
	peak = minf(peak, top)
	var up := (peak * peak - v0 * v0) / (2.0 * a)
	var down := (peak * peak) / (2.0 * b)
	_push((peak - v0) / a, a)
	_push((distance - up - down) / peak, 0.0)
	_push(peak / b, -b)


## Only the distance along the line `t` seconds into the run (no allocation: the per-frame
## "is this train near the player" check, G-461).
func s_at(t: float) -> float:
	if phases.is_empty():
		return 0.0
	var clamped := clampf(t, 0.0, duration)
	var lo := 0
	var hi := phases.size() - 1
	while lo < hi:
		var mid := (lo + hi) >> 1
		var p: Phase = phases[mid]
		if clamped < p.t0 + p.duration:
			hi = mid
		else:
			lo = mid + 1
	var phase: Phase = phases[lo]
	var tau := clampf(clamped - phase.t0, 0.0, phase.duration)
	return minf(length, phase.s0 + phase.v0 * tau + 0.5 * phase.a * tau * tau)


## Where the train is `t` seconds into its run (clamped to the run).
func state(t: float) -> TrainState:
	var clamped := clampf(t, 0.0, duration)
	var out := TrainState.new()
	if phases.is_empty():
		out.next_stop = 0 if not stops.is_empty() else -1
		return out
	var phase: Phase = phases[phases.size() - 1]
	# Binary search: phases are in time order.
	var lo := 0
	var hi := phases.size() - 1
	while lo < hi:
		var mid := (lo + hi) >> 1
		var p: Phase = phases[mid]
		if clamped < p.t0 + p.duration:
			hi = mid
		else:
			lo = mid + 1
	var found: Phase = phases[lo]
	if clamped < found.t0 + found.duration:
		phase = found
	var tau := minf(phase.duration, clamped - phase.t0)
	out.s = minf(length, phase.s0 + phase.v0 * tau + 0.5 * phase.a * tau * tau)
	out.speed = maxf(0.0, phase.v0 + phase.a * tau)
	if phase.stop >= 0:
		out.speed = 0.0
		out.stopped_at = phase.stop
		out.dwell_left = phase.duration - tau
		out.dwell_total = phase.duration
		out.next_stop = phase.stop + 1 if phase.stop + 1 < stops.size() else -1
		return out
	out.next_stop = -1
	for i in stops.size():
		if stops[i] > out.s + 0.5:
			out.next_stop = i
			break
	return out
