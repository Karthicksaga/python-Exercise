class_name BenchmarkWiring
extends RefCounted
## How the benchmark (G-400…G-405) is started: the Settings row "Run benchmark" on the pause menu
## and the title's SETTINGS, and the launch flags after `--`:
##
##     --benchmark               run once the game is in play (from the title, it starts play)
##     --benchmark-quit          quit when the files are written (CI); exit 1 if it could not run
##     --benchmark-scale=0.25    each segment's game seconds times this (CI; the owner's run is 1)
##     --benchmark-levels=low,high   only these levels, in this order (default: yours, then the others)
##
## Only the rows and one check of the flags exist until it is started.

const ROW := &"Benchmark"


static func attach(main: Main) -> void:
	var label := func() -> String:
		if BenchmarkRunner.current != null and BenchmarkRunner.current.running:
			return "Benchmark running…"
		return "Run benchmark (about %d min)\nLow, Medium, High on a fixed route; results on one screen" % minutes()
	for host: Object in [main.pause_menu, main.title]:
		if host != null:
			host.call(&"add_setting", ROW, label, func() -> void: start_from_menu(main))
	var args := OS.get_cmdline_user_args()
	if args.has("--benchmark"):
		main.state_changed.connect(func(s: StringName) -> void: _on_state(main, s, args))


## Rough minutes on a phone: the route at each level plus the waits for each segment's streets.
static func minutes() -> int:
	return ceili((BenchmarkRoute.total_seconds() + BenchmarkRoute.segments().size() * 6.0) * 3.0 / 60.0)


static func start_from_menu(main: Main) -> void:
	if main.play_wiring != null and main.play_wiring.driving.mode() != &"foot":
		print("[bench] get out of the vehicle first")
		return
	if main.state == &"paused":
		main.resume()
	elif main.state == &"title":
		main.play()
	BenchmarkRunner.start(main)


static func _on_state(main: Main, s: StringName, args: PackedStringArray) -> void:
	if BenchmarkRunner.started > 0 or (BenchmarkRunner.current != null):
		return
	if s == &"title":
		main.play.call_deferred()
		return
	if s != &"play":
		return
	var scale := 1.0
	var levels: Array[int] = []
	for a in args:
		if a.begins_with("--benchmark-scale="):
			scale = clampf(float(a.trim_prefix("--benchmark-scale=")), 0.01, 4.0)
		elif a.begins_with("--benchmark-levels="):
			for n in a.trim_prefix("--benchmark-levels=").split(",", false):
				var i := QualitySettings.NAMES.find(n.strip_edges().capitalize())
				if i >= 0:
					levels.append(i)
	BenchmarkRunner.start(main, scale, levels, args.has("--benchmark-quit"))
