extends TestCase
## The touch controls on the phone screens of `chennai-game-design` §3 (915x412, 1830x824 and the
## 640x320 worst case), headless. The UI is laid out in units of the 915x412 base (stretch mode
## canvas_items, aspect expand), so each screen is checked at the UI size it gives and its
## buttons measured in real pixels too. With the debug HUD shown (its map credit sits
## bottom-right): every control inside the screen, buttons at least 48 dp (48 px at the base
## scale) and 8 apart, nothing overlapping, stick bottom-left and buttons bottom-right. After
## G-170 the buttons are ACTION and JUMP (RUN is gone: running is the stick's edge); the left-handed
## layout, the button sizes and the thumbs' resting areas are in `test_controls_layout.gd`.

const SCREENS: Array[Vector2i] = [Vector2i(915, 412), Vector2i(1830, 824), Vector2i(640, 320)]
const BASE := Vector2(915, 412)
const HUD := preload("res://src/ui/debug_hud/debug_hud.tscn")


func test_touch_controls_fit_every_phone_screen() -> bool:
	for screen in SCREENS:
		var scale := minf(screen.x / BASE.x, screen.y / BASE.y)
		var ui := Vector2i(roundi(screen.x / scale), roundi(screen.y / scale))
		var vp := SubViewport.new()
		vp.size = ui
		root.add_child(vp)
		var hud: DebugHud = HUD.instantiate()
		# Checked with the performance overlay on: that is its widest state (off, it is hidden).
		hud.settings = DebugSettings.new()
		hud.settings.path = "user://layout-test-debug.json"
		hud.settings.perf_overlay = true
		vp.add_child(hud)
		var controls := TouchControls.new()
		vp.add_child(controls)
		await wait_frames(3)
		var what := "%dx%d (UI %dx%d)" % [screen.x, screen.y, ui.x, ui.y]
		var area := Rect2(Vector2.ZERO, Vector2(ui))
		var rects: Dictionary[String, Rect2] = {}
		for b in controls.buttons():
			rects[b.name] = b.get_global_rect()
		rects["Stick"] = controls.stick_rect()
		var credit := hud.find_child("Credit", true, false) as Control
		rects["Credit"] = credit.get_global_rect()
		var fps := hud.find_child("Fps", true, false) as Control
		rects["Fps"] = fps.get_global_rect()
		for n: String in rects:
			check(area.encloses(rects[n]), "%s: %s off-screen %s" % [what, n, rects[n]])
		for b in controls.buttons():
			var r := b.get_global_rect()
			check(r.size.x >= UiTheme.MIN_TARGET and r.size.y >= UiTheme.MIN_TARGET, "%s: %s is %s UI units" % [what, b.name, r.size])
			check(minf(r.size.x, r.size.y) * scale >= 48.0, "%s: %s is %.0f px on the screen" % [what, b.name, minf(r.size.x, r.size.y) * scale])
			# Thumb zone: the right third, lower half.
			check(r.get_center().x > ui.x * 0.66 and r.get_center().y > ui.y * 0.5, "%s: %s outside the right thumb's zone at %s" % [what, b.name, r.get_center()])
		var names := rects.keys()
		for i in names.size():
			for j in range(i + 1, names.size()):
				var a := rects[names[i] as String].grow(4.0)
				var b := rects[names[j] as String].grow(4.0)
				check(not a.intersects(b), "%s: %s and %s closer than 8 (%s, %s)" % [what, names[i], names[j], rects[names[i] as String], rects[names[j] as String]])
		var stick := controls.stick_rect()
		check(stick.get_center().x < ui.x * TouchControls.MOVE_SHARE and stick.get_center().y > ui.y * 0.5, "%s: stick at rest bottom-left (%s)" % [what, stick.get_center()])
		print("    %s: ACTION %s, JUMP %s, stick %s" % [what, rects["Action"], rects["Jump"], stick])
		vp.queue_free()
		await wait_frames(1)
	return true
