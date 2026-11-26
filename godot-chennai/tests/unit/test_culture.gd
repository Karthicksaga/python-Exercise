extends TestCase
## Culture and life, the logic (G-480…G-489): the data is consistent with the landmark specs and the
## catalogs, the peace zones' rules, the heritage journal and its save section, the temple visit's
## steps, and the swimming limits (sea rope line, river banks, tiring is never fatal).

const SAVE := "user://test-culture.json"

var _data: CultureData = null


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	_data = CultureData.load_file()
	Tr.set_mode(Tr.Mode.ENGLISH)


func _remove(path: String) -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


# --- the data ---------------------------------------------------------------------------

func test_data_loads_with_stops_zones_temple_and_swim_rules() -> bool:
	assert_eq(_data.error, "", "culture.json reads")
	assert_true(_data.stops.size() >= 8, "at least eight places in the journal (%d)" % _data.stops.size())
	assert_true(_data.temple != null and _data.swim != null and _data.zones.size() >= 1, "temple, swim rules and a zone")
	var seen: Dictionary[String, bool] = {}
	for s in _data.stops:
		assert_false(seen.has(s.id), "%s once" % s.id)
		seen[s.id] = true
		assert_true(s.radius >= 20.0 and s.radius <= 200.0, "%s radius %.0f is a walk, not a district" % [s.id, s.radius])
		assert_true(s.source != "", "%s names where its position comes from" % s.id)
	return true


func test_every_stop_is_where_the_landmark_spec_says_and_named_like_it() -> bool:
	var specs: Dictionary[String, LandmarkSpec] = {}
	for sp in LandmarkSpec.load_all():
		specs[sp.id] = sp
	var world := JSON.parse_string(FileAccess.get_file_as_string("res://world/world.json")) as Dictionary
	var world_marks: Dictionary[String, Dictionary] = {}
	for l: Dictionary in world.get("landmarks", []):
		world_marks[str(l["id"])] = l
	var en := Tr.catalog("en")
	var ta := Tr.catalog("ta")
	for s in _data.stops:
		for key: String in [s.name_key(), s.line_key()]:
			assert_true(en.texts.has(key) and ta.texts.has(key), "%s is in both catalogs" % key)
		assert_true(Tr.catalog("ta").texts.get(s.name_key(), "") != "", "%s has Tamil" % s.name_key())
		if s.landmark == "":
			continue
		if specs.has(s.landmark):
			var sp := specs[s.landmark]
			assert_vec_near(s.position, sp.origin, 6.0, "%s: the stop is at the landmark's origin" % s.id)
			assert_eq(en.texts[s.name_key()], sp.name_en, "%s: English name is the landmark's" % s.id)
			assert_eq(ta.texts[s.name_key()], sp.name_ta, "%s: Tamil name is the landmark's" % s.id)
		else:
			assert_true(world_marks.has(s.landmark), "%s: landmark %s is in a spec or in world.json" % [s.id, s.landmark])
			var l: Dictionary = world_marks.get(s.landmark, {})
			assert_vec_near(s.position, Vector2(float(l.get("x", 0.0)), float(l.get("z", 0.0))), 6.0, "%s: at the world landmark" % s.id)
			assert_eq(en.texts[s.name_key()], str(l.get("name", "")), "%s: English name is the world landmark's" % s.id)
	return true


func test_no_stop_text_names_a_business_or_a_child() -> bool:
	# Original content: places and public buildings only (AGENTS.md); no brand words in the lines.
	var banned: PackedStringArray = ["Inc", "Ltd", "Pvt", "Coffee", "Mall", "Hotel", "child", "kid", "boy", "girl"]
	for s in _data.stops:
		for key: String in [s.name_key(), s.line_key()]:
			var text: String = Tr.catalog("en").texts.get(key, "")
			for word in banned:
				assert_false(text.contains(word), "%s does not say %s" % [key, word])
	return true


func test_zone_and_temple_places_agree() -> bool:
	var zone := _data.zone(_data.temple.zone)
	assert_true(zone != null, "the temple's zone exists")
	var stop := _data.stop(zone.stop)
	assert_true(stop != null and stop.activity == &"temple_visit", "the zone belongs to the temple stop")
	assert_vec_near(zone.centre, stop.position, 2.0, "the zone is centred on the temple")
	for place: Vector2 in [_data.temple.stand, _data.temple.lamp, _data.temple.circle_centre]:
		assert_true(place.distance_to(zone.centre) < zone.radius, "%s is inside the zone" % place)
	assert_true(_data.temple.stand.distance_to(zone.centre) > zone.walk_radius * 0.6, "the sandal stand is out at the forecourt, not in the sanctum")
	assert_true(_data.temple.circle_max < zone.walk_radius, "the walk round stays inside the walk radius")
	# The rules a place of worship has: nothing violent, no police heat, no crash show, no horn, no vehicles, walking pace.
	for rule: String in ["violence", "wanted", "crash_effects", "horn", "boarding", "take_over", "run", "swim"]:
		assert_true(zone.rules.has(rule) and zone.rules[rule] == false, "the temple forbids %s" % rule)
	return true


# --- the peace zones --------------------------------------------------------------------

func test_peace_zone_rules_apply_inside_only() -> bool:
	var p := PeaceZones.from_data(_data)
	var z := _data.zones[0]
	var inside := z.centre + Vector2(10.0, 0.0)
	var outside := z.centre + Vector2(z.radius + 5.0, 0.0)
	assert_true(p.inside(inside) and not p.inside(outside), "inside and outside")
	for rule: String in ["violence", "wanted", "crash_effects", "horn", "take_over", "swim", "run"]:
		assert_false(p.allows(rule, inside), "%s is not allowed inside" % rule)
		assert_true(p.allows(rule, outside), "%s is allowed outside" % rule)
	# Vehicles are kept out of the forecourt (walk radius), not the whole zone.
	var rim := z.centre + Vector2((z.walk_radius + z.radius) * 0.5, 0.0)
	assert_true(p.inside(rim), "the rim is in the zone")
	assert_true(p.allows("boarding", rim), "a vehicle may still be entered at the zone's rim")
	assert_false(p.allows("boarding", z.centre + Vector2(z.walk_radius - 5.0, 0.0)), "not in the forecourt")
	assert_true(p.allows("unknown_rule", inside), "a rule nobody listed is allowed")
	assert_true(p.depth(inside) > 0.0 and p.depth(outside) < 0.0, "depth is positive inside")
	return true


# --- the journal and the save -----------------------------------------------------------

func test_journal_fills_in_order_counts_visits_and_saves() -> bool:
	var j := HeritageJournal.new()
	var added: Array[String] = []
	j.visited.connect(func(id: String) -> void: added.append(id))
	assert_true(j.visit("ripon-building"), "first visit is new")
	assert_false(j.visit("ripon-building"), "the second is not")
	assert_true(j.visit("marina-beach"), "another place")
	assert_eq(added, ["ripon-building", "marina-beach"] as Array[String], "the signal fires once per new place")
	assert_eq(j.visits("ripon-building"), 2, "visits are counted")
	assert_true(j.complete("kapaleeshwarar-temple"), "a visit done also writes the place")
	assert_false(j.complete("kapaleeshwarar-temple"), "only once")
	assert_eq(j.order(), ["ripon-building", "marina-beach", "kapaleeshwarar-temple"] as Array[String], "the order visited")
	assert_eq(j.save(SAVE), OK, "writes")
	var back := HeritageJournal.load_from(SaveStore.new(SAVE).read())
	assert_eq(back.order(), j.order(), "the order survives")
	assert_true(back.is_done("kapaleeshwarar-temple") and not back.is_done("ripon-building"), "done survives")
	assert_eq(back.visits("ripon-building"), 2, "counts survive")
	assert_eq(HeritageJournal.load_from(SaveStore.new("user://no-such-save.json").read()).count(), 0, "no save: an empty journal")
	_remove(SAVE)
	return true


func test_the_journal_has_its_own_section_and_the_mission_save_keeps_it() -> bool:
	var j := HeritageJournal.new()
	j.visit("chennai-central")
	j.save(SAVE)
	# The mission session opened the file before the journal wrote to it; its save must not lose the section.
	var older := SaveStore.new(SAVE)
	older.data = {SaveStore.PROGRESS: {"completed": [], "money": 5}}
	assert_eq(older.write(), OK, "the older store writes")
	var again := SaveStore.new(SAVE).read()
	assert_true(again.section(SaveStore.HERITAGE) is Dictionary, "the heritage section is still in the file")
	assert_eq(HeritageJournal.load_from(again).order(), ["chennai-central"] as Array[String], "with its place")
	assert_eq(again.progress()["money"], 5.0, "and the stage progress was written")
	# A settings section saved meanwhile also stays (the sound switch, the controls).
	var s := SaveStore.new(SAVE).read()
	s.set_section("cow-sound-v1", "off")
	s.write()
	var stale := SaveStore.new(SAVE)
	stale.data = {SaveStore.PROGRESS: {"completed": ["a"], "money": 7}}
	stale.write()
	assert_eq(str(SaveStore.new(SAVE).read().section("cow-sound-v1")), "off", "a setting saved in between survives a progress write")
	# NEW GAME clears the progress sections (they are the store's own), not the journal's.
	var fresh := SaveStore.new(SAVE).read()
	fresh.data = {}
	fresh.write()
	var cleared := SaveStore.new(SAVE).read()
	assert_true(cleared.progress().is_empty(), "NEW GAME's empty store clears the stage progress")
	_remove(SAVE)
	return true


# --- the temple visit -------------------------------------------------------------------

func _visit() -> TempleVisit:
	return TempleVisit.make(_data.temple, _data.zone(_data.temple.zone))


func _ring(v: TempleVisit, radius: float, from_angle: float, sweep: float, steps: int) -> void:
	var c := _data.temple.circle_centre
	for i in steps + 1:
		var a := from_angle + sweep * float(i) / steps
		v.update(c + Vector2(cos(a), sin(a)) * radius, true)


func test_temple_visit_goes_stand_lamp_walk_round_in_that_order() -> bool:
	var v := _visit()
	var events: Array[StringName] = []
	v.event.connect(func(what: StringName, _n: int) -> void: events.append(what))
	var zone := v.zone
	var out := zone.centre + Vector2(zone.radius + 20.0, 0.0)
	v.update(out, true)
	assert_true(events.is_empty() and not v.inside, "outside: nothing")
	v.update(_data.temple.stand, true)
	assert_true(v.inside, "entering the forecourt")
	assert_eq(events, [&"entered"] as Array[StringName], "and it says so")
	assert_false(v.light_lamp(_data.temple.lamp), "no lamp with the sandals on")
	assert_false(v.leave_shoes(zone.centre), "the sandals are left at the stand only")
	assert_true(v.leave_shoes(_data.temple.stand + Vector2(1.0, 0.0)), "sandals off at the stand")
	assert_false(v.leave_shoes(_data.temple.stand), "not twice")
	v.update(_data.temple.lamp, true)
	assert_false(v.light_lamp(_data.temple.stand), "the lamp is lit at the lamp")
	assert_true(v.light_lamp(_data.temple.lamp), "lamp lit")
	# A walk round: clockwise (east, south, west, north on the map), all the way.
	var r := (_data.temple.circle_min + _data.temple.circle_max) * 0.5
	_ring(v, r, 0.0, TAU * 0.95, 240)
	assert_true(v.done, "the walk round counts")
	assert_eq(events, [&"entered", &"shoes_off", &"lamp", &"quarter", &"quarter", &"quarter", &"complete"] as Array[StringName], "the whole visit in order")
	return true


func test_walking_the_wrong_way_or_not_at_all_does_not_count() -> bool:
	var v := _visit()
	v.update(_data.temple.stand, true)
	v.leave_shoes(_data.temple.stand)
	v.light_lamp(_data.temple.lamp)
	var r := (_data.temple.circle_min + _data.temple.circle_max) * 0.5
	_ring(v, r, 0.0, -TAU * 1.5, 360)
	assert_false(v.done, "anticlockwise never completes")
	assert_eq(v.swept, 0.0, "and never counts below nothing")
	# Outside the ring (too close to the centre, too far) does not count either.
	_ring(v, _data.temple.circle_min * 0.4, 0.0, TAU * 1.2, 300)
	_ring(v, _data.temple.circle_max * 1.2, 0.0, TAU * 1.2, 300)
	assert_false(v.done, "only inside the ring")
	# A jump (teleport) round the circle is not a walk.
	var c := _data.temple.circle_centre
	for k in 8:
		var a := TAU * float(k) / 4.0
		v.update(c + Vector2(cos(a), sin(a)) * r, true)
	assert_false(v.done, "jumping is not walking")
	return true


func test_leaving_puts_the_sandals_back_and_a_vehicle_is_outside() -> bool:
	var v := _visit()
	var events: Array[StringName] = []
	v.event.connect(func(what: StringName, _n: int) -> void: events.append(what))
	v.update(_data.temple.stand, true)
	v.leave_shoes(_data.temple.stand)
	v.light_lamp(_data.temple.lamp) if v.near_lamp(_data.temple.lamp) else null
	v.update(_data.temple.stand, false)
	assert_true(not v.inside and not v.shoes_off, "in a vehicle counts as outside: sandals back on")
	assert_true(events.has(&"shoes_on") and events.has(&"left"), "and it says so")
	v.reset()
	assert_true(not v.lamp_lit and not v.done and v.swept == 0.0, "NEW GAME starts over")
	return true


# --- swimming ---------------------------------------------------------------------------

## A straight coast along x = 0 (land to the west, sea to the east) and, on the land, a river 12 m wide along x = -300.
func _water() -> SwimWater:
	var sea := WorldSea.new()
	sea.coast = PackedVector2Array([Vector2(0, -3000), Vector2(0, 3000)])
	sea.outline = PackedVector2Array([Vector2(0, -3000), Vector2(0, 3000), Vector2(6000, 3000), Vector2(6000, -3000)])
	var river := WorldWaterway.new()
	river.id = 1
	river.kind = &"river"
	river.width = 12.0
	river.points = PackedVector2Array([Vector2(-300, -1000), Vector2(-300, 1000)])
	var drain := WorldWaterway.new()
	drain.id = 2
	drain.kind = &"drain"
	drain.width = 3.0
	drain.points = PackedVector2Array([Vector2(-500, -1000), Vector2(-500, 1000)])
	var tunnel := WorldWaterway.new()
	tunnel.id = 3
	tunnel.kind = &"river"
	tunnel.width = 12.0
	tunnel.tunnel = true
	tunnel.points = PackedVector2Array([Vector2(-900, -1000), Vector2(-900, 1000)])
	var all: Array[WorldWaterway] = [river, drain, tunnel]
	return SwimWater.make(_data.swim, sea, func(_p: Vector2, _r: float) -> Array[WorldWaterway]: return all)


func test_water_samples_say_depth_shore_and_way_in() -> bool:
	var w := _water()
	var land := w.sample(Vector2(-3.0, 40.0))
	assert_true(land != null and land.kind == &"sea", "the sea is the water by the beach")
	assert_near(land.depth, -3.0, 0.01, "3 m on land")
	assert_vec_near(land.inward, Vector2(1, 0), 0.01, "the way in is east")
	assert_vec_near(land.shore, Vector2(0, 40), 0.01, "the shore point")
	var wet := w.sample(Vector2(12.0, 40.0))
	assert_near(wet.depth, 12.0, 0.01, "12 m out")
	assert_vec_near(wet.inward, Vector2(1, 0), 0.01, "the way in is away from the shore")
	var river := w.sample(Vector2(-297.0, 0.0))
	assert_eq(river.kind, &"river", "the river")
	assert_near(river.depth, 3.0, 0.01, "3 m from the bank (6 m half width, 3 m off the centre)")
	assert_true(w.sample(Vector2(-500.0, 0.0)) == null, "a drain is not swimming water")
	assert_true(w.sample(Vector2(-900.0, 0.0)) == null, "nor is a covered river, far from the sea")
	assert_true(w.sample(Vector2(-150.0, 0.0)) == null, "water further than the reach is none")
	return true


func test_swimming_is_held_inside_the_rope_line() -> bool:
	var w := _water()
	var s := SwimState.make(_data.swim, w)
	assert_true(s.entry(Vector2(-3.0, 0.0)) != null, "in reach of the sea from the beach")
	assert_true(s.entry(Vector2(-30.0, 0.0)) == null, "not from 30 m up the beach")
	var start := s.begin(Vector2(-3.0, 0.0))
	assert_vec_near(start, Vector2(1.0, 0.0), 0.01, "starts 1 m into the water")
	assert_true(s.swimming, "swimming")
	var at := start
	for i in 60 * 40:
		at = s.move(at, Vector2(1.0, 0.0), 1.0 / 60.0)
		if s.tired or not s.swimming:
			break
	assert_true(at.x <= _data.swim.sea_limit + 0.01, "never past the rope line (%.1f m)" % at.x)
	assert_true(at.x >= _data.swim.sea_limit - 1.5, "but up to it (%.1f m)" % at.x)
	assert_true(s.at_rope(at), "the rope is what holds the swimmer")
	return true


func test_tiring_carries_the_swimmer_to_the_shore_and_nobody_is_hurt() -> bool:
	var w := _water()
	var s := SwimState.make(_data.swim, w)
	var tired := [false]
	var shore := [Vector2.INF]
	s.got_tired.connect(func() -> void: tired[0] = true)
	s.reached_shore.connect(func(p: Vector2) -> void: shore[0] = p)
	var at := s.begin(Vector2(-3.0, 0.0))
	var seconds := 0.0
	var lowest := 1.0
	while s.swimming and seconds < 400.0:
		# Swims out and back along the rope line, never asking to go home.
		at = s.move(at, Vector2(1.0, 0.0), 1.0 / 60.0)
		lowest = minf(lowest, s.stamina)
		seconds += 1.0 / 60.0
	assert_true(tired[0], "it got tired")
	assert_true(not s.swimming and shore[0] is Vector2 and (shore[0] as Vector2).x < 0.0, "and was carried out onto the beach (%s)" % shore[0])
	assert_true(lowest >= 0.0 and s.stamina >= 0.0, "stamina never below nothing")
	assert_true(seconds < _data.swim.stamina_seconds + 60.0, "within a minute after it ran out (%.0f s)" % seconds)
	# Rested, it can swim again.
	assert_true(s.entry(Vector2(-3.0, 0.0)) == null, "too tired to go straight back in")
	for i in 60 * 30:
		s.rest(1.0 / 60.0)
	assert_eq(s.stamina, 1.0, "rested")
	assert_true(s.entry(Vector2(-3.0, 0.0)) != null, "ready to swim again")
	return true


func test_a_swimmer_in_a_river_stays_between_the_banks_and_can_get_out() -> bool:
	var w := _water()
	var s := SwimState.make(_data.swim, w)
	var start := s.begin(Vector2(-309.0, 0.0))
	assert_vec_near(start, Vector2(-305.0, 0.0), 0.2, "starts inside the west bank")
	var at := start
	# Leaning on the east bank while swimming along it: held inside, never over it.
	for i in 60 * 12:
		at = s.move(at, Vector2(0.2, -1.0), 1.0 / 60.0)
	assert_true(s.swimming, "still swimming")
	assert_true(at.y < -15.0, "it swam along the river (%.1f)" % at.y)
	assert_true(at.x > -306.0 and at.x < -294.4 + 0.01, "between the banks (%.2f)" % at.x)
	# Pushing straight at the east bank: out of the water on that side.
	for i in 60 * 20:
		at = s.move(at, Vector2(1.0, 0.0), 1.0 / 60.0)
		if not s.swimming:
			break
	assert_false(s.swimming, "got out at the east bank")
	assert_true(at.x > -294.0 and at.x < -290.0, "on land just east of the river (%.2f)" % at.x)
	# And back: in from the east bank, across, out on the west.
	var back := s.begin(at)
	assert_false(is_inf(back.x), "in again from the east bank")
	for i in 60 * 30:
		at = s.move(back if i == 0 else at, Vector2(-1.0, 0.0), 1.0 / 60.0)
		if not s.swimming:
			break
	assert_false(s.swimming, "across and out")
	assert_true(at.x < -306.0, "on land west of the river (%.2f)" % at.x)
	return true


func test_no_swimming_in_a_forbidden_circle() -> bool:
	var rules := CultureData.Swim.new()
	rules.kinds = [&"sea"]
	rules.no_swim = [Vector3(0.0, 0.0, 50.0)]
	var w := _water()
	w.rules = rules
	var s := SwimState.make(rules, w)
	assert_true(s.entry(Vector2(-3.0, 10.0)) == null, "no entry inside a no-swim circle")
	assert_true(s.entry(Vector2(-3.0, 100.0)) != null, "entry outside it")
	return true
