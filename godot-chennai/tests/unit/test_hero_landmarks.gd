extends TestCase
## Hero landmark models (G-390 to G-393): Chennai Egmore and Kathipara Junction. Budgets, the one
## texture atlas, determinism, entrances that face the road, no overlap with roads, the Kathipara
## detail sitting on the world's own road decks, licence rows. Waits in game time only.

const OSM_SLACK := 0.4
const ATLAS_TOTAL_BYTES := 1_500_000
const PLACE_NAMES: PackedStringArray = ["KATHIPARA JUNCTION", "GUINDY", "PALLAVARAM", "ASHOK NAGAR"]
const GROUND_KINDS: PackedStringArray = ["footway", "steps", "pedestrian", "path", "cycleway"]


static func heroes() -> Array[LandmarkSpec]:
	var out: Array[LandmarkSpec] = []
	for s in LandmarkSpec.load_all():
		if s.hero:
			out.append(s)
	return out


static func spec_of(id: String) -> LandmarkSpec:
	for s in heroes():
		if s.id == id:
			return s
	return null


static func lod_mesh(s: LandmarkSpec, name: String) -> Mesh:
	var scene := (load(s.glb_path()) as PackedScene).instantiate()
	var found: Mesh = null
	for n in scene.find_children(name, "MeshInstance3D", true, false):
		found = (n as MeshInstance3D).mesh
	scene.free()
	return found


## Drawable roads at ground level near a point (no bridges, tunnels, raised pieces or footpaths).
static func ground_roads(point: Vector2, radius: float) -> Array[Road]:
	var out: Array[Road] = []
	for r in CityTestKit.regional().roads_near(point, radius):
		if r.bridge or r.tunnel or r.is_raised() or GROUND_KINDS.has(str(r.highway)) or GROUND_KINDS.has(str(r.kind)):
			continue
		out.append(r)
	return out


static func dist_to_road(p: Vector2, r: Road) -> float:
	var d := INF
	for i in range(r.points.size() - 1):
		d = minf(d, p.distance_to(Geometry2D.get_closest_point_to_segment(p, r.points[i], r.points[i + 1])))
	return d


func test_two_hero_models_are_listed() -> bool:
	var ids: Array[String] = []
	for s in heroes():
		ids.append(s.id)
		assert_eq(s.validate().size(), 0, "%s: spec valid (%s)" % [s.id, ", ".join(s.validate())])
	assert_true(ids.has("chennai-egmore") and ids.has("kathipara-junction"), "Egmore and Kathipara are hero models (%s)" % str(ids))
	return true


func test_triangle_budgets_lod0_6k_lod1_1_5k_lod2_small() -> bool:
	for s in heroes():
		var t: Array[int] = []
		for n in LandmarkModels.LOD_NAMES:
			t.append(LandmarkModels.triangle_count(lod_mesh(s, n)))
		assert_true(t[0] < 6000 and t[0] >= 1000, "%s LOD0 %d under 6000" % [s.id, t[0]])
		assert_true(t[1] < 1500 and t[1] < t[0], "%s LOD1 %d under 1500" % [s.id, t[1]])
		assert_true(t[2] > 0 and t[2] < 1000 and t[2] < t[1], "%s LOD2 %d is a light box-level model" % [s.id, t[2]])
	return true


func test_one_atlas_per_landmark_vram_compressed_under_budget() -> bool:
	var png_total := 0
	var vram_total := 0
	for s in heroes():
		assert_true(FileAccess.file_exists(s.atlas_path()), "%s: atlas PNG exists" % s.id)
		var bytes := FileAccess.get_file_as_bytes(s.atlas_path())
		var w := (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
		var h := (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
		assert_true(w == h and w <= 512, "%s: atlas is square and at most 512 px (%d x %d)" % [s.id, w, h])
		png_total += bytes.size()
		# VRAM: ETC2/DXT5 RGBA is one byte a pixel, a mip chain adds a third.
		vram_total += int(w * h * 4.0 / 3.0)
		var imp := FileAccess.get_file_as_string(s.atlas_path() + ".import")
		assert_contains(imp, "compress/mode=2", "%s: imported VRAM compressed" % s.id)
		assert_contains(imp, "mipmaps/generate=true", "%s: with mipmaps" % s.id)
		var tex := load(s.atlas_path())
		assert_true(tex is CompressedTexture2D, "%s: loads as a compressed texture" % s.id)
		# The GLB carries no embedded image: the model uses its one atlas.
		var glb := FileAccess.get_file_as_bytes(s.glb_path())
		assert_true(glb.size() < 900_000, "%s: GLB %d bytes" % [s.id, glb.size()])
		assert_true(str(JSON.parse_string(FileAccess.get_file_as_string(s.build_path()))["atlas"]["sha256"]) == _sha(s.atlas_path()), "%s: atlas is the kit's output" % s.id)
		for n in LandmarkModels.LOD_NAMES:
			var uv: PackedVector2Array = lod_mesh(s, n).surface_get_arrays(0)[Mesh.ARRAY_TEX_UV]
			assert_true(uv.size() > 0, "%s %s has UVs" % [s.id, n])
			var bad := 0
			for p in uv:
				if p.x < 0.0 or p.x > 1.0 or p.y < 0.0 or p.y > 1.0:
					bad += 1
			assert_eq(bad, 0, "%s %s: every UV inside the atlas" % [s.id, n])
	assert_true(png_total + vram_total < ATLAS_TOTAL_BYTES * 2 and vram_total < ATLAS_TOTAL_BYTES, "atlases: %d bytes of PNG, %d bytes in VRAM, under %d" % [png_total, vram_total, ATLAS_TOTAL_BYTES])
	return true


func test_models_are_deterministic() -> bool:
	# The kits build twice in build_all.sh and compare bytes; here the game side: the recorded
	# hashes match the files, and two builds give the same meshes.
	for s in heroes():
		var build: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(s.build_path()))
		assert_eq(str(build["glb_sha256"]), _sha(s.glb_path()), "%s: GLB hash as built" % s.id)
		var a := LandmarkModels.build(s, null)
		var b := LandmarkModels.build(s, null)
		for i in 3:
			var ra: Array = a.lod_meshes[i].mesh.surface_get_arrays(0)
			var rb: Array = b.lod_meshes[i].mesh.surface_get_arrays(0)
			assert_true(hash(ra[Mesh.ARRAY_VERTEX]) == hash(rb[Mesh.ARRAY_VERTEX]) and hash(ra[Mesh.ARRAY_TEX_UV]) == hash(rb[Mesh.ARRAY_TEX_UV]), "%s LOD%d: same meshes twice" % [s.id, i])
		a.node.free()
		b.node.free()
	return true


func test_no_per_frame_cost_and_one_material() -> bool:
	for s in heroes():
		var built := LandmarkModels.build(s, null)
		assert_true(built.material != null and built.material.albedo_texture != null, "%s: one atlas material" % s.id)
		var nodes: Array[Node] = [built.node]
		var scripted := 0
		while not nodes.is_empty():
			var n: Node = nodes.pop_back()
			nodes.append_array(n.get_children())
			if n.get_script() != null and n != built.node and n.has_method("_process"):
				scripted += 1
		assert_eq(scripted, 0, "%s: nothing runs per frame" % s.id)
		for mi in built.lod_meshes:
			assert_true(mi.material_override == built.material, "%s %s shares the atlas material" % [s.id, mi.name])
		built.node.free()
	return true


func test_egmore_footprint_fit_and_height() -> bool:
	var s := spec_of("chennai-egmore")
	var faces := lod_mesh(s, "LOD0").get_faces()
	var top := 0.0
	for v in faces:
		top = maxf(top, v.y)
	assert_true(absf(top - 24.0) <= 2.4, "Egmore: %.1f m tall, spec 24 m" % top)
	# Ground-level geometry stays inside the OSM footprints (plus the 2 m of the shared test).
	var rings: Array[PackedVector2Array] = [s.outline("building"), s.outline("west_wing"), s.outline("shed")]
	var worst := 0.0
	for i in range(0, faces.size(), 3):
		var a := faces[i]
		if a.y > 1.0:
			continue
		var p := s.origin + Vector2(a.x, a.z)
		var d := INF
		for r in rings:
			d = minf(d, 0.0 if Geometry2D.is_point_in_polygon(p, r) else _ring_dist(p, r))
		worst = maxf(worst, d)
	assert_true(worst <= 0.35, "Egmore: ground geometry within 0.35 m (a pilaster) of the OSM outlines (worst %.2f m)" % worst)
	return true


func test_egmore_entrances_face_the_road() -> bool:
	var s := spec_of("chennai-egmore")
	var entrances: Array = s.hooks["entrances"]
	assert_true(entrances.size() >= 2, "Egmore: at least two entrances")
	var main := s.footprints["building"]
	for e: Dictionary in entrances:
		var w := Vector2(float(e["world"][0]), float(e["world"][1]))
		var n := Vector2(float(e["normal"][0]), float(e["normal"][1]))
		assert_near(n.length(), 1.0, 0.02, "%s: unit normal" % e["id"])
		var edge := _ring_dist(w, main)
		assert_true(edge <= 3.0, "%s: on the building's front (%.1f m from the outline)" % [e["id"], edge])
		var best := INF
		var best_dir := Vector2.ZERO
		for r in ground_roads(w, 60.0):
			for i in range(r.points.size() - 1):
				var q := Geometry2D.get_closest_point_to_segment(w, r.points[i], r.points[i + 1])
				if w.distance_to(q) < best:
					best = w.distance_to(q)
					best_dir = (q - w).normalized()
		assert_true(best < 40.0, "%s: a road within 40 m (%.1f m)" % [e["id"], best])
		assert_true(n.dot(best_dir) > 0.6, "%s: the door faces the road (cos %.2f)" % [e["id"], n.dot(best_dir)])
	var zone: Dictionary = s.hooks["peace_zone"]
	assert_true(float(zone["radius"]) >= 20.0, "Egmore: a peace zone round the forecourt")
	var card: Dictionary = s.hooks["facts_card"]
	assert_eq(str(card["title_en"]), s.name_en, "facts card titled with the English name")
	assert_true(s.data.has(str(card["facts"])) and (s.data[str(card["facts"])] as Array).size() >= 3, "facts card points at the spec's sourced facts")
	return true


func test_no_overlap_with_roads() -> bool:
	for s in heroes():
		var pts := PackedVector2Array()
		var faces := lod_mesh(s, "LOD0").get_faces()
		for v in faces:
			if v.y < 0.6:
				pts.append(s.origin + Vector2(v.x, v.z))
		assert_true(pts.size() > 0, "%s: has ground geometry" % s.id)
		var inside := 0
		var worst := INF
		# OSM's own outline may already touch a road's drawn corridor (Egmore's east porch and
		# Gandhi Irwin Road, whose width is estimated); the model must add nothing on a carriageway,
		# so only geometry more than OSM_SLACK outside the outlines counts (pilasters are 0.3 m deep).
		var outside := PackedVector2Array()
		for p in pts:
			var in_osm := false
			for name: String in s.footprints:
				if Geometry2D.is_point_in_polygon(p, s.outline(name)) or _ring_dist(p, s.outline(name)) <= OSM_SLACK:
					in_osm = true
			if not in_osm:
				outside.append(p)
		for r in ground_roads(s.origin, 330.0 if s.overlay else 160.0):
			for p in outside:
				var d := dist_to_road(p, r) - r.width / 2.0
				if d < worst:
					worst = d
				if d < -0.05:
					inside += 1
		assert_eq(inside, 0, "%s: no ground geometry on a carriageway (closest %.2f m)" % [s.id, worst])
	return true


func test_kathipara_details_sit_on_the_worlds_road_decks() -> bool:
	var s := spec_of("kathipara-junction")
	var decks: Array = s.data["decks"]
	assert_true(decks.size() > 40, "road pieces copied (%d)" % decks.size())
	var live: Dictionary = {}
	for r in CityTestKit.regional().roads_near(s.origin, 320.0):
		live["%d/%d" % [r.id, r.piece]] = r
	var checked := 0
	var raised := 0
	for d: Dictionary in decks:
		var r: Road = live.get("%d/%d" % [int(d["id"]), int(d["piece"])])
		assert_true(r != null, "road %d is still in the world" % int(d["id"]))
		if r == null:
			continue
		var pts: Array = d["points"]
		assert_eq(pts.size(), r.points.size(), "road %d: same points" % int(d["id"]))
		if pts.size() == r.points.size():
			for i in pts.size():
				assert_true(Vector2(float(pts[i][0]), float(pts[i][1])).distance_to(r.points[i]) < 0.02, "road %d point %d" % [int(d["id"]), i])
		var hs: Array = d["heights"]
		assert_eq(hs.size(), r.heights.size(), "road %d: same heights" % int(d["id"]))
		if hs.size() == r.heights.size():
			for i in hs.size():
				assert_true(absf(float(hs[i]) - r.heights[i]) < 0.02, "road %d height %d" % [int(d["id"]), i])
		checked += 1
		if bool(d["bridge"]) and not hs.is_empty():
			raised += 1
	assert_true(raised >= 12, "at least a dozen raised bridge pieces carry the details (%d of %d)" % [raised, checked])
	# Every gantry stands at the deck height of the live road under it.
	for b: Dictionary in s.data["boards"]:
		var r: Road = live.get("%d/0" % int(b["road"]))
		assert_true(r != null, "board road %d" % int(b["road"]))
		if r == null:
			continue
		var h := r.height_along(float(b["d"]))
		assert_near(h, float(b["deck_height"]), 0.05, "board on road %d at the live deck height" % int(b["road"]))
	return true


func test_kathipara_signboards_tamil_and_english() -> bool:
	var s := spec_of("kathipara-junction")
	var boards: Array = s.data["boards"]
	assert_true(boards.size() >= 4, "at least four gantry boards (%d)" % boards.size())
	for b: Dictionary in boards:
		assert_true(PLACE_NAMES.has(str(b["en"])), "%s: a public place name, no business (%s)" % [b["road"], b["en"]])
		assert_true(LandmarkSpec._is_tamil(str(b["ta"])), "%s: Tamil text" % b["road"])
		assert_eq(str(b["ta_review"]), "needs native review", "%s: Tamil marked for review" % b["road"])
		assert_true(str(b["source"]) != "", "%s: says where the words come from" % b["road"])
	var built := LandmarkModels.build(s, null)
	var labels := 0
	for n in built.node.get_children():
		if n is Label3D and n.name.begins_with("Board_"):
			labels += 1
	assert_eq(labels, boards.size() * 2, "a Tamil and an English line on every board")
	built.node.free()
	return true


func test_egmore_sign_names_only_the_station() -> bool:
	var s := spec_of("chennai-egmore")
	assert_eq(s.signs.size(), 1, "one name board")
	assert_eq(str(s.signs[0]["ta"]), s.name_ta, "Tamil name from OSM")
	assert_eq(str(s.signs[0]["en"]).to_lower(), s.name_en.to_lower(), "English name from OSM")
	return true


func test_licence_rows_for_the_hero_files() -> bool:
	var doc := FileAccess.get_file_as_string("res://assets/LICENSES.md")
	for s in heroes():
		assert_contains(doc, "assets/landmarks/%s/" % s.id, "%s: a licence row" % s.id)
		assert_contains(doc, s.atlas_file, "%s: the atlas has a licence row" % s.id)
	assert_contains(doc, "hero_station.py", "kit script named")
	assert_contains(doc, "hero_flyover.py", "kit script named")
	return true


static func _ring_dist(p: Vector2, ring: PackedVector2Array) -> float:
	var d := INF
	for i in ring.size():
		d = minf(d, p.distance_to(Geometry2D.get_closest_point_to_segment(p, ring[i], ring[(i + 1) % ring.size()])))
	return d


static func _sha(path: String) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(FileAccess.get_file_as_bytes(path))
	return ctx.finish().hex_encode()


func test_hero_materials_follow_the_low_preset_lighting() -> bool:
	# The hero atlas materials are made per landmark on a worker (G-390), so `set_flat` could not
	# see them; `add_hero` registers them and Low lights them per vertex like the shared ones (G-452).
	var mats := CityMaterials.new()
	mats.walls = StandardMaterial3D.new()
	mats.ground = ShaderMaterial.new()
	mats.trees = ShaderMaterial.new()
	mats.water = ShaderMaterial.new()
	mats.ground.shader = CityMaterials.GROUND_SHADER
	mats.trees.shader = TreeKit.SHADER
	mats.water.shader = CityMaterials.WATER_SHADER
	var built: Array[LandmarkModels.Built] = []
	for s in heroes():
		var b := LandmarkModels.build(s, null)
		built.append(b)
		mats.add_hero(b.material)
	assert_true(built.size() >= 1, "there are hero landmarks")
	for b in built:
		assert_eq(b.material.shading_mode, BaseMaterial3D.SHADING_MODE_PER_PIXEL, "a hero is lit per pixel by default")
	mats.set_flat(true)
	for b in built:
		assert_eq(b.material.shading_mode, BaseMaterial3D.SHADING_MODE_PER_VERTEX, "Low: the hero is lit per vertex")
		assert_true(b.material.albedo_texture != null and b.material.vertex_color_use_as_albedo, "its atlas and tint are kept")
	# One that arrives after the preset was applied takes the mode in force.
	var late := LandmarkModels.build(heroes()[0], null)
	mats.add_hero(late.material)
	assert_eq(late.material.shading_mode, BaseMaterial3D.SHADING_MODE_PER_VERTEX, "a late hero joins in per-vertex mode")
	mats.set_flat(false)
	for b in built:
		assert_eq(b.material.shading_mode, BaseMaterial3D.SHADING_MODE_PER_PIXEL, "back to per pixel")
	assert_eq(late.material.shading_mode, BaseMaterial3D.SHADING_MODE_PER_PIXEL, "the late one too")
	for b in built:
		b.node.free()
	late.node.free()
	return true
