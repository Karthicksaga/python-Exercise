extends TestCase
## Every screen at the UI sizes phones give it (chennai-game-design §3). With stretch mode
## canvas_items and aspect expand on a 915x412 base, 915x412 and 1830x824 screens give the UI
## 915x412; a 640x320 screen gives 915x458; a 20:9 phone about 915x412; a 4:3 tablet 915x686.
## Checks: every visible control inside the screen, buttons at least 48 tall, no two buttons
## overlapping, something focused on every menu page.

const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(915, 458), Vector2i(1098, 412), Vector2i(915, 686)]
const LOADING := preload("res://src/ui/loading_screen/loading_screen.tscn")
const TITLE := preload("res://src/ui/title_menu/title_menu.tscn")
const HUD := preload("res://src/ui/debug_hud/debug_hud.tscn")


func _check(vp: SubViewport, what: String, need_focus: bool) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
	var buttons: Array[Control] = []
	for node in vp.find_children("*", "Control", true, false):
		var c := node as Control
		if not c.is_visible_in_tree():
			continue
		var rect := c.get_global_rect()
		check(screen.encloses(rect), "%s at %s: %s off-screen %s" % [what, vp.size, c.name, rect])
		if c is Button:
			check(rect.size.y >= UiTheme.MIN_TARGET, "%s at %s: %s is %d tall" % [what, vp.size, c.name, rect.size.y])
			buttons.append(c)
	for i in buttons.size():
		for j in range(i + 1, buttons.size()):
			check(not buttons[i].get_global_rect().intersects(buttons[j].get_global_rect()), "%s at %s: %s overlaps %s" % [what, vp.size, buttons[i].name, buttons[j].name])
	if need_focus:
		check(vp.gui_get_focus_owner() != null, "%s at %s: nothing focused" % [what, vp.size])


func _viewport(size: Vector2i) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = size
	vp.gui_disable_input = false
	root.add_child(vp)
	return vp


func test_screens_fit_every_size() -> bool:
	for size in SIZES:
		var vp := _viewport(size)
		var loading: LoadingScreen = LOADING.instantiate()
		vp.add_child(loading)
		loading.set_steps(Main.STEPS)
		loading.begin_step(0)
		await wait_frames(2)
		_check(vp, "loading", false)
		loading.fail(0, "index.json not found. A longer message that has to wrap onto a second line on a small phone held in landscape.")
		await wait_frames(2)
		_check(vp, "loading failed", true)
		loading.queue_free()
		var title: TitleMenu = TITLE.instantiate()
		vp.add_child(title)
		title.set_credits("© OpenStreetMap contributors", "2026-11-15T00:16:27Z")
		await wait_frames(2)
		_check(vp, "title", true)
		title.show_about()
		await wait_frames(2)
		_check(vp, "about", true)
		title.queue_free()
		var hud: DebugHud = HUD.instantiate()
		vp.add_child(hud)
		hud.set_world_text("20,625 roads · 1,897 chunks")
		await wait_frames(2)
		_check(vp, "hud", false)
		vp.queue_free()
		await wait_frames(1)
	return true
