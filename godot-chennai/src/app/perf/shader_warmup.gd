class_name ShaderWarmup
extends Node3D
## First-use pipeline compiles moved to loading (decision G-346). Behind the loading screen, one
## copy of each kind of thing play draws but the start does not show yet (a walker, one traffic
## vehicle of every kind) stands in front of the camera for a few drawn frames, so the renderer
## compiles their shader pipelines (skinned and not, shadow casters, the vehicle materials) before
## play, not at the first sighting. The city's chunks, the player and the parked vehicles are on
## screen during loading anyway. Then everything here is freed.
##
## Vulkan counts the compiles (`Performance.PIPELINE_COMPILATIONS_*`); the Compatibility renderer
## compiles its GL shaders on first draw the same way but counts nothing.

const FRAMES := 3
## Metres in front of the camera, and between copies.
const AHEAD := 9.0
const SPACING := 2.2

var shown: int = 0


## Total pipeline compilations so far (0 where the renderer does not count them).
static func pipelines() -> int:
	return int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_CANVAS) + Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_MESH)
		+ Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SURFACE) + Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_DRAW)
		+ Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SPECIALIZATION))


## Shows the copies for FRAMES drawn frames under `parent`, then frees them. Returns
## {"meshes": copies shown, "pipelines": compiles during the warm-up, "usec": time}.
static func run(parent: Node, life: CityLife) -> Dictionary:
	var started := Time.get_ticks_usec()
	var before := pipelines()
	var w := ShaderWarmup.new()
	w.name = "ShaderWarmup"
	parent.add_child(w)
	w._fill(life)
	var tree := parent.get_tree()
	for i in FRAMES:
		if DisplayServer.get_name() == "headless":
			await tree.process_frame
		else:
			await RenderingServer.frame_post_draw
	var out := {"meshes": w.shown, "pipelines": pipelines() - before, "usec": Time.get_ticks_usec() - started}
	w.queue_free()
	return out


func _fill(life: CityLife) -> void:
	var things: Array[Node3D] = []
	if life != null and life.pool != null and life.cast != null:
		var ids := life.cast.used_ids()
		if not ids.is_empty():
			var person := life.pool.make_view(ids[0])
			if person != null:
				things.append(person)
	if life != null and life.population != null:
		var seen: Dictionary[StringName, bool] = {}
		for k in life.population.traffic_settings.kinds:
			if seen.has(k.name):
				continue
			seen[k.name] = true
			things.append(TrafficVehicleView.make(k.name, 0.0))
	var cam := get_viewport().get_camera_3d()
	var at := Transform3D.IDENTITY
	if cam != null:
		at = cam.global_transform
	var forward := -at.basis.z
	var right := at.basis.x
	for i in things.size():
		var n := things[i]
		add_child(n)
		var side := (float(i) - (things.size() - 1) / 2.0) * SPACING
		n.global_position = at.origin + forward * AHEAD + right * side - at.basis.y * 1.0
		n.visible = true
	shown = things.size()
