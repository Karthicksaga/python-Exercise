extends TestCase
## The world source interface (G-6) over today's files, and the floating origin (G-7).


func test_file_world_source() -> bool:
	var src := FileWorldSource.new()
	assert_eq(src.open(), "", "opens")
	assert_eq(src.get_bounds(), src.index.bounds, "bounds from the index")
	assert_eq(src.get_chunk_size(), 250.0, "chunk size")
	assert_eq(src.get_origin_lat_lng(), Vector2(13.085, 80.2101), "geographic origin")
	assert_eq(src.loaded_roads().size(), 20625, "all roads loaded")
	var tower := Vector2(402.41, -147.93)
	assert_eq(src.cell_at(tower), Vector2i(8, 3), "shared grid cell")
	var chunk := src.read_chunk(src.chunks_near(tower, 10.0)[0])
	assert_true(chunk.ok(), "reads the nearest chunk")
	# The TS game's nearestRoadPoint finds 6th Main Road (tertiary, id 242400280) 88.55 m from the
	# tower as the nearest drivable road; the paths in the tower's park are nearer and unnamed.
	var nearest: Road = null
	var best := INF
	for r in src.roads_near(tower, 120.0):
		if r.kind == &"footway":
			continue
		for i in range(1, r.points.size()):
			var d := Geometry2D.get_closest_point_to_segment(tower, r.points[i - 1], r.points[i]).distance_to(tower)
			if d < best:
				best = d
				nearest = r
	assert_true(nearest != null and nearest.id == 242400280, "nearest drivable road to the tower is 6th Main Road")
	assert_near(best, 88.55, 0.02, "its distance")
	assert_eq(src.roads_near(tower, 80.0).filter(func(r: Road) -> bool: return r.id == 242400280).size(), 0, "not within 80 m")
	assert_true(src.index_at(tower) == src.index, "index covers the tower")
	assert_true(src.index_at(Vector2(0, -90000)) == null, "no index 90 km north")
	var off_grid := src.read_chunk(Vector2i(500, 500))
	assert_false(off_grid.ok(), "a chunk outside the table is an error")
	return true


func test_floating_origin() -> bool:
	var origin: Node = tree.root.get_node("/root/WorldOrigin")
	origin.call("recentre", 0.0, 0.0)
	var marker := Node3D.new()
	marker.add_to_group(&"origin_shifted")
	root.add_child(marker)
	var far := Vector2(12000.0, -85000.0)  # about Pulicat from today's origin
	var scene: Vector3 = origin.call("to_scene", far, 2.0)
	marker.global_position = scene
	assert_eq(scene, Vector3(12000, 2, -85000), "no shift at origin 0")
	var shifts: Array[Vector3] = []
	var listen := func(offset: Vector3) -> void: shifts.append(offset)
	origin.connect(&"shifted", listen)
	var moved: bool = origin.call("follow", Vector3(12000.0, 0.0, -85000.0))
	origin.disconnect(&"shifted", listen)
	assert_true(moved, "recentres when the focus is far away")
	assert_eq(shifts, [Vector3(-12000, 0, 85000)] as Array[Vector3], "shifted once by the focus")
	assert_vec_near(Vector2(marker.global_position.x, marker.global_position.z), Vector2.ZERO, 0.0, "group node moved to the scene's zero")
	assert_eq(marker.global_position.y, 2.0, "height kept")
	var back: Vector2 = origin.call("to_world", Vector3(0.25, 0.0, -0.05))
	assert_vec_near(back, far + Vector2(0.25, -0.05), 0.01, "scene to world near the new origin")
	assert_false(origin.call("follow", Vector3(100, 0, 100)), "no recentre near the origin")
	origin.call("recentre", 0.0, 0.0)
	return true
