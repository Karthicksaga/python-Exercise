extends TestCase
## The railway HUD at the UI sizes phones give it (chennai-game-design §3, as test_ui_layout):
## in the station, ride and cab modes, every visible control inside the screen, every button at
## least 48 tall, no two buttons or the lever overlapping, and the timetable sheet inside.

const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(915, 458), Vector2i(1098, 412), Vector2i(915, 686)]


func _hud(size: Vector2i) -> Array:
	var vp := SubViewport.new()
	vp.size = size
	root.add_child(vp)
	var hud := RailHud.new()
	vp.add_child(hud)
	return [vp, hud]


func _check(vp: SubViewport, hud: RailHud, what: String) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
	var solid: Array[Control] = []
	for node in hud.find_children("*", "Control", true, false):
		var c := node as Control
		if not c.is_visible_in_tree() or c == hud.look_area or c is SafeAreaMargin:
			continue
		var rect := c.get_global_rect()
		if rect.size == Vector2.ZERO:
			continue
		check(screen.encloses(rect.grow(-0.5)), "%s at %s: %s off-screen %s" % [what, vp.size, c.name, rect])
		if c is Button:
			check(rect.size.y >= RailHudStyle.MIN_TARGET, "%s at %s: %s is %d tall" % [what, vp.size, c.name, rect.size.y])
			solid.append(c)
		elif c is NotchLever or c is SpeedDial or c == hud.info:
			solid.append(c)
	for i in solid.size():
		for j in range(i + 1, solid.size()):
			check(not solid[i].get_global_rect().intersects(solid[j].get_global_rect()), "%s at %s: %s overlaps %s" % [what, vp.size, solid[i].name, solid[j].name])


func test_every_mode_fits_every_screen() -> bool:
	for size in SIZES:
		var made := _hud(size)
		var vp := made[0] as SubViewport
		var hud := made[1] as RailHud
		await wait_frames(2)
		hud.set_mode(RailHud.STATION)
		hud.set_info("Chennai Egmore station", "சென்னை எழும்பூர்", "Next train: Tambaram, 3 min")
		hud.set_offers(false, false, true)
		await wait_frames(2)
		_check(vp, hud, "station")
		hud.set_mode(RailHud.RIDE)
		hud.set_info("Train to Tambaram", "சேத்துப்பட்டு", "Next: Chetpet")
		hud.set_offers(true, false, false)
		await wait_frames(2)
		_check(vp, hud, "ride")
		hud.set_mode(RailHud.CAB)
		hud.set_info("Chetpet · to Tambaram", "சேத்துப்பட்டு", "820 m to the stop mark")
		hud.set_cab(54.0, 60.0, 6, false, "yellow", 160)
		hud.set_offers(false, true, false)
		await wait_frames(2)
		_check(vp, hud, "cab")
		hud.show_timetable("Timetable", PackedStringArray(["08:41   PF 1   Tambaram   3 min"]), [[PackedVector2Array([Vector2(0, 0), Vector2(1000, 2000)]), Color.ORANGE]] as Array[Array], [[Vector2(0, 0), "A"]] as Array[Array], Vector2(10, 10), "© OpenStreetMap contributors")
		await wait_frames(2)
		check(Rect2(Vector2.ZERO, Vector2(vp.size)).encloses(hud.sheet.get_global_rect()), "timetable inside at %s" % size)
		check(hud.close_sheet.get_global_rect().size.y >= RailHudStyle.MIN_TARGET, "CLOSE big enough")
		vp.queue_free()
	return true


func test_the_lever_snaps_to_notches_by_touch() -> bool:
	var made := _hud(Vector2i(915, 412))
	var hud := made[1] as RailHud
	hud.set_mode(RailHud.CAB)
	await wait_frames(2)
	var got: Array[int] = []
	hud.notch_changed.connect(func(i: int) -> void: got.append(i))
	for target: int in [8, 0, 4, 6]:
		var e := InputEventScreenTouch.new()
		e.pressed = true
		e.position = hud.lever.notch_point(target)
		hud.lever._gui_input(e)
	assert_eq(got, [8, 0, 4, 6] as Array[int], "each tap picks its notch")
	assert_eq(hud.lever.labels[hud.lever.notch], "P2", "the knob shows P2")
	return true
