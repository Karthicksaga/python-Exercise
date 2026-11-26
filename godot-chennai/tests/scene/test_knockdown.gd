extends YardTest
## The knockdown API (docs/handoff.md, G-262) on the player's figure and on a street person:
## a throw dives, rolls and lands on the back; a push falls backwards; the body lies flat with
## every joint above the ground; it gets up in GETUP_TIME into the clips, without jumps; and a
## real bike crash in the yard plays it through `PlayerRiderLink`.


func before_each() -> void:
	await super.before_each()
	await yard.load_player()


## Steps `f` for `seconds` of 60 Hz updates; returns the largest frame-to-frame jump of any main
## joint (metres) and the lowest joint height seen.
func _steps(f: HumanFigure, seconds: float) -> Vector2:
	var r := f.poser
	var last: Array[Vector3] = []
	var jump := 0.0
	var low := INF
	for i in roundi(seconds * 60.0):
		f.advance(1.0 / 60.0, 0.0, true)
		var k := 0
		for b: int in [PoseRig.HEAD, PoseRig.HIPS, PoseRig.HAND[0], PoseRig.HAND[1], PoseRig.FOOT[0], PoseRig.FOOT[1]]:
			var p := r.at(b)
			if last.size() > k:
				jump = maxf(jump, p.distance_to(last[k]))
				last[k] = p
			else:
				last.append(p)
			k += 1
		low = minf(low, r.lowest_joint())
	return Vector2(jump, low)


func _lying_flat(f: HumanFigure, what: String) -> void:
	var r := f.poser
	var hips := r.at(PoseRig.HIPS)
	var head := r.at(PoseRig.HEAD)
	check(hips.y < 0.3, "%s: hips on the ground (%.2f m)" % [what, hips.y])
	var body := head - hips
	check(absf(body.y) < body.length() * 0.45, "%s: lying, not standing (head %.2f m above the hips)" % [what, body.y])
	check(r.lowest_joint() > -0.005, "%s: nothing under the ground (%.3f m)" % [what, r.lowest_joint()])


func test_a_throw_dives_lands_on_the_back_lies_and_gets_up() -> bool:
	var f := yard.rig.body.figure
	if not check(f.is_ready(), "the player model loads"):
		return true
	var ups := [0]
	f.got_up.connect(func() -> void: ups[0] = int(ups[0]) + 1)
	yard.rig.body.set_physics_process(false)
	f.advance(1.0 / 60.0, 0.0, true)
	# Thrown forwards (the way the figure faces) and up, as off a bike at 50 km/h.
	f.play_fall(f.global_basis * Vector3(0, 3.0, -9.0))
	check(f.knockdown_state() == &"falling", "falling")
	var air := _steps(f, 0.3)
	var head := f.poser.at(PoseRig.HEAD)
	var hips := f.poser.at(PoseRig.HIPS)
	check(head.y < hips.y + 0.3, "mid-air the dive has turned the body over (head %.2f, hips %.2f)" % [head.y, hips.y])
	f.play_landed()
	check(f.knockdown_state() == &"down", "down once landed")
	var down := _steps(f, 1.2)
	_lying_flat(f, "after the throw")
	check(f.poser.at(PoseRig.HEAD).y < 0.35, "head on the ground")
	f.play_getup()
	check(f.knockdown_state() == &"rising", "getting up")
	var rise := _steps(f, HumanFigure.GETUP_TIME + 0.05)
	check(f.knockdown_state() == &"", "up after GETUP_TIME")
	check(int(ups[0]) == 1, "got_up once")
	var steady := _steps(f, 0.3)
	check(f.poser.at(PoseRig.HEAD).y > 1.4, "standing (head %.2f m)" % f.poser.at(PoseRig.HEAD).y)
	check(f.feet_height() > -0.01 and f.feet_height() < 0.02, "soles back on the ground (%.3f m)" % f.feet_height())
	print("    joint jumps per frame: air %.3f, down %.3f, rising %.3f, after %.3f m; lowest joint down %.3f m" % [air.x, down.x, rise.x, steady.x, down.y])
	check(down.x < 0.15 and rise.x < 0.15 and steady.x < 0.08, "no snaps going down, getting up or after (%.3f, %.3f, %.3f m)" % [down.x, rise.x, steady.x])
	check(down.y > -0.005 and rise.y > -0.005, "never through the ground (%.3f, %.3f m)" % [down.y, rise.y])
	return true


func test_a_push_falls_backwards_by_itself_and_getup_waits_for_the_ground() -> bool:
	var f := yard.rig.body.figure
	if not check(f.is_ready(), "the player model loads"):
		return true
	yard.rig.body.set_physics_process(false)
	f.advance(1.0 / 60.0, 0.0, true)
	# A shove from the front: falls on its back without a dive, and lands by itself.
	f.play_fall(f.global_basis * Vector3(0, 0, 2.0))
	_steps(f, Knockdown.FALL_TIME + 0.1)
	check(f.knockdown_state() == &"down", "down without play_landed")
	_steps(f, 1.0)
	_lying_flat(f, "after the push")
	# Asked to get up mid-fall: lands first, then rises.
	f.play_getup()
	_steps(f, HumanFigure.GETUP_TIME + 0.1)
	f.play_fall(f.global_basis * Vector3(0, 0, 2.0))
	_steps(f, 0.1)
	f.play_getup()
	check(f.knockdown_state() in [&"down", &"rising"], "lands before rising (%s)" % f.knockdown_state())
	_steps(f, Knockdown.CRUMPLE_TIME + HumanFigure.GETUP_TIME + 0.1)
	check(f.knockdown_state() == &"", "and is up")
	return true


func test_a_street_person_has_the_same_api() -> bool:
	var pool := PeoplePool.new()
	yard.add_child(pool)
	var id := "it-professional-m"
	check(await pool.prepare(PackedStringArray([id])) == "", "loads")
	var v := pool.make_view(id)
	yard.add_child(v)
	v.play(&"walk", 1.4)
	v.advance(1.0 / 60.0, 5.0)
	var ups := [0]
	v.got_up.connect(func() -> void: ups[0] = int(ups[0]) + 1)
	v.play_fall(Vector3(6.0, 1.5, 0.0))
	check(v.knockdown_state() == &"falling", "falling")
	for i in 30:
		v.advance(1.0 / 60.0, 5.0)
	v.play_landed()
	for i in 60:
		v.advance(1.0 / 60.0, 5.0)
	var r := v.poser
	check(r.at(PoseRig.HIPS).y < 0.3 and r.lowest_joint() > -0.005, "lying on the ground (hips %.2f, lowest %.3f)" % [r.at(PoseRig.HIPS).y, r.lowest_joint()])
	v.play_getup()
	for i in roundi(PersonView.GETUP_TIME * 60.0) + 3:
		v.advance(1.0 / 60.0, 5.0)
	check(v.knockdown_state() == &"" and int(ups[0]) == 1, "up again (%s)" % v.knockdown_state())
	check(r.at(PoseRig.HEAD).y > 1.4, "standing")
	# Walkers swing their arms (G-263): the hands move fore and aft with the stride.
	var lo := INF
	var hi := -INF
	for i in 90:
		v.advance(1.0 / 60.0, 5.0)
		var z := r.at(PoseRig.HAND[1]).z - r.at(PoseRig.HIPS).z
		lo = minf(lo, z)
		hi = maxf(hi, z)
	check(hi - lo > 0.25, "a walker's hand swings %.2f m" % (hi - lo))
	return true


func test_the_figure_gets_up_as_long_as_the_throw_does() -> bool:
	assert_eq(HumanFigure.GETUP_TIME, CrashFlight.RISE_TIME, "the player's figure stands in the throw's rise time")
	assert_eq(PersonView.GETUP_TIME, Knockdown.GETUP_TIME, "a street person's too")
	return true


func test_a_bike_crash_throws_the_figure_off_and_it_gets_up() -> bool:
	if not check(yard.rig.body.figure.is_ready(), "the player model loads"):
		return true
	var bike := await spawn(&"motorbike", Vector3(0, 0, VehicleYard.WALL_Z + 6.0 + VehicleCatalog.variant(&"motorbike").type.spec.half_extents.z))
	check(await board(bike), "riding")
	bike.set_speed(50.0 / 3.6)
	check(await wait_until(func() -> bool: return yard.driving.mode() == &"thrown", 60 * 5), "thrown")
	var f := yard.rig.body.figure
	var states: Array[StringName] = []
	var lying_hips := INF
	var low := INF
	for i in 60 * 10:
		var s := f.knockdown_state()
		if not states.has(s):
			states.append(s)
		if yard.rider.knockdown() == &"lying":
			lying_hips = minf(lying_hips, f.to_global(f.poser.at(PoseRig.HIPS)).y - yard.rider.position().y)
		if s != &"":
			low = minf(low, f.poser.lowest_joint())
		if yard.driving.mode() == &"foot" and s == &"":
			break
		await wait_physics_frames(1)
	print("    figure states %s, hips %.2f m above the body's feet while lying, lowest joint %.3f m" % [states, lying_hips, low])
	check(states.has(&"falling") and states.has(&"down") and states.has(&"rising"), "fell, lay and got up (%s)" % [states])
	check(lying_hips < 0.3, "lying on the ground, not a stiff plank (hips %.2f m)" % lying_hips)
	check(low > -0.02, "never through the ground (%.3f m)" % low)
	check(yard.driving.mode() == &"foot" and f.knockdown_state() == &"", "on foot again")
	check(f.rotation.x == 0.0 and f.rotation.z == 0.0, "the figure node is not tipped (the skeleton falls)")
	return true


## G-456: a link that never rode owns a node outside the tree; freeing the link frees it.
func test_a_rider_link_that_never_rode_leaves_no_node_behind() -> bool:
	var link := PlayerRiderLink.new()
	var anchor: Node3D = link._anchor
	assert_true(is_instance_valid(anchor) and anchor.get_parent() == null, "it made a node outside the tree")
	link = null
	assert_false(is_instance_valid(anchor), "and freeing the link freed it")
	# One that rode hands its node to the tree: the parent frees it, the link must not.
	var parent := Node3D.new()
	var rode := PlayerRiderLink.new()
	var kept: Node3D = rode._anchor
	parent.add_child(kept)
	rode = null
	assert_true(is_instance_valid(kept) and kept.get_parent() == parent, "a node in the tree is left to its parent")
	parent.free()
	return true
