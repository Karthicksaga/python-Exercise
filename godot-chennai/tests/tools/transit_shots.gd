extends SceneTree
## Screenshots and frame-time measurement of buses and stations (G-214…G-219): see
## `transit_shots_run.gd` (loaded at run time, after the autoloads exist, like `screenshot.gd`
## loads the main scene). Under xvfb with the Compatibility renderer:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/transit_shots.gd -- --out=/tmp/shots --tag=915
##
## Headless frame time: `godot --headless --fixed-fps 60 --audio-driver Dummy --script
## res://tests/tools/transit_shots.gd -- --measure [--routes=off]`.

const RUN := "res://tests/tools/transit_shots_run.gd"


func _initialize() -> void:
	_start.call_deferred()


func _start() -> void:
	await process_frame
	var node := Node.new()
	node.set_script(load(RUN))
	root.add_child(node)
