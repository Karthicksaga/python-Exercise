extends TestCase
## `index.json` against known values (from the Three.js game's files, 2026-11-15 extract), and
## the rule that bounds and the chunk grid always come from the data (G-5).

var index: WorldIndex


func before_each() -> void:
	index = WorldFiles.read_index()


func test_real_index() -> bool:
	assert_true(index.ok(), "parses: " + index.error)
	assert_eq([index.format, index.name, index.chunk_size], [1, "Chennai", 250.0], "format, name, chunk size")
	assert_eq([index.latitude, index.longitude], [13.085, 80.2101], "geographic origin")
	assert_eq(index.attribution, "© OpenStreetMap contributors", "attribution")
	assert_eq(index.data_date, "2026-11-15T00:16:27Z", "OSM data date")
	assert_eq(index.bounds, Rect2(-1615, -1091, 8633 + 1615, 11655 + 1091), "bounds from the file")
	assert_eq(index.chunk_sizes.size(), 1897, "chunk table")
	var with_file := 0
	for k: String in index.chunk_sizes:
		with_file += 1 if index.chunk_sizes[k] > 0 else 0
	assert_eq(with_file, 1877, "chunks with a file")
	assert_eq(index.road_names.size(), 3312, "road names")
	assert_eq(index.road_names[0], "Muthuswamy Road", "first road name")
	assert_eq(index.areas.size(), 553, "areas")
	assert_eq([index.areas[0].name, index.areas[0].kind], ["Marina Beach", &"beach"], "first area")
	assert_eq(index.pois.size(), 4708, "points of interest")
	var named := 0
	for p in index.pois:
		named += 1 if p.name != "" else 0
	assert_eq(named, 504, "named hospitals and clinics")
	var ids := PackedStringArray()
	for l in index.landmarks:
		ids.append(l.id)
	assert_eq(ids, PackedStringArray(["anna-nagar-tower", "kapaleeshwarar-temple", "marina-beach", "t-nagar"]), "landmarks")
	var tower := index.landmarks[0]
	assert_eq([tower.height, tower.levels, tower.opened, tower.estimated], [41.0, 12, 1968, PackedStringArray(["height", "levels"])], "Anna Nagar Tower (height and levels estimated)")
	assert_vec_near(tower.position, Vector2(402.41, -147.93), 0.001, "tower position")
	assert_eq([index.bus_stops.size(), index.signals.size(), index.districts.size()], [533, 266, 238], "bus stops, signals, districts")
	assert_eq([index.districts[0].name, index.districts[0].kind], ["Alwarpet", &"suburb"], "first district")
	assert_true(index.sea != null, "the map has a sea")
	assert_eq([index.sea.coast.size(), index.sea.outline.size()], [174, 175], "sea outline points")
	return true


func test_chunk_grid() -> bool:
	assert_eq(index.cell_at(Vector2(-1615, -1091)), Vector2i(0, 0), "corner cell")
	assert_eq(index.cell_at(Vector2(-1615.01, -1091)), Vector2i(-1, 0), "just west of the corner")
	assert_eq(index.key_at(Vector2(402.41, -147.93)), "8,3", "the tower's chunk")
	assert_true(index.has_chunk_file(34, -1), "chunk north of the bounds row has a file (35 bytes)")
	assert_true(index.has_chunk(18, 1), "road-only chunk is in the table")
	assert_false(index.has_chunk_file(18, 1), "road-only chunk has no file")
	assert_false(index.has_chunk(500, 500), "far chunk is not in the table")
	assert_eq(WorldIndex.chunk_file(3, -1), "c/3_-1.bin", "chunk file name")
	var near := index.chunks_near(Vector2(402.41, -147.93), 300.0)
	assert_eq(near[0], Vector2i(8, 3), "nearest chunk first")
	var last_gap := -1.0
	var sorted := true
	for cell in near:
		var square := Rect2(index.bounds.position + Vector2(cell) * 250.0, Vector2(250, 250))
		var gap := Vector2(402.41, -147.93).clamp(square.position, square.end).distance_to(Vector2(402.41, -147.93))
		sorted = sorted and gap >= last_gap and gap <= 300.0
		last_gap = gap
	assert_true(sorted, "nearest first, all within the radius")
	# Counted independently from index.json with Python (squares whose nearest point is within 300 m).
	assert_eq(near.size(), 10, "chunks within 300 m of the tower")
	return true


func test_bounds_and_grid_come_from_the_data() -> bool:
	# A bigger world with another anchor and chunk size: nothing assumes today's box.
	var text := JSON.stringify({"format": 1, "name": "Test", "origin": {"lat": 12.68, "lng": 79.95},
		"bounds": {"minX": -20000, "maxX": 25000, "minZ": -60000, "maxZ": 30000}, "chunkSize": 500,
		"chunks": [[0, 0, 10], [89, 179, 0]], "roads": "roads.bin", "roadNames": []})
	var big := WorldIndex.parse(text)
	assert_true(big.ok(), "parses: " + big.error)
	assert_eq(big.bounds.size, Vector2(45000, 90000), "90 km north-south")
	assert_eq(big.cell_at(Vector2(24999, 29999)), Vector2i(89, 179), "far corner cell")
	assert_vec_near(big.chunk_centre(89, 179), Vector2(24750, 29750), 0.0, "far chunk centre")
	assert_eq(big.chunks_near(Vector2(-19990, -59990), 100.0), [Vector2i(0, 0)] as Array[Vector2i], "near the anchor")
	return true


func test_bad_indexes() -> bool:
	assert_contains(WorldIndex.parse("{\"format\": 2}").error, "format 2, expected 1", "format 2 refused")
	assert_contains(WorldIndex.parse("{\"format\": 1}").error, "has no bounds", "missing field")
	assert_false(WorldIndex.parse("not json").ok(), "not JSON")
	assert_contains(WorldFiles.read_index("res://nowhere").error, "not found", "missing folder")
	return true
