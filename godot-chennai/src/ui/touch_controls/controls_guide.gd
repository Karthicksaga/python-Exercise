class_name ControlsGuide
extends RefCounted
## The one data source for "what do the controls do": rows of [control, what it does] for the
## active scheme and device (decision G-179). The pause menu and the title's CONTROLS page both
## read it, so they cannot disagree with the game. Pure data.
##
##     for row in ControlsGuide.rows(ControlsGuide.ON_FOOT, DeviceTracker.Device.PAD):
##         label.text = "%s: %s" % [row[0], row[1]]

const ON_FOOT := &"foot"
const DRIVING := &"driving"


## Rows (Array of two-String Arrays) for `mode` (ON_FOOT or DRIVING) on `device`.
static func rows(mode: StringName, device: DeviceTracker.Device = DeviceTracker.Device.TOUCH, settings: ControlSettings = null) -> Array[PackedStringArray]:
	var s := settings if settings != null else ControlSettings.shared()
	var left: StringName = &"guide.side.right" if s.left_handed else &"guide.side.left"
	var right: StringName = &"guide.side.left" if s.left_handed else &"guide.side.right"
	var out: Array[PackedStringArray] = []
	if mode == ON_FOOT:
		match device:
			DeviceTracker.Device.PAD:
				out.append(PackedStringArray([Tr.t("guide.stick.left"), Tr.t("guide.foot.walk_run")]))
				out.append(PackedStringArray([Tr.t("guide.stick.right"), Tr.t("guide.look")]))
				out.append(PackedStringArray(["A", Tr.t("guide.action_pad")]))
				out.append(PackedStringArray(["X", Tr.t("guide.jump")]))
				out.append(PackedStringArray(["Start", Tr.t("guide.pause")]))
			DeviceTracker.Device.KEYBOARD:
				out.append(PackedStringArray(["W A S D", Tr.t("guide.walk")]))
				out.append(PackedStringArray(["Shift", Tr.t("guide.run")]))
				out.append(PackedStringArray(["E", Tr.t("guide.action_pad")]))
				out.append(PackedStringArray(["Space", Tr.t("guide.jump")]))
				out.append(PackedStringArray([Tr.t("guide.mouse_drag"), Tr.t("guide.look")]))
				out.append(PackedStringArray(["Esc", Tr.t("guide.pause")]))
			_:
				out.append(PackedStringArray([Tr.t("guide.touch_side", [left]), Tr.t("guide.stick_appears" if not s.run_toggle else "guide.stick_appears_toggle")]))
				out.append(PackedStringArray([Tr.t("guide.drag_side", [right]), Tr.t("guide.look")]))
				out.append(PackedStringArray([Tr.t("guide.big_button"), Tr.t("guide.action_touch")]))
				out.append(PackedStringArray([Tr.t("guide.small_button"), Tr.t("guide.jump")]))
	else:
		match device:
			DeviceTracker.Device.PAD:
				out.append(PackedStringArray([Tr.t("guide.stick.left"), Tr.t("guide.steer")]))
				out.append(PackedStringArray(["RT", Tr.t("guide.gas")]))
				out.append(PackedStringArray(["LT", Tr.t("guide.brake_reverse")]))
				out.append(PackedStringArray(["Y", Tr.t("guide.horn_pad")]))
				out.append(PackedStringArray(["B", Tr.t("guide.get_out")]))
				out.append(PackedStringArray(["Start", Tr.t("guide.pause")]))
			DeviceTracker.Device.KEYBOARD:
				out.append(PackedStringArray(["A D", Tr.t("guide.steer")]))
				out.append(PackedStringArray(["W", Tr.t("guide.gas")]))
				out.append(PackedStringArray([Tr.t("guide.brake_or_space"), Tr.t("guide.brake_reverse")]))
				out.append(PackedStringArray(["H", Tr.t("guide.horn")]))
				out.append(PackedStringArray(["E", Tr.t("guide.get_out")]))
				out.append(PackedStringArray(["Esc", Tr.t("guide.pause")]))
			_:
				out.append(PackedStringArray([Tr.t("guide.slide_side", [left]), Tr.t("guide.steer_touch")]))
				out.append(PackedStringArray([Tr.t("ctl.gas"), Tr.t("guide.accelerate")]))
				out.append(PackedStringArray([Tr.t("ctl.brake"), Tr.t("guide.brake_reverse")]))
				out.append(PackedStringArray([Tr.t("ctl.horn"), Tr.t("guide.horn_touch")]))
				out.append(PackedStringArray([Tr.t("ctl.exit"), Tr.t("guide.exit_stopped")]))
	return out

## Groups for the title's CONTROLS page (G-163): `{"title": String, "rows": Array of [control, what it does]}`
## for ON FOOT, DRIVING and what applies anywhere, for `device` (touch by default).
static func groups(device: DeviceTracker.Device = DeviceTracker.Device.TOUCH, settings: ControlSettings = null) -> Array[Dictionary]:
	var foot: Array = []
	for r: PackedStringArray in rows(ON_FOOT, device, settings):
		foot.append([r[0], r[1]])
	var drive: Array = []
	for r: PackedStringArray in rows(DRIVING, device, settings):
		drive.append([r[0], r[1]])
	var anywhere: Array = [
		[Tr.t("hud.pause"), Tr.t("guide.pause_menu")],
		[Tr.t("hud.jobs"), Tr.t("guide.jobs")],
	]
	return [
		{"title": Tr.t("guide.group.foot"), "rows": foot},
		{"title": Tr.t("guide.group.driving"), "rows": drive},
		{"title": Tr.t("guide.group.anywhere"), "rows": anywhere},
	]
