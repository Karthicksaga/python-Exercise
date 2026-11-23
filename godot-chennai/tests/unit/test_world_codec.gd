extends TestCase
## The chunk and roads decoders against the real files and known values. Expected values come
## from decoding the same files with the Three.js game's TypeScript decoder (`codec.ts`, run
## with tsx on 23 Nov 2026 against the world built from the 2026-11-15 OSM extract). If the world
## is rebuilt on purpose, regenerate them the same way and say so in the commit.

var index: WorldIndex
var net: RoadNetwork


func before_each() -> void:
	index = WorldFiles.read_index()
	net = WorldFiles.read_roads(index)


func test_roads_file_totals() -> bool:
	assert_true(net.ok(), "roads decode: " + net.error)
	assert_eq(net.format, 1, "format")
	assert_eq(net.size(), 20625, "roads")
	var named := 0
	var oneway := 0
	var lanes := 0
	var points := 0
	var kinds: Dictionary[StringName, int] = {}
	for r in net.roads:
		named += 1 if r.name != "" else 0
		oneway += 1 if r.oneway else 0
		lanes += 1 if r.lanes >= 0 else 0
		points += r.points.size()
		kinds[r.kind] = kinds.get(r.kind, 0) + 1
	assert_eq(named, 7219, "named roads")
	assert_eq(oneway, 3192, "one-way roads")
	assert_eq(lanes, 643, "roads with a lane count")
	assert_eq(points, 104214, "road points")
	assert_eq(kinds, {&"primary": 1007, &"secondary": 1299, &"tertiary": 947, &"residential": 12152, &"service": 4167, &"footway": 1053} as Dictionary[StringName, int], "roads by kind")
	return true


func test_known_roads() -> bool:
	var r0 := net.roads[0]
	assert_eq(r0.id, 47174270, "road 0 id")
	assert_eq(r0.kind, &"primary", "road 0 kind")
	assert_eq(r0.name, "Muthuswamy Road", "road 0 name")
	assert_eq(r0.width, 15.0, "road 0 width")
	assert_true(r0.oneway, "road 0 one-way")
	assert_eq(r0.lanes, -1, "road 0 has no lane count")
	assert_eq(r0.points.size(), 5, "road 0 points")
	assert_vec_near(r0.points[0], Vector2(8051.1, -31.5), 0.001, "road 0 first point")
	assert_vec_near(r0.points[4], Vector2(7764, 302.8), 0.001, "road 0 last point")
	var r1000 := net.roads[1000]
	assert_eq(r1000.name, "Karpagambal Nagar Road", "road 1000 name")
	assert_eq(r1000.kind, &"secondary", "road 1000 kind")
	assert_eq(r1000.width, 14.0, "road 1000 width")
	assert_eq(r1000.points.size(), 6, "road 1000 points")
	assert_vec_near(r1000.points[1], Vector2(5899.3, 5003.9), 0.001, "road 1000 second point")
	var last := net.roads[net.size() - 1]
	assert_eq(last.id, 15791691140, "last road id (more than 32 bits)")
	assert_eq(last.name, "Jamuna Bus Stop", "last road name")
	assert_eq(last.kind, &"service", "last road kind")
	assert_false(last.oneway, "last road two-way")
	assert_vec_near(last.points[2], Vector2(3053.7, 10934), 0.001, "last road third point")
	var anna := net.named("Anna Salai")
	assert_eq(anna.size(), 7, "Anna Salai segments")
	assert_eq(anna[0].id, 281389550, "first Anna Salai id")
	assert_eq(anna[0].kind, &"primary", "Anna Salai kind")
	assert_vec_near(anna[0].points[0], Vector2(7082.75, 1351.15), 0.001, "Anna Salai start")
	return true


func test_known_chunks() -> bool:
	var c := WorldFiles.read_chunk(index, 0, 0)
	assert_true(c.ok(), "chunk 0,0: " + c.error)
	assert_eq([c.key, c.buildings.size(), c.trees.size(), c.areas.size()], ["0,0", 1, 61, 2], "chunk 0,0 counts")
	assert_vec_near(c.centre, Vector2(-1615 + 125, -1091 + 125), 0.0, "chunk 0,0 centre")
	var b := c.buildings[0]
	assert_eq([b.id, b.height, b.floors, b.kind, b.height_from, b.color_hex], [1508224669, 7.1, 2, &"commercial", &"estimated", 0xe3d5ee], "chunk 0,0 building")
	assert_eq(b.outline.size(), 4, "building outline points")
	assert_vec_near(b.outline[0], Vector2(-1563.4, -861.9), 0.001, "outline 0")
	assert_vec_near(b.outline[2], Vector2(-1553.5, -820.85), 0.001, "outline 2")
	assert_vec_near(c.trees[0].position, Vector2(-1381.1, -889.2), 0.001, "tree 0")
	assert_eq([c.trees[0].scale, c.trees[0].source], [0.85, &"generated"], "tree 0 scale, source")
	assert_eq([c.areas[0].id, c.areas[0].kind, c.areas[0].outline.size()], [554594979, &"park", 4], "area 0")
	assert_vec_near(c.areas[0].outline[1], Vector2(-1550.65, -958.65), 0.001, "area 0 point 1")
	var c2 := WorldFiles.read_chunk(index, 20, 20)
	assert_eq([c2.buildings.size(), c2.trees.size(), c2.areas.size()], [78, 0, 0], "chunk 20,20 counts")
	assert_eq([c2.buildings[0].id, c2.buildings[0].kind, c2.buildings[0].color_hex], [90760303, &"apartments", 0xfbf3e4], "chunk 20,20 building")
	var c3 := WorldFiles.read_chunk(index, 17, 30)
	assert_eq([c3.buildings.size(), c3.trees.size(), c3.areas.size()], [5, 13, 1], "chunk 17,30 counts")
	assert_eq(c3.buildings[0].outline.size(), 19, "round building outline")
	assert_vec_near(c3.buildings[0].outline[18], Vector2(2854.5, 6550.2), 0.001, "round building last point")
	assert_eq([c3.trees[0].scale, c3.trees[0].source], [0.93, &"osm"], "mapped tree")
	var tall := WorldFiles.read_chunk(index, 29, 6)
	var found: Building = null
	for x in tall.buildings:
		if x.id == 354261248:
			found = x
	if assert_true(found != null, "building 354261248 in chunk 29,6"):
		assert_eq([found.height, found.floors, found.kind, found.height_from, found.outline.size()], [25.0, 8, &"apartments", &"height", 18], "mapped height")
		assert_vec_near(found.outline[9], Vector2(5736.85, 433.55), 0.001, "mapped building point 9")
	return true


func test_every_chunk_decodes_with_known_totals() -> bool:
	var files := 0
	var nb := 0
	var nt := 0
	var na := 0
	var osm_trees := 0
	var verts := 0
	var heights := 0.0
	var tallest := 0.0
	var kinds: Dictionary[StringName, int] = {}
	var from: Dictionary[StringName, int] = {}
	var bad := PackedStringArray()
	for key: String in index.chunk_sizes:
		var parts := key.split(",")
		var col := int(parts[0])
		var row := int(parts[1])
		if not index.has_chunk_file(col, row):
			continue
		files += 1
		var c := WorldFiles.read_chunk(index, col, row)
		if not c.ok():
			bad.append(c.error)
			continue
		nb += c.buildings.size()
		nt += c.trees.size()
		na += c.areas.size()
		for b in c.buildings:
			verts += b.outline.size()
			heights += b.height
			tallest = maxf(tallest, b.height)
			kinds[b.kind] = kinds.get(b.kind, 0) + 1
			from[b.height_from] = from.get(b.height_from, 0) + 1
		for t in c.trees:
			osm_trees += 1 if t.source == &"osm" else 0
	assert_eq(bad, PackedStringArray(), "chunks that failed")
	assert_eq(files, 1877, "chunk files")
	assert_eq([nb, nt, na], [106619, 44541, 1059], "buildings, trees, areas")
	assert_eq(verts, 498912, "building outline points")
	assert_near(heights, 777771.4, 0.5, "sum of building heights")
	assert_eq(tallest, 80.0, "tallest building")
	assert_eq(osm_trees, 863, "mapped trees")
	assert_eq(kinds, {&"house": 97223, &"apartments": 8675, &"commercial": 721} as Dictionary[StringName, int], "buildings by kind")
	assert_eq(from, {&"estimated": 103026, &"levels": 3585, &"height": 8} as Dictionary[StringName, int], "height sources")
	return true


## A chunk file built by hand the way `encodeChunk` writes it.
static func _chunk_bytes(format: int, col: int, row: int) -> PackedByteArray:
	var w := StreamPeerBuffer.new()
	w.big_endian = false
	w.put_u32(WorldCodec.CHUNK_MAGIC)
	w.put_u16(format)
	w.put_16(col)
	w.put_16(row)
	w.put_u16(1)  # buildings
	w.put_u16(1)  # trees
	w.put_u16(0)  # areas
	w.put_u32(42)
	w.put_u16(123)  # 12.3 m
	w.put_u8(4)
	w.put_u8(1 | (2 << 2))  # apartments, height from OSM
	w.put_u8(5)
	w.put_u16(3)
	for p: Vector2i in [Vector2i(0, 0), Vector2i(200, 0), Vector2i(-20, -40)]:  # quantised (x, z)
		w.put_16(p.x)
		w.put_16(p.y)
	w.put_16(-2500)
	w.put_16(2499)
	w.put_u8(110)
	w.put_u8(1)
	return w.data_array


func test_hand_made_chunk() -> bool:
	var bounds := Rect2(-1000, -500, 4000, 3000)
	var c := WorldCodec.decode_chunk(_chunk_bytes(1, 2, 3), bounds, 250.0)
	assert_true(c.ok(), "decodes: " + c.error)
	var centre := Vector2(-1000 + 2.5 * 250, -500 + 3.5 * 250)
	assert_vec_near(c.centre, centre, 0.0, "centre from the given bounds")
	var b := c.buildings[0]
	assert_eq([b.id, b.height, b.floors, b.kind, b.height_from, b.color_hex], [42, 12.3, 4, &"apartments", &"height", WorldCodec.WALL_COLORS[5]], "building fields")
	assert_vec_near(b.outline[1], centre + Vector2(10, 0), 0.0001, "5 cm steps")
	assert_vec_near(b.outline[2], centre + Vector2(-1, -2), 0.0001, "negative offsets")
	assert_vec_near(c.trees[0].position, centre + Vector2(-125, 124.95), 0.0001, "tree at the square's edge")
	assert_eq([c.trees[0].scale, c.trees[0].source], [1.1, &"osm"], "tree fields")
	return true


func test_refuses_other_format_versions() -> bool:
	var bounds := Rect2(0, 0, 1000, 1000)
	var v2 := WorldCodec.decode_chunk(_chunk_bytes(2, 0, 0), bounds, 250.0)
	assert_false(v2.ok(), "chunk format 2 refused")
	assert_contains(v2.error, "format 2, expected 1", "chunk error names both versions")
	assert_eq(v2.buildings.size(), 0, "nothing decoded from a refused chunk")
	var roads := PackedByteArray([0x43, 0x4f, 0x57, 0x52, 0, 0, 0, 0, 0, 0])  # magic, format 0
	var r := WorldCodec.decode_roads(roads, PackedStringArray())
	assert_contains(r.error, "format 0, expected 1", "roads format 0 refused")
	var junk := WorldCodec.decode_chunk(PackedByteArray([1, 2, 3, 4, 5, 6]), bounds, 250.0)
	assert_eq(junk.error, "Not a chunk file.", "wrong magic")
	var road_junk := WorldCodec.decode_roads(_chunk_bytes(1, 0, 0), PackedStringArray())
	assert_eq(road_junk.error, "Not a roads file.", "chunk bytes are not a roads file")
	return true


func test_truncated_files_fail_cleanly() -> bool:
	var bytes := _chunk_bytes(1, 0, 0)
	var cut := WorldCodec.decode_chunk(bytes.slice(0, bytes.size() - 3), Rect2(0, 0, 1000, 1000), 250.0)
	assert_false(cut.ok(), "truncated chunk")
	assert_contains(cut.error, "truncated", "says truncated")
	var roads := FileAccess.get_file_as_bytes(WorldFiles.DEFAULT_DIR.path_join(index.roads_file))
	var short := WorldCodec.decode_roads(roads.slice(0, 5000), index.road_names)
	assert_false(short.ok(), "truncated roads")
	assert_contains(short.error, "truncated", "roads say truncated")
	var nameless := WorldCodec.decode_roads(roads, PackedStringArray(["Only one name"]))
	assert_false(nameless.ok(), "road name table too short")
	return true
