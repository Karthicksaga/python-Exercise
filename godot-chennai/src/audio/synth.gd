class_name Synth
extends RefCounted
## Offline synthesis of the stand-in sounds (decision G-81): the same recipes as the Three.js
## game's Web Audio graphs (`voices.ts`), rendered sample by sample into mono float buffers.
## Nothing here runs while the game plays: `tools/audio/render_standins.gd` writes the buffers to
## `assets/audio/standin/` and the game plays those files like recordings (G-80). Tests call the
## same renderers to measure the designs (fundamentals, horn notes, the auto's double tap).
##
## Deterministic: every renderer takes a seed, so the files are the same on every run.

const RATE := 22050


## A biquad filter (RBJ cookbook), direct form I. type: "lowpass", "highpass", "bandpass".
class Biquad:
	var b0: float = 1.0
	var b1: float = 0.0
	var b2: float = 0.0
	var a1: float = 0.0
	var a2: float = 0.0
	var x1: float = 0.0
	var x2: float = 0.0
	var y1: float = 0.0
	var y2: float = 0.0

	func _init(type: String, hz: float, q: float, rate: float = RATE) -> void:
		set_params(type, hz, q, rate)

	func set_params(type: String, hz: float, q: float, rate: float = RATE) -> void:
		var w := TAU * clampf(hz, 10.0, rate * 0.49) / rate
		var alpha := sin(w) / (2.0 * maxf(0.05, q))
		var c := cos(w)
		var a0 := 1.0 + alpha
		match type:
			"lowpass":
				b0 = (1.0 - c) / 2.0
				b1 = 1.0 - c
				b2 = (1.0 - c) / 2.0
			"highpass":
				b0 = (1.0 + c) / 2.0
				b1 = -(1.0 + c)
				b2 = (1.0 + c) / 2.0
			_:
				# Band-pass with 0 dB peak gain (Web Audio's "bandpass").
				b0 = alpha
				b1 = 0.0
				b2 = -alpha
		a1 = -2.0 * c / a0
		a2 = (1.0 - alpha) / a0
		b0 /= a0
		b1 /= a0
		b2 /= a0

	func run(x: float) -> float:
		var y := b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
		x2 = x1
		x1 = x
		y2 = y1
		y1 = y
		return y


## PolyBLEP correction for a band-limited saw or square (t phase 0..1, dt phase step).
static func _blep(t: float, dt: float) -> float:
	if t < dt:
		var u := t / dt
		return u + u - u * u - 1.0
	if t > 1.0 - dt:
		var v := (t - 1.0) / dt
		return v * v + v + v + 1.0
	return 0.0


## One sample of a band-limited oscillator. wave: "saw", "square", "triangle" (naive), "sine".
static func osc(wave: String, phase: float, dt: float) -> float:
	match wave:
		"saw":
			# Web Audio's sawtooth: in phase with a sine of the same note (its fundamental is
			# +sin), so the engines' sub tone adds to the note instead of cancelling it.
			var q := fposmod(phase + 0.5, 1.0)
			return 2.0 * q - 1.0 - _blep(q, dt)
		"square":
			var s := 1.0 if phase < 0.5 else -1.0
			return s + _blep(phase, dt) - _blep(fposmod(phase + 0.5, 1.0), dt)
		"triangle":
			return 4.0 * absf(phase - 0.5) - 1.0
	return sin(TAU * phase)


## Makes a loop of `length` samples from a render of at least length + fade samples: the first
## `fade` samples are crossfaded (equal power) with what follows the end, so the wrap is seamless.
static func make_loop(render: PackedFloat32Array, length: int, fade: int) -> PackedFloat32Array:
	var out := render.slice(0, length)
	var f := mini(fade, render.size() - length)
	for i in f:
		var t := float(i) / f
		out[i] = render[i] * sin(t * PI * 0.5) + render[length + i] * cos(t * PI * 0.5)
	return out


## An engine loop at `rpm` with the accelerator at `throttle`: a whole number of firing periods, so
## it repeats on the beat and pitch-shifting keeps the putts in time. Returns {samples, rpm} where
## rpm is the exact speed the loop runs at (the period is rounded to whole samples).
static func engine_loop(kind: String, rpm: float, throttle: float, seed: int = 1, seconds: float = 0.6) -> Dictionary:
	var p := SoundProfiles.engine(kind)
	var hz := SoundProfiles.firing_hz(p, rpm)
	var periods := maxi(2, roundi(seconds * hz))
	var length := roundi(periods * RATE / hz)
	hz = periods * float(RATE) / length
	var exact_rpm := rpm * hz / SoundProfiles.firing_hz(p, rpm)
	var fade := mini(length / 4, roundi(RATE * 0.03))
	var warm := roundi(RATE * 0.25)
	var total := warm + length + fade
	var idle: float = p["idle_rpm"]
	var rev := clampf((exact_rpm - idle) / (float(p["shift_rpm"]) - idle), 0.0, 1.0)
	var t := clampf(throttle, 0.0, 1.0)
	var cut: Array = p["cutoff"]
	var c0: float = cut[0]
	var c1: float = cut[1]
	var tone := Biquad.new("lowpass", c0 + (c1 - c0) * (0.35 * rev + 0.65 * t * (0.4 + 0.6 * rev)), 0.707)
	var exhaust := Biquad.new("bandpass", p["exhaust_hz"], p["exhaust_q"])
	var rough_band := Biquad.new("bandpass", p["rough_hz"], 1.1)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var wave: String = p["wave"]
	var sub: float = p["sub"]
	var rough := float(p["roughness"]) * (0.5 + 0.5 * t) * 0.5
	var turbo_gain := float(p["turbo"]) * t * rev * 0.012
	var turbo_hz := 1800.0 + rev * 2600.0
	var level := 0.05 + 0.055 * t + 0.035 * rev
	var dt := hz / RATE
	var phase := 0.0
	var tphase := 0.0
	var out := PackedFloat32Array()
	out.resize(total)
	for i in total:
		var fire := osc(wave, phase, dt) * 0.5
		var body := tone.run(fire + sub * sin(TAU * phase))
		var ex := exhaust.run(fire) * 0.9
		var chop := rough + rough * (1.0 if phase < 0.5 else -1.0)
		var noise := rough_band.run(rng.randf() * 2.0 - 1.0) * chop
		var whistle := sin(TAU * tphase) * turbo_gain
		out[i] = level * (body + ex + noise) + whistle
		phase += dt
		if phase >= 1.0:
			phase -= 1.0
		tphase = fposmod(tphase + turbo_hz / RATE, 1.0)
	return {"samples": make_loop(out.slice(warm), length, fade), "rpm": exact_rpm}


## The engine starting: the starter's whine, a few slow catches, the revs flaring then settling.
static func engine_start(kind: String, seed: int = 2) -> PackedFloat32Array:
	var p := SoundProfiles.engine(kind)
	var idle: float = p["idle_rpm"]
	var length := roundi(RATE * 0.9)
	var out := PackedFloat32Array()
	out.resize(length)
	var tone := Biquad.new("lowpass", (p["cutoff"] as Array)[0], 0.707)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var phase := 0.0
	var starter := 0.0
	var wave: String = p["wave"]
	for i in length:
		var s := float(i) / RATE
		# Cranking at ~250 rpm for 0.35 s, then the engine catches and flares to 1.5 × idle.
		var rpm := 250.0 if s < 0.35 else idle * (1.0 + 0.5 * exp(-(s - 0.45) * (s - 0.45) * 40.0))
		var hz := SoundProfiles.firing_hz(p, rpm)
		var running := smoothstep(0.3, 0.42, s)
		var crank := (1.0 - running) * 0.04 * osc("square", starter, 160.0 / RATE) * (0.6 + 0.4 * sin(TAU * phase))
		var engine := running * 0.11 * tone.run(osc(wave, phase, hz / RATE) + 0.2 * (rng.randf() - 0.5))
		var tail := 1.0 - smoothstep(0.75, 0.9, s)
		out[i] = (crank + engine) * tail
		phase = fposmod(phase + hz / RATE, 1.0)
		starter = fposmod(starter + 160.0 / RATE, 1.0)
	return out


## The engine switched off: revs falling away to nothing over half a second.
static func engine_stop(kind: String) -> PackedFloat32Array:
	var p := SoundProfiles.engine(kind)
	var idle: float = p["idle_rpm"]
	var length := roundi(RATE * 0.6)
	var out := PackedFloat32Array()
	out.resize(length)
	var tone := Biquad.new("lowpass", (p["cutoff"] as Array)[0], 0.707)
	var phase := 0.0
	var wave: String = p["wave"]
	for i in length:
		var s := float(i) / RATE
		var share := maxf(0.0, 1.0 - s / 0.55)
		var hz := SoundProfiles.firing_hz(p, idle * (0.3 + 0.7 * share))
		out[i] = 0.1 * share * share * tone.run(osc(wave, phase, hz / RATE))
		phase = fposmod(phase + hz / RATE, 1.0)
	return out


## A vehicle's horn (HORNS): notes through a band-pass colour with the dry note under it, an air
## horn's swell and pitch scoop, or a cheap horn's diaphragm buzz.
static func horn(kind: String, seconds: float = 1.2) -> PackedFloat32Array:
	var h: Dictionary = SoundProfiles.HORNS.get(SoundProfiles.sound_kind(kind), SoundProfiles.HORNS["car"])
	var notes: Array = h["notes"]
	var end := 0.0
	for n: Array in notes:
		end = maxf(end, float(n[1]) + float(n[2]))
	var length := roundi(RATE * minf(seconds, end + 0.05))
	var colour := Biquad.new("bandpass", h["colour_hz"], h["colour_q"])
	var wave: String = h["wave"]
	var attack: float = h["attack"]
	var scoop: float = h["scoop"]
	var buzz: float = h["buzz"]
	var volume: float = h["volume"]
	var phases := PackedFloat32Array()
	phases.resize(notes.size())
	var out := PackedFloat32Array()
	out.resize(length)
	for i in length:
		var s := float(i) / RATE
		var dry := 0.0
		for k in notes.size():
			var n: Array = notes[k]
			var start: float = n[1]
			var stop: float = start + float(n[2])
			if s < start or s > stop:
				continue
			var local := s - start
			var glide := clampf(local / maxf(0.02, attack * 2.0), 0.0, 1.0)
			var hz: float = float(n[0]) * lerpf(scoop, 1.0, glide)
			var env := clampf(local / attack, 0.0, 1.0) * clampf((stop - s) / 0.04, 0.0, 1.0)
			if buzz > 0.0:
				env *= 0.65 + 0.35 * (1.0 if fposmod(local * buzz, 1.0) < 0.5 else -1.0)
			dry += osc(wave, phases[k], hz / RATE) * env * volume
			phases[k] = fposmod(phases[k] + hz / RATE, 1.0)
		out[i] = colour.run(dry) + 0.35 * dry
	return out


## A noise hit: band-limited noise with a 5 ms attack and an exponential fall over `length` s.
static func _hit(out: PackedFloat32Array, rng: RandomNumberGenerator, type: String, hz: float, q: float, volume: float, length: float, offset: float = 0.0) -> void:
	var f := Biquad.new(type, hz, q)
	var start := roundi(offset * RATE)
	var n := mini(out.size() - start, roundi((length + 0.02) * RATE))
	for i in n:
		var s := float(i) / RATE
		var env := minf(1.0, s / 0.005) * exp(-s / maxf(0.001, length) * 6.9)
		out[start + i] += f.run(rng.randf() * 2.0 - 1.0) * volume * env


## One footstep: a soft heel thump and a scuff of the sole, with a splash on wet ground. run 0..1.
static func footstep(seed: int, run: float, wet: bool) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var vary := 0.85 + rng.randf() * 0.3
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * 0.16))
	var loud := 0.75 + 0.5 * run
	_hit(out, rng, "bandpass", 380.0 * vary, 1.1, 0.32 * loud * 2.0, 0.08)
	_hit(out, rng, "highpass", 2600.0 * vary, 0.8, 0.05 * loud, 0.03, 0.012)
	if wet:
		_hit(out, rng, "highpass", 3800.0 * vary, 0.6, 0.09 * loud * 1.5, 0.11, 0.008)
	return out


## Landing from a jump: a low thud (the game scales its level by the drop).
static func landing(seed: int = 7) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * 0.2))
	_hit(out, rng, "lowpass", 260.0, 0.707, 1.2, 0.16)
	return out


## A tone with an exponential fall, optionally sliding in pitch (the Three.js `tone()`).
static func _tone(out: PackedFloat32Array, wave: String, hz: float, slide_to: float, volume: float, length: float, offset: float = 0.0) -> void:
	var start := roundi(offset * RATE)
	var n := mini(out.size() - start, roundi(length * RATE))
	var phase := 0.0
	for i in n:
		var s := float(i) / RATE
		var f := hz if slide_to <= 0.0 else hz * pow(slide_to / hz, s / length)
		out[start + i] += osc(wave, phase, f / RATE) * volume * exp(-s / length * 5.5)
		phase = fposmod(phase + f / RATE, 1.0)


## Doors: a car's solid thunk, a bus's air-door hiss, an auto or bike seat's creak.
static func door(kind: String, seed: int = 11) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * 0.4))
	match SoundProfiles.sound_kind(kind):
		"bus":
			_hit(out, rng, "lowpass", 5200.0, 0.707, 0.18, 0.35)
			_tone(out, "sine", 70.0, 0.0, 0.2, 0.1)
		"auto", "bike", "thumper":
			_tone(out, "triangle", 180.0, 150.0, 0.08, 0.07)
		_:
			_hit(out, rng, "lowpass", 500.0, 0.707, 0.35, 0.06)
			_tone(out, "sine", 75.0 if kind == "ambulance" else 90.0, 0.0, 0.3, 0.08)
	return out


## A gear change: the note dips and catches (a short clunk under the engine's own dip).
static func gear_clunk(seed: int = 13) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * 0.12))
	_tone(out, "square", 150.0, 95.0, 0.05, 0.09)
	_hit(out, rng, "lowpass", 900.0, 0.707, 0.1, 0.05)
	return out


## A crash: a dull thump with glass and metal on top. strength 0..1.
static func crash(strength: float, seed: int = 17) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * 0.5))
	_hit(out, rng, "lowpass", 600.0, 0.707, 0.9 * strength, 0.25)
	_tone(out, "sine", 70.0, 38.0, 0.45 * strength, 0.25)
	if strength > 0.5:
		_hit(out, rng, "lowpass", 5000.0, 0.707, 0.3 * strength, 0.18)
	return out


## A crow's caw: a harsh falling note through a nasal band-pass, two or three times.
static func crow(seed: int) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var caws := 2 + rng.randi_range(0, 1)
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * (caws * 0.4 + 0.3)))
	var nasal := Biquad.new("bandpass", 1300.0, 3.0)
	var at := 0.0
	var phase := 0.0
	for c in caws:
		var start := roundi(at * RATE)
		for i in roundi(0.24 * RATE):
			var s := float(i) / RATE
			var hz := 560.0 * pow(420.0 / 560.0, minf(1.0, s / 0.22))
			var env := minf(1.0, s / 0.02) * exp(-s * 18.0)
			out[start + i] += osc("saw", phase, hz / RATE) * env * 0.5
			phase = fposmod(phase + hz / RATE, 1.0)
		at += 0.32 + rng.randf() * 0.08
	for i in out.size():
		out[i] = nasal.run(out[i])
	return out


## The koel's dawn call: a rising two-note "ku-oo", repeated, each a little higher.
static func koel(seed: int) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var calls := 3 + rng.randi_range(0, 2)
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * (calls * 0.75 + 0.6)))
	for c in calls:
		var lift := 1.0 + c * 0.05
		for part: Array in [[0.0, 620.0, 640.0, 0.14], [0.18, 760.0, 1060.0, 0.32]]:
			var start := roundi((c * 0.75 + float(part[0])) * RATE)
			var length: float = part[3]
			var phase := 0.0
			for i in roundi(length * RATE):
				var s := float(i) / RATE
				var hz := float(part[1]) * lift * pow(float(part[2]) / float(part[1]), s / length)
				var env := minf(1.0, s / 0.03) * exp(-s / length * 4.0)
				out[start + i] += sin(TAU * phase) * env * 0.06
				phase = fposmod(phase + hz / RATE, 1.0)
	return out


## Filtered noise loop (city hum, rain on roofs, wind): `filters` is [[type, hz, q], ...].
static func noise_bed(seconds: float, filters: Array, gain: float, seed: int) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var length := roundi(seconds * RATE)
	var fade := roundi(RATE * 0.25)
	var chain: Array[Biquad] = []
	for f: Array in filters:
		chain.append(Biquad.new(f[0], f[1], f[2]))
	var out := PackedFloat32Array()
	out.resize(length + fade)
	for i in length + fade:
		var x := rng.randf() * 2.0 - 1.0
		for b in chain:
			x = b.run(x)
		out[i] = x * gain
	return make_loop(out, length, fade)


## Waves near the coast: low noise swelling and falling every 11 s (one swell per loop).
static func sea(seed: int = 21) -> PackedFloat32Array:
	var seconds := 11.0
	var out := noise_bed(seconds, [["lowpass", 650.0, 0.6], ["lowpass", 650.0, 0.707]], 1.2, seed)
	for i in out.size():
		var s := float(i) / RATE
		out[i] *= 0.5 + 0.3 * sin(TAU * s / seconds) + 0.2 * sin(TAU * 2.0 * s / seconds + 1.0)
	return out


## Crickets: two high tones chirping in quick bursts (10 s: every rate fits a whole number of times).
static func crickets() -> PackedFloat32Array:
	var length := RATE * 10
	var out := PackedFloat32Array()
	out.resize(length)
	for voice: Array in [[4600.0, 26.0, 0.9], [4950.0, 31.0, 0.7]]:
		var hz: float = voice[0]
		var rate: float = voice[1]
		var burst: float = voice[2]
		for i in length:
			var s := float(i) / RATE
			var chirp := 0.25 + 0.25 * (1.0 if fposmod(s * rate, 1.0) < 0.5 else -1.0)
			var bursts := 0.5 + 0.5 * sin(TAU * burst * s)
			out[i] += sin(TAU * hz * s) * chirp * bursts * 0.5
	return out


## Tyre squeal: band-passed noise with a faint high whine (loop; pitch and level set by the slide).
static func skid(seed: int = 23) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var length := RATE
	var fade := roundi(RATE * 0.1)
	var band := Biquad.new("bandpass", 1800.0, 6.0)
	var out := PackedFloat32Array()
	out.resize(length + fade)
	var phase := 0.0
	for i in length + fade:
		var whine := osc("triangle", phase, 0.0) * 0.25
		out[i] = band.run(rng.randf() * 2.0 - 1.0 + whine) * 1.6
		phase = fposmod(phase + 1800.0 / RATE, 1.0)
	return make_loop(out, length, fade)


## Sirens: the ambulance's slow two-tone wail and the police car's faster one. One sweep per loop.
static func siren(police: bool) -> PackedFloat32Array:
	var sweep := 1.6 if police else 0.55
	var base := 900.0 if police else 850.0
	var length := roundi(RATE / sweep)
	var out := PackedFloat32Array()
	out.resize(length)
	var phase := 0.0
	var wave := "saw" if police else "triangle"
	for i in length:
		var s := float(i) / RATE
		var lfo := 4.0 * absf(fposmod(s * sweep, 1.0) - 0.5) - 1.0 if police else sin(TAU * sweep * s)
		var hz := base + 200.0 * lfo
		out[i] = osc(wave, phase, hz / RATE) * 0.2
		phase = fposmod(phase + hz / RATE, 1.0)
	# The sweep ends where it began; ease the wrap where the oscillator's phase does not.
	return make_loop(out + out.slice(0, roundi(RATE * 0.02)), length, roundi(RATE * 0.02))


## Little UI and world cues kept as tones: cash, chime, fanfare, fail, punch, shot, hurt, click.
static func cue(name: String, seed: int = 29) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var out := PackedFloat32Array()
	out.resize(roundi(RATE * 0.8))
	match name:
		"cash":
			_tone(out, "square", 1318.0, 0.0, 0.08, 0.16)
			_tone(out, "square", 1568.0, 0.0, 0.08, 0.16, 0.08)
		"chime":
			_tone(out, "triangle", 660.0, 0.0, 0.25, 0.14)
			_tone(out, "triangle", 880.0, 0.0, 0.25, 0.2, 0.12)
		"fanfare":
			for k in 4:
				_tone(out, "triangle", [523.0, 659.0, 784.0, 1047.0][k], 0.0, 0.3, 0.24, k * 0.13)
		"fail":
			_tone(out, "saw", 330.0, 150.0, 0.22, 0.5)
		"punch":
			_hit(out, rng, "lowpass", 700.0, 0.707, 0.5, 0.08)
			_tone(out, "sine", 120.0, 60.0, 0.35, 0.09)
		"shot":
			_hit(out, rng, "lowpass", 3800.0, 0.707, 0.8, 0.16)
			_tone(out, "square", 160.0, 45.0, 0.3, 0.12)
		"hurt":
			_tone(out, "saw", 240.0, 110.0, 0.2, 0.22)
		"click":
			_tone(out, "square", 900.0, 0.0, 0.12, 0.03)
	var last := out.size() - 1
	while last > 0 and absf(out[last]) < 0.0005:
		last -= 1
	return out.slice(0, last + 1)


## 16-bit PCM bytes of a float buffer (clipped to ±1).
static func to_pcm16(samples: PackedFloat32Array) -> PackedByteArray:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, clampi(roundi(samples[i] * 32767.0), -32768, 32767))
	return bytes


## Float samples of a 16-bit mono AudioStreamWAV (the engine loops and stand-ins are stored so).
static func from_wav(stream: AudioStreamWAV) -> PackedFloat32Array:
	var data := stream.data
	var out := PackedFloat32Array()
	if stream.format != AudioStreamWAV.FORMAT_16_BITS or stream.stereo:
		return out
	out.resize(data.size() / 2)
	for i in out.size():
		out[i] = data.decode_s16(i * 2) / 32768.0
	return out


## An AudioStreamWAV from float samples (looped over the whole buffer when `loop`).
static func to_stream(samples: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	s.data = to_pcm16(samples)
	if loop:
		s.loop_mode = AudioStreamWAV.LOOP_FORWARD
		s.loop_begin = 0
		s.loop_end = samples.size()
	return s
