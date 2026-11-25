extends SceneTree
## Screenshots of the fight in the real city (G-410…G-429) for the `chennai-game-design` §7
## review, and the fight's main-thread cost (Compatibility renderer under xvfb; write them to a
## scratch folder, never the repository):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/combat_shots.gd -- --out=/tmp/combat/c915
##
## Writes <out>_health.png (hurt: the bar and the edge flash), <out>_fight.png (stage 7's thugs
## at Tower Park), <out>_wanted.png (two stars, a police car pulling up), and prints the combat
## step's cost (µs) idle and in the fight. Uses a throwaway save; everything waits in game time.

const RUNNER := "res://tests/tools/combat_shots_runner.gd"


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var out := "user://combat"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await process_frame
	var runner: Node = (load(RUNNER) as GDScript).new()
	root.add_child(runner)
	runner.call(&"run", out)
