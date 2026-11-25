class_name RailTracksView
extends Node3D
## The railway's track drawn round the player (G-325), streamed by the world's own 250 m chunks:
## each chunk with railway in it is built on a worker thread (`RailGeometry`: one merged mesh for
## ballast, rails and viaduct, one for the overhead line), added to the scene in one step when
## complete (at most one chunk a frame), freed when left behind. No per-object nodes or lights.
## Chunks follow the floating origin (G-7).

## Chunks within this distance of the focus are drawn; freed beyond `unload_distance` (metres).
@export var load_distance: float = 600.0
@export var unload_distance: float = 700.0
## The overhead line is drawn within this distance, metres (0: not at all, the Low preset).
@export var ohe_distance: float = 220.0

var index: RailIndex
var materials: RailMaterials
## Where streaming centres, world metres; set every frame by the owner.
var focus: Vector2 = Vector2.ZERO
var active: bool = false
var stats := {"built": 0, "shown": 0, "freed": 0, "triangles": 0, "ohe_triangles": 0, "max_add_usec": 0}

var _nodes: Dictionary[Vector2i, Node3D] = {}
var _tasks: Dictionary[Vector2i, BackgroundTask] = {}
var _done: Array[RailGeometry.Built] = []
var _with_ohe: bool = true


func setup(rail_index: RailIndex, mats: RailMaterials) -> void:
	index = rail_index
	materials = mats
	active = true


## The Low preset draws no overhead line; changing it rebuilds the chunks in view.
func set_overhead(on: bool, distance: float = 220.0) -> void:
	ohe_distance = distance if on else 0.0
	if on != _with_ohe:
		_with_ohe = on
		for cell: Vector2i in _nodes.keys():
			_free(cell)


func _process(_delta: float) -> void:
	if active:
		step()


func step() -> void:
	# Start builds for chunks in reach, nearest first, a few at a time.
	var wanted := index.cells_near(focus, load_distance)
	wanted.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return index.cell_centre(a).distance_squared_to(focus) < index.cell_centre(b).distance_squared_to(focus))
	for cell in wanted:
		if _nodes.has(cell) or _tasks.has(cell):
			continue
		if _tasks.size() >= 2:
			break
		var mat := materials.track
		var ohe := _with_ohe
		var idx := index
		_tasks[cell] = BackgroundTask.start(func() -> RailGeometry.Built: return RailGeometry.build(idx, cell, mat, ohe))
	for cell: Vector2i in _tasks.keys():
		var task := _tasks[cell]
		if task.is_done():
			_tasks.erase(cell)
			var built := task.result() as RailGeometry.Built
			if built != null:
				_done.append(built)
	# One finished chunk joins the scene per frame.
	if not _done.is_empty():
		var t := Time.get_ticks_usec()
		var built: RailGeometry.Built = _done.pop_front()
		if index.cell_centre(built.cell).distance_to(focus) < unload_distance + index.chunk_size:
			_show(built)
		stats["max_add_usec"] = maxi(int(stats["max_add_usec"]), Time.get_ticks_usec() - t)
	# Free what was left behind.
	for cell: Vector2i in _nodes.keys():
		var centre := index.cell_centre(cell)
		var half := index.chunk_size / 2.0
		var d := Vector2(maxf(0.0, absf(focus.x - centre.x) - half), maxf(0.0, absf(focus.y - centre.y) - half)).length()
		if d > unload_distance:
			_free(cell)


func _show(built: RailGeometry.Built) -> void:
	var holder := Node3D.new()
	holder.name = "Rail_%d_%d" % [built.cell.x, built.cell.y]
	holder.position = WorldOrigin.to_scene(built.centre)
	holder.add_to_group(WorldOrigin.GROUP)
	if built.track != null:
		var mi := MeshInstance3D.new()
		mi.mesh = built.track
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visibility_range_end = load_distance + 150.0
		holder.add_child(mi)
	if built.ohe != null and ohe_distance > 0.0:
		var wires := MeshInstance3D.new()
		wires.name = "Overhead"
		wires.mesh = built.ohe
		wires.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		wires.visibility_range_end = ohe_distance + index.chunk_size * 0.7
		holder.add_child(wires)
	if not built.faces.is_empty():
		var body := StaticBody3D.new()
		var shape := ConcavePolygonShape3D.new()
		shape.backface_collision = true
		shape.set_faces(built.faces)
		var cs := CollisionShape3D.new()
		cs.shape = shape
		body.add_child(cs)
		holder.add_child(body)
	add_child(holder)
	_nodes[built.cell] = holder
	stats["built"] = int(stats["built"]) + 1
	stats["shown"] = _nodes.size()
	stats["triangles"] = int(stats["triangles"]) + built.triangles
	stats["ohe_triangles"] = int(stats["ohe_triangles"]) + built.ohe_triangles


func _free(cell: Vector2i) -> void:
	var n: Node3D = _nodes[cell]
	_nodes.erase(cell)
	n.queue_free()
	stats["freed"] = int(stats["freed"]) + 1
	stats["shown"] = _nodes.size()


func shown_cells() -> int:
	return _nodes.size()


func _exit_tree() -> void:
	for cell: Vector2i in _tasks.keys():
		_tasks[cell].result()
	_tasks.clear()
