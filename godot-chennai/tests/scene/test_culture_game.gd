extends TestCase
## Culture in the real game (G-470…G-479): the streamed city with the real temple, coast and rivers.
## The temple's sandal stand, gate and lamp can be walked to by the real player body through the
## gopuram's passage; a ring of free ground round the shrines exists for the walk round; the props
## stand on the ground; the temple's grounds keep the peace; the sea at the Marina and a real river
## can be swum and left safely. Waits in game time.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180
const SETTINGS := "user://test_culture_game_save.json"

var _old_hour: float
var _old_weather: String
var _old_sound: String
var _old_origin: Vector2
var _old_save: Variant = null


func before_each() -> void:
	_old_hour = GameLoop.clock.hour
	_old_weather = Weather.settings_path
	_old_sound = Sound.settings_path
	_old_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	_old_save = FileAccess.get_file_as_string(SaveStore.DEFAULT_PATH) if FileAccess.file_exists(SaveStore.DEFAULT_PATH) else null
	GameLoop.clock.hour = 14.0
	Weather.settings_path = SETTINGS
	Sound.settings_path = SETTINGS
	Weather.set_raining(false, true, false)


func _restore() -> void:
	tree.paused = false
	WorldOrigin.recentre(_old_origin.x, _old_origin.y)
	GameLoop.clock.hour = _old_hour
	Weather.set_raining(false, true, false)
	Weather.settings_path = _old_weather
	Sound.settings_path = _old_sound
	Sound.set_calm(0.0)
	Sound.step_gain = 1.0
	Sound.suspend()
	if _old_save == null:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	else:
		var f := FileAccess.open(SaveStore.DEFAULT_PATH, FileAccess.WRITE)
		f.store_string(String(_old_save))
		f.close()


func _play() -> Main:
	# A fresh journal: the test starts from no save.
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		return null
	main.play()
	await wait_physics_frames(2)
	return main


## Puts the player on the ground at a world point (streaming it in first), facing `yaw`.
func _arrive(main: Main, point: Vector2, yaw: float = 0.0) -> bool:
	main.world.focus_node = null
	main.world.focus = point
	var ready := await main.world.wait_ready_around(point, 150.0)
	main.rig.place(WorldOrigin.to_scene(point, 1.0), yaw)
	main.world.focus_node = main.rig.body
	await wait_physics_frames(30)
	return ready


func _world(main: Main) -> Vector2:
	return WorldOrigin.to_world(main.rig.body.global_position)


## Walks the real body to a world point with the stick (camera facing north), up to `seconds`.
func _walk_to(main: Main, goal: Vector2, seconds: float = 25.0) -> bool:
	# The test is the stick: the rig must not read the (absent) devices over it.
	main.rig.reads_devices = false
	for i in int(seconds * 60.0):
		var d := goal - _world(main)
		if d.length() < 1.0:
			main.rig.body.input = PlayerInput.make(Vector2.ZERO, 0.0)
			return true
		var dir := d.normalized()
		# Camera yaw 0 looks north: stick forward is -Z.
		main.rig.body.input = PlayerInput.make(Vector2(dir.x, -dir.y), 0.0)
		await wait_physics_frames(1)
	main.rig.body.input = PlayerInput.make(Vector2.ZERO, 0.0)
	return false


func test_the_temple_in_the_real_city() -> bool:
	var main := await _play()
	if main == null:
		return true
	var culture := main.culture
	assert_true(culture != null, "the game has culture wiring")
	var data := culture.data
	assert_true(await _arrive(main, data.temple.stand + Vector2(14.0, 6.0)), "the streets round the temple load")
	await wait_physics_frames(30)
	# The props stand on the ground (a ray found it), not in the air or under it.
	assert_true(culture._ground_set, "the ground under the sandal stand was found")
	var stand_y: float = culture.props.stand.global_position.y
	assert_true(absf(stand_y - main.rig.body.global_position.y) < 1.0, "the stand is at the player's ground level (%.2f vs %.2f)" % [stand_y, main.rig.body.global_position.y])
	# The forecourt: inside the grounds, the peace zone's rules and calm.
	assert_true(culture.visit.inside, "inside the temple's grounds")
	assert_true(culture.journal.has_visited(data.stops[0].id), "the temple is in the journal")
	assert_false(culture.peace.allows("violence", _world(main)), "peace here")
	assert_true(Sound._calm > 0.0, "the sound calms")
	# Walk to the stand and leave the sandals with the real ACTION button.
	assert_true(await _walk_to(main, data.temple.stand), "walked to the sandal stand")
	var context := main.rig.controls.action_context
	assert_eq(context.label(), "LEAVE SANDALS", "the stand offers its action")
	context.trigger()
	assert_true(culture.visit.shoes_off, "sandals left")
	# Through the gate (the east gopuram's passage) to the lamp, by the real physics body.
	var gate := Vector2(6513.2, 5722.1)
	var inside := Vector2(6503.0, 5718.0)
	assert_true(await _walk_to(main, gate, 12.0), "walked into the gopuram's passage (%s)" % _world(main))
	assert_true(await _walk_to(main, inside, 12.0), "and out of it, into the compound (%s)" % _world(main))
	assert_true(await _walk_to(main, data.temple.lamp, 12.0), "to the lamp (%s)" % _world(main))
	assert_eq(context.label(), "LIGHT LAMP", "the lamp offers its action")
	context.trigger()
	assert_true(culture.visit.lamp_lit and culture.props.lit(), "the lamp is lit")
	# Vehicles stay outside: the nearest parked vehicle cannot be entered from here.
	assert_true(main.play_wiring.driving.peace == culture.peace, "driving keeps the zone's rules")
	return true


## The free ground ring round the shrines: shape queries (a player-sized cylinder) on a 1 m grid
## inside the walk-round annulus, the biggest connected piece reaches every 10 degrees of the circle.
func test_a_ring_of_free_ground_goes_round_the_shrines() -> bool:
	var main := await _play()
	if main == null:
		return true
	var data := main.culture.data
	var c := data.temple.circle_centre
	assert_true(await _arrive(main, c + Vector2(30.0, 10.0)), "the temple's streets load")
	await wait_physics_frames(60)
	var space := main.rig.body.get_world_3d().direct_space_state
	var shape := CylinderShape3D.new()
	shape.radius = PlayerController.RADIUS
	shape.height = 1.4
	var compound := _compound(main)
	var free: Dictionary[Vector2i, bool] = {}
	var r_min := data.temple.circle_min
	var r_max := data.temple.circle_max
	for x in range(int(c.x - r_max) - 1, int(c.x + r_max) + 2):
		for z in range(int(c.y - r_max) - 1, int(c.y + r_max) + 2):
			var p := Vector2(float(x), float(z))
			var r := p.distance_to(c)
			if r < r_min or r > r_max or not Geometry2D.is_point_in_polygon(p, compound):
				continue
			var q := PhysicsShapeQueryParameters3D.new()
			q.shape = shape
			q.transform = Transform3D(Basis.IDENTITY, WorldOrigin.to_scene(p, 1.0))
			q.collision_mask = PlayerController.LAYER_WORLD
			if space.intersect_shape(q, 1).is_empty():
				free[Vector2i(x, z)] = true
	assert_true(free.size() > 600, "the annulus has free ground (%d cells)" % free.size())
	# The biggest 4-connected piece.
	var seen: Dictionary[Vector2i, bool] = {}
	var best: Array[Vector2i] = []
	for start in free:
		if seen.has(start):
			continue
		var piece: Array[Vector2i] = [start]
		var queue: Array[Vector2i] = [start]
		seen[start] = true
		while not queue.is_empty():
			var at: Vector2i = queue.pop_back()
			for step: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var n := at + step
				if free.has(n) and not seen.has(n):
					seen[n] = true
					piece.append(n)
					queue.append(n)
		if piece.size() > best.size():
			best = piece
	var sectors: Dictionary[int, bool] = {}
	for cell in best:
		var a := atan2(float(cell.y) - c.y, float(cell.x) - c.x)
		sectors[int((a + PI) / TAU * 36.0) % 36] = true
	assert_eq(sectors.size(), 36, "one connected stretch of free ground reaches all 36 sectors of the circle (%d)" % sectors.size())
	return true


## The compound's outline (world metres) from the temple's spec.
func _compound(main: Main) -> PackedVector2Array:
	for spec in LandmarkSpec.load_all():
		if spec.id == "kapaleeshwarar-temple":
			return spec.outline("compound")
	return PackedVector2Array()


func test_swimming_at_the_marina_and_in_a_real_river() -> bool:
	var main := await _play()
	if main == null:
		return true
	var culture := main.culture
	var sea := main.source.get_sea()
	assert_true(sea != null, "the world has a sea")
	# The Marina: the shore nearest to the beach's stop.
	var beach := culture.data.stop("marina-beach").position
	var shore := Vector2.ZERO
	var best := INF
	for i in sea.coast.size() - 1:
		var c := Geometry2D.get_closest_point_to_segment(beach, sea.coast[i], sea.coast[i + 1])
		if c.distance_to(beach) < best:
			best = c.distance_to(beach)
			shore = c
	assert_true(best < 400.0, "the coast is near the beach's stop (%.0f m)" % best)
	var sample := culture.water.sample(shore + Vector2(0.5, 0.0))
	assert_true(sample != null and sample.kind == &"sea", "the water probe finds the sea there")
	var land := shore - sample.inward * 3.0
	assert_true(await _arrive(main, land, 0.0), "the beach loads")
	assert_true(culture.swim.entry(_world(main)) != null, "the water is within reach from the beach")
	# The entry look-up runs five times a second on the main thread: it must stay cheap (G-474).
	var started := Time.get_ticks_usec()
	for i in 200:
		culture.swim.entry(_world(main) + Vector2(float(i % 7) * 40.0, 0.0))
	var per_call := float(Time.get_ticks_usec() - started) / 200.0
	print("    swim entry look-up at the Marina: %.0f us per call" % per_call)
	assert_true(per_call < 1500.0, "the entry look-up is cheap (%.0f us)" % per_call)
	assert_eq(main.rig.controls.action_context.label(), "SWIM", "SWIM is offered")
	main.rig.controls.action_context.trigger()
	assert_true(main.rig.body.swimming, "swimming in the sea")
	var surface := main.rig.body.global_position.y
	assert_true(absf(surface - 0.01) < 0.05, "on the sea's surface (%.2f)" % surface)
	await wait_physics_frames(60)
	# Get out by the button.
	main.rig.controls.action_context.trigger()
	await wait_physics_frames(20)
	assert_false(main.rig.body.swimming, "out of the sea")
	assert_true(main.rig.body.global_position.y > -0.3, "standing on the beach")
	# A real river: the widest swimmable waterway in a tile near the middle of the city.
	var regional := main.source as RegionalWorldSource
	var pick: WorldWaterway = null
	var tile := regional.tile_of(regional.cell_at(Vector2(5000.0, 3000.0)))
	var infra := regional.tile_infra(tile)
	if infra != null and infra.ok():
		for w in infra.waterways:
			if not w.tunnel and w.kind in [&"river", &"canal"] and w.points.size() >= 3 and (pick == null or w.width > pick.width):
				pick = w
	assert_true(pick != null, "a river or canal in the tile")
	if pick == null:
		return true
	var mid := pick.points[pick.points.size() / 2]
	var probe := culture.water.sample(mid)
	assert_true(probe != null and probe.kind == pick.kind and probe.depth > 0.0, "the probe finds the river at its centre line")
	var bank := probe.shore - probe.inward * 3.0
	assert_true(await _arrive(main, bank, 0.0), "the riverside loads")
	var edge := culture.swim.entry(_world(main))
	assert_true(edge != null, "the river is within reach from the bank")
	if edge == null:
		return true
	main.rig.controls.action_context.trigger()
	assert_true(main.rig.body.swimming, "swimming in the river")
	assert_true(absf(main.rig.body.global_position.y - (-0.75)) < 0.1, "at the river's water level (%.2f)" % main.rig.body.global_position.y)
	await wait_physics_frames(30)
	main.rig.controls.action_context.trigger()
	await wait_physics_frames(60)
	assert_false(main.rig.body.swimming, "out of the river")
	var feet := WorldOrigin.to_world(main.rig.body.global_position)
	assert_true(feet.distance_to(bank) < 12.0, "on the bank, not carried away (%.1f m)" % feet.distance_to(bank))
	assert_true(main.rig.body.global_position.y > -0.3, "standing on the ground, not under it (%.2f)" % main.rig.body.global_position.y)
	return true
