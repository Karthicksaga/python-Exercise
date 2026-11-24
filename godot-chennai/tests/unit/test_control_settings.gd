extends TestCase
## Control settings, their saving in the save file, the guide, the device tracker and the
## haptics plan (G-170, G-178, G-179).

const PATH := "user://test-controls-settings.json"


func _clean() -> void:
	for p: String in [PATH, PATH + ".tmp"]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)


func test_defaults_and_scale() -> bool:
	var s := ControlSettings.new()
	assert_eq(s.scheme, &"wheel", "default scheme A")
	assert_false(s.left_handed, "right-handed")
	assert_eq(s.look_sensitivity, 1.0, "sensitivity 1")
	assert_true(s.haptics and not s.invert_y and not s.run_toggle, "haptics on, invert and toggle off")
	assert_eq(s.button_scale(), 1.0, "medium buttons")
	s.button_size = ControlSettings.SIZE_LARGE
	assert_true(s.button_scale() > 1.0, "large is larger")
	s.button_size = ControlSettings.SIZE_SMALL
	assert_true(s.button_scale() < 1.0, "small is smaller")
	return true


func test_saved_versioned_and_additive_in_the_save_file() -> bool:
	_clean()
	var store := SaveStore.new(PATH).read()
	store.set_section(SaveStore.HOUR, 9.5)
	store.write()
	var s := ControlSettings.new()
	s.path = PATH
	s.set_left_handed(true)
	s.set_look_sensitivity(1.5)
	s.set_invert_y(true)
	s.set_button_size(ControlSettings.SIZE_LARGE)
	s.set_opacity(0.5)
	s.set_haptics(false)
	s.set_run_toggle(true)
	var again := ControlSettings.new()
	again.path = PATH
	again.load_saved()
	assert_true(again.left_handed and again.invert_y and again.run_toggle and not again.haptics, "flags read back")
	assert_eq(again.look_sensitivity, 1.5, "sensitivity read back")
	assert_eq(again.button_size, ControlSettings.SIZE_LARGE, "size read back")
	assert_eq(again.opacity, 0.5, "opacity read back")
	var raw: Variant = SaveStore.new(PATH).read().section(ControlSettings.SECTION)
	assert_true(raw is Dictionary and int((raw as Dictionary)["version"]) == ControlSettings.VERSION, "the section carries its version")
	assert_eq(SaveStore.new(PATH).read().section(SaveStore.HOUR), 9.5, "the other save keys are untouched")
	_clean()
	return true


func test_damaged_or_newer_data_keeps_defaults_field_by_field() -> bool:
	var s := ControlSettings.new()
	s.from_dict({"version": 99, "leftHanded": "yes", "lookSensitivity": 99.0, "buttonSize": 7, "scheme": "tilt", "haptics": false, "future": 1})
	assert_false(s.left_handed, "a wrong type keeps the default")
	assert_eq(s.look_sensitivity, 3.0, "out of range is clamped")
	assert_eq(s.button_size, ControlSettings.SIZE_LARGE, "size clamped")
	assert_eq(s.scheme, &"wheel", "an unknown scheme falls back to the wheel")
	assert_false(s.haptics, "a good field is kept")
	return true


func test_next_in_cycles_through_values() -> bool:
	assert_eq(ControlSettings.next_in(ControlSettings.SENSITIVITIES, 1.0), 1.5, "1.0 to 1.5")
	assert_eq(ControlSettings.next_in(ControlSettings.SENSITIVITIES, 2.0), 0.5, "wraps")
	assert_eq(ControlSettings.next_in(ControlSettings.OPACITIES, 0.84), 1.0, "nearest then next")
	return true


func test_controls_guide_rows_follow_scheme_device_and_hand() -> bool:
	var s := ControlSettings.new()
	var touch := ControlsGuide.rows(ControlsGuide.ON_FOOT, DeviceTracker.Device.TOUCH, s)
	assert_true(touch.size() >= 4, "touch on foot has rows")
	for row in touch:
		assert_eq(row.size(), 2, "every row is [control, what it does]")
	assert_contains(touch[0][0], "left", "touch walks on the left")
	s.left_handed = true
	assert_contains(ControlsGuide.rows(ControlsGuide.ON_FOOT, DeviceTracker.Device.TOUCH, s)[0][0], "right", "left-handed walks on the right")
	var drive := ControlsGuide.rows(ControlsGuide.DRIVING, DeviceTracker.Device.TOUCH, s)
	var text := ""
	for row in drive:
		text += row[0] + " " + row[1] + "\n"
	assert_contains(text, "reverse", "driving mentions reversing by holding BRAKE")
	assert_false(text.contains("P / R / D") or text.contains("gear"), "no gear selector")
	var pad := ControlsGuide.rows(ControlsGuide.DRIVING, DeviceTracker.Device.PAD, s)
	assert_true(pad.any(func(r: PackedStringArray) -> bool: return r[0] == "RT" and r[1] == "Gas"), "pad RT is gas")
	var keys := ControlsGuide.rows(ControlsGuide.ON_FOOT, DeviceTracker.Device.KEYBOARD, s)
	assert_true(keys.any(func(r: PackedStringArray) -> bool: return r[0] == "E"), "keyboard E is the action")
	return true


func test_device_tracker_follows_the_last_device_used() -> bool:
	var t := DeviceTracker.new()
	assert_eq(t.current, DeviceTracker.Device.TOUCH, "starts as touch")
	var seen: Array[int] = []
	t.changed.connect(func(d: DeviceTracker.Device) -> void: seen.append(d))
	var drift := InputEventJoypadMotion.new()
	drift.axis = JOY_AXIS_LEFT_X
	drift.axis_value = 0.2
	t.observe(drift)
	assert_eq(t.current, DeviceTracker.Device.TOUCH, "stick drift is not use")
	var push := InputEventJoypadMotion.new()
	push.axis = JOY_AXIS_LEFT_X
	push.axis_value = 0.9
	t.observe(push)
	assert_eq(t.current, DeviceTracker.Device.PAD, "a real stick push is the pad")
	var key := InputEventKey.new()
	key.keycode = KEY_E
	key.pressed = true
	t.observe(key)
	assert_eq(t.current, DeviceTracker.Device.KEYBOARD, "a key press is the keyboard")
	t.observe(InputEventScreenTouch.new())
	assert_eq(t.current, DeviceTracker.Device.TOUCH, "a touch is touch")
	assert_eq(seen, [DeviceTracker.Device.PAD, DeviceTracker.Device.KEYBOARD, DeviceTracker.Device.TOUCH], "one signal per change")
	assert_eq(DeviceTracker.glyph(&"action", DeviceTracker.Device.PAD), "A", "A on a pad")
	assert_eq(DeviceTracker.glyph(&"gas", DeviceTracker.Device.PAD), "RT", "RT is gas")
	assert_eq(DeviceTracker.glyph(&"action", DeviceTracker.Device.TOUCH), "", "no glyph on touch")
	return true


func test_haptics_plan_scales_with_the_crash() -> bool:
	var shake := HapticsPlan.crash(&"shaken", 5.0)
	var hard := HapticsPlan.crash(&"shaken", 40.0)
	var thrown := HapticsPlan.crash(&"thrown", 60.0)
	assert_true(int(hard["ms"]) > int(shake["ms"]), "a harder shake buzzes longer")
	assert_true(int(thrown["ms"]) > int(hard["ms"]) and float(thrown["strong"]) == 1.0, "being thrown is the strongest")
	assert_true(HapticsPlan.crash(&"none", 0.0).is_empty(), "no crash, no buzz")
	return true
