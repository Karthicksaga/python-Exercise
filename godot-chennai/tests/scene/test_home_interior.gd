extends TestCase
## The inside of a home and its HUD (G-235, G-236, G-237): the room is built from the home's own
## data, day and night change its light and the lamps, taps find the floor, the furnish editor's
## buttons are phone-sized at every screen shape, and a furnished room stays light on the GPU.

const INTERIOR := preload("res://src/app/homes_layer/home_interior.tscn")
const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(915, 458), Vector2i(1098, 412), Vector2i(915, 686)]

var data: HomeData
var state: HomeState


func before_each() -> void:
	data = HomeData.load_all()
	state = HomeState.new()
	state.buy(data.listings.get_listing("velachery-1"), 99999, data)


func _interior(vp: SubViewport) -> HomeInterior:
	var inside: HomeInterior = INTERIOR.instantiate()
	vp.add_child(inside)
	inside.setup(data, state.get_home("velachery-1"), state.editor("velachery-1", data))
	inside.camera.current = true
	return inside


func _viewport(size: Vector2i) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = size
	vp.own_world_3d = true
	vp.gui_disable_input = false
	root.add_child(vp)
	return vp


func test_the_room_is_built_from_the_home() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var inside := _interior(vp)
	assert_eq(inside.room.width, 8, "a terrace house is 8 wide")
	assert_eq(inside.room.depth, 6, "and 6 deep")
	assert_true(inside.get_node("Shell") is MeshInstance3D and (inside.get_node("Shell") as MeshInstance3D).mesh != null, "a shell")
	assert_true((inside.get_node("Windows") as MeshInstance3D).mesh != null, "windows")
	assert_true(inside.get_node("DoorLeaf").get_child_count() == 1, "a door leaf")
	assert_false((inside.get_node("Kolam") as MeshInstance3D).visible, "no kolam yet")
	# The extension makes it wider and the shell follows.
	var before := (inside.get_node("Shell") as MeshInstance3D).mesh.get_aabb().size.x
	state.extend("velachery-1", 99999, data)
	inside.editor = state.editor("velachery-1", data)
	inside.rebuild()
	assert_eq(inside.room.width, 11, "3 cells wider")
	assert_true((inside.get_node("Shell") as MeshInstance3D).mesh.get_aabb().size.x > before + 2.5, "the shell grew")
	state.set_kolam("velachery-1", true)
	inside.rebuild()
	assert_true((inside.get_node("Kolam") as MeshInstance3D).visible, "the kolam is drawn at the door")
	vp.queue_free()
	return true


func test_day_and_night_light() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var inside := _interior(vp)
	var lamp := inside.find_children("*", "OmniLight3D", true, false)[0] as OmniLight3D
	inside.set_hour(11.0)
	var day_glow := (inside.get_node("FurnitureGlow") as MeshInstance3D)
	assert_true(lamp != null and lamp.light_energy < 0.05, "the room's lamp is off by day")
	inside.set_hour(22.0)
	assert_true(lamp.light_energy > 1.0, "and on at night (%.2f)" % lamp.light_energy)
	assert_true(lamp.visible, "visible at night")
	# Only the room's own light is real: one omni, one directional, no other lights.
	var lights := inside.find_children("*", "Light3D", true, false)
	assert_eq(lights.size(), 2, "the room has two lights, its lamp and the sun")
	assert_true(day_glow != null, "the glow mesh node exists")
	vp.queue_free()
	return true


func test_lamps_glow_only_at_night() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var inside := _interior(vp)
	var e := state.editor("velachery-1", data)
	e.place("tube", Vector2i(3, 0), 9999)
	e.place("diya", Vector2i(5, 3), 9999)
	inside.editor = e
	inside.rebuild_furniture()
	var glow := inside.get_node("FurnitureGlow") as MeshInstance3D
	assert_true(glow.mesh != null, "lighting props make a glow mesh")
	var mat := glow.mesh.surface_get_material(0) as StandardMaterial3D
	inside.set_hour(11.0)
	assert_eq(mat.shading_mode, BaseMaterial3D.SHADING_MODE_PER_PIXEL, "dull by day")
	inside.set_hour(22.0)
	assert_eq(mat.shading_mode, BaseMaterial3D.SHADING_MODE_UNSHADED, "lit at night")
	vp.queue_free()
	return true


func test_taps_find_the_floor_and_the_person_walks_round_furniture() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var inside := _interior(vp)
	await wait_frames(3)
	var centre := inside.camera.unproject_position(Vector3(4.0, 0.0, 3.0))
	var hit: Variant = inside.floor_point_at(centre)
	assert_true(hit is Vector2, "a ray through the floor's middle hits the floor")
	assert_vec_near(hit as Vector2, Vector2(4.0, 3.0), 0.05, "at the right place")
	assert_true(inside.floor_point_at(Vector2(450, 0)) == null or inside.floor_point_at(Vector2(450, 0)) is Vector2, "a ray into the sky does not crash")
	var e := inside.editor
	e.place("cot", Vector2i(3, 2), 9999)
	inside.place_walker(Vector2(0.5, 0.5), 0.0)
	assert_true(inside.walk_to(Vector2(6.5, 4.5)), "a way round the cot")
	assert_false(inside.walk_to(Vector2(3.5, 2.5)), "no way onto the cot")
	var arrived := await wait_until(func() -> bool: return inside.walker.arrived(), 60 * 12)
	assert_true(arrived, "the person gets there in game time")
	assert_vec_near(inside.walker.position, Vector2(6.5, 4.5), 0.1, "at the spot")
	vp.queue_free()
	return true


func test_a_tap_on_the_floor_is_reported_but_a_drag_is_not() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var inside := _interior(vp)
	await wait_frames(3)
	var taps: Array[Vector2] = []
	inside.floor_tapped.connect(func(p: Vector2) -> void: taps.append(p))
	var at := inside.camera.unproject_position(Vector3(3.5, 0.0, 2.5))
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = at
	inside._unhandled_input(press)
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = at + Vector2(3, 2)
	inside._unhandled_input(release)
	assert_eq(taps.size(), 1, "a tap")
	assert_vec_near(taps[0], Vector2(3.5, 2.5), 0.15, "on the floor under the finger")
	press.position = at
	inside._unhandled_input(press)
	release.position = at + Vector2(60, 0)
	inside._unhandled_input(release)
	assert_eq(taps.size(), 1, "a drag is not a tap")
	inside.input_enabled = false
	press.position = at
	inside._unhandled_input(press)
	release.position = at
	inside._unhandled_input(release)
	assert_eq(taps.size(), 1, "and nothing while the fade is up")
	vp.queue_free()
	return true


func test_selection_marker_follows_the_piece() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var inside := _interior(vp)
	var sofa := inside.editor.place("sofa", Vector2i(2, 2), 9999).item
	inside.show_selection(sofa)
	var marker := inside.get_node("Selection") as MeshInstance3D
	assert_true(marker.visible, "shown")
	assert_near(marker.position.x, 2.0, 0.01, "over the sofa")
	inside.show_selection(null)
	assert_false(marker.visible, "and hidden")
	vp.queue_free()
	return true


func test_a_furnished_room_is_cheap_to_draw() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var inside := _interior(vp)
	for spec: Array in [["sofa", 2, 2], ["cot", 6, 1], ["tube", 3, 0], ["fan", 4, 3], ["fridge", 0, 4], ["pend", 6, 4], ["diya", 2, 4], ["pooja", 0, 0], ["dtable", 4, 4], ["tvunit", 5, 0], ["plant", 7, 0], ["kolu", 1, 1]]:
		inside.editor.place(str(spec[0]), Vector2i(int(spec[1]), int(spec[2])), 99999)
	inside.rebuild_furniture()
	var furniture_nodes := 0
	for n: String in ["Furniture", "FurnitureGlow"]:
		if (inside.get_node(n) as MeshInstance3D).mesh != null:
			furniture_nodes += 1
	assert_eq(furniture_nodes, 2, "all the furniture is two meshes (two draw calls)")
	assert_true(inside.triangles < 5000, "a furnished room is under 5,000 triangles (%d)" % inside.triangles)
	vp.queue_free()
	return true


# --- the HUD ---------------------------------------------------------------------------------

func _hud_check(vp: SubViewport, hud: HomeHud, what: String) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
	var buttons: Array[Button] = []
	for node in hud.find_children("*", "Button", true, false):
		var b := node as Button
		if not b.is_visible_in_tree():
			continue
		var rect := b.get_global_rect()
		# Items inside the scrolling list may be scrolled off; judge only those in view.
		var scroll := hud.find_child("Items", true, false) as ScrollContainer
		if b.name.begins_with("Item_") and not scroll.get_global_rect().encloses(rect):
			continue
		check(screen.encloses(rect), "%s at %s: %s inside the screen %s" % [what, vp.size, b.name, rect])
		check(rect.size.y >= UiTheme.MIN_TARGET - 0.5, "%s at %s: %s is %.0f tall" % [what, vp.size, b.name, rect.size.y])
		check(rect.size.x >= UiTheme.MIN_TARGET - 0.5, "%s at %s: %s is %.0f wide" % [what, vp.size, b.name, rect.size.x])
		buttons.append(b)
	for i in buttons.size():
		for j in range(i + 1, buttons.size()):
			check(not buttons[i].get_global_rect().intersects(buttons[j].get_global_rect()), "%s at %s: %s overlaps %s" % [what, vp.size, buttons[i].name, buttons[j].name])


func test_hud_fits_every_screen_shape() -> bool:
	for size in SIZES:
		var vp := _viewport(size)
		var hud := HomeHud.new()
		vp.add_child(hud)
		hud.bind(data)
		hud.set_home("Terrace house", "மாடி வீடு")
		hud.set_wallet(24665)
		hud.set_clock("10:03")
		hud.context.add_source(func() -> Variant:
			return [ActionCandidate.make("FURNISH", 12, 0.0, func() -> void: pass), ActionCandidate.make("SLEEP", 11, 0.0, func() -> void: pass)])
		await wait_frames(3)
		_hud_check(vp, hud, "street side of the HUD")
		hud.set_editing(true)
		await wait_frames(3)
		_hud_check(vp, hud, "furnish editor")
		for cat in data.props.categories:
			hud.show_category(str(cat["id"]))
			await wait_frames(2)
			_hud_check(vp, hud, "category %s" % cat["id"])
		# The thumbs: nothing of the editor sits in the bottom-left stick corner above the tools, and
		# the panel leaves the left half of the screen to the room.
		check(hud.panel_rect().position.x >= float(size.x) * 0.55, "the panel stays on the right (%d)" % hud.panel_rect().position.x)
		vp.queue_free()
	return true


func test_hud_reports_what_was_pressed() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var hud := HomeHud.new()
	vp.add_child(hud)
	hud.bind(data)
	var log: Array[String] = []
	hud.prop_armed.connect(func(id: String) -> void: log.append("arm:" + id))
	hud.leave_pressed.connect(func() -> void: log.append("leave"))
	hud.wall_chosen.connect(func(c: String) -> void: log.append("wall:" + c))
	hud.set_editing(true)
	await wait_frames(2)
	(hud.find_child("Item_sofa", true, false) as Button).pressed.emit()
	assert_eq(hud.armed, "sofa", "armed")
	(hud.find_child("Item_sofa", true, false) as Button).pressed.emit()
	assert_eq(hud.armed, "", "tapping again disarms")
	hud.show_category("Kitchen")
	assert_true(hud.find_child("Item_fridge", true, false) != null and hud.find_child("Item_sofa", true, false) == null, "a tab shows only its pieces")
	(hud.find_child("Leave", true, false) as Button).pressed.emit()
	(hud.find_child("Wall_c9e0e6", true, false) as Button).pressed.emit()
	assert_eq(log, ["arm:sofa", "arm:", "leave", "wall:#c9e0e6"], "signals")
	# Too-poor items are dimmed but still listed.
	hud.set_wallet(100)
	hud.show_category("Kitchen")
	assert_true((hud.find_child("Item_fridge", true, false) as Button).modulate.a < 0.9, "the fridge is out of reach")
	assert_true((hud.find_child("Item_kudam", true, false) as Button).modulate.a > 0.9, "the water pot is not")
	vp.queue_free()
	return true
