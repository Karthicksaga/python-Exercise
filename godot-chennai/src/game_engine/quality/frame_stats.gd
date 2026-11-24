class_name FrameStats
extends RefCounted
## Frame-time numbers for the performance overlay and the perf log (decision G-253): the last
## WINDOW frames (average and worst), the CPU and GPU render times the renderer measures, and
## a verdict on what bounds the frame. Pure: the caller feeds it one sample per frame.

const WINDOW := 120

## Frame times (ms) of the last WINDOW frames, a ring.
var frames := PackedFloat32Array()
var _next: int = 0
## Frames seen since the start, and the sum of their times (ms), for the long average.
var total_frames: int = 0
var total_ms: float = 0.0
## Physics steps run in the last frame (Engine.get_physics_frames() difference): more than one
## means the game is catching up with a slow frame (G-256).
var physics_steps: int = 0
var max_physics_steps: int = 0


func _init() -> void:
	frames.resize(WINDOW)
	frames.fill(0.0)


func add(frame_ms: float, steps: int = 1) -> void:
	frames[_next] = frame_ms
	_next = (_next + 1) % WINDOW
	total_frames += 1
	total_ms += frame_ms
	physics_steps = steps
	max_physics_steps = maxi(max_physics_steps, steps)


func count() -> int:
	return mini(total_frames, WINDOW)


func average() -> float:
	var n := count()
	if n == 0:
		return 0.0
	var s := 0.0
	for i in n:
		s += frames[i]
	return s / n


func worst() -> float:
	var w := 0.0
	for i in count():
		w = maxf(w, frames[i])
	return w


func fps() -> float:
	var a := average()
	return 1000.0 / a if a > 0.0 else 0.0


## What bounds the frame (G-253), from the frame time and its parts (all ms):
## - `cpu`: the main thread's work (process + physics + the renderer's CPU side);
## - `gpu`: the GPU's time for the frame (0 when the renderer cannot measure it).
## A side is "busy" when it takes at least 75 % of the frame; both busy is "both".
static func verdict(frame: float, cpu: float, gpu: float) -> String:
	if frame <= 0.0:
		return "no frames yet"
	var cpu_busy := cpu >= 0.75 * frame
	var gpu_busy := gpu >= 0.75 * frame
	if gpu <= 0.0:
		return "CPU-bound" if cpu_busy else "GPU or driver (GPU time not measured; CPU %.0f of %.0f ms)" % [cpu, frame]
	if cpu_busy and gpu_busy:
		return "both CPU and GPU"
	if gpu_busy:
		return "GPU-bound"
	if cpu_busy:
		return "CPU-bound"
	if frame > 20.0:
		return "waiting (neither CPU %.0f nor GPU %.0f fills the %.0f ms frame: vsync, driver or thermal)" % [cpu, gpu, frame]
	return "fine"
