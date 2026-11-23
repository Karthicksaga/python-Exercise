extends SceneTree
## Screenshots of the player on the test ground for the `chennai-game-design` §7 review (needs a
## display: xvfb with the Compatibility renderer, which draws skinned meshes; see screenshot.gd):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/player_screenshot.gd -- --out=/tmp/shots/915
##
## Writes <out>_idle.png, _walk.png, _run.png, _wall.png and _closeup.png (hands and feet).
## Moves in game time; each picture is taken mid-stride, with the touch controls and HUD shown.



## Held here: a coroutine on a RefCounted dies when nothing references it.
var _shots: RefCounted = null


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	_shots = (load("res://tests/tools/player_shots.gd") as GDScript).new()
	_shots.call("run", self)
