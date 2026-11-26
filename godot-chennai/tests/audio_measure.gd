class_name AudioMeasure
extends RefCounted
## Measuring rendered sound in tests (the Three.js `sound.spec` approach): RMS, the strongest
## frequency in a band by a plain DFT scan (after low-passing and decimating, so it stays fast in
## GDScript), and click detection.


static func rms(samples: PackedFloat32Array, from: int = 0, to: int = -1) -> float:
	var end := samples.size() if to < 0 else mini(to, samples.size())
	var sum := 0.0
	for i in range(from, end):
		sum += samples[i] * samples[i]
	return sqrt(sum / maxi(1, end - from))


## Low-pass at rate / (2.5 × factor) twice, then keep every factor-th sample.
static func decimate(samples: PackedFloat32Array, factor: int, rate: int = Synth.RATE) -> PackedFloat32Array:
	if factor <= 1:
		return samples
	var a := Synth.Biquad.new("lowpass", rate / (2.5 * factor), 0.707, rate)
	var b := Synth.Biquad.new("lowpass", rate / (2.5 * factor), 0.707, rate)
	var out := PackedFloat32Array()
	out.resize(samples.size() / factor)
	for i in out.size() * factor:
		var y := b.run(a.run(samples[i]))
		if i % factor == 0:
			out[i / factor] = y
	return out


## The strongest frequency between lo and hi Hz, scanning in `step` Hz (Hann window).
static func peak(samples: PackedFloat32Array, lo: float, hi: float, step: float, rate: int = Synth.RATE) -> float:
	var factor := maxi(1, floori(rate / (hi * 2.6)))
	var x := decimate(samples, factor, rate)
	var r := float(rate) / factor
	var n := x.size()
	var w := PackedFloat32Array()
	w.resize(n)
	for i in n:
		w[i] = x[i] * (0.5 - 0.5 * cos(TAU * i / maxi(1, n - 1)))
	var best := -1.0
	var at := lo
	var f := lo
	while f <= hi:
		# Rotate a phasor instead of calling sin/cos per sample.
		var c := cos(TAU * f / r)
		var s := sin(TAU * f / r)
		var pr := 1.0
		var pi := 0.0
		var re := 0.0
		var im := 0.0
		for i in n:
			re += w[i] * pr
			im += w[i] * pi
			var t := pr * c - pi * s
			pi = pr * s + pi * c
			pr = t
		var power := re * re + im * im
		if power > best:
			best = power
			at = f
		f += step
	return at


## The fundamental between lo and hi Hz by normalised autocorrelation: the shortest period whose
## correlation is within 10 % of the best (so a recording's strong second harmonic, or an
## engine's half-order beat, does not move it an octave). Parabolic refinement.
static func fundamental(samples: PackedFloat32Array, lo: float, hi: float, rate: int = Synth.RATE) -> float:
	var factor := maxi(1, floori(rate / (hi * 8.0)))
	var x := decimate(samples, factor, rate)
	var r := float(rate) / factor
	var n := x.size()
	var min_lag := maxi(2, floori(r / hi))
	var max_lag := mini(n / 2, ceili(r / lo))
	var corr := PackedFloat32Array()
	corr.resize(max_lag + 2)
	var best := -1.0
	for lag in range(min_lag - 1, max_lag + 2):
		var sxy := 0.0
		var sxx := 0.0
		var syy := 0.0
		for i in n - lag:
			sxy += x[i] * x[i + lag]
			sxx += x[i] * x[i]
			syy += x[i + lag] * x[i + lag]
		corr[lag] = sxy / sqrt(maxf(1e-12, sxx * syy))
		if lag >= min_lag and lag <= max_lag:
			best = maxf(best, corr[lag])
	for lag in range(min_lag, max_lag + 1):
		if corr[lag] >= best * 0.9 and corr[lag] >= corr[lag - 1] and corr[lag] >= corr[lag + 1]:
			var a := corr[lag - 1]
			var b := corr[lag]
			var c := corr[lag + 1]
			var den := a - 2.0 * b + c
			var d := 0.5 * (a - c) / den if den != 0.0 else 0.0
			return r / (lag + d)
	return 0.0


## Largest |second difference| (a click shows as a spike far above the signal's own curvature).
static func max_curvature(samples: PackedFloat32Array, from: int = 2) -> float:
	var worst := 0.0
	for i in range(maxi(2, from), samples.size()):
		worst = maxf(worst, absf(samples[i] - 2.0 * samples[i - 1] + samples[i - 2]))
	return worst


static func near(value: float, target: float, share: float) -> bool:
	return absf(value - target) <= target * share
