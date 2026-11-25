extends TestCase
## Motion blur (G-435): off by default, never on Low or Medium, and it costs nothing while off.

const DT := 1.0 / 60.0


func test_a_new_blur_is_off_and_holds_nothing() -> bool:
	var m := MotionBlur.new()
	root.add_child(m)
	check(not m.is_on(), "off by default")
	check(not m.is_processing(), "not processing")
	check(m.get_child_count() == 0, "no layer, no shader, no nodes")
	for i in 120:
		m.update(40.0, DT)
	check(m.drawn_frames == 0 and not m.is_drawing(), "fast driving draws nothing while off")
	check(m.amount == 0.0, "and keeps no state")
	return true


func test_low_and_medium_never_allow_it_even_when_asked_for() -> bool:
	for level: int in [QualitySettings.LOW, QualitySettings.MEDIUM]:
		var m := MotionBlur.new()
		root.add_child(m)
		m.configure(QualitySettings.values(level), true)
		check(not m.is_on(), "%s: off" % QualitySettings.NAMES[level])
		for i in 60:
			m.update(40.0, DT)
		check(m.get_child_count() == 0 and m.drawn_frames == 0, "%s: nothing made, nothing drawn" % QualitySettings.NAMES[level])
	return true


func test_high_allows_it_but_it_stays_off_until_the_player_wants_it() -> bool:
	var high := QualitySettings.values(QualitySettings.HIGH)
	var m := MotionBlur.new()
	root.add_child(m)
	m.configure(high, false)
	check(m.allowed and not m.is_on(), "allowed on High, not on by default")
	check(m.get_child_count() == 0, "no layer until it is wanted")
	m.update(40.0, DT)
	check(m.drawn_frames == 0, "free")
	return true


func test_on_it_blurs_only_when_fast_and_follows_the_three_js_curve() -> bool:
	var m := MotionBlur.new()
	root.add_child(m)
	m.configure(QualitySettings.values(QualitySettings.HIGH), true)
	check(m.is_on() and m.get_child_count() == 1, "layer made when turned on")
	for i in 60:
		m.update(10.0, DT)
	check(m.drawn_frames == 0 and not m.is_drawing(), "nothing below 16 m/s")
	for i in 90:
		m.update(40.0, DT)
	check(m.is_drawing() and m.drawn_frames > 0, "drawing at speed")
	check(m.amount > 0.38 and m.amount <= MotionBlur.BLUR_MAX, "near the top strength (%.2f)" % m.amount)
	assert_near(MotionBlur.target_for(16.0), 0.0, 0.0001, "none at 16 m/s")
	assert_near(MotionBlur.target_for(24.0), MotionBlur.BLUR_MAX * 0.5, 0.0001, "half at 24 m/s")
	assert_near(MotionBlur.target_for(-32.0), MotionBlur.BLUR_MAX, 0.0001, "full at 32 m/s, either direction")
	for i in 240:
		m.update(0.0, DT)
	check(not m.is_drawing(), "stops once the speed is gone")
	# Turned off again: the layer goes.
	m.configure(QualitySettings.values(QualitySettings.HIGH), false)
	check(m.amount == 0.0 and not m.is_drawing(), "no strength or layer kept when off")
	return true


func test_the_shader_compiles() -> bool:
	var shader := Shader.new()
	shader.code = MotionBlur.SHADER_CODE
	check(shader.get_mode() == Shader.MODE_CANVAS_ITEM, "a canvas item shader")
	return true
