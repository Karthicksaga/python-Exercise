extends TestCase
## What roads do to vehicles (G-450): the condition of the way under a point turned into
## `RoadStyle.feel`, puddles from the chunk's plan, kind-by-kind sensitivity, never building a layout.

const SPAWN := Vector2i(6, 4)


## The midpoint of a segment of a road with condition `want` that nothing else covers, or null.
func _find(surface: RoadSurface, want: StringName) -> Variant:
	for dx in range(-3, 4):
		for dz in range(-3, 4):
			var layout := surface.layouts.layout_for(SPAWN + Vector2i(dx, dz))
			for road in layout.roads:
				if road.width < 3.0 or road.is_raised() or road.tunnel or RoadStyle.klass_of(road) == RoadStyle.PATH:
					continue
				for i in road.points.size() - 1:
					if road.points[i].distance_to(road.points[i + 1]) < 8.0:
						continue
					var mid := road.points[i].lerp(road.points[i + 1], 0.5)
					var found := surface.lookup(mid)
					if found["condition"] == want and found["on_road"]:
						return mid
	return null


func test_condition_under_a_point_gives_the_feel_numbers() -> bool:
	var surface := RoadSurface.create(CityTestKit.kit().layouts)
	var prev_speed := 1.0
	for c: StringName in [RoadStyle.GOOD, RoadStyle.WORN, RoadStyle.DAMAGED, RoadStyle.UNPAVED]:
		var at: Variant = _find(surface, c)
		if not assert_true(at != null, "a %s road is near the spawn" % c):
			continue
		var f := surface.feel_at(at as Vector2)
		var want := RoadStyle.feel(c)
		assert_eq(float(f["top_speed"]), float(want["top_speed"]), "%s top speed" % c)
		assert_eq(float(f["grip"]), float(want["grip"]), "%s grip" % c)
		assert_eq(float(f["bump"]), float(want["bump"]), "%s bump" % c)
		assert_true(float(f["top_speed"]) <= prev_speed, "%s is no faster than the one before" % c)
		prev_speed = float(f["top_speed"])
		assert_false(bool(f["wet"]), "no puddle noted yet")
	return true


func test_off_the_road_and_unready_tiles_are_plain() -> bool:
	var surface := RoadSurface.create(CityTestKit.kit().layouts)
	var f := surface.feel_at(Vector2(-900000.0, -900000.0))
	assert_false(bool(f["on_road"]), "far from any road")
	assert_eq(float(f["top_speed"]), 1.0, "plain top speed")
	assert_eq(float(f["bump"]), 0.0, "plain bump")
	# The regional world builds a tile's layout on first use; the surface never asks for one.
	var regional := CityTestKit.regional()
	var fresh := CityLayouts.create(regional)
	var cold := RoadSurface.create(fresh)
	var p := regional.get_bounds().get_center()
	assert_false(fresh.has_tile(regional.tile_of(regional.cell_at(p))), "the tile is not built")
	assert_false(bool(cold.feel_at(p)["on_road"]), "a tile that is not ready is plain tar")
	assert_false(fresh.has_tile(regional.tile_of(regional.cell_at(p))), "asking did not build it")
	return true


func test_puddles_of_a_chunk_slow_and_wet() -> bool:
	var surface := RoadSurface.create(CityTestKit.kit().layouts)
	var at: Variant = _find(surface, RoadStyle.DAMAGED)
	if not assert_true(at != null, "a damaged road"):
		return true
	var p := at as Vector2
	var mark := RoadDetail.Mark.new()
	mark.kind = &"puddle"
	mark.position = p
	mark.dir = Vector2.RIGHT
	mark.length = 4.0
	mark.width = 2.0
	var cell := CityTestKit.kit().source.cell_at(p)
	surface.note_chunk(cell, false, [mark])
	var dry := RoadStyle.feel(RoadStyle.DAMAGED)
	var wet := surface.feel_at(p)
	assert_true(bool(wet["wet"]), "in the puddle")
	assert_true(float(wet["top_speed"]) < float(dry["top_speed"]) and float(wet["top_speed"]) > float(dry["top_speed"]) * 0.85, "a puddle slows a little more")
	assert_true(float(wet["grip"]) < float(dry["grip"]), "and cuts grip")
	var inside := surface.feel_at(p + Vector2(0.0, 0.9))
	assert_true(not bool(inside["on_road"]) or bool(inside["wet"]), "0.9 m to the side is still inside the puddle (half width 1 m)")
	assert_false(bool(surface.feel_at(p + Vector2(0.0, 1.2))["wet"]), "outside its half width (1 m) it is dry")
	assert_false(bool(surface.feel_at(p + Vector2(2.5, 0.0))["wet"]), "past its half length (2 m) it is dry")
	return true


func test_a_built_chunk_reports_its_puddles() -> bool:
	var kit := CityTestKit.kit()
	var saved := kit.surface
	kit.surface = RoadSurface.create(kit.layouts)
	var found_puddles := 0
	var found_cells := 0
	for dx in range(-8, 9):
		for dz in range(-8, 9):
			var cell := SPAWN + Vector2i(dx, dz)
			var built := ChunkBuilder.build(kit, cell)
			var info := kit.surface.chunk_info(cell)
			if info != null:
				found_cells += 1
				found_puddles += info.puddles.size() / 6
				assert_eq(info.rural, built.roads.rural, "rural flag")
			CityTestKit.free_build(built)
	kit.surface = saved
	assert_true(found_cells > 20, "chunks reported themselves (%d)" % found_cells)
	assert_true(found_puddles > 0, "some chunk has a puddle (%d)" % found_puddles)
	return true


func test_cheap_vehicles_feel_a_bad_road_most() -> bool:
	var mud := RoadStyle.feel(RoadStyle.UNPAVED)
	var bike := Vehicle.create(&"motorbike")
	var auto := Vehicle.create(&"auto")
	var car := Vehicle.create(&"hatchback")
	var bus := Vehicle.create(&"bus")
	for v: Vehicle in [bike, auto, car, bus]:
		v.apply_road(mud)
	assert_near(bike.ground_target.top_speed, 0.65, 1e-4, "a bike keeps 65 % of its speed in mud")
	assert_near(auto.ground_target.top_speed, 0.65, 1e-4, "an auto too")
	assert_true(car.ground_target.top_speed > bike.ground_target.top_speed, "a car loses less")
	assert_true(bus.ground_target.top_speed > car.ground_target.top_speed, "a bus the least")
	assert_true(bike.ground_target.grip < car.ground_target.grip and car.ground_target.grip < bus.ground_target.grip, "grip likewise")
	assert_true(bike.ground_target.bump > bus.ground_target.bump and bus.ground_target.bump > 0.0, "every body feels the bumps, bikes most")
	bike.apply_road({})
	assert_true(bike.ground_target.is_neutral(), "an empty feel is good tar")
	for v: Vehicle in [bike, auto, car, bus]:
		v.free()
	return true
