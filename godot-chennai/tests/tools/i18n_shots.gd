extends SceneTree
## Screenshots of the UI in a chosen language (needs a display: run under xvfb with the
## Compatibility renderer). One screen over a flat backdrop that stands in for the 3D view. Options
## after `--`:
##   --screen=pause|title|hud|drive|dialog|loading|about|settings|controls
##   --mode=en|ta|both        the language
##   --out=PATH
## Example (1830x824 screen: the UI is 915x412 at 2x):
##   xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##     --rendering-driver opengl3 --audio-driver Dummy --resolution 1830x824 \
##     --script res://tests/tools/i18n_shots.gd -- --screen=pause --mode=both --out=/tmp/shots/pause.png


func _initialize() -> void:
	_go.call_deferred()


func _go() -> void:
	await process_frame
	var node: Node = (load("res://tests/tools/i18n_shots_run.gd") as GDScript).new() as Node
	root.add_child(node)
	node.call(&"run")
