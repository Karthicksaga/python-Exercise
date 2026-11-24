extends SceneTree
## Screenshots of the minimap, the waypoint arrow, the full map and the beacons in the real city
## (G-281, G-282). Needs a display (xvfb, Compatibility):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/map_shots.gd -- --out=/tmp/shots/map915
##
## Writes <out>_near.png (stage 1: the marker is close), <out>_far.png (a stage 3 km away: the
## arrow at the edge with its distance), <out>_north.png (north-up), <out>_full.png and
## <out>_full_wide.png. Uses a throwaway save file. `layer` and `hud` stay untyped: this script
## compiles before the autoloads they use.

const MAIN := "res://src/app/main.tscn"


func _initialize() -> void:
	_run.call_deferred()


func _shot(path: String) -> void:
	for i in 12:
		await process_frame
	var image := root.get_texture().get_image()
	print("screenshot %s (%dx%d): %s" % [path, image.get_width(), image.get_height(), error_string(image.save_png(path))])


func _run() -> void:
	var out := "user://map"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	await process_frame
	var main: Node = (load(MAIN) as PackedScene).instantiate()
	root.add_child(main)
	for i in 60 * 120:
		if main.get("state") == &"title":
			break
		await physics_frame
	main.call("play")
	for i in 120:
		await physics_frame
	var layer: Node = main.find_child("MissionsLayer", false, false)
	var session: MissionSession = layer.get("session")
	await _shot(out + "_near.png")
	# Stage 11 is in Royapettah, 7 km away: the arrow on the rim with its distance.
	var done: Array[String] = []
	for m: MissionData.Mission in session.content.missions.slice(0, 10):
		done.append(m.id)
	session.store.set_section(SaveStore.PROGRESS, {"completed": done, "money": 5000})
	session.store.write()
	session.reload()
	var step := session.runner.mission().objectives[0]
	for i in 60:
		await physics_frame
	await _shot(out + "_far.png")
	MapSettings.shared().set_rotating(false)
	await _shot(out + "_north.png")
	MapSettings.shared().set_rotating(true)
	layer.call("open_map")
	var feed: RefCounted = layer.get("_map_feed")
	for i in 60 * 30:
		await physics_frame
		if feed.call("finished") and (feed.get("result") as Dictionary).is_empty():
			break
	await _shot(out + "_full.png")
	var map: CanvasLayer = layer.get("full_map")
	map.call("set_zoom", 3)
	await _shot(out + "_full_wide.png")
	var wide: MapRoads = map.get("wide_roads")
	var near: MapRoads = map.get("near_roads")
	print("wide roads: ", wide.segment_count() if wide != null else -1, " near: ", near.segment_count() if near != null else -1, " step ", step.label)
	layer.call("close_map")
	for i in 5:
		await physics_frame
	# The passenger of stage 3 stands at the pick-up in Perambur, waving, with the labelled marker.
	var ids: Array[String] = []
	for m: MissionData.Mission in session.content.missions.slice(0, 2):
		ids.append(m.id)
	session.store.set_section(SaveStore.PROGRESS, {"completed": ids, "money": 100})
	session.store.write()
	session.reload()
	var pick: MissionData.Objective = session.runner.mission().objectives[1]
	var world: Node = main.get("world")
	var here := Vector2(pick.x - 22.0, pick.z + 2.0)
	var rig: Object = main.get("rig")
	rig.call("place", root.get_node("WorldOrigin").call("to_scene_xz", here.x, here.y, 0.05), -PI / 2.0)
	for i in 60 * 40:
		await physics_frame
		if world.call("world_ready_around", here):
			break
	for i in 120:
		await physics_frame
	await _shot(out + "_passenger.png")
	quit(0)
