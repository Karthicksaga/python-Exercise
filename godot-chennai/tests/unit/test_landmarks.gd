extends TestCase
## Landmark pipeline (G-180…G-189): specs, models built from them, placement, LODs, collision,
## the buildings they replace. Replaces the old procedural landmark checks (tower height and
## triangle counts), which these cover for every landmark against OSM and the spec.

const ALIGN := 2.0
const HEIGHT_TOLERANCE := 0.10

static var _specs: Array[LandmarkSpec] = []
static var _ground: Dictionary[String, Dictionary] = {}


static func specs() -> Array[LandmarkSpec]:
	if _specs.is_empty():
		_specs = LandmarkSpec.load_all()
	return _specs


static func lod0(spec: LandmarkSpec) -> Mesh:
	var scene := (load(spec.glb_path()) as PackedScene).instantiate()
	var found: Mesh = null
	for n in scene.find_children("LOD0", "MeshInstance3D", true, false):
		found = (n as MeshInstance3D).mesh
	scene.free()
	return found


static func lod_triangles(spec: LandmarkSpec) -> PackedInt32Array:
	var scene := (load(spec.glb_path()) as PackedScene).instantiate()
	var out := PackedInt32Array()
	for name: String in LandmarkModels.LOD_NAMES:
		var nodes := scene.find_children(name, "MeshInstance3D", true, false)
		out.append(LandmarkModels.triangle_count((nodes[0] as MeshInstance3D).mesh) if not nodes.is_empty() else -1)
	scene.free()
	return out


func test_every_spec_in_the_index_is_valid() -> bool:
	var all := specs()
	assert_true(all.size() >= 5, "at least the five first landmarks are listed (%d)" % all.size())
	var dirs := DirAccess.get_directories_at(LandmarkSpec.DIR)
	assert_eq(dirs.size(), all.size(), "every landmark folder is in index.json")
	for s in all:
		var problems := s.validate()
		assert_true(problems.is_empty(), "%s spec valid: %s" % [s.id, ", ".join(problems)])
		assert_true(FileAccess.file_exists(s.glb_path()), "%s has its GLB" % s.id)
	return true


func test_names_tamil_and_english_facts_sourced() -> bool:
	for s in specs():
		assert_true(s.name_en != "" and LandmarkSpec._is_tamil(s.name_ta), "%s: English and Tamil names" % s.id)
		for f: Dictionary in s.data["facts"]:
			assert_true(str(f["source"]).begins_with("https://"), "%s fact has a source: %s" % [s.id, str(f["en"]).left(30)])
	return true


func test_references_listed_with_licences_in_docs() -> bool:
	var doc := FileAccess.get_file_as_string("res://docs/landmarks.md")
	assert_true(doc.length() > 500, "docs/landmarks.md exists")
	for s in specs():
		for r: Dictionary in s.data["references"]:
			var title := str(r["title"]).trim_prefix("File:")
			assert_true(doc.contains(title), "%s: %s listed in docs/landmarks.md" % [s.id, title])
			assert_true(str(r["licence"]) != "", "%s: %s has a licence" % [s.id, title])
	return true


func test_models_built_from_the_current_spec() -> bool:
	# build.json is written by the Blender kit with the hashes of the spec it read and the GLB it
	# wrote; a spec edited without rebuilding, or a GLB edited by hand, fails here.
	for s in specs():
		var build: Variant = JSON.parse_string(FileAccess.get_file_as_string(s.build_path()))
		assert_true(build is Dictionary, "%s: build.json" % s.id)
		if not build is Dictionary:
			continue
		var b := build as Dictionary
		assert_eq(str(b["spec_sha256"]), _sha(LandmarkSpec.DIR + "/%s/spec.json" % s.id), "%s: GLB built from this spec" % s.id)
		assert_eq(str(b["glb_sha256"]), _sha(s.glb_path()), "%s: GLB is the kit's output" % s.id)
		assert_eq(str(b["kit"]), s.kit, "%s: built by its kit" % s.id)
		var tris := lod_triangles(s)
		var recorded: Dictionary = b["triangles"]
		assert_eq(tris[0], int(recorded["lod0"]), "%s: LOD0 triangles as built" % s.id)
	return true


func test_triangle_budgets() -> bool:
	for s in specs():
		var t := lod_triangles(s)
		assert_true(t[0] >= int(s.budget["lod0_min"]) and t[0] <= int(s.budget["lod0_max"]), "%s LOD0 %d in %d..%d" % [s.id, t[0], s.budget["lod0_min"], s.budget["lod0_max"]])
		assert_true(t[1] > 0 and t[1] <= int(s.budget["lod1_max"]) and t[1] < t[0], "%s LOD1 %d <= %d" % [s.id, t[1], s.budget["lod1_max"]])
		assert_true(t[2] > 0 and t[2] <= int(s.budget["lod2_max"]) and t[2] < t[1], "%s LOD2 %d <= %d" % [s.id, t[2], s.budget["lod2_max"]])
	return true


func test_height_matches_osm_or_research() -> bool:
	for s in specs():
		var top := -INF
		var bottom := INF
		for v in lod0(s).get_faces():
			top = maxf(top, v.y)
			bottom = minf(bottom, v.y)
		assert_true(absf(top - s.height) <= s.height * HEIGHT_TOLERANCE, "%s: model %.1f m tall, spec %.1f m" % [s.id, top, s.height])
		if s.osm_height > 0.0:
			assert_true(absf(top - s.osm_height) <= s.osm_height * HEIGHT_TOLERANCE, "%s: within 10 %% of OSM height %.1f" % [s.id, s.osm_height])
		assert_true(bottom > -1.5 and bottom <= 0.05, "%s stands on the ground (lowest %.2f m)" % [s.id, bottom])
	return true


## Ground-level geometry of LOD0 in world metres: vertices and edges below 1.5 m.
static func ground(s: LandmarkSpec) -> Dictionary:
	if _ground.has(s.id):
		return _ground[s.id]
	var faces := lod0(s).get_faces()
	var points := PackedVector2Array()
	var segs := PackedVector2Array()
	for i in range(0, faces.size(), 3):
		for k in 3:
			var a := faces[i + k]
			var b := faces[i + (k + 1) % 3]
			if a.y < 1.5:
				points.append(s.origin + Vector2(a.x, a.z))
			if a.y < 1.5 and b.y < 1.5:
				segs.append(s.origin + Vector2(a.x, a.z))
				segs.append(s.origin + Vector2(b.x, b.z))
	_ground[s.id] = {"points": points, "segs": segs}
	return _ground[s.id]


static func _dist_to_ring(p: Vector2, ring: PackedVector2Array) -> float:
	if Geometry2D.is_point_in_polygon(p, ring):
		return 0.0
	var d := INF
	for i in ring.size():
		d = minf(d, p.distance_to(Geometry2D.get_closest_point_to_segment(p, ring[i], ring[(i + 1) % ring.size()])))
	return d


func test_footprint_aligned_with_osm_within_2_m() -> bool:
	for s in specs():
		var g := ground(s)
		var under: Array[PackedVector2Array] = []
		var edges: Array[PackedVector2Array] = []
		for name: String in s.footprints:
			var role := s.roles[name]
			if role == &"model" or role == &"model_rect" or role == &"area":
				under.append(s.outline(name))
			if role == &"model" or role == &"model_rect":
				edges.append(s.outline(name))
		# 1. Nothing at ground level stands outside the OSM footprints (beyond 2 m).
		var worst := 0.0
		var pts: PackedVector2Array = g["points"]
		for i in range(0, pts.size(), 3):
			var d := INF
			for ring in under:
				d = minf(d, _dist_to_ring(pts[i], ring))
			worst = maxf(worst, d)
		assert_true(worst <= ALIGN, "%s: ground geometry within %.0f m of OSM (worst %.2f m)" % [s.id, ALIGN, worst])
		# 2. Every OSM outline of a modelled part is traced by the model: samples every 3 m along
		#    each edge have a ground edge of the model within 2 m.
		var segs: PackedVector2Array = g["segs"]
		var grid := _grid(segs)
		var missed := 0
		var samples := 0
		var far := 0.0
		for ring in edges:
			for i in ring.size():
				var a := ring[i]
				var b := ring[(i + 1) % ring.size()]
				var n := maxi(1, ceili(a.distance_to(b) / 3.0))
				for k in n + 1:
					var p := a.lerp(b, float(k) / n)
					var d := _near_seg(grid, segs, p)
					samples += 1
					if d > ALIGN:
						missed += 1
						far = maxf(far, d)
		assert_true(missed == 0, "%s: OSM outline traced within %.0f m (%d of %d samples missed, worst %.1f m)" % [s.id, ALIGN, missed, samples, far])
	return true


static func _grid(segs: PackedVector2Array) -> Dictionary[Vector2i, PackedInt32Array]:
	var grid: Dictionary[Vector2i, PackedInt32Array] = {}
	for i in range(0, segs.size(), 2):
		var lo := segs[i].min(segs[i + 1])
		var hi := segs[i].max(segs[i + 1])
		for cx in range(floori(lo.x / 4.0), floori(hi.x / 4.0) + 1):
			for cy in range(floori(lo.y / 4.0), floori(hi.y / 4.0) + 1):
				var key := Vector2i(cx, cy)
				if not grid.has(key):
					grid[key] = PackedInt32Array()
				grid[key].append(i)
	return grid


static func _near_seg(grid: Dictionary[Vector2i, PackedInt32Array], segs: PackedVector2Array, p: Vector2) -> float:
	var best := INF
	var c := Vector2i(floori(p.x / 4.0), floori(p.y / 4.0))
	for dx in range(-1, 2):
		for dy in range(-1, 2):
			var key := c + Vector2i(dx, dy)
			if not grid.has(key):
				continue
			for i in grid[key]:
				best = minf(best, p.distance_to(Geometry2D.get_closest_point_to_segment(p, segs[i], segs[i + 1])))
	return best


func test_lods_switch_by_distance() -> bool:
	for s in specs():
		var built := LandmarkModels.build(s, null)
		assert_eq(built.error, "", "%s builds" % s.id)
		assert_eq(built.lod_meshes.size(), 3, "%s has three LODs" % s.id)
		if built.lod_meshes.size() != 3:
			continue
		for d: float in [5.0, s.lod0_end * 0.5, (s.lod0_end + s.lod1_end) * 0.5, (s.lod1_end + s.lod2_end) * 0.5, s.lod2_end * 0.99]:
			var shown := 0
			for mi in built.lod_meshes:
				if d >= mi.visibility_range_begin and d < mi.visibility_range_end:
					shown += 1
			assert_eq(shown, 1, "%s: exactly one LOD at %.0f m" % [s.id, d])
		var l0 := built.lod_meshes[0]
		var l1 := built.lod_meshes[1]
		assert_near(l1.visibility_range_begin, l0.visibility_range_end, 0.01, "%s: LOD1 begins where LOD0 ends" % s.id)
		built.node.free()
	return true


func test_collision_boxes_and_a_ray_hits_them() -> bool:
	for s in specs():
		var built := LandmarkModels.build(s, null)
		var minimum := int((s.data["collision"] as Dictionary).get("min_boxes", 1))
		assert_true(built.boxes >= minimum, "%s: %d collision boxes (>= %d)" % [s.id, built.boxes, minimum])
		root.add_child(built.node)
		await wait_physics_frames(2)
		var body := built.node.get_node("Collision") as StaticBody3D
		var first := body.get_child(0) as CollisionShape3D
		var top := body.global_transform * first.transform.origin
		var space := (root.get_viewport() as Viewport).world_3d.direct_space_state
		var q := PhysicsRayQueryParameters3D.create(top + Vector3(0, 200, 0), top + Vector3(0, -200, 0))
		var hit := space.intersect_ray(q)
		assert_true(not hit.is_empty() and hit["collider"] == body, "%s: a ray from above hits its collision" % s.id)
		built.node.queue_free()
		await wait_physics_frames(1)
	return true


func test_placed_at_the_osm_origin_and_follows_the_floating_origin() -> bool:
	var s := specs()[0]
	var built := LandmarkModels.build(s, null)
	root.add_child(built.node)
	var expected := WorldOrigin.to_scene(s.origin)
	assert_vec_near(Vector2(built.node.position.x, built.node.position.z), Vector2(expected.x, expected.z), 0.01, "placed at its OSM origin")
	assert_true(built.node.is_in_group(WorldOrigin.GROUP), "follows the floating origin")
	built.node.queue_free()
	return true


func test_models_load_on_a_worker_thread() -> bool:
	var s := specs()[0]
	var task := BackgroundTask.start(func() -> LandmarkModels.Built: return LandmarkModels.build(s, null))
	var built: LandmarkModels.Built = await task.finish(tree)
	assert_true(built != null and built.node != null and built.error == "", "built off the main thread")
	if built != null and built.node != null:
		built.node.free()
	return true


func test_osm_buildings_under_a_landmark_are_left_out() -> bool:
	var temple: LandmarkSpec = null
	for s in specs():
		if s.id == "kapaleeshwarar-temple":
			temple = s
	assert_true(temple != null, "temple spec")
	var inside := Building.new()
	var c := temple.origin
	inside.outline = PackedVector2Array([c + Vector2(-3, -3), c + Vector2(3, -3), c + Vector2(3, 3), c + Vector2(-3, 3)])
	var outside := Building.new()
	var o := temple.origin + Vector2(300, 0)
	outside.outline = PackedVector2Array([o + Vector2(-3, -3), o + Vector2(3, -3), o + Vector2(3, 3), o + Vector2(-3, 3)])
	var kept := ChunkBuilder.without_landmark_buildings([inside, outside] as Array[Building], specs())
	assert_eq(kept.size(), 1, "the building inside the compound is left out")
	assert_true(kept[0] == outside, "the building outside stays")
	# The real chunk: OSM's halls and gopurams inside the compound are left out of the city.
	var src := CityTestKit.regional()
	var removed := 0
	for cell in src.chunks_near(temple.origin, 120.0):
		var chunk := src.read_chunk(cell)
		removed += chunk.buildings.size() - ChunkBuilder.without_landmark_buildings(chunk.buildings, [temple] as Array[LandmarkSpec]).size()
	assert_true(removed >= 10, "OSM buildings in the temple compound left out of the city (%d)" % removed)
	return true


func test_no_business_names_or_brands() -> bool:
	for s in specs():
		for w in s._words():
			assert_false(LandmarkSpec.BUSINESS_WORDS.has(w), "%s: %s is not a business word" % [s.id, w])
		for sign: Dictionary in s.signs:
			assert_true(str(sign["ta"]) == s.name_ta and str(sign["en"]).to_lower() == s.name_en.to_lower(), "%s: sign shows only the real public name" % s.id)
	return true


func test_temple_architecture_only() -> bool:
	for s in specs():
		if s.kind == &"temple":
			assert_contains(str(s.data.get("respect", "")), "no deity figures", "%s: respect rule recorded" % s.id)
	return true


static func _sha(path: String) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(FileAccess.get_file_as_bytes(path))
	return ctx.finish().hex_encode()
