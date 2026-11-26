extends SceneTree
## Frame sequences for the flicker measure (G-500): boots the real game, holds a quality level,
## turns off everything that moves by itself (traffic, walkers, crowds, parked cars, mission
## markers), freezes the clock and the rain, and records a fixed camera, then the same camera
## walking forward 2 cm a frame, then turning 0.03 degrees a frame. Also saves a mask of the
## building pixels (walls, roofs, shop fronts, far blocks; chunk ground, water, decks and trees
## hidden). `tools/flicker_metric.py` counts the pixels that flash (change and change back) inside
## the mask. Needs a display; the phone's renderer is Mobile (Vulkan, lavapipe here):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --audio-driver Dummy \
##       --rendering-method mobile --resolution 915x412 --script res://tests/tools/flicker_shots.gd \
##       -- --place=t_nagar --preset=low --out=/tmp/flicker/t_nagar_low
##
## Options: --place=spawn|t_nagar|anna_salai|marina|x,z  --preset=low|medium|high  --hour=10.5
## --frames=16  --eye=back,height (default 7,3)  --near=metres (overrides the camera's near plane,
## for A/B)  --shadows=0 (sun shadows off, for A/B).

## The work is in `flicker_scene.gd`, loaded at run time: game classes that use the autoloads do
## not compile in a `SceneTree` script.

const SCENE := "res://tests/tools/flicker_scene.gd"


func _initialize() -> void:
	_start.call_deferred()


func _start() -> void:
	var node: Node = (load(SCENE) as GDScript).new()
	node.name = "FlickerShots"
	root.add_child(node)
