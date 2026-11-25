extends TestCase
## The fight wired into the real game (`main.tscn` in the streamed city, G-410…G-429): one
## `CombatWiring` made during loading, the HUD row under the money line, the Wanted instance
## shared with the carjacking and the street reactions (no more null hooks), the bat lying near
## home picked up on foot, a shot in the street bringing a police car along the real road graph
## from out of sight, children kept out of a fight's ring, and the fight's main-thread cost.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180

var _old_origin: Vector2


func before_each() -> void:
	_old_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(ArmsWiring.DEFAULT_SAVE))


func _restore() -> void:
	tree.paused = false
	WorldOrigin.recentre(_old_origin.x, _old_origin.y)
	Sound.suspend()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(ArmsWiring.DEFAULT_SAVE))


func test_combat_in_the_real_game() -> bool:
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		main.queue_free()
		_restore()
		return true
	main.play()
	await wait_physics_frames(30)
	var cw := main.combat
	if not assert_true(cw != null, "the fight is wired in during loading"):
		main.queue_free()
		_restore()
		return true
	assert_true(main.carjacking.wanted == cw.wanted(), "the carjacking reports to the game's Wanted")
	assert_true(main.street_reactions.wanted == cw.wanted() and main.street_reactions.report_crime.is_valid(), "the street reactions report hit-and-runs to the police")
	var layer := main.find_child("MissionsLayer", false, false) as MissionsLayer
	assert_true(layer.hud.column.find_child("CombatRow", false, false) != null, "the health row is on the HUD")
	assert_true(cw.hud.bar.is_visible_in_tree(), "the health bar shows in play")
	assert_true(main.rig.controls.fight_button(&"hit").is_visible_in_tree(), "HIT shows on foot")
	# The main-thread cost of the fight's step with nobody to fight.
	cw.stats["usec_max"] = 0
	cw.stats["usec_total"] = 0
	cw.stats["steps"] = 0
	await wait_physics_frames(120)
	var idle := float(cw.stats["usec_total"]) / maxf(1.0, float(cw.stats["steps"]))
	print("combat idle step: mean %.0f us, max %d us" % [idle, int(cw.stats["usec_max"])])
	assert_true(idle < 1000.0, "the idle step is cheap (%.0f us)" % idle)
	# The bat near home.
	var bat: Dictionary = {}
	for p: Dictionary in layer.session.content.pickups:
		if str(p["weapon"]) == "bat":
			bat = p
	var spot := Vector2(float(bat["x"]), float(bat["z"]))
	main.rig.place(WorldOrigin.to_scene_xz(spot.x + 3.0, spot.y, 0.05), 0.0)
	await wait_until(func() -> bool: return main.world.world_ready_around(spot), 60 * 60)
	assert_true(await wait_until(func() -> bool: return cw.arms.pickup_views_shown() > 0, 60), "the pickup is drawn near it")
	main.rig.place(WorldOrigin.to_scene_xz(spot.x, spot.y, 0.05), 0.0)
	assert_true(await wait_until(func() -> bool: return cw.combat.arsenal.has("bat"), 60 * 2), "the bat picked up on foot")
	# Children are kept out of a fight's ring: a fight declared where a child of the crowd is.
	var child := Vector2.INF
	for p in main.life.population.people:
		if p.child:
			child = p.pos
			break
	if child != Vector2.INF:
		main.life.fight_points = PackedVector2Array([child])
		await wait_physics_frames(4)
		assert_true(main.life.children_kept_out > 0, "children inside the ring are not drawn")
	else:
		print("combat main: no child in the crowd round the bat (the ring was not exercised here; see test_strikes)")
	# A shot in the street: one star, and a police car comes along the roads from out of sight.
	cw.combat.arsenal.give("pistol", 6)
	cw.combat.arsenal.select("pistol")
	main.rig.controls.fire_held = true
	assert_true(await wait_until(func() -> bool: return cw.combat.arsenal.ammo_of("pistol") < 6, 60), "a shot")
	main.rig.controls.fire_held = false
	assert_eq(cw.police.wanted.stars, 1, "one star for gunfire")
	await wait_frames(2)
	assert_true(cw.hud.stars.is_visible_in_tree(), "the stars show")
	assert_true(await wait_until(func() -> bool: return cw.police.cars().size() == 1, 60 * 8), "a car is sent")
	var me := WorldOrigin.to_world(main.rig.body.global_position)
	var car: Dictionary = cw.police.cars()[0]
	assert_true(Vector2(float(car["x"]), float(car["z"])).distance_to(me) > 60.0, "it appears away from the player")
	await wait_physics_frames(60)
	assert_eq(str(cw.police.cars()[0]["mode"]), "route", "it drives the road graph")
	main.queue_free()
	await wait_physics_frames(2)
	_restore()
	return true
