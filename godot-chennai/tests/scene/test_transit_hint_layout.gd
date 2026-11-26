extends TestCase
## The transit hint (G-219) at phone sizes: inside the screen, clear of the mission HUD's column
## (left) and JOBS / minimap (right), in the top half (never over the thumbs), FAST TRAVEL at least
## 48 px, Tamil drawn with the fallback font.


func _in_viewport(node: Control, ui: Vector2) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = Vector2i(ui)
	root.add_child(vp)
	vp.add_child(node)
	return vp


func test_hint_fits_between_the_mission_hud_at_phone_sizes() -> bool:
	for ui: Vector2 in [Vector2(915, 412), Vector2(1830, 824), Vector2(640, 320)]:
		var hint := TransitHint.new()
		var vp := _in_viewport(hint, ui)
		await wait_frames(2)
		hint.show_ride("Next stop: Thirumangalam EB Office", "அடுத்த நிறுத்தம்: திருமங்கலம்", "Route 147C to Ambattur O.T.", true)
		await wait_frames(3)
		var r := hint.panel_rect()
		var screen := Rect2(Vector2.ZERO, ui)
		check(screen.encloses(r), "%s: the hint %s is on screen" % [ui, r])
		check(r.end.y <= ui.y * 0.5 + 1.0, "%s: in the top half, off the thumbs (%s)" % [ui, r])
		var b := hint.fast_button.get_global_rect()
		check(b.size.y >= UiTheme.MIN_TARGET and b.size.x >= UiTheme.MIN_TARGET and r.encloses(b), "%s: FAST TRAVEL %s at least 48 px, inside the panel" % [ui, b])
		if ui.x >= 900.0:
			var column := Rect2(16, 0, 330, ui.y)
			var right := Rect2(ui.x - TransitHint.RIGHT_CLEAR + 8.0, 0, TransitHint.RIGHT_CLEAR, ui.y)
			check(not r.intersects(column) and not r.intersects(right), "%s: clear of the mission column and the JOBS button (%s)" % [ui, r])
		check(hint.tamil_label.get_theme_font("font") is FontVariation, "Tamil through the fallback font")
		vp.queue_free()
	return true
