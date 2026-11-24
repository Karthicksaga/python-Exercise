class_name EngineBlend
extends RefCounted
## Sample-based engine blending (decision G-83): an engine is a set of recorded (or stand-in)
## loops at a few rpm points, each off-load (coasting) and on-load (pulling). At any rpm the two
## points either side play together, pitch-shifted to the engine's speed (pitch = rpm / point
## rpm) and crossfaded with equal power by where the rpm sits between them; the accelerator
## crossfades off-load into on-load the same way. Pure maths, so it is tested offline, and the
## same numbers drive the players in `EngineVoice`.

## Players are kept to this pitch range: a loop is never stretched further than this.
const MIN_PITCH := 0.5
const MAX_PITCH := 2.5


## Gains and pitches for every point at `rpm` and `throttle` (0..1). `points` as from
## `SoundLibrary.engine_points`: [{rpm, on_load}] sorted by rpm. Returns one {gain, pitch} per point.
static func weights(points: Array[Dictionary], rpm: float, throttle: float) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var rpms := PackedFloat32Array()
	for p in points:
		out.append({"gain": 0.0, "pitch": clampf(rpm / maxf(1.0, float(p["rpm"])), MIN_PITCH, MAX_PITCH)})
		var r: float = p["rpm"]
		if rpms.is_empty() or absf(rpms[rpms.size() - 1] - r) > 0.5:
			rpms.append(r)
	if rpms.is_empty():
		return out
	# Where the rpm sits between the two neighbouring points (clamped at the ends).
	var lo := 0
	var hi := 0
	var x := 0.0
	if rpm <= rpms[0]:
		lo = 0
		hi = 0
	elif rpm >= rpms[rpms.size() - 1]:
		lo = rpms.size() - 1
		hi = lo
	else:
		for i in rpms.size() - 1:
			if rpm >= rpms[i] and rpm <= rpms[i + 1]:
				lo = i
				hi = i + 1
				x = (rpm - rpms[i]) / (rpms[i + 1] - rpms[i])
				break
	var t := clampf(throttle, 0.0, 1.0)
	for i in points.size():
		var p := points[i]
		var r: float = p["rpm"]
		var g := 0.0
		if absf(r - rpms[lo]) < 0.5:
			g = cos(x * PI * 0.5)
		elif absf(r - rpms[hi]) < 0.5:
			g = sin(x * PI * 0.5)
		if g == 0.0:
			continue
		g *= _load_gain(points, r, bool(p["on_load"]), t)
		out[i]["gain"] = g
	return out


## Off-load fades into on-load with the accelerator; a point with only one load plays fully.
static func _load_gain(points: Array[Dictionary], rpm: float, on_load: bool, t: float) -> float:
	var has_other := false
	for p in points:
		if absf(float(p["rpm"]) - rpm) < 0.5 and bool(p["on_load"]) != on_load:
			has_other = true
	if not has_other:
		return 1.0
	return sin(t * PI * 0.5) if on_load else cos(t * PI * 0.5)


## Offline render of the blend as the game plays it, for tests and previews: `loops` are the
## points' float samples, `rpm_at` and `throttle_at` give the engine state at a time (s). Gains
## and pitches are updated every `block` samples and ramped across it, as the mixer does with
## player volumes; each loop is read with linear interpolation at its pitch.
static func render(points: Array[Dictionary], loops: Array[PackedFloat32Array], rpm_at: Callable, throttle_at: Callable, seconds: float, rate: int = Synth.RATE, block: int = 256) -> PackedFloat32Array:
	var n := roundi(seconds * rate)
	var out := PackedFloat32Array()
	out.resize(n)
	var positions := PackedFloat64Array()
	positions.resize(points.size())
	var prev_gain := PackedFloat32Array()
	prev_gain.resize(points.size())
	var first := true
	var start := 0
	while start < n:
		var now := float(start) / rate
		var w := weights(points, float(rpm_at.call(now)), float(throttle_at.call(now)))
		var count := mini(block, n - start)
		for k in points.size():
			var loop := loops[k]
			var size := loop.size()
			var g0 := float(w[k]["gain"]) if first else prev_gain[k]
			var g1: float = w[k]["gain"]
			var pitch: float = w[k]["pitch"]
			var pos := positions[k]
			if size > 1 and (g0 > 0.0 or g1 > 0.0):
				for i in count:
					var j := int(pos)
					var f := pos - j
					var a := loop[j % size]
					var b := loop[(j + 1) % size]
					out[start + i] += (a + (b - a) * f) * lerpf(g0, g1, float(i) / count)
					pos += pitch
				pos = fmod(pos, size)
			elif size > 1:
				pos = fmod(pos + pitch * count, size)
			positions[k] = pos
			prev_gain[k] = g1
		first = false
		start += count
	return out
