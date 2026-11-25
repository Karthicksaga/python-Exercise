class_name BenchmarkStats
extends RefCounted
## One benchmark segment's numbers (decision G-401). Pure: the runner adds one sample per drawn
## frame and the chunk streamer's counters at the start and end; `result()` gives the segment's row
## for benchmark.json, benchmark.txt and the card.

## A frame slower than this is a hitch (the same line as the overlay's, G-340).
const HITCH_MS := 50.0

var frame_ms := PackedFloat32Array()
var gpu_ms := PackedFloat32Array()
var cpu_ms := PackedFloat32Array()
var main_ms := PackedFloat32Array()
var draws: int = 0
var primitives: int = 0
var video_max: int = 0
var stream_main_max_usec: int = 0
## Physics steps (game time) the segment ran, set by the runner.
var steps: int = 0
## The streamer's built count and total worker build time at the start and the end, and the
## slowest single build in the segment.
var built_start: int = 0
var built_end: int = 0
var build_usec_start: int = 0
var build_usec_end: int = 0
var build_max_usec: int = 0
## Traffic and people at the end (from CityLife.counts()).
var counts: Dictionary = {}
## Thermal readings at the start and the end (`BenchmarkDevice.thermal()`).
var thermal_start: Dictionary = {}
var thermal_end: Dictionary = {}


## One drawn frame: its whole time, the GPU's time (0 when not measured), the CPU time as the
## overlay counts it (scripts + the renderer's CPU), the main thread's busy time, and the renderer's
## counters for it.
func add(frame: float, gpu: float, cpu: float, main: float, frame_draws: int, frame_primitives: int, video_bytes: int, stream_usec: int) -> void:
	frame_ms.append(frame)
	gpu_ms.append(gpu)
	cpu_ms.append(cpu)
	main_ms.append(main)
	draws += frame_draws
	primitives += frame_primitives
	video_max = maxi(video_max, video_bytes)
	stream_main_max_usec = maxi(stream_main_max_usec, stream_usec)


func frames() -> int:
	return frame_ms.size()


static func mean(values: PackedFloat32Array) -> float:
	if values.is_empty():
		return 0.0
	var s := 0.0
	for v in values:
		s += v
	return s / values.size()


## The q-th quantile (0..1) by the nearest-rank rule: the value that `q` of the frames are at or
## under.
static func quantile(values: PackedFloat32Array, q: float) -> float:
	if values.is_empty():
		return 0.0
	var sorted := values.duplicate()
	sorted.sort()
	var rank := clampi(ceili(q * sorted.size()) - 1, 0, sorted.size() - 1)
	return sorted[rank]


func hitches() -> int:
	var n := 0
	for v in frame_ms:
		if v > HITCH_MS:
			n += 1
	return n


## The row for `segment`; with none, the whole level's (every frame of every segment).
func result(segment: BenchmarkRoute.Segment = null) -> Dictionary:
	var avg := mean(frame_ms)
	var gpu := mean(gpu_ms)
	var cpu := mean(cpu_ms)
	var n := maxi(1, frames())
	var built := built_end - built_start
	return {
		"id": String(segment.id) if segment != null else "all", "title": segment.title if segment != null else "Whole route",
		"short": segment.short if segment != null else "All", "place": segment.place if segment != null else "",
		"hour": snappedf(segment.hour, 0.01) if segment != null else -1.0, "game_seconds": snappedf(steps / float(BenchmarkRoute.STEPS_A_SECOND), 0.01),
		"steps": steps, "frames": frames(),
		"avg_ms": snappedf(avg, 0.01), "p95_ms": snappedf(quantile(frame_ms, 0.95), 0.01), "p99_ms": snappedf(quantile(frame_ms, 0.99), 0.01),
		"max_ms": snappedf(quantile(frame_ms, 1.0), 0.01),
		"fps": snappedf(1000.0 / avg if avg > 0.0 else 0.0, 0.1), "hitches": hitches(),
		"gpu_ms": snappedf(gpu, 0.01), "cpu_ms": snappedf(cpu, 0.01), "main_ms": snappedf(mean(main_ms), 0.01),
		"verdict": FrameStats.verdict(avg, cpu, gpu).split(" (")[0],
		"draws": roundi(draws / float(n)), "primitives": roundi(primitives / float(n)),
		"video_mb": snappedf(video_max / 1048576.0, 0.1),
		"chunks_built": built,
		"chunk_build_ms_avg": snappedf((build_usec_end - build_usec_start) / 1000.0 / built if built > 0 else 0.0, 0.1),
		"chunk_build_ms_max": snappedf(build_max_usec / 1000.0, 0.1),
		"stream_main_ms_max": snappedf(stream_main_max_usec / 1000.0, 0.1),
		"traffic": int(counts.get("vehicles", 0)), "walkers": int(counts.get("walkers", 0)), "figures": int(counts.get("figures", 0)),
		"crowd": int(counts.get("crowd", 0)), "place_kind": str(counts.get("place", "")),
		"thermal_start": thermal_start, "thermal_end": thermal_end,
	}
