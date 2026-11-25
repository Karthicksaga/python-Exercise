extends TestCase
## Culture in the game, on a flat ground with the real player (G-480…G-489): arriving at a place
## writes the journal and saves it, the temple visit works through the ACTION button (sandals, lamp,
## the walk round), swimming starts at the water's edge and ends on the shore, the swimmer is held
## inside the rope line and stops swimming when tired. Waits in game time.

const SAVE := "user://test-culture-wiring.json"
const HALF := 1500.0

## A test place: a stop near the start, a temple 400 m east with its zone, a sea to the west.
const JSON_TEXT := """
{
  "format": 1,
  "stops": [
    {"id": "ripon-building", "kind": "civic", "position": [100, 0], "radius": 30},
    {"id": "kapaleeshwarar-temple", "kind": "temple", "position": [400, 0], "radius": 75, "on_foot": true, "activity": "temple_visit"}
  ],
  "peace_zones": [
    {"id": "kapaleeshwarar", "stop": "kapaleeshwarar-temple", "centre": [400, 0], "radius": 75, "walk_radius": 62,
     "rules": {"violence": false, "wanted": false, "crash_effects": false, "horn": false, "boarding": false, "take_over": false, "run": false, "swim": false}}
  ],
  "temple_visit": {"zone": "kapaleeshwarar", "stand": [430, 0], "stand_reach": 4.5, "lamp": [415, 10], "lamp_reach": 3.5,
    "circle": {"centre": [400, 0], "r_min": 12, "r_max": 34, "turns": 0.9, "clockwise": true}, "barefoot_step_gain": 0.45},
  "swim": {"kinds": ["sea", "river"], "entry_reach": 4.5, "sea_limit": 30, "bank_margin": 0.45, "speed": 1.7, "stamina_seconds": 20, "recover_seconds": 10,
    "idle_drain": 0.3, "tired_drift_speed": 1.3, "sea_surface": 0.01, "river_surface": -0.75, "no_swim_zones": []}
}
"""

var rig: PlayerRig
var driving: Driving
var wiring: CultureWiring
var toasts: Array[String] = []
var _old_origin: Vector2


func before_each() -> void:
	_old_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	WorldOrigin.recentre(0.0, 0.0)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	toasts.clear()
	var ground := StaticBody3D.new()
	ground.name = "Ground"
	ground.collision_layer = PhysicsLayers.WORLD
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(HALF * 2.0, 1.0, HALF * 2.0)
	shape.shape = box
	shape.position = Vector3(0, -0.5, 0)
	ground.add_child(shape)
	root.add_child(ground)
	rig = PlayerRig.new()
	rig.name = "PlayerRig"
	rig.reads_devices = false
	root.add_child(rig)
	driving = Driving.new()
	driving.name = "Driving"
	driving.rider = PlayerRiderLink.make(rig.body)
	root.add_child(driving)
	var data := CultureData.parse(JSON_TEXT)
	wiring = CultureWiring.make(null, rig, driving, data, SAVE)
	wiring.toast = func(title: String, detail: String, _seconds: float) -> void: toasts.append("%s|%s" % [title, detail])
	# A sea along x = -200: land to the east of it.
	var sea := WorldSea.new()
	sea.coast = PackedVector2Array([Vector2(-200, 3000), Vector2(-200, -3000)])
	sea.outline = PackedVector2Array([Vector2(-6000, -3000), Vector2(-200, -3000), Vector2(-200, 3000), Vector2(-6000, 3000)])
	wiring.water.sea = sea
	root.add_child(wiring)
	await wait_physics_frames(2)


func _restore() -> void:
	Sound.set_calm(0.0)
	Sound.step_gain = 1.0
	WorldOrigin.recentre(_old_origin.x, _old_origin.y)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))


func _put(x: float, z: float) -> void:
	rig.place(Vector3(x, 0.05, z), 0.0)


func _toasted(text: String) -> bool:
	for t in toasts:
		if t.contains(text):
			return true
	return false


func test_arriving_at_a_place_writes_the_journal_toasts_and_saves() -> bool:
	assert_eq(wiring.journal.count(), 0, "an empty journal")
	_put(100.0, 10.0)
	var seen := await wait_until(func() -> bool: return wiring.journal.has_visited("ripon-building"), 60)
	assert_true(seen, "standing at the place writes it")
	assert_true(_toasted("Added to your heritage journal") and _toasted("Ripon Building"), "with a toast naming it: %s" % str(toasts))
	assert_true(HeritageJournal.load_from(SaveStore.new(SAVE).read()).has_visited("ripon-building"), "and the save has it")
	var count := toasts.size()
	_put(-50.0, 0.0)
	await wait_physics_frames(30)
	_put(100.0, 10.0)
	await wait_physics_frames(30)
	assert_eq(toasts.size(), count, "returning is not announced again")
	assert_eq(wiring.journal.visits("ripon-building"), 1, "(the first arrival counts once)")
	# The temple needs a walk: it is not written by driving past in a vehicle.
	assert_false(wiring.journal.has_visited("kapaleeshwarar-temple"), "the temple is not visited yet")
	return true


func test_the_temple_visit_through_the_action_button() -> bool:
	var context := rig.controls.action_context
	_put(430.0, 0.0)
	await wait_physics_frames(20)
	assert_true(wiring.visit.inside, "inside the temple's grounds")
	assert_true(wiring.journal.has_visited("kapaleeshwarar-temple"), "the temple is in the journal on arrival on foot")
	assert_true(_toasted("Kapaleeshwarar Temple"), "welcomed")
	assert_eq(rig.body.run_scale, PlayerController.WALK_SPEED / PlayerController.RUN_SPEED, "walking pace only inside")
	assert_eq(context.label(), "LEAVE SANDALS", "the ACTION button offers the stand")
	assert_true(context.trigger(), "pressed")
	assert_true(wiring.visit.shoes_off and wiring.props.pair_shown(), "the sandals are on the stand")
	assert_eq(Sound.step_gain, 0.45, "barefoot steps are softer")
	assert_eq(context.label(), "", "nothing else here")
	_put(415.0, 10.0)
	await wait_physics_frames(10)
	assert_eq(context.label(), "LIGHT LAMP", "the lamp is offered at the lamp")
	assert_true(context.trigger(), "lit")
	assert_true(wiring.visit.lamp_lit and wiring.props.lit(), "the flame shows")
	# The walk round, clockwise, 20 m from the middle.
	for i in 400:
		var a := TAU * 0.95 * float(i) / 400.0
		_put(400.0 + cos(a) * 20.0, sin(a) * 20.0)
		await wait_physics_frames(1)
		if wiring.visit.done:
			break
	assert_true(wiring.visit.done, "the walk round was counted")
	assert_true(wiring.journal.is_done("kapaleeshwarar-temple"), "the journal says the visit was done")
	assert_true(_toasted("walked round the shrines"), "and says so")
	assert_true(HeritageJournal.load_from(SaveStore.new(SAVE).read()).is_done("kapaleeshwarar-temple"), "saved")
	# Out of the grounds: sandals back, normal speed and sound.
	_put(400.0 + 300.0, 0.0)
	await wait_physics_frames(10)
	assert_false(wiring.visit.shoes_off, "sandals back on")
	assert_eq(rig.body.run_scale, 1.0, "running again")
	assert_eq(Sound.step_gain, 1.0, "shoes on")
	assert_true(wiring.props.lit(), "the lamp stays lit")
	return true


func test_a_peace_zone_is_calm_and_keeps_its_rules() -> bool:
	_put(400.0, 20.0)
	await wait_physics_frames(10)
	var here := Vector2(400.0, 20.0)
	assert_false(wiring.peace.allows("violence", here), "no violence")
	assert_false(wiring.allow_violence(here), "the hook for the combat runtime says no")
	assert_true(_toasted("peaceful place"), "with a quiet word")
	assert_true(wiring.allow_violence(Vector2(0.0, 0.0)), "outside it is the city")
	var calm := float(Sound._calm)
	assert_true(calm > 0.5, "the city's sound calms inside (%.2f)" % calm)
	_put(0.0, 0.0)
	await wait_physics_frames(10)
	assert_eq(float(Sound._calm), 0.0, "and is the city's again outside")
	return true


func test_swimming_starts_at_the_edge_is_roped_and_ends_on_the_shore() -> bool:
	var context := rig.controls.action_context
	_put(-190.0, 0.0)
	await wait_physics_frames(20)
	assert_eq(context.label(), "", "10 m from the water: no swimming offered")
	_put(-197.0, 0.0)
	await wait_physics_frames(20)
	assert_eq(context.label(), "SWIM", "at the edge: SWIM")
	assert_true(context.trigger(), "pressed")
	assert_true(rig.body.swimming and wiring.swim.swimming, "swimming")
	assert_eq(rig.body.collision_layer, 0, "no collision while swimming")
	assert_eq(context.label(), "GET OUT", "GET OUT while swimming")
	assert_true(rig.body.global_position.y < 0.5, "on the surface")
	# Swim out to sea (west) as far as it lets us.
	# Facing west (yaw +90 degrees), stick forward.
	rig.body.input = PlayerInput.make(Vector2(0.0, 1.0), PI / 2.0)
	await wait_game_seconds(18.0)
	var out := WorldOrigin.to_world(rig.body.global_position)
	assert_true(wiring.swim.swimming, "still swimming")
	assert_true(out.x >= -200.0 - 30.5 and out.x < -200.0 - 20.0, "stopped at the rope line, 30 m out (%.1f)" % out.x)
	assert_true(_toasted("rope line"), "told to stay inside it")
	# Tired out: carried back to the beach, standing, nothing lost.
	rig.body.input = PlayerInput.make(Vector2.ZERO, 0.0)
	var ashore := await wait_until(func() -> bool: return not rig.body.swimming, 60 * 120)
	assert_true(ashore, "carried back to the shore")
	assert_true(_toasted("You are tired"), "and told why")
	var feet := WorldOrigin.to_world(rig.body.global_position)
	assert_true(feet.x > -200.0, "on the land side (%.1f)" % feet.x)
	await wait_physics_frames(5)
	assert_true(rig.body.collision_layer != 0, "solid again")
	assert_true(rig.body.global_position.y > -0.1, "standing on the ground")
	assert_eq(wiring.stats["tired"], 1, "tired once")
	return true


func test_get_out_by_the_button_and_by_swimming_to_the_shore() -> bool:
	var context := rig.controls.action_context
	_put(-197.0, 0.0)
	await wait_physics_frames(20)
	context.trigger()
	assert_true(rig.body.swimming, "in")
	await wait_physics_frames(5)
	assert_true(context.trigger(), "GET OUT pressed")
	await wait_physics_frames(3)
	assert_false(rig.body.swimming, "out")
	assert_true(WorldOrigin.to_world(rig.body.global_position).x > -200.0, "on the land side")
	_put(-197.0, 0.0)
	await wait_physics_frames(20)
	context.trigger()
	await wait_physics_frames(5)
	# Facing east, back to the land.
	rig.body.input = PlayerInput.make(Vector2(0.0, 1.0), -PI / 2.0)
	var out := await wait_until(func() -> bool: return not rig.body.swimming, 60 * 20)
	assert_true(out, "swimming back at the beach gets out by itself")
	return true
