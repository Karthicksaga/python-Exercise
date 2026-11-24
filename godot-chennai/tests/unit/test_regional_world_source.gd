extends TestCase
## The format 2 reader (decision G-56) against the Python reference reader
## (`tools/geo/chennai_geo/codec_v2.py`): `tests/fixtures/world_v2_reference.json` holds its
## counts per tile and a few buildings and roads, written by the reference decoder.

const FIXTURE := "res://tests/fixtures/world_v2_reference.json"

static var _src: RegionalWorldSource


func _source() -> RegionalWorldSource:
	if _src == null:
		_src = RegionalWorldSource.new()
		_src.open_index()
	return _src


func test_world_json_and_grid() -> bool:
	var src := _source()
	assert_eq(src.error, "", "opens")
	assert_eq(src.format, 2, "format 2")
	assert_eq(src.get_grid_origin(), Vector2(-28365, -57341), "grid from world.json")
	assert_eq(src.tiles.size(), 47, "47 tiles")
	# Format 2.3 (G-221) adds the squares that hold only buildings from other datasets.
	assert_eq(src.chunk_count(), 41188 + 2699, "every square in the tile tables plus the fusion-only squares")
	assert_eq(src.legacy, Vector2i(107, 225), "today's chunk numbering offset")
	assert_eq(src.landmarks.size(), 4, "the four landmarks")
	assert_true(src.sea != null and src.sea.coast.size() > 10, "the sea")
	# Today's chunk (8, 3), Anna Nagar Tower, is chunk (115, 228) here, with the same centre.
	var tower := Vector2(402.41, -147.93)
	assert_eq(src.cell_at(tower), Vector2i(8, 3) + src.legacy, "same squares as today")
	var v1 := CityTestKit.v1()
	assert_vec_near(WorldCodec.chunk_centre(Rect2(src.grid_origin, Vector2.ONE), 250.0, 115, 228), v1.index.chunk_centre(8, 3), 0.001, "same centre")
	assert_eq(src.tile_at(Vector2.ZERO), Vector2i(2, 5), "the origin's tile")
	assert_true(src.index_at(tower).bus_stops.size() > 0, "tile places")
	assert_true(src.read_chunk(Vector2i(-500, -500)).error != "", "a square outside the world is an error")
	return true


func test_matches_the_python_reference() -> bool:
	var src := _source()
	var ref: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(FIXTURE))
	for key: String in ref:
		var r: Dictionary = ref[key]
		var parts := key.split("_")
		var tile := Vector2i(int(parts[0]), int(parts[1]))
		var index := src.tiles[tile]
		assert_eq(index.chunk_sizes.size(), int(r["chunks"]), "%s chunk rows" % key)
		assert_eq(index.bus_stops.size(), int(r["busStops"]), "%s bus stops" % key)
		var nb := 0
		var nt := 0
		var na := 0
		var files := 0
		for k: String in index.chunk_sizes:
			if index.chunk_sizes[k] == 0:
				continue
			files += 1
			var cp := k.split(",")
			var chunk := src.read_chunk(Vector2i(int(cp[0]), int(cp[1])))
			if not chunk.ok():
				assert_true(false, "%s chunk %s: %s" % [key, k, chunk.error])
				return true
			nb += chunk.buildings.size()
			nt += chunk.trees.size()
			na += chunk.areas.size()
		assert_eq(files, int(r["files"]), "%s chunk records" % key)
		assert_eq(nb, int(r["buildings"]), "%s buildings" % key)
		assert_eq(nt, int(r["trees"]), "%s trees" % key)
		assert_eq(na, int(r["areas"]), "%s areas" % key)
		var d: Dictionary = r["dense"]
		var cell := Vector2i(int(d["cell"][0]), int(d["cell"][1]))
		var dense := src.read_chunk(cell)
		assert_eq(dense.buildings.size(), int(d["buildings"]), "%s densest chunk" % key)
		var b := dense.buildings[0]
		var fb: Dictionary = d["first"]
		assert_eq(b.id, int(fb["id"]), "%s first building id" % key)
		assert_near(b.height, float(fb["height"]), 0.001, "%s height" % key)
		assert_eq(b.floors, int(fb["floors"]), "%s floors" % key)
		assert_eq(String(b.kind), str(fb["kind"]), "%s kind" % key)
		assert_eq(String(b.height_from), str(fb["heightFrom"]), "%s height source" % key)
		assert_eq(b.outline.size(), int(fb["n"]), "%s outline points" % key)
		assert_vec_near(b.outline[0], Vector2(float(fb["p0"][0]), float(fb["p0"][1])), 0.006, "%s first point" % key)
		assert_eq(b.holes.size(), int(fb["holes"]), "%s courtyards" % key)
		var net := src.tile_roads(tile)
		assert_eq(net.error, "", "%s roads decode" % key)
		assert_eq(net.size(), int(r["pieces"]), "%s road pieces" % key)
		for which: String in ["road0", "named"]:
			if r[which] == null:
				continue
			var fr: Dictionary = r[which]
			var road: Road = null
			for x in net.roads:
				if x.id == int(fr["id"]) and x.piece == int(fr["piece"]):
					road = x
					break
			assert_true(road != null, "%s %s found" % [key, which])
			if road == null:
				continue
			assert_eq(String(road.kind), str(fr["kind"]), "%s %s kind" % [key, which])
			assert_near(road.width, float(fr["width"]), 0.001, "%s %s width" % [key, which])
			assert_eq(road.oneway, bool(fr["oneway"]), "%s %s oneway" % [key, which])
			assert_eq(road.name, str(fr["name"]), "%s %s name" % [key, which])
			assert_eq(road.points.size(), int(fr["n"]), "%s %s points" % [key, which])
			assert_vec_near(road.points[0], Vector2(float(fr["first"][0]), float(fr["first"][1])), 0.001, "%s %s first point" % [key, which])
			assert_vec_near(road.points[road.points.size() - 1], Vector2(float(fr["last"][0]), float(fr["last"][1])), 0.001, "%s %s last point" % [key, which])
			assert_near(road.offset_along, float(fr["offset"]), 0.01, "%s %s offset" % [key, which])
			assert_near(road.total_length, float(fr["total"]), 0.01, "%s %s total" % [key, which])
	return true


func test_ring0_matches_todays_files() -> bool:
	# The regional world's ring 0 was built with today's rules from the same OSM day: a chunk
	# in the middle of today's box holds about the same buildings in both formats.
	var src := _source()
	var v1 := CityTestKit.v1()
	var today := v1.read_chunk(Vector2i(8, 3))
	var region := src.read_chunk(Vector2i(8, 3) + src.legacy)
	assert_true(region.ok(), "reads the tower's square")
	assert_true(absi(region.buildings.size() - today.buildings.size()) <= 3, "buildings %d vs today %d" % [region.buildings.size(), today.buildings.size()])
	assert_vec_near(region.centre, today.centre, 0.001, "same centre")
	return true


func test_streams_beyond_todays_box() -> bool:
	# A chunk of the regional world far outside today's box builds (Tambaram side, tile 4_4).
	var kit := ChunkBuilder.Kit.new()
	var base := CityTestKit.kit()
	kit.source = _source()
	kit.layouts = CityLayouts.create(kit.source)
	kit.models = base.models
	kit.materials = base.materials
	kit.tree_mesh = base.tree_mesh
	kit.palm_mesh = base.palm_mesh
	var cell := Vector2i(163, 165)
	var b := ChunkBuilder.build(kit, cell)
	assert_eq(b.error, "", "builds")
	assert_true(b.chunk.buildings.size() > 300, "a dense square of tile 4_4 (%d buildings)" % b.chunk.buildings.size())
	assert_true(b.triangles.get("walls", 0) > 0 and b.triangles.get("ground", 0) > 0, "walls and ground")
	assert_true(kit.layouts.has_tile(Vector2i(4, 4)), "the tile's layout was built on demand")
	assert_true(not today_box_has(cell, kit.source as RegionalWorldSource), "outside today's box")
	CityTestKit.free_build(b)
	return true


static func today_box_has(cell: Vector2i, src: RegionalWorldSource) -> bool:
	var v1 := CityTestKit.v1()
	return v1.index.has_chunk(cell.x - src.legacy.x, cell.y - src.legacy.y)
