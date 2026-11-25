class_name BenchmarkReport
extends RefCounted
## The benchmark's result (decisions G-401…G-403): one dictionary with the device, the build, the
## renderer and, per quality level, a row per segment and one for the whole route; the plain
## recommendation; and the same as JSON (user://benchmark.json) and readable text
## (user://benchmark.txt). Pure: built from the runner's rows.

const FORMAT := "chennai-benchmark-1"
const JSON_PATH := "user://benchmark.json"
const TEXT_PATH := "user://benchmark.txt"

## A level is smooth enough to recommend when, over the whole route, it averages at least
## SMOOTH_FPS, 95 % of frames are at most SMOOTH_P95_MS, no segment averages under WORST_FPS, and
## frames over 50 ms come at most HITCHES_A_MINUTE a minute (G-403). Low is capped at 30 fps, so it
## passes only when it holds about its cap.
const SMOOTH_FPS := 27.0
const SMOOTH_P95_MS := 50.0
const WORST_FPS := 22.0
const HITCHES_A_MINUTE := 2.0

## Keys every segment row carries (the tests check the file against this list).
const SEGMENT_KEYS: Array[String] = ["id", "title", "short", "place", "hour", "game_seconds", "steps", "frames", "avg_ms", "p95_ms", "p99_ms", "max_ms", "fps", "hitches", "gpu_ms", "cpu_ms", "main_ms", "verdict", "draws", "primitives", "video_mb", "chunks_built", "chunk_build_ms_avg", "chunk_build_ms_max", "stream_main_ms_max", "traffic", "walkers", "figures", "crowd", "place_kind", "thermal_start", "thermal_end"]


## The whole result. `levels` is [{"level": "Low", "preset": 0, "first": bool, "segments": [row...],
## "overall": row}], in the order they ran.
static func make(device: Dictionary, renderer: Dictionary, started: String, levels: Array[Dictionary], scale: float, wall_seconds: float, thermal_start: Dictionary, thermal_end: Dictionary) -> Dictionary:
	for l in levels:
		l["judge"] = judge(l)
	return {
		"format": FORMAT,
		"device": device,
		"renderer": renderer,
		"started_at": started,
		"scale": scale,
		"route_seconds": snappedf(BenchmarkRoute.total_seconds(scale), 0.01),
		"wall_seconds": snappedf(wall_seconds, 0.1),
		"thermal_start": thermal_start,
		"thermal_end": thermal_end,
		"thermal_text": "%s → %s" % [BenchmarkDevice.thermal_line(thermal_start), BenchmarkDevice.thermal_line(thermal_end).trim_prefix("thermal ")],
		"levels": levels,
		"recommendation": recommend(levels),
	}


## Whether one level's whole-route row is smooth (G-403), and why not.
static func judge(level: Dictionary) -> Dictionary:
	var all: Dictionary = level.get("overall", {})
	var segs: Array = level.get("segments", [])
	var why := PackedStringArray()
	var fps := float(all.get("fps", 0.0))
	if fps < SMOOTH_FPS:
		why.append("%.0f fps on average" % fps)
	if float(all.get("p95_ms", 0.0)) > SMOOTH_P95_MS:
		why.append("1 frame in 20 over %.0f ms" % float(all.get("p95_ms", 0.0)))
	var worst: Dictionary = {}
	for s: Variant in segs:
		var row := s as Dictionary
		if worst.is_empty() or float(row.get("fps", 0.0)) < float(worst.get("fps", 0.0)):
			worst = row
	if not worst.is_empty() and float(worst.get("fps", 0.0)) < WORST_FPS:
		why.append("%.0f fps in %s (%s)" % [float(worst["fps"]), str(worst.get("short", "?")), str(worst.get("verdict", "?"))])
	var minutes := maxf(float(all.get("game_seconds", 0.0)) / 60.0, 0.001)
	var hitches := int(all.get("hitches", 0))
	if hitches / minutes > HITCHES_A_MINUTE:
		why.append("%d hitches over 50 ms" % hitches)
	return {"smooth": why.is_empty(), "why": ", ".join(why), "worst": str(worst.get("short", "")) if not worst.is_empty() else ""}


## The plain recommendation: the highest level that is smooth, else Low with what is still slow.
static func recommend(levels: Array[Dictionary]) -> Dictionary:
	var best := -1
	var by_preset: Dictionary[int, Dictionary] = {}
	for l in levels:
		var p := int(l.get("preset", 0))
		by_preset[p] = l
		if bool(judge(l)["smooth"]):
			best = maxi(best, p)
	if best == QualitySettings.HIGH:
		return {"preset": best, "level": "High", "text": "High is fine", "detail": "High holds %s fps over the route." % _fps(by_preset[best])}
	if best == QualitySettings.MEDIUM:
		var high_why := str(judge(by_preset[QualitySettings.HIGH])["why"]) if by_preset.has(QualitySettings.HIGH) else "not run"
		return {"preset": best, "level": "Medium", "text": "Medium is fine", "detail": "Medium holds %s fps; High: %s." % [_fps(by_preset[best]), high_why]}
	if best == QualitySettings.LOW:
		var med_why := str(judge(by_preset[QualitySettings.MEDIUM])["why"]) if by_preset.has(QualitySettings.MEDIUM) else "not run"
		return {"preset": best, "level": "Low", "text": "Use Low", "detail": "Low holds %s fps; Medium: %s." % [_fps(by_preset[best]), med_why]}
	var low_why := str(judge(by_preset[QualitySettings.LOW])["why"]) if by_preset.has(QualitySettings.LOW) else "Low not run"
	return {"preset": QualitySettings.LOW, "level": "Low", "text": "Use Low", "detail": "Even Low is not smooth: %s." % low_why}


static func _fps(level: Dictionary) -> String:
	return "%.0f" % float((level.get("overall", {}) as Dictionary).get("fps", 0.0))


static func to_json(result: Dictionary) -> String:
	return JSON.stringify(result, "  ", false)


static func _ms(v: Variant) -> String:
	var f := float(v)
	return "n/a" if f <= 0.0 else ("%.1f" % f)


## Readable plain text, one table per level (also what the CI log prints).
static func to_text(result: Dictionary) -> String:
	var lines := PackedStringArray()
	var d: Dictionary = result.get("device", {})
	var r: Dictionary = result.get("renderer", {})
	var rec: Dictionary = result.get("recommendation", {})
	lines.append("Chennai benchmark (%s)" % FORMAT)
	lines.append("Recommendation: %s. %s" % [rec.get("text", "?"), rec.get("detail", "")])
	lines.append("Renderer: %s · %s %s · GPU %s (%s, API %s)" % [d.get("renderer", "?"), r.get("method", "?"), r.get("driver", "?"), r.get("gpu", "?"), r.get("vendor", "?"), r.get("api", "?")])
	lines.append("Device: %s · %s · CPU %s · %.1f GiB · screen %s" % [d.get("model", "?"), d.get("os", "?"), d.get("cpu", "?"), float(d.get("memory_gib", 0.0)), d.get("screen", "?")])
	lines.append("Build: commit %s · version %s · %s" % [d.get("commit", "?"), d.get("version", "") if str(d.get("version", "")) != "" else "-", d.get("godot", "?")])
	lines.append("Started at %s · route %.0f s of game time a level (scale %.2f) · took %.0f s · %s → %s" % [result.get("started_at", "?"), float(result.get("route_seconds", 0.0)), float(result.get("scale", 1.0)), float(result.get("wall_seconds", 0.0)), BenchmarkDevice.thermal_line(result.get("thermal_start", {})), BenchmarkDevice.thermal_line(result.get("thermal_end", {}))])
	lines.append("Compare renderers: run this on both APKs (Mobile = Vulkan, \"(GL)\" = Compatibility) and send both.")
	for l: Variant in result.get("levels", []):
		var level := l as Dictionary
		var verdict := judge(level)
		lines.append("")
		lines.append("== %s%s: %s" % [level.get("level", "?"), " (the level you had)" if bool(level.get("first", false)) else "", "smooth" if bool(verdict["smooth"]) else "not smooth: " + str(verdict["why"])])
		lines.append("%-9s %6s %6s %6s %5s %4s %6s %6s %-10s %5s %6s %6s %5s %6s %5s" % ["segment", "avg", "p95", "p99", "fps", ">50", "gpu", "cpu", "verdict", "draws", "prims", "vramMB", "chunk", "build", "cars"])
		var rows: Array = (level.get("segments", []) as Array).duplicate()
		rows.append(level.get("overall", {}))
		for s: Variant in rows:
			var row := s as Dictionary
			lines.append("%-9s %6.1f %6.1f %6.1f %5.1f %4d %6s %6s %-10s %5d %5dk %6.0f %5d %6s %5d" % [
				str(row.get("short", "?")), float(row.get("avg_ms", 0.0)), float(row.get("p95_ms", 0.0)), float(row.get("p99_ms", 0.0)),
				float(row.get("fps", 0.0)), int(row.get("hitches", 0)), _ms(row.get("gpu_ms", 0.0)), _ms(row.get("cpu_ms", 0.0)),
				str(row.get("verdict", "")).left(10), int(row.get("draws", 0)), int(row.get("primitives", 0)) / 1000, float(row.get("video_mb", 0.0)),
				int(row.get("chunks_built", 0)), _ms(row.get("chunk_build_ms_max", 0.0)), int(row.get("traffic", 0))])
	lines.append("")
	lines.append("Columns: frame time avg/p95/p99 in ms; >50 = frames over 50 ms; gpu and cpu ms a frame (cpu = scripts + the renderer's CPU, as the overlay); draws and primitives a frame; vram = most video memory; chunk = chunks built; build = slowest chunk build on a worker (ms); cars = traffic at the end.")
	return "\n".join(lines) + "\n"


## Writes both files; returns "" or what failed.
static func write(result: Dictionary) -> String:
	for pair: Array in [[JSON_PATH, to_json(result)], [TEXT_PATH, to_text(result)]]:
		var f := FileAccess.open(str(pair[0]), FileAccess.WRITE)
		if f == null:
			return "could not write %s (%s)" % [pair[0], error_string(FileAccess.get_open_error())]
		f.store_string(str(pair[1]))
		f.close()
	return ""
